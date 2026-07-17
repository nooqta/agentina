import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { AgentinaNode } from "@agentina-mesh/node"

// Access request + approval, both directions:
//   Badis asks Amal for an agent (or a skill) → it lands on Amal's side as
//   a PENDING request → Amal approves (usable) or denies (gone). Nothing is
//   granted until Amal says so; pairing alone grants nothing.

let dirA: string, dirB: string, wsA: string
let amal: AgentinaNode, badis: AgentinaNode

const post = (port: number, path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${port}/agentina/v1${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const amalGrants = async () => (await (await fetch("http://127.0.0.1:19883/agentina/v1/status")).json()).grants as any[]
const pending = async () => (await amalGrants()).filter((g) => g.status === "proposed")

beforeAll(async () => {
  dirA = mkdtempSync(join(tmpdir(), "req-a-"))
  dirB = mkdtempSync(join(tmpdir(), "req-b-"))
  wsA = mkdtempSync(join(tmpdir(), "req-ws-"))
  writeFileSync(join(wsA, "x.txt"), "hello from amal")
  mkdirSync(join(wsA, "skills"), { recursive: true })
  writeFileSync(join(wsA, "skills", "tips.md"), "# tips\nalways cite the file")

  amal = new AgentinaNode({ stateDir: dirA, port: 19883, partyName: "Amal", trustLoopback: true, log: () => {} })
  badis = new AgentinaNode({ stateDir: dirB, port: 19884, partyName: "Badis", trustLoopback: true, log: () => {} })
  await amal.start(); await badis.start()
  const link = badis.createInvite(); await amal.join(link)
  await amal.mesh.refreshAll(); await badis.mesh.refreshAll()
  amal.addAgent({ id: "files", partyId: amal.party.id, name: "files", description: "reads", skills: [], lifecycle: "persistent", adapter: { kind: "scoped-fs", baseRoot: wsA } } as any)
  await badis.mesh.refreshAll()
}, 30_000)

afterAll(async () => {
  await amal.stop(); await badis.stop()
  for (const d of [dirA, dirB, wsA]) rmSync(d, { recursive: true, force: true })
})

describe("access request + approval", () => {
  it("a request lands as pending and grants nothing until approved", async () => {
    const r = await post(19884, "/grants/request", { peer: "Amal", kind: "agent", value: "files" })
    expect(r.status).toBe(202)
    const pend = await pending()
    expect(pend).toHaveLength(1)
    expect(pend[0].toParty).toBe(badis.party.id)
    expect(pend[0].agentIds).toContain("files")
    // pairing + a pending request is NOT access
    await expect(badis.mesh.sendTask("Amal", "read x.txt", "files")).rejects.toThrow()
  })

  it("approve turns it on — and fills the agent's own workspace scope so it works", async () => {
    const id = (await pending())[0].id
    const r = await post(19883, "/grants/approve", { id })
    expect(r.status).toBe(200)
    const grant = (await amalGrants()).find((g) => g.id === id)
    expect(grant.status).toBe("active")
    expect(grant.scopes.some((s: any) => s.kind === "fs")).toBe(true) // scope was filled on approve
    const reply = await badis.mesh.sendTask("Amal", "read x.txt", "files")
    expect(reply).toContain("hello from amal")
  })

  it("deny declines the request — it never becomes usable", async () => {
    await post(19884, "/grants/request", { peer: "Amal", kind: "skill", value: "files:tips.md" })
    const id = (await pending())[0].id
    expect((await post(19883, "/grants/deny", { id })).status).toBe(200)
    expect(await pending()).toHaveLength(0)
    expect(await badis.mesh.fetchSkill(amal.party.id, "files:tips.md")).toBeUndefined()
  })

  it("a skill request, approved, becomes fetchable live", async () => {
    await post(19884, "/grants/request", { peer: "Amal", kind: "skill", value: "files:tips.md" })
    const id = (await pending())[0].id
    await post(19883, "/grants/approve", { id })
    const got = await badis.mesh.fetchSkill(amal.party.id, "files:tips.md")
    expect(got?.text).toContain("cite the file")
  })
})
