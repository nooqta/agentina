# 03 · Share one folder — and watch it try to escape (6 min)

**Hook (0:00–0:25).** "My machine holds this client's project — and also my contracts, my other clients, my everything. Watch me share exactly ONE folder, read-only, for one week… and then watch their agent try to break out of it. Live, on camera, three different ways."

**What you'll build.** One share: Badis gives Amal his `project-docs` folder, look-only, for a week — through the 5-question wizard, no terminal.

## Steps

1. **The default is NO** (0:25): Amal opens *Ask their agents* before anything is shared → the lock screen. Then force a raw ask (CLI) → **403 no-grant**, red in Badis's Activity, attributed to Amal's party id. "Pairing granted nothing. Remember that."
2. **The share wizard — five taps** (1:15): Badis → contact → *Share something*:
   1. **What?** — a folder / one of my agents / a server / a repository *(pick folder)*
   2. **Which?** — pick `project-docs` from the suggestions
   3. **How much?** — "Look only — they can read, never change anything. Enforced by your machine, not by trust."
   4. **How long?** — 1 hour / 1 day / 1 week / until I stop it *(pick a week — point at "when time's up it self-destructs")*
   5. **Confirm** — the summary card: what, RO, TTL, STOP. "This is everything Amal will get." → **Share it** → the green check.
3. **It works** (2:45): Amal's Ask screen now shows the `amal-docs` chip. *"read brief.txt"* → the brief streams back from Badis's machine.
4. **The wow — the escape attempts (3:30):**
   - `read ../secret.txt` → the red bubble: **denied — outside every granted directory**. "That's a path-traversal attack, blocked, and logged on BOTH sides."
   - a symlink inside the shared folder pointing at the secret → **denied** (symlink escape, blocked)
   - ask an agent that was never shared → **agent-not-granted**. "The share covers exactly what the summary card said. Nothing else."
5. **Stop it in one tap** (4:45): Badis → contact → the share's **Stop** button → Amal's very next read → denied. "No token rotation, no redeploy, no IT ticket."
6. **The receipt** (5:15): both Activity feeds, side by side — every read, every denial, every stop, in plain sentences with timestamps. "This is what you show the client when they ask what the agent touched."

**Recap + CTA (5:40).** "Deny by default → five taps to share → the jail holds → one tap to stop → both sides keep the receipt. Next: [actually working together — asking their agents — episode 04](04-ask-their-agents.md)."
