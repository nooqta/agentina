import type { ChannelAdapter, InboundMessage } from "./types"

// --- Telegram adapter: Bot API long-polling, zero dependencies ---
//
// Works the moment a BotFather token exists — no webhook, no public IP,
// which matters for nodes living behind Tailscale. `allowedChats` is the
// owner's allowlist; when set, everything else is ignored silently.

export interface TelegramConfig {
  token: string
  /** Chat ids that may talk to this node. Empty/unset = any chat that
   *  finds the bot (fine for a private bot, set it for groups). */
  allowedChats?: string[]
  /** Poll timeout seconds (long poll). */
  pollSeconds?: number
}

export class TelegramAdapter implements ChannelAdapter {
  readonly name = "telegram"
  private running = false
  private offset = 0
  private api: string

  constructor(private cfg: TelegramConfig, private log: (...a: unknown[]) => void = () => {}) {
    this.api = `https://api.telegram.org/bot${cfg.token}`
  }

  async start(onMessage: (msg: InboundMessage) => void): Promise<void> {
    // Fail fast on a bad token so the operator sees it at startup, not
    // in a silent poll loop.
    const me = await fetch(`${this.api}/getMe`).then((r) => r.json()) as { ok: boolean; result?: { username?: string } }
    if (!me.ok) throw new Error("telegram: token rejected by getMe")
    this.log(`[telegram] connected as @${me.result?.username}`)
    this.running = true
    void this.poll(onMessage)
  }

  async stop(): Promise<void> {
    this.running = false
  }

  private async poll(onMessage: (msg: InboundMessage) => void): Promise<void> {
    const timeout = this.cfg.pollSeconds ?? 25
    while (this.running) {
      try {
        const res = await fetch(`${this.api}/getUpdates?timeout=${timeout}&offset=${this.offset}`, {
          signal: AbortSignal.timeout((timeout + 10) * 1000),
        })
        const data = await res.json() as { ok: boolean; result?: Array<any> }
        for (const update of data.result ?? []) {
          this.offset = update.update_id + 1
          const m = update.message
          if (!m?.text) continue
          const chatId = String(m.chat.id)
          if (this.cfg.allowedChats?.length && !this.cfg.allowedChats.includes(chatId)) continue
          onMessage({
            channel: this.name,
            chatId,
            text: m.text,
            sender: m.from?.username || m.from?.first_name || "unknown",
            meta: { messageId: m.message_id },
          })
        }
      } catch (e: any) {
        if (this.running) {
          this.log(`[telegram] poll error (retrying in 5s): ${e?.message || e}`)
          await new Promise((r) => setTimeout(r, 5000))
        }
      }
    }
  }

  async sendReply(msg: InboundMessage, text: string): Promise<void> {
    // Telegram caps messages at 4096 chars — split on that boundary.
    for (let i = 0; i < text.length || i === 0; i += 4096) {
      const res = await fetch(`${this.api}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: msg.chatId,
          text: text.slice(i, i + 4096) || "(empty reply)",
          reply_to_message_id: (msg.meta as any)?.messageId,
        }),
      })
      if (!res.ok) this.log(`[telegram] sendMessage -> ${res.status}`)
    }
  }
}
