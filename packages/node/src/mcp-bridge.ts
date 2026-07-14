// --- The agentina MCP bridge: agents reach across the boundary ---
//
// The moment that demanded this (live, 2026-07-14): the client shared
// a folder MID-CONVERSATION and asked the freelancer's AI "do you see
// it?" — it couldn't. An agent should be able to use everything its
// OWNER has been granted. This stdio MCP server gives Claude Code two
// tools backed by the owner's node over loopback:
//
//   list_peer_shares — who shares what with my owner right now
//   ask_peer         — ask a contact's shared agent/folder something
//
// Trust stays intact: the bridge talks to the node as LOCAL (loopback,
// owner trust), outbound asks carry the owner's party token, and the
// REMOTE side enforces its grants exactly as if the owner asked
// personally. The agent can do nothing its owner couldn't.
//
// Minimal MCP (JSON-RPC 2.0 over stdio) — no SDK, no dependencies.

const API_VERSION = "2024-11-05"

interface Rpc { jsonrpc: "2.0"; id?: number | string; method?: string; params?: any; result?: any; error?: any }

export async function runMcpBridge(nodePort: number): Promise<void> {
  const base = `http://127.0.0.1:${nodePort}/agentina/v1`

  const tools = [
    {
      name: "list_peer_shares",
      description:
        "List the contacts (peers) of your owner and what each one currently shares with them: agents, folders, servers, repos. Use this FIRST when asked about anything another party shared.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "ask_peer",
      description:
        "Ask a contact's shared agent something — read a shared folder ('list' / 'read <file>'), query their assistant, etc. Access is whatever the contact granted your owner; denials come back as text.",
      inputSchema: {
        type: "object",
        properties: {
          peer: { type: "string", description: "Contact name exactly as listed by list_peer_shares" },
          agent: { type: "string", description: "The shared agent id to ask (from list_peer_shares)" },
          message: { type: "string", description: "What to ask — for folders: 'list' or 'read <path>'" },
        },
        required: ["peer", "agent", "message"],
        additionalProperties: false,
      },
    },
  ]

  async function callTool(name: string, args: any): Promise<string> {
    if (name === "list_peer_shares") {
      const status = await fetch(`${base}/status`).then((r) => r.json()) as any
      const out: string[] = []
      for (const p of status.peers ?? []) {
        const info = await fetch(`${base}/peer-grants?peer=${encodeURIComponent(p.peer)}`).then((r) => r.json()) as any
        const granted = (info.grantedToMe ?? []).flatMap((g: any) =>
          g.agentIds.map((id: string) => {
            const sc = (g.scopes ?? [])[0]
            const what = sc?.kind === "fs" ? `folder ${sc.root} (${sc.mode})` : sc?.kind === "ssh" ? `server ${sc.user}@${sc.host}` : sc?.kind === "repo" ? `repo ${sc.url}` : "agent"
            return `  - agent "${id}": ${what}${g.expiresAt ? ` — expires ${g.expiresAt}` : ""}`
          }),
        )
        out.push(`${p.peer} (${p.healthy ? "online" : "offline"}):\n${granted.length ? granted.join("\n") : "  (nothing shared with your owner)"}`)
      }
      return out.join("\n\n") || "No contacts yet."
    }
    if (name === "ask_peer") {
      const r = await fetch(`${base}/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peer: args.peer, agent: args.agent, message: args.message }),
      })
      const data = await r.json() as any
      if (!r.ok) return `Denied or failed: ${data.error ?? r.status}`
      return String(data.content ?? "")
    }
    throw new Error(`unknown tool: ${name}`)
  }

  const write = (msg: Rpc) => process.stdout.write(JSON.stringify(msg) + "\n")

  let buffer = ""
  process.stdin.setEncoding("utf-8")
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk
    let nl = buffer.indexOf("\n")
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf("\n")
      if (!line) continue
      let req: Rpc
      try { req = JSON.parse(line) } catch { continue }
      void handle(req)
    }
  })

  async function handle(req: Rpc): Promise<void> {
    if (req.method === "initialize") {
      write({
        jsonrpc: "2.0", id: req.id,
        result: {
          protocolVersion: API_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "agentina", version: "0.1.0" },
        },
      })
      return
    }
    if (req.method === "notifications/initialized") return
    if (req.method === "tools/list") {
      write({ jsonrpc: "2.0", id: req.id, result: { tools } })
      return
    }
    if (req.method === "tools/call") {
      try {
        const text = await callTool(req.params?.name, req.params?.arguments ?? {})
        write({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text }] } })
      } catch (e: any) {
        write({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: `Error: ${e?.message ?? e}` }], isError: true } })
      }
      return
    }
    if (req.id !== undefined) {
      write({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } })
    }
  }

  // Keep the process alive until claude closes stdin.
  await new Promise<void>((resolve) => process.stdin.on("end", resolve))
}
