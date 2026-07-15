import type { ChannelAdapter, InboundMessage } from "./types"

// --- WhatsApp adapter: Meta Business Cloud API, webhook-fed ---
//
// The node mounts /channels/whatsapp/webhook:
//   GET  → Meta's one-time verification handshake (hub.challenge echo)
//   POST → inbound messages (handleWebhook below)
// Replies go out through the Graph API messages endpoint as the
// configured phone number. Own outbound messages arrive as "statuses",
// never as "messages", so the loop guard is structural.

export interface WhatsAppConfig {
  /** Permanent access token from the Meta app (never stored in files). */
  token: string
  /** The Cloud API phone number id (NOT the phone number itself). */
  phoneNumberId: string
  /** Shared secret echoed back during Meta's GET verification. */
  verifyToken?: string
  /** wa_ids (phone numbers) that may talk to this node. Empty = anyone
   *  who messages the number. */
  allowedNumbers?: string[]
  /** Graph API version. */
  apiVersion?: string
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly name = "whatsapp"
  private onMessage?: (msg: InboundMessage) => void
  private api: string

  constructor(private cfg: WhatsAppConfig, private log: (...a: unknown[]) => void = () => {}) {
    this.api = `https://graph.facebook.com/${cfg.apiVersion ?? "v20.0"}`
  }

  async start(onMessage: (msg: InboundMessage) => void): Promise<void> {
    this.onMessage = onMessage
    // Fail fast on a bad token/phone id so the operator sees it at startup.
    const res = await fetch(`${this.api}/${this.cfg.phoneNumberId}?fields=display_phone_number`, {
      headers: { Authorization: `Bearer ${this.cfg.token}` },
    })
    if (!res.ok) throw new Error(`whatsapp: token or phone number id rejected (${res.status})`)
    const info = (await res.json()) as { display_phone_number?: string }
    this.log(`[whatsapp] sending as ${info.display_phone_number ?? this.cfg.phoneNumberId}`)
  }

  async stop(): Promise<void> {
    this.onMessage = undefined
  }

  /** Meta's GET verification handshake. Returns the challenge string to
   *  echo (HTTP 200 text/plain) or undefined → respond 403. */
  verify(query: URLSearchParams): string | undefined {
    if (query.get("hub.mode") !== "subscribe") return undefined
    if (this.cfg.verifyToken && query.get("hub.verify_token") !== this.cfg.verifyToken) return undefined
    return query.get("hub.challenge") ?? ""
  }

  /** Wire this to the node's HTTP server. Returns an HTTP status. */
  handleWebhook(body: any): number {
    if (!this.onMessage) return 503
    // Meta batches: entry[].changes[].value.messages[] — statuses (our
    // own outbound deliveries) have no `messages`, which is the loop guard.
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value
        const contacts = value?.contacts ?? []
        for (const m of value?.messages ?? []) {
          if (m?.type !== "text" || !m?.text?.body) continue
          const from = String(m.from ?? "")
          if (this.cfg.allowedNumbers?.length && !this.cfg.allowedNumbers.includes(from)) continue
          const contact = contacts.find((c: any) => c?.wa_id === from)
          this.onMessage({
            channel: this.name,
            chatId: from,
            text: String(m.text.body),
            sender: contact?.profile?.name || from,
            meta: { messageId: m.id },
          })
        }
      }
    }
    return 200 // Meta expects 200 fast, always — retries otherwise
  }

  async sendReply(msg: InboundMessage, text: string): Promise<void> {
    // WhatsApp caps a text message at 4096 chars — split on that boundary.
    for (let i = 0; i < text.length || i === 0; i += 4096) {
      const res = await fetch(`${this.api}/${this.cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msg.chatId,
          type: "text",
          text: { body: text.slice(i, i + 4096) || "(empty reply)" },
        }),
      })
      if (!res.ok) this.log(`[whatsapp] send -> ${res.status}`)
    }
  }
}
