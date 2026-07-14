# 05 · This agent will self-destruct — temporary AI workers for client engagements

**Hook (0:00–0:25).** "You brought in a contractor for a two-week sprint. Week three, do they still have access? In most companies: yes, and nobody remembers why. Watch me create an agent that *cannot* outlive the engagement — when the clock hits zero, it deletes itself, and its access dies with it."

**What you'll build.** A session: an ephemeral agent + a grant that share one TTL. Close it early or let it lapse — either way, nothing survives.

## Steps

1. **The problem, on screen** (0:25): show the Grants card from tutorial 02. "This grant I made? It lives until someone remembers to revoke it. Humans forget. Sessions don't."
2. **Open a session — console** (1:00): Sessions card → peer `Amal (freelancer)`, ttl `2h`, adapter `scoped-fs`, directory `./sprint-docs`, read-only → *Open session*. Point at the list: the ephemeral agent with its **live countdown**. Same thing in one command:
   ```bash
   agentina session --to "Amal" --ttl 2h --adapter scoped-fs --root ./sprint-docs --fs ./sprint-docs --mode ro
   ```
3. **It's a real agent while it lives** (2:00): Amal tasks it — `read plan.md` → works. Show *Your agents*: the session agent sits next to the permanent ones with a `session` badge.
4. **The wow — the self-destruct (2:45):** open a second session with `--ttl 1m` and let the camera run. At T-0: the agent vanishes from *Your agents*, the grant flips to revoked, and the Activity feed prints `session-close … (ttl expired)`. Amal's next task: **403**. "No cleanup meeting. No forgotten access. It's just gone."
5. **Close early** (4:00): the *Close now* button on the 2h session → same teardown, instantly. "Engagement ended early? One click."
6. **Server and repo scopes** (4:40): sessions aren't just files —
   ```bash
   agentina session --to "Amal" --ttl 1h --adapter ssh-exec  --ssh deploy@staging.example.com
   agentina session --to "Amal" --ttl 1d --adapter scoped-git --repo git@gitlab.example.com:acme/app.git
   ```
   Call out the security beat: "the host and the repo URL come from the **grant**, never from the task message — the counterparty can't point the agent anywhere else." And read-only means the tool allowlist, not a promise.
7. **Expiring grants without sessions** (5:40): the Grants form now takes `expires: 7d` — for permanent agents that need time-boxed access. Countdown chips on every grant.

**Recap + CTA (6:20).** "Session = agent + access + deadline, fused. Your client engagements now have an expiry date the software enforces. Star the repo — next up: your whole team of parties on one screen."
