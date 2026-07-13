# agentina

**Agent collaboration across trust boundaries.**

Two parties — a freelancer and a client, two companies, two machines that don't belong to the same person — pair their nodes over any IP network, grant each other *scoped* access, and let their agents work together. Every request is attributed to a party before anything runs. Every decision lands in an append-only audit log. Self-hosted, no accounts, no telemetry.

```
  agentina demo — freelancer ↔ client, one trust boundary, loopback only

  ✓ pair — Amal joined "Badis (client)" — directional tokens exchanged
  ✓ invite replay rejected — the redeemed link is worthless
  ✓ connection test — Amal→Badis 1ms · Badis→Amal 1ms
  ✓ deny before grant — task without a grant → 403 no-grant
  ✓ grant — Badis → Amal: agent "files", fs:project-docs (ro)
  ✓ scoped read — "Redesign the checkout flow. Budget: 4 weeks. …"
  ✓ path escape denied — read ../secret.txt → 403
  ✓ ungranted agent denied — task to "echo" → agent-not-granted
  ✓ forged token denied — GET /ping with a forged token → 401
  ✓ grant revoked — after revoke, the same read → 403
  ✓ audit trail — 10 entries, 6 denials (pair, ping, task, grant-create, auth-denied)
```

Try it in 30 seconds (no keys, no config):

```bash
npx agentina demo
```

## Why

Multi-agent frameworks connect machines that all belong to **one** operator — trust is a shared secret, and any authenticated peer can invoke any agent. The moment two *different* owners want their agents to collaborate, you need more:

- **Parties, not just peers.** Every node is owned by a party; every inbound request is attributed to one before it runs.
- **Directional credentials.** Pairing mints two independent tokens — one per direction. Revoke one party without touching the rest. Invite links carry a one-time token, never a permanent secret.
- **Pairing alone grants nothing.** Access is a **Grant**, authored and enforced by the granting side: "this party may invoke these agents, scoped to this directory / repo / server / skill." Read-only means read-only — `..` traversal and symlink escapes fail closed.
- **Audit as a product.** Tasks, pairings, connection tests, grant changes, and *denials* — recorded with the party they were attributed to.

Built on the Linux Foundation's [A2A protocol](https://github.com/a2aproject/A2A) for agent cards and task exchange. Network-agnostic: a peer is any reachable URL — Tailscale, WireGuard, headscale, or plain WAN + TLS.

## How it works

```bash
# Party A (the freelancer)
agentina init --name "Amal"
agentina start
agentina invite                       # → agentina://join/… (one-time, 15 min)

# Party B (the client), on their own machine
agentina init --name "Badis"
agentina start
agentina join "agentina://join/…"     # redeems the invite, mints directional tokens
agentina test "Amal"                  # authenticated connection test

# The client decides exactly what the freelancer's agents may touch:
agentina grant --to "Amal" --agent files --fs ./project-docs --mode ro
agentina grants                       # list / audit what you've extended
agentina revoke gr_…                  # ends it instantly

# The freelancer works within the grant:
agentina task "Badis" read brief.txt --agent files
```

## Channels — talk to the mesh where you already are

Mention an agent in a comment or a chat and it answers — including agents on the *other side* of a trust boundary. The router resolves `@name` to a local agent or a paired party's skill; cross-boundary tasks carry your party token and **the remote side enforces its grants** — a channel mention never bypasses them. A denial comes back as the reply, honestly, and lands in both audit logs.

```bash
agentina channel telegram --token-env TG_BOT_TOKEN          # DM the bot, or @files read brief.txt
agentina channel gitlab --host https://gitlab.example.com --token-env GL_BOT_TOKEN --secret-env GL_HOOK_SECRET
# point the project webhook (note events) at <node-url>/channels/gitlab/webhook
```

| Channel | Status | How it listens |
|---|---|---|
| Telegram | ✓ | Bot API long-poll — no public IP needed |
| GitLab | ✓ | webhook on issue/MR comments, replies as the bot |
| WhatsApp · Discord · Slack · GitHub · Trello · Jira | planned | same `ChannelAdapter` contract — each is one small file |

Every adapter implements the same 4-method contract (`start`, `stop`, `sendReply`, + a name); routing, mention resolution, mesh hops, and grant enforcement are shared and never reimplemented per channel.

## Packages

| Package | What it is |
|---|---|
| `agentina` | The CLI and node daemon. |
| `@agentina-mesh/protocol` | Wire types: A2A + party/grant extensions. Zero deps. |
| `@agentina-mesh/peer` | Peer registry, health checks with hysteresis, task exchange, invite codec. |
| `@agentina-mesh/grants` | Party attribution (`decideAuth`), credentials, audit log. |
| `@agentina-mesh/node` | The daemon: agent-card, `/task`, pairing handshake, control API. |
| `@agentina-mesh/console` | The web console each node serves at `/`: pairing, scope picker, grants, live activity. |
| `@agentina-mesh/channels` | Channel adapters (Telegram, GitLab, …) + the shared mention router. |

## Roadmap

- **M0 ✓:** pair → connection test → task exchange → deny → revoke → audit.
- **M1 ✓:** Grants enforced at `/task` (party → allowed agents), `fs`/`skill` scopes with traversal/symlink-proof confinement, grant propose/approve/revoke, Claude Code adapter (cwd jailed to the granted root, tool allowlist derived from the grant mode).
- **M2:** Web console — pairing wizard, scope picker, grants dashboard, live monitor. Non-technical users, zero CLI.
- **M3:** Ephemeral session agents (TTL, reaped after the engagement), `ssh`/`repo` scopes, grant expiry UX.
- **Later:** N-party meshes, hub (master-mesh) administration, Ed25519 credentials, relay transport.

## Development

```bash
pnpm install
pnpm test        # unit + full two-node integration over real HTTP
pnpm typecheck
pnpm demo
```

MIT.
