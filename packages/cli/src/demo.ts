import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentinaNode, ScopedFsAdapter } from "@agentina-mesh/node"

// --- agentina demo: freelancer ↔ client on loopback, no keys, no setup ---
//
// The canonical M1 story. Badis (client) has project docs and a secret
// file OUTSIDE them. Amal (freelancer) pairs with him — and can do
// NOTHING until Badis grants her party the "files" agent, read-only,
// scoped to the docs directory. She reads the brief; a path escape to
// the secret is denied; the revoked grant denies her next call. Every
// decision — including the denials — lands in the audit log.
// This same flow runs in CI as the integration suite.

export interface DemoResult {
  steps: Array<{ name: string; ok: boolean; detail: string }>
  ok: boolean
}

export async function runDemo(opts: { basePort?: number; print?: (line: string) => void } = {}): Promise<DemoResult> {
  const print = opts.print ?? console.log
  const basePort = opts.basePort ?? 18901
  const dirA = mkdtempSync(join(tmpdir(), "agentina-demo-a-"))
  const dirB = mkdtempSync(join(tmpdir(), "agentina-demo-b-"))
  const projectDir = mkdtempSync(join(tmpdir(), "agentina-demo-project-"))
  const steps: DemoResult["steps"] = []
  const step = (name: string, ok: boolean, detail: string) => {
    steps.push({ name, ok, detail })
    print(`  ${ok ? "✓" : "✗"} ${name} — ${detail}`)
  }

  // Badis's machine: docs the freelancer SHOULD see, and a secret she shouldn't.
  const docsDir = join(projectDir, "project-docs")
  mkdirSync(docsDir)
  writeFileSync(join(docsDir, "brief.txt"), "Redesign the checkout flow. Budget: 4 weeks. Contact: badis@client.example\n")
  writeFileSync(join(projectDir, "secret.txt"), "TOP SECRET: acquisition plans\n")

  const silent = () => {}
  // trustLoopback:false so the demo exercises the REAL auth path over
  // HTTP — every request must carry a party token, even from localhost.
  const amal = new AgentinaNode({ stateDir: dirA, port: basePort, partyName: "Amal (freelancer)", trustLoopback: false, log: silent })
  const badis = new AgentinaNode({ stateDir: dirB, port: basePort + 1, partyName: "Badis (client)", trustLoopback: false, log: silent })
  badis.addAgent(
    {
      id: "private-notes",
      partyId: badis.party.id,
      name: "Private notes",
      description: "Badis's own notes — never shared.",
      skills: [{ id: "private-notes", name: "Private notes", description: "private", tags: ["fs"] }],
      lifecycle: "persistent",
    },
    new ScopedFsAdapter(projectDir),
  )
  badis.addAgent(
    {
      id: "files",
      partyId: badis.party.id,
      name: "Files",
      description: "Scoped file access to what Badis granted — nothing else.",
      skills: [{ id: "files", name: "Files", description: "list/read within granted directories", tags: ["fs"] }],
      lifecycle: "persistent",
    },
    new ScopedFsAdapter(projectDir),
  )

  try {
    await amal.start()
    await badis.start()
    print("")
    print("  agentina demo — freelancer ↔ client, one trust boundary, loopback only")
    print(`  Amal (freelancer): 127.0.0.1:${amal.port}   Badis (client): 127.0.0.1:${badis.port}`)
    print("")

    // 1. Pair via one-time invite link.
    const link = badis.createInvite()
    print(`  invite: ${link.slice(0, 56)}…`)
    const joined = await amal.join(link)
    step("pair", joined.party.id === badis.party.id, `Amal joined "${joined.party.name}" — directional tokens exchanged`)

    // 2. The invite is one-time: replaying it must fail.
    let replayRejected = false
    try {
      await amal.join(link)
    } catch {
      replayRejected = true
    }
    step("invite replay rejected", replayRejected, "the redeemed link is worthless")

    // 3. Authenticated connection test, both directions.
    const pingAB = await amal.ping(badis.party.name)
    const pingBA = await badis.ping(amal.party.name)
    step("connection test", true, `Amal→Badis ${pingAB.latencyMs}ms · Badis→Amal ${pingBA.latencyMs}ms`)

    // 4. Pairing alone grants NOTHING — task without a grant → 403.
    await amal.mesh.refreshAll()
    let ungrantedStatus = ""
    try {
      await amal.sendTask(badis.party.name, "read brief.txt", "files")
    } catch (e: any) {
      ungrantedStatus = String(e.message)
    }
    step("deny before grant", ungrantedStatus.includes("403"), `task without a grant → ${ungrantedStatus.slice(0, 80)}`)

    // 5. Badis grants Amal's party the files agent, read-only, docs only.
    const grant = badis.grantAccess(amal.party.id, ["files"], [{ kind: "fs", root: docsDir, mode: "ro" }])
    step("grant", grant.status === "active", `Badis → Amal: agent "files", fs:${docsDir.split("/").pop()} (ro)`)

    // 6. The granted read works.
    const brief = await amal.sendTask(badis.party.name, "read brief.txt", "files")
    step("scoped read", brief.includes("Redesign the checkout flow"), `"${brief.split("\n")[0]}"`)

    // 7. Path escape to the secret OUTSIDE the granted root → denied.
    let escapeDenied = ""
    try {
      await amal.sendTask(badis.party.name, "read ../secret.txt", "files")
    } catch (e: any) {
      escapeDenied = String(e.message)
    }
    step("path escape denied", escapeDenied.includes("denied") || escapeDenied.includes("403"), `read ../secret.txt → ${escapeDenied.slice(0, 70)}`)

    // 8. The grant covers "files" only — other agents stay forbidden.
    let otherAgentDenied = ""
    try {
      await amal.sendTask(badis.party.name, "hello", "private-notes")
    } catch (e: any) {
      otherAgentDenied = String(e.message)
    }
    step("ungranted agent denied", otherAgentDenied.includes("403"), `ask to "private-notes" → agent-not-granted`)

    // 9. Forged token → real HTTP 401.
    const forged = await fetch(`http://127.0.0.1:${badis.port}/agentina/v1/ping`, {
      headers: { Authorization: "Bearer forged-token" },
    })
    step("forged token denied", forged.status === 401, `GET /ping with a forged token → ${forged.status}`)

    // 10. Revoking the grant kills access instantly.
    badis.grants.revoke(grant.id)
    let revokedDenied = ""
    try {
      await amal.sendTask(badis.party.name, "read brief.txt", "files")
    } catch (e: any) {
      revokedDenied = String(e.message)
    }
    step("grant revoked", revokedDenied.includes("403"), `after revoke, the same read → 403`)

    // 11. Audit trail: pairing, grant, tasks, AND every denial recorded.
    const auditB = badis.audit.tail()
    const kinds = new Set(auditB.map((e) => e.kind))
    const deniedCount = auditB.filter((e) => e.decision === "denied").length
    step(
      "audit trail",
      kinds.has("pair") && kinds.has("grant-create") && kinds.has("task") && kinds.has("auth-denied") && deniedCount >= 3,
      `Badis's log: ${auditB.length} entries, ${deniedCount} denials (${[...kinds].join(", ")})`,
    )

    const ok = steps.every((s) => s.ok)
    print("")
    print(ok
      ? "  All checks passed — M1: pair → deny → grant → scoped read → escape denied → revoke → audit."
      : "  SOME CHECKS FAILED")
    print("  Worth your time? A star helps others find it: https://github.com/nooqta/agentina")
    print("")
    return { steps, ok }
  } finally {
    await amal.stop().catch(() => {})
    await badis.stop().catch(() => {})
    rmSync(dirA, { recursive: true, force: true })
    rmSync(dirB, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
}
