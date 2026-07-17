import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentinaNode } from "@agentina-mesh/node"

// End-to-end WhatsApp path through the real node HTTP server:
//   Meta GET verify  → node echoes hub.challenge
//   Meta POST inbound → router → local scoped-fs agent → reply POSTed to Graph API
// Only graph.facebook.com is mocked; every hop inside the node is real.

let dir: string
let files: string
let node: AgentinaNode
let hook: string
const PORT = 19877
const graphCalls: Array<{ url: string; body: any }> = []
let realFetch: typeof fetch

beforeAll(async () => {
  realFetch = globalThis.fetch
  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url)
    if (u.includes("graph.facebook.com")) {
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      graphCalls.push({ url: u, body })
      // startup validation (GET ?fields=) and message sends (POST) both 200
      return { ok: true, status: 200, json: async () => ({ display_phone_number: "+1 555 0100" }) } as Response
    }
    return realFetch(url, init) // real HTTP to the node under test
  })

  dir = mkdtempSync(join(tmpdir(), "wa-node-"))
  files = mkdtempSync(join(tmpdir(), "wa-files-"))
  writeFileSync(join(files, "note.txt"), "hello from files")

  node = new AgentinaNode({ stateDir: dir, port: PORT, partyName: "Amal", trustLoopback: true, log: () => {} })
  await node.start()

  // A deterministic local agent (reads within a jailed folder).
  node.addAgent({
    id: "files",
    partyId: node.party.id,
    name: "files",
    description: "reads files",
    skills: [{ id: "files", name: "files", description: "reads files", tags: ["scoped-fs"] }],
    lifecycle: "persistent",
    adapter: { kind: "scoped-fs", baseRoot: files },
  } as any)

  // Configure a WhatsApp connection bound to that agent (token via env,
  // exactly as the console's paste-token flow stores it).
  process.env.WA_TOKEN_TEST = "EAAG-fake-permanent"
  process.env.WA_VERIFY_TEST = "verify-word-42"
  const r = await realFetch(`http://127.0.0.1:${PORT}/agentina/v1/channels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "whatsapp", agentId: "files",
      tokenEnv: "WA_TOKEN_TEST", phoneNumberId: "PN_123", verifyTokenEnv: "WA_VERIFY_TEST",
    }),
  })
  const j = await r.json()
  hook = `http://127.0.0.1:${PORT}${j.webhookPath}`
  expect(j.note).toContain("whatsapp is on")   // start() succeeded against the mock
}, 30_000)

afterAll(async () => {
  await node.stop()
  vi.unstubAllGlobals()
  for (const d of [dir, files]) rmSync(d, { recursive: true, force: true })
  delete process.env.WA_TOKEN_TEST
  delete process.env.WA_VERIFY_TEST
})

describe("WhatsApp channel — full node webhook path", () => {
  it("echoes hub.challenge on Meta's GET verification", async () => {
    const q = "hub.mode=subscribe&hub.verify_token=verify-word-42&hub.challenge=CHALLENGE99"
    const res = await realFetch(`${hook}?${q}`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("CHALLENGE99")
  })

  it("rejects a GET with the wrong verify token (403)", async () => {
    const res = await realFetch(`${hook}?hub.mode=subscribe&hub.verify_token=NOPE&hub.challenge=x`)
    expect(res.status).toBe(403)
  })

  it("routes an inbound message to the bound agent and replies via the Graph API", async () => {
    graphCalls.length = 0
    const inbound = {
      entry: [{ changes: [{ value: {
        contacts: [{ wa_id: "15551230000", profile: { name: "Anis" } }],
        messages: [{ from: "15551230000", id: "wamid.1", type: "text", text: { body: "read note.txt" } }],
      } }] }],
    }
    const res = await realFetch(hook, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inbound),
    })
    expect(res.status).toBe(200) // Meta always wants a fast 200

    // The reply is async (task → sendReply); wait for the Graph POST.
    await vi.waitFor(() => {
      const send = graphCalls.find((c) => c.url.includes("/messages"))
      expect(send).toBeTruthy()
    }, { timeout: 8000, interval: 100 })

    const send = graphCalls.find((c) => c.url.includes("/messages"))!
    expect(send.body).toMatchObject({ messaging_product: "whatsapp", to: "15551230000", type: "text" })
    expect(String(send.body.text.body)).toContain("hello from files") // the agent actually read the file
  }, 15_000)
})
