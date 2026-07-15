# The agentina playlist

**The rule: no feature ships without its tutorial.** Every feature is designed demo-first — if it can't be shown in a 2–8 minute screen recording, it isn't done. These scripts ARE the feature docs; film them as-is.

**The playlist is a staircase.** Each episode assumes only the ones before it, ends on the next one's door, and is watchable alone. Value order, not architecture order: the viewer gets something useful *for themselves* by episode 01, before any second person exists.

| # | Episode | You walk away with | Length |
|---|---|---|---|
| 00 | [Meet agentina](00-meet-agentina.md) | installed, oriented, two promises understood | 2 min |
| 01 | [Your own AI assistant](01-your-own-assistant.md) | a private agent answering YOU on Telegram — solo, no second party | 6 min |
| 02 | [Connect with one other person](02-connect-two-people.md) | two machines paired with one link — and proof it shares nothing | 7 min |
| 03 | [Share one folder — and watch it try to escape](03-share-something-safely.md) | the 5-tap share wizard + the jail holding on camera | 6 min |
| 04 | [Ask their agents](04-ask-their-agents.md) | two-way work without attachments; denials in the open | 6 min |
| 05 | [Your chat apps become the front-end](05-channels.md) | WhatsApp/Telegram/Discord/Slack/GitHub/GitLab — paste a token, Save | 8 min |
| 06 | [Access that removes itself](06-self-destructing-shares.md) | time-boxed shares self-destructing on camera | 6 min |
| 07 | [How you're protected](07-how-you-are-protected.md) | the security model in plain words — the episode you send your client | 5 min |

**Scenario series** — one video per real-world relationship, for viewers who arrive asking "is this for me?" (each is episodes 02–04 compressed into one story):

| Scenario | Script |
|---|---|
| Freelancer ↔ Client | [scenarios/freelancer-client.md](scenarios/freelancer-client.md) |
| Accountant ↔ Small business | [scenarios/accountant-business.md](scenarios/accountant-business.md) |
| Agency ↔ Client | [scenarios/agency-client.md](scenarios/agency-client.md) |
| IT helper ↔ Family | [scenarios/it-helper-family.md](scenarios/it-helper-family.md) |

## House style (every episode)

- **Console first, terminal never** — after `agentina start`, everything happens in the web console. CLI equivalents go in the video description, not on camera.
- **Show the denial** — every episode has at least one red entry. The denial IS the product.
- **Honest UI only** — no mock data, no "pretend this worked". If a token is fake, film the real error toast.
- **The app teaches itself** — when a step needs setup (AI runtime, network address, public HTTPS), film the console's own banner/card doing the guiding, not a slide.
- **Hook → build → wow → recap**, one wow per episode, recap ends on the next episode's title.

## Recording rig

Two nodes on one machine (`--state` + `--port` twice), two browser windows side by side — party A left, party B right. Phone on camera for the channel episodes. `npx agentina demo` gives the scripted attack run for episode 07's description. The console's Help & guides mirror this playlist one-to-one — a viewer who lands in the app finds the same staircase.
