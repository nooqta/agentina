import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http"
import type {
  AgentCard, Party, PartyKind, Scope, AgentOffer, CollabSession, AdapterSpec,
  InvitePayload, PairCompleteRequest, PairCompleteResponse, PingResponse,
} from "@agentina-mesh/protocol"
import { PROTOCOL_VERSION } from "@agentina-mesh/protocol"
import { Mesh, encodeInvite, decodeInvite, type PeerRef } from "@agentina-mesh/peer"
import { decideAuth, CredentialStore, mintToken, JsonlAuditLog, GrantStore, enforceGrant } from "@agentina-mesh/grants"
import { CONSOLE_HTML } from "@agentina-mesh/console"
import { ChannelRouter, TelegramAdapter, GitLabAdapter, type ChannelHost } from "@agentina-mesh/channels"
import { NodeState } from "./state"
import { EchoAdapter, type AgentAdapter } from "./adapter"
import { ScopedFsAdapter } from "./adapters/scoped-fs"
import { ClaudeCodeAdapter } from "./adapters/claude-code"
import { SshExecAdapter } from "./adapters/ssh-exec"
import { ScopedGitAdapter } from "./adapters/scoped-git"
import { newId } from "./state"
import { listSkillNames } from "./skills"
import { detectEnvironment, type Environment } from "./environment"
import { suggestDirs } from "./fs-suggest"
import { SCENARIOS } from "./scenarios"

// --- AgentinaNode: one party's node ---
//
// Serves the A2A surface (agent-card + /task) plus the agentina pairing
// and control endpoints. Every non-loopback request is attributed to a
// Party via its bearer credential before anything runs; every decision
// lands in the append-only audit log.

const INVITE_TTL_MS = 15 * 60 * 1000
const MAX_BODY_BYTES = 1024 * 1024

export interface AgentinaNodeOptions {
  stateDir: string
  port: number
  /** Party name used only when the state dir is fresh. */
  partyName?: string
  partyKind?: PartyKind
  /** Advertised URL peers use to reach this node (invites embed it).
   *  Defaults to http://<bind>:<port> when bind is a concrete address,
   *  else http://127.0.0.1:<port> — must be routable
   *  (Tailscale/WireGuard/WAN) for real cross-machine pairing. */
  url?: string
  /** Interface to listen on. Default 127.0.0.1 (local-only — demos,
   *  single-machine). For real collaboration bind the overlay-network
   *  address (e.g. the Tailscale 100.x IP). Binding wide is safe by
   *  design: every non-loopback request needs a party token, and the
   *  console/control surface refuses non-local callers outright. */
  bind?: string
  adapter?: AgentAdapter
  /** Exempt loopback callers from party auth (local CLI / console).
   *  Default true; set false on shared hosts — control endpoints then
   *  become unreachable and the node is driven via its API/methods. */
  trustLoopback?: boolean
  /** Session-reaper interval (ms). Default 30s; tests use ~100ms. */
  sessionSweepMs?: number
  log?: (...args: unknown[]) => void
}

export class AgentinaNode {
  readonly state: NodeState
  readonly audit: JsonlAuditLog
  readonly credentials: CredentialStore
  readonly grants: GrantStore
  readonly mesh: Mesh
  readonly channels: ChannelRouter
  private gitlabChannel?: GitLabAdapter
  private adapter: AgentAdapter
  private adapters = new Map<string, AgentAdapter>()
  private server?: Server
  private log: (...args: unknown[]) => void
  private trustLoopback: boolean
  private sessionSweeper?: ReturnType<typeof setInterval>
  private sessionSweepMsOpt: number
  private environment: Environment = detectEnvironment()
  readonly port: number
  readonly bind: string

  constructor(opts: AgentinaNodeOptions) {
    this.port = opts.port
    this.bind = opts.bind ?? "127.0.0.1"
    this.sessionSweepMsOpt = opts.sessionSweepMs ?? 30_000
    this.trustLoopback = opts.trustLoopback !== false
    this.log = opts.log ?? console.error.bind(console, "[agentina]")
    const advertisable = this.bind !== "127.0.0.1" && this.bind !== "0.0.0.0" && this.bind !== "::"
    const url = opts.url ?? `http://${advertisable ? this.bind : "127.0.0.1"}:${opts.port}`
    this.state = new NodeState(opts.stateDir, {
      partyName: opts.partyName ?? "unnamed-party",
      partyKind: opts.partyKind,
      url,
    })
    this.audit = new JsonlAuditLog(this.state.auditPath())
    this.credentials = new CredentialStore(this.state.data.credentials, (all) => {
      this.state.data.credentials = all
      this.state.save()
    })
    this.grants = new GrantStore(this.state.data.grants, (all) => {
      this.state.data.grants = all
      this.state.save()
    })
    this.adapter = opts.adapter ?? new EchoAdapter()
    this.mesh = new Mesh(
      { peers: this.state.data.peers, healthCheck: { interval: 30, timeout: 10 } },
      this.log,
    )

    // Channels: where humans talk. The router resolves @mentions to a
    // local agent or a mesh peer's skill; cross-boundary tasks carry
    // this party's peer token and the REMOTE side enforces its grants —
    // a channel mention never bypasses the trust boundary.
    const host: ChannelHost = {
      localAgentIds: () => this.state.data.agents.map((a) => a.id),
      executeLocal: async (agentId, message, context) => {
        const offer = this.state.data.agents.find((a) => a.id === agentId)
        if (!offer) throw new Error(`Unknown agent: ${agentId}`)
        const result = await this.resolveAdapter(offer).execute(offer, {
          message,
          fromPartyId: "local", // the owner connected this channel
          context,
        })
        this.audit.append({ kind: "task", decision: "allowed", partyId: "local", agentId, detail: `channel:${String(context.channel)}` })
        return result.content
      },
      peers: () =>
        this.mesh.directory().map((p) => ({
          peer: p.peer,
          healthy: p.healthy,
          skillIds: p.skills.map((s) => s.id),
        })),
      sendToPeer: (peer, agentId, message, context) =>
        this.mesh.sendTask(peer, message, agentId, { context }),
      audit: (entry) => this.audit.append(entry),
      log: this.log,
    }
    this.channels = new ChannelRouter(host)
    this.buildChannelsFromConfig()
  }

  /** Instantiate adapters declared in state.channels (secrets come from
   *  the env vars the config names — never from the state file). */
  private buildChannelsFromConfig(): void {
    const cfg = this.state.data.channels
    if (!cfg) return
    if (cfg.telegram) {
      const token = process.env[cfg.telegram.tokenEnv]
      if (token) {
        this.channels.attach(new TelegramAdapter({ token, allowedChats: cfg.telegram.allowedChats }, this.log))
      } else {
        this.log(`[channels] telegram configured but $${cfg.telegram.tokenEnv} is unset — skipped`)
      }
    }
    if (cfg.gitlab) {
      const token = process.env[cfg.gitlab.tokenEnv]
      if (token) {
        this.gitlabChannel = new GitLabAdapter(
          {
            host: cfg.gitlab.host,
            token,
            webhookSecret: cfg.gitlab.webhookSecretEnv ? process.env[cfg.gitlab.webhookSecretEnv] : undefined,
          },
          this.log,
        )
        this.channels.attach(this.gitlabChannel)
      } else {
        this.log(`[channels] gitlab configured but $${cfg.gitlab.tokenEnv} is unset — skipped`)
      }
    }
  }

  get party(): Party {
    return this.state.data.party
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((e) => {
        this.log(`handler error: ${e?.message || e}`)
        this.json(res, 500, { error: String(e?.message || e) })
      })
    })
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject)
      this.server!.listen(this.port, this.bind, resolve)
    })
    await this.mesh.start()
    // Channel startup failures (bad token, unreachable API) must not
    // kill the node — log and carry on; the mesh still works.
    try {
      await this.channels.start()
    } catch (e: any) {
      this.log(`[channels] start failed: ${e?.message || e}`)
    }
    this.sweepSessions() // reap anything that expired while the node was down
    this.sessionSweeper = setInterval(() => this.sweepSessions(), this.sessionSweepMsOpt)
    this.sessionSweeper.unref?.()
    // The ENOENT footgun, caught at startup instead of mid-conversation:
    // AI agents configured but no runtime on PATH.
    const aiAgents = this.state.data.agents.filter((a) => a.adapter?.kind === "claude-code")
    if (aiAgents.length && !this.environment.ai.claude.found) {
      this.log(`[environment] ${aiAgents.length} AI assistant(s) configured but Claude isn't installed — they will fail until it is. Install: ${this.environment.ai.installCommand}`)
    }
    this.log(`node up — party "${this.party.name}" (${this.party.id}) on 127.0.0.1:${this.port}`)
  }

  async stop(): Promise<void> {
    if (this.sessionSweeper) clearInterval(this.sessionSweeper)
    await this.channels.stop()
    await this.mesh.stop()
    await new Promise<void>((resolve) => this.server?.close(() => resolve()))
  }

  // ---------- pairing (both directions) ----------

  /** Mint a one-time invite and return the agentina://join/… link. */
  createInvite(): string {
    const token = mintToken()
    const now = Date.now()
    // Prune expired invites while we're here.
    this.state.data.pendingInvites = this.state.data.pendingInvites.filter(
      (i) => Date.parse(i.expiresAt) > now,
    )
    this.state.data.pendingInvites.push({
      token,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + INVITE_TTL_MS).toISOString(),
    })
    this.state.save()
    const payload: InvitePayload = {
      version: 2,
      url: this.state.data.url,
      inviteToken: token,
      partyName: this.party.name,
      protocol: PROTOCOL_VERSION,
    }
    return encodeInvite(payload)
  }

  /** Redeem an invite link against the inviter's node (invitee side). */
  async join(link: string): Promise<{ party: Party; url: string }> {
    const payload = decodeInvite(link)
    // Token the inviter will present when calling US.
    const theirTokenForUs = mintToken()
    const body: PairCompleteRequest = {
      inviteToken: payload.inviteToken,
      party: this.party,
      url: this.state.data.url,
      accessToken: theirTokenForUs,
      protocol: PROTOCOL_VERSION,
    }
    const res = await fetch(`${payload.url}/agentina/v1/pair/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      let detail = ""
      try { detail = ((await res.json()) as { error?: string }).error ?? "" } catch { /* */ }
      throw new Error(`pairing failed: ${res.status}${detail ? ` — ${detail}` : ""}`)
    }
    const reply = (await res.json()) as PairCompleteResponse

    this.credentials.issue(reply.party.id, {
      inboundToken: theirTokenForUs,
      outboundToken: reply.accessToken,
    })
    this.upsertPeer({
      name: reply.party.name,
      url: payload.url,
      token: reply.accessToken,
      partyId: reply.party.id,
    })
    this.audit.append({ kind: "pair", decision: "allowed", partyId: reply.party.id, detail: `joined ${reply.party.name} at ${payload.url}` })
    return { party: reply.party, url: payload.url }
  }

  /** Authenticated connection test against a paired peer. */
  async ping(peerName: string): Promise<{ party: Party; latencyMs: number }> {
    const peer = this.state.data.peers.find((p) => p.name === peerName)
    if (!peer) throw new Error(`Unknown peer: ${peerName}`)
    const started = Date.now()
    const res = await fetch(`${peer.url}/agentina/v1/ping`, {
      headers: peer.token ? { Authorization: `Bearer ${peer.token}` } : {},
    })
    if (!res.ok) throw new Error(`ping ${peerName} failed: ${res.status}`)
    const body = (await res.json()) as PingResponse
    return { party: body.party, latencyMs: Date.now() - started }
  }

  /** Send a task to a paired peer's agent (mesh path, health-gated). */
  async sendTask(peerName: string, message: string, agentId?: string): Promise<string> {
    return this.mesh.sendTask(peerName, message, agentId, { senderAgentId: undefined })
  }

  /** Register (or replace) an agent offer, optionally with its own
   *  adapter. Offers without a dedicated adapter fall back to the
   *  node-level default. */
  addAgent(offer: AgentOffer, adapter?: AgentAdapter): void {
    const agents = this.state.data.agents
    const idx = agents.findIndex((a) => a.id === offer.id)
    if (idx >= 0) agents[idx] = offer
    else agents.push(offer)
    this.state.save()
    if (adapter) this.adapters.set(offer.id, adapter)
  }

  /**
   * Open an ephemeral collaboration session: a temporary agent that
   * exists only for this engagement, plus a grant that dies with it.
   * The sweeper reaps both when the TTL lapses; `closeSession` ends it
   * early. "This agent will self-destruct."
   */
  openSession(opts: {
    toParty: string
    ttlSeconds: number
    agent: { id?: string; name?: string; adapter: AdapterSpec }
    scopes: Scope[]
  }): { session: CollabSession; offer: AgentOffer; grantId: string } {
    const partyId = this.resolvePartyId(opts.toParty)
    if (!partyId) throw new Error(`Unknown party or peer: ${opts.toParty}`)
    const sessionId = newId("s")
    const expiresAt = new Date(Date.now() + opts.ttlSeconds * 1000).toISOString()
    const agentId = opts.agent.id ?? `${opts.agent.adapter.kind}-${sessionId.slice(-6)}`
    const offer: AgentOffer = {
      id: agentId,
      partyId: this.party.id,
      name: opts.agent.name ?? `${agentId} (session)`,
      description: `Ephemeral session agent — self-destructs ${expiresAt}`,
      skills: [{ id: agentId, name: agentId, description: "session agent", tags: ["session", opts.agent.adapter.kind] }],
      lifecycle: { session: sessionId, ttlSeconds: opts.ttlSeconds },
      adapter: opts.agent.adapter,
    }
    this.addAgent(offer)
    const grant = this.grants.create({
      fromParty: this.party.id,
      toParty: partyId,
      agentIds: [agentId],
      scopes: opts.scopes,
      expiresAt,
    })
    const session: CollabSession = {
      id: sessionId,
      parties: [this.party.id, partyId],
      grants: [grant.id],
      ephemeralAgents: [agentId],
      status: "active",
      ttlSeconds: opts.ttlSeconds,
      createdAt: new Date().toISOString(),
      expiresAt,
    }
    this.state.data.sessions.push(session)
    this.state.save()
    this.audit.append({ kind: "session-open", decision: "allowed", partyId, grantId: grant.id, detail: `${sessionId}: agent ${agentId}, ttl ${opts.ttlSeconds}s` })
    return { session, offer, grantId: grant.id }
  }

  /** End a session now: its agents vanish, its grants are revoked. */
  closeSession(id: string, reason = "closed"): boolean {
    const session = this.state.data.sessions.find((s) => s.id === id && s.status === "active")
    if (!session) return false
    session.status = "closed"
    session.closedAt = new Date().toISOString()
    for (const agentId of session.ephemeralAgents) {
      this.state.data.agents = this.state.data.agents.filter((a) => a.id !== agentId)
      this.adapters.delete(agentId)
    }
    for (const grantId of session.grants) this.grants.revoke(grantId)
    this.state.save()
    this.audit.append({ kind: "session-close", decision: "allowed", partyId: session.parties[1], detail: `${id} (${reason})` })
    return true
  }

  /** Reap sessions whose TTL lapsed. Runs on an interval from start(). */
  private sweepSessions(): void {
    const now = Date.now()
    for (const s of this.state.data.sessions) {
      if (s.status === "active" && s.expiresAt && Date.parse(s.expiresAt) <= now) {
        this.closeSession(s.id, "ttl expired")
        this.log(`[sessions] ${s.id} self-destructed (ttl)`)
      }
    }
  }

  // ---------- shares: the human-level API ----------
  // Users think "share this folder with Badis, read-only, for a week" —
  // not "grant an agent an fs scope". A share creates the right agent
  // and grant (or a self-destructing session when a duration is given);
  // stopping it tears everything down. Grants/sessions stay the
  // enforcement truth underneath.

  createShare(opts: {
    peer: string
    kind: "folder" | "server" | "repo" | "agent"
    value: string
    /** For kind "agent": restrict access to this path inside the agent's workspace. */
    path?: string
    mode?: "ro" | "rw"
    durationSeconds?: number
  }): { id: string; agentId: string; expiresAt?: string } {
    const mode = opts.mode ?? "ro"

    // Sharing one of YOUR defined agents: the grant covers that agent,
    // scoped to the given path (or its whole workspace), and expires
    // with the duration. The agent itself is permanent — only the
    // counterparty's access is time-boxed.
    if (opts.kind === "agent") {
      const offer = this.state.data.agents.find((a) => a.id === opts.value)
      if (!offer) throw new Error(`Unknown agent: ${opts.value}`)
      const root = opts.path ?? offer.adapter?.baseRoot
      const scopes: Scope[] = root ? [{ kind: "fs", root, mode }] : []
      const expiresAt = opts.durationSeconds
        ? new Date(Date.now() + opts.durationSeconds * 1000).toISOString()
        : undefined
      const grant = this.grantAccess(opts.peer, [offer.id], scopes, expiresAt)
      return { id: grant.id, agentId: offer.id, expiresAt }
    }

    let adapter: AdapterSpec
    let scope: Scope
    if (opts.kind === "folder") {
      adapter = { kind: "scoped-fs", baseRoot: opts.value }
      scope = { kind: "fs", root: opts.value, mode }
    } else if (opts.kind === "server") {
      const [user, host] = opts.value.split("@")
      if (!user || !host) throw new Error("server share expects user@host")
      adapter = { kind: "ssh-exec" }
      scope = { kind: "ssh", host, user }
    } else {
      adapter = { kind: "scoped-git" }
      scope = { kind: "repo", url: opts.value, mode }
    }

    if (opts.durationSeconds) {
      const r = this.openSession({
        toParty: opts.peer,
        ttlSeconds: opts.durationSeconds,
        agent: { id: `${opts.kind}-${newId("x").slice(-6)}`, adapter },
        scopes: [scope],
      })
      return { id: r.session.id, agentId: r.offer.id, expiresAt: r.session.expiresAt }
    }

    const agentId = `${opts.kind}-${newId("x").slice(-6)}`
    this.addAgent({
      id: agentId,
      partyId: this.party.id,
      name: `${opts.kind}: ${opts.value}`,
      description: `Shared ${opts.kind} (${mode})`,
      skills: [{ id: agentId, name: agentId, description: `${opts.kind} share`, tags: [adapter.kind] }],
      lifecycle: "persistent",
      adapter,
    })
    const grant = this.grantAccess(opts.peer, [agentId], [scope])
    return { id: grant.id, agentId }
  }

  /** Friendly view of everything shared with a party (grants + sessions). */
  listShares(partyId: string): Array<Record<string, unknown>> {
    const sessionByGrant = new Map<string, CollabSession>()
    for (const s of this.state.data.sessions) for (const g of s.grants) sessionByGrant.set(g, s)
    return this.grants.list()
      .filter((g) => g.toParty === partyId)
      .map((g) => {
        const sc = g.scopes[0]
        const session = sessionByGrant.get(g.id)
        return {
          id: session ? session.id : g.id,
          agentId: g.agentIds[0],
          kind: sc?.kind === "fs" ? "folder" : sc?.kind === "ssh" ? "server" : sc?.kind === "repo" ? "repo" : "agent",
          value: sc?.kind === "fs" ? sc.root : sc?.kind === "ssh" ? `${sc.user}@${sc.host}` : sc?.kind === "repo" ? sc.url : g.agentIds.join(", "),
          mode: sc && "mode" in sc ? sc.mode : undefined,
          status: session ? session.status : g.status,
          expiresAt: g.expiresAt,
          temporary: Boolean(session),
        }
      })
  }

  /** Stop a share: sessions close (agent + grant die), plain grants are
   *  revoked and their dedicated share-agent removed. */
  stopShare(id: string): boolean {
    if (id.startsWith("s_")) return this.closeSession(id, "stopped by owner")
    const grant = this.grants.get(id)
    if (!grant || !this.grants.revoke(id)) return false
    for (const agentId of grant.agentIds) {
      const stillGranted = this.grants.list().some((g) => g.status === "active" && g.agentIds.includes(agentId))
      const isShareAgent = /^(folder|server|repo)-/.test(agentId)
      if (isShareAgent && !stillGranted) {
        this.state.data.agents = this.state.data.agents.filter((a) => a.id !== agentId)
        this.adapters.delete(agentId)
      }
    }
    this.state.save()
    this.audit.append({ kind: "grant-revoke", decision: "allowed", partyId: grant.toParty, grantId: id })
    return true
  }

  /** Owner-authored grant to a paired party (active immediately).
   *  `toParty` accepts a party id or a peer name. */
  grantAccess(toParty: string, agentIds: string[], scopes: Scope[], expiresAt?: string) {
    const partyId = this.resolvePartyId(toParty)
    if (!partyId) throw new Error(`Unknown party or peer: ${toParty}`)
    const grant = this.grants.create({ fromParty: this.party.id, toParty: partyId, agentIds, scopes, expiresAt })
    this.audit.append({ kind: "grant-create", decision: "allowed", partyId, grantId: grant.id, scopes, detail: `agents: ${agentIds.join(", ")}` })
    return grant
  }

  private resolvePartyId(nameOrId: string): string | undefined {
    if (nameOrId.startsWith("pt_")) return nameOrId
    return this.state.data.peers.find((p) => p.name === nameOrId)?.partyId
  }

  /** Programmatic registration wins; otherwise the offer's declarative
   *  AdapterSpec binds (and is cached); Echo is the fallback. */
  private resolveAdapter(offer: AgentOffer): AgentAdapter {
    const registered = this.adapters.get(offer.id)
    if (registered) return registered
    if (offer.adapter) {
      let built: AgentAdapter
      switch (offer.adapter.kind) {
        case "scoped-fs":
          built = new ScopedFsAdapter(offer.adapter.baseRoot ?? this.state.stateDir)
          break
        case "claude-code":
          built = new ClaudeCodeAdapter({
            baseRoot: offer.adapter.baseRoot,
            model: offer.adapter.model,
            systemPrompt: offer.adapter.systemPrompt,
          })
          break
        case "ssh-exec":
          built = new SshExecAdapter()
          break
        case "scoped-git":
          built = new ScopedGitAdapter()
          break
        default:
          built = new EchoAdapter()
      }
      this.adapters.set(offer.id, built)
      return built
    }
    return this.adapter
  }

  private upsertPeer(peer: PeerRef): void {
    const peers = this.state.data.peers
    const idx = peers.findIndex((p) => p.name === peer.name)
    if (idx >= 0) peers[idx] = peer
    else peers.push(peer)
    this.state.save()
    void this.mesh.reloadPeers({ peers, healthCheck: { interval: 30, timeout: 10 } })
  }

  // ---------- HTTP surface ----------

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "/").split("?")[0]
    const route = `${req.method} ${path}`

    // Public: discovery.
    if (route === "GET /.well-known/agent-card.json") {
      return this.json(res, 200, this.agentCard())
    }

    // Public: invite redemption (the one-time token IS the auth).
    if (route === "POST /agentina/v1/pair/complete") {
      return this.handlePairComplete(req, res)
    }

    // Public: GitLab webhook — X-Gitlab-Token is its auth; the adapter
    // verifies it and returns 401 on mismatch.
    if (route === "POST /channels/gitlab/webhook") {
      if (!this.gitlabChannel) return this.json(res, 404, { error: "gitlab channel not configured" })
      const body = await this.readBody(req)
      const status = this.gitlabChannel.handleWebhook(req.headers, body)
      return this.json(res, status, { ok: status < 400 })
    }

    // Everything else requires attribution (party token or loopback).
    const decision = decideAuth({
      remoteAddress: req.socket.remoteAddress ?? "",
      authorizationHeader: String(req.headers.authorization ?? ""),
      resolveToken: (t) => this.credentials.resolve(t),
      trustLoopback: this.trustLoopback,
    })
    if (!decision.allowed) {
      this.audit.append({ kind: "auth-denied", decision: "denied", reason: decision.reason, detail: route })
      return this.json(res, 401, { error: "Unauthorized: agentina party token required (Authorization: Bearer …)" })
    }
    const callerParty = decision.reason === "party" ? decision.partyId : "local"

    switch (route) {
      // The console is the control surface in a browser — same trust
      // model as the control endpoints (loopback / attributed party).
      case "GET /":
      case "GET /console": {
        if (callerParty !== "local") return this.json(res, 403, { error: "the console is local-only" })
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        res.end(CONSOLE_HTML)
        return
      }

      case "GET /agentina/v1/ping": {
        this.audit.append({ kind: "ping", decision: "allowed", partyId: callerParty })
        const body: PingResponse = {
          party: this.party,
          protocol: PROTOCOL_VERSION,
          now: new Date().toISOString(),
          you: callerParty,
        }
        return this.json(res, 200, body)
      }

      case "POST /task": {
        const body = await this.readBody(req)
        const agentId = String(body.agent ?? "") || this.state.data.agents[0]?.id
        const offer = this.state.data.agents.find((a) => a.id === agentId)
        if (!offer) {
          this.audit.append({ kind: "task", decision: "denied", partyId: callerParty, agentId, reason: "unknown-agent" })
          return this.json(res, 404, { error: `Unknown agent: ${agentId}` })
        }

        // Grant enforcement — the security boundary. Pairing alone grants
        // NOTHING: a remote party needs an active grant covering this agent,
        // and that grant's scopes become the task's policy (the jail the
        // adapter enforces as defense-in-depth).
        let policy: { grantId: string; scopes: Scope[] } | undefined
        if (callerParty !== "local") {
          const decision = enforceGrant(this.grants.activeFor(callerParty), offer.id)
          if (!decision.allowed) {
            this.audit.append({ kind: "task", decision: "denied", partyId: callerParty, agentId: offer.id, reason: decision.reason })
            return this.json(res, 403, { error: `Forbidden: ${decision.reason} — ask ${this.party.name} to grant access to agent "${offer.id}"` })
          }
          policy = { grantId: decision.grant.id, scopes: decision.grant.scopes }
        }

        const adapter = this.resolveAdapter(offer)
        try {
          const result = await adapter.execute(offer, {
            message: String(body.message ?? ""),
            fromPartyId: callerParty,
            policy,
            senderAgentId: body.senderAgentId ? String(body.senderAgentId) : undefined,
            context: (body.context as Record<string, unknown>) ?? undefined,
          })
          this.audit.append({ kind: "task", decision: "allowed", partyId: callerParty, agentId: offer.id, grantId: policy?.grantId, scopes: policy?.scopes })
          return this.json(res, 200, { content: result.content })
        } catch (e: any) {
          // Scope denials from the adapter are policy decisions, not crashes —
          // audit them as denied tasks and surface the reason.
          const msg = String(e?.message || e)
          const isDenial = msg.startsWith("denied:")
          this.audit.append({ kind: "task", decision: "denied", partyId: callerParty, agentId: offer.id, grantId: policy?.grantId, reason: isDenial ? "scope-denied" : "adapter-error", detail: msg.slice(0, 200) })
          return this.json(res, isDenial ? 403 : 500, { error: msg })
        }
      }

      // ----- grants: the counterparty-visible surface -----
      case "GET /agentina/v1/grants": {
        if (callerParty === "local") return this.json(res, 200, { grants: this.grants.list() })
        // A party sees exactly what was extended to THEM — nothing else.
        return this.json(res, 200, { grants: this.grants.activeFor(callerParty) })
      }
      case "POST /agentina/v1/grants": {
        const body = await this.readBody(req)
        const agentIds = Array.isArray(body.agentIds) ? body.agentIds.map(String) : []
        const scopes = (Array.isArray(body.scopes) ? body.scopes : []) as Scope[]
        const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : undefined
        if (callerParty === "local") {
          const grant = this.grantAccess(String(body.toParty ?? ""), agentIds, scopes, expiresAt)
          return this.json(res, 201, grant)
        }
        // A remote party PROPOSES; the owner approves from their side.
        const proposed = this.grants.propose({ fromParty: this.party.id, toParty: callerParty, agentIds, scopes, expiresAt })
        this.audit.append({ kind: "grant-create", decision: "allowed", partyId: callerParty, grantId: proposed.id, reason: "proposed", scopes })
        return this.json(res, 202, proposed)
      }

      // ----- loopback-only control surface (CLI / local console) -----
      case "POST /agentina/v1/invites": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        return this.json(res, 200, { link: this.createInvite() })
      }
      case "POST /agentina/v1/join": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const joined = await this.join(String(body.link ?? ""))
        return this.json(res, 200, joined)
      }
      case "POST /agentina/v1/shares": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const kind = String(body.kind ?? "")
        if (!body.peer || !["agent", "folder", "server", "repo"].includes(kind) || !body.value) {
          return this.json(res, 400, { error: "Missing: peer, kind (agent|folder|server|repo), value" })
        }
        const share = this.createShare({
          peer: String(body.peer),
          kind: kind as "agent" | "folder" | "server" | "repo",
          value: String(body.value),
          path: body.path ? String(body.path) : undefined,
          mode: body.mode === "rw" ? "rw" : "ro",
          durationSeconds: body.durationSeconds ? Number(body.durationSeconds) : undefined,
        })
        return this.json(res, 201, share)
      }
      case "GET /agentina/v1/shares": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const url = new URL(req.url ?? "/", "http://x")
        const peerName = url.searchParams.get("peer") ?? ""
        const partyId = this.resolvePartyId(peerName)
        if (!partyId) return this.json(res, 404, { error: `Unknown peer: ${peerName}` })
        return this.json(res, 200, { shares: this.listShares(partyId) })
      }
      case "POST /agentina/v1/shares/stop": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        if (!this.stopShare(String(body.id ?? ""))) return this.json(res, 404, { error: "No active share with that id" })
        return this.json(res, 200, { stopped: body.id })
      }

      case "POST /agentina/v1/sessions": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const ttlSeconds = Number(body.ttlSeconds ?? 0)
        if (!body.toParty || !ttlSeconds || !body.agent) {
          return this.json(res, 400, { error: "Missing: toParty, ttlSeconds, agent {adapter}" })
        }
        const result = this.openSession({
          toParty: String(body.toParty),
          ttlSeconds,
          agent: body.agent as { id?: string; name?: string; adapter: AdapterSpec },
          scopes: (Array.isArray(body.scopes) ? body.scopes : []) as Scope[],
        })
        return this.json(res, 201, result)
      }
      case "POST /agentina/v1/sessions/close": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        if (!this.closeSession(String(body.id ?? ""), "closed by owner")) {
          return this.json(res, 404, { error: "No active session with that id" })
        }
        return this.json(res, 200, { closed: body.id })
      }

      case "POST /agentina/v1/channels": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const kind = String(body.kind ?? "")
        const channels = (this.state.data.channels ??= {})
        if (kind === "telegram") {
          if (!body.tokenEnv) return this.json(res, 400, { error: "Missing: tokenEnv" })
          channels.telegram = {
            tokenEnv: String(body.tokenEnv),
            ...(Array.isArray(body.allowedChats) ? { allowedChats: body.allowedChats.map(String) } : {}),
          }
        } else if (kind === "gitlab") {
          if (!body.host || !body.tokenEnv) return this.json(res, 400, { error: "Missing: host, tokenEnv" })
          channels.gitlab = {
            host: String(body.host),
            tokenEnv: String(body.tokenEnv),
            ...(body.webhookSecretEnv ? { webhookSecretEnv: String(body.webhookSecretEnv) } : {}),
          }
        } else {
          return this.json(res, 400, { error: `Unknown channel kind: ${kind} (telegram | gitlab)` })
        }
        this.state.save()
        return this.json(res, 201, { configured: kind, note: "restart the node to start the channel" })
      }

      case "POST /agentina/v1/agents": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const id = String(body.id ?? "")
        if (!id) return this.json(res, 400, { error: "Missing: id" })
        const name = String(body.name ?? id)
        // Accept both the raw adapter object and the friendly agent
        // fields (provider/workspace/prompt/model) the console sends.
        const raw = (body.adapter ?? {}) as Partial<AdapterSpec>
        const adapterSpec: AdapterSpec = {
          kind: (raw.kind ?? (body.provider as AdapterSpec["kind"]) ?? "claude-code"),
          baseRoot: raw.baseRoot ?? (body.workspace ? String(body.workspace) : undefined),
          model: raw.model ?? (body.model ? String(body.model) : undefined),
          systemPrompt: raw.systemPrompt ?? (body.systemPrompt ? String(body.systemPrompt) : undefined),
        }
        const skillNames = adapterSpec.baseRoot ? listSkillNames(adapterSpec.baseRoot) : []
        const offer: AgentOffer = {
          id,
          partyId: this.party.id,
          name,
          description: String(body.description ?? adapterSpec.systemPrompt?.slice(0, 120) ?? `${name} — offered by ${this.party.name}`),
          skills: [
            { id, name, description: String(body.description ?? name), tags: [adapterSpec.kind] },
            ...skillNames.map((s) => ({ id: `${id}:${s}`, name: s, description: `skill file ${s}`, tags: ["skill"] })),
          ],
          lifecycle: "persistent",
          adapter: adapterSpec,
        }
        this.addAgent(offer)
        return this.json(res, 201, offer)
      }

      case "GET /agentina/v1/scenarios": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        return this.json(res, 200, { scenarios: SCENARIOS })
      }

      case "POST /agentina/v1/environment/refresh": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        this.environment = detectEnvironment()
        return this.json(res, 200, { environment: this.environment })
      }

      case "GET /agentina/v1/fs/suggest": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const url = new URL(req.url ?? "/", "http://x")
        const dirs = suggestDirs(url.searchParams.get("path") ?? "")
        // Recent workspaces from agents + folder shares make the best quick picks.
        const recent = new Set<string>()
        for (const a of this.state.data.agents) if (a.adapter?.baseRoot) recent.add(a.adapter.baseRoot)
        for (const g of this.grants.list()) for (const sc of g.scopes) if (sc.kind === "fs") recent.add(sc.root)
        return this.json(res, 200, {
          dirs,
          quickPicks: [
            ...Array.from(recent).slice(-4).map((p) => ({ label: p.split("/").pop() || p, path: p })),
            ...this.environment.quickPicks,
          ],
        })
      }

      case "POST /agentina/v1/ui": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const mode = body.mode === "advanced" ? "advanced" : "simple"
        this.state.data.ui = { mode }
        this.state.save()
        return this.json(res, 200, { mode })
      }

      // "What am I allowed to do at this peer?" — fetch the grants the
      // counterparty extended to US (their node answers with exactly
      // that, party-scoped), plus their advertised agents. This is what
      // makes the console legible from the asking side.
      case "GET /agentina/v1/peer-grants": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const url = new URL(req.url ?? "/", "http://x")
        const peerName = url.searchParams.get("peer") ?? ""
        const peer = this.state.data.peers.find((p) => p.name === peerName)
        if (!peer) return this.json(res, 404, { error: `Unknown peer: ${peerName}` })
        let grantedToMe: unknown[] = []
        try {
          const r = await fetch(`${peer.url}/agentina/v1/grants`, {
            headers: peer.token ? { Authorization: `Bearer ${peer.token}` } : {},
            signal: AbortSignal.timeout(10_000),
          })
          if (r.ok) grantedToMe = ((await r.json()) as { grants?: unknown[] }).grants ?? []
        } catch { /* peer unreachable — return what we know */ }
        const dir = this.mesh.directory().find((p) => p.peer === peerName)
        return this.json(res, 200, {
          peer: peerName,
          healthy: dir?.healthy ?? false,
          agents: dir?.skills ?? [],
          grantedToMe,
        })
      }

      case "POST /agentina/v1/task": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const peerName = String(body.peer ?? "")
        // A just-paired peer may not have been health-probed yet — refresh
        // on demand so the operator's first task doesn't race the timer.
        const dir = this.mesh.directory().find((p) => p.peer === peerName)
        if (dir && !dir.healthy) await this.mesh.refreshPeer(peerName)
        const content = await this.mesh.sendTask(
          peerName,
          String(body.message ?? ""),
          body.agent ? String(body.agent) : undefined,
        )
        return this.json(res, 200, { content })
      }

      case "POST /agentina/v1/test": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const result = await this.ping(String(body.peer ?? ""))
        return this.json(res, 200, result)
      }
      case "POST /agentina/v1/grants/approve": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const approved = this.grants.approve(String(body.id ?? ""))
        if (!approved) return this.json(res, 404, { error: "No proposed grant with that id" })
        this.audit.append({ kind: "grant-create", decision: "allowed", partyId: approved.toParty, grantId: approved.id, reason: "approved", scopes: approved.scopes })
        return this.json(res, 200, approved)
      }
      case "POST /agentina/v1/grants/revoke": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const id = String(body.id ?? "")
        const grant = this.grants.get(id)
        if (!this.grants.revoke(id)) return this.json(res, 404, { error: "No active grant with that id" })
        this.audit.append({ kind: "grant-revoke", decision: "allowed", partyId: grant?.toParty, grantId: id })
        return this.json(res, 200, { revoked: id })
      }

      case "GET /agentina/v1/status": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        return this.json(res, 200, {
          party: this.party,
          url: this.state.data.url,
          protocol: PROTOCOL_VERSION,
          agents: this.state.data.agents.map((a) => ({
            id: a.id,
            name: a.name,
            adapter: a.adapter?.kind ?? "echo",
            workspace: a.adapter?.baseRoot,
            model: a.adapter?.model,
            hasPrompt: Boolean(a.adapter?.systemPrompt),
            skillFiles: a.adapter?.baseRoot ? listSkillNames(a.adapter.baseRoot) : [],
            session: typeof a.lifecycle === "object" ? a.lifecycle.session : undefined,
          })),
          peers: this.mesh.directory(),
          grants: this.grants.list(),
          sessions: this.state.data.sessions,
          channels: this.channels.channelNames(),
          channelsConfig: this.state.data.channels ?? {},
          environment: this.environment,
          ui: this.state.data.ui ?? { mode: "simple" },
          audit: this.audit.tail(20),
        })
      }
    }

    return this.json(res, 404, { error: `No route: ${route}` })
  }

  private async handlePairComplete(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = (await this.readBody(req)) as unknown as PairCompleteRequest
    const now = Date.now()
    const pending = this.state.data.pendingInvites.find(
      (i) => i.token === body.inviteToken && Date.parse(i.expiresAt) > now,
    )
    if (!pending || !body.party?.id || !body.url || !body.accessToken) {
      this.audit.append({ kind: "pair", decision: "denied", reason: "invalid-or-expired-invite" })
      return this.json(res, 401, { error: "Invalid or expired invite token" })
    }
    // One-time: consume before minting anything.
    this.state.data.pendingInvites = this.state.data.pendingInvites.filter((i) => i.token !== body.inviteToken)

    // Token the invitee will present when calling US.
    const theirTokenForUs = mintToken()
    this.credentials.issue(body.party.id, {
      inboundToken: theirTokenForUs,
      // Token WE present when calling the invitee — they minted it for us.
      outboundToken: body.accessToken,
    })
    this.upsertPeer({ name: body.party.name, url: body.url, token: body.accessToken, partyId: body.party.id })
    this.audit.append({ kind: "pair", decision: "allowed", partyId: body.party.id, detail: `paired with ${body.party.name} at ${body.url}` })

    const reply: PairCompleteResponse = {
      party: this.party,
      accessToken: theirTokenForUs,
      protocol: PROTOCOL_VERSION,
    }
    return this.json(res, 200, reply)
  }

  private agentCard(): AgentCard & { party: Party; protocol: string } {
    return {
      name: this.party.name,
      description: `agentina node owned by ${this.party.name}`,
      url: this.state.data.url,
      version: "0.1.0",
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
      skills: this.state.data.agents.flatMap((a) => a.skills.map((s) => ({ ...s, id: a.id }))),
      defaultInputModes: ["text"],
      defaultOutputModes: ["text"],
      party: this.party,
      protocol: PROTOCOL_VERSION,
    }
  }

  private readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks: Buffer[] = []
      req.on("data", (c: Buffer) => {
        size += c.length
        if (size > MAX_BODY_BYTES) {
          reject(new Error("body too large"))
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on("end", () => {
        if (chunks.length === 0) return resolve({})
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")))
        } catch {
          reject(new Error("invalid JSON body"))
        }
      })
      req.on("error", reject)
    })
  }

  private json(res: ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json", "X-Agentina-Version": PROTOCOL_VERSION })
    res.end(JSON.stringify(data, null, 2))
  }
}
