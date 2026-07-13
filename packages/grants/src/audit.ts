import { appendFileSync, existsSync, readFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { AuditEntry } from "@agentina-mesh/protocol"

// --- Append-only audit log ---
//
// The trust product: every task, pairing event, connection test, grant
// change, and DENIAL is recorded with the party it was attributed to.
// M0 persistence is JSONL (zero deps, human-greppable); the SQLite
// backend arrives with the grant store in M1 behind this same interface.

export interface AuditSink {
  append(entry: Omit<AuditEntry, "ts"> & { ts?: string }): void
  tail(limit?: number): AuditEntry[]
}

export class JsonlAuditLog implements AuditSink {
  constructor(private path: string) {
    mkdirSync(dirname(path), { recursive: true })
  }

  append(entry: Omit<AuditEntry, "ts"> & { ts?: string }): void {
    const full: AuditEntry = { ts: entry.ts ?? new Date().toISOString(), ...entry }
    appendFileSync(this.path, JSON.stringify(full) + "\n", "utf-8")
  }

  tail(limit = 100): AuditEntry[] {
    if (!existsSync(this.path)) return []
    const lines = readFileSync(this.path, "utf-8").trimEnd().split("\n").filter(Boolean)
    return lines.slice(-limit).map((l) => JSON.parse(l) as AuditEntry)
  }
}
