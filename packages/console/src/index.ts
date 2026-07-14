// --- The agentina console ---
//
// One self-contained page, served by the node at GET / (loopback-only,
// like the rest of the control surface). Vanilla JS polling the local
// control API — no build step, no CDN, works on an air-gapped mesh.
//
// PARITY RULE: every action a user can take via the CLI must exist
// here — pairing, testing, grants (all scope kinds + expiry), tasks,
// agent offers, sessions, channel config. The console is the product
// for non-technical parties; the CLI is the shortcut for the rest.
//
// NOTE for maintainers: the page lives inside a TS template literal, so
// the inline <script> deliberately avoids backticks and ${…} — string
// concatenation only.

export const CONSOLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentina console</title>
<style>
  /* agentx design language: oklch dark surfaces, mint accent, IBM Plex,
     13px density. Tokens mirror agentx src/daemon/ui/tokens.ts. */
  :root {
    --ax-bg: oklch(0.16 0.010 265);
    --ax-bg-elev: oklch(0.19 0.012 265);
    --ax-surface: oklch(0.21 0.012 265);
    --ax-surface-2: oklch(0.24 0.014 265);
    --ax-surface-3: oklch(0.27 0.016 265);
    --ax-border: oklch(0.29 0.014 265);
    --ax-border-2: oklch(0.35 0.016 265);
    --ax-text: oklch(0.95 0.005 265);
    --ax-text-2: oklch(0.80 0.008 265);
    --ax-muted: oklch(0.60 0.010 265);
    --ax-accent: oklch(0.78 0.13 165);
    --ax-accent-2: oklch(0.55 0.11 165);
    --ax-warn: oklch(0.80 0.14 75);
    --ax-err: oklch(0.68 0.19 25);
    --ax-info: oklch(0.78 0.10 220);
    --ax-radius: 6px;
    --ax-radius-lg: 8px;
    --ax-font: "IBM Plex Sans", -apple-system, "Segoe UI", sans-serif;
    --ax-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Consolas, monospace;
    color-scheme: dark;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--ax-bg); color: var(--ax-text); font: 13px/1.6 var(--ax-font); padding-bottom: 60px; }
  a { color: var(--ax-info); }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 18px; border-bottom: 1px solid var(--ax-border); background: var(--ax-bg-elev); flex-wrap: wrap; position: sticky; top: 0; z-index: 5; }
  header h1 { font-size: 14px; font-weight: 600; letter-spacing: .2px; margin-right: 4px; }
  header h1 span { color: var(--ax-accent); }
  #party-name { font-weight: 600; color: var(--ax-text-2); }
  .chip { font: 10.5px var(--ax-mono); color: var(--ax-muted); background: var(--ax-surface-2); border: 1px solid var(--ax-border); border-radius: 999px; padding: 1px 9px; }
  main { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; padding: 16px 18px; max-width: 1400px; }
  .card { background: var(--ax-surface); border: 1px solid var(--ax-border); border-radius: var(--ax-radius-lg); padding: 14px 16px; }
  .card h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--ax-muted); margin-bottom: 12px; font-weight: 600; }
  .card h2 b { color: var(--ax-accent); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
  input, select { background: var(--ax-bg-elev); color: var(--ax-text); border: 1px solid var(--ax-border); border-radius: var(--ax-radius); padding: 6px 9px; font: 12.5px var(--ax-font); flex: 1; min-width: 0; }
  input:focus, select:focus { outline: none; border-color: var(--ax-accent-2); }
  button { background: var(--ax-accent); color: oklch(0.16 0.02 165); border: 0; border-radius: var(--ax-radius); padding: 6px 12px; font: 600 12px var(--ax-font); cursor: pointer; white-space: nowrap; }
  button:hover { filter: brightness(1.08); }
  button.ghost { background: var(--ax-surface-2); color: var(--ax-text-2); border: 1px solid var(--ax-border-2); }
  button.danger { background: transparent; color: var(--ax-err); border: 1px solid var(--ax-err); }
  button:disabled { opacity: .45; cursor: default; }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .item { background: var(--ax-surface-2); border: 1px solid var(--ax-border); border-radius: var(--ax-radius); padding: 7px 10px; display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .item .meta { font: 11px var(--ax-mono); color: var(--ax-muted); }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; }
  .dot.ok { background: var(--ax-accent); box-shadow: 0 0 6px var(--ax-accent-2); }
  .dot.bad { background: var(--ax-err); }
  .st-active { color: var(--ax-accent); } .st-proposed { color: var(--ax-warn); } .st-revoked, .st-closed { color: var(--ax-muted); }
  .ttl { font: 10.5px var(--ax-mono); color: var(--ax-warn); }
  .feed { font: 11.5px var(--ax-mono); display: flex; flex-direction: column; gap: 4px; max-height: 340px; overflow-y: auto; }
  .feed .denied { color: var(--ax-err); }
  .feed .allowed { color: var(--ax-muted); }
  .feed .ts { opacity: .55; margin-right: 6px; }
  .invite-out { font: 11px var(--ax-mono); background: var(--ax-bg-elev); border: 1px dashed var(--ax-accent-2); border-radius: var(--ax-radius); padding: 9px; word-break: break-all; margin-top: 8px; display: none; }
  .hint { font-size: 11.5px; color: var(--ax-muted); margin-top: 4px; }
  .reply { font: 12px var(--ax-mono); background: var(--ax-bg-elev); border-left: 3px solid var(--ax-info); border-radius: var(--ax-radius); padding: 9px; margin-top: 8px; white-space: pre-wrap; display: none; }
  #toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--ax-surface-3); border: 1px solid var(--ax-accent-2); color: var(--ax-text); border-radius: var(--ax-radius-lg); padding: 8px 16px; font-size: 12.5px; opacity: 0; transition: opacity .25s; pointer-events: none; max-width: 80vw; }
  #toast.show { opacity: 1; }
  label.mode { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--ax-muted); }
</style>
</head>
<body>
<header>
  <h1><span>agentina</span> console</h1>
  <span style="color:var(--ax-muted)">You are</span>
  <span id="party-name">…</span>
  <span class="chip" id="party-id"></span>
  <span class="chip" id="proto"></span>
  <span class="chip" id="node-url"></span>
  <span class="chip" id="channels-chip"></span>
</header>
<main>
  <section class="card">
    <h2><b>1</b> · Pair with another party</h2>
    <div class="row"><button id="btn-invite">Create invite link</button><span class="hint">one-time · expires in 15 min</span></div>
    <div class="invite-out" id="invite-out"></div>
    <div class="row" style="margin-top:14px">
      <input id="join-link" placeholder="agentina://join/… (paste a link you received)">
      <button class="ghost" id="btn-join">Join</button>
    </div>
    <h2 style="margin-top:18px">Peers</h2>
    <div class="list" id="peers"></div>
  </section>

  <section class="card">
    <h2><b>2</b> · Grant access <span style="text-transform:none">(what may THEY touch?)</span></h2>
    <div class="row"><select id="g-peer"></select><select id="g-agent"></select></div>
    <div class="row">
      <input id="g-fs" placeholder="directory to share (fs scope)">
      <label class="mode"><input type="radio" name="g-mode" value="ro" checked> read-only</label>
      <label class="mode"><input type="radio" name="g-mode" value="rw"> read-write</label>
    </div>
    <div class="row">
      <input id="g-ssh" placeholder="ssh scope: user@host (optional)">
      <input id="g-repo" placeholder="repo scope: git url (optional)">
    </div>
    <div class="row">
      <input id="g-expires" placeholder="expires: 2h, 7d… (optional)" style="max-width:160px">
      <button id="btn-grant">Grant</button>
      <span class="hint">enforced on YOUR node — revoke any time</span>
    </div>
    <h2 style="margin-top:18px">Grants you authored</h2>
    <div class="list" id="grants"></div>
  </section>

  <section class="card">
    <h2><b>3</b> · Sessions <span style="text-transform:none">(temporary agents that self-destruct)</span></h2>
    <div class="row"><select id="s-peer"></select><input id="s-ttl" placeholder="ttl: 45m, 2h" style="max-width:110px"><select id="s-adapter">
      <option value="scoped-fs">scoped-fs (share files)</option>
      <option value="ssh-exec">ssh-exec (run on a server)</option>
      <option value="scoped-git">scoped-git (read a repo)</option>
      <option value="claude-code">claude-code (AI worker)</option>
    </select></div>
    <div class="row">
      <input id="s-scope" placeholder="directory to share">
      <label class="mode"><input type="radio" name="s-mode" value="ro" checked> ro</label>
      <label class="mode"><input type="radio" name="s-mode" value="rw"> rw</label>
      <button id="btn-session">Open session</button>
    </div>
    <div class="list" id="sessions"></div>
  </section>

  <section class="card">
    <h2><b>4</b> · Ask a peer's agents <span style="text-transform:none">(their machine, their rules)</span></h2>
    <div class="hint" style="margin-bottom:8px">A task is a message to ONE agent on the other party's machine. What it may touch is whatever THEY granted you — nothing else. Their agents guard their resources; yours guard yours.</div>
    <div class="row"><select id="t-peer"></select><select id="t-agent"></select></div>
    <div class="list" id="t-granted" style="margin-bottom:8px"></div>
    <div class="row"><input id="t-msg" placeholder="pick an agent first"><button id="btn-task">Ask</button></div>
    <div class="reply" id="t-reply"></div>
  </section>

  <section class="card">
    <h2>Your agents <span style="text-transform:none">(what YOU offer)</span></h2>
    <div class="list" id="agents" style="margin-bottom:10px"></div>
    <div class="row"><input id="a-id" placeholder="agent id (e.g. files)" style="max-width:140px"><select id="a-adapter">
      <option value="scoped-fs">scoped-fs</option>
      <option value="ssh-exec">ssh-exec</option>
      <option value="scoped-git">scoped-git</option>
      <option value="claude-code">claude-code</option>
    </select><input id="a-root" placeholder="base directory (fs/claude)"><button id="btn-offer">Offer</button></div>
    <div class="hint">Offering exposes nothing by itself — a party still needs a grant to invoke it.</div>
  </section>

  <section class="card">
    <h2>Channels <span style="text-transform:none">(Telegram · GitLab)</span></h2>
    <div class="row"><span class="hint" id="ch-active">…</span></div>
    <div class="row"><input id="ch-tg-env" placeholder="Telegram: token env var (e.g. TG_BOT_TOKEN)"><input id="ch-tg-chats" placeholder="allowed chat ids, comma (optional)" style="max-width:190px"><button class="ghost" id="btn-ch-tg">Save</button></div>
    <div class="row"><input id="ch-gl-host" placeholder="GitLab host url"><input id="ch-gl-env" placeholder="token env var" style="max-width:140px"><input id="ch-gl-secret" placeholder="webhook secret env (opt)" style="max-width:170px"><button class="ghost" id="btn-ch-gl">Save</button></div>
    <div class="hint">Tokens live in environment variables — never in files. Restart the node after saving. GitLab webhook: &lt;node-url&gt;/channels/gitlab/webhook (note events).</div>
  </section>

  <section class="card">
    <h2>Activity <span style="text-transform:none">(every decision, including denials)</span></h2>
    <div class="feed" id="feed"></div>
  </section>
</main>
<div id="toast"></div>
<script>
(function () {
  "use strict";
  var API = "/agentina/v1";

  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }
  function toast(msg, ms) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, ms || 2600);
  }
  function api(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
        return data;
      });
    });
  }
  // "45m" | "2h" | "7d" | "3600" -> seconds
  function parseDuration(v) {
    var m = /^(\\d+)\\s*([smhd]?)$/.exec(v.trim());
    if (!m) throw new Error('Cannot parse "' + v + '" — use 45m, 2h, 7d');
    var mult = { "": 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
    return Number(m[1]) * mult;
  }
  function countdown(iso) {
    var left = Math.round((Date.parse(iso) - Date.now()) / 1000);
    if (left <= 0) return "expiring…";
    if (left < 90) return left + "s left";
    if (left < 5400) return Math.round(left / 60) + "m left";
    if (left < 129600) return Math.round(left / 3600) + "h left";
    return Math.round(left / 86400) + "d left";
  }
  function fillSelect(sel, values, current) {
    sel.innerHTML = "";
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      if (v === current) o.selected = true;
      sel.appendChild(o);
    });
  }
  function mode(name) { return document.querySelector('input[name="' + name + '"]:checked').value; }

  function render(s) {
    $("party-name").textContent = s.party.name;
    $("party-id").textContent = s.party.id;
    $("proto").textContent = s.protocol;
    $("node-url").textContent = s.url;
    $("channels-chip").textContent = (s.channels && s.channels.length) ? "channels: " + s.channels.join(", ") : "no channels";
    $("ch-active").textContent = (s.channels && s.channels.length) ? "Active: " + s.channels.join(", ") : "No channels running. Configure below, set the env var, restart the node.";

    var peersEl = $("peers");
    peersEl.innerHTML = s.peers.length ? "" : '<div class="hint">No peers yet — create an invite and send the link, or paste one you received.</div>';
    s.peers.forEach(function (p) {
      var div = document.createElement("div");
      div.className = "item";
      div.innerHTML =
        '<span><span class="dot ' + (p.healthy ? "ok" : "bad") + '"></span>' + esc(p.peer) +
        ' <span class="meta">' + esc(p.peerUrl) + " · " + p.skills.length + " agent(s)</span></span>";
      var btn = document.createElement("button");
      btn.className = "ghost"; btn.textContent = "Test connection";
      btn.onclick = function () {
        btn.disabled = true;
        api("POST", "/test", { peer: p.peer }).then(function (r) {
          toast("✓ " + r.party.name + " answered in " + r.latencyMs + "ms");
        }).catch(function (e) { toast("✗ " + e.message); }).finally(function () { btn.disabled = false; });
      };
      div.appendChild(btn);
      peersEl.appendChild(div);
    });

    var peerNames = s.peers.map(function (p) { return p.peer; });
    var agentIds = (s.agents || []).map(function (a) { return typeof a === "string" ? a : a.id; }).filter(function (id) { return id !== "echo"; });
    ["g-peer", "t-peer", "s-peer"].forEach(function (id) {
      fillSelect($(id), peerNames.length ? peerNames : ["— pair first —"], $(id).value);
    });
    fillSelect($("g-agent"), agentIds, $("g-agent").value);
    // First paint of the "what can I do at this peer" view.
    if (peerNames.length && !peerGrantsCache[$("t-peer").value]) loadPeerGrants($("t-peer").value);

    var agentsEl = $("agents");
    agentsEl.innerHTML = "";
    (s.agents || []).filter(function (a) { return (typeof a === "string" ? a : a.id) !== "echo"; }).forEach(function (a) {
      var id = typeof a === "string" ? a : a.id;
      var kind = typeof a === "string" ? "echo" : a.adapter;
      var sess = typeof a === "string" ? null : a.session;
      var div = document.createElement("div");
      div.className = "item";
      div.innerHTML = "<span><b>" + esc(id) + '</b> <span class="meta">' + esc(kind) + (sess ? ' · <span class="ttl">session ' + esc(sess) + "</span>" : "") + "</span></span>";
      agentsEl.appendChild(div);
    });

    var grantsEl = $("grants");
    var grants = s.grants || [];
    grantsEl.innerHTML = grants.length ? "" : '<div class="hint">Nothing granted. Pairing alone grants nothing — that is the point.</div>';
    grants.forEach(function (g) {
      var scopeStr = (g.scopes || []).map(function (sc) {
        if (sc.kind === "fs") return "fs:" + sc.root + " (" + sc.mode + ")";
        if (sc.kind === "ssh") return "ssh:" + sc.user + "@" + sc.host;
        if (sc.kind === "repo") return "repo:" + sc.url + " (" + sc.mode + ")";
        if (sc.kind === "skill") return "skill:" + sc.skillId;
        return sc.kind;
      }).join(", ");
      var div = document.createElement("div");
      div.className = "item";
      div.innerHTML =
        '<span><span class="st-' + g.status + '">●</span> <b>' + esc(g.agentIds.join(", ")) + "</b> → " + esc(g.toParty) +
        ' <span class="meta">' + esc(scopeStr || "no scopes") + " · " + g.status + "</span>" +
        (g.expiresAt && g.status === "active" ? ' <span class="ttl">' + countdown(g.expiresAt) + "</span>" : "") + "</span>";
      var actions = document.createElement("span");
      if (g.status === "proposed") {
        var ok = document.createElement("button");
        ok.textContent = "Approve";
        ok.onclick = function () {
          api("POST", "/grants/approve", { id: g.id }).then(function () { toast("Approved " + g.id); refresh(); })
            .catch(function (e) { toast("✗ " + e.message); });
        };
        actions.appendChild(ok);
        actions.appendChild(document.createTextNode(" "));
      }
      if (g.status !== "revoked") {
        var rv = document.createElement("button");
        rv.className = "danger"; rv.textContent = "Revoke";
        rv.onclick = function () {
          api("POST", "/grants/revoke", { id: g.id }).then(function () { toast("Revoked — their next call is denied"); refresh(); })
            .catch(function (e) { toast("✗ " + e.message); });
        };
        actions.appendChild(rv);
      }
      div.appendChild(actions);
      grantsEl.appendChild(div);
    });

    var sessEl = $("sessions");
    var sessions = s.sessions || [];
    sessEl.innerHTML = sessions.length ? "" : '<div class="hint">No sessions. Open one for a fixed-length engagement — everything it created disappears when it ends.</div>';
    sessions.slice().reverse().forEach(function (x) {
      var div = document.createElement("div");
      div.className = "item";
      div.innerHTML =
        '<span><span class="st-' + x.status + '">●</span> <b>' + esc(x.ephemeralAgents.join(", ")) + "</b>" +
        ' <span class="meta">' + esc(x.id) + " · " + x.status + "</span>" +
        (x.status === "active" && x.expiresAt ? ' <span class="ttl">' + countdown(x.expiresAt) + "</span>" : "") + "</span>";
      if (x.status === "active") {
        var btn = document.createElement("button");
        btn.className = "danger"; btn.textContent = "Close now";
        btn.onclick = function () {
          api("POST", "/sessions/close", { id: x.id }).then(function () { toast("Session closed — agent gone, grant revoked"); refresh(); })
            .catch(function (e) { toast("✗ " + e.message); });
        };
        div.appendChild(btn);
      }
      sessEl.appendChild(div);
    });

    var feed = $("feed");
    var entries = (s.audit || []).slice().reverse();
    feed.innerHTML = entries.length ? "" : '<div class="hint">Nothing yet.</div>';
    entries.forEach(function (e) {
      var line = document.createElement("div");
      line.className = e.decision;
      var what = (e.kind === "task" ? "ask" : e.kind) + (e.agentId ? " · " + e.agentId : "") + (e.partyId ? " · " + e.partyId : "") +
        (e.reason ? " · " + e.reason : "") + (e.detail ? " — " + e.detail : "");
      line.innerHTML = '<span class="ts">' + esc(e.ts.slice(11, 19)) + "</span>" +
        (e.decision === "denied" ? "✗ " : "· ") + esc(what);
      feed.appendChild(line);
    });
  }

  function refresh() {
    return api("GET", "/status").then(render).catch(function () { /* node restarting */ });
  }

  $("btn-invite").onclick = function () {
    api("POST", "/invites").then(function (r) {
      var out = $("invite-out");
      out.style.display = "block";
      out.textContent = r.link;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(r.link).then(function () { toast("Invite copied to clipboard — send it to the other party"); });
      } else { toast("Invite created — copy it below"); }
    }).catch(function (e) { toast("✗ " + e.message); });
  };

  $("btn-join").onclick = function () {
    var link = $("join-link").value.trim();
    if (!link) return toast("Paste an agentina://join/… link first");
    api("POST", "/join", { link: link }).then(function (r) {
      toast('✓ Paired with "' + r.party.name + '"');
      $("join-link").value = "";
      refresh();
    }).catch(function (e) { toast("✗ " + e.message); });
  };

  $("btn-grant").onclick = function () {
    var scopes = [];
    var m = mode("g-mode");
    if ($("g-fs").value.trim()) scopes.push({ kind: "fs", root: $("g-fs").value.trim(), mode: m });
    var sshVal = $("g-ssh").value.trim();
    if (sshVal) {
      var parts = sshVal.split("@");
      if (parts.length !== 2) return toast("✗ ssh scope must be user@host");
      scopes.push({ kind: "ssh", user: parts[0], host: parts[1] });
    }
    if ($("g-repo").value.trim()) scopes.push({ kind: "repo", url: $("g-repo").value.trim(), mode: m });
    var body = { toParty: $("g-peer").value, agentIds: [$("g-agent").value], scopes: scopes };
    var exp = $("g-expires").value.trim();
    try {
      if (exp) body.expiresAt = new Date(Date.now() + parseDuration(exp) * 1000).toISOString();
    } catch (e) { return toast("✗ " + e.message); }
    api("POST", "/grants", body).then(function (g) {
      toast("✓ Granted " + g.id);
      $("g-fs").value = ""; $("g-ssh").value = ""; $("g-repo").value = ""; $("g-expires").value = "";
      refresh();
    }).catch(function (e) { toast("✗ " + e.message); });
  };

  $("s-adapter").onchange = function () {
    var ph = { "scoped-fs": "directory to share", "ssh-exec": "user@host to run on", "scoped-git": "git repository url", "claude-code": "working directory" };
    $("s-scope").placeholder = ph[$("s-adapter").value] || "scope";
  };

  $("btn-session").onclick = function () {
    var kind = $("s-adapter").value;
    var val = $("s-scope").value.trim();
    var m = mode("s-mode");
    var scopes = [];
    var adapter = { kind: kind };
    if (kind === "scoped-fs" || kind === "claude-code") {
      if (!val) return toast("✗ give the session a directory");
      adapter.baseRoot = val;
      scopes.push({ kind: "fs", root: val, mode: m });
    } else if (kind === "ssh-exec") {
      var parts = val.split("@");
      if (parts.length !== 2) return toast("✗ ssh needs user@host");
      scopes.push({ kind: "ssh", user: parts[0], host: parts[1] });
    } else if (kind === "scoped-git") {
      if (!val) return toast("✗ give the session a repo url");
      scopes.push({ kind: "repo", url: val, mode: m });
    }
    var ttl;
    try { ttl = parseDuration($("s-ttl").value.trim() || ""); } catch (e) { return toast("✗ " + e.message); }
    api("POST", "/sessions", { toParty: $("s-peer").value, ttlSeconds: ttl, agent: { adapter: adapter }, scopes: scopes })
      .then(function (r) {
        toast("✓ Session " + r.session.id + " — agent " + r.offer.id + " self-destructs in " + $("s-ttl").value);
        $("s-scope").value = ""; $("s-ttl").value = "";
        refresh();
      }).catch(function (e) { toast("✗ " + e.message); });
  };

  $("btn-offer").onclick = function () {
    var id = $("a-id").value.trim();
    if (!id) return toast("✗ give the agent an id");
    var adapter = { kind: $("a-adapter").value };
    if ($("a-root").value.trim()) adapter.baseRoot = $("a-root").value.trim();
    api("POST", "/agents", { id: id, adapter: adapter }).then(function () {
      toast("✓ Offering " + id + " — grant a party access to use it");
      $("a-id").value = ""; $("a-root").value = "";
      refresh();
    }).catch(function (e) { toast("✗ " + e.message); });
  };

  $("btn-ch-tg").onclick = function () {
    var env = $("ch-tg-env").value.trim();
    if (!env) return toast("✗ name the env var that holds the bot token");
    var body = { kind: "telegram", tokenEnv: env };
    var chats = $("ch-tg-chats").value.trim();
    if (chats) body.allowedChats = chats.split(",").map(function (c) { return c.trim(); });
    api("POST", "/channels", body).then(function () { toast("✓ Telegram saved — restart the node to start it"); refresh(); })
      .catch(function (e) { toast("✗ " + e.message); });
  };

  $("btn-ch-gl").onclick = function () {
    var host = $("ch-gl-host").value.trim();
    var env = $("ch-gl-env").value.trim();
    if (!host || !env) return toast("✗ GitLab needs a host and a token env var");
    var body = { kind: "gitlab", host: host, tokenEnv: env };
    var sec = $("ch-gl-secret").value.trim();
    if (sec) body.webhookSecretEnv = sec;
    api("POST", "/channels", body).then(function () { toast("✓ GitLab saved — restart the node to start it"); refresh(); })
      .catch(function (e) { toast("✗ " + e.message); });
  };

  // "What can I actually do here?" — the asking side's view of a peer:
  // their agents, and the grants THEY extended to us. Cached per peer,
  // reloaded on selection.
  var peerGrantsCache = {};
  var USAGE = {
    "scoped-fs": 'try: "list" or "read <path>"',
    "scoped-git": 'try: "branches" or "log 10"',
    "ssh-exec": "type the command to run on their server",
    "claude-code": "describe the work in plain language",
    "echo": "connectivity check — replies with what you send",
    "session": "",
  };
  function agentHint(tags) {
    for (var i = 0; i < (tags || []).length; i++) {
      if (USAGE[tags[i]]) return USAGE[tags[i]];
    }
    return "";
  }
  function loadPeerGrants(peerName) {
    if (!peerName || peerName.indexOf("—") === 0) return;
    api("GET", "/peer-grants?peer=" + encodeURIComponent(peerName)).then(function (info) {
      peerGrantsCache[peerName] = info;
      renderPeerGrants(info);
    }).catch(function () { /* peer offline */ });
  }
  function renderPeerGrants(info) {
    if ($("t-peer").value !== info.peer) return;
    var grantedIds = {};
    (info.grantedToMe || []).forEach(function (g) {
      (g.agentIds || []).forEach(function (id) { grantedIds[id] = g; });
    });
    // Agent picker = THEIR agents, granted ones first and marked.
    var sel = $("t-agent");
    var current = sel.value;
    sel.innerHTML = "";
    var agents = (info.agents || []).filter(function (a) { return a.id !== "echo"; }).sort(function (a, b) {
      return (grantedIds[b.id] ? 1 : 0) - (grantedIds[a.id] ? 1 : 0);
    });
    agents.forEach(function (a) {
      var o = document.createElement("option");
      o.value = a.id;
      o.textContent = a.id + (grantedIds[a.id] ? " ✓ granted" : " (not granted — will be denied)");
      if (a.id === current) o.selected = true;
      sel.appendChild(o);
    });
    var box = $("t-granted");
    box.innerHTML = "";
    if (!(info.grantedToMe || []).length) {
      box.innerHTML = '<div class="hint">⛔ ' + esc(info.peer) + " hasn't granted you anything yet. Grants are made on THEIR console (card 2) — ask them to grant you an agent.</div>";
      return;
    }
    (info.grantedToMe || []).forEach(function (g) {
      var scopeStr = (g.scopes || []).map(function (sc) {
        if (sc.kind === "fs") return sc.root + " (" + (sc.mode === "rw" ? "read-write" : "read-only") + ")";
        if (sc.kind === "ssh") return "server " + sc.user + "@" + sc.host;
        if (sc.kind === "repo") return "repo " + sc.url;
        if (sc.kind === "skill") return "skill " + sc.skillId;
        return sc.kind;
      }).join(" · ");
      var div = document.createElement("div");
      div.className = "item";
      div.innerHTML = '<span>✓ you may use <b>' + esc(g.agentIds.join(", ")) + "</b>" +
        ' <span class="meta">' + esc(scopeStr || "no resource scopes") + "</span>" +
        (g.expiresAt ? ' <span class="ttl">' + countdown(g.expiresAt) + "</span>" : "") + "</span>";
      box.appendChild(div);
    });
    updateMsgHint();
  }
  function updateMsgHint() {
    var peer = peerGrantsCache[$("t-peer").value];
    if (!peer) return;
    var chosen = ($("t-agent").value || "");
    var agent = (peer.agents || []).find(function (a) { return a.id === chosen; });
    $("t-msg").placeholder = agent ? (agentHint(agent.tags) || "your message to " + chosen) : "pick an agent first";
  }
  $("t-peer").onchange = function () { loadPeerGrants($("t-peer").value); };
  $("t-agent").onchange = updateMsgHint;

  $("btn-task").onclick = function () {
    var btn = $("btn-task");
    btn.disabled = true;
    var reply = $("t-reply");
    reply.style.display = "none";
    api("POST", "/task", {
      peer: $("t-peer").value,
      agent: $("t-agent").value.trim() || undefined,
      message: $("t-msg").value,
    }).then(function (r) {
      reply.style.display = "block";
      reply.textContent = r.content;
    }).catch(function (e) {
      reply.style.display = "block";
      reply.textContent = "⛔ " + e.message;
    }).finally(function () {
      btn.disabled = false;
      refresh();
      loadPeerGrants($("t-peer").value); // grants may have changed on their side
    });
  };

  refresh();
  setInterval(refresh, 2500);
})();
</script>
</body>
</html>
`
