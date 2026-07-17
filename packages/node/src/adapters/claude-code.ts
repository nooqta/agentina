import { spawn } from "node:child_process"
import { writeFileSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"
import type { Scope, AgentOffer } from "@agentina-mesh/protocol"
import type { AgentAdapter, AdapterTask } from "../adapter"
import { loadSkillsText } from "../skills"

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
  private mcpConfigPath?: string

  constructor(private opts: {
    binary?: string
    model?: string
    baseRoot?: string
    systemPrompt?: string
    /** Skill files the owner toggled off — kept on disk, not injected. */
    disabledSkills?: string[]
    /** Launch spec for the agentina MCP bridge — gives the agent
     *  list_peer_shares / ask_peer, i.e. everything its OWNER was
     *  granted by other parties. Omit to run the agent isolated. */
    mcp?: { command: string; args: string[] }
  } = {}) {}

  private ensureMcpConfig(): string | undefined {
    if (!this.opts.mcp) return undefined
    if (!this.mcpConfigPath) {
      const dir = mkdtempSync(join(tmpdir(), "agentina-mcp-"))
      this.mcpConfigPath = join(dir, "mcp.json")
      writeFileSync(this.mcpConfigPath, JSON.stringify({
        mcpServers: { agentina: { command: this.opts.mcp.command, args: this.opts.mcp.args } },
      }))
    }
    return this.mcpConfigPath
  }

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

    // Personality + skills, agentx-style: the offer's systemPrompt plus
    // any SKILL.md / skills/*.md in the agent's WORKSPACE (baseRoot, not
    // the granted cwd — skills belong to the owner, the jail belongs to
    // the grant).
    const skillsText = loadSkillsText(resolve(this.opts.baseRoot ?? cwd), this.opts.disabledSkills)
    const mcpConfig = this.ensureMcpConfig()
    const bridgeHint = mcpConfig
      ? "You have agentina tools: use list_peer_shares to see what other parties currently share with your owner, and ask_peer to use those shares (read shared folders, query shared agents). When asked about something another party shared, CHECK with list_peer_shares before saying you can't see it."
      : undefined
    const appendParts = [this.opts.systemPrompt?.trim(), bridgeHint, skillsText, task.remoteSkillsText].filter(Boolean)
    if (mcpConfig) tools = [...tools, "mcp__agentina__list_peer_shares", "mcp__agentina__ask_peer"]
    const args = [
      "-p", task.message,
      "--output-format", "json",
      "--allowedTools", tools.join(","),
      ...(mcpConfig ? ["--mcp-config", mcpConfig] : []),
      ...(appendParts.length ? ["--append-system-prompt", appendParts.join("\n\n")] : []),
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
