import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
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
  fetch(`${AMAL}/secure`, { method: "POST", headers: { "Content-Type": "text/plain", "X-Agentina-From": from }, body: env })

beforeAll(async () => {
  dirA = mkdtempSync(join(tmpdir(), "e2e-a-"))
  dirB = mkdtempSync(join(tmpdir(), "e2e-b-"))
  wsA = mkdtempSync(join(tmpdir(), "e2e-ws-"))
  writeFileSync(join(wsA, "x.txt"), "PLAINTEXT-REPLY-hello")
  mkdirSync(join(wsA, "skills"), { recursive: true })
  amal = new AgentinaNode({ stateDir: dirA, port: 19887, partyName: "Amal", trustLoopback: true, log: () => {} })
  badis = new AgentinaNode({ stateDir: dirB, port: 19888, partyName: "Badis", trustLoopback: true, log: () => {} })
  await amal.start(); await badis.start()
  const link = badis.createInvite(); await amal.join(link)
  await amal.mesh.refreshAll(); await badis.mesh.refreshAll()
  amal.addAgent({ id: "files", partyId: amal.party.id, name: "files", description: "reads", skills: [], lifecycle: "persistent", adapter: { kind: "scoped-fs", baseRoot: wsA } } as any)
  amal.createShare({ peer: "Badis", kind: "agent", value: "files" }) // grant badis access
  writeFileSync(join(wsA, "skills", "tips.md"), "SECRET-SKILL-cite the file")
  amal.createShare({ peer: "Badis", kind: "skill", value: "files:tips.md" })
  amalPub = amal.party.publicKey!
  badisSec = (badis as any).state.data.secretKey
  badisId = badis.party.id
  expect(amalPub && badisSec).toBeTruthy()
}, 30_000)

afterAll(async () => {
  await amal.stop(); await badis.stop()
  for (const d of [dirA, dirB, wsA]) rmSync(d, { recursive: true, force: true })
})

describe("E2E sealed tunnel — task, skill, grants", () => {
  it("keys were exchanged at pairing", () => {
    const badisAsPeer = (amal as any).state.data.peers.find((p: any) => p.partyId === badisId)
    expect(badisAsPeer.publicKey).toBe(badis.party.publicKey)
  })

  it("round-trips over ciphertext, authenticated by the box — no bearer token", async () => {
    const env = seal(JSON.stringify({ op: "task", agent: "files", message: "read x.txt" }), amalPub, badisSec)
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
    const env = seal(JSON.stringify({ op: "task", agent: "files", message: "read x.txt" }), amalPub, badisSec)
    const dot = env.indexOf(".")
    const tampered = env.slice(0, dot + 1) + (env[dot + 1] === "A" ? "B" : "A") + env.slice(dot + 2)
    expect((await sealedPost(tampered, badisId)).status).toBe(401)
  })

  it("rejects a forged sender — sealed with a stranger's key but claiming to be Badis", async () => {
    const stranger = generateKeypair()
    const env = seal(JSON.stringify({ op: "task", agent: "files", message: "read x.txt" }), amalPub, stranger.secretKey)
    expect((await sealedPost(env, badisId)).status).toBe(401) // opens with Badis's pubkey → box fails
  })

  it("rejects a sealed call from an unknown party", async () => {
    const stranger = generateKeypair()
    const env = seal(JSON.stringify({ op: "task", agent: "files", message: "x" }), amalPub, stranger.secretKey)
    expect((await sealedPost(env, "pt_nobody")).status).toBe(401) // no peer, no key to open with
  })

  it("the skill channel is sealed too — text encrypted on the wire", async () => {
    const env = seal(JSON.stringify({ op: "skill", skillId: "files:tips.md" }), amalPub, badisSec)
    const res = await sealedPost(env, badisId)
    const respEnv = await res.text()
    expect(respEnv).not.toContain("SECRET-SKILL") // skill text is ciphertext on the wire
    const parsed = JSON.parse(open(respEnv, amalPub, badisSec)!)
    expect(parsed.status).toBe(200)
    expect(parsed.body.text).toContain("SECRET-SKILL-cite the file")
  })
})
