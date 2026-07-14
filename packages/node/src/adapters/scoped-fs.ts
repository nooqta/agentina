import { readFileSync, readdirSync, existsSync, realpathSync } from "node:fs"
import { resolve, sep, relative } from "node:path"
import type { Scope } from "@agentina-mesh/protocol"
import type { AgentAdapter, AdapterTask } from "../adapter"
import type { AgentOffer } from "@agentina-mesh/protocol"

// --- ScopedFsAdapter: file access confined to granted roots ---
//
// The CI-safe proof that fs scopes are ENFORCED, not advisory. Message
// protocol: `list [dir]` or `read <relative-path>`. Every path resolves
// against a granted fs root and must stay inside it — `..` traversal
// and symlink escapes both fail closed.
//
// For local callers (no policy) the adapter uses its base root, rw.
// For remote parties the GRANT's fs scopes are the jail: no fs scope in
// the grant means no file access at all, regardless of the base root.

export class ScopedFsAdapter implements AgentAdapter {
  constructor(private baseRoot: string) {}

  async execute(offer: AgentOffer, task: AdapterTask): Promise<{ content: string }> {
    const scopes = this.effectiveScopes(task)
    if (scopes.length === 0) {
      throw new Error("denied: the grant covering this agent includes no fs scope")
    }

    const [verb, ...rest] = task.message.trim().split(/\s+/)
    const arg = rest.join(" ")

    if (verb === "list") {
      const { abs, scope } = this.confine(arg || ".", scopes)
      const entries = readdirSync(abs, { withFileTypes: true })
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .sort()
      return { content: `${relative(scope.root, abs) || "."} (${scope.mode}): ${entries.join(", ") || "(empty)"}` }
    }

    if (verb === "read") {
      if (!arg) throw new Error("usage: read <relative-path>")
      const { abs } = this.confine(arg, scopes)
      const body = readFileSync(abs, "utf-8")
      return { content: body.length > 8192 ? body.slice(0, 8192) + "\n… (truncated)" : body }
    }

    // A human saying "hello" shouldn't get a CLI error. Answer with
    // gentle guidance and what's actually here — denials stay errors,
    // small talk doesn't.
    const { abs, scope } = this.confine(".", scopes)
    const entries = readdirSync(abs, { withFileTypes: true })
      .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
      .sort()
      .slice(0, 12)
    return {
      content:
        `I'm a file agent — I can "list" folders or "read <file>" within what was shared (${scope.mode === "rw" ? "read & write" : "read-only"}).\n` +
        `Here's what's available: ${entries.join(", ") || "(empty)"}\n` +
        `Try: read ${entries.find((e) => !e.endsWith("/")) ?? "<file>"}`,
    }
  }

  private effectiveScopes(task: AdapterTask): Array<{ root: string; mode: "ro" | "rw" }> {
    if (!task.policy) return [{ root: resolve(this.baseRoot), mode: "rw" }]
    return task.policy.scopes
      .filter((s): s is Extract<Scope, { kind: "fs" }> => s.kind === "fs")
      .map((s) => ({ root: resolve(s.root), mode: s.mode }))
  }

  /** Resolve a caller-supplied path inside one of the granted roots.
   *  Fails closed on traversal (`..`), absolute paths outside every
   *  root, and symlinks pointing out of the jail. */
  private confine(relPath: string, scopes: Array<{ root: string; mode: "ro" | "rw" }>): { abs: string; scope: { root: string; mode: "ro" | "rw" } } {
    for (const scope of scopes) {
      const abs = resolve(scope.root, relPath)
      if (abs !== scope.root && !abs.startsWith(scope.root + sep)) continue
      // Symlink escape: compare real paths when the target exists.
      if (existsSync(abs)) {
        const realRoot = realpathSync(scope.root)
        const realAbs = realpathSync(abs)
        if (realAbs !== realRoot && !realAbs.startsWith(realRoot + sep)) continue
      }
      return { abs, scope }
    }
    throw new Error(`denied: "${relPath}" is outside every granted directory`)
  }
}
