import type { ChannelAdapter, ChannelHost, InboundMessage } from "./types"

// --- Channel router: mention → agent (local or across the mesh) → reply ---
//
// One router serves every adapter. Resolution order for "@name":
//   1. a local agent offer with that id
//   2. a healthy mesh peer advertising that skill id — the task crosses
//      the boundary with this party's peer token, and the REMOTE side
//      enforces its grants; a denial comes back as the reply, honestly.
// No mention → the first local agent (the party's default), so a plain
// DM to a Telegram bot just works.

const MENTION = /@([a-z0-9][\w.-]*)/gi

export class ChannelRouter {
  private adapters: ChannelAdapter[] = []

  constructor(private host: ChannelHost) {}

  attach(adapter: ChannelAdapter): void {
    this.adapters.push(adapter)
  }

  channelNames(): string[] {
    return this.adapters.map((a) => a.name)
  }

  async start(): Promise<void> {
    for (const adapter of this.adapters) {
      // One bad token must not block the other channels from starting.
      try {
        await adapter.start((msg) => {
          void this.handle(adapter, msg).catch((e) => {
            this.host.log(`[channels/${adapter.name}] handler error: ${e?.message || e}`)
          })
        })
        this.host.log(`[channels] ${adapter.name} started`)
      } catch (e: any) {
        this.host.log(`[channels] ${adapter.name} failed to start: ${e?.message || e}`)
      }
    }
  }

  async stop(): Promise<void> {
    await Promise.allSettled(this.adapters.map((a) => a.stop()))
  }

  /** Exposed for tests and for webhook-style adapters that receive
   *  messages via the node's HTTP server rather than their own loop. */
  async handle(adapter: ChannelAdapter, msg: InboundMessage): Promise<void> {
    const target = this.resolveTarget(msg.text)
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

  private resolveTarget(text: string):
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

    // No resolvable mention → the party's default local agent.
    if (mentions.length === 0 && locals.length > 0) {
      return { kind: "local", agentId: locals[0] }
    }
    return undefined
  }
}
