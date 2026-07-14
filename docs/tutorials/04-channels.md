# 04 · Mention an agent in Telegram or GitLab — across companies

**Hook (0:00–0:25).** "This is a GitLab merge request. I'm going to mention an AI agent in a comment — and the agent that answers doesn't run in my company. It runs on my contractor's laptop, and my grant is the only reason it can answer at all."

**What you'll build.** Telegram + GitLab as chat surfaces for the mesh, with mentions resolving across the trust boundary.

## Steps

1. **Telegram in one command** (0:25):
   ```bash
   export TG_BOT_TOKEN=…   # from BotFather
   agentina channel telegram --token-env TG_BOT_TOKEN
   ```
   "Long-polling — no webhook, no public IP. Works behind Tailscale."
2. **Plain DM** (1:10): message the bot `hello` → the default local agent answers. "No mention needed for your own bot."
3. **Mention routing** (1:50): `@files read brief.txt` → the reply comes back in Telegram. Split-screen the console Activity feed filling in live.
4. **The wow — crossing the boundary (2:40):** `@deploy ship v2 to staging` where `deploy` is an agent on the OTHER party's node. Trace it on screen: Telegram → your node → mesh hop with YOUR party token → *their* node checks *their* grant → answer returns to your chat. "Two companies, one chat message, zero shared passwords."
5. **The honest denial** (3:50): mention an agent you were never granted → the chat reply IS the denial: `⛔ 403 no-grant`. "The channel can't bypass the boundary. Nothing can."
6. **GitLab** (4:30):
   ```bash
   agentina channel gitlab --host https://gitlab.example.com --token-env GL_BOT_TOKEN --secret-env GL_HOOK_SECRET
   ```
   Add the project webhook (note events). Comment `@files what changed in the brief?` on an MR → the agent replies *as a comment, as the bot user*. Call out the loop guard: "it never replies to itself."
7. **The contract** (5:40): show `telegram.ts` — "an adapter is four methods. WhatsApp, Discord, Slack, GitHub, Trello, Jira — each one is this file with a different API inside. Routing, mentions, grants: shared, never rewritten."

**Recap + CTA (6:30).** "Your chat apps are now the front-end of a cross-company agent mesh — and every message obeys the grants. Star the repo, and tell me which channel adapter you want next."
