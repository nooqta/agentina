import { describe, it, expect } from "vitest"
import { generateKeypair, seal, open } from "@agentina-mesh/protocol"

// The cryptographic core of E2E: authenticated sealed boxes. Prove
// round-trip, confidentiality, sender authentication, and fail-closed
// behaviour BEFORE wiring it into pairing or the transport.

describe("sealed boxes — NaCl crypto_box", () => {
  const amal = generateKeypair()
  const badis = generateKeypair()
  const eve = generateKeypair()

  it("generates distinct 32-byte (base64) keypairs", () => {
    expect(amal.publicKey).not.toBe(badis.publicKey)
    expect(Buffer.from(amal.publicKey, "base64")).toHaveLength(32)
    expect(Buffer.from(amal.secretKey, "base64")).toHaveLength(32)
  })

  it("round-trips: Amal → Badis, only Badis can open", () => {
    const env = seal("the checkout brief", badis.publicKey, amal.secretKey)
    expect(env).not.toContain("checkout") // ciphertext, not plaintext
    expect(open(env, amal.publicKey, badis.secretKey)).toBe("the checkout brief")
  })

  it("a third party cannot open it (confidentiality)", () => {
    const env = seal("secret", badis.publicKey, amal.secretKey)
    expect(open(env, amal.publicKey, eve.secretKey)).toBeNull() // Eve's key
    expect(open(env, eve.publicKey, badis.secretKey)).toBeNull() // wrong sender key
  })

  it("rejects a tampered envelope (integrity + sender auth)", () => {
    const env = seal("transfer 100", badis.publicKey, amal.secretKey)
    const dot = env.indexOf(".")
    const flipped = env.slice(0, dot + 1) + "A" + env.slice(dot + 2) // mutate one cipher char
    expect(open(flipped, amal.publicKey, badis.secretKey)).toBeNull()
  })

  it("fails closed on garbage input, never throws", () => {
    expect(open("not-an-envelope", amal.publicKey, badis.secretKey)).toBeNull()
    expect(open("", amal.publicKey, badis.secretKey)).toBeNull()
    expect(open("aaa.bbb", amal.publicKey, badis.secretKey)).toBeNull()
  })

  it("a forged 'from' key is caught — you can't impersonate a sender", () => {
    // Eve seals to Badis but claims to be Amal → Badis opens with Amal's
    // public key and the box fails to authenticate.
    const env = seal("i am amal", badis.publicKey, eve.secretKey)
    expect(open(env, amal.publicKey, badis.secretKey)).toBeNull()
  })
})
