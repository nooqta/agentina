import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { AgentinaNode } from "@agentina-mesh/node"

// Granular permission: a usage cap. A share can be use-boxed on top of
// scope + TTL — "this agent, 2 questions, then it's spent."

let dirA: string, dirB: string, wsA: string
let amal: AgentinaNode, badis: AgentinaNode

const post = (port: number, path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${port}/agentina/v1${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const amalShares = async () => (await (await fetch("http://127.0.0.1:19885/agentina/v1/shares?peer=Badis")).json()).shares as any[]

beforeAll(async () => {
  dirA = mkdtempSync(join(tmpdir(), "cap-a-"))
  dirB = mkdtempSync(join(tmpdir(), "cap-b-"))
  wsA = mkdtempSync(join(tmpdir(), "cap-ws-"))
  writeFileSync(join(wsA, "x.txt"), "hello")
  amal = new AgentinaNode({ stateDir: dirA, port: 19885, partyName: "Amal", trustLoopback: true, log: () => {} })
  badis = new AgentinaNode({ stateDir: dirB, port: 19886, partyName: "Badis", trustLoopback: true, log: () => {} })
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

describe("granular permission — usage cap", () => {
  it("shares an agent capped at 2 uses", async () => {
    const r = await post(19885, "/shares", { peer: "Badis", kind: "agent", value: "files", maxUses: 2 })
    expect(r.status).toBe(201)
    const share = (await amalShares()).find((s) => s.kind === "agent")
    expect(share.maxUses).toBe(2)
    expect(share.uses).toBe(0)
  })

  it("allows exactly maxUses invocations, then denies", async () => {
    expect(await badis.mesh.sendTask("Amal", "read x.txt", "files")).toContain("hello") // 1
    expect(await badis.mesh.sendTask("Amal", "read x.txt", "files")).toContain("hello") // 2
    await expect(badis.mesh.sendTask("Amal", "read x.txt", "files")).rejects.toThrow(/403/) // spent
  })

  it("reports the counter as fully spent", async () => {
    const share = (await amalShares()).find((s) => s.kind === "agent")
    expect(share.uses).toBe(2)
    expect(share.maxUses).toBe(2)
  })

  it("the denial is logged with a clear reason", async () => {
    const status = await (await fetch("http://127.0.0.1:19885/agentina/v1/status")).json()
    const denied = (status.audit ?? []).filter((e: any) => e.kind === "task" && e.decision === "denied" && e.reason === "use-limit-reached")
    expect(denied.length).toBeGreaterThan(0)
  })
})
