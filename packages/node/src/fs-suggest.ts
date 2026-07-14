import { readdirSync, existsSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, basename, join, resolve, sep } from "node:path"

// --- Directory autocomplete for the console's path picker ---
//
// The browser can't open a native folder dialog that yields a full
// path, so the node provides the next-best OS feel: type-ahead
// directory completion. Local-only (the owner browsing their own
// disk); directories only, never file contents; hidden dirs excluded
// unless the user explicitly types the dot.

const MAX_RESULTS = 20

export function suggestDirs(partial: string): string[] {
  let p = (partial || "~").trim()
  if (p === "") p = "~"
  if (p.startsWith("~")) p = join(homedir(), p.slice(1))
  p = resolve(p)

  // Decide what to list: a typed directory lists its children;
  // otherwise list the parent filtered by the typed basename prefix.
  let base: string
  let prefix: string
  if (existsSync(p) && statSync(p).isDirectory()) {
    base = p
    prefix = ""
  } else {
    base = dirname(p)
    prefix = basename(p).toLowerCase()
  }
  if (!existsSync(base)) return []

  const showHidden = prefix.startsWith(".")
  try {
    const out: string[] = []
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
      if (!showHidden && entry.name.startsWith(".")) continue
      if (prefix && !entry.name.toLowerCase().startsWith(prefix)) continue
      const full = join(base, entry.name)
      if (entry.isSymbolicLink()) {
        try {
          if (!statSync(full).isDirectory()) continue
        } catch { continue }
      }
      out.push(full)
      if (out.length >= MAX_RESULTS) break
    }
    return out.sort()
  } catch {
    return [] // unreadable dir — empty suggestions, never an error
  }
}
