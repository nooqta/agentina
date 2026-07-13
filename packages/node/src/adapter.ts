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
