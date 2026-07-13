import { spawn } from "node:child_process"
import { resolve } from "node:path"
import type { Scope, AgentOffer } from "@agentina-mesh/protocol"
import type { AgentAdapter, AdapterTask } from "../adapter"

// --- ClaudeCodeAdapter: run tasks through the Claude Code CLI ---
//
// Defense-in-depth for fs scopes (the /task handler already refused
// ungranted parties): the subprocess cwd is jailed to the granted root
// and the tool allowlist is derived from the grant mode —
//   ro → Read, Grep, Glob, LS
//   rw → + Write, Edit
// Bash is never allowed for remote parties at M1. ANTHROPIC_API_KEY is
// stripped from the child env so a subscription-authenticated CLI can't
// silently bill an API key.
//
// Requires the `claude` binary; not exercised in CI (ScopedFsAdapter is
// the CI-safe enforcement proof).

const RO_TOOLS = ["Read", "Grep", "Glob", "LS"]
const RW_TOOLS = [...RO_TOOLS, "Write", "Edit"]
const TURN_TIMEOUT_MS = 10 * 60 * 1000

export class ClaudeCodeAdapter implements AgentAdapter {
  constructor(private opts: { binary?: string; model?: string; baseRoot?: string } = {}) {}

  async execute(offer: AgentOffer, task: AdapterTask): Promise<{ content: string }> {
    const fsScopes = (task.policy?.scopes ?? []).filter(
      (s): s is Extract<Scope, { kind: "fs" }> => s.kind === "fs",
    )
    let cwd: string
    let tools: string[]
    if (!task.policy) {
      // Local owner — unrestricted within the agent's base root.
      cwd = resolve(this.opts.baseRoot ?? process.cwd())
      tools = RW_TOOLS
    } else {
      if (fsScopes.length === 0) {
        throw new Error("denied: the grant covering this agent includes no fs scope")
      }
      cwd = resolve(fsScopes[0].root)
      tools = fsScopes[0].mode === "rw" ? RW_TOOLS : RO_TOOLS
    }

    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_API_KEY_OLD

    const args = [
      "-p", task.message,
      "--output-format", "json",
      "--allowedTools", tools.join(","),
      ...(this.opts.model ? ["--model", this.opts.model] : []),
    ]

    const binary = this.opts.binary ?? "claude"
    return new Promise((resolvePromise, reject) => {
      const child = spawn(binary, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] })
      let out = ""
      let err = ""
      const timer = setTimeout(() => {
        child.kill("SIGKILL")
        reject(new Error(`claude turn exceeded ${TURN_TIMEOUT_MS / 60000} min`))
      }, TURN_TIMEOUT_MS)
      child.stdout.on("data", (c) => { out += c })
      child.stderr.on("data", (c) => { err += c })
      child.on("error", (e) => { clearTimeout(timer); reject(e) })
      child.on("close", (code) => {
        clearTimeout(timer)
        if (code !== 0) return reject(new Error(`claude exited ${code}: ${err.slice(0, 300)}`))
        try {
          const parsed = JSON.parse(out) as { result?: string; is_error?: boolean }
          if (parsed.is_error) return reject(new Error(String(parsed.result ?? "claude error")))
          resolvePromise({ content: String(parsed.result ?? "") })
        } catch {
          resolvePromise({ content: out.trim() })
        }
      })
    })
  }
}
