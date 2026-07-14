import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentinaNode, SshExecAdapter, ScopedGitAdapter } from "@agentina-mesh/node"
import type { AgentOffer } from "@agentina-mesh/protocol"
import { execSync } from "node:child_process"

// Sessions: the ephemeral agent + its grant live and die together.
// Real HTTP between two nodes, fast sweeper, no mocks.

let dirA: string
let dirB: string
let projectDir: string
let amal: AgentinaNode
let badis: AgentinaNode

beforeAll(async () => {
  dirA = mkdtempSync(join(tmpdir(), "sess-a-"))
  dirB = mkdtempSync(join(tmpdir(), "sess-b-"))
  projectDir = mkdtempSync(join(tmpdir(), "sess-proj-"))
  writeFileSync(join(projectDir, "brief.txt"), "the brief")
  amal = new AgentinaNode({ stateDir: dirA, port: 19821, partyName: "Amal", trustLoopback: false, sessionSweepMs: 100, log: () => {} })
  badis = new AgentinaNode({ stateDir: dirB, port: 19822, partyName: "Badis", trustLoopback: false, sessionSweepMs: 100, log: () => {} })
  await amal.start()
  await badis.start()
  const link = badis.createInvite()
  await amal.join(link)
  await amal.mesh.refreshAll()
}, 30_000)

afterAll(async () => {
  await amal.stop()
  await badis.stop()
  for (const d of [dirA, dirB, projectDir]) rmSync(d, { recursive: true, force: true })
})

describe("sessions — this agent will self-destruct", () => {
  it("open → task works → TTL lapses → agent gone, grant revoked, task denied", async () => {
    const { session, offer } = badis.openSession({
      toParty: amal.party.id,
      ttlSeconds: 1,
      agent: { adapter: { kind: "scoped-fs", baseRoot: projectDir } },
      scopes: [{ kind: "fs", root: projectDir, mode: "ro" }],
    })
    expect(session.status).toBe("active")

    await badis.mesh.refreshAll()
    await amal.mesh.refreshPeer(badis.party.name)
    const reply = await amal.sendTask(badis.party.name, "read brief.txt", offer.id)
    expect(reply).toBe("the brief")

    // Let the TTL lapse and the 100ms sweeper fire.
    await new Promise((r) => setTimeout(r, 1500))

    const closed = badis.state.data.sessions.find((s) => s.id === session.id)
    expect(closed?.status).toBe("closed")
    expect(badis.state.data.agents.find((a) => a.id === offer.id)).toBeUndefined()
    expect(badis.grants.activeFor(amal.party.id)).toHaveLength(0)

    await expect(
      amal.sendTask(badis.party.name, "read brief.txt", offer.id),
    ).rejects.toThrow(/40[34]/)

    const kinds = badis.audit.tail().map((e) => e.kind)
    expect(kinds).toContain("session-open")
    expect(kinds).toContain("session-close")
  }, 20_000)

  it("closing early kills access immediately", async () => {
    const { session, offer } = badis.openSession({
      toParty: amal.party.id,
      ttlSeconds: 3600,
      agent: { adapter: { kind: "scoped-fs", baseRoot: projectDir } },
      scopes: [{ kind: "fs", root: projectDir, mode: "ro" }],
    })
    await badis.mesh.refreshAll()
    await amal.mesh.refreshPeer(badis.party.name)
    expect(await amal.sendTask(badis.party.name, "read brief.txt", offer.id)).toBe("the brief")

    expect(badis.closeSession(session.id)).toBe(true)
    await expect(
      amal.sendTask(badis.party.name, "read brief.txt", offer.id),
    ).rejects.toThrow(/40[34]/)
  }, 20_000)
})

describe("ssh scope — credentials come only from the grant", () => {
  const offer: AgentOffer = { id: "server", partyId: "pt_o", name: "s", description: "", skills: [], lifecycle: "persistent" }

  it("injects user@host from the scope, never from the message", async () => {
    // binary=echo prints its own args: proves what ssh WOULD receive.
    const a = new SshExecAdapter({ binary: "echo" })
    const r = await a.execute(offer, {
      message: "uptime",
      fromPartyId: "pt_x",
      policy: { grantId: "gr", scopes: [{ kind: "ssh", host: "vps.example.com", user: "deploy" }] },
    })
    expect(r.content).toContain("deploy@vps.example.com")
    expect(r.content).toContain("uptime")
  })

  it("denies without an ssh scope, and denies local callers outright", async () => {
    const a = new SshExecAdapter({ binary: "echo" })
    await expect(
      a.execute(offer, { message: "uptime", fromPartyId: "pt_x", policy: { grantId: "gr", scopes: [] } }),
    ).rejects.toThrow(/no ssh scope/)
    await expect(
      a.execute(offer, { message: "uptime", fromPartyId: "local" }),
    ).rejects.toThrow(/denied/)
  })
})

describe("repo scope — the granted URL is the only repository", () => {
  let repoDir: string
  const offer: AgentOffer = { id: "repo", partyId: "pt_o", name: "r", description: "", skills: [], lifecycle: "persistent" }

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), "sess-repo-"))
    execSync(
      'git init -q -b main && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "first" && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m "second"',
      { cwd: repoDir, shell: "/bin/bash" },
    )
  })
  afterAll(() => rmSync(repoDir, { recursive: true, force: true }))

  it("lists branches and log of the granted repo", async () => {
    const a = new ScopedGitAdapter()
    const policy = { grantId: "gr", scopes: [{ kind: "repo" as const, url: repoDir, mode: "ro" as const }] }
    const branches = await a.execute(offer, { message: "branches", fromPartyId: "pt_x", policy })
    expect(branches.content).toContain("main")
    const log = await a.execute(offer, { message: "log 5", fromPartyId: "pt_x", policy })
    expect(log.content).toContain("second")
  }, 30_000)

  it("denies without a repo scope", async () => {
    const a = new ScopedGitAdapter()
    await expect(
      a.execute(offer, { message: "branches", fromPartyId: "pt_x", policy: { grantId: "gr", scopes: [] } }),
    ).rejects.toThrow(/no repo scope/)
  })
})
