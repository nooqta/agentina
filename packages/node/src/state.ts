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
 *  the environment variable holding the actual credential. */
export interface ChannelsConfig {
  telegram?: { tokenEnv: string; allowedChats?: string[] }
  gitlab?: { host: string; tokenEnv: string; webhookSecretEnv?: string }
}

export interface NodeStateShape {
  party: Party
  /** Advertised URL peers use to reach this node. */
  url: string
  agents: AgentOffer[]
  peers: PeerRef[]
  credentials: Credential[]
  grants: Grant[]
  sessions: CollabSession[]
  pendingInvites: PendingInvite[]
  channels?: ChannelsConfig
  /** Console presentation mode. Simple hides every technical noun. */
  ui?: { mode: "simple" | "advanced" }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`
}

export class NodeState {
  private path: string
  data: NodeStateShape

  constructor(public stateDir: string, init: { partyName: string; partyKind?: PartyKind; url: string }) {
    mkdirSync(stateDir, { recursive: true })
    this.path = join(stateDir, "node.json")
    if (existsSync(this.path)) {
      this.data = JSON.parse(readFileSync(this.path, "utf-8")) as NodeStateShape
      // The advertised URL follows the current process opts (port may differ
      // from the last run); everything identity-shaped stays as stored.
      this.data.url = init.url
      this.data.grants ??= [] // pre-M1 state files
      this.data.sessions ??= [] // pre-M3 state files
    } else {
      const party: Party = { id: newId("pt"), name: init.partyName, kind: init.partyKind ?? "person" }
      this.data = {
        party,
        url: init.url,
        agents: [
          {
            id: "echo",
            partyId: party.id,
            name: "Echo",
            description: "Built-in connectivity agent — replies with what it was sent.",
            skills: [{ id: "echo", name: "Echo", description: "Echoes the task message back.", tags: ["builtin"] }],
            lifecycle: "persistent",
          },
        ],
        peers: [],
        credentials: [],
        grants: [],
        sessions: [],
        pendingInvites: [],
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
