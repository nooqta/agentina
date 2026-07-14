import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs"
import { tmpdir, homedir } from "node:os"
import { join } from "node:path"
import { detectEnvironment } from "../src/environment"
import { suggestDirs } from "../src/fs-suggest"
import { SCENARIOS } from "../src/scenarios"
import { AgentinaNode } from "@agentina-mesh/node"

describe("environment detection", () => {
  const savedPath = process.env.PATH

  afterAll(() => { process.env.PATH = savedPath })

  it("reports claude missing on an empty PATH, found on a faked one", () => {
    process.env.PATH = "/nonexistent"
    const empty = detectEnvironment()
    expect(empty.ai.claude.found).toBe(false)
    expect(empty.ai.installCommand).toContain("claude-code")

    const bin = mkdtempSync(join(tmpdir(), "env-bin-"))
    writeFileSync(join(bin, "claude"), "#!/bin/sh\necho claude 9.9.9\n")
    chmodSync(join(bin, "claude"), 0o755)
    process.env.PATH = bin
    const found = detectEnvironment()
    expect(found.ai.claude.found).toBe(true)
    expect(found.ai.claude.version).toContain("9.9.9")
    rmSync(bin, { recursive: true, force: true })
  })

  it("always offers quick-pick directories that exist", () => {
    process.env.PATH = "/nonexistent"
    const env = detectEnvironment()
    expect(env.quickPicks.some((q) => q.path === homedir())).toBe(true)
  })
})

describe("fs suggestions", () => {
  let base: string
  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), "fs-sug-"))
    mkdirSync(join(base, "projects"))
    mkdirSync(join(base, "photos"))
    mkdirSync(join(base, ".secret"))
    writeFileSync(join(base, "notafolder.txt"), "x")
  })
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it("lists directories only, hidden excluded by default", () => {
    const dirs = suggestDirs(base + "/")
    expect(dirs).toContain(join(base, "projects"))
    expect(dirs).toContain(join(base, "photos"))
    expect(dirs.some((d) => d.endsWith(".secret"))).toBe(false)
    expect(dirs.some((d) => d.endsWith("notafolder.txt"))).toBe(false)
  })

  it("prefix-filters and shows hidden when the dot is typed", () => {
    expect(suggestDirs(join(base, "pro"))).toEqual([join(base, "projects")])
    expect(suggestDirs(join(base, ".se"))).toEqual([join(base, ".secret")])
  })

  it("expands ~ and survives junk input", () => {
    expect(Array.isArray(suggestDirs("~"))).toBe(true)
    expect(suggestDirs("/definitely/not/real/anywhere")).toEqual([])
  })
})

describe("scenario templates apply through the real API", () => {
  let dirA: string, dirB: string, work: string
  let helper: AgentinaNode, family: AgentinaNode

  beforeAll(async () => {
    dirA = mkdtempSync(join(tmpdir(), "scn-a-"))
    dirB = mkdtempSync(join(tmpdir(), "scn-b-"))
    work = mkdtempSync(join(tmpdir(), "scn-work-"))
    writeFileSync(join(work, "broken-thing.txt"), "please fix")
    helper = new AgentinaNode({ stateDir: dirA, port: 19831, partyName: "Helper", trustLoopback: false, log: () => {} })
    family = new AgentinaNode({ stateDir: dirB, port: 19832, partyName: "Mom", trustLoopback: false, log: () => {} })
    await helper.start()
    await family.start()
    await helper.join(family.createInvite())
    await helper.mesh.refreshAll()
    await family.mesh.refreshAll()
  }, 30_000)

  afterAll(async () => {
    await helper.stop()
    await family.stop()
    for (const d of [dirA, dirB, work]) rmSync(d, { recursive: true, force: true })
  })

  it("four scenarios, each role's steps reference real actions", () => {
    expect(SCENARIOS).toHaveLength(4)
    for (const s of SCENARIOS) {
      expect(s.roles).toHaveLength(2)
      for (const roleSteps of s.steps) {
        for (const st of roleSteps) {
          expect(["create-agent", "share-agent", "share-folder", "share-server", "share-repo"]).toContain(st.action)
        }
      }
    }
  })

  it("IT-helper scenario: the family side's one step yields a working 1h session", async () => {
    const scenario = SCENARIOS.find((s) => s.id === "it-helper-family")!
    const step = scenario.steps[1][0] // the person being helped shares a folder
    expect(step.action).toBe("share-folder")
    expect(step.defaults.durationSeconds).toBe(3600)

    const share = family.createShare({
      peer: helper.party.id,
      kind: "folder",
      value: work,
      mode: step.defaults.mode,
      durationSeconds: step.defaults.durationSeconds,
    })
    expect(share.expiresAt).toBeDefined()

    await family.mesh.refreshAll()
    await helper.mesh.refreshPeer(family.party.name)
    const reply = await helper.sendTask(family.party.name, "read broken-thing.txt", share.agentId)
    expect(reply).toBe("please fix")

    // It's a session — closing tears down agent + grant.
    family.closeSession(share.id)
    await expect(
      helper.sendTask(family.party.name, "read broken-thing.txt", share.agentId),
    ).rejects.toThrow(/40[34]/)
  }, 20_000)
})
