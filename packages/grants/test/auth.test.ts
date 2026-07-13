import { describe, it, expect } from "vitest"
import { decideAuth, CredentialStore, mintToken } from "@agentina-mesh/grants"

const store = new CredentialStore()
const cred = store.issue("pt_client", { inboundToken: mintToken(), outboundToken: mintToken() })
const resolve = (t: string) => store.resolve(t)

describe("decideAuth — party attribution", () => {
  it("allows loopback without a token", () => {
    const d = decideAuth({ remoteAddress: "127.0.0.1", authorizationHeader: "", resolveToken: resolve })
    expect(d).toEqual({ allowed: true, reason: "loopback" })
  })

  it("attributes a valid token to its party", () => {
    const d = decideAuth({
      remoteAddress: "100.64.0.9",
      authorizationHeader: `Bearer ${cred.inboundToken}`,
      resolveToken: resolve,
    })
    expect(d).toEqual({ allowed: true, reason: "party", partyId: "pt_client" })
  })

  it("denies a missing token from non-loopback — no grace mode", () => {
    const d = decideAuth({ remoteAddress: "100.64.0.9", authorizationHeader: "", resolveToken: resolve })
    expect(d.allowed).toBe(false)
  })

  it("denies an unknown token", () => {
    const d = decideAuth({
      remoteAddress: "100.64.0.9",
      authorizationHeader: "Bearer nope",
      resolveToken: resolve,
    })
    expect(d.allowed).toBe(false)
  })

  it("denies a non-Bearer scheme", () => {
    const d = decideAuth({
      remoteAddress: "100.64.0.9",
      authorizationHeader: `Basic ${cred.inboundToken}`,
      resolveToken: resolve,
    })
    expect(d.allowed).toBe(false)
  })

  it("token attribution beats the loopback exemption — two parties on one host", () => {
    // Regression (found live in the M2 demo): a paired party calling a
    // node on the SAME machine arrived via loopback and was promoted to
    // "local owner", skipping grant enforcement entirely.
    const d = decideAuth({
      remoteAddress: "127.0.0.1",
      authorizationHeader: `Bearer ${cred.inboundToken}`,
      resolveToken: resolve,
    })
    expect(d).toEqual({ allowed: true, reason: "party", partyId: "pt_client" })
  })

  it("an INVALID token is denied even from loopback — no silent owner promotion", () => {
    const d = decideAuth({
      remoteAddress: "127.0.0.1",
      authorizationHeader: "Bearer forged",
      resolveToken: resolve,
    })
    expect(d.allowed).toBe(false)
  })

  it("denies a revoked party's token", () => {
    const s = new CredentialStore()
    const c = s.issue("pt_x", { inboundToken: "tok-x", outboundToken: "tok-y" })
    s.revoke("pt_x")
    const d = decideAuth({
      remoteAddress: "100.64.0.9",
      authorizationHeader: `Bearer ${c.inboundToken}`,
      resolveToken: (t) => s.resolve(t),
    })
    expect(d.allowed).toBe(false)
  })
})

describe("CredentialStore", () => {
  it("rotation replaces the inbound token and invalidates the old one", () => {
    const s = new CredentialStore()
    s.issue("pt_a", { inboundToken: "old-in", outboundToken: "old-out" })
    s.issue("pt_a", { inboundToken: "new-in", outboundToken: "new-out" })
    expect(s.resolve("old-in")).toBeNull()
    expect(s.resolve("new-in")).toBe("pt_a")
    expect(s.outboundToken("pt_a")).toBe("new-out")
  })

  it("persists via onChange snapshots", () => {
    let snapshot: unknown
    const s = new CredentialStore([], (all) => { snapshot = all })
    s.issue("pt_b", { inboundToken: "i", outboundToken: "o" })
    expect(Array.isArray(snapshot)).toBe(true)
    expect((snapshot as any[])[0].partyId).toBe("pt_b")
  })
})
