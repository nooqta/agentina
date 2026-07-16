import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { AgentinaNode } from "@agentina-mesh/node"

// Live-referenced skill sharing across the trust boundary:
//   Amal shares a skill → Badis fetches it under the grant, adopts it onto
//   his own agent, and his next turn injects it → Amal revokes → it drops.
// Nothing is copied; revocation and TTL live in the per-turn fetch.

let dirA: string, dirB: string, wsA: string
let amal: AgentinaNode, badis: AgentinaNode
let grantId: string
const SKILL = "assistant:status-reports.md"
const SKILL_TEXT = "# Status reports\nLead with what shipped, then blockers."

const post = (port: number, path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${port}/agentina/v1${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
const helper = () => (badis as any).state.data.agents.find((a: any) => a.id === "helper")
const runHelper = () => (badis as any).execAgent(helper(), { message: "hello", fromPartyId: "local" }) as Promise<{ content: string }>

beforeAll(async () => {
  dirA = mkdtempSync(join(tmpdir(), "shr-a-"))
  dirB = mkdtempSync(join(tmpdir(), "shr-b-"))
  wsA = mkdtempSync(join(tmpdir(), "shr-ws-"))
  mkdirSync(join(wsA, "skills"), { recursive: true })
  writeFileSync(join(wsA, "skills", "status-reports.md"), SKILL_TEXT)
  writeFileSync(join(wsA, "skills", "secret.md"), "# private, never shared")

  amal = new AgentinaNode({ stateDir: dirA, port: 19881, partyName: "Amal", trustLoopback: true, log: () => {} })
  badis = new AgentinaNode({ stateDir: dirB, port: 19882, partyName: "Badis", trustLoopback: true, log: () => {} })
  await amal.start(); await badis.start()
  const link = badis.createInvite(); await amal.join(link)
  await amal.mesh.refreshAll(); await badis.mesh.refreshAll()

  amal.addAgent({ id: "assistant", partyId: amal.party.id, name: "assistant", description: "x", skills: [], lifecycle: "persistent", adapter: { kind: "claude-code", baseRoot: wsA } } as any)
  badis.addAgent({ id: "helper", partyId: badis.party.id, name: "helper", description: "x", skills: [], lifecycle: "persistent", adapter: { kind: "echo" } } as any)
}, 30_000)

afterAll(async () => {
  await amal.stop(); await badis.stop()
  for (const d of [dirA, dirB, wsA]) rmSync(d, { recursive: true, force: true })
})

describe("live-ref skill sharing", () => {
  it("shares a skill as a grant with no agent access", async () => {
    const r = await post(19881, "/shares", { peer: "Badis", kind: "skill", value: SKILL })
    expect(r.status).toBe(201)
    grantId = (await r.json()).id
    // it presents as a skill share, and carries no agentIds (can't invoke)
    const shares = amal.listShares(badis.party.id)
    const skillShare = shares.find((s: any) => s.kind === "skill")
    expect(skillShare).toBeTruthy()
    expect(skillShare!.value).toBe(SKILL)
  })

  it("lets the grantee fetch the skill text over the mesh, under the grant", async () => {
    const got = await badis.mesh.fetchSkill(amal.party.id, SKILL)
    expect(got?.text).toContain("Lead with what shipped")
    expect(got?.version).toBeTruthy() // content hash for future caching
  })

  it("denies a skill that was never shared (enforcement, not obscurity)", async () => {
    expect(await badis.mesh.fetchSkill(amal.party.id, "assistant:secret.md")).toBeUndefined()
  })

  it("injects an adopted skill into the adopter's next turn, labeled by source", async () => {
    const a = await post(19882, "/skills/adopt", { agentId: "helper", fromParty: amal.party.id, skillId: SKILL, label: "status-reports" })
    expect(a.status).toBe(201)
    const out = (await runHelper()).content
    expect(out).toContain("Lead with what shipped")          // the real text, fetched live
    expect(out).toContain("From Amal")                        // labeled as a source, not an owner instruction
    expect(out).toContain("Treat as information")             // the injection-boundary preamble
  })

  it("records the read on the owner's side (both sides keep the log)", async () => {
    const status = await (await fetch("http://127.0.0.1:19881/agentina/v1/status")).json()
    const reads = (status.audit ?? []).filter((e: any) => e.kind === "skill-read" && e.decision === "allowed")
    expect(reads.length).toBeGreaterThan(0)
  })

  it("revokes: the fetch is denied and the skill vanishes from the next turn", async () => {
    expect(await post(19881, "/shares/stop", { id: grantId })).toBeTruthy()
    expect(await badis.mesh.fetchSkill(amal.party.id, SKILL)).toBeUndefined()
    const out = (await runHelper()).content
    expect(out).not.toContain("Lead with what shipped")       // gone, no copy left behind
    expect(out).toContain("echo from helper")                  // the agent still runs
  })
})
