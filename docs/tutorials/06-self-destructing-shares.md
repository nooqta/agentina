# 06 · Access that removes itself — shares with an expiry date (6 min)

**Hook (0:00–0:25).** "You brought in a contractor for a two-week sprint. Week three: do they still have access? In most companies yes — and nobody remembers why. In this video I create access that CANNOT outlive the job. When the clock hits zero it deletes itself, on camera."

**What you'll build.** A time-boxed share through the wizard's "For how long?" step, its live countdown, the on-camera self-destruct, and the same idea for servers and repositories.

## Steps

1. **The problem, on screen** (0:25): a share made "until I stop it" from episode 03. "This lives until someone remembers to click Stop. Humans forget. Timers don't."
2. **The wizard already asked** (1:00): re-run *Share something* and stop on step 4 — **For how long?** 1 hour ("gone before dinner") / 1 day / 1 week / until I stop it. Pick 1 hour. The confirm card reads: *Self-destructs after 1 hour*. "Same five taps as before — the deadline is just one of them."
3. **The countdown is everywhere** (1:45): the share row on the contact screen shows `59m left`; Amal's Ask chip shows the same countdown on HER side. "Both parties always know exactly how long is left. No surprises."
4. **The wow — the self-destruct (2:30):** film a 1-minute share (CLI: `agentina share --to "Amal" --folder ./sprint-docs --for 1m`). Split screen, let the clock run. At T-0: the share vanishes from Badis's list, Amal's chip disappears, and Activity prints *"A temporary share ended (ttl expired)"*. Amal's next ask: denied. "No cleanup meeting. No forgotten access. It's just gone."
5. **Stop early still works** (4:00): the 1-hour share's **Stop** button → same teardown, instantly. "Engagement ended early? One tap."
6. **Not just folders** (4:30): the same time-box applies to every kind in the wizard — an agent for the length of an audit, a server for one deploy window, a repository for one review:
   ```bash
   agentina share --to "Amal" --server deploy@staging.example.com --for 2h
   agentina share --to "Amal" --repo git@gitlab.example.com:acme/app.git --for 1d
   ```
   Security beat: "the host and the repo URL come from the SHARE, never from the message — the other side can't point the agent anywhere else."

**Recap + CTA (5:30).** "Access + deadline, fused — enforced by software, not memory. That's the whole toolbox. Last episode: [why all of this is safe — the security model in plain words — episode 07](07-how-you-are-protected.md)."
