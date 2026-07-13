import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http"
import type {
  AgentCard, Party, PartyKind,
  InvitePayload, PairCompleteRequest, PairCompleteResponse, PingResponse,
} from "@agentina-mesh/protocol"
import { PROTOCOL_VERSION } from "@agentina-mesh/protocol"
import { Mesh, encodeInvite, decodeInvite, type PeerRef } from "@agentina-mesh/peer"
import { decideAuth, CredentialStore, mintToken, JsonlAuditLog } from "@agentina-mesh/grants"
import { NodeState } from "./state"
import { EchoAdapter, type AgentAdapter } from "./adapter"

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
   *  Defaults to http://127.0.0.1:<port> — fine for demos, must be a
   *  routable address (Tailscale/WireGuard/WAN) for real pairing. */
  url?: string
  adapter?: AgentAdapter
  /** Exempt loopback callers from party auth (local CLI / console).
   *  Default true; set false on shared hosts — control endpoints then
   *  become unreachable and the node is driven via its API/methods. */
  trustLoopback?: boolean
  log?: (...args: unknown[]) => void
}

export class AgentinaNode {
  readonly state: NodeState
  readonly audit: JsonlAuditLog
  readonly credentials: CredentialStore
  readonly mesh: Mesh
  private adapter: AgentAdapter
  private server?: Server
  private log: (...args: unknown[]) => void
  private trustLoopback: boolean
  readonly port: number

  constructor(opts: AgentinaNodeOptions) {
    this.port = opts.port
    this.trustLoopback = opts.trustLoopback !== false
    this.log = opts.log ?? console.error.bind(console, "[agentina]")
    const url = opts.url ?? `http://127.0.0.1:${opts.port}`
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
    this.adapter = opts.adapter ?? new EchoAdapter()
    this.mesh = new Mesh(
      { peers: this.state.data.peers, healthCheck: { interval: 30, timeout: 10 } },
      this.log,
    )
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
      this.server!.listen(this.port, "127.0.0.1", resolve)
    })
    await this.mesh.start()
    this.log(`node up — party "${this.party.name}" (${this.party.id}) on 127.0.0.1:${this.port}`)
  }

  async stop(): Promise<void> {
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
        // M1 inserts enforceGrant() here: callerParty → allowed agentIds + scopes.
        const result = await this.adapter.execute(offer, {
          message: String(body.message ?? ""),
          fromPartyId: callerParty,
          senderAgentId: body.senderAgentId ? String(body.senderAgentId) : undefined,
          context: (body.context as Record<string, unknown>) ?? undefined,
        })
        this.audit.append({ kind: "task", decision: "allowed", partyId: callerParty, agentId: offer.id })
        return this.json(res, 200, { content: result.content })
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
      case "POST /agentina/v1/test": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        const body = await this.readBody(req)
        const result = await this.ping(String(body.peer ?? ""))
        return this.json(res, 200, result)
      }
      case "GET /agentina/v1/status": {
        if (callerParty !== "local") return this.json(res, 403, { error: "control endpoints are local-only" })
        return this.json(res, 200, {
          party: this.party,
          url: this.state.data.url,
          protocol: PROTOCOL_VERSION,
          agents: this.state.data.agents.map((a) => a.id),
          peers: this.mesh.directory(),
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
