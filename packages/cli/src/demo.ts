import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentinaNode } from "@agentina-mesh/node"

// --- agentina demo: the whole M0 loop on loopback, no keys, no setup ---
//
// Boots two parties (a freelancer and a client), pairs them via a real
// one-time invite link, connection-tests, exchanges a task, then proves
// the security boundary: a forged token is rejected and attributed in
// the audit log. This same flow runs in CI as the integration suite.

export interface DemoResult {
  steps: Array<{ name: string; ok: boolean; detail: string }>
  ok: boolean
}

export async function runDemo(opts: { basePort?: number; print?: (line: string) => void } = {}): Promise<DemoResult> {
  const print = opts.print ?? console.log
  const basePort = opts.basePort ?? 18901
  const dirA = mkdtempSync(join(tmpdir(), "agentina-demo-a-"))
  const dirB = mkdtempSync(join(tmpdir(), "agentina-demo-b-"))
  const steps: DemoResult["steps"] = []
  const step = (name: string, ok: boolean, detail: string) => {
    steps.push({ name, ok, detail })
    print(`  ${ok ? "✓" : "✗"} ${name} — ${detail}`)
  }

  const silent = () => {}
  // trustLoopback:false so the demo exercises the REAL auth path over
  // HTTP — every request must carry a party token, even from localhost.
  const amal = new AgentinaNode({ stateDir: dirA, port: basePort, partyName: "Amal (freelancer)", trustLoopback: false, log: silent })
  const badis = new AgentinaNode({ stateDir: dirB, port: basePort + 1, partyName: "Badis (client)", trustLoopback: false, log: silent })

  try {
    await amal.start()
    await badis.start()
    print("")
    print("  agentina demo — two parties, one trust boundary, loopback only")
    print(`  Amal:  127.0.0.1:${amal.port}   Badis: 127.0.0.1:${badis.port}`)
    print("")

    // 1. Pair via one-time invite link.
    const link = amal.createInvite()
    print(`  invite: ${link.slice(0, 56)}…`)
    const joined = await badis.join(link)
    step("pair", joined.party.id === amal.party.id, `Badis joined "${joined.party.name}" — parties exchanged directional tokens`)

    // 2. The invite is one-time: replaying it must fail.
    let replayRejected = false
    try {
      await badis.join(link)
    } catch {
      replayRejected = true
    }
    step("invite replay rejected", replayRejected, "the redeemed link is worthless")

    // 3. Authenticated connection test, both directions.
    const pingAB = await badis.ping(amal.party.name)
    const pingBA = await amal.ping(badis.party.name)
    step("connection test", true, `Badis→Amal ${pingAB.latencyMs}ms · Amal→Badis ${pingBA.latencyMs}ms`)

    // 4. Task round-trip over the mesh (health-gated).
    await badis.mesh.refreshAll()
    const reply = await badis.sendTask(amal.party.name, "hello across the boundary")
    step("task round-trip", reply.includes("hello across the boundary"), `"${reply}"`)

    // 5. Security boundary: forged token → real HTTP 401, recorded in audit.
    const forged = await fetch(`http://127.0.0.1:${amal.port}/agentina/v1/ping`, {
      headers: { Authorization: "Bearer forged-token" },
    })
    step("forged token denied", forged.status === 401, `GET /ping with a forged token → ${forged.status}`)

    // 6. Revocation kills access instantly — Badis's next call 401s.
    amal.credentials.revoke(badis.party.id)
    let revokedStatus = 0
    try {
      await badis.ping(amal.party.name)
    } catch (e: any) {
      const m = /failed: (\d+)/.exec(String(e.message))
      revokedStatus = m ? Number(m[1]) : 0
    }
    step("revocation", revokedStatus === 401, `after revoke, Badis→Amal ping → ${revokedStatus}`)

    // 7. Audit trail: pairing, tasks, AND the denials all recorded.
    const auditA = amal.audit.tail()
    const kinds = new Set(auditA.map((e) => e.kind))
    step(
      "audit trail",
      kinds.has("pair") && kinds.has("task") && kinds.has("auth-denied"),
      `Amal's log: ${auditA.length} entries (${[...kinds].join(", ")})`,
    )

    const ok = steps.every((s) => s.ok)
    print("")
    print(ok ? "  All checks passed. This is milestone M0: pair → test → task → deny → revoke → audit." : "  SOME CHECKS FAILED")
    print("  Worth your time? A star helps others find it: https://github.com/agentina-mesh/agentina")
    print("")
    return { steps, ok }
  } finally {
    await amal.stop().catch(() => {})
    await badis.stop().catch(() => {})
    rmSync(dirA, { recursive: true, force: true })
    rmSync(dirB, { recursive: true, force: true })
  }
}
