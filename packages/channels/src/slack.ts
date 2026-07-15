import { createHmac, timingSafeEqual } from "node:crypto"
import type { ChannelAdapter, InboundMessage } from "./types"

// --- Slack adapter: Events API, app_mention → threaded reply ---
//
// Webhook-fed (the node mounts POST /channels/slack/events and calls
// handleWebhook with the RAW body — Slack signs "v0:<ts>:<raw>" with
// the signing secret). Two special cases the handler owns:
//   · url_verification: Slack's one-time handshake — echo the challenge
//   · retries (x-slack-retry-num): ack without routing, or the agent
//     would answer the same mention twice
// app_mention fires only when the bot is @mentioned and never for the
// bot's own messages, so the loop guard is structural.

export interface SlackConfig {
  /** Bot token (xoxb-…) with app_mentions:read + chat:write. */
  token: string
  /** Signing secret checked against X-Slack-Signature. */
  signingSecret?: string
}

export class SlackAdapter implements ChannelAdapter {
  readonly name = "slack"
  private onMessage?: (msg: InboundMessage) => void
  private botUserId = ""
  private api = "https://slack.com/api"

  constructor(private cfg: SlackConfig, private log: (...a: unknown[]) => void = () => {}) {}

  async start(onMessage: (msg: InboundMessage) => void): Promise<void> {
    this.onMessage = onMessage
    const res = await fetch(`${this.api}/auth.test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}` },
    })
    const auth = (await res.json()) as { ok: boolean; user_id?: string; team?: string; error?: string }
    if (!auth.ok) throw new Error(`slack: token rejected by auth.test (${auth.error ?? "unknown"})`)
    this.botUserId = auth.user_id ?? ""
    this.log(`[slack] connected to ${auth.team} as <@${this.botUserId}>`)
  }

  async stop(): Promise<void> {
    this.onMessage = undefined
  }

  /** Wire this to the node's HTTP server with the RAW request body.
   *  Returns the status plus an optional body to write (the
   *  url_verification challenge must be echoed back). */
  handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): { status: number; body?: string } {
    if (this.cfg.signingSecret) {
      const ts = String(headers["x-slack-request-timestamp"] ?? "")
      // Stale timestamp = possible replay of a captured request.
      if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return { status: 401 }
      const got = String(headers["x-slack-signature"] ?? "")
      const want = "v0=" + createHmac("sha256", this.cfg.signingSecret).update(`v0:${ts}:${rawBody}`).digest("hex")
      const a = Buffer.from(got)
      const b = Buffer.from(want)
      if (a.length !== b.length || !timingSafeEqual(a, b)) return { status: 401 }
    }

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      return { status: 400 }
    }

    // Slack's one-time endpoint handshake.
    if (body?.type === "url_verification") {
      return { status: 200, body: JSON.stringify({ challenge: body.challenge }) }
    }
    if (!this.onMessage) return { status: 503 }

    // A retry means we already answered (or are answering) — ack only.
    if (headers["x-slack-retry-num"]) return { status: 200 }

    const event = body?.event
    if (body?.type !== "event_callback" || event?.type !== "app_mention") return { status: 200 }
    if (event.bot_id || event.subtype) return { status: 200 } // never route bot/system messages

    // Strip the leading bot mention so "<@U…> @files read x" routes on
    // the agent mention (or falls to the default agent when bare).
    const text = String(event.text ?? "")
      .replace(new RegExp(`<@${this.botUserId}>`, "g"), "")
      .trim()
    if (!text) return { status: 200 }

    this.onMessage({
      channel: this.name,
      chatId: String(event.channel),
      text,
      sender: String(event.user ?? "unknown"),
      // Reply in the same thread; a top-level mention starts one.
      meta: { threadTs: event.thread_ts ?? event.ts },
    })
    return { status: 200 } // Slack wants a fast 200; the reply posts async
  }

  async sendReply(msg: InboundMessage, text: string): Promise<void> {
    const res = await fetch(`${this.api}/chat.postMessage`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: msg.chatId,
        text: text || "(empty reply)",
        thread_ts: (msg.meta as any)?.threadTs,
      }),
    })
    const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    if (!out.ok) this.log(`[slack] chat.postMessage -> ${out.error ?? res.status}`)
  }
}
