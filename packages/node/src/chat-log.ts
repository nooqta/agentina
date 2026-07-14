import { appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

// --- Per-contact conversation log ---
//
// The console's threads used to live in browser memory: refresh, gone —
// and the OWNER of an agent saw nothing of what a counterparty asked
// it. Conversations are now durable on each node, per contact, in both
// directions:
//   dir "out" — asks this party sent to the contact's agents
//   dir "in"  — asks the contact sent to THIS party's agents
// One JSONL per contact under <stateDir>/chats/.

export interface ChatEntry {
  ts: string
  dir: "out" | "in"
  agent: string
  text: string
  reply?: string
  error?: string
}

export class ChatLog {
  private dir: string

  constructor(stateDir: string) {
    this.dir = join(stateDir, "chats")
    mkdirSync(this.dir, { recursive: true })
  }

  private file(partyId: string): string {
    return join(this.dir, `${partyId.replace(/[^\w-]/g, "_")}.jsonl`)
  }

  append(partyId: string, entry: Omit<ChatEntry, "ts">): void {
    const full: ChatEntry = { ts: new Date().toISOString(), ...entry }
    appendFileSync(this.file(partyId), JSON.stringify(full) + "\n", "utf-8")
  }

  tail(partyId: string, limit = 200): ChatEntry[] {
    const f = this.file(partyId)
    if (!existsSync(f)) return []
    const lines = readFileSync(f, "utf-8").trimEnd().split("\n").filter(Boolean)
    return lines.slice(-limit).map((l) => JSON.parse(l) as ChatEntry)
  }
}
