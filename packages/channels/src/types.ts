// --- The channel contract ---
//
// A channel is where humans talk: Telegram, WhatsApp, Discord, Slack,
// GitLab/GitHub comments, Trello cards, Jira issues… Every channel is
// one small adapter implementing this interface — the router, mention
// resolution, mesh hops, and grant enforcement are shared and never
// reimplemented per channel.

export interface InboundMessage {
  /** Adapter name, e.g. "telegram", "gitlab". */
  channel: string
  /** Conversation key within the channel (chat id, MR/issue ref, card id). */
  chatId: string
  /** The human's text, mentions included. */
  text: string
  /** Display name or handle of the author. */
  sender: string
  /** Channel-specific bits the adapter needs to reply in place
   *  (message ids, project paths, thread ts, …). Echoed back to
   *  sendReply untouched. */
  meta?: Record<string, unknown>
}

export interface ChannelAdapter {
  readonly name: string
  /** Begin receiving. The adapter calls `onMessage` for every inbound
   *  message it wants routed (it decides its own filtering: allowed
   *  chats, mention-required, …). */
  start(onMessage: (msg: InboundMessage) => void): Promise<void>
  stop(): Promise<void>
  /** Deliver an agent's reply back where the message came from. */
  sendReply(msg: InboundMessage, text: string): Promise<void>
}

/** What the router needs from its host (the node). Structural on
 *  purpose — no dependency on @agentina-mesh/node. */
export interface ChannelHost {
  /** Ids of agents this party offers locally. */
  localAgentIds(): string[]
  /** Run a local agent (owner trust — the owner connected the channel). */
  executeLocal(agentId: string, message: string, context: Record<string, unknown>): Promise<string>
  /** The mesh directory: peer name + the agent/skill ids it advertises. */
  peers(): Array<{ peer: string; healthy: boolean; skillIds: string[] }>
  /** Send a task to a peer's agent. The peer enforces ITS grants to this
   *  party — a channel mention never bypasses the trust boundary. */
  sendToPeer(peer: string, agentId: string, message: string, context: Record<string, unknown>): Promise<string>
  audit(entry: { kind: "task"; decision: "allowed" | "denied"; agentId?: string; reason?: string; detail?: string }): void
  log(...args: unknown[]): void
}
