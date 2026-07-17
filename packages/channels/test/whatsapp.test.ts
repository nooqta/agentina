import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { WhatsAppAdapter, type InboundMessage } from "@agentina-mesh/channels"

// A fetch stub that records outbound Graph API calls and returns scripted
// responses. WhatsApp's adapter only ever talks to graph.facebook.com, so
// every network effect is observable here.
interface Call { url: string; init?: RequestInit }
function stubFetch(handler: (url: string, init?: RequestInit) => { ok: boolean; status?: number; json?: any }) {
  const calls: Call[] = []
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    const r = handler(String(url), init)
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.json ?? {},
    } as Response
  })
  return calls
}

const cfg = { token: "EAAG-permanent", phoneNumberId: "123456", verifyToken: "my-verify-word" }

afterEach(() => vi.unstubAllGlobals())

describe("WhatsAppAdapter — startup validation", () => {
  it("passes when Meta accepts the token + phone id", async () => {
    const calls = stubFetch(() => ({ ok: true, json: { display_phone_number: "+1 555 0100" } }))
    const a = new WhatsAppAdapter(cfg)
    await expect(a.start(() => {})).resolves.toBeUndefined()
    expect(calls[0].url).toContain("/123456?fields=display_phone_number")
    expect((calls[0].init?.headers as any).Authorization).toBe("Bearer EAAG-permanent")
  })

  it("fails fast when Meta rejects the token", async () => {
    stubFetch(() => ({ ok: false, status: 401 }))
    const a = new WhatsAppAdapter(cfg)
    await expect(a.start(() => {})).rejects.toThrow(/token or phone number id rejected \(401\)/)
  })
})

describe("WhatsAppAdapter — GET verification handshake", () => {
  const a = new WhatsAppAdapter(cfg)
  it("echoes hub.challenge when mode + verify token match", () => {
    const q = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "my-verify-word", "hub.challenge": "42abc" })
    expect(a.verify(q)).toBe("42abc")
  })
  it("rejects a wrong verify token (→ 403)", () => {
    const q = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "WRONG", "hub.challenge": "x" })
    expect(a.verify(q)).toBeUndefined()
  })
  it("rejects a non-subscribe mode", () => {
    const q = new URLSearchParams({ "hub.mode": "unsubscribe", "hub.verify_token": "my-verify-word" })
    expect(a.verify(q)).toBeUndefined()
  })
})

// A canonical Meta inbound text-message webhook body.
function inbound(from: string, text: string, name = "Anis") {
  return {
    entry: [{ changes: [{ value: {
      contacts: [{ wa_id: from, profile: { name } }],
      messages: [{ from, id: "wamid.X", type: "text", text: { body: text } }],
    } }] }],
  }
}

describe("WhatsAppAdapter — inbound webhook", () => {
  let a: WhatsAppAdapter
  let got: InboundMessage[]
  beforeEach(async () => {
    stubFetch(() => ({ ok: true, json: { display_phone_number: "+1 555 0100" } }))
    a = new WhatsAppAdapter(cfg)
    got = []
    await a.start((m) => got.push(m))
  })

  it("delivers a text message with sender name + chatId", () => {
    const status = a.handleWebhook(inbound("15551230000", "hello agent"))
    expect(status).toBe(200)
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ channel: "whatsapp", chatId: "15551230000", text: "hello agent", sender: "Anis" })
    expect(got[0].meta).toMatchObject({ messageId: "wamid.X" })
  })

  it("ignores delivery statuses (own outbound) — the structural loop guard", () => {
    // A status callback has value.statuses, never value.messages.
    const body = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.Y", status: "delivered" }] } }] }] }
    expect(a.handleWebhook(body)).toBe(200)
    expect(got).toHaveLength(0)
  })

  it("ignores non-text messages (image/audio/etc.)", () => {
    const body = { entry: [{ changes: [{ value: { messages: [{ from: "1", id: "w", type: "image", image: {} }] } }] }] }
    a.handleWebhook(body)
    expect(got).toHaveLength(0)
  })

  it("returns 503 before start() wires the callback", () => {
    const fresh = new WhatsAppAdapter(cfg)
    expect(fresh.handleWebhook(inbound("1", "hi"))).toBe(503)
  })

  it("honours an allowedNumbers allowlist", async () => {
    stubFetch(() => ({ ok: true, json: {} }))
    const gated = new WhatsAppAdapter({ ...cfg, allowedNumbers: ["15550009999"] })
    const seen: InboundMessage[] = []
    await gated.start((m) => seen.push(m))
    gated.handleWebhook(inbound("15551230000", "stranger"))   // not on the list
    gated.handleWebhook(inbound("15550009999", "trusted"))    // on the list
    expect(seen.map((m) => m.text)).toEqual(["trusted"])
  })
})

describe("WhatsAppAdapter — sendReply", () => {
  it("POSTs the reply to the Graph messages endpoint as the number", async () => {
    stubFetch(() => ({ ok: true, json: { display_phone_number: "x" } }))
    const a = new WhatsAppAdapter(cfg)
    await a.start(() => {})
    const calls = stubFetch(() => ({ ok: true }))
    await a.sendReply({ channel: "whatsapp", chatId: "15551230000", text: "q" }, "the answer")
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain("/123456/messages")
    expect(calls[0].init?.method).toBe("POST")
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body).toMatchObject({ messaging_product: "whatsapp", to: "15551230000", type: "text", text: { body: "the answer" } })
  })

  it("splits a reply longer than 4096 chars into multiple messages", async () => {
    stubFetch(() => ({ ok: true, json: {} }))
    const a = new WhatsAppAdapter(cfg)
    await a.start(() => {})
    const calls = stubFetch(() => ({ ok: true }))
    const long = "x".repeat(4096) + "y".repeat(50)
    await a.sendReply({ channel: "whatsapp", chatId: "1", text: "" }, long)
    expect(calls).toHaveLength(2)
    expect(JSON.parse(String(calls[0].init?.body)).text.body).toHaveLength(4096)
    expect(JSON.parse(String(calls[1].init?.body)).text.body).toBe("y".repeat(50))
  })
})
