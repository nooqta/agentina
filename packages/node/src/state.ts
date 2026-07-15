import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import type { Party, PartyKind, AgentOffer, Credential, Grant, CollabSession } from "@agentina-mesh/protocol"
import type { PeerRef } from "@agentina-mesh/peer"

// --- Node state: one JSON file per node ---
//
// <stateDir>/node.json holds everything durable: who this party is, the
// agents it offers, its paired counterparties and their credentials, and
// unredeemed invites. Writes are atomic (tmp + rename). The audit log
// lives beside it as audit.jsonl (append-only, separate on purpose —
// state is mutable, audit never is).

export interface PendingInvite {
  token: string
  createdAt: string
  expiresAt: string
}

/** Channel configs keep secrets OUT of the state file: tokenEnv names
 *  the environment variable holding the actual credential.
 *  Legacy shape (one connection per kind) — migrated to bindings. */
export interface ChannelsConfig {
  telegram?: { tokenEnv: string; allowedChats?: string[] }
  gitlab?: { host: string; tokenEnv: string; webhookSecretEnv?: string }
  whatsapp?: { tokenEnv: string; phoneNumberId: string; verifyTokenEnv?: string; allowedNumbers?: string[] }
  github?: { tokenEnv: string; webhookSecretEnv?: string }
  discord?: { tokenEnv: string; allowedChannels?: string[] }
  slack?: { tokenEnv: string; signingSecretEnv?: string }
}

export type ChannelKind = "telegram" | "gitlab" | "whatsapp" | "github" | "discord" | "slack"

/** One channel CONNECTION — per agent, per channel. An agent can have
 *  its own Telegram bot or WhatsApp number (agentina working for its
 *  owner alone), several bindings of the same kind can coexist, and a
 *  binding without an agent is the party-wide bot routed by mentions. */
export interface ChannelBinding {
  id: string
  kind: ChannelKind
  /** This connection answers as this agent — its face on the channel.
   *  Unset = shared connection; mentions decide. */
  agentId?: string
  tokenEnv: string
  /** gitlab */
  host?: string
  /** gitlab · github */
  webhookSecretEnv?: string
  /** whatsapp */
  phoneNumberId?: string
  verifyTokenEnv?: string
  allowedNumbers?: string[]
  /** telegram */
  allowedChats?: string[]
  /** discord */
  allowedChannels?: string[]
  /** slack */
  signingSecretEnv?: string
}

export interface NodeStateShape {
  party: Party
  /** Advertised URL peers use to reach this node. */
  url: string
  /** Listener interface, persisted when set from the console so a
   *  plain restart keeps the node reachable. CLI --bind overrides. */
  bind?: string
  /** Public HTTPS base for webhook channels (a reverse proxy or tunnel
   *  in front of the node) — what WhatsApp/GitHub/Slack/GitLab call. */
  publicUrl?: string
  /** Serve HTTPS directly with these certificate files. */
  tls?: { certPath: string; keyPath: string }
  agents: AgentOffer[]
  peers: PeerRef[]
  credentials: Credential[]
  grants: Grant[]
  sessions: CollabSession[]
  pendingInvites: PendingInvite[]
  /** Legacy single-connection-per-kind config — migrated on load. */
  channels?: ChannelsConfig
  /** Channel connections — several per kind, optionally per agent. */
  channelBindings?: ChannelBinding[]
  /** Console presentation mode. Simple hides every technical noun. */
  ui?: { mode: "simple" | "advanced" }
  /** How the owner shows up to contacts — presentation only, the
   *  party id stays fixed. */
  profile?: { role?: string; color?: string }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`
}

export class NodeState {
  private path: string
  data: NodeStateShape

  constructor(public stateDir: string, init: { partyName: string; partyKind?: PartyKind; url: string; urlIsExplicit?: boolean }) {
    mkdirSync(stateDir, { recursive: true })
    this.path = join(stateDir, "node.json")
    if (existsSync(this.path)) {
      this.data = JSON.parse(readFileSync(this.path, "utf-8")) as NodeStateShape
      // An explicit --url/--bind wins; otherwise a console-set address
      // survives restarts (init.url is just the loopback default then).
      if (init.urlIsExplicit || !this.data.url) this.data.url = init.url
      this.data.grants ??= [] // pre-M1 state files
      this.data.sessions ??= [] // pre-M3 state files
      // One-connection-per-kind configs become bindings (no agent —
      // they were the party-wide bots).
      if (this.data.channels && !this.data.channelBindings) {
        this.data.channelBindings = Object.entries(this.data.channels).map(([kind, cfg]) => ({
          id: `cb_${kind}`,
          kind: kind as ChannelKind,
          ...(cfg as object),
        })) as ChannelBinding[]
        delete this.data.channels
        this.save()
      }
      this.data.channelBindings ??= []
    } else {
      const party: Party = { id: newId("pt"), name: init.partyName, kind: init.partyKind ?? "person" }
      // No default agents: connectivity is proven by /ping, and a stub
      // that answers "echo: …" reads as broken to real users. Agents
      // appear when the owner creates or shares something.
      this.data = {
        party,
        url: init.url,
        agents: [],
        peers: [],
        credentials: [],
        grants: [],
        sessions: [],
        pendingInvites: [],
        channelBindings: [],
      }
      this.save()
    }
  }

  save(): void {
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), "utf-8")
    renameSync(tmp, this.path)
  }

  auditPath(): string {
    return join(this.stateDir, "audit.jsonl")
  }
}
