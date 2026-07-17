import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { AgentinaNode } from "@agentina-mesh/node"
import { seal, open, generateKeypair } from "@agentina-mesh/protocol"

// Prove the E2E tunnel's properties at the wire level: the /task channel
// is confidential (ciphertext on the wire), integrity-protected (tamper →
// rejected), and sender-authenticated by the box (no bearer, wrong key →
// rejected). We craft the sealed requests by hand so we can inspect and
// mutate exactly what crosses the boundary.

let dirA: string, dirB: string, wsA: string
let amal: AgentinaNode, badis: AgentinaNode
let amalPub: string, badisSec: string, badisId: string
const AMAL = "http://127.0.0.1:19887"
const sealedPost = (env: string, from: string) =>
  fetch(`${AMAL}/task`, { method: "POST", headers: { "Content-Type": "text/plain", "X-Agentina-Sealed": "1", "X-Agentina-From": from }, body: env })

beforeAll(async () => {
  dirA = mkdtempSync(join(tmpdir(), "e2e-a-"))
  dirB = mkdtempSync(join(tmpdir(), "e2e-b-"))
  wsA = mkdtempSync(join(tmpdir(), "e2e-ws-"))
  writeFileSync(join(wsA, "x.txt"), "PLAINTEXT-REPLY-hello")
  amal = new AgentinaNode({ stateDir: dirA, port: 19887, partyName: "Amal", trustLoopback: true, log: () => {} })
  badis = new AgentinaNode({ stateDir: dirB, port: 19888, partyName: "Badis", trustLoopback: true, log: () => {} })
  await amal.start(); await badis.start()
  const link = badis.createInvite(); await amal.join(link)
  await amal.mesh.refreshAll(); await badis.mesh.refreshAll()
  amal.addAgent({ id: "files", partyId: amal.party.id, name: "files", description: "reads", skills: [], lifecycle: "persistent", adapter: { kind: "scoped-fs", baseRoot: wsA } } as any)
  amal.createShare({ peer: "Badis", kind: "agent", value: "files" }) // grant badis access
  amalPub = amal.party.publicKey!
  badisSec = (badis as any).state.data.secretKey
  badisId = badis.party.id
  expect(amalPub && badisSec).toBeTruthy()
}, 30_000)

afterAll(async () => {
  await amal.stop(); await badis.stop()
  for (const d of [dirA, dirB, wsA]) rmSync(d, { recursive: true, force: true })
})

describe("E2E sealed /task channel", () => {
  it("keys were exchanged at pairing", () => {
    const badisAsPeer = (amal as any).state.data.peers.find((p: any) => p.partyId === badisId)
    expect(badisAsPeer.publicKey).toBe(badis.party.publicKey)
  })

  it("round-trips over ciphertext, authenticated by the box — no bearer token", async () => {
    const env = seal(JSON.stringify({ agent: "files", message: "read x.txt" }), amalPub, badisSec)
    expect(env).not.toContain("x.txt") // request is ciphertext on the wire
    const res = await sealedPost(env, badisId)
    expect(res.status).toBe(200)
    const respEnv = await res.text()
    expect(respEnv).not.toContain("PLAINTEXT-REPLY") // the reply is ciphertext too
    const opened = open(respEnv, amalPub, badisSec)
    expect(opened).not.toBeNull()
    const parsed = JSON.parse(opened!)
    expect(parsed.status).toBe(200)
    expect(parsed.body.content).toContain("PLAINTEXT-REPLY-hello") // decrypted, real reply
  })

  it("rejects a tampered envelope (integrity)", async () => {
    const env = seal(JSON.stringify({ agent: "files", message: "read x.txt" }), amalPub, badisSec)
    const dot = env.indexOf(".")
    const tampered = env.slice(0, dot + 1) + (env[dot + 1] === "A" ? "B" : "A") + env.slice(dot + 2)
    expect((await sealedPost(tampered, badisId)).status).toBe(401)
  })

  it("rejects a forged sender — sealed with a stranger's key but claiming to be Badis", async () => {
    const stranger = generateKeypair()
    const env = seal(JSON.stringify({ agent: "files", message: "read x.txt" }), amalPub, stranger.secretKey)
    expect((await sealedPost(env, badisId)).status).toBe(401) // opens with Badis's pubkey → box fails
  })

  it("rejects a sealed call from an unknown party", async () => {
    const stranger = generateKeypair()
    const env = seal(JSON.stringify({ agent: "files", message: "x" }), amalPub, stranger.secretKey)
    expect((await sealedPost(env, "pt_nobody")).status).toBe(401) // no peer, no key to open with
  })
})
