// --- Inbound auth: attribute every request to a Party ---
//
// Evolved from agentx src/daemon/mesh-auth.ts. Two deliberate changes:
//   1. A token maps to a PARTY, not a flat accepted-set — the caller's
//      identity is established before any grant check or execution.
//   2. No "no-tokens-configured" grace mode. agentina is greenfield;
//      unauthenticated non-loopback traffic is always denied.
//
// Pure decision logic, kept out of the server so it unit-tests without
// HTTP. The server wraps this with audit logging and the 401 response.

export interface AuthRequest {
  /** req.socket.remoteAddress */
  remoteAddress: string
  /** Raw Authorization header value ("" when absent). */
  authorizationHeader: string
  /** Resolve a bearer token to the party that holds it (null = unknown). */
  resolveToken: (token: string) => string | null
  /** Exempt loopback callers (local CLI / console). Default true; set
   *  false on shared hosts where localhost isn't the owner's shell. */
  trustLoopback?: boolean
}

export type AuthDecision =
  | { allowed: true; reason: "loopback" }
  | { allowed: true; reason: "party"; partyId: string }
  | { allowed: false; reason: "missing-or-invalid-token" }

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])

export function decideAuth(req: AuthRequest): AuthDecision {
  const trustLoopback = req.trustLoopback !== false
  if (trustLoopback && LOOPBACK.has(req.remoteAddress)) return { allowed: true, reason: "loopback" }

  const header = req.authorizationHeader || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (token) {
    const partyId = req.resolveToken(token)
    if (partyId) return { allowed: true, reason: "party", partyId }
  }

  return { allowed: false, reason: "missing-or-invalid-token" }
}
