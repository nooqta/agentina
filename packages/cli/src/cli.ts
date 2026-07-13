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
  agentina status [--port <n>]            party, peers, agents, recent audit
  agentina demo                           two parties on loopback: pair → test → task → deny → revoke → audit

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
      console.log(`Pair another party: agentina invite`)
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
