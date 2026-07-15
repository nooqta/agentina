import { createHmac, timingSafeEqual } from "node:crypto"
import type { ChannelAdapter, InboundMessage } from "./types"

// --- GitHub adapter: mention an agent in an issue/PR comment ---
//
// Webhook-fed (the node mounts POST /channels/github/webhook and calls
// handleWebhook with the RAW body — GitHub signs the exact bytes with
// HMAC-SHA256, so parsing first would break verification). Replies land
// as comments posted with the configured token; PR conversation
// comments ride the issues API, so one endpoint covers both.

export interface GitHubConfig {
  /** Fine-grained token with Issues + Pull requests read/write on the
   *  repos the bot should answer in. */
  token: string
  /** Webhook secret checked against X-Hub-Signature-256. */
  webhookSecret?: string
  /** API base — override for GitHub Enterprise (e.g. https://ghe.corp/api/v3). */
  apiBase?: string
}

export class GitHubAdapter implements ChannelAdapter {
  readonly name = "github"
  private onMessage?: (msg: InboundMessage) => void
  private botLogin = ""
  private api: string

  constructor(private cfg: GitHubConfig, private log: (...a: unknown[]) => void = () => {}) {
    this.api = (cfg.apiBase ?? "https://api.github.com").replace(/\/$/, "")
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.cfg.token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "agentina",
      "X-GitHub-Api-Version": "2022-11-28",
    }
  }

  async start(onMessage: (msg: InboundMessage) => void): Promise<void> {
    this.onMessage = onMessage
    const res = await fetch(`${this.api}/user`, { headers: this.headers() })
    if (!res.ok) throw new Error(`github: token rejected by /user (${res.status})`)
    const user = (await res.json()) as { login: string }
    this.botLogin = user.login
    this.log(`[github] posting as @${this.botLogin}`)
  }

  async stop(): Promise<void> {
    this.onMessage = undefined
  }

  /** Wire this to the node's HTTP server with the RAW request body.
   *  Returns an HTTP status. */
  handleWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): number {
    if (this.cfg.webhookSecret) {
      const got = String(headers["x-hub-signature-256"] ?? "")
      const want = "sha256=" + createHmac("sha256", this.cfg.webhookSecret).update(rawBody).digest("hex")
      const a = Buffer.from(got)
      const b = Buffer.from(want)
      if (a.length !== b.length || !timingSafeEqual(a, b)) return 401
    }
    if (!this.onMessage) return 503
    if (String(headers["x-github-event"] ?? "") !== "issue_comment") return 200

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      return 400
    }
    if (body?.action !== "created") return 200 // edits/deletions carry no new mention

    const author = body.comment?.user?.login ?? "unknown"
    // Never route our own replies (or any bot's) back in — instant loop.
    if (author === this.botLogin || body.comment?.user?.type === "Bot") return 200

    const repo = body.repository?.full_name
    const number = body.issue?.number
    const text = body.comment?.body
    if (!repo || !number || !text) return 200

    this.onMessage({
      channel: this.name,
      chatId: `${repo}#${number}`,
      text: String(text),
      sender: author,
      meta: { repo, number },
    })
    return 202
  }

  async sendReply(msg: InboundMessage, text: string): Promise<void> {
    const { repo, number } = msg.meta as { repo: string; number: number }
    const res = await fetch(`${this.api}/repos/${repo}/issues/${number}/comments`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    })
    if (!res.ok) this.log(`[github] reply -> ${res.status} (404 = token can't see the repo)`)
  }
}
