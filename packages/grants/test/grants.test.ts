import { describe, it, expect } from "vitest"
import { GrantStore, enforceGrant } from "@agentina-mesh/grants"
import type { Scope } from "@agentina-mesh/protocol"

const fsScope: Scope = { kind: "fs", root: "/tmp/project-docs", mode: "ro" }

describe("GrantStore", () => {
  it("owner-created grants are active immediately; proposed ones wait", () => {
    const s = new GrantStore()
    const active = s.create({ fromParty: "pt_me", toParty: "pt_them", agentIds: ["files"], scopes: [fsScope] })
    const proposed = s.propose({ fromParty: "pt_me", toParty: "pt_them", agentIds: ["deploy"], scopes: [] })
    expect(active.status).toBe("active")
    expect(proposed.status).toBe("proposed")
    expect(s.activeFor("pt_them").map((g) => g.id)).toEqual([active.id])
    s.approve(proposed.id)
    expect(s.activeFor("pt_them")).toHaveLength(2)
  })

  it("revocation and expiry remove grants from activeFor", () => {
    const s = new GrantStore()
    const g1 = s.create({ fromParty: "pt_me", toParty: "pt_them", agentIds: ["files"], scopes: [] })
    s.create({
      fromParty: "pt_me", toParty: "pt_them", agentIds: ["files"], scopes: [],
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    expect(s.activeFor("pt_them")).toHaveLength(1)
    s.revoke(g1.id)
    expect(s.activeFor("pt_them")).toHaveLength(0)
  })

  it("persists via onChange snapshots", () => {
    let snap: unknown
    const s = new GrantStore([], (all) => { snap = all })
    s.create({ fromParty: "a", toParty: "b", agentIds: ["*"], scopes: [] })
    expect((snap as any[]).length).toBe(1)
  })

  it("only grants to the named party count", () => {
    const s = new GrantStore()
    s.create({ fromParty: "pt_me", toParty: "pt_other", agentIds: ["files"], scopes: [] })
    expect(s.activeFor("pt_them")).toHaveLength(0)
  })
})

describe("enforceGrant", () => {
  const store = new GrantStore()
  const grant = store.create({ fromParty: "pt_me", toParty: "pt_them", agentIds: ["files"], scopes: [fsScope] })

  it("no grants at all → no-grant", () => {
    expect(enforceGrant([], "files")).toEqual({ allowed: false, reason: "no-grant" })
  })

  it("grant covering the agent → allowed with that grant", () => {
    const d = enforceGrant(store.activeFor("pt_them"), "files")
    expect(d).toEqual({ allowed: true, grant })
  })

  it("grant exists but not for this agent → agent-not-granted", () => {
    const d = enforceGrant(store.activeFor("pt_them"), "deploy")
    expect(d).toEqual({ allowed: false, reason: "agent-not-granted" })
  })

  it("wildcard grant covers every agent", () => {
    const s = new GrantStore()
    s.create({ fromParty: "pt_me", toParty: "pt_them", agentIds: ["*"], scopes: [] })
    expect(enforceGrant(s.activeFor("pt_them"), "anything").allowed).toBe(true)
  })
})
