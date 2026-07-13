import { describe, it, expect } from "vitest"
import { encodeInvite, decodeInvite } from "@agentina-mesh/peer"
import { PROTOCOL_VERSION, type InvitePayload } from "@agentina-mesh/protocol"

const payload: InvitePayload = {
  version: 2,
  url: "http://100.64.0.7:7411",
  inviteToken: "one-time-abc123",
  partyName: "Amal (freelancer)",
  protocol: PROTOCOL_VERSION,
}

describe("invite codec", () => {
  it("round-trips a payload through agentina://join/…", () => {
    const link = encodeInvite(payload)
    expect(link.startsWith("agentina://join/")).toBe(true)
    expect(decodeInvite(link)).toEqual(payload)
  })

  it("rejects non-invite links", () => {
    expect(() => decodeInvite("https://example.com/join/abc")).toThrow(/Not an agentina invite/)
  })

  it("rejects v1 (agentx-era) payload versions", () => {
    const v1 = Buffer.from(JSON.stringify({ ...payload, version: 1 })).toString("base64url")
    expect(() => decodeInvite(`agentina://join/${v1}`)).toThrow(/Unsupported invite version/)
  })

  it("rejects payloads missing required fields", () => {
    const bad = Buffer.from(JSON.stringify({ version: 2, url: "http://x" })).toString("base64url")
    expect(() => decodeInvite(`agentina://join/${bad}`)).toThrow(/missing required fields/)
  })

  it("rejects protocol mismatches", () => {
    const bad = Buffer.from(JSON.stringify({ ...payload, protocol: "agentina/99" })).toString("base64url")
    expect(() => decodeInvite(`agentina://join/${bad}`)).toThrow(/Protocol mismatch/)
  })

  it("survives unicode party names", () => {
    const link = encodeInvite({ ...payload, partyName: "شركة نقطة 🕸️" })
    expect(decodeInvite(link).partyName).toBe("شركة نقطة 🕸️")
  })
})
