import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ScopedFsAdapter } from "@agentina-mesh/node"
import type { AgentOffer } from "@agentina-mesh/protocol"

const offer: AgentOffer = {
  id: "files", partyId: "pt_owner", name: "Files", description: "", skills: [], lifecycle: "persistent",
}

let base: string
let docs: string

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "scoped-fs-"))
  docs = join(base, "docs")
  mkdirSync(docs)
  writeFileSync(join(docs, "brief.txt"), "the brief")
  writeFileSync(join(base, "secret.txt"), "the secret")
  // Symlink INSIDE the granted root pointing OUTSIDE it.
  symlinkSync(join(base, "secret.txt"), join(docs, "sneaky-link.txt"))
})

afterAll(() => rmSync(base, { recursive: true, force: true }))

const policy = (mode: "ro" | "rw" = "ro") => ({
  grantId: "gr_test",
  scopes: [{ kind: "fs" as const, root: "", mode }],
})

describe("ScopedFsAdapter — the jail holds", () => {
  it("reads a file inside the granted root", async () => {
    const a = new ScopedFsAdapter(base)
    const p = policy(); p.scopes[0].root = docs
    const r = await a.execute(offer, { message: "read brief.txt", fromPartyId: "pt_x", policy: p })
    expect(r.content).toBe("the brief")
  })

  it("denies .. traversal out of the root", async () => {
    const a = new ScopedFsAdapter(base)
    const p = policy(); p.scopes[0].root = docs
    await expect(
      a.execute(offer, { message: "read ../secret.txt", fromPartyId: "pt_x", policy: p }),
    ).rejects.toThrow(/denied/)
  })

  it("denies symlink escapes", async () => {
    const a = new ScopedFsAdapter(base)
    const p = policy(); p.scopes[0].root = docs
    await expect(
      a.execute(offer, { message: "read sneaky-link.txt", fromPartyId: "pt_x", policy: p }),
    ).rejects.toThrow(/denied/)
  })

  it("denies everything when the grant has no fs scope", async () => {
    const a = new ScopedFsAdapter(base)
    await expect(
      a.execute(offer, { message: "read brief.txt", fromPartyId: "pt_x", policy: { grantId: "gr_x", scopes: [] } }),
    ).rejects.toThrow(/no fs scope/)
  })

  it("lists within the root", async () => {
    const a = new ScopedFsAdapter(base)
    const p = policy(); p.scopes[0].root = docs
    const r = await a.execute(offer, { message: "list", fromPartyId: "pt_x", policy: p })
    expect(r.content).toContain("brief.txt")
  })

  it("local caller (no policy) uses the base root", async () => {
    const a = new ScopedFsAdapter(base)
    const r = await a.execute(offer, { message: "read secret.txt", fromPartyId: "local" })
    expect(r.content).toBe("the secret")
  })
})
