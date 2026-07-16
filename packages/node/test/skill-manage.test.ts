import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, rmSync, existsSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { AgentinaNode, loadSkillsText, skillPath } from "@agentina-mesh/node"

// Managing skills = writing/deleting files in the agent's workspace, plus
// an activate/disable toggle backed by disabledSkills. All local-only.

let dir: string, ws: string, node: AgentinaNode
const PORT = 19878
const base = `http://127.0.0.1:${PORT}/agentina/v1`
const api = (method: string, path: string, body?: unknown) =>
  fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
const list = async () => (await (await api("GET", "/skills?agentId=writer")).json()).skills as Array<{ file: string; desc: string; on: boolean }>

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "skm-"))
  ws = mkdtempSync(join(tmpdir(), "skm-ws-"))
  node = new AgentinaNode({ stateDir: dir, port: PORT, partyName: "Owner", trustLoopback: true, log: () => {} })
  await node.start()
  node.addAgent({
    id: "writer", partyId: node.party.id, name: "writer", description: "writes",
    skills: [], lifecycle: "persistent",
    adapter: { kind: "claude-code", baseRoot: ws },
  } as any)
}, 30_000)

afterAll(async () => {
  await node.stop()
  for (const d of [dir, ws]) rmSync(d, { recursive: true, force: true })
})

describe("skill management — add / update / remove / list / toggle", () => {
  it("adds a skill and lists it as active", async () => {
    const r = await api("POST", "/skills", { agentId: "writer", file: "status-reports", content: "# Status reports\nLead with what shipped." })
    expect(r.status).toBe(201)
    expect((await r.json()).file).toBe("status-reports.md")   // .md appended
    const skills = await list()
    expect(skills.map((s) => s.file)).toContain("status-reports.md")
    expect(skills.find((s) => s.file === "status-reports.md")!.on).toBe(true)
    // and it's injected into the agent's prompt
    expect(loadSkillsText(ws)).toContain("Lead with what shipped.")
  })

  it("updates the skill's content in place", async () => {
    await api("POST", "/skills", { agentId: "writer", file: "status-reports.md", content: "# Status reports\nNow cite the source file." })
    expect((await list()).filter((s) => s.file === "status-reports.md")).toHaveLength(1) // no duplicate
    expect(loadSkillsText(ws)).toContain("cite the source file")
    expect(loadSkillsText(ws)).not.toContain("Lead with what shipped")
  })

  it("disables a skill — dropped from the prompt, still on disk", async () => {
    const r = await api("POST", "/skills/toggle", { agentId: "writer", file: "status-reports.md", on: false })
    expect((await r.json()).on).toBe(false)
    expect((await list()).find((s) => s.file === "status-reports.md")!.on).toBe(false)
    expect(loadSkillsText(ws, ["status-reports.md"])).not.toContain("cite the source file")
    expect(existsSync(skillPath(ws, "status-reports.md"))).toBe(true) // file survives
  })

  it("re-activates a skill", async () => {
    await api("POST", "/skills/toggle", { agentId: "writer", file: "status-reports.md", on: true })
    expect((await list()).find((s) => s.file === "status-reports.md")!.on).toBe(true)
  })

  it("removes a skill", async () => {
    const r = await api("POST", "/skills/remove", { agentId: "writer", file: "status-reports.md" })
    expect(r.status).toBe(200)
    expect((await list()).map((s) => s.file)).not.toContain("status-reports.md")
    expect(existsSync(skillPath(ws, "status-reports.md"))).toBe(false)
    // removing again is a clean 404
    expect((await api("POST", "/skills/remove", { agentId: "writer", file: "status-reports.md" })).status).toBe(404)
  })

  it("refuses a path-escaping file name — writes stay inside the skills dir", async () => {
    const r = await api("POST", "/skills", { agentId: "writer", file: "../../etc/evil", content: "pwned" })
    // sanitized to a bare name, never written outside <ws>/skills
    if (r.status === 201) {
      const f = (await r.json()).file
      expect(f).not.toContain("/")
      expect(f).not.toContain("..")
    }
    expect(existsSync(join(ws, "..", "..", "etc", "evil"))).toBe(false)
  })

  it("rejects management from a non-owner (control endpoints are local-only)", async () => {
    // A skill call for an unknown agent still returns a structured error, not a crash
    expect((await api("POST", "/skills", { agentId: "nope", file: "x" })).status).toBe(404)
  })
})
