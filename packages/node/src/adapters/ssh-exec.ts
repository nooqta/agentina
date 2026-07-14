import { spawn } from "node:child_process"
import type { Scope, AgentOffer } from "@agentina-mesh/protocol"
import type { AgentAdapter, AdapterTask } from "../adapter"

// --- SshExecAdapter: run a command on the server the grant names ---
//
// The task message is the command; the HOST and USER come exclusively
// from the grant's ssh scope — never from the message, so a remote
// party can only ever reach the machine the owner named. BatchMode
// keeps ssh non-interactive (key auth only, no password prompts).
//
// `binary` is injectable so CI proves credential injection with a fake
// (echo) instead of a live server.

const TIMEOUT_MS = 2 * 60 * 1000

export class SshExecAdapter implements AgentAdapter {
  constructor(private opts: { binary?: string } = {}) {}

  async execute(offer: AgentOffer, task: AdapterTask): Promise<{ content: string }> {
    if (!task.policy) {
      throw new Error("denied: ssh-exec runs only under a grant with an ssh scope (local callers: use your own shell)")
    }
    const ssh = task.policy.scopes.find((s): s is Extract<Scope, { kind: "ssh" }> => s.kind === "ssh")
    if (!ssh) throw new Error("denied: the grant covering this agent includes no ssh scope")

    const command = task.message.trim()
    if (!command) throw new Error("usage: <command to run on the granted server>")

    const binary = this.opts.binary ?? "ssh"
    const args = [
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      `${ssh.user}@${ssh.host}`,
      command,
    ]
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] })
      let out = ""
      let err = ""
      const timer = setTimeout(() => {
        child.kill("SIGKILL")
        reject(new Error("ssh command timed out"))
      }, TIMEOUT_MS)
      child.stdout.on("data", (c) => { out += c })
      child.stderr.on("data", (c) => { err += c })
      child.on("error", (e) => { clearTimeout(timer); reject(e) })
      child.on("close", (code) => {
        clearTimeout(timer)
        if (code !== 0) return reject(new Error(`ssh exited ${code}: ${err.slice(0, 300)}`))
        resolve({ content: out.trim() || "(no output)" })
      })
    })
  }
}
