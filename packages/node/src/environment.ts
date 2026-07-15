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

export interface RuntimeProbe {
  found: boolean
  version?: string
  path?: string
}

export interface Environment {
  platform: NodeJS.Platform
  ai: {
    claude: RuntimeProbe
    /** Copy-paste install command for the console's guide state. */
    installCommand: string
    /** Every assistant CLI the console knows how to guide — Claude is
     *  the default runtime; the others surface as install guides. */
    runtimes: {
      claude: RuntimeProbe
      gemini: RuntimeProbe
      codex: RuntimeProbe
    }
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

function probeRuntime(binary: string): RuntimeProbe {
  const path = findOnPath(binary)
  const version = path ? tryExec(path, ["--version"]) : undefined
  return {
    found: Boolean(path),
    ...(version ? { version: version.split("\n")[0] } : {}),
    ...(path ? { path } : {}),
  }
}

export function detectEnvironment(): Environment {
  const claude = probeRuntime("claude")
  const gemini = probeRuntime("gemini")
  const codex = probeRuntime("codex")

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
      claude,
      installCommand: "npm install -g @anthropic-ai/claude-code",
      runtimes: { claude, gemini, codex },
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
