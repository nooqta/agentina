import { randomBytes } from "node:crypto"
import type { Grant, Scope } from "@agentina-mesh/protocol"

// --- Grant store + enforcement ---
//
// A Grant is authored AND enforced by the granting side's node. Pairing
// alone grants NOTHING: a counterparty with valid credentials but no
// grant covering an agent gets 403. Grants created locally (by the
// owner) are active immediately; grants proposed by a counterparty land
// as "proposed" and wait for explicit approval.

export function newGrantId(): string {
  return `gr_${randomBytes(8).toString("hex")}`
}

export class GrantStore {
  private byId = new Map<string, Grant>()

  constructor(
    initial: Grant[] = [],
    private onChange?: (all: Grant[]) => void,
  ) {
    for (const g of initial) this.byId.set(g.id, g)
  }

  /** Owner-authored grant — active immediately. */
  create(input: { fromParty: string; toParty: string; agentIds: string[]; scopes: Scope[]; expiresAt?: string }): Grant {
    const grant: Grant = {
      id: newGrantId(),
      status: "active",
      createdAt: new Date().toISOString(),
      ...input,
    }
    this.byId.set(grant.id, grant)
    this.emit()
    return grant
  }

  /** Counterparty-requested grant — waits for owner approval. */
  propose(input: { fromParty: string; toParty: string; agentIds: string[]; scopes: Scope[]; expiresAt?: string }): Grant {
    const grant: Grant = {
      id: newGrantId(),
      status: "proposed",
      createdAt: new Date().toISOString(),
      ...input,
    }
    this.byId.set(grant.id, grant)
    this.emit()
    return grant
  }

  approve(id: string): Grant | undefined {
    const g = this.byId.get(id)
    if (!g || g.status !== "proposed") return undefined
    g.status = "active"
    this.emit()
    return g
  }

  revoke(id: string): boolean {
    const g = this.byId.get(id)
    if (!g || g.status === "revoked") return false
    g.status = "revoked"
    this.emit()
    return true
  }

  get(id: string): Grant | undefined {
    return this.byId.get(id)
  }

  list(): Grant[] {
    return Array.from(this.byId.values()).map((g) => ({ ...g }))
  }

  /** Active, unexpired grants extended TO the given party. */
  activeFor(toParty: string, now: Date = new Date()): Grant[] {
    return this.list().filter(
      (g) =>
        g.toParty === toParty &&
        g.status === "active" &&
        (!g.expiresAt || Date.parse(g.expiresAt) > now.getTime()),
    )
  }

  private emit(): void {
    this.onChange?.(this.list())
  }
}

export type GrantDecision =
  | { allowed: true; grant: Grant }
  | { allowed: false; reason: "no-grant" | "agent-not-granted" }

/**
 * Pure enforcement: may `toParty` invoke `agentId`, given the grants the
 * owner has extended to them? First matching grant wins (its scopes
 * become the task's policy). `agentIds: ["*"]` covers every agent.
 */
export function enforceGrant(grants: Grant[], agentId: string): GrantDecision {
  if (grants.length === 0) return { allowed: false, reason: "no-grant" }
  for (const g of grants) {
    if (g.agentIds.includes("*") || g.agentIds.includes(agentId)) {
      return { allowed: true, grant: g }
    }
  }
  return { allowed: false, reason: "agent-not-granted" }
}
