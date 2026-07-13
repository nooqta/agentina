import type { AgentOffer } from "@agentina-mesh/protocol"

// --- Agent adapter: how tasks actually execute ---
//
// The node knows nothing about LLMs. An adapter receives a task for one
// of this party's AgentOffers and returns the reply text. M0 ships Echo
// (connectivity proof, CI-safe); M1 adds a Claude Code CLI adapter using
// the agentx runtime pattern.

export interface AdapterTask {
  message: string
  /** Party the request was attributed to ("local" for loopback callers). */
  fromPartyId: string
  /** The grant policy this task runs under. Undefined for local callers
   *  (the owner is unrestricted); ALWAYS present for remote parties —
   *  the /task handler refuses ungranted parties before the adapter
   *  ever sees the task. Adapters must treat scopes as the jail. */
  policy?: { grantId: string; scopes: import("@agentina-mesh/protocol").Scope[] }
  senderAgentId?: string
  context?: Record<string, unknown>
}

export interface AgentAdapter {
  execute(offer: AgentOffer, task: AdapterTask): Promise<{ content: string }>
}

export class EchoAdapter implements AgentAdapter {
  async execute(offer: AgentOffer, task: AdapterTask): Promise<{ content: string }> {
    return { content: `echo from ${offer.name}: ${task.message}` }
  }
}
