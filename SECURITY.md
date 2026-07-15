# Security

agentina exists to let agents collaborate **across trust boundaries**, so the security model is the product. This document states exactly what is enforced, where, and what is out of scope — grounded in code, all of it tested.

## The model in one paragraph

Every node is owned by a **party**. Every non-loopback request is **attributed to a party before anything runs** — a bearer token maps to exactly one counterparty, and token attribution takes precedence over the loopback exemption (`grants/src/auth.ts`, regression-tested after we caught the inversion live). Attribution alone grants **nothing**: a task runs only if an **active grant** from the owner to that party covers the requested agent (`enforceGrant`, checked in the `/task` handler — the security boundary), and the grant's **scopes travel with the task as its jail**, enforced again inside the adapter (defense in depth).

## Guarantees, and where they live

| Guarantee | Enforced at | Tested |
|---|---|---|
| No grace mode: unauthenticated non-loopback traffic is always denied | `decideAuth` | ✓ |
| A presented token is judged first; invalid tokens are denied even from loopback | `decideAuth` | ✓ |
| Directional credentials: A→B and B→A are independent tokens; revocation is per party, instant | `CredentialStore` | ✓ |
| Invite links carry a **one-time** token, never a permanent credential; replay fails | pairing handshake | ✓ |
| Pairing alone grants nothing — deny-by-default per agent | `/task` + `enforceGrant` | ✓ |
| `fs` scopes: `..` traversal and **symlink escapes fail closed**; read-only means read-only | `ScopedFsAdapter.confine` | ✓ |
| Claude Code tasks: subprocess cwd jailed to the granted root; tool allowlist derived from grant mode (`ro` → Read/Grep/Glob/LS); **Bash never for remote parties** | `ClaudeCodeAdapter` | code-reviewed |
| Console + control endpoints refuse non-local callers regardless of token | route guards | ✓ |
| Channel mentions never bypass grants — the remote side enforces, denials return as the reply | `ChannelRouter` | ✓ |
| Every task, pairing, ping, grant change **and every denial** is recorded, attributed, append-only | `audit.jsonl` | ✓ |
| Secrets never in state files — channel configs store env-var *names* | `ChannelsConfig` | ✓ |
| GitLab webhook requires the `X-Gitlab-Token` secret; self-comment loop guard | `GitLabAdapter` | ✓ |

## Transport

agentina speaks HTTP and treats the network as untrusted-by-default in its *authorization* model, but **transport encryption is delegated to the network layer**:

- **Recommended**: run over a WireGuard-based overlay (Tailscale free plan, headscale, plain WireGuard) — encrypted, peer-to-peer, no ports opened. See [docs/tutorials/02-connect-two-people.md](docs/tutorials/02-connect-two-people.md).
- **Never** bind a node to a public interface with plain HTTP. If you must cross the open internet, terminate TLS in front (Caddy/nginx).
- Default bind is `127.0.0.1` — a fresh node exposes nothing until the operator chooses `--bind`.

## Out of scope (be honest with your clients)

- **A compromised host.** If the machine running a node is owned, its party is owned. agentina limits what *other parties* can do, not what root can do.
- **A malicious granting party.** The granting side enforces its own grants; it can always over-grant itself. The audit log is your recourse — both sides keep one.
- **Prompt-level behavior of LLM agents.** Scopes bound what an agent *can touch*, not what it *says*. Don't grant `rw` to anything you wouldn't let the counterparty edit by hand.
- **Denial of service.** Rate limiting is not yet implemented (roadmap).

## Planned hardening

Ed25519 per-party keypairs with signed requests (the `Credential` shape is ready), grant expiry UX, rate limiting, and signed audit-log export.

## Reporting

Open a private security advisory on GitHub (`nooqta/agentina` → Security → Report a vulnerability) or email anis.marrouchi@noqta.tn. We aim to respond within 72 hours.
