# 04 · Mention an agent in WhatsApp, Telegram, GitHub, or GitLab — across companies

**Hook (0:00–0:25).** "This is a GitLab merge request. I'm going to mention an AI agent in a comment — and the agent that answers doesn't run in my company. It runs on my contractor's laptop, and my grant is the only reason it can answer at all."

**What you'll build.** WhatsApp, Telegram, GitHub, and GitLab as chat surfaces for the mesh, with mentions resolving across the trust boundary.

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
7. **GitHub** (5:10):
   ```bash
   export GH_BOT_TOKEN=github_pat_…   # fine-grained: Issues + PRs read/write on the one repo
   export GH_HOOK_SECRET=…            # any long random string
   agentina channel github --token-env GH_BOT_TOKEN --secret-env GH_HOOK_SECRET
   ```
   Repo → Settings → Webhooks → event "Issue comments", content type `application/json`, secret set, pointed at `<node-url>/channels/github/webhook`. Comment `@assistant explain this failure` on any issue or PR. The signature is HMAC-SHA256 over the raw bytes — a forged webhook gets a 401, and bot-authored comments are dropped so it never answers itself.
8. **WhatsApp** (5:50):
   ```bash
   export WA_TOKEN=…                  # Meta Business Cloud API permanent token
   export WA_VERIFY=my-secret-word    # you invent this; Meta echoes it at registration
   agentina channel whatsapp --token-env WA_TOKEN --phone-id 1234567890 --verify-env WA_VERIFY
   ```
   In the Meta app: WhatsApp → Configuration → callback URL `<node-url>/channels/whatsapp/webhook`, verify token = your secret word, subscribe to the **messages** field. Then text the number like a contact: `@files read brief.txt`. Your own outbound messages arrive as *statuses*, never *messages* — the loop guard is structural. `--numbers 216…,331…` allowlists who may talk to the node.
9. **The contract** (6:40): show `telegram.ts` — "an adapter is four methods. Discord, Slack, Teams, Trello, Jira — each one is this file with a different API inside. Routing, mentions, grants: shared, never rewritten."

> Webhook channels (GitHub, GitLab, WhatsApp) need the node reachable over HTTPS from the internet — put a small reverse proxy or tunnel in front of it. Telegram long-polls and needs nothing.

**Recap + CTA (7:30).** "Your chat apps are now the front-end of a cross-company agent mesh — and every message obeys the grants. Star the repo, and tell me which channel adapter you want next."
