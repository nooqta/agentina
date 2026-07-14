import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir, platform } from "node:os"
import { join, delimiter } from "node:path"

// --- Environment detection: the node adapts to the machine it's on ---
//
// The console never asks a non-technical user "is claude installed?" or
// "what's your Tailscale IP?" — the node finds out and the UI shapes
// itself: AI agents show as ready or one-command-installable; share
// kinds that can't work (no git → no repo shares) disappear; the bind
// hint knows the overlay address. Probes are cheap, cached, and
// re-runnable via POST /agentina/v1/environment/refresh after the user
// installs something.

export interface Environment {
  platform: NodeJS.Platform
  ai: {
    claude: { found: boolean; version?: string; path?: string }
    /** Copy-paste install command for the console's guide state. */
    installCommand: string
  }
  network: {
    tailscale: { found: boolean; ip?: string }
  }
  git: boolean
  ssh: boolean
  /** Existing standard directories for the path picker's quick chips. */
  quickPicks: Array<{ label: string; path: string }>
}

function findOnPath(binary: string): string | undefined {
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""]
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const full = join(dir, binary + ext)
      if (existsSync(full)) return full
    }
  }
  return undefined
}

function tryExec(cmd: string, args: string[]): string | undefined {
  try {
    return execFileSync(cmd, args, { timeout: 5_000, stdio: ["ignore", "pipe", "ignore"] })
      .toString("utf-8").trim()
  } catch {
    return undefined
  }
}

export function detectEnvironment(): Environment {
  const claudePath = findOnPath("claude")
  const claudeVersion = claudePath ? tryExec(claudePath, ["--version"]) : undefined

  const tailscalePath = findOnPath("tailscale") ??
    (process.platform === "darwin" && existsSync("/Applications/Tailscale.app/Contents/MacOS/Tailscale")
      ? "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
      : undefined)
  const tailscaleIp = tailscalePath ? tryExec(tailscalePath, ["ip", "-4"])?.split("\n")[0] : undefined

  const home = homedir()
  const quickPicks: Array<{ label: string; path: string }> = []
  for (const [label, p] of [
    ["Home", home],
    ["Documents", join(home, "Documents")],
    ["Desktop", join(home, "Desktop")],
    ["Downloads", join(home, "Downloads")],
  ] as const) {
    if (existsSync(p)) quickPicks.push({ label, path: p })
  }

  return {
    platform: platform(),
    ai: {
      claude: {
        found: Boolean(claudePath),
        ...(claudeVersion ? { version: claudeVersion.split("\n")[0] } : {}),
        ...(claudePath ? { path: claudePath } : {}),
      },
      installCommand: "npm install -g @anthropic-ai/claude-code",
    },
    network: {
      tailscale: {
        found: Boolean(tailscalePath),
        ...(tailscaleIp && /^\d+\.\d+\.\d+\.\d+$/.test(tailscaleIp) ? { ip: tailscaleIp } : {}),
      },
    },
    git: Boolean(findOnPath("git")),
    ssh: Boolean(findOnPath("ssh")),
    quickPicks,
  }
}
