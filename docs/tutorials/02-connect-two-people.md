# 02 · Connect with one other person — one link, one paste (7 min)

**Hook (0:00–0:20).** "My machine, my client's machine — different homes, different routers, different countries. In this video they shake hands with one link sent over WhatsApp, and I'll show you exactly what that handshake does and doesn't give away. Spoiler: it gives away nothing."

**What you'll build.** Two agentina nodes — Amal the freelancer, Badis the client — connected and green, each holding a *directional* credential for the other.

## Steps

1. **Same machine first — the 30-second version** (0:20): two state dirs, two ports, two browser windows side by side. Amal: *Invite someone* → the link appears with "works once, expires in 15 minutes". Badis: *I have an invite link* → paste → **Join**. Both home screens light up with the other's name, live. "That's the whole pairing. Now the real world."
2. **Different machines — the one-tap address** (1:30): on a fresh machine the invite screen itself says it: *"Inviting someone on another machine? One tap first."* If Tailscale is installed there's a button with your actual address — **Use my Tailscale address** → toast → a fresh link is minted, now reachable. "No restart, no terminal, no config file. The app rebinds itself."
3. **Don't have Tailscale?** (2:30): the *plain-language guide* linked right there — the "private hallway between two houses" explanation, three options ranked (Tailscale easiest·free / WireGuard / public address), and the guide ends on the button that applies the address. Both parties do this once, ever.
4. **Send the invite for real** (3:30): over any chat. On camera: paste it a SECOND time after Badis joined → "invalid or expired invite" in red. "The link died the moment it was used. Leak it afterwards — worthless."
5. **The wow — what the trust is made of (4:30):** open `node.json` on both sides *(briefly, blurred except two lines)*: TWO different tokens — Amal→Badis and Badis→Amal are separate credentials. "No shared password exists anywhere. Revoke one direction, the other still works."
6. **Test it** (5:30): contact screen → *test connection* → "Badis answered in 1 ms". "Authenticated round-trip, not a ping."
7. **The punchline** (6:00): open *Ask their agents* → the lock screen: "Badis hasn't shared anything yet." — "Connected is NOT the same as shared. Badis's files are exactly as private as before. What sharing looks like is the next episode."

**Recap + CTA (6:30).** "One link, one paste, two one-way credentials, zero access. Next: [share one folder — and watch it try to escape — episode 03](03-share-something-safely.md)."

## Troubleshooting box (end screen)

- *Invite says unreachable* → the inviter never set an address (the yellow card on their invite screen fixes it in one tap), or the invitee isn't on the same private network yet (`tailscale status`).
- *Console shows 403 from another machine* → correct behavior; the console is owner-only. Each person drives their own machine.
- *Windows firewall prompt on first start* → allow on private networks.
