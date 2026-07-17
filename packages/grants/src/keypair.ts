import nacl from "tweetnacl"

// --- Party keypairs + authenticated sealed boxes (NaCl crypto_box) ---
//
// Each party holds a Curve25519 keypair. A message sealed with the
// SENDER's secret key and the RECIPIENT's public key can be opened only
// by the recipient — AND the recipient can verify it came from that
// sender (crypto_box is authenticated encryption). So one primitive gives
// us both end-to-end confidentiality and mutual authentication on the
// peer link, keyed to identity rather than a bearer token.
//
// tweetnacl is the audited, dependency-free NaCl implementation; base64
// (via Buffer) keeps keys and envelopes JSON-safe.

const b64 = (u: Uint8Array): string => Buffer.from(u).toString("base64")
const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"))

export interface Keypair {
  /** Curve25519 public key (base64) — advertised, safe to share. */
  publicKey: string
  /** Curve25519 secret key (base64) — stays on this machine, forever. */
  secretKey: string
}

export function generateKeypair(): Keypair {
  const kp = nacl.box.keyPair()
  return { publicKey: b64(kp.publicKey), secretKey: b64(kp.secretKey) }
}

/**
 * Authenticated encryption. The envelope ("<nonce>.<cipher>", base64) can
 * be opened only by `theirPublicKey`'s holder, who can verify it came
 * from `mySecretKey`'s holder. Throws only on malformed key input.
 */
export function seal(plaintext: string, theirPublicKey: string, mySecretKey: string): string {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const cipher = nacl.box(new TextEncoder().encode(plaintext), nonce, unb64(theirPublicKey), unb64(mySecretKey))
  return `${b64(nonce)}.${b64(cipher)}`
}

/**
 * Open an envelope from `theirPublicKey`. Returns null on ANY failure —
 * tampering, a wrong key, a replayed/garbled nonce — so callers fail
 * closed and never act on unauthenticated bytes.
 */
export function open(envelope: string, theirPublicKey: string, mySecretKey: string): string | null {
  const dot = envelope.indexOf(".")
  if (dot < 0) return null
  try {
    const nonce = unb64(envelope.slice(0, dot))
    const cipher = unb64(envelope.slice(dot + 1))
    const opened = nacl.box.open(cipher, nonce, unb64(theirPublicKey), unb64(mySecretKey))
    return opened ? new TextDecoder().decode(opened) : null
  } catch {
    return null
  }
}
