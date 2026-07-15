import type { ChannelAdapter, InboundMessage } from "./types"

// --- Discord adapter: Gateway websocket, zero dependencies ---
//
// Discord delivers messages over an OUTBOUND websocket (the Gateway),
// not a webhook — which suits agentina: no public IP needed, works
// behind Tailscale, same as Telegram. Uses the runtime's built-in
// WebSocket (Node 22+); start() fails fast with a clear message on
// older Nodes. Replies go out through the REST API.
//
// Filtering: DMs are always routed; guild messages only when they
// carry an @mention (an agent name, or the bot itself) — otherwise a
// bot in a busy server would answer every message.

export interface DiscordConfig {
  /** Bot token from discord.com/developers (never stored in files). */
  token: string
  /** Channel ids that may talk to this node. Empty = every channel the
   *  bot can see (DMs are always allowed). */
  allowedChannels?: string[]
}

const GUILDS = 1 << 0
const GUILD_MESSAGES = 1 << 9
const DIRECT_MESSAGES = 1 << 12
const MESSAGE_CONTENT = 1 << 15
const INTENTS = GUILDS | GUILD_MESSAGES | DIRECT_MESSAGES | MESSAGE_CONTENT

export class DiscordAdapter implements ChannelAdapter {
  readonly name = "discord"
  private onMessage?: (msg: InboundMessage) => void
  private running = false
  private ws?: WebSocket
  private heartbeat?: ReturnType<typeof setInterval>
  private seq: number | null = null
  private botUserId = ""
  private api = "https://discord.com/api/v10"

  constructor(private cfg: DiscordConfig, private log: (...a: unknown[]) => void = () => {}) {}

  private headers(): Record<string, string> {
    return { Authorization: `Bot ${this.cfg.token}`, "Content-Type": "application/json" }
  }

  async start(onMessage: (msg: InboundMessage) => void): Promise<void> {
    if (typeof WebSocket === "undefined") {
      throw new Error("discord: needs the built-in WebSocket (Node 22+)")
    }
    this.onMessage = onMessage
    const me = await fetch(`${this.api}/users/@me`, { headers: this.headers() })
    if (!me.ok) throw new Error(`discord: token rejected by /users/@me (${me.status})`)
    const user = (await me.json()) as { id: string; username: string }
    this.botUserId = user.id
    const gw = await fetch(`${this.api}/gateway/bot`, { headers: this.headers() })
    if (!gw.ok) throw new Error(`discord: /gateway/bot failed (${gw.status})`)
    const { url } = (await gw.json()) as { url: string }
    this.log(`[discord] connected as @${user.username}`)
    this.running = true
    this.connect(url)
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.ws?.close()
    this.onMessage = undefined
  }

  private connect(gatewayUrl: string): void {
    const ws = new WebSocket(`${gatewayUrl}?v=10&encoding=json`)
    this.ws = ws
    ws.onmessage = (ev) => {
      let payload: any
      try { payload = JSON.parse(String(ev.data)) } catch { return }
      if (payload.s != null) this.seq = payload.s

      if (payload.op === 10) {
        // Hello → heartbeat forever, then identify.
        const interval = Number(payload.d?.heartbeat_interval ?? 41250)
        if (this.heartbeat) clearInterval(this.heartbeat)
        this.heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: this.seq }))
        }, interval)
        ws.send(JSON.stringify({
          op: 2,
          d: {
            token: this.cfg.token,
            intents: INTENTS,
            properties: { os: process.platform, browser: "agentina", device: "agentina" },
          },
        }))
        return
      }
      if (payload.op === 1) {
        // The gateway may ask for an immediate heartbeat.
        ws.send(JSON.stringify({ op: 1, d: this.seq }))
        return
      }
      if (payload.t === "MESSAGE_CREATE") this.handleMessageCreate(payload.d)
    }
    ws.onclose = () => {
      if (this.heartbeat) clearInterval(this.heartbeat)
      if (this.running) {
        this.log("[discord] gateway closed — reconnecting in 5s")
        setTimeout(() => { if (this.running) this.connect(gatewayUrl) }, 5000)
      }
    }
    ws.onerror = () => { /* onclose follows and handles the retry */ }
  }

  /** Exposed for tests — decides whether a MESSAGE_CREATE gets routed. */
  handleMessageCreate(m: any): void {
    if (!this.onMessage || !m?.content || m.author?.bot) return
    const isDm = !m.guild_id
    const channelId = String(m.channel_id ?? "")
    if (!isDm && this.cfg.allowedChannels?.length && !this.cfg.allowedChannels.includes(channelId)) return
    // Guild messages need an explicit mention — an @agent name in plain
    // text, or the bot itself (<@id>) which routes to the default agent.
    let text = String(m.content)
    const botMention = new RegExp(`<@!?${this.botUserId}>`, "g")
    const mentioned = botMention.test(text) || /@[a-z0-9][\w.-]*/i.test(text)
    if (!isDm && !mentioned) return
    text = text.replace(botMention, "").trim()
    if (!text) return
    this.onMessage({
      channel: this.name,
      chatId: channelId,
      text,
      sender: m.author?.username || "unknown",
      meta: { messageId: m.id },
    })
  }

  async sendReply(msg: InboundMessage, text: string): Promise<void> {
    // Discord caps messages at 2000 chars — split on that boundary.
    for (let i = 0; i < text.length || i === 0; i += 2000) {
      const res = await fetch(`${this.api}/channels/${msg.chatId}/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          content: text.slice(i, i + 2000) || "(empty reply)",
          ...(i === 0 && (msg.meta as any)?.messageId
            ? { message_reference: { message_id: (msg.meta as any).messageId } }
            : {}),
        }),
      })
      if (!res.ok) this.log(`[discord] reply -> ${res.status}`)
    }
  }
}
