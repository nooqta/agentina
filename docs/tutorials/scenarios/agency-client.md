# Scenario · Agency ↔ Client — status on demand, access per sprint

**Hook.** "Agencies ask clients for standing repo access and a jump box, then keep both forever. Clients ask agencies 'where are we?' and wait a day. Both problems are the same problem."

1. **Pair** once per client relationship.
2. **Agency side** (wizard → "I'm the agency") — create the client's *status* assistant over the project folder; share it. The client can now ask *"what shipped this week? what's blocked?"* at any hour and get a business-friendly answer from real project files.
3. **Client side** (wizard → "I'm the client") — two steps, both **time-boxed to the sprint (2 weeks)**: repo, read-only; staging server access. The grant names the host and the repo — the agency's agents can't wander to a different server or repo even if asked to.
4. **The payoff** — agency asks 🌿 for `branches` / `log 10`, runs a health check on 🖥 staging. Client asks 🤖 status for the weekly summary. Nobody emailed credentials.
5. **The wow** — sprint ends: both client shares expire on their own, red `session-close` lines in both audits. Next sprint = two clicks to re-share. "Standing access is a choice, and here the default choice is *no*."

**Recap.** One assistant per client, sprint-boxed infrastructure access, and an audit trail either side can show in the retro.
