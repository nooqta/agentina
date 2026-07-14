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

/** "45m" | "2h" | "7d" | "3600" (seconds) → seconds. */
function parseDuration(v: string): number {
  const m = /^(\d+)\s*([smhd]?)$/.exec(v.trim())
  if (!m) throw new Error(`Can't parse duration "${v}" — use 45m, 2h, 7d, or seconds`)
  const n = Number(m[1])
  const mult = { "": 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2] as "" | "s" | "m" | "h" | "d"]
  return n * mult
}

/** Shared scope flags: --fs <dir> [--mode ro|rw], --ssh user@host, --repo <url> [--mode], --skill <id>. */
function buildScopes(flags: Flags): unknown[] {
  const scopes: unknown[] = []
  const mode = flags.mode === "rw" ? "rw" : "ro"
  if (typeof flags.fs === "string") scopes.push({ kind: "fs", root: flags.fs, mode })
  if (typeof flags.ssh === "string") {
    const [user, host] = flags.ssh.split("@")
    if (!user || !host) throw new Error("--ssh expects user@host")
    scopes.push({ kind: "ssh", host, user })
  }
  if (typeof flags.repo === "string") scopes.push({ kind: "repo", url: flags.repo, mode })
  if (typeof flags.skill === "string") scopes.push({ kind: "skill", skillId: flags.skill })
  return scopes
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
  agentina start  [--state <dir>] [--port <n>] [--bind <ip>] [--url <reachable-url>]
                  (--bind your Tailscale/VPN IP so the other party can reach you;
                   default 127.0.0.1 is local-only — see docs/tutorials/00-install-and-network.md)
  agentina invite [--port <n>]            mint a one-time pairing link
  agentina join <link> [--port <n>]       redeem a pairing link from another party
  agentina test <peer> [--port <n>]       authenticated connection test
  agentina ask <peer> <message…> [--agent <id>] [--port <n>]   ask another party's agent (within what they granted you)
  agentina share --to <peer> --folder <dir>|--server <user@host>|--repo <url> [--rw] [--for 2h|7d]
  agentina shares <peer>                  list what you share with them
  agentina unshare <share-id>             stop a share instantly
  agentina offer --id <id> [--name <n>] [--adapter echo|scoped-fs|claude-code] [--root <dir>]
  agentina channel telegram --token-env <VAR> [--chats <id,id…>]
  agentina channel gitlab --host <url> --token-env <VAR> [--secret-env <VAR>]
  agentina grant --to <peer> --agent <id[,id…]> [--fs <dir> --mode ro|rw] [--ssh <user@host>] [--repo <url>] [--skill <id>] [--expires 2h|7d|<ISO>]
  agentina session --to <peer> --ttl <45m|2h> --adapter scoped-fs|ssh-exec|scoped-git|claude-code
                   [--root <dir>] [--fs <dir> --mode ro|rw] [--ssh <user@host>] [--repo <url>] [--agent-id <id>]
  agentina sessions [--port <n>]          list sessions; close with: agentina session-close <id>
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
      const bind = typeof flags.bind === "string" ? flags.bind : undefined
      const node = new AgentinaNode({
        stateDir,
        port,
        bind,
        url: typeof flags.url === "string" ? flags.url : undefined,
        log: console.error.bind(console, "[agentina]"),
      })
      await node.start()
      console.log(`agentina node up — party "${node.party.name}" on ${bind ?? "127.0.0.1"}:${port}`)
      console.log(`Console: http://127.0.0.1:${port}/`)
      {
        const s = await control(port, "GET", "/agentina/v1/status").catch(() => null)
        const env = s?.environment
        if (env) {
          const ai = env.ai.claude.found ? `AI ready (${env.ai.claude.version ?? "claude"})` : "AI not installed (folder/server/repo sharing still works)"
          const net = env.network.tailscale.ip ? `tailscale ${env.network.tailscale.ip}` : "no overlay network detected"
          console.log(`Machine:  ${ai} · ${net}`)
          if (!bind && env.network.tailscale.ip) {
            console.log(`Tip: restart with --bind ${env.network.tailscale.ip} so other parties can reach you`)
          }
        }
      }
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

    case "ask":
    case "task": { // "task" kept as a hidden alias
      const [peer, ...words] = positional
      if (!peer || words.length === 0) throw new Error("Usage: agentina ask <peer> <message…> [--agent <id>]")
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

    case "share": {
      const to = typeof flags.to === "string" ? flags.to : ""
      const kind = typeof flags.folder === "string" ? "folder" : typeof flags.server === "string" ? "server" : typeof flags.repo === "string" ? "repo" : ""
      const value = (flags.folder ?? flags.server ?? flags.repo) as string
      if (!to || !kind) throw new Error("Usage: agentina share --to <peer> --folder <dir>|--server user@host|--repo <url> [--rw] [--for 2h|7d]")
      const body: Record<string, unknown> = { peer: to, kind, value, mode: flags.rw ? "rw" : "ro" }
      if (typeof flags.for === "string") body.durationSeconds = parseDuration(flags.for)
      const share = await control(port, "POST", "/agentina/v1/shares", body)
      console.log(`✓ Shared ${kind} "${value}" with ${to}${share.expiresAt ? ` — self-destructs ${share.expiresAt}` : ""} (stop: agentina unshare ${share.id})`)
      return
    }

    case "shares": {
      if (!positional[0]) throw new Error("Usage: agentina shares <peer>")
      const { shares } = await control(port, "GET", `/agentina/v1/shares?peer=${encodeURIComponent(positional[0])}`)
      if (!shares.length) return console.log("Nothing shared.")
      for (const x of shares) {
        console.log(`${x.id} [${x.status}] ${x.kind}: ${x.value}${x.mode ? ` (${x.mode})` : ""}${x.expiresAt ? ` expires ${x.expiresAt}` : ""}`)
      }
      return
    }

    case "unshare": {
      if (!positional[0]) throw new Error("Usage: agentina unshare <share-id>")
      await control(port, "POST", "/agentina/v1/shares/stop", { id: positional[0] })
      console.log(`Stopped — their next use is denied`)
      return
    }

    case "grant": {
      const to = typeof flags.to === "string" ? flags.to : ""
      const agents = typeof flags.agent === "string" ? flags.agent.split(",").map((s) => s.trim()) : []
      if (!to || agents.length === 0) throw new Error("Usage: agentina grant --to <peer> --agent <id[,id…]> [--fs <dir> --mode ro|rw] [--ssh user@host] [--repo url] [--skill <id>] [--expires 2h]")
      const scopes = buildScopes(flags)
      let expiresAt: string | undefined
      if (typeof flags.expires === "string") {
        expiresAt = flags.expires.includes("T")
          ? flags.expires // already ISO
          : new Date(Date.now() + parseDuration(flags.expires) * 1000).toISOString()
      }
      const grant = await control(port, "POST", "/agentina/v1/grants", {
        toParty: to,
        agentIds: agents,
        scopes,
        expiresAt,
      })
      console.log(`Granted ${grant.id}: ${to} may invoke [${agents.join(", ")}]${scopes.length ? ` with ${scopes.length} scope(s)` : ""}${expiresAt ? `, expires ${expiresAt}` : ""}`)
      return
    }

    case "session": {
      const to = typeof flags.to === "string" ? flags.to : ""
      const ttlStr = typeof flags.ttl === "string" ? flags.ttl : ""
      const adapterKind = typeof flags.adapter === "string" ? flags.adapter : ""
      if (!to || !ttlStr || !adapterKind) throw new Error("Usage: agentina session --to <peer> --ttl <45m|2h> --adapter <kind> [scope flags]")
      const result = await control(port, "POST", "/agentina/v1/sessions", {
        toParty: to,
        ttlSeconds: parseDuration(ttlStr),
        agent: {
          id: typeof flags["agent-id"] === "string" ? flags["agent-id"] : undefined,
          adapter: { kind: adapterKind, ...(typeof flags.root === "string" ? { baseRoot: flags.root } : {}) },
        },
        scopes: buildScopes(flags),
      })
      console.log(`Session ${result.session.id} open — ephemeral agent "${result.offer.id}" for ${to}`)
      console.log(`Self-destructs at ${result.session.expiresAt} (grant ${result.grantId} dies with it)`)
      return
    }

    case "sessions": {
      const s = await control(port, "GET", "/agentina/v1/status")
      const sessions = s.sessions ?? []
      if (!sessions.length) return console.log("No sessions.")
      for (const x of sessions) {
        const left = x.expiresAt ? Math.max(0, Math.round((Date.parse(x.expiresAt) - Date.now()) / 1000)) : "-"
        console.log(`${x.id} [${x.status}] agents=[${x.ephemeralAgents.join(",")}] ${x.status === "active" ? `${left}s left` : `closed ${x.closedAt ?? ""}`}`)
      }
      return
    }

    case "session-close": {
      if (!positional[0]) throw new Error("Usage: agentina session-close <id>")
      await control(port, "POST", "/agentina/v1/sessions/close", { id: positional[0] })
      console.log(`Session ${positional[0]} closed — its agents are gone, its grants revoked`)
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

    case "scenarios": {
      const { scenarios } = await control(port, "GET", "/agentina/v1/scenarios")
      for (const s of scenarios) {
        console.log(`\n${s.title} — ${s.tagline}`)
        s.roles.forEach((role: string, i: number) => {
          const steps = s.steps[i]
          console.log(`  as ${role}: ${steps.length ? steps.map((st: any) => st.title).join(" → ") : "nothing to set up — the other side shares"}`)
        })
      }
      console.log(`\nRun any of these guided from the console: http://127.0.0.1:${port}/`)
      return
    }

    case "status": {
      const s = await control(port, "GET", "/agentina/v1/status")
      console.log(`Party:    ${s.party.name} (${s.party.id})`)
      console.log(`URL:      ${s.url}   protocol ${s.protocol}`)
      console.log(`Agents:   ${s.agents.map((a: any) => (typeof a === "string" ? a : `${a.id}(${a.adapter})`)).join(", ") || "none"}`)
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
