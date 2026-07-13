import type { ChannelAdapter, InboundMessage } from "./types"

// --- GitLab adapter: mention an agent in an issue/MR comment ---
//
// Webhook-fed (the node mounts POST /channels/gitlab/webhook and calls
// handleWebhook). Replies land as comments posted with the configured
// bot token — GitLab returns 404, not 401, when that token's user can't
// see the project, so the startup identity check logs who we post as.

export interface GitLabConfig {
  /** e.g. https://gitlab.example.com */
  host: string
  /** Bot user token used to post replies (needs project membership). */
  token: string
  /** Shared secret checked against X-Gitlab-Token on inbound webhooks. */
  webhookSecret?: string
}

export class GitLabAdapter implements ChannelAdapter {
  readonly name = "gitlab"
  private onMessage?: (msg: InboundMessage) => void
  private botUsername = ""

  constructor(private cfg: GitLabConfig, private log: (...a: unknown[]) => void = () => {}) {}

  async start(onMessage: (msg: InboundMessage) => void): Promise<void> {
    this.onMessage = onMessage
    const res = await fetch(`${this.cfg.host}/api/v4/user`, {
      headers: { "PRIVATE-TOKEN": this.cfg.token },
    })
    if (!res.ok) throw new Error(`gitlab: token rejected by /user (${res.status})`)
    const user = await res.json() as { username: string }
    this.botUsername = user.username
    this.log(`[gitlab] posting as @${this.botUsername} on ${this.cfg.host}`)
  }

  async stop(): Promise<void> {
    this.onMessage = undefined
  }

  /** Wire this to the node's HTTP server. Returns an HTTP status. */
  handleWebhook(headers: Record<string, string | string[] | undefined>, body: any): number {
    if (this.cfg.webhookSecret) {
      const got = String(headers["x-gitlab-token"] ?? "")
      if (got !== this.cfg.webhookSecret) return 401
    }
    if (!this.onMessage) return 503
    if (body?.object_kind !== "note") return 200 // only comments carry mentions

    const note = body.object_attributes
    const author = body.user?.username ?? "unknown"
    // Never route our own replies back into the router — instant loop.
    if (author === this.botUsername) return 200

    const project = body.project?.path_with_namespace
    const noteableType = String(note?.noteable_type ?? "") // "MergeRequest" | "Issue"
    const iid = body.merge_request?.iid ?? body.issue?.iid
    if (!project || !iid || !note?.note) return 200

    this.onMessage({
      channel: this.name,
      chatId: `${project}:${noteableType.toLowerCase()}:${iid}`,
      text: String(note.note),
      sender: author,
      meta: { project, noteableType, iid },
    })
    return 202
  }

  async sendReply(msg: InboundMessage, text: string): Promise<void> {
    const { project, noteableType, iid } = msg.meta as { project: string; noteableType: string; iid: number }
    const kind = noteableType === "MergeRequest" ? "merge_requests" : "issues"
    const url = `${this.cfg.host}/api/v4/projects/${encodeURIComponent(project)}/${kind}/${iid}/notes`
    const res = await fetch(url, {
      method: "POST",
      headers: { "PRIVATE-TOKEN": this.cfg.token, "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    })
    if (!res.ok) this.log(`[gitlab] reply -> ${res.status} (404 = bot lacks project membership)`)
  }
}
