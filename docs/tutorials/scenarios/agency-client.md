# Scenario · Agency ↔ Client — status on demand, access per sprint

**Hook.** "Agencies ask clients for standing repo access and a jump box, then keep both forever. Clients ask agencies 'where are we?' and wait a day. Both problems are the same problem."

1. **Pair** once per client relationship.
2. **Agency side** — *My agents* → *+ New agent*: `status`, folder = the project folder, purpose *"give business-friendly progress summaries"*. Share it with the client (look only, until stopped). The client can now ask *"what shipped this week? what's blocked?"* at any hour and get an answer from real project files.
3. **Client side** — two shares, both **time-boxed to the sprint**: *Share something* → **A repository** → read-only → 1 week; and → **A server** (staging) → 1 week. The share names the host and the repo — the agency's agents can't wander to a different server or repo even if asked to.
4. **The payoff** — agency asks the repo chip for `branches` / `log 10`, runs a health check on the staging chip. Client asks `status` for the weekly summary — or @mentions it in the project's GitLab MRs once the agency connects the GitLab channel (Advanced → Channels). Nobody emailed credentials.
5. **The wow** — sprint ends: both client shares expire on their own; both Activity feeds print the endings. Next sprint = two quick re-shares. "Standing access is a choice, and here the default choice is *no*."

**Recap.** One assistant per client, sprint-boxed infrastructure access, and an audit trail either side can show in the retro.
