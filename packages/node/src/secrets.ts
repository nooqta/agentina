import { existsSync, readFileSync, writeFileSync, chmodSync, renameSync } from "node:fs"

// --- Secrets: paste a token in the console, no terminal needed ---
//
// <stateDir>/secrets.env holds KEY=VALUE lines, owner-only (0600) —
// the same trust level as node.json beside it, which already stores
// the party credentials. Environment variables always win: a value
// exported in the node's shell overrides the file, so operators who
// prefer pure env vars change nothing.

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export function loadSecrets(path: string): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const name = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!NAME_RE.test(name) || !value) continue
    if (process.env[name] === undefined) process.env[name] = value
  }
}

/** Store (or replace) one secret and make it live immediately. */
export function storeSecret(path: string, name: string, value: string): void {
  if (!NAME_RE.test(name)) throw new Error(`invalid secret name: ${name}`)
  if (!value.trim()) throw new Error("empty secret value")
  const lines = existsSync(path)
    ? readFileSync(path, "utf-8").split("\n").filter((l) => l.trim())
    : ["# agentina secrets — owner-only file; environment variables override these"]
  const next = lines.filter((l) => !l.startsWith(`${name}=`))
  next.push(`${name}=${value.trim()}`)
  const tmp = `${path}.tmp`
  writeFileSync(tmp, next.join("\n") + "\n", { mode: 0o600 })
  renameSync(tmp, path)
  chmodSync(path, 0o600)
  process.env[name] = value.trim()
}

/** Which of these names currently resolve to a value (env or file)? */
export function secretPresence(names: string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const n of names) out[n] = Boolean(process.env[n])
  return out
}
