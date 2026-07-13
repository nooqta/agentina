#!/usr/bin/env node
import { homedir } from "node:os"
import { join } from "node:path"
import { AgentinaNode } from "@agentina-mesh/node"
import { runDemo } from "./demo"

// --- agentina CLI: init / start / invite / join / test / status / demo ---
//
// Zero-dependency argv handling — six commands don't need a framework.
// A running node is driven over its loopback control endpoints; `start`
// runs the node in the foreground.

const DEFAULT_PORT = 7411
const DEFAULT_STATE = join(homedir(), ".agentina")

interface Flags { [k: string]: string | boolean }

function parseArgs(argv: string[]): { cmd: string; positional: string[]; flags: Flags } {
  const [cmd = "help", ...rest] = argv
  const positional: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]
    if (a.startsWith("--")) {
      const key = a.slice(2)
      const next = rest[i + 1]
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next
        i++
      } else {
        flags[key] = true
      }
    } else {
      positional.push(a)
    }
  }
  return { cmd, positional, flags }
}

function opt(flags: Flags): { stateDir: string; port: number } {
  return {
    stateDir: typeof flags.state === "string" ? flags.state : DEFAULT_STATE,
    port: typeof flags.port === "string" ? Number(flags.port) : DEFAULT_PORT,
  }
}

async function control(port: number, method: string, path: string, body?: unknown): Promise<any> {
  let res: Response
  try {
    res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new Error(`No agentina node on 127.0.0.1:${port} — run \`agentina start\` first`)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data
}

const HELP = `agentina — agent collaboration across trust boundaries

Usage:
  agentina init   [--state <dir>] [--name <party>] [--port <n>] [--url <reachable-url>]
  agentina start  [--state <dir>] [--port <n>] [--url <reachable-url>]
  agentina invite [--port <n>]            mint a one-time pairing link
  agentina join <link> [--port <n>]       redeem a pairing link from another party
  agentina test <peer> [--port <n>]       authenticated connection test
  agentina task <peer> <message…> [--agent <id>] [--port <n>]
  agentina offer --id <id> [--name <n>] [--adapter echo|scoped-fs|claude-code] [--root <dir>]
  agentina channel telegram --token-env <VAR> [--chats <id,id…>]
  agentina channel gitlab --host <url> --token-env <VAR> [--secret-env <VAR>]
  agentina grant --to <peer> --agent <id[,id…]> [--fs <dir> --mode ro|rw] [--skill <id>] [--expires <ISO>]
  agentina grants [--port <n>]            list grants you have authored (+ proposals)
  agentina approve <grant-id>             approve a counterparty's proposed grant
  agentina revoke <grant-id>              revoke a grant
  agentina status [--port <n>]            party, peers, agents, grants, recent audit
  agentina demo                           two parties on loopback: pair → deny → grant → scoped read → escape denied → revoke → audit

Defaults: state ${DEFAULT_STATE}, port ${DEFAULT_PORT}.
`

async function main(): Promise<void> {
  const { cmd, positional, flags } = parseArgs(process.argv.slice(2))
  const { stateDir, port } = opt(flags)

  switch (cmd) {
    case "init": {
      const node = new AgentinaNode({
        stateDir,
        port,
        partyName: typeof flags.name === "string" ? flags.name : `party-${process.env.USER ?? "me"}`,
        url: typeof flags.url === "string" ? flags.url : undefined,
      })
      console.log(`Initialized party "${node.party.name}" (${node.party.id})`)
      console.log(`State: ${stateDir}`)
      console.log(`Next: agentina start${flags.state ? ` --state ${stateDir}` : ""}`)
      return
    }

    case "start": {
      const node = new AgentinaNode({
        stateDir,
        port,
        url: typeof flags.url === "string" ? flags.url : undefined,
        log: console.error.bind(console, "[agentina]"),
      })
      await node.start()
      console.log(`agentina node up — party "${node.party.name}" on 127.0.0.1:${port}`)
      console.log(`Console: http://127.0.0.1:${port}/`)
      console.log(`Pair another party: agentina invite  (or use the console)`)
      const shutdown = () => { void node.stop().then(() => process.exit(0)) }
      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)
      return
    }

    case "invite": {
      const { link } = await control(port, "POST", "/agentina/v1/invites")
      console.log("One-time invite (expires in 15 min):")
      console.log(link)
      return
    }

    case "join": {
      if (!positional[0]) throw new Error("Usage: agentina join <agentina://join/…>")
      const joined = await control(port, "POST", "/agentina/v1/join", { link: positional[0] })
      console.log(`Paired with "${joined.party.name}" (${joined.party.id}) at ${joined.url}`)
      console.log(`Test it: agentina test "${joined.party.name}"`)
      return
    }

    case "test": {
      if (!positional[0]) throw new Error("Usage: agentina test <peer-name>")
      const result = await control(port, "POST", "/agentina/v1/test", { peer: positional[0] })
      console.log(`✓ ${result.party.name} (${result.party.id}) — ${result.latencyMs}ms`)
      return
    }

    case "task": {
      const [peer, ...words] = positional
      if (!peer || words.length === 0) throw new Error("Usage: agentina task <peer> <message…> [--agent <id>]")
      // Route through the node's mesh so health-gating and peer tokens apply.
      const result = await control(port, "POST", "/agentina/v1/task", {
        peer,
        message: words.join(" "),
        agent: typeof flags.agent === "string" ? flags.agent : undefined,
      })
      console.log(result.content)
      return
    }

    case "channel": {
      const kind = positional[0]
      if (kind !== "telegram" && kind !== "gitlab") {
        throw new Error("Usage: agentina channel telegram|gitlab …")
      }
      const body: Record<string, unknown> = { kind, tokenEnv: flags["token-env"] }
      if (kind === "telegram" && typeof flags.chats === "string") body.allowedChats = flags.chats.split(",")
      if (kind === "gitlab") {
        body.host = flags.host
        if (typeof flags["secret-env"] === "string") body.webhookSecretEnv = flags["secret-env"]
      }
      const r = await control(port, "POST", "/agentina/v1/channels", body)
      console.log(`Configured ${r.configured} — ${r.note}`)
      if (kind === "gitlab") console.log(`Point the project webhook at: <node-url>/channels/gitlab/webhook (note events)`)
      return
    }

    case "offer": {
      const id = typeof flags.id === "string" ? flags.id : ""
      if (!id) throw new Error("Usage: agentina offer --id <id> [--adapter scoped-fs --root <dir>]")
      const kind = typeof flags.adapter === "string" ? flags.adapter : "echo"
      const offer = await control(port, "POST", "/agentina/v1/agents", {
        id,
        name: typeof flags.name === "string" ? flags.name : undefined,
        adapter: { kind, ...(typeof flags.root === "string" ? { baseRoot: flags.root } : {}) },
      })
      console.log(`Offering agent "${offer.id}" (${kind}) — grant a party access to it with: agentina grant --to <peer> --agent ${offer.id}`)
      return
    }

    case "grant": {
      const to = typeof flags.to === "string" ? flags.to : ""
      const agents = typeof flags.agent === "string" ? flags.agent.split(",").map((s) => s.trim()) : []
      if (!to || agents.length === 0) throw new Error("Usage: agentina grant --to <peer> --agent <id[,id…]> [--fs <dir> --mode ro|rw] [--skill <id>]")
      const scopes: unknown[] = []
      if (typeof flags.fs === "string") {
        scopes.push({ kind: "fs", root: flags.fs, mode: flags.mode === "rw" ? "rw" : "ro" })
      }
      if (typeof flags.skill === "string") scopes.push({ kind: "skill", skillId: flags.skill })
      const grant = await control(port, "POST", "/agentina/v1/grants", {
        toParty: to,
        agentIds: agents,
        scopes,
        expiresAt: typeof flags.expires === "string" ? flags.expires : undefined,
      })
      console.log(`Granted ${grant.id}: ${to} may invoke [${agents.join(", ")}]${scopes.length ? ` with ${scopes.length} scope(s)` : ""}`)
      return
    }

    case "grants": {
      const { grants } = await control(port, "GET", "/agentina/v1/grants")
      if (!grants.length) return console.log("No grants.")
      for (const g of grants) {
        const scopeStr = g.scopes.map((s: any) => s.kind === "fs" ? `fs:${s.root}(${s.mode})` : s.kind === "skill" ? `skill:${s.skillId}` : s.kind).join(", ")
        console.log(`${g.id} [${g.status}] → ${g.toParty} agents=[${g.agentIds.join(",")}] ${scopeStr}${g.expiresAt ? ` expires ${g.expiresAt}` : ""}`)
      }
      return
    }

    case "approve": {
      if (!positional[0]) throw new Error("Usage: agentina approve <grant-id>")
      const g = await control(port, "POST", "/agentina/v1/grants/approve", { id: positional[0] })
      console.log(`Approved ${g.id} → ${g.toParty}`)
      return
    }

    case "revoke": {
      if (!positional[0]) throw new Error("Usage: agentina revoke <grant-id>")
      await control(port, "POST", "/agentina/v1/grants/revoke", { id: positional[0] })
      console.log(`Revoked ${positional[0]} — the party's next call is denied`)
      return
    }

    case "status": {
      const s = await control(port, "GET", "/agentina/v1/status")
      console.log(`Party:    ${s.party.name} (${s.party.id})`)
      console.log(`URL:      ${s.url}   protocol ${s.protocol}`)
      console.log(`Agents:   ${s.agents.join(", ") || "none"}`)
      for (const p of s.peers) {
        console.log(`Peer:     ${p.peer} ${p.healthy ? "✓ healthy" : "✗ unreachable"} — ${p.peerUrl} (${p.skills.length} skills)`)
      }
      return
    }

    case "demo": {
      const result = await runDemo()
      process.exit(result.ok ? 0 : 1)
      return
    }

    default:
      console.log(HELP)
      if (cmd !== "help") process.exit(1)
  }
}

main().catch((e) => {
  console.error(`agentina: ${e.message}`)
  process.exit(1)
})
