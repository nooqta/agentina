# 02 · Grant a freelancer access to one folder — and nothing else

**Hook (0:00–0:25).** "You hired a freelancer. Her AI agent needs your project brief — but your machine also holds your contracts, your financials, your *everything*. Watch me give her agent exactly one folder, read-only, and then watch it try to escape."

**What you'll build.** A grant: Amal's party may invoke Badis's `files` agent, scoped to `./project-docs`, read-only.

## Steps

1. **The setup** (0:25): Badis offers a file agent over his project directory:
   ```bash
   agentina offer --id files --adapter scoped-fs --root ~/client-project
   ```
   Show the directory: `project-docs/brief.txt` inside, `secret.txt` beside it.
2. **The default is NO** (1:00): Amal sends `read brief.txt` → **403 no-grant**. Freeze frame on Badis's Activity feed: the denial in red, attributed to Amal's party id. "Pairing alone grants nothing. Remember that."
3. **The grant** (2:00): Badis's console → Grant card → agent `files`, directory `project-docs`, read-only → *Grant*. "Authored by the granting side, enforced by the granting side. Amal's node never gets a say."
4. **It works** (2:45): Amal: `read brief.txt` → the brief streams back across the boundary.
5. **The wow — the escape attempts (3:30):**
   - `read ../secret.txt` → **denied: outside every granted directory** (path traversal, blocked)
   - a symlink inside the granted dir pointing at the secret → **denied** (symlink escape, blocked — show the test)
   - task to the `echo` agent → **agent-not-granted** (the grant covers `files` only)
6. **Revoke** (5:00): one click → Amal's next read → 403. "Instant. No token rotation, no redeploy."
7. **The receipt** (5:30): scroll the audit log — every allow AND every denial, attributed. "This is what you show the client when they ask what the agent touched."

**Recap + CTA (5:50).** "Deny by default → grant a folder → watch the jail hold → revoke in one click. Next: doing all of this from a web page your client can actually use."
