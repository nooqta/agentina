import type { AgentCard, AgentSkill } from "@agentina-mesh/protocol"
import { seal, open } from "@agentina-mesh/protocol"
import { A2AClient } from "./client"
import { Agent as UndiciAgent, fetch as undiciFetch } from "undici"

// --- Mesh: peer registry, health checks, agent directory, task exchange ---
// Extracted from agentx src/a2a/mesh.ts. The one structural change: the
// constructor takes a standalone MeshConfig instead of the host daemon's
// whole config. Method signatures are kept identical to agentx A2AMesh so
// the host can swap implementations with zero call-site churn.

/** A peer node in the mesh. `partyId` is additive (agentina); agentx
 *  peers without it keep working. */
export interface PeerRef {
  name: string
  url: string
  /** Bearer token THIS node presents when calling the peer. */
  token?: string
  /** Party that owns the peer node (agentina pairing sets this). */
  partyId?: string
  /** Peer's Curve25519 public key (base64) — set at pairing, used to
   *  seal the E2E box on every call to them. */
  publicKey?: string
}

export interface MeshConfig {
  peers: PeerRef[]
  healthCheck?: {
    /** Seconds between probes (default 60). */
    interval?: number
    /** Probe timeout in seconds (default 10). */
    timeout?: number
  }
  discovery?: "static"
  /** This node's identity for E2E sealed boxes. When set and a peer has a
   *  publicKey, task calls are sealed to that peer and box-authenticated;
   *  otherwise they fall back to the bearer-token path. */
  identity?: { partyId: string; secretKey: string }
}

/** Custom undici dispatcher used by sendTask: peer agent calls can
 *  block writing response headers for the full duration of the agent
 *  run (often 5–30 min), so the default 300s headersTimeout has to be
 *  disabled. AbortController on the call site enforces our actual cap. */
const longTaskDispatcher = new UndiciAgent({
  headersTimeout: 0,
  bodyTimeout: 0,
})

export interface PeerState {
  peer: PeerRef
  client: A2AClient
  healthy: boolean
  lastCheck?: Date
  agentCard?: AgentCard
  agents: AgentSkill[]
  /** Count of back-to-back failed health probes since the last successful one.
   *  Used to suppress transient flaps: the `healthy` flag only flips to false
   *  after N consecutive failures (see UNHEALTHY_AFTER). Reset to 0 on success. */
  consecutiveFailures: number
  /** Last probe error message — surfaced for debugging. */
  lastError?: string
}

/** Number of consecutive failed probes required before we mark a peer
 *  unhealthy. A busy remote node whose event loop stalls for one probe
 *  cycle would otherwise flip to "unreachable" and back on the next
 *  tick. With hysteresis, a single slow probe is tolerated; only
 *  sustained unreachability actually flips the flag. */
const UNHEALTHY_AFTER = 3

export class Mesh {
  private peers: Map<string, PeerState> = new Map()
  private healthTimer?: ReturnType<typeof setInterval>
  private config: MeshConfig
  private log: (...args: unknown[]) => void
  /** Optional callback fired on peer state transitions (recovered /
   *  lost / skills changed). The host wires this to its event bus. */
  private peerChangeCallback?: (event: {
    peer: string; healthy: boolean; skills: string[]; delta: "recovered" | "lost" | "skills-changed"
  }) => void

  /** Register a listener for peer state transitions. Only one listener
   *  is kept — repeat calls overwrite. */
  onPeerChange(cb: typeof Mesh.prototype.peerChangeCallback): void {
    this.peerChangeCallback = cb
  }

  constructor(
    config: MeshConfig,
    log: (...args: unknown[]) => void = console.error.bind(console, "[mesh]"),
  ) {
    this.config = config
    this.log = log

    for (const peer of config.peers) {
      this.peers.set(peer.name, {
        peer,
        client: new A2AClient(peer.url, peer.token),
        healthy: false,
        agents: [],
        consecutiveFailures: 0,
      })
    }
  }

  /**
   * Start the mesh: discover peers and begin health checks.
   */
  async start(): Promise<void> {
    this.log(`Mesh starting with ${this.peers.size} peer(s)`)

    // Initial discovery
    await this.discoverAll()

    // Periodic health checks
    const interval = (this.config.healthCheck?.interval ?? 60) * 1000
    this.healthTimer = setInterval(() => this.discoverAll(), interval)
    this.healthTimer.unref?.()
  }

  async stop(): Promise<void> {
    if (this.healthTimer) {
      clearInterval(this.healthTimer)
    }
  }

  /** Hot-reload the peer set from a fresh config. Adds new peers (kicks off
   *  immediate discovery), removes vanished ones, and rebuilds the A2AClient
   *  for peers whose url or token changed. Health-check interval is honored
   *  on the next tick — we don't reset the timer just for peer-set edits.
   *  Returns the diff for the caller to log. */
  async reloadPeers(next: MeshConfig): Promise<{ added: string[]; removed: string[]; updated: string[] }> {
    this.config = next
    const oldIds = new Set(this.peers.keys())
    const newPeers = new Map(next.peers.map((p) => [p.name, p] as const))
    const added: string[] = []
    const removed: string[] = []
    const updated: string[] = []

    // Remove vanished peers.
    for (const id of oldIds) {
      if (!newPeers.has(id)) {
        this.peers.delete(id)
        removed.push(id)
      }
    }

    // Add or update the rest.
    const rediscover: Array<[string, PeerState]> = []
    for (const [id, peer] of newPeers) {
      const existing = this.peers.get(id)
      if (!existing) {
        const state: PeerState = {
          peer,
          client: new A2AClient(peer.url, peer.token),
          healthy: false,
          agents: [],
          consecutiveFailures: 0,
        }
        this.peers.set(id, state)
        added.push(id)
        rediscover.push([id, state])
        continue
      }
      // URL or token changed — rebuild the client and redo discovery.
      if (existing.peer.url !== peer.url || existing.peer.token !== peer.token) {
        existing.peer = peer
        existing.client = new A2AClient(peer.url, peer.token)
        existing.healthy = false
        existing.consecutiveFailures = 0 // fresh client; old counter is stale
        updated.push(id)
        rediscover.push([id, existing])
      } else {
        existing.peer = peer // pick up metadata edits (partyId, ...)
      }
    }

    // Immediate discovery for changed/new peers — instant feedback on reload.
    if (rediscover.length) {
      await Promise.allSettled(rediscover.map(([id, state]) => this.discoverPeer(id, state)))
    }

    return { added, removed, updated }
  }

  /** Number of peers currently registered (regardless of health). */
  peerCount(): number {
    return this.peers.size
  }

  /**
   * Re-probe a single peer immediately. Use case: an operator just added
   * an agent on the remote node and doesn't want to wait up to a full
   * health-check interval before the new agent resolves. Returns true on
   * success, false when the peer is unknown or the probe failed. Does NOT
   * throw — callers can blindly fan-out across peers.
   */
  async refreshPeer(name: string): Promise<boolean> {
    const state = this.peers.get(name)
    if (!state) return false
    await this.discoverPeer(name, state)
    return state.healthy
  }

  /**
   * Re-probe every peer in parallel. Cheap when peers are healthy
   * (single agent-card GET per peer).
   */
  async refreshAll(): Promise<{ name: string; healthy: boolean }[]> {
    const probes = Array.from(this.peers.entries()).map(async ([name, state]) => {
      await this.discoverPeer(name, state)
      return { name, healthy: state.healthy }
    })
    return Promise.all(probes)
  }

  /**
   * Discover agent cards from all peers.
   */
  async discoverAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.peers.entries()).map(([name, state]) =>
        this.discoverPeer(name, state),
      ),
    )

    const healthy = Array.from(this.peers.values()).filter((p) => p.healthy).length
    this.log(`Discovery complete: ${healthy}/${this.peers.size} peers healthy`)
  }

  private async discoverPeer(name: string, state: PeerState): Promise<void> {
    const timeout = (this.config.healthCheck?.timeout ?? 10) * 1000

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)

      const card = await state.client.getAgentCard()
      clearTimeout(timer)

      // Success — clear failure counter, flip healthy on if it was off.
      const wasDown = !state.healthy
      const prevSkills = new Set(state.agents.map((a) => a.id))
      state.healthy = true
      state.lastCheck = new Date()
      state.agentCard = card
      state.agents = card.skills || []
      state.consecutiveFailures = 0
      state.lastError = undefined
      const nextSkills = new Set(state.agents.map((a) => a.id))
      const skillsChanged = prevSkills.size !== nextSkills.size || [...nextSkills].some((s) => !prevSkills.has(s))

      if (wasDown) {
        this.log(`Peer "${name}" recovered: ${card.name} (${state.agents.length} skills)`)
        this.peerChangeCallback?.({ peer: name, healthy: true, skills: [...nextSkills], delta: "recovered" })
      } else if (skillsChanged) {
        this.peerChangeCallback?.({ peer: name, healthy: true, skills: [...nextSkills], delta: "skills-changed" })
      }
    } catch (e: any) {
      state.lastCheck = new Date()
      state.lastError = e.message
      state.consecutiveFailures++
      // Hysteresis: require UNHEALTHY_AFTER consecutive failures before
      // flipping the flag.
      if (state.consecutiveFailures >= UNHEALTHY_AFTER && state.healthy) {
        state.healthy = false
        this.log(`Peer "${name}" unreachable (${state.consecutiveFailures} consecutive failures): ${e.message}`)
        this.peerChangeCallback?.({ peer: name, healthy: false, skills: state.agents.map((a) => a.id), delta: "lost" })
      } else if (state.consecutiveFailures < UNHEALTHY_AFTER) {
        this.log(`Peer "${name}" probe failed (${state.consecutiveFailures}/${UNHEALTHY_AFTER}): ${e.message}`)
      }
    }
  }

  /**
   * Send a task to a remote peer by name. POSTs to the peer's /task
   * endpoint. If no agent specified, uses the first available agent on
   * the peer.
   */
  async sendTask(
    peerName: string,
    text: string,
    agentId?: string,
    opts: {
      timeoutMs?: number
      /** Identity of the agent on whose behalf this call is made. */
      senderAgentId?: string
      /** Force a fresh session on the receiving node. */
      freshSession?: boolean
      /** Origin context — channel, chatId, sender, etc. Forwarded verbatim. */
      context?: Record<string, unknown>
    } = {},
  ): Promise<string> {
    const state = this.peers.get(peerName)
    if (!state) throw new Error(`Unknown peer: ${peerName}`)
    if (!state.healthy) throw new Error(`Peer "${peerName}" is not healthy`)

    // Default to first agent on the peer
    const agent = agentId || state.agents[0]?.id
    if (!agent) throw new Error(`Peer "${peerName}" has no agents`)

    const url = `${state.peer.url}/task`
    const inner = {
      agent,
      message: text,
      ...(opts.senderAgentId ? { senderAgentId: opts.senderAgentId } : {}),
      ...(typeof opts.freshSession === "boolean" ? { freshSession: opts.freshSession } : {}),
      ...(opts.context ? { context: opts.context } : {}),
    }
    // E2E: seal the whole task through the secure tunnel when the peer has
    // a key; otherwise fall back to the bearer + plaintext /task path.
    if (state.peer.publicKey && this.config.identity?.secretKey) {
      const r = await this.secureCall(peerName, { op: "task", ...inner }, { timeoutMs: opts.timeoutMs ?? 30 * 60 * 1000 })
      if (r.status >= 400 || r.body?.error) throw new Error(`Peer "${peerName}" /task error: ${r.status}${r.body?.error ? `: ${r.body.error}` : ""}`)
      return r.body?.content || "No response"
    }
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (state.peer.token) headers["Authorization"] = `Bearer ${state.peer.token}`
    const bodyStr = JSON.stringify(inner)

    // Agent tasks frequently run for minutes. Two timeout layers to defeat:
    //   1. AbortController on our side — explicit request timeout. Default 30 min.
    //   2. undici's headersTimeout (300s default) — fires independently while
    //      the peer is still synchronously processing before writing headers.
    //      Per-call dispatcher with disabled timeouts fixes it.
    const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Awaited<ReturnType<typeof undiciFetch>>
    try {
      res = await undiciFetch(url, {
        method: "POST",
        headers,
        body: bodyStr,
        signal: controller.signal,
        dispatcher: longTaskDispatcher,
      })
    } catch (e: any) {
      clearTimeout(timer)
      if (controller.signal.aborted) {
        throw new Error(`Peer "${peerName}" /task timed out after ${Math.round(timeoutMs / 1000)}s`)
      }
      throw e
    }
    clearTimeout(timer)

    // Read the body even on !res.ok so the caller sees the real reason
    // instead of an opaque "/task error: 500".
    if (!res.ok) {
      let detail = ""
      try {
        const errBody = await res.json() as { error?: string }
        if (errBody.error) detail = `: ${errBody.error}`
      } catch {
        /* body was not JSON — fall through with status only */
      }
      throw new Error(`Peer "${peerName}" /task error: ${res.status}${detail}`)
    }

    const data = await res.json() as { content?: string; error?: string }
    if (data.error) throw new Error(`Peer "${peerName}" agent error: ${data.error}`)
    return data.content || "No response"
  }

  /**
   * Streaming variant of `sendTask`. POSTs to the peer's `/task` with
   * `Accept: text/event-stream`, parses the SSE wire (event/data pairs),
   * and yields `{event, data}` records as they arrive, ending on a
   * terminal `done` (or `error`).
   */
  async *sendTaskStream(
    peerName: string,
    text: string,
    agentId?: string,
    opts: {
      timeoutMs?: number
      senderAgentId?: string
      freshSession?: boolean
      context?: Record<string, unknown>
    } = {},
  ): AsyncGenerator<{ event: string; data: any }> {
    const state = this.peers.get(peerName)
    if (!state) throw new Error(`Unknown peer: ${peerName}`)
    if (!state.healthy) throw new Error(`Peer "${peerName}" is not healthy`)

    const agent = agentId || state.agents[0]?.id
    if (!agent) throw new Error(`Peer "${peerName}" has no agents`)

    const url = `${state.peer.url}/task`
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    }
    if (state.peer.token) headers["Authorization"] = `Bearer ${state.peer.token}`

    const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let res: Awaited<ReturnType<typeof undiciFetch>>
    try {
      res = await undiciFetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          agent,
          message: text,
          stream: true,
          ...(opts.senderAgentId ? { senderAgentId: opts.senderAgentId } : {}),
          ...(typeof opts.freshSession === "boolean" ? { freshSession: opts.freshSession } : {}),
          ...(opts.context ? { context: opts.context } : {}),
        }),
        signal: controller.signal,
        dispatcher: longTaskDispatcher,
      })
    } catch (e: any) {
      clearTimeout(timer)
      if (controller.signal.aborted) throw new Error(`Peer "${peerName}" /task stream timed out after ${Math.round(timeoutMs / 1000)}s`)
      throw e
    }

    if (!res.ok) {
      clearTimeout(timer)
      let detail = ""
      try {
        const errBody = await res.text()
        detail = errBody ? `: ${errBody.slice(0, 200)}` : ""
      } catch { /* */ }
      throw new Error(`Peer "${peerName}" /task stream error: ${res.status}${detail}`)
    }
    if (!res.body) {
      clearTimeout(timer)
      throw new Error(`Peer "${peerName}" /task stream has no body`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // Split on SSE record boundaries (\n\n). The trailing partial
        // record stays in `buffer` for the next iteration.
        let sep = buffer.indexOf("\n\n")
        while (sep !== -1) {
          const record = buffer.slice(0, sep)
          buffer = buffer.slice(sep + 2)
          sep = buffer.indexOf("\n\n")
          if (!record.trim()) continue
          let event = "message"
          const dataLines: string[] = []
          for (const line of record.split("\n")) {
            if (line.startsWith(":")) continue // comment / heartbeat
            if (line.startsWith("event:")) event = line.slice(6).trim()
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
          }
          if (dataLines.length === 0) continue
          let data: any = dataLines.join("\n")
          try { data = JSON.parse(data) } catch { /* leave as string */ }
          yield { event, data }
          if (event === "done" || event === "error") return
        }
      }
    } finally {
      clearTimeout(timer)
      try { await reader.cancel() } catch { /* */ }
    }
  }

  /**
   * Forward an opaque signaling message to a remote peer's
   * /webrtc/signal endpoint. Not gated by peer health. Peer lookup is
   * tolerant of case / punctuation drift in the name.
   */
  async sendSignal(peerName: string, signal: unknown): Promise<boolean> {
    const state = this.peers.get(peerName) || this.findPeerByNormalizedName(peerName)
    if (!state) throw new Error(`Unknown peer: ${peerName}`)

    const url = `${state.peer.url}/webrtc/signal`
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (state.peer.token) {
      headers["Authorization"] = `Bearer ${state.peer.token}`
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(signal),
      })
      return res.ok
    } catch (e: any) {
      this.log(`sendSignal to "${peerName}" failed: ${e.message}`)
      return false
    }
  }

  /** Look up a peer by a name that differs only in case / non-alphanumeric
   *  characters (e.g. spaces, hyphens). */
  private findPeerByNormalizedName(name: string): PeerState | undefined {
    const want = name.toLowerCase().replace(/[^a-z0-9]/g, "")
    for (const [key, state] of this.peers) {
      if (key.toLowerCase().replace(/[^a-z0-9]/g, "") === want) return state
    }
    return undefined
  }

  /**
   * Find a peer that has a specific skill.
   */
  findPeerWithSkill(skillId: string): PeerState | undefined {
    for (const state of this.peers.values()) {
      if (state.healthy && state.agents.some((a) => a.id === skillId)) {
        return state
      }
    }
    return undefined
  }

  /**
   * Auth headers for host-level fetches to a peer's protected endpoints.
   * Tokens deliberately never ride along in directory() — it is served
   * to dashboards; look them up per-request by peer name instead.
   */
  authHeaders(peerName: string): Record<string, string> {
    const token = this.peers.get(peerName)?.peer.token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  /** Is there a sealed (E2E) channel to this peer — i.e. have we exchanged
   *  keys AND do we hold an identity secret? */
  canSeal(peerName: string): boolean {
    const state = this.peers.get(peerName) || this.findPeerByNormalizedName(peerName)
    return Boolean(state?.peer.publicKey && this.config.identity?.secretKey)
  }

  /**
   * The E2E secure tunnel: seal `inner` to the peer, POST it to /secure,
   * and open the sealed reply. One primitive carries every cross-boundary
   * op (task, skill, grants) confidentially and box-authenticated. Returns
   * the peer's { status, body }; throws on transport/crypto failure.
   */
  async secureCall(peerName: string, inner: unknown, opts: { timeoutMs?: number } = {}): Promise<{ status: number; body: any }> {
    const state = this.peers.get(peerName) || this.findPeerByNormalizedName(peerName)
    if (!state) throw new Error(`Unknown peer: ${peerName}`)
    const idKey = this.config.identity?.secretKey
    if (!state.peer.publicKey || !idKey) throw new Error(`No sealed channel to "${peerName}" — no key exchanged`)
    const env = seal(JSON.stringify(inner), state.peer.publicKey, idKey)
    const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Awaited<ReturnType<typeof undiciFetch>>
    try {
      res = await undiciFetch(`${state.peer.url}/secure`, {
        method: "POST",
        headers: { "Content-Type": "text/plain", "X-Agentina-From": this.config.identity!.partyId },
        body: env,
        signal: controller.signal,
        dispatcher: longTaskDispatcher,
      })
    } catch (e: any) {
      clearTimeout(timer)
      if (controller.signal.aborted) throw new Error(`Peer "${peerName}" /secure timed out after ${Math.round(timeoutMs / 1000)}s`)
      throw e
    }
    clearTimeout(timer)
    if (res.status === 401) throw new Error(`Peer "${peerName}" rejected the sealed call (401)`)
    const opened = open(await res.text(), state.peer.publicKey, idKey)
    if (!opened) throw new Error(`Peer "${peerName}" sent an unreadable sealed reply`)
    return JSON.parse(opened) as { status: number; body: any }
  }

  /**
   * Fetch one shared skill's text from its owner (by party id), under
   * our skill grant. Fail-closed: any denial, missing peer, or network
   * error returns undefined, so a revoked or offline skill simply
   * vanishes from the adopting agent's next turn.
   */
  async fetchSkill(ownerPartyId: string, skillId: string): Promise<{ text: string; version: string } | undefined> {
    let state: PeerState | undefined
    for (const s of this.peers.values()) if (s.peer.partyId === ownerPartyId) { state = s; break }
    if (!state) return undefined
    try {
      // E2E: fetch the skill text through the sealed tunnel when possible —
      // adopted-skill text is fetched every turn, so it must be encrypted.
      if (state.peer.publicKey && this.config.identity?.secretKey) {
        const r = await this.secureCall(state.peer.name, { op: "skill", skillId }, { timeoutMs: 15_000 })
        if (r.status !== 200 || typeof r.body?.text !== "string") return undefined
        return { text: r.body.text, version: String(r.body.version ?? "") }
      }
      const url = `${state.peer.url}/skill?skillId=${encodeURIComponent(skillId)}`
      const headers: Record<string, string> = {}
      if (state.peer.token) headers["Authorization"] = `Bearer ${state.peer.token}`
      const res = await fetch(url, { headers })
      if (!res.ok) return undefined
      const j = (await res.json()) as { text?: string; version?: string }
      return typeof j.text === "string" ? { text: j.text, version: String(j.version ?? "") } : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Get the combined agent directory across all peers.
   */
  directory(): Array<{
    peer: string
    peerUrl: string
    healthy: boolean
    skills: AgentSkill[]
    channels: string[]
    lastCheck?: Date
  }> {
    return Array.from(this.peers.entries()).map(([name, state]) => ({
      peer: name,
      peerUrl: state.peer.url,
      healthy: state.healthy,
      skills: state.agents,
      channels: Array.isArray((state.agentCard as any)?.channels)
        ? ((state.agentCard as any).channels as unknown[]).map((c) => String(c))
        : [],
      lastCheck: state.lastCheck,
    }))
  }
}
