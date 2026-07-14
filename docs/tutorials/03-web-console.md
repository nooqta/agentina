# 03 · The console: run a collaboration without touching a terminal

**Hook (0:00–0:20).** "Everything you saw in the last two videos — pairing, grants, revocation — your *client* has to do half of it. Your client does not use a terminal. So every agentina node serves this." *(cut to the console)*

**What you'll build.** The full freelancer↔client loop, two browser windows side by side, zero CLI after `agentina start`.

## Steps

1. **The layout tour** (0:20): numbered cards — *1 Pair*, *2 Grant*, *3 Send a task*, Activity. "The numbers ARE the onboarding. Do them in order, you're collaborating."
2. **Split screen** (0:50): Amal's console left, Badis's right. Badis clicks *Create invite link* — it's copied automatically. Amal pastes → *Join*. Both Peers lists go green live.
3. **Test connection** (1:40): click → "answered in 1ms" toast. "That's an authenticated round-trip, not a ping."
4. **The grant, as a form** (2:10): peer dropdown, agent dropdown, a directory field, and a read-only/read-write toggle. "This is the entire access-control model. A client can reason about this."
5. **Send a task from the browser** (3:00): `read brief.txt` → reply renders in place. Then `read ../secret.txt` → the ⛔ denial renders *as the reply*. "The UI never pretends. A denial is an answer."
6. **The wow (3:45):** Badis clicks *Revoke* mid-session → Amal's very next task fails, and BOTH activity feeds show it — red on Badis's side with Amal's party id, the ⛔ reply on Amal's side. "Revocation you can watch propagate."
7. **Activity feed close-up** (4:20): "Every pair, ping, task, grant, and denial. This feed is the audit log — same file, same entries, `audit.jsonl` on disk."

**Recap + CTA (4:50).** "Pair, grant, task, revoke — all clickable, all audited. Next video: your client never even opens this page, because the agent answers them inside Telegram and GitLab."
