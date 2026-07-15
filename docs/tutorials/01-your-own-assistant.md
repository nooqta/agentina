# 01 · Your own AI assistant — on your machine, in your chat app (6 min)

> **The solo episode.** agentina is useful before any second person exists. This is the video that makes someone install it *today*: a private assistant that lives in a folder, learns from markdown files, and answers on their own Telegram.

**Hook (0:00–0:20).** "By the end of this video, a private AI assistant will live on my laptop, know MY project, and answer me from MY phone — like texting a person. No cloud account holds my files. No subscription dashboard. A folder, a bot, done."

**What you'll build.** One agent (`assistant`) jailed to one folder, with one skill file, bound to its own Telegram bot.

## Steps

1. **Create the agent — three questions** (0:20): console → *My agents* → *+ New agent*. The wizard asks exactly three things:
   - a name (`assistant`) — "short, you'll @mention it later"
   - a folder — "its whole world; it cannot see outside this folder" *(pick one on camera with the suggestions)*
   - what it helps with, in plain language — "this becomes its personality"
2. **The AI banner, honestly** (1:20): if Claude isn't installed the console says so and shows the one command. Copy → run → *I installed it* → "Found it". "The app checks the machine — you never guess."
3. **Give it a skill** (2:00): drop `project-glossary.md` into `folder/skills/`. Refresh the agent's edit screen — the skill is listed with a toggle. "A skill is a markdown file. Edit the file, the next answer uses it. That's the whole plugin system."
4. **The wow — its own Telegram line (2:45):** agent edit screen → Channels → *+ Telegram*:
   - BotFather on the phone: `/newbot`, copy the token *(blur it)*
   - back in the console, the form is already set to "Who answers here? → **assistant**"
   - paste the token → **Save** → toast: "telegram is on — answering as assistant"
   - "No restart. No terminal. The token stays on this machine, in a file only I can read."
5. **Message it like a person** (4:00): phone on camera — DM the bot *"what does MRR mean in our glossary?"* → the answer comes from the skill file, from the laptop. "No @mention needed — this bot IS the assistant. That's per-agent, per-channel: my bookkeeper can have its own bot next to this one."
6. **The receipt** (5:00): console → Activity — the ask is logged. "Even solo, everything is on the record. That habit pays off in the next episode."

**Recap + CTA (5:30).** "Agent in a folder → skill as a markdown file → its own bot → answered from my phone. Zero other people involved. Next: [connect with one other person — episode 02](02-connect-two-people.md)."

## Troubleshooting box (end screen)

- *Bot doesn't answer* → is the node running? Is the channel pill "On" (not "Not running")? A wrong token shows the exact error in the toast when you save.
- *Answers ignore my skill* → the file must end in `.md` and sit in `<agent folder>/skills/`; check the toggle is on in the agent's edit screen.
- *"AI assistants aren't set up"* → that's the banner from step 2 — one command, then "I installed it".
