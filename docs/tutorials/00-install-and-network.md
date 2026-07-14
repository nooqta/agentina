# 00 · Install + connect two machines — free, in 10 minutes

**Hook (0:00–0:25).** "Before two AI agents can collaborate across companies, two *machines* have to see each other — yours and your client's, behind different routers, different firewalls. No port forwarding, no static IP, no paid service. Here's the free way, start to finish."

**What you'll build.** Both parties install agentina, join a free private network, and verify reachability — the prerequisite for every other tutorial.

## Part 1 — Install (both sides, 1 minute each)

Requirements: Node.js 20+ (nodejs.org, LTS button, next-next-finish).

```bash
npx agentina init --name "Amal"     # your party identity, created once
```

That's the install. No account, no signup, nothing leaves the machine.

## Part 2 — The network (the part everyone skips)

agentina is network-agnostic: a peer is anything with a reachable URL. The problem is that two home/office machines usually *can't* reach each other. You need an overlay network — and the free options are genuinely free:

**Option A — Tailscale (recommended; easiest for non-technical clients).**
1. Both parties install Tailscale (tailscale.com/download) and sign in — the personal plan is free.
2. Each machine gets a stable private IP that works from anywhere: `tailscale ip -4` → something like `100.84.12.7`.
3. Two parties = two separate tailnets by default, so connect them one of two free ways:
   - **Share the machine** (cleanest): Tailscale admin console → your node's machine → *Share* → send the link; the client accepts and your machine appears in *their* tailnet. Access in one direction per share — share both machines for two-way pairing.
   - **Invite them as a user** to your tailnet (the free plan includes multiple users) — simpler, but they join *your* network; prefer sharing between businesses.
4. On camera: ping the other side's 100.x IP. "That's it. Encrypted, peer-to-peer, no port opened anywhere."

**Option B — headscale (self-hosted, unlimited, for businesses that want zero third parties).** Run the open-source coordination server on any small VPS; clients still use the normal Tailscale apps pointed at your server. More setup, total control.

**Option C — plain WireGuard.** One config file per side; fine for two fixed machines, tedious beyond that.

**Option D — same office LAN.** Nothing to install; use the machine's LAN IP.

> Whatever you choose, agentina doesn't care — it sees "an IP that answers." The overlay also brings **encryption in transit for free** (WireGuard under the hood), which is why we recommend it over exposing plain HTTP to the internet. If you must go over the open internet instead, put the node behind a TLS reverse proxy (Caddy: two lines) — never plain HTTP on a public interface.

## Part 3 — Start the node on the network (both sides)

```bash
tailscale ip -4                       # e.g. 100.84.12.7
npx agentina start --bind 100.84.12.7
```

`--bind` makes the node listen on the overlay address AND advertises it in invites automatically. Default (no `--bind`) is 127.0.0.1 — local-only, on purpose: nothing is exposed until you decide.

Console: open `http://100.84.12.7:7411/` **from the machine itself** — the console and all control actions refuse remote callers by design; the other party only ever reaches the API surface, with their token.

## Part 4 — The wow: prove it (2 minutes)

Party A's console → *Create invite link* → send it over any chat.
Party B → *Join* → both Peers lists turn green → **Test connection** → "answered in 23ms".

"Two machines, two owners, two networks — talking, encrypted, for free. Everything else in this series builds on this."

**Recap + CTA.** Install → overlay network → `--bind` → pair → test. Next: [01 — pairing, and what those directional tokens actually are](01-pair-two-parties.md).

## Troubleshooting box (end screen)

- *Invite says unreachable* → the inviter started without `--bind`, or the invitee isn't on the overlay yet (`tailscale status`).
- *Console shows 403 from another machine* → correct behavior; the console is owner-only. Manage from the node's own machine.
- *Windows firewall prompt on first start* → allow on private networks.
