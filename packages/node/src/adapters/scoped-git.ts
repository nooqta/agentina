import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Scope, AgentOffer } from "@agentina-mesh/protocol"
import type { AgentAdapter, AdapterTask } from "../adapter"

// --- ScopedGitAdapter: read a repository the grant names ---
//
// Commands: `branches` and `log [n]`. The repository URL comes
// exclusively from the grant's repo scope — never from the message.
// Read-only operations only at M3 regardless of mode (rw is reserved
// for a future push/PR flow). `log` uses a shallow clone into a temp
// dir that is removed afterwards.

const TIMEOUT_MS = 2 * 60 * 1000

function git(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    let err = ""
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("git timed out")) }, TIMEOUT_MS)
    child.stdout.on("data", (c) => { out += c })
    child.stderr.on("data", (c) => { err += c })
    child.on("error", (e) => { clearTimeout(timer); reject(e) })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(`git exited ${code}: ${err.slice(0, 300)}`))
      resolve(out)
    })
  })
}

export class ScopedGitAdapter implements AgentAdapter {
  async execute(offer: AgentOffer, task: AdapterTask): Promise<{ content: string }> {
    if (!task.policy) {
      throw new Error("denied: scoped-git runs only under a grant with a repo scope")
    }
    const repo = task.policy.scopes.find((s): s is Extract<Scope, { kind: "repo" }> => s.kind === "repo")
    if (!repo) throw new Error("denied: the grant covering this agent includes no repo scope")

    const [verb, ...rest] = task.message.trim().split(/\s+/)

    if (verb === "branches") {
      const out = await git(["ls-remote", "--heads", repo.url])
      const names = out.trimEnd().split("\n").filter(Boolean).map((l) => l.split("refs/heads/")[1]).filter(Boolean)
      return { content: names.length ? names.join("\n") : "(no branches)" }
    }

    if (verb === "log") {
      const n = Math.min(Math.max(parseInt(rest[0] || "10", 10) || 10, 1), 50)
      const dir = mkdtempSync(join(tmpdir(), "agentina-git-"))
      try {
        await git(["clone", "--depth", String(n), "--quiet", repo.url, dir])
        const out = await git(["log", `--max-count=${n}`, "--pretty=format:%h %ad %s", "--date=short"], dir)
        return { content: out.trim() || "(no commits)" }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }

    throw new Error(`unknown command "${verb}" — this agent understands: branches, log [n]`)
  }
}
