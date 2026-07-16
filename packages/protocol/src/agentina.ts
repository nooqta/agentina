// --- agentina protocol extensions: parties, grants, pairing ---
//
// agentina is agent collaboration ACROSS trust boundaries. Every node is
// owned by a Party; every inbound request is attributed to a Party before
// anything runs; every capability a party extends to another is a Grant,
// authored AND enforced by the granting side.

import type { AgentSkill } from "./a2a"

/** Wire protocol version. Sent in agent cards and the
 *  `X-Agentina-Version` header; invite payloads carry it too. */
export const PROTOCOL_VERSION = "agentina/1"

/** URL scheme + path prefix for pairing invite links. */
export const INVITE_SCHEME = "agentina:"
export const INVITE_PATH_PREFIX = "//join/"

export type PartyKind = "person" | "org" | "hub"

/** The owner of a node. `hub` is a party whose administrative grants
 *  other mesh members accept (master-mesh topology, post-MVP). */
export interface Party {
  id: string
  name: string
  kind: PartyKind
}

/** How a counterparty authenticates. MVP is a bearer pair — two
 *  independent tokens, one per direction, minted at pairing time.
 *  The shape is keypair-ready: `kind: "keypair"` lands later without
 *  breaking stores. */
export interface Credential {
  partyId: string
  kind: "bearer-pair"
  /** Token the counterparty presents when calling THIS node. */
  inboundToken: string
  /** Token THIS node presents when calling the counterparty. */
  outboundToken: string
  status: "active" | "revoked"
  createdAt: string
  rotatedAt?: string
}

/** Something a party can grant access to. The unit non-technical users
 *  reason about: "this folder, read-only", "this repo", "this server",
 *  "this skill". */
export type Scope =
  | { kind: "fs"; root: string; mode: "ro" | "rw" }
  | { kind: "ssh"; host: string; user: string }
  | { kind: "repo"; url: string; mode: "ro" | "rw" }
  | { kind: "skill"; skillId: string }

/** A capability one party extends to another. Authored and ENFORCED by
 *  `fromParty`'s node — the counterparty only ever sends tasks. Two
 *  collaborating parties hold two independent Grants, one per direction. */
export interface Grant {
  id: string
  fromParty: string
  toParty: string
  /** Which of fromParty's agents toParty may invoke. */
  agentIds: string[]
  scopes: Scope[]
  expiresAt?: string
  status: "proposed" | "active" | "revoked"
  createdAt: string
}

/** How an AgentOffer executes, declaratively — so offers restored from
 *  a state file bind to the right runtime without code. Programmatic
 *  adapter registration (host code) overrides this. */
export interface AdapterSpec {
  kind: "echo" | "scoped-fs" | "claude-code" | "ssh-exec" | "scoped-git"
  /** The agent's workspace — home directory for fs-flavored adapters
   *  (the outermost root; grants confine within it per party). AI
   *  agents load their skills from <baseRoot>/skills/*.md + SKILL.md. */
  baseRoot?: string
  model?: string
  /** The agent's personality/instructions — appended to the provider's
   *  system prompt (agentx-style). */
  systemPrompt?: string
  /** Skill files (by name) the owner switched off in the console —
   *  they stay on disk but are not injected into the prompt. */
  disabledSkills?: string[]
}

/** An agent a party exposes to the mesh. `lifecycle` distinguishes
 *  permanent agents from session-scoped ones reaped after a
 *  collaboration ends. */
export interface AgentOffer {
  id: string
  partyId: string
  name: string
  description: string
  skills: AgentSkill[]
  lifecycle: "persistent" | { session: string; ttlSeconds: number }
  adapter?: AdapterSpec
}

/** An ephemeral collaboration between parties. The owner opens it for a
 *  counterparty; its agents and grants die with it — by TTL or by an
 *  explicit close. */
export interface CollabSession {
  id: string
  parties: string[]
  grants: string[]
  ephemeralAgents: string[]
  status: "active" | "closed"
  ttlSeconds?: number
  createdAt: string
  expiresAt?: string
  closedAt?: string
}

// --- Pairing wire shapes ---

/** Payload inside `agentina://join/<base64url(JSON)>`. Carries a
 *  ONE-TIME invite token, never a permanent credential — redeeming it
 *  mints the real per-party bearer pair. (agentx v1 links embedded the
 *  permanent shared MESH_TOKEN; that weakness is fixed here.) */
export interface InvitePayload {
  version: 2
  /** Reachable URL of the inviter's node. */
  url: string
  /** One-time redemption token, consumed by /pair/complete. */
  inviteToken: string
  partyName: string
  protocol: typeof PROTOCOL_VERSION
}

/** POST /agentina/v1/pair/complete — sent by the INVITEE to the
 *  inviter's node. `accessToken` is the token the INVITER must present
 *  when calling the invitee (the invitee minted it and will accept it). */
export interface PairCompleteRequest {
  inviteToken: string
  party: Party
  /** Reachable URL of the invitee's node. */
  url: string
  accessToken: string
  protocol: string
}

/** Response: the inviter's identity plus the token the INVITEE must
 *  present when calling the inviter. */
export interface PairCompleteResponse {
  party: Party
  accessToken: string
  protocol: string
}

/** GET /agentina/v1/ping — authenticated connection test. */
export interface PingResponse {
  party: Party
  protocol: string
  now: string
  /** Which party the server attributed the caller to. */
  you: string
}

/** Agent-card extension: agentina nodes add these to the A2A card. */
export interface AgentinaCardExtension {
  party: Party
  protocol: string
}

// --- Audit ---

export type AuditKind =
  | "task"
  | "pair"
  | "ping"
  | "grant-create"
  | "grant-revoke"
  | "session-open"
  | "session-close"
  | "auth-denied"
  | "skill-edit"
  | "skill-read"
  | "skill-adopt"

export interface AuditEntry {
  ts: string
  kind: AuditKind
  decision: "allowed" | "denied"
  partyId?: string
  agentId?: string
  grantId?: string
  scopes?: Scope[]
  reason?: string
  detail?: string
}
