import { createHmac } from "node:crypto"
import { describe, it, expect, beforeEach } from "vitest"
import { ChannelRouter, GitLabAdapter, GitHubAdapter, WhatsAppAdapter, type ChannelAdapter, type ChannelHost, type InboundMessage } from "@agentina-mesh/channels"

class FakeChannel implements ChannelAdapter {
  readonly name = "fake"
  replies: Array<{ msg: InboundMessage; text: string }> = []
  onMessage?: (msg: InboundMessage) => void
  async start(cb: (msg: InboundMessage) => void): Promise<void> { this.onMessage = cb }
  async stop(): Promise<void> { /* */ }
  async sendReply(msg: InboundMessage, text: string): Promise<void> { this.replies.push({ msg, text }) }
}

function makeHost(overrides: Partial<ChannelHost> = {}): ChannelHost & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    localAgentIds: () => ["assistant", "files"],
    executeLocal: async (agentId, message) => { calls.push(`local:${agentId}`); return `[${agentId}] ${message}` },
    peers: () => [{ peer: "Badis (client)", healthy: true, skillIds: ["deploy"] }],
    sendToPeer: async (peer, agentId, message) => { calls.push(`peer:${peer}:${agentId}`); return `remote said: ${message}` },
    audit: () => { /* */ },
    log: () => { /* */ },
    ...overrides,
  }
}

const msg = (text: string): InboundMessage => ({ channel: "fake", chatId: "c1", text, sender: "anis" })

describe("ChannelRouter — mention resolution", () => {
  let fake: FakeChannel

  beforeEach(() => { fake = new FakeChannel() })

  it("routes @mention to the local agent", async () => {
    const host = makeHost()
    const router = new ChannelRouter(host)
    router.attach(fake)
    await router.start()
    fake.onMessage!(msg("@files read brief.txt"))
    await new Promise((r) => setTimeout(r, 10))
    expect(host.calls).toEqual(["local:files"])
    expect(fake.replies[0].text).toBe("[files] @files read brief.txt")
  })

  it("routes @mention of a peer skill across the mesh", async () => {
    const host = makeHost()
    const router = new ChannelRouter(host)
    router.attach(fake)
    await router.start()
    fake.onMessage!(msg("@deploy ship v2 to staging"))
    await new Promise((r) => setTimeout(r, 10))
    expect(host.calls).toEqual(["peer:Badis (client):deploy"])
    expect(fake.replies[0].text).toContain("remote said")
  })

  it("no mention → first local agent (plain DM just works)", async () => {
    const host = makeHost()
    const router = new ChannelRouter(host)
    router.attach(fake)
    await router.start()
    fake.onMessage!(msg("hello there"))
    await new Promise((r) => setTimeout(r, 10))
    expect(host.calls).toEqual(["local:assistant"])
  })

  it("a remote grant denial comes back as the reply, honestly", async () => {
    const host = makeHost({
      sendToPeer: async () => { throw new Error('Peer /task error: 403: Forbidden: no-grant') },
    })
    const router = new ChannelRouter(host)
    router.attach(fake)
    await router.start()
    fake.onMessage!(msg("@deploy ship it"))
    await new Promise((r) => setTimeout(r, 10))
    expect(fake.replies[0].text).toContain("⛔")
    expect(fake.replies[0].text).toContain("no-grant")
  })

  it("unhealthy peers are never routed to", async () => {
    const host = makeHost({ peers: () => [{ peer: "down", healthy: false, skillIds: ["deploy"] }] })
    const router = new ChannelRouter(host)
    router.attach(fake)
    await router.start()
    fake.onMessage!(msg("@deploy anything"))
    await new Promise((r) => setTimeout(r, 10))
    expect(fake.replies).toHaveLength(0)
  })
})

describe("GitLabAdapter — webhook handling", () => {
  const cfg = { host: "https://gitlab.example.com", token: "tok", webhookSecret: "s3cret" }

  it("rejects a bad X-Gitlab-Token", () => {
    const a = new GitLabAdapter(cfg)
    expect(a.handleWebhook({ "x-gitlab-token": "wrong" }, { object_kind: "note" })).toBe(401)
  })

  it("routes a note mention and ignores its own comments", async () => {
    const a = new GitLabAdapter(cfg)
    const got: InboundMessage[] = []
    // Pretend start() ran: wire onMessage without hitting the network.
    ;(a as any).onMessage = (m: InboundMessage) => got.push(m)
    ;(a as any).botUsername = "agentina-bot"

    const payload = {
      object_kind: "note",
      user: { username: "anis" },
      project: { path_with_namespace: "mtgl/mtgl_system" },
      merge_request: { iid: 964 },
      object_attributes: { note: "@files what changed?", noteable_type: "MergeRequest" },
    }
    expect(a.handleWebhook({ "x-gitlab-token": "s3cret" }, payload)).toBe(202)
    expect(got[0].chatId).toBe("mtgl/mtgl_system:mergerequest:964")
    expect(got[0].meta).toEqual({ project: "mtgl/mtgl_system", noteableType: "MergeRequest", iid: 964 })

    // Own reply loops back through the webhook — must be dropped.
    const own = { ...payload, user: { username: "agentina-bot" } }
    expect(a.handleWebhook({ "x-gitlab-token": "s3cret" }, own)).toBe(200)
    expect(got).toHaveLength(1)
  })
})

describe("GitHubAdapter — webhook handling", () => {
  const cfg = { token: "tok", webhookSecret: "gh-s3cret" }
  const sign = (raw: string) => "sha256=" + createHmac("sha256", cfg.webhookSecret).update(raw).digest("hex")
  const payload = {
    action: "created",
    comment: { body: "@files what changed?", user: { login: "anis", type: "User" } },
    issue: { number: 42 },
    repository: { full_name: "noqta/agentina" },
  }

  it("rejects a bad HMAC signature", () => {
    const a = new GitHubAdapter(cfg)
    ;(a as any).onMessage = () => { /* */ }
    const raw = JSON.stringify(payload)
    expect(a.handleWebhook({ "x-github-event": "issue_comment", "x-hub-signature-256": "sha256=deadbeef" }, raw)).toBe(401)
  })

  it("routes an issue-comment mention and ignores its own/bot comments", () => {
    const a = new GitHubAdapter(cfg)
    const got: InboundMessage[] = []
    ;(a as any).onMessage = (m: InboundMessage) => got.push(m)
    ;(a as any).botLogin = "agentina-bot"

    const raw = JSON.stringify(payload)
    expect(a.handleWebhook({ "x-github-event": "issue_comment", "x-hub-signature-256": sign(raw) }, raw)).toBe(202)
    expect(got[0].chatId).toBe("noqta/agentina#42")
    expect(got[0].meta).toEqual({ repo: "noqta/agentina", number: 42 })

    // Its own reply and any other bot's comment must be dropped.
    const own = JSON.stringify({ ...payload, comment: { ...payload.comment, user: { login: "agentina-bot", type: "User" } } })
    expect(a.handleWebhook({ "x-github-event": "issue_comment", "x-hub-signature-256": sign(own) }, own)).toBe(200)
    const bot = JSON.stringify({ ...payload, comment: { ...payload.comment, user: { login: "renovate[bot]", type: "Bot" } } })
    expect(a.handleWebhook({ "x-github-event": "issue_comment", "x-hub-signature-256": sign(bot) }, bot)).toBe(200)
    expect(got).toHaveLength(1)
  })

  it("edits and non-comment events carry no new mention", () => {
    const a = new GitHubAdapter(cfg)
    const got: InboundMessage[] = []
    ;(a as any).onMessage = (m: InboundMessage) => got.push(m)
    const edited = JSON.stringify({ ...payload, action: "edited" })
    expect(a.handleWebhook({ "x-github-event": "issue_comment", "x-hub-signature-256": sign(edited) }, edited)).toBe(200)
    const push = JSON.stringify(payload)
    expect(a.handleWebhook({ "x-github-event": "push", "x-hub-signature-256": sign(push) }, push)).toBe(200)
    expect(got).toHaveLength(0)
  })
})

describe("WhatsAppAdapter — webhook handling", () => {
  const cfg = { token: "tok", phoneNumberId: "1234567890", verifyToken: "my-secret-word" }

  it("answers Meta's verification handshake only with the right token", () => {
    const a = new WhatsAppAdapter(cfg)
    const good = new URLSearchParams("hub.mode=subscribe&hub.verify_token=my-secret-word&hub.challenge=CHALLENGE")
    expect(a.verify(good)).toBe("CHALLENGE")
    const bad = new URLSearchParams("hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=CHALLENGE")
    expect(a.verify(bad)).toBeUndefined()
  })

  it("routes text messages and ignores statuses (its own sends)", () => {
    const a = new WhatsAppAdapter(cfg)
    const got: InboundMessage[] = []
    ;(a as any).onMessage = (m: InboundMessage) => got.push(m)

    const inbound = {
      entry: [{ changes: [{ value: {
        messaging_product: "whatsapp",
        contacts: [{ wa_id: "216555000", profile: { name: "Anis" } }],
        messages: [{ from: "216555000", id: "wamid.1", type: "text", text: { body: "@assistant status?" } }],
      } }] }],
    }
    expect(a.handleWebhook(inbound)).toBe(200)
    expect(got[0]).toMatchObject({ chatId: "216555000", sender: "Anis", text: "@assistant status?" })

    // A delivery status for our own reply has no `messages` — dropped.
    const status = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered" }] } }] }] }
    expect(a.handleWebhook(status)).toBe(200)
    expect(got).toHaveLength(1)
  })

  it("enforces the allowed-numbers allowlist", () => {
    const a = new WhatsAppAdapter({ ...cfg, allowedNumbers: ["216555000"] })
    const got: InboundMessage[] = []
    ;(a as any).onMessage = (m: InboundMessage) => got.push(m)
    const stranger = {
      entry: [{ changes: [{ value: {
        messages: [{ from: "999111222", type: "text", text: { body: "hi" } }],
      } }] }],
    }
    expect(a.handleWebhook(stranger)).toBe(200)
    expect(got).toHaveLength(0)
  })
})
