import { createHmac } from "node:crypto"
import { describe, it, expect, beforeEach } from "vitest"
import { ChannelRouter, GitLabAdapter, GitHubAdapter, WhatsAppAdapter, DiscordAdapter, SlackAdapter, type ChannelAdapter, type ChannelHost, type InboundMessage } from "@agentina-mesh/channels"

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

  it("a bound connection speaks for ITS agent — per agent, per channel", async () => {
    const host = makeHost()
    const router = new ChannelRouter(host)
    router.attach(fake, { agentId: "files", bindingId: "cb_1" })
    await router.start()
    // Plain message → the bound agent, not the party default.
    fake.onMessage!(msg("what changed today?"))
    await new Promise((r) => setTimeout(r, 10))
    expect(host.calls).toEqual(["local:files"])
    // An explicit mention still wins — the binding is a default, not a jail.
    fake.onMessage!(msg("@assistant summarize"))
    await new Promise((r) => setTimeout(r, 10))
    expect(host.calls).toEqual(["local:files", "local:assistant"])
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

describe("DiscordAdapter — message filtering", () => {
  function wired() {
    const a = new DiscordAdapter({ token: "tok" })
    const got: InboundMessage[] = []
    ;(a as any).onMessage = (m: InboundMessage) => got.push(m)
    ;(a as any).botUserId = "111"
    return { a, got }
  }

  it("routes DMs, mentions, and strips the bot mention", () => {
    const { a, got } = wired()
    // DM (no guild) — always routed.
    a.handleMessageCreate({ content: "hello", channel_id: "c1", author: { username: "anis" } })
    // Guild message with an agent mention.
    a.handleMessageCreate({ content: "@files read brief.txt", guild_id: "g1", channel_id: "c2", author: { username: "anis" } })
    // Guild message mentioning the bot — routes with the mention stripped.
    a.handleMessageCreate({ content: "<@111> summarize this", guild_id: "g1", channel_id: "c2", author: { username: "anis" } })
    expect(got.map((m) => m.text)).toEqual(["hello", "@files read brief.txt", "summarize this"])
  })

  it("ignores bot authors and unmentioned guild chatter", () => {
    const { a, got } = wired()
    a.handleMessageCreate({ content: "@files x", guild_id: "g1", channel_id: "c2", author: { username: "bot", bot: true } })
    a.handleMessageCreate({ content: "just chatting", guild_id: "g1", channel_id: "c2", author: { username: "anis" } })
    expect(got).toHaveLength(0)
  })

  it("enforces the allowed-channels allowlist for guild messages", () => {
    const a = new DiscordAdapter({ token: "tok", allowedChannels: ["c-ok"] })
    const got: InboundMessage[] = []
    ;(a as any).onMessage = (m: InboundMessage) => got.push(m)
    ;(a as any).botUserId = "111"
    a.handleMessageCreate({ content: "@files x", guild_id: "g1", channel_id: "c-other", author: { username: "anis" } })
    a.handleMessageCreate({ content: "@files x", guild_id: "g1", channel_id: "c-ok", author: { username: "anis" } })
    expect(got).toHaveLength(1)
    expect(got[0].chatId).toBe("c-ok")
  })
})

describe("SlackAdapter — events handling", () => {
  const cfg = { token: "xoxb-tok", signingSecret: "sl-s3cret" }
  const sign = (ts: string, raw: string) =>
    "v0=" + createHmac("sha256", cfg.signingSecret).update(`v0:${ts}:${raw}`).digest("hex")
  const now = () => String(Math.floor(Date.now() / 1000))

  function wired() {
    const a = new SlackAdapter(cfg)
    const got: InboundMessage[] = []
    ;(a as any).onMessage = (m: InboundMessage) => got.push(m)
    ;(a as any).botUserId = "UBOT"
    return { a, got }
  }

  it("echoes the url_verification challenge", () => {
    const { a } = wired()
    const raw = JSON.stringify({ type: "url_verification", challenge: "chal-42" })
    const ts = now()
    const r = a.handleWebhook({ "x-slack-request-timestamp": ts, "x-slack-signature": sign(ts, raw) }, raw)
    expect(r.status).toBe(200)
    expect(JSON.parse(r.body!)).toEqual({ challenge: "chal-42" })
  })

  it("rejects bad signatures and stale timestamps", () => {
    const { a } = wired()
    const raw = JSON.stringify({ type: "url_verification", challenge: "x" })
    const ts = now()
    expect(a.handleWebhook({ "x-slack-request-timestamp": ts, "x-slack-signature": "v0=bad" }, raw).status).toBe(401)
    const old = String(Math.floor(Date.now() / 1000) - 3600)
    expect(a.handleWebhook({ "x-slack-request-timestamp": old, "x-slack-signature": sign(old, raw) }, raw).status).toBe(401)
  })

  it("routes app_mention with the bot mention stripped, acks retries without re-routing", () => {
    const { a, got } = wired()
    const event = {
      type: "event_callback",
      event: { type: "app_mention", user: "U123", channel: "C9", ts: "1700.1", text: "<@UBOT> @files read brief.txt" },
    }
    const raw = JSON.stringify(event)
    const ts = now()
    expect(a.handleWebhook({ "x-slack-request-timestamp": ts, "x-slack-signature": sign(ts, raw) }, raw).status).toBe(200)
    expect(got[0]).toMatchObject({ chatId: "C9", text: "@files read brief.txt", sender: "U123" })
    expect(got[0].meta).toEqual({ threadTs: "1700.1" })
    // Slack retrying the same delivery must not trigger a second answer.
    const r = a.handleWebhook({ "x-slack-request-timestamp": ts, "x-slack-signature": sign(ts, raw), "x-slack-retry-num": "1" }, raw)
    expect(r.status).toBe(200)
    expect(got).toHaveLength(1)
  })
})

describe("Telegram rich formatting (ported from agentx)", () => {
  it("converts Claude markdown to Telegram HTML", async () => {
    const { markdownToTelegramHtml } = await import("@agentina-mesh/channels")
    const md = "## Status\n**Done:** the `brief.txt` review\n- item one\n- item *two*\n```js\nconst x = 1\n```"
    const html = markdownToTelegramHtml(md)
    expect(html).toContain("<b>Status</b>")
    expect(html).toContain("<b>Done:</b>")
    expect(html).toContain("<code>brief.txt</code>")
    expect(html).toContain("• item one")
    expect(html).toContain("<i>two</i>")
    expect(html).toContain("<pre><code>")
    expect(html).not.toContain("**")
  })

  it("escapes HTML in content and keeps links intact", async () => {
    const { markdownToTelegramHtml } = await import("@agentina-mesh/channels")
    const html = markdownToTelegramHtml("a < b & [docs](https://x.dev/a?b=1&c=2)")
    expect(html).toContain("a &lt; b &amp;")
    expect(html).toContain('<a href="https://x.dev/a?b=1&amp;c=2">docs</a>')
  })

  it("splits long replies at natural boundaries under the cap", async () => {
    const { splitMessageText } = await import("@agentina-mesh/channels")
    const long = ("A sentence that goes on. ".repeat(400)).trim()
    const chunks = splitMessageText(long, 3900)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(3900)
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(long.replace(/\s+/g, " "))
  })
})
