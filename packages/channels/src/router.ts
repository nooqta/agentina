import type { ChannelAdapter, ChannelHost, InboundMessage } from "./types"

// --- Channel router: mention → agent (local or across the mesh) → reply ---
//
// One router serves every adapter. Resolution order for "@name":
//   1. a local agent offer with that id
//   2. a healthy mesh peer advertising that skill id — the task crosses
//      the boundary with this party's peer token, and the REMOTE side
//      enforces its grants; a denial comes back as the reply, honestly.
// No mention → the connection's BOUND agent when it has one (a channel
// can be one agent's face — its own bot, its own number), else the
// first local agent, so a plain DM just works either way.

const MENTION = /@([a-z0-9][\w.-]*)/gi

export interface AttachOptions {
  /** This connection speaks for one agent: unmentioned messages go to
   *  it instead of the party default. Mentions still resolve. */
  agentId?: string
  /** Stable binding id (config identity) — status reporting keys on it. */
  bindingId?: string
}

interface Attached {
  adapter: ChannelAdapter
  agentId?: string
  bindingId: string
}

export class ChannelRouter {
  private attached: Attached[] = []

  constructor(private host: ChannelHost) {}

  attach(adapter: ChannelAdapter, opts: AttachOptions = {}): void {
    this.attached.push({ adapter, agentId: opts.agentId, bindingId: opts.bindingId ?? adapter.name })
  }

  /** Drop every adapter (after stop()) so the set can be rebuilt from
   *  config — the node's paste-token-and-it-starts reload path. */
  reset(): void {
    this.attached = []
    this.started = []
  }

  private started: Attached[] = []

  /** Channel kinds that actually STARTED — configured-but-broken ones
   *  are excluded, so the console can tell "on" from "check the token". */
  channelNames(): string[] {
    return Array.from(new Set(this.started.map((a) => a.adapter.name)))
  }

  /** Binding ids that started — the per-connection view. */
  runningBindings(): string[] {
    return this.started.map((a) => a.bindingId)
  }

  async start(): Promise<Array<{ name: string; bindingId: string; agentId?: string; ok: boolean; error?: string }>> {
    const results: Array<{ name: string; bindingId: string; agentId?: string; ok: boolean; error?: string }> = []
    for (const entry of this.attached) {
      const { adapter, agentId, bindingId } = entry
      // One bad token must not block the other channels from starting.
      try {
        await adapter.start((msg) => {
          void this.handle(adapter, msg, agentId).catch((e) => {
            this.host.log(`[channels/${adapter.name}] handler error: ${e?.message || e}`)
          })
        })
        this.host.log(`[channels] ${adapter.name}${agentId ? ` (agent ${agentId})` : ""} started`)
        this.started.push(entry)
        results.push({ name: adapter.name, bindingId, agentId, ok: true })
      } catch (e: any) {
        const error = String(e?.message || e)
        this.host.log(`[channels] ${adapter.name} failed to start: ${error}`)
        results.push({ name: adapter.name, bindingId, agentId, ok: false, error })
      }
    }
    return results
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.attached.map((a) => a.adapter.stop()))
  }

  /** Exposed for tests and for webhook-style adapters that receive
   *  messages via the node's HTTP server rather than their own loop.
   *  `boundAgentId` is the connection's own agent — its default voice. */
  async handle(adapter: ChannelAdapter, msg: InboundMessage, boundAgentId?: string): Promise<void> {
    const target = this.resolveTarget(msg.text, boundAgentId)
    if (!target) {
      this.host.log(`[channels/${adapter.name}] no agent resolves for: ${msg.text.slice(0, 60)}`)
      return
    }

    const context = { channel: msg.channel, chatId: msg.chatId, sender: msg.sender }
    let reply: string
    try {
      reply =
        target.kind === "local"
          ? await this.host.executeLocal(target.agentId, msg.text, context)
          : await this.host.sendToPeer(target.peer, target.agentId, msg.text, context)
    } catch (e: any) {
      // Grant denials from the remote side surface here — the honest
      // reply is the denial itself, and it's audited like any task.
      reply = `⛔ ${String(e?.message || e)}`
      this.host.audit({ kind: "task", decision: "denied", agentId: target.agentId, reason: "channel-task-failed", detail: reply.slice(0, 200) })
    }
    await adapter.sendReply(msg, reply)
  }

  private resolveTarget(text: string, boundAgentId?: string):
    | { kind: "local"; agentId: string }
    | { kind: "peer"; peer: string; agentId: string }
    | undefined {
    const locals = this.host.localAgentIds()
    const mentions = Array.from(text.matchAll(MENTION), (m) => m[1].toLowerCase())

    for (const mention of mentions) {
      const local = locals.find((id) => id.toLowerCase() === mention)
      if (local) return { kind: "local", agentId: local }
      for (const peer of this.host.peers()) {
        if (!peer.healthy) continue
        const skill = peer.skillIds.find((id) => id.toLowerCase() === mention)
        if (skill) return { kind: "peer", peer: peer.peer, agentId: skill }
      }
    }

    // No resolvable mention → the connection's own agent when bound
    // (this channel IS that agent's face), else the party default.
    if (mentions.length === 0) {
      if (boundAgentId && locals.some((id) => id === boundAgentId)) {
        return { kind: "local", agentId: boundAgentId }
      }
      if (locals.length > 0) return { kind: "local", agentId: locals[0] }
    }
    return undefined
  }
}
