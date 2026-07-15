# 07 · How you're protected — the whole security model in plain words (5 min)

> **The trust episode.** No new features. This is the video someone sends their client — or their skeptical IT person — so both sides agree to use agentina. Everything in it was already SHOWN in episodes 02–06; this one just names the rules.

**Hook (0:00–0:20).** "You've watched an AI read a client's files across the internet for six episodes. Before you use this for real work, you deserve to know exactly why that's safe — in plain words, with every claim demonstrated, not promised."

## The five rules (one screen each, with the receipts)

1. **No accounts, no cloud in the middle** (0:20): the two machines talk directly. Nothing you share passes through anyone's servers. *(Receipt: the network guide from episode 02 — a private hallway, not a public street.)*
2. **Connecting shares nothing** (1:00): an invite is a one-time introduction. *(Receipt: episode 02's locked Ask screen, and the invite link dying on second use.)*
3. **Every request carries ID** (1:40): pairing mints two separate one-way credentials; every incoming request is attributed to a person before anything runs, and strangers get rejected and logged. *(Receipt: the two tokens in `node.json`; the "not one of your people" line in Activity.)*
4. **Shares are enforced, not promised** (2:30): look-only means the machine refuses writes; a folder share means `..` tricks and symlink escapes fail; time-boxes self-destruct. The OWNER'S machine enforces its own rules — the other side never gets a vote. *(Receipt: episode 03's escape attempts; episode 06's on-camera expiry.)*
5. **The log can't be edited and never lies** (3:30): append-only, on BOTH machines, denials included; every ask from a chat channel lands there too. *(Receipt: any Activity feed from any episode — the red entries are the product.)*
6. **Tokens you paste stay home** (4:10): channel tokens live in an owner-only file next to agentina's own credentials, never in the state file, never transmitted; environment variables override for pros. And the console itself refuses every remote caller — only the machine's owner drives it.

**Recap + CTA (4:40).** "Direct connection, one-time invites, per-person credentials, machine-enforced shares, tamper-evident logs, secrets that stay home. That's the whole model — and you watched every piece of it work. The scenario videos show it applied to real relationships: freelancer↔client, accountant↔business, agency↔client, IT-helper↔family. Pick yours."

## For the technical viewer (description box)

The precise model — party attribution, grant enforcement, scope jails, audit format — is documented in [SECURITY.md](../../SECURITY.md). The demo (`npx agentina demo`) runs the full loop including the attacks: replayed invite, forged token, path escape, revoked-grant read — all denied, all logged.
