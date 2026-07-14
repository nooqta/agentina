import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

// --- Agent skills, the agentx way ---
//
// An agent's skills are markdown files in its workspace:
//   <workspace>/SKILL.md         — the agent's own capability sheet
//   <workspace>/skills/*.md      — one file per skill
// They're injected into the provider's system prompt at execution time,
// so editing a skill file changes the agent's next turn — no restart,
// no config. Budget-capped so a fat skills dir can't blow the context.

const PER_FILE_CAP = 4_000
const TOTAL_CAP = 12_000

export function loadSkillsText(workspace: string): string {
  const parts: string[] = []
  let total = 0
  const push = (name: string, body: string) => {
    const clipped = body.length > PER_FILE_CAP ? body.slice(0, PER_FILE_CAP) + "\n… (truncated)" : body
    if (total + clipped.length > TOTAL_CAP) return
    total += clipped.length
    parts.push(`## Skill: ${name}\n${clipped.trim()}`)
  }

  const root = join(workspace, "SKILL.md")
  if (existsSync(root)) push("SKILL.md", readFileSync(root, "utf-8"))

  const dir = join(workspace, "skills")
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
      try {
        push(f, readFileSync(join(dir, f), "utf-8"))
      } catch { /* unreadable skill file — skip, never crash a turn */ }
    }
  }

  return parts.length ? `# Your skills\n\n${parts.join("\n\n")}` : ""
}

/** Skill names only — for agent cards and the console. */
export function listSkillNames(workspace: string): string[] {
  const names: string[] = []
  if (existsSync(join(workspace, "SKILL.md"))) names.push("SKILL.md")
  const dir = join(workspace, "skills")
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) names.push(f)
  }
  return names
}
