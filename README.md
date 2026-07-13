# agentina

**Agent collaboration across trust boundaries.**

Two parties — a freelancer and a client, two companies, two machines that don't belong to the same person — pair their nodes over any IP network, grant each other *scoped* access, and let their agents work together. Every request is attributed to a party before anything runs. Every decision lands in an append-only audit log. Self-hosted, no accounts, no telemetry.

```
  agentina demo — two parties, one trust boundary, loopback only

  ✓ pair — Badis joined "Amal (freelancer)" — parties exchanged directional tokens
  ✓ invite replay rejected — the redeemed link is worthless
  ✓ connection test — Badis→Amal 1ms · Amal→Badis 0ms
  ✓ task round-trip — "echo from Echo: hello across the boundary"
  ✓ forged token denied — GET /ping with a forged token → 401
  ✓ revocation — after revoke, Badis→Amal ping → 401
  ✓ audit trail — 6 entries (pair, ping, task, auth-denied)
```

Try it in 30 seconds (no keys, no config):

```bash
npx agentina demo
```

## Why

Multi-agent frameworks connect machines that all belong to **one** operator — trust is a shared secret, and any authenticated peer can invoke any agent. The moment two *different* owners want their agents to collaborate, you need more:

- **Parties, not just peers.** Every node is owned by a party; every inbound request is attributed to one before it runs.
- **Directional credentials.** Pairing mints two independent tokens — one per direction. Revoke one party without touching the rest. Invite links carry a one-time token, never a permanent secret.
- **Grants, authored and enforced by the granting side** *(M1)*: "this party may invoke these agents, scoped to this directory / repo / server / skill."
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
```

## Packages

| Package | What it is |
|---|---|
| `agentina` | The CLI and node daemon. |
| `@agentina-mesh/protocol` | Wire types: A2A + party/grant extensions. Zero deps. |
| `@agentina-mesh/peer` | Peer registry, health checks with hysteresis, task exchange, invite codec. |
| `@agentina-mesh/grants` | Party attribution (`decideAuth`), credentials, audit log. |
| `@agentina-mesh/node` | The daemon: agent-card, `/task`, pairing handshake, control API. |

## Roadmap

- **M0 (now):** pair → connection test → task exchange → deny → revoke → audit. Echo agent.
- **M1:** Grants enforced at `/task` (party → allowed agents), `fs`/`skill` scopes, real agent adapter (Claude Code).
- **M2:** Web console — pairing wizard, scope picker, grants dashboard, live monitor. Non-technical users, zero CLI.
- **M3:** Ephemeral session agents (TTL, reaped after the engagement), `ssh`/`repo` scopes, grant expiry.
- **Later:** N-party meshes, hub (master-mesh) administration, Ed25519 credentials, relay transport.

## Development

```bash
pnpm install
pnpm test        # unit + full two-node integration over real HTTP
pnpm typecheck
pnpm demo
```

MIT.
