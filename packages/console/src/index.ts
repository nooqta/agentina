// --- The agentina console ---
//
// One self-contained page, served by the node at GET / (loopback-only,
// like the rest of the control surface). Vanilla JS polling the local
// control API — no build step, no CDN, works on an air-gapped mesh.
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
  .st-active { color: var(--ax-accent); } .st-proposed { color: var(--ax-warn); } .st-revoked { color: var(--ax-muted); }
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
  <span id="party-name">…</span>
  <span class="chip" id="party-id"></span>
  <span class="chip" id="proto"></span>
  <span class="chip" id="node-url"></span>
  <span class="chip" id="channels"></span>
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
    <div class="row"><select id="g-peer"></select></div>
    <div class="row"><select id="g-agent"></select></div>
    <div class="row">
      <input id="g-fs" placeholder="directory to share, e.g. /home/me/project-docs">
      <label class="mode"><input type="radio" name="g-mode" value="ro" checked> read-only</label>
      <label class="mode"><input type="radio" name="g-mode" value="rw"> read-write</label>
    </div>
    <div class="row"><button id="btn-grant">Grant</button><span class="hint">enforced on YOUR node — revoke any time</span></div>
    <h2 style="margin-top:18px">Grants you authored</h2>
    <div class="list" id="grants"></div>
  </section>

  <section class="card">
    <h2><b>3</b> · Send a task</h2>
    <div class="row"><select id="t-peer"></select><input id="t-agent" placeholder="agent (e.g. files)" style="max-width:130px"></div>
    <div class="row"><input id="t-msg" placeholder='e.g. "read brief.txt" or "list"'><button id="btn-task">Send</button></div>
    <div class="reply" id="t-reply"></div>
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
  var state = { peers: [], agents: [], grants: [] };

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

  function fillSelect(sel, values, current) {
    sel.innerHTML = "";
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      if (v === current) o.selected = true;
      sel.appendChild(o);
    });
  }

  function render(s) {
    $("party-name").textContent = s.party.name;
    $("party-id").textContent = s.party.id;
    $("proto").textContent = s.protocol;
    $("node-url").textContent = s.url;
    $("channels").textContent = (s.channels && s.channels.length) ? "channels: " + s.channels.join(", ") : "no channels";
    state.peers = s.peers; state.agents = s.agents; state.grants = s.grants || [];

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
    fillSelect($("g-peer"), peerNames.length ? peerNames : ["— pair first —"], $("g-peer").value);
    fillSelect($("t-peer"), peerNames.length ? peerNames : ["— pair first —"], $("t-peer").value);
    fillSelect($("g-agent"), s.agents, $("g-agent").value);

    var grantsEl = $("grants");
    grantsEl.innerHTML = state.grants.length ? "" : '<div class="hint">Nothing granted. Pairing alone grants nothing — that is the point.</div>';
    state.grants.forEach(function (g) {
      var scopeStr = (g.scopes || []).map(function (sc) {
        if (sc.kind === "fs") return "fs:" + sc.root + " (" + sc.mode + ")";
        if (sc.kind === "skill") return "skill:" + sc.skillId;
        return sc.kind;
      }).join(", ");
      var div = document.createElement("div");
      div.className = "item";
      div.innerHTML =
        '<span><span class="st-' + g.status + '">●</span> <b>' + esc(g.agentIds.join(", ")) + "</b> → " + esc(g.toParty) +
        ' <span class="meta">' + esc(scopeStr || "no scopes") + " · " + g.status + "</span></span>";
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

    var feed = $("feed");
    var entries = (s.audit || []).slice().reverse();
    feed.innerHTML = entries.length ? "" : '<div class="hint">Nothing yet.</div>';
    entries.forEach(function (e) {
      var line = document.createElement("div");
      line.className = e.decision;
      var what = e.kind + (e.agentId ? " · " + e.agentId : "") + (e.partyId ? " · " + e.partyId : "") +
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
    var fs = $("g-fs").value.trim();
    var mode = document.querySelector('input[name="g-mode"]:checked').value;
    if (fs) scopes.push({ kind: "fs", root: fs, mode: mode });
    api("POST", "/grants", {
      toParty: $("g-peer").value,
      agentIds: [$("g-agent").value],
      scopes: scopes,
    }).then(function (g) {
      toast("✓ Granted " + g.id);
      $("g-fs").value = "";
      refresh();
    }).catch(function (e) { toast("✗ " + e.message); });
  };

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
      reply.textContent = "✗ " + e.message;
    }).finally(function () { btn.disabled = false; refresh(); });
  };

  refresh();
  setInterval(refresh, 2500);
})();
</script>
</body>
</html>
`
