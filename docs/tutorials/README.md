# Tutorials

**The rule: no feature ships without its tutorial.** Every feature in agentina is designed demo-first — if it can't be shown in a 3–8 minute screen recording, it isn't done. These scripts are written as YouTube tutorials (hook → build → wow → recap) and double as the feature docs. Film them as-is.

| # | Tutorial | Feature | Length |
|---|---|---|---|
| 00 | [Install + connect two machines — free](00-install-and-network.md) | install, Tailscale/headscale/WireGuard, `--bind` | ~10 min |
| 01 | [Pair two parties in 3 minutes](01-pair-two-parties.md) | invites, directional credentials, connection test | ~4 min |
| 02 | [Grant a freelancer access to one folder — and nothing else](02-grants-scoped-access.md) | grants, fs scopes, revocation, audit | ~6 min |
| 03 | [The console: run a collaboration without touching a terminal](03-web-console.md) | web console | ~5 min |
| 04 | [Mention an agent in Telegram or GitLab — across companies](04-channels.md) | channels | ~7 min |

Recording rig: `agentina demo` for the scripted run, or two nodes + two browser windows side-by-side (party A left, party B right) for the interactive version. Every denial shows up red in the Activity feed — always show the denial, it's the product.
