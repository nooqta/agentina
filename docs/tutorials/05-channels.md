# 05 · Your chat apps become the front-end — WhatsApp, Telegram, Discord, Slack, GitHub, GitLab (8 min)

**Hook (0:00–0:25).** "This is a GitLab merge request. I'm going to mention an AI agent in a comment — and the agent that answers doesn't run in my company. It runs on my contractor's laptop, and her rules are the only reason it can answer at all. Same trick works in WhatsApp, Telegram, Discord, and Slack. Every setup is: copy a token, paste it, Save."

**What you'll build.** Two connections end to end (Telegram in 90 seconds, one webhook channel with the address box), the per-agent binding, and the cross-boundary mention.

## The one pattern (0:25)

Every channel screen in the console (Advanced → Channels, or an agent's own Channels section) is the same three beats:
1. numbered steps that tell you where the token lives on the service's site
2. **"Who answers here?"** — one agent (its own bot, no mention needed) or all agents (@mention picks)
3. a paste field + **Save** → the channel starts immediately. The toast is honest: "telegram is on — answering as assistant", or the exact error if the token is wrong.

Tokens land in an owner-only file on your machine; environment variables with the same names override them (pros change nothing).

## Steps

1. **Telegram in 90 seconds** (0:50): BotFather → `/newbot` → copy token → console → paste → Save → DM the bot. No public address needed — ever. *(Recycle the flow from episode 01 at 2× speed if filming the full playlist.)*
2. **A webhook channel — the address box** (2:00): open GitHub's channel screen. Point at **"Your webhook address"** — the exact URL with a Copy button. If the node has no public HTTPS yet, the box says so in plain words and takes one (a domain, a tunnel, or a reverse proxy) right there; the address updates instantly. "The app never makes you assemble a URL from a README."
3. **GitHub end to end** (3:00): fine-grained token (one repo, Issues + PRs read/write) → paste below → webhook on the repo (Issue comments, the copied address, a secret) → comment `@assistant explain this failure` on a PR → the reply lands in the thread. "Signature-checked, and it never answers itself or other bots."
4. **Per agent, per channel** (4:15): back to the "Who answers here?" chips — bind a second Telegram bot to `bookkeeper` while `assistant` keeps its own. Both run at once; the Advanced rail shows who answers where. "One agent, one face, per channel — that's the episode-01 solo story and the team story with the same switch."
5. **The wow — crossing the boundary (5:15):** in Telegram: `@deploy ship v2 to staging` — where `deploy` is an agent on the OTHER party's machine. Trace it on screen: your phone → your node → the mesh with YOUR credential → *their* node checks *their* shares → the answer returns to your chat. "Two companies, one chat message, zero shared passwords."
6. **The honest denial** (6:15): mention an agent that was never shared with you → the chat reply IS the denial: ⛔. "A channel can't bypass the boundary. Nothing can."
7. **Which channels need what** (6:45), one table on screen:
   - **Telegram, Discord** — no public address (they dial out)
   - **WhatsApp, Slack, GitHub, GitLab** — public HTTPS for the webhook (the address box guides it)

**Recap + CTA (7:30).** "Copy, paste, Save — your chat apps now front a mesh that still obeys every share. Next: [access that removes itself — episode 06](06-self-destructing-shares.md)."

## CLI equivalents (description box, not filmed)

```bash
agentina channel telegram --token-env TG_BOT_TOKEN [--agent assistant]
agentina channel whatsapp --token-env WA_TOKEN --phone-id 1234567890 --verify-env WA_VERIFY
agentina channel discord  --token-env DISCORD_BOT_TOKEN [--channels <id,…>]
agentina channel slack    --token-env SLACK_BOT_TOKEN --secret-env SLACK_SIGNING_SECRET
agentina channel github   --token-env GH_BOT_TOKEN --secret-env GH_HOOK_SECRET
agentina channel gitlab   --host https://gitlab.example.com --token-env GL_BOT_TOKEN --secret-env GL_HOOK_SECRET
# --agent <id> on any of them binds the connection to one agent.
# Each connection gets its own webhook: <node-url>/channels/<binding-id>/webhook
```
