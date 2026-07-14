# 01 · Pair two parties in 3 minutes

**Hook (0:00–0:20).** "Your agents can talk to your machines. But can they talk to your *client's* agents — without you handing over a shared password? In 3 minutes, two completely separate machines will trust each other, and you'll see exactly what that trust is made of."

**What you'll build.** Two agentina nodes — Amal the freelancer, Badis the client — paired over any network, each holding a *directional* credential for the other.

## Steps

1. **Both sides, 30 seconds each** (0:20):
   ```bash
   npx agentina init --name "Amal" && npx agentina start
   ```
   Point at the console URL it prints. "That's the whole install."
2. **Badis creates an invite** (1:00): console → *Create invite link*. Call out on screen: "This link holds a **one-time token** — not a password. Once redeemed, the link is worthless. Leak it after use, nothing happens."
3. **Amal joins** (1:30): paste the link → *Join*. Show both consoles' Peers lists lighting up green simultaneously.
4. **The wow (2:00):** open the state file (`~/.agentina/node.json`) on both sides. "Look — TWO different tokens. Amal→Badis and Badis→Amal are *separate* credentials. Revoke one direction, the other still works. No shared secret exists anywhere."
5. **Connection test** (2:30): *Test connection* button → latency toast. "Authenticated, both directions, measured."

**Recap + CTA (3:00).** "Pair → directional tokens → test. Next video: what can Amal actually *do* now? Nothing — and that's the point. Grants are next."
