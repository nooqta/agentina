import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
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

export function loadSkillsText(workspace: string, disabledSkills?: string[]): string {
  const off = new Set(disabledSkills ?? [])
  const parts: string[] = []
  let total = 0
  const push = (name: string, body: string) => {
    if (off.has(name)) return
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

// --- Skill file management (add / update / remove) ---
//
// Skills are just files in the agent's workspace, so "managing" them is
// writing/deleting those files — the next turn re-reads the folder, so
// changes are live with no restart. Every name is sanitized to a bare
// `<name>.md` (or the special `SKILL.md`): no slashes, no `..`, so a
// managed skill can never write outside <workspace>/skills.

export function sanitizeSkillFile(file: string): string {
  const raw = String(file ?? "").trim()
  if (raw === "SKILL.md") return raw
  const base = raw.replace(/\.md$/i, "")
  const name = base.replace(/[^A-Za-z0-9_-]/g, "")
  if (!name) throw new Error("invalid skill file name")
  return `${name}.md`
}

/** Absolute path of a skill file inside the agent's workspace. */
export function skillPath(workspace: string, file: string): string {
  const f = sanitizeSkillFile(file)
  return f === "SKILL.md" ? join(workspace, "SKILL.md") : join(workspace, "skills", f)
}

/** Create or overwrite a skill file; returns the normalized file name. */
export function writeSkill(workspace: string, file: string, content: string): string {
  const f = sanitizeSkillFile(file)
  if (f !== "SKILL.md") mkdirSync(join(workspace, "skills"), { recursive: true })
  writeFileSync(skillPath(workspace, f), String(content ?? ""), "utf-8")
  return f
}

/** Delete a skill file. Returns false if it wasn't there. */
export function removeSkill(workspace: string, file: string): boolean {
  const p = skillPath(workspace, file)
  if (!existsSync(p)) return false
  rmSync(p)
  return true
}

/** Full, uncapped content of one skill file — for editing in the console
 *  (loadOneSkill truncates, which is right for serving but wrong here). */
export function readSkill(workspace: string, file: string): string | undefined {
  const p = skillPath(workspace, file)
  if (!existsSync(p)) return undefined
  return readFileSync(p, "utf-8")
}

/** Read one skill file's text, budget-capped — used to serve a single
 *  shared skill without loading the whole workspace. */
export function loadOneSkill(workspace: string, file: string): string | undefined {
  const p = skillPath(workspace, file)
  if (!existsSync(p)) return undefined
  const body = readFileSync(p, "utf-8")
  return body.length > PER_FILE_CAP ? body.slice(0, PER_FILE_CAP) + "\n… (truncated)" : body
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

/** One human line per skill file for the console's toggle list — the
 *  first heading or non-empty line of the markdown. */
export function listSkills(workspace: string): Array<{ file: string; desc: string }> {
  return listSkillNames(workspace).map((file) => {
    const path = file === "SKILL.md" ? join(workspace, file) : join(workspace, "skills", file)
    let desc = ""
    try {
      const firstLine = readFileSync(path, "utf-8")
        .split("\n")
        .map((l) => l.replace(/^#+\s*/, "").trim())
        .find((l) => l.length > 0)
      desc = (firstLine ?? "").slice(0, 80)
    } catch { /* unreadable — show the file with no description */ }
    return { file, desc }
  })
}
