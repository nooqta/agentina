import { describe, it, expect, beforeEach } from "vitest"
import { ChannelRouter, GitLabAdapter, type ChannelAdapter, type ChannelHost, type InboundMessage } from "@agentina-mesh/channels"

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
