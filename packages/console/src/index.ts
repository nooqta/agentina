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
  :root {
    --bg: #0f1115; --panel: #171a21; --panel-2: #1d212b; --line: #262b37;
    --ink: #e8e6e0; --ink-dim: #9aa0ad; --accent: #e8a87c; --accent-2: #7cc4e8;
    --ok: #7ee2a8; --bad: #f08c8c; --warn: #e8d47c;
    --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--ink); font: 15px/1.55 -apple-system, "Segoe UI", Inter, sans-serif; padding-bottom: 60px; }
  a { color: var(--accent-2); }
  header { display:flex; align-items:baseline; gap:14px; padding: 22px 28px 14px; border-bottom: 1px solid var(--line); flex-wrap:wrap; }
  header h1 { font-size: 19px; letter-spacing: .3px; }
  header h1 span { color: var(--accent); }
  #party-name { font-weight: 600; }
  .chip { font: 11.5px var(--mono); color: var(--ink-dim); background: var(--panel-2); border: 1px solid var(--line); border-radius: 20px; padding: 2px 10px; }
  main { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; padding: 22px 28px; max-width: 1400px; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; }
  .card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--ink-dim); margin-bottom: 14px; }
  .card h2 b { color: var(--accent); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  input, select { background: var(--panel-2); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 14px; flex: 1; min-width: 0; }
  input:focus, select:focus { outline: 1px solid var(--accent); }
  button { background: var(--accent); color: #1a130d; border: 0; border-radius: 8px; padding: 8px 14px; font-weight: 600; font-size: 13.5px; cursor: pointer; white-space: nowrap; }
  button.ghost { background: var(--panel-2); color: var(--ink); border: 1px solid var(--line); }
  button.danger { background: transparent; color: var(--bad); border: 1px solid var(--bad); }
  button:disabled { opacity: .45; cursor: default; }
  .list { display: flex; flex-direction: column; gap: 8px; }
  .item { background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 9px 12px; display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .item .meta { font: 12px var(--mono); color: var(--ink-dim); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .dot.ok { background: var(--ok); } .dot.bad { background: var(--bad); }
  .st-active { color: var(--ok); } .st-proposed { color: var(--warn); } .st-revoked { color: var(--ink-dim); }
  .feed { font: 12.5px var(--mono); display: flex; flex-direction: column; gap: 5px; max-height: 340px; overflow-y: auto; }
  .feed .denied { color: var(--bad); }
  .feed .allowed { color: var(--ink-dim); }
  .feed .ts { opacity: .55; margin-right: 6px; }
  .invite-out { font: 12px var(--mono); background: var(--panel-2); border: 1px dashed var(--accent); border-radius: 8px; padding: 10px; word-break: break-all; margin-top: 8px; display: none; }
  .hint { font-size: 12.5px; color: var(--ink-dim); margin-top: 6px; }
  .reply { font: 13px var(--mono); background: var(--panel-2); border-left: 3px solid var(--accent-2); border-radius: 6px; padding: 10px; margin-top: 10px; white-space: pre-wrap; display: none; }
  #toast { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%); background: var(--panel-2); border: 1px solid var(--accent); color: var(--ink); border-radius: 10px; padding: 10px 18px; font-size: 14px; opacity: 0; transition: opacity .25s; pointer-events: none; max-width: 80vw; }
  #toast.show { opacity: 1; }
  label.mode { display: flex; gap: 4px; align-items: center; font-size: 13px; color: var(--ink-dim); }
</style>
</head>
<body>
<header>
  <h1><span>agentina</span> console</h1>
  <span id="party-name">…</span>
  <span class="chip" id="party-id"></span>
  <span class="chip" id="proto"></span>
  <span class="chip" id="node-url"></span>
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
