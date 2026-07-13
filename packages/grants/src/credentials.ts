import { randomBytes } from "node:crypto"
import type { Credential } from "@agentina-mesh/protocol"

// --- Per-party credential store ---
//
// MVP: bearer pairs — two independent 32-byte tokens per counterparty,
// one per direction, minted at pairing time. Revocation is per party.
// The Credential shape is keypair-ready (kind discriminant) so Ed25519
// lands later without a store migration.
//
// Persistence is the host's job: the store is in-memory over an initial
// snapshot and calls `onChange` after every mutation.

export function mintToken(): string {
  return randomBytes(32).toString("hex")
}

export class CredentialStore {
  private byParty = new Map<string, Credential>()
  private byInboundToken = new Map<string, string>()

  constructor(
    initial: Credential[] = [],
    private onChange?: (all: Credential[]) => void,
  ) {
    for (const c of initial) this.index(c)
  }

  /** Create (or replace) the bearer pair for a counterparty. */
  issue(partyId: string, tokens: { inboundToken: string; outboundToken: string }): Credential {
    const existing = this.byParty.get(partyId)
    if (existing) this.byInboundToken.delete(existing.inboundToken)
    const cred: Credential = {
      partyId,
      kind: "bearer-pair",
      inboundToken: tokens.inboundToken,
      outboundToken: tokens.outboundToken,
      status: "active",
      createdAt: new Date().toISOString(),
      ...(existing ? { rotatedAt: new Date().toISOString() } : {}),
    }
    this.index(cred)
    this.emit()
    return cred
  }

  /** Token → party attribution for inbound auth. Revoked creds resolve to null. */
  resolve(token: string): string | null {
    const partyId = this.byInboundToken.get(token)
    if (!partyId) return null
    const cred = this.byParty.get(partyId)
    return cred?.status === "active" ? partyId : null
  }

  /** Token this node presents when calling the given party. */
  outboundToken(partyId: string): string | undefined {
    const cred = this.byParty.get(partyId)
    return cred?.status === "active" ? cred.outboundToken : undefined
  }

  revoke(partyId: string): boolean {
    const cred = this.byParty.get(partyId)
    if (!cred || cred.status === "revoked") return false
    cred.status = "revoked"
    this.emit()
    return true
  }

  list(): Credential[] {
    return Array.from(this.byParty.values()).map((c) => ({ ...c }))
  }

  private index(c: Credential): void {
    this.byParty.set(c.partyId, c)
    this.byInboundToken.set(c.inboundToken, c.partyId)
  }

  private emit(): void {
    this.onChange?.(this.list())
  }
}
