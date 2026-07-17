import type { ChannelAdapter, InboundMessage } from "./types"
import { markdownToTelegramHtml } from "./telegram-format"

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
    // Chunk BEFORE the markdown→HTML conversion (the agentx pattern):
    // 3900-char chunks leave headroom so tag expansion (**x** → <b>x</b>)
    // can never push a message past Telegram's 4096 hard cap.
    const chunks = splitMessageText(text || "(empty reply)", 3900)
    for (const [index, chunk] of chunks.entries()) {
      const base = {
        chat_id: msg.chatId,
        // Only the first chunk threads to the original message.
        ...(index === 0 && (msg.meta as any)?.messageId
          ? { reply_to_message_id: (msg.meta as any).messageId }
          : {}),
      }
      const rich = await fetch(`${this.api}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, text: markdownToTelegramHtml(chunk), parse_mode: "HTML" }),
      })
      if (rich.ok) continue
      // Telegram rejected the HTML (unbalanced tags, exotic markdown) —
      // the reply must still arrive: retry as plain text.
      this.log(`[telegram] HTML sendMessage -> ${rich.status}, retrying plain`)
      const plain = await fetch(`${this.api}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, text: chunk }),
      })
      if (!plain.ok) this.log(`[telegram] sendMessage -> ${plain.status}`)
    }
  }
}

/** Split long text at natural boundaries (paragraph > line > sentence >
 *  word), never mid-tag — ported from agentx's message-chunks. */
export function splitMessageText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars)
    const splitAt = Math.max(
      window.lastIndexOf("\n\n"),
      window.lastIndexOf("\n"),
      window.lastIndexOf(". "),
      window.lastIndexOf(" "),
    )
    const cut = splitAt > Math.floor(maxChars * 0.55) ? splitAt + (window[splitAt] === "." ? 1 : 0) : maxChars
    chunks.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  if (rest) chunks.push(rest)
  return chunks
}
