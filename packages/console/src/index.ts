// --- The agentina console ---
//
// Design principles (after the "overcomplicated" feedback — this is how
// a Google/Anthropic product team would shape it):
//   1. CONTACTS, NOT CONCEPTS — the home surface is the people you
//      collaborate with, like a chat app. Grants/sessions/adapters are
//      machinery; users see "shares" and "asking".
//   2. PROGRESSIVE DISCLOSURE — each state shows exactly one next step.
//      No peers → a single onboarding card. A contact with nothing
//      shared → an empty state that says what to do. Advanced things
//      (channels, manual agents, raw feed) live behind "Advanced".
//   3. ONE VERB: SHARE — "share this folder, read-only, for a week"
//      creates the agent + grant (+ self-destructing session) under the
//      hood via the node's /shares API.
//
// Served at GET / (loopback-only). Vanilla JS, no CDN, air-gap safe.
// NOTE: the page lives in a TS template literal — the inline <script>
// avoids backticks and dollar-brace on purpose; concatenation only.

export const CONSOLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentina</title>
<style>
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
    --ax-radius-lg: 10px;
    --ax-font: "IBM Plex Sans", -apple-system, "Segoe UI", sans-serif;
    --ax-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Consolas, monospace;
    color-scheme: dark;
  }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body { background: var(--ax-bg); color: var(--ax-text); font: 13.5px/1.6 var(--ax-font); display: flex; flex-direction: column; }
  button { background: var(--ax-accent); color: oklch(0.16 0.02 165); border: 0; border-radius: var(--ax-radius); padding: 7px 14px; font: 600 12.5px var(--ax-font); cursor: pointer; white-space: nowrap; }
  button:hover { filter: brightness(1.08); }
  button.ghost { background: var(--ax-surface-2); color: var(--ax-text-2); border: 1px solid var(--ax-border-2); }
  button.danger { background: transparent; color: var(--ax-err); border: 1px solid var(--ax-err); }
  button.link { background: none; border: none; color: var(--ax-info); padding: 0; font-weight: 500; }
  button:disabled { opacity: .45; cursor: default; }
  input, select { background: var(--ax-bg-elev); color: var(--ax-text); border: 1px solid var(--ax-border); border-radius: var(--ax-radius); padding: 7px 10px; font: 13px var(--ax-font); min-width: 0; }
  input:focus, select:focus { outline: none; border-color: var(--ax-accent-2); }
  .hint { font-size: 12px; color: var(--ax-muted); }
  .mono { font-family: var(--ax-mono); }
  .ttl { font: 10.5px var(--ax-mono); color: var(--ax-warn); }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--ax-border); background: var(--ax-bg-elev); }
  header h1 { font-size: 14px; font-weight: 600; }
  header h1 span { color: var(--ax-accent); }
  #me { color: var(--ax-text-2); font-weight: 600; }
  #toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--ax-surface-3); border: 1px solid var(--ax-accent-2); border-radius: var(--ax-radius-lg); padding: 9px 16px; font-size: 12.5px; opacity: 0; transition: opacity .25s; pointer-events: none; z-index: 50; max-width: 80vw; }
  #toast.show { opacity: 1; }

  /* onboarding (no peers yet) */
  #onboarding { flex: 1; display: none; align-items: center; justify-content: center; padding: 24px; }
  #onboarding .panel { max-width: 480px; width: 100%; background: var(--ax-surface); border: 1px solid var(--ax-border); border-radius: 14px; padding: 32px; text-align: center; }
  #onboarding h2 { font-size: 18px; margin-bottom: 6px; }
  #onboarding p { color: var(--ax-muted); margin-bottom: 22px; }
  #onboarding .or { display: flex; align-items: center; gap: 10px; margin: 18px 0; color: var(--ax-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  #onboarding .or::before, #onboarding .or::after { content: ""; flex: 1; height: 1px; background: var(--ax-border); }
  #ob-invite-out { display: none; margin-top: 14px; font: 11px var(--ax-mono); background: var(--ax-bg-elev); border: 1px dashed var(--ax-accent-2); border-radius: var(--ax-radius); padding: 10px; word-break: break-all; text-align: left; }
  #ob-wait { display: none; margin-top: 10px; color: var(--ax-accent); font-size: 12.5px; }

  /* main app (has peers) */
  #app { flex: 1; display: none; min-height: 0; }
  #sidebar { width: 240px; border-right: 1px solid var(--ax-border); background: var(--ax-bg-elev); display: flex; flex-direction: column; }
  #contacts { flex: 1; overflow-y: auto; padding: 8px; }
  .contact { display: flex; align-items: center; gap: 9px; padding: 9px 10px; border-radius: var(--ax-radius); cursor: pointer; border: 1px solid transparent; }
  .contact:hover { background: var(--ax-surface-2); }
  .contact.sel { background: var(--ax-surface-2); border-color: var(--ax-border-2); }
  .contact .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .dot.ok { background: var(--ax-accent); box-shadow: 0 0 6px var(--ax-accent-2); }
  .dot.bad { background: var(--ax-err); }
  #sidebar .foot { padding: 10px; border-top: 1px solid var(--ax-border); }
  #btn-add { width: 100%; }
  #adv-toggle { width: 100%; margin-top: 8px; }

  #mainpane { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  #contact-head { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-bottom: 1px solid var(--ax-border); }
  #contact-head h2 { font-size: 15px; }
  #tabs { display: flex; gap: 2px; padding: 0 20px; border-bottom: 1px solid var(--ax-border); }
  #tabs button { background: none; border: none; color: var(--ax-muted); padding: 9px 14px; font: 600 12.5px var(--ax-font); border-bottom: 2px solid transparent; border-radius: 0; }
  #tabs button.sel { color: var(--ax-text); border-bottom-color: var(--ax-accent); }
  .tabpane { flex: 1; overflow-y: auto; padding: 18px 20px; display: none; }
  .tabpane.sel { display: flex; flex-direction: column; }

  /* Ask tab: a conversation */
  #chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .chip-share { font: 11.5px var(--ax-mono); border: 1px solid var(--ax-border-2); background: var(--ax-surface-2); color: var(--ax-text-2); border-radius: 999px; padding: 3px 11px; cursor: pointer; }
  .chip-share.sel { border-color: var(--ax-accent); color: var(--ax-accent); }
  #thread { flex: 1; display: flex; flex-direction: column; gap: 8px; padding-bottom: 12px; }
  .bubble { max-width: 82%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; font-size: 13px; }
  .bubble.me { align-self: flex-end; background: var(--ax-accent-2); color: var(--ax-text); border-bottom-right-radius: 3px; }
  .bubble.them { align-self: flex-start; background: var(--ax-surface-2); border: 1px solid var(--ax-border); border-bottom-left-radius: 3px; font-family: var(--ax-mono); font-size: 12px; }
  .bubble.err { align-self: flex-start; background: none; border: 1px solid var(--ax-err); color: var(--ax-err); }
  #askbar { display: flex; gap: 8px; padding-top: 10px; border-top: 1px solid var(--ax-border); }
  #askbar input { flex: 1; }
  .empty { color: var(--ax-muted); text-align: center; margin: auto; max-width: 380px; }
  .empty b { color: var(--ax-text-2); }

  /* Sharing tab */
  .share-item { display: flex; align-items: center; gap: 10px; background: var(--ax-surface-2); border: 1px solid var(--ax-border); border-radius: var(--ax-radius); padding: 9px 12px; margin-bottom: 6px; }
  .share-item .what { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .share-item .meta { font: 11px var(--ax-mono); color: var(--ax-muted); }
  #share-form { background: var(--ax-surface); border: 1px solid var(--ax-border); border-radius: var(--ax-radius-lg); padding: 14px; margin-top: 14px; }
  #share-form .row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  #share-form input { flex: 1; }

  /* Activity + advanced */
  .feed { font: 11.5px var(--ax-mono); display: flex; flex-direction: column; gap: 4px; }
  .feed .denied { color: var(--ax-err); }
  .feed .allowed { color: var(--ax-muted); }
  .feed .ts { opacity: .55; margin-right: 6px; }
  #advanced { display: none; position: fixed; inset: 0; background: oklch(0.10 0.01 265 / 0.7); z-index: 40; align-items: center; justify-content: center; }
  #advanced .panel { background: var(--ax-surface); border: 1px solid var(--ax-border-2); border-radius: 14px; padding: 22px; width: min(560px, 92vw); max-height: 86vh; overflow-y: auto; }
  #advanced h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: var(--ax-muted); margin: 16px 0 8px; }
  #advanced h3:first-child { margin-top: 0; }
  #advanced .row { display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
  #advanced input { flex: 1; }
  dialog#dlg-invite { background: var(--ax-surface); color: var(--ax-text); border: 1px solid var(--ax-border-2); border-radius: 14px; padding: 22px; width: min(480px, 92vw); }
  dialog::backdrop { background: oklch(0.10 0.01 265 / 0.7); }
  body.simple .adv-only { display: none !important; }
  #ai-banner { display: none; gap: 10px; align-items: center; background: var(--ax-surface); border-bottom: 1px solid var(--ax-border); padding: 8px 20px; font-size: 12.5px; color: var(--ax-text-2); }
  #ai-banner code { font: 11px var(--ax-mono); background: var(--ax-bg-elev); border: 1px solid var(--ax-border); border-radius: 4px; padding: 2px 8px; }
  .pp-wrap { position: relative; flex: 1; min-width: 0; display: flex; }
  .pp-wrap input { flex: 1; }
  .pp-drop { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--ax-surface-3); border: 1px solid var(--ax-border-2); border-radius: var(--ax-radius); z-index: 30; max-height: 240px; overflow-y: auto; display: none; box-shadow: 0 8px 24px oklch(0.05 0.01 265 / .5); }
  .pp-item { padding: 6px 10px; cursor: pointer; font: 12px var(--ax-mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pp-item:hover, .pp-item.hi { background: var(--ax-accent-2); }
  .pp-chips { display: flex; gap: 5px; flex-wrap: wrap; padding: 7px 9px; border-bottom: 1px solid var(--ax-border); }
  .pp-chip { font: 11px var(--ax-font); background: var(--ax-bg-elev); border: 1px solid var(--ax-border-2); border-radius: 999px; padding: 2px 10px; cursor: pointer; color: var(--ax-text-2); }
  .pp-chip:hover { border-color: var(--ax-accent); color: var(--ax-accent); }
  #wizard { display: none; position: fixed; inset: 0; background: oklch(0.10 0.01 265 / 0.75); z-index: 45; align-items: center; justify-content: center; }
  #wizard .panel { background: var(--ax-surface); border: 1px solid var(--ax-border-2); border-radius: 14px; padding: 24px; width: min(640px, 94vw); max-height: 88vh; overflow-y: auto; }
  .scn-card { border: 1px solid var(--ax-border); border-radius: 10px; padding: 14px; cursor: pointer; margin-bottom: 8px; }
  .scn-card:hover { border-color: var(--ax-accent); }
  .scn-card b { display: block; margin-bottom: 2px; }
  .wiz-step { background: var(--ax-bg-elev); border: 1px solid var(--ax-border); border-radius: 10px; padding: 14px; margin-bottom: 10px; }
  .wiz-step.done { opacity: .55; border-color: var(--ax-accent-2); }
  .wiz-step .row { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .wiz-step input, .wiz-step select { flex: 1; }
</style>
</head>
<body>
<header>
  <h1><span>agentina</span></h1>
  <span class="hint">You are</span><span id="me">…</span>
  <span style="flex:1"></span>
  <span class="hint mono adv-only" id="me-id"></span>
  <button class="ghost" id="mode-toggle" style="font-size:11px;padding:4px 10px">Advanced</button>
</header>

<div id="onboarding">
  <div class="panel">
    <h2>Collaborate with someone</h2>
    <p>Connect this machine with another person's — your agents will work together under rules you each control.</p>
    <button id="ob-invite" style="width:100%">Create an invite link</button>
    <div id="ob-invite-out"></div>
    <div id="ob-wait">Waiting for them to join…</div>
    <div class="or">or</div>
    <div style="display:flex;gap:8px">
      <input id="ob-join" placeholder="Paste an invite you received (agentina://join/…)">
      <button class="ghost" id="ob-join-btn">Join</button>
    </div>
    <p class="hint" style="margin-top:18px;margin-bottom:0">Invites are one-time links, safe to send over any chat. Connecting shares nothing by itself.</p>
  </div>
</div>

<div id="ai-banner">
  <span>🤖 AI assistants aren't available on this machine yet — everything else works. Install once:</span>
  <code id="ai-cmd"></code>
  <button class="ghost" id="ai-copy" style="font-size:11px;padding:3px 9px">Copy</button>
  <button class="ghost" id="ai-recheck" style="font-size:11px;padding:3px 9px">I installed it — check again</button>
</div>
<div id="app">
  <div id="sidebar">
    <div id="contacts"></div>
    <div class="foot">
      <button id="btn-add" class="ghost">+ Invite someone</button>
      <button id="agents-toggle" class="ghost" style="margin-top:8px;width:100%">My agents</button>
      <button id="adv-toggle" class="ghost">Advanced</button>
    </div>
  </div>
  <div id="mainpane">
    <div id="contact-head">
      <span class="dot ok" id="c-dot"></span>
      <h2 id="c-name">…</h2>
      <button class="link" id="c-test">test connection</button>
      <button class="link" id="c-wizard">set up a collaboration</button>
      <span style="flex:1"></span>
      <span class="hint mono" id="c-id"></span>
    </div>
    <div id="tabs">
      <button data-tab="ask" class="sel">Ask them</button>
      <button data-tab="share">What I share</button>
      <button data-tab="activity">Activity</button>
    </div>
    <div class="tabpane sel" id="pane-ask">
      <div id="chips"></div>
      <div id="thread"></div>
      <div id="ask-empty" class="empty" style="display:none"></div>
      <div id="askbar">
        <input id="ask-input" placeholder="…">
        <button id="ask-send">Ask</button>
      </div>
    </div>
    <div class="tabpane" id="pane-share">
      <div id="share-list"></div>
      <div id="share-form">
        <div class="hint" style="margin-bottom:10px"><b style="color:var(--ax-text-2)">Share something new.</b> Their agents can then use it — exactly this, nothing else, and you can stop it anytime.</div>
        <div class="row">
          <select id="sh-kind" style="max-width:150px">
            <option value="agent">one of my agents</option>
            <option value="folder">a folder</option>
            <option value="server">a server</option>
            <option value="repo">a repository</option>
          </select>
          <select id="sh-agent" style="display:none"></select>
          <input id="sh-value" placeholder="/path/to/folder">
          <input id="sh-path" placeholder="restrict to path (optional)" style="display:none">
        </div>
        <div class="row">
          <select id="sh-mode" style="max-width:130px">
            <option value="ro">read-only</option>
            <option value="rw">read &amp; write</option>
          </select>
          <select id="sh-for" style="max-width:150px">
            <option value="">until I stop it</option>
            <option value="3600">for 1 hour</option>
            <option value="86400">for 1 day</option>
            <option value="604800">for 1 week</option>
          </select>
          <button id="sh-go">Share</button>
        </div>
      </div>
    </div>
    <div class="tabpane" id="pane-activity">
      <div class="feed" id="feed"></div>
    </div>
  </div>
</div>

<div id="advanced">
  <div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <b>Advanced</b>
      <button class="ghost" id="adv-close">Close</button>
    </div>
    <h3>Node</h3>
    <div class="hint mono" id="adv-node"></div>
    <h3>Channels — talk to agents from Telegram / GitLab</h3>
    <div class="hint" id="adv-ch-active" style="margin-bottom:8px"></div>
    <div class="row"><input id="ch-tg-env" placeholder="Telegram token env var (e.g. TG_BOT_TOKEN)"><button class="ghost" id="btn-ch-tg">Save</button></div>
    <div class="row"><input id="ch-gl-host" placeholder="GitLab host url"><input id="ch-gl-env" placeholder="token env var" style="max-width:130px"><button class="ghost" id="btn-ch-gl">Save</button></div>
    <div class="hint">Secrets are read from environment variables, never stored in files. Restart the node after saving.</div>

  </div>
</div>

<div id="wizard">
  <div class="panel">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <b id="wiz-title">What are you two doing together?</b>
      <button class="ghost" id="wiz-close">Close</button>
    </div>
    <div id="wiz-body"></div>
  </div>
</div>

<div id="myagents" style="display:none;position:fixed;inset:0;background:oklch(0.10 0.01 265 / 0.7);z-index:40;align-items:center;justify-content:center">
  <div class="panel" style="background:var(--ax-surface);border:1px solid var(--ax-border-2);border-radius:14px;padding:22px;width:min(600px,92vw);max-height:86vh;overflow-y:auto">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <b>My agents</b>
      <button class="ghost" id="agents-close">Close</button>
    </div>
    <div class="hint" style="margin-bottom:10px">Your AI workers. Each has a provider, a workspace it lives in, a personality, and skills (markdown files in <span class="mono">&lt;workspace&gt;/skills/</span> — edit them anytime, the next answer uses them). Share an agent with a contact from the "What I share" tab.</div>
    <div id="agents-list" style="margin-bottom:16px"></div>
    <div style="background:var(--ax-bg-elev);border:1px solid var(--ax-border);border-radius:10px;padding:14px">
      <b style="font-size:12.5px">New agent</b>
      <div style="display:flex;gap:8px;margin:10px 0;flex-wrap:wrap">
        <input id="ag-id" placeholder="name (e.g. coder)" style="max-width:140px;flex:1">
        <select id="ag-provider" class="adv-only" style="max-width:150px">
          <option value="claude-code">Claude (CLI)</option>
          <option value="scoped-fs">files only (no AI)</option>
        </select>
        <input id="ag-model" class="adv-only" placeholder="model (optional)" style="max-width:140px;flex:1">
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="ag-workspace" placeholder="which folder does it work in?" style="flex:1">
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="ag-prompt" placeholder="what should it help with? e.g. answer questions about the Acme project" style="flex:1">
      </div>
      <button id="ag-create">Create agent</button>
    </div>
  </div>
</div>

<dialog id="dlg-invite">
  <h2 style="font-size:16px;margin-bottom:6px">Invite someone</h2>
  <p class="hint" style="margin-bottom:14px">Send them this one-time link over any chat. It expires in 15 minutes and is worthless after they join.</p>
  <div id="dlg-invite-link" style="font:11px var(--ax-mono);background:var(--ax-bg-elev);border:1px dashed var(--ax-accent-2);border-radius:6px;padding:10px;word-break:break-all;margin-bottom:14px"></div>
  <div style="display:flex;gap:8px;justify-content:flex-end">
    <button class="ghost" onclick="this.closest('dialog').close()">Done</button>
  </div>
</dialog>

<div id="toast"></div>
<script>
(function () {
  "use strict";
  var API = "/agentina/v1";
  var state = { status: null, selected: null, peerInfo: {}, shares: {}, threads: {}, chip: {} };

  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s); return d.innerHTML; }
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2800);
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
  function countdown(iso) {
    var left = Math.round((Date.parse(iso) - Date.now()) / 1000);
    if (left <= 0) return "expiring…";
    if (left < 90) return left + "s left";
    if (left < 5400) return Math.round(left / 60) + "m left";
    if (left < 129600) return Math.round(left / 3600) + "h left";
    return Math.round(left / 86400) + "d left";
  }
  var USAGE = {
    "scoped-fs": 'Try "list", or "read brief.txt"',
    "scoped-git": 'Try "branches", or "log 10"',
    "ssh-exec": "Type a command to run on their server",
    "claude-code": "Describe what you need, in plain language",
  };

  // ---------- top-level render ----------
  function render(s) {
    state.status = s;
    $("me").textContent = s.party.name;
    $("me-id").textContent = s.party.id;
    var peers = s.peers || [];
    $("onboarding").style.display = peers.length ? "none" : "flex";
    $("app").style.display = peers.length ? "flex" : "none";
    if (!peers.length) return;
    if (!state.selected || !peers.some(function (p) { return p.peer === state.selected; })) {
      state.selected = peers[0].peer;
      loadPeer(state.selected);
    }
    renderContacts(peers);
    renderContactHead(peers);
    renderAsk();
    renderShares();
    renderFeed();
    applyEnvironment(s.environment);
    if (!state.modeApplied) { state.modeApplied = true; applyMode((s.ui && s.ui.mode) || "simple"); }
    $("adv-node").textContent = s.url + " · " + s.protocol + " · agents: " +
      (s.agents || []).filter(function (a) { return a.id !== "echo"; }).map(function (a) { return a.id; }).join(", ");
    $("adv-ch-active").textContent = (s.channels && s.channels.length) ? "Active: " + s.channels.join(", ") : "None running.";
  }

  function renderContacts(peers) {
    var el = $("contacts");
    el.innerHTML = "";
    peers.forEach(function (p) {
      var div = document.createElement("div");
      div.className = "contact" + (p.peer === state.selected ? " sel" : "");
      div.innerHTML = '<span class="dot ' + (p.healthy ? "ok" : "bad") + '"></span><span>' + esc(p.peer) + "</span>";
      div.onclick = function () {
        state.selected = p.peer;
        loadPeer(p.peer);
        render(state.status);
      };
      el.appendChild(div);
    });
  }

  function renderContactHead(peers) {
    var p = peers.find(function (x) { return x.peer === state.selected; });
    if (!p) return;
    $("c-name").textContent = p.peer;
    $("c-dot").className = "dot " + (p.healthy ? "ok" : "bad");
    var info = state.peerInfo[p.peer];
    $("c-id").textContent = info && info.grantedToMe && info.grantedToMe.length ? "" : "";
  }

  // ---------- per-peer data ----------
  function loadPeer(name) {
    api("GET", "/peer-grants?peer=" + encodeURIComponent(name)).then(function (info) {
      state.peerInfo[name] = info;
      if (state.selected === name) { renderAsk(); }
    }).catch(function () { /* offline */ });
    api("GET", "/shares?peer=" + encodeURIComponent(name)).then(function (r) {
      state.shares[name] = r.shares || [];
      if (state.selected === name) { renderShares(); }
    }).catch(function () { /* */ });
  }

  // ---------- Ask tab: a conversation with their agents ----------
  function grantedAgents(name) {
    var info = state.peerInfo[name];
    if (!info) return [];
    var granted = {};
    (info.grantedToMe || []).forEach(function (g) {
      (g.agentIds || []).forEach(function (id) { granted[id] = g; });
    });
    return (info.agents || []).filter(function (a) { return granted[a.id] && a.id !== "echo"; })
      .map(function (a) { return { id: a.id, tags: a.tags || [], grant: granted[a.id] }; });
  }
  function chipLabel(a) {
    var g = a.grant;
    var sc = (g.scopes || [])[0];
    if (sc && sc.kind === "fs") return "📁 " + (sc.root.split("/").pop() || sc.root);
    if (sc && sc.kind === "ssh") return "🖥 " + sc.host;
    if (sc && sc.kind === "repo") return "🌿 " + (sc.url.split("/").pop() || sc.url);
    return "🤖 " + a.id;
  }
  function renderAsk() {
    var name = state.selected;
    var agents = grantedAgents(name);
    var chipsEl = $("chips");
    chipsEl.innerHTML = "";
    var emptyEl = $("ask-empty");
    var bar = $("askbar");
    if (!agents.length) {
      emptyEl.style.display = "block";
      emptyEl.innerHTML = "<b>" + esc(name) + "</b> hasn't shared anything with you yet.<br><br>Sharing happens on <i>their</i> side. Want a guided start for both of you? <button class='link' onclick='document.getElementById(\"c-wizard\").click()'>Pick what you're doing together</button>";
      bar.style.display = "none";
      $("thread").style.display = "none";
      return;
    }
    emptyEl.style.display = "none";
    bar.style.display = "flex";
    $("thread").style.display = "flex";
    if (!state.chip[name] || !agents.some(function (a) { return a.id === state.chip[name]; })) {
      state.chip[name] = agents[0].id;
    }
    agents.forEach(function (a) {
      var c = document.createElement("button");
      c.className = "chip-share" + (state.chip[name] === a.id ? " sel" : "");
      c.textContent = chipLabel(a);
      if (a.grant.expiresAt) c.textContent += " · " + countdown(a.grant.expiresAt);
      c.onclick = function () { state.chip[name] = a.id; renderAsk(); };
      chipsEl.appendChild(c);
    });
    var chosen = agents.find(function (a) { return a.id === state.chip[name]; });
    var hint = "";
    (chosen.tags || []).forEach(function (t) { if (USAGE[t]) hint = USAGE[t]; });
    $("ask-input").placeholder = hint || "your message";
    renderThread();
  }
  function renderThread() {
    var el = $("thread");
    el.innerHTML = "";
    var msgs = state.threads[state.selected] || [];
    if (!msgs.length) {
      el.innerHTML = '<div class="empty" style="margin:auto">This is where replies appear. Pick what to use above, then ask.</div>';
      return;
    }
    msgs.forEach(function (m) {
      var b = document.createElement("div");
      b.className = "bubble " + m.who;
      b.textContent = m.text;
      el.appendChild(b);
    });
    el.scrollTop = el.scrollHeight;
  }
  function sendAsk() {
    var name = state.selected;
    var text = $("ask-input").value.trim();
    if (!text) return;
    var agent = state.chip[name];
    state.threads[name] = state.threads[name] || [];
    state.threads[name].push({ who: "me", text: text });
    $("ask-input").value = "";
    renderThread();
    api("POST", "/task", { peer: name, agent: agent, message: text }).then(function (r) {
      state.threads[name].push({ who: "them", text: r.content });
      renderThread();
    }).catch(function (e) {
      state.threads[name].push({ who: "err", text: "⛔ " + e.message });
      renderThread();
      loadPeer(name); // a denial usually means grants changed
    });
  }
  $("ask-send").onclick = sendAsk;
  $("ask-input").addEventListener("keydown", function (e) { if (e.key === "Enter") sendAsk(); });

  // ---------- Sharing tab ----------
  var KIND_ICON = { folder: "📁", server: "🖥", repo: "🌿", agent: "🤖" };
  function renderShares() {
    var name = state.selected;
    var listEl = $("share-list");
    var shares = (state.shares[name] || []).filter(function (x) { return x.status === "active"; });
    listEl.innerHTML = shares.length ? "" :
      '<div class="hint" style="margin-bottom:6px">You share nothing with ' + esc(name) + " yet. Connecting shares nothing by itself — that's the point.</div>";
    shares.forEach(function (x) {
      var div = document.createElement("div");
      div.className = "share-item";
      div.innerHTML =
        "<span>" + (KIND_ICON[x.kind] || "•") + "</span>" +
        '<span class="what"><b>' + esc(x.value) + "</b> " +
        '<span class="meta">' + (x.mode === "rw" ? "read & write" : "read-only") +
        (x.expiresAt ? " · " : "") + "</span>" +
        (x.expiresAt ? '<span class="ttl">' + countdown(x.expiresAt) + "</span>" : "") + "</span>";
      var btn = document.createElement("button");
      btn.className = "danger"; btn.textContent = "Stop";
      btn.onclick = function () {
        api("POST", "/shares/stop", { id: x.id }).then(function () {
          toast("Stopped — their next use is denied");
          loadPeer(name);
        }).catch(function (e) { toast("⛔ " + e.message); });
      };
      div.appendChild(btn);
      listEl.appendChild(div);
    });
  }
  function myAgents() {
    return ((state.status && state.status.agents) || []).filter(function (a) {
      return a.id !== "echo" && !a.session && !/^(folder|server|repo)-/.test(a.id);
    });
  }
  $("sh-kind").onchange = function () {
    var kind = $("sh-kind").value;
    var isAgent = kind === "agent";
    $("sh-agent").style.display = isAgent ? "" : "none";
    $("sh-path").style.display = isAgent ? "" : "none";
    $("sh-value").style.display = isAgent ? "none" : "";
    if (isAgent) {
      var sel = $("sh-agent");
      sel.innerHTML = "";
      myAgents().forEach(function (a) {
        var o = document.createElement("option");
        o.value = a.id; o.textContent = "🤖 " + a.id + " (" + a.adapter + ")";
        sel.appendChild(o);
      });
      if (!sel.options.length) {
        var o = document.createElement("option");
        o.value = ""; o.textContent = "— create one in My agents first —";
        sel.appendChild(o);
      }
    }
    var ph = { folder: "/path/to/folder", server: "user@host", repo: "https://… or git@…" };
    $("sh-value").placeholder = ph[kind] || "";
  };
  $("agents-toggle").onclick = function () { renderMyAgents(); $("myagents").style.display = "flex"; };
  $("agents-close").onclick = function () { $("myagents").style.display = "none"; };
  $("myagents").onclick = function (e) { if (e.target === $("myagents")) $("myagents").style.display = "none"; };
  function renderMyAgents() {
    var el = $("agents-list");
    var agents = myAgents();
    el.innerHTML = agents.length ? "" : '<div class="hint">No agents yet — create your first below.</div>';
    agents.forEach(function (a) {
      var div = document.createElement("div");
      div.className = "share-item";
      div.innerHTML = "<span>🤖</span>" +
        '<span class="what"><b>' + esc(a.id) + "</b> " +
        '<span class="meta">' + esc(a.adapter) + (a.model ? " · " + esc(a.model) : "") +
        (a.workspace ? " · " + esc(a.workspace) : "") +
        (a.hasPrompt ? " · has personality" : "") +
        " · " + ((a.skillFiles || []).length) + " skill file(s)</span></span>";
      el.appendChild(div);
    });
  }
  $("ag-create").onclick = function () {
    var id = $("ag-id").value.trim();
    var ws = $("ag-workspace").value.trim();
    if (!id) return toast("⛔ give the agent a name");
    if (!ws) return toast("⛔ every agent needs a workspace folder");
    api("POST", "/agents", {
      id: id,
      provider: $("ag-provider").value,
      workspace: ws,
      model: $("ag-model").value.trim() || undefined,
      systemPrompt: $("ag-prompt").value.trim() || undefined,
    }).then(function () {
      toast("✓ Agent " + id + " created — share it from a contact&#39;s &#39;What I share&#39; tab");
      $("ag-id").value = ""; $("ag-workspace").value = ""; $("ag-prompt").value = ""; $("ag-model").value = "";
      refresh().then(renderMyAgents);
    }).catch(function (e) { toast("⛔ " + e.message); });
  };
  $("sh-go").onclick = function () {
    var kind = $("sh-kind").value;
    var value = kind === "agent" ? $("sh-agent").value : $("sh-value").value.trim();
    if (!value) return toast(kind === "agent" ? "⛔ create an agent first (My agents)" : "⛔ what do you want to share?");
    var body = {
      peer: state.selected,
      kind: kind,
      value: value,
      mode: $("sh-mode").value,
    };
    if (kind === "agent" && $("sh-path").value.trim()) body.path = $("sh-path").value.trim();
    var dur = $("sh-for").value;
    if (dur) body.durationSeconds = Number(dur);
    api("POST", "/shares", body).then(function () {
      toast("✓ Shared with " + state.selected + (dur ? " — self-destructs automatically" : ""));
      $("sh-value").value = "";
      loadPeer(state.selected);
    }).catch(function (e) { toast("⛔ " + e.message); });
  };

  // ---------- Activity tab ----------
  function renderFeed() {
    var feed = $("feed");
    var entries = ((state.status && state.status.audit) || []).slice().reverse();
    feed.innerHTML = entries.length ? "" : '<div class="hint">Nothing yet.</div>';
    entries.forEach(function (e) {
      var line = document.createElement("div");
      line.className = e.decision;
      var kind = e.kind === "task" ? "ask" : e.kind;
      var what = kind + (e.agentId ? " · " + e.agentId : "") + (e.partyId ? " · " + e.partyId : "") +
        (e.reason ? " · " + e.reason : "") + (e.detail ? " — " + e.detail : "");
      line.innerHTML = '<span class="ts">' + esc(e.ts.slice(11, 19)) + "</span>" +
        (e.decision === "denied" ? "✗ " : "· ") + esc(what);
      feed.appendChild(line);
    });
  }

  // ---------- tabs ----------
  Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) {
    b.onclick = function () {
      Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (x) { x.classList.remove("sel"); });
      Array.prototype.forEach.call(document.querySelectorAll(".tabpane"), function (x) { x.classList.remove("sel"); });
      b.classList.add("sel");
      $("pane-" + b.getAttribute("data-tab")).classList.add("sel");
    };
  });

  // ---------- pairing ----------
  function makeInvite(outEl, waitEl) {
    api("POST", "/invites").then(function (r) {
      outEl.style.display = "block";
      outEl.textContent = r.link;
      if (waitEl) waitEl.style.display = "block";
      if (navigator.clipboard) navigator.clipboard.writeText(r.link).then(function () { toast("Invite copied — send it to them"); });
    }).catch(function (e) { toast("⛔ " + e.message); });
  }
  $("ob-invite").onclick = function () { makeInvite($("ob-invite-out"), $("ob-wait")); };
  $("ob-join-btn").onclick = function () {
    var link = $("ob-join").value.trim();
    if (!link) return toast("Paste the invite link first");
    api("POST", "/join", { link: link }).then(function (r) {
      toast('✓ Connected with "' + r.party.name + '"');
      refresh();
    }).catch(function (e) { toast("⛔ " + e.message); });
  };
  $("btn-add").onclick = function () {
    $("dlg-invite-link").textContent = "…";
    $("dlg-invite").showModal();
    makeInvite($("dlg-invite-link"), null);
  };
  $("c-wizard").onclick = function () { openWizard(); };
  $("c-test").onclick = function () {
    api("POST", "/test", { peer: state.selected }).then(function (r) {
      toast("✓ " + r.party.name + " answered in " + r.latencyMs + "ms");
    }).catch(function (e) { toast("⛔ " + e.message); });
  };

  // ---------- advanced ----------
  $("adv-toggle").onclick = function () { $("advanced").style.display = "flex"; };
  $("adv-close").onclick = function () { $("advanced").style.display = "none"; };
  $("advanced").onclick = function (e) { if (e.target === $("advanced")) $("advanced").style.display = "none"; };
  $("btn-ch-tg").onclick = function () {
    var env = $("ch-tg-env").value.trim();
    if (!env) return toast("⛔ name the env var holding the bot token");
    api("POST", "/channels", { kind: "telegram", tokenEnv: env }).then(function () { toast("✓ Saved — restart the node to start Telegram"); })
      .catch(function (e) { toast("⛔ " + e.message); });
  };
  $("btn-ch-gl").onclick = function () {
    var host = $("ch-gl-host").value.trim();
    var env = $("ch-gl-env").value.trim();
    if (!host || !env) return toast("⛔ GitLab needs a host and a token env var");
    api("POST", "/channels", { kind: "gitlab", host: host, tokenEnv: env }).then(function () { toast("✓ Saved — restart the node to start GitLab"); })
      .catch(function (e) { toast("⛔ " + e.message); });
  };

  // ---------- Simple/Advanced mode ----------
  function applyMode(mode) {
    document.body.classList.toggle("simple", mode !== "advanced");
    $("mode-toggle").textContent = mode === "advanced" ? "Simple view" : "Advanced";
  }
  $("mode-toggle").onclick = function () {
    var next = document.body.classList.contains("simple") ? "advanced" : "simple";
    applyMode(next);
    api("POST", "/ui", { mode: next }).catch(function () {});
  };

  // ---------- environment: AI available or one-command install ----------
  function applyEnvironment(env) {
    if (!env) return;
    var ready = env.ai && env.ai.claude && env.ai.claude.found;
    $("ai-banner").style.display = ready ? "none" : "flex";
    if (!ready) $("ai-cmd").textContent = env.ai.installCommand;
    state.aiReady = Boolean(ready);
    state.env = env;
  }
  $("ai-copy").onclick = function () {
    if (navigator.clipboard) navigator.clipboard.writeText($("ai-cmd").textContent).then(function () { toast("Copied — paste it in a terminal"); });
  };
  $("ai-recheck").onclick = function () {
    api("POST", "/environment/refresh").then(function (r) {
      applyEnvironment(r.environment);
      toast(r.environment.ai.claude.found ? "✓ Found it — AI assistants are ready" : "Still not found — did the install finish?");
    }).catch(function (e) { toast("⛔ " + e.message); });
  };

  // ---------- path picker: OS-feel directory autocomplete ----------
  function attachPathPicker(input) {
    if (input.dataset.pp) return;
    input.dataset.pp = "1";
    var wrap = document.createElement("div");
    wrap.className = "pp-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    var drop = document.createElement("div");
    drop.className = "pp-drop";
    wrap.appendChild(drop);
    var timer = null;
    function close() { drop.style.display = "none"; }
    function open() { drop.style.display = "block"; }
    function load() {
      api("GET", "/fs/suggest?path=" + encodeURIComponent(input.value)).then(function (r) {
        drop.innerHTML = "";
        if (!input.value.trim() && (r.quickPicks || []).length) {
          var chips = document.createElement("div");
          chips.className = "pp-chips";
          r.quickPicks.forEach(function (q) {
            var c = document.createElement("span");
            c.className = "pp-chip";
            c.textContent = q.label;
            c.onclick = function () { input.value = q.path; load(); input.focus(); };
            chips.appendChild(c);
          });
          drop.appendChild(chips);
        }
        (r.dirs || []).forEach(function (d) {
          var item = document.createElement("div");
          item.className = "pp-item";
          item.textContent = d;
          item.onmousedown = function (e) { e.preventDefault(); input.value = d; load(); };
          drop.appendChild(item);
        });
        if (drop.children.length) open(); else close();
      }).catch(close);
    }
    input.addEventListener("focus", load);
    input.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(load, 200);
    });
    input.addEventListener("blur", function () { setTimeout(close, 150); });
  }
  ["sh-value", "sh-path", "ag-workspace"].forEach(function (id) {
    if ($(id)) attachPathPicker($(id));
  });

  // ---------- scenario wizard ----------
  var wiz = { scenarios: [], scenario: null, role: 0 };
  function openWizard() {
    api("GET", "/scenarios").then(function (r) {
      wiz.scenarios = r.scenarios || [];
      wiz.scenario = null;
      renderWizard();
      $("wizard").style.display = "flex";
    }).catch(function (e) { toast("⛔ " + e.message); });
  }
  $("wiz-close").onclick = function () { $("wizard").style.display = "none"; };
  $("wizard").onclick = function (e) { if (e.target === $("wizard")) $("wizard").style.display = "none"; };
  function renderWizard() {
    var body = $("wiz-body");
    body.innerHTML = "";
    if (!wiz.scenario) {
      $("wiz-title").textContent = "What are you and " + state.selected + " doing together?";
      wiz.scenarios.forEach(function (s) {
        var card = document.createElement("div");
        card.className = "scn-card";
        card.innerHTML = "<b>" + esc(s.title) + "</b><span class='hint'>" + esc(s.tagline) + "</span>";
        card.onclick = function () { wiz.scenario = s; wiz.role = -1; renderWizard(); };
        body.appendChild(card);
      });
      return;
    }
    if (wiz.role === -1) {
      $("wiz-title").textContent = wiz.scenario.title + " — which one are you?";
      wiz.scenario.roles.forEach(function (role, i) {
        var card = document.createElement("div");
        card.className = "scn-card";
        card.innerHTML = "<b>I'm " + esc(role) + "</b>";
        card.onclick = function () { wiz.role = i; renderWizard(); };
        body.appendChild(card);
      });
      return;
    }
    var steps = wiz.scenario.steps[wiz.role];
    $("wiz-title").textContent = wiz.scenario.title + " — your setup";
    if (!steps.length) {
      body.innerHTML = "<div class='hint'>Nothing to set up on your side — <b>" + esc(state.selected) + "</b> does the sharing in this scenario. When they finish, what they shared appears in your <b>Ask them</b> tab.</div>";
      return;
    }
    steps.forEach(function (step, idx) {
      var div = document.createElement("div");
      div.className = "wiz-step";
      div.id = "wiz-step-" + idx;
      var needsAiBlocked = step.needsAi && !state.aiReady;
      var needsBlocked = step.needs && state.env && state.env[step.needs] === false;
      var html = "<b>" + (idx + 1) + ". " + esc(step.title) + "</b>";
      if (needsAiBlocked) {
        html += "<div class='hint'>Needs the AI runtime — use the install banner above, then reopen this.</div>";
        div.innerHTML = html;
        body.appendChild(div);
        return;
      }
      if (needsBlocked) {
        html += "<div class='hint'>Not available on this machine (missing " + esc(step.needs) + ").</div>";
        div.innerHTML = html;
        body.appendChild(div);
        return;
      }
      div.innerHTML = html;
      var row = document.createElement("div");
      row.className = "row";
      var valueInput = document.createElement("input");
      valueInput.placeholder = step.defaults.valueHint || "";
      var needsPath = step.action === "create-agent" || step.action === "share-folder";
      row.appendChild(valueInput);
      var durLabel = document.createElement("span");
      durLabel.className = "hint";
      if (step.defaults.durationSeconds) {
        var d = step.defaults.durationSeconds;
        durLabel.textContent = "for " + (d >= 86400 * 2 ? Math.round(d / 86400) + " days" : d >= 3600 ? Math.round(d / 3600) + " hour(s)" : Math.round(d / 60) + " min") + ", then it stops itself";
      } else {
        durLabel.textContent = step.defaults.mode === "rw" ? "read & write, until you stop it" : "read-only, until you stop it";
      }
      row.appendChild(durLabel);
      var go = document.createElement("button");
      go.textContent = "Do it";
      go.onclick = function () {
        go.disabled = true;
        runStep(step, valueInput.value.trim()).then(function () {
          div.classList.add("done");
          go.textContent = "✓ done";
          loadPeer(state.selected);
        }).catch(function (e) {
          toast("⛔ " + e.message);
          go.disabled = false;
        });
      };
      row.appendChild(go);
      div.appendChild(row);
      body.appendChild(div);
      if (needsPath) attachPathPicker(valueInput);
    });
    var done = document.createElement("div");
    done.className = "hint";
    done.style.marginTop = "6px";
    done.textContent = "When these say done, tell " + state.selected + " to pick the same scenario on their side — their steps mirror yours.";
    body.appendChild(done);
  }
  function runStep(step, value) {
    if (!value && step.action !== "share-agent") return Promise.reject(new Error("fill in the field first"));
    if (step.action === "create-agent") {
      return api("POST", "/agents", {
        id: step.defaults.agentId || "assistant",
        provider: "claude-code",
        workspace: value,
        systemPrompt: step.defaults.agentPrompt,
      });
    }
    if (step.action === "share-agent") {
      return api("POST", "/shares", {
        peer: state.selected,
        kind: "agent",
        value: step.defaults.agentId || "assistant",
        mode: step.defaults.mode || "ro",
        durationSeconds: step.defaults.durationSeconds,
      });
    }
    var kind = step.action.replace("share-", "");
    return api("POST", "/shares", {
      peer: state.selected,
      kind: kind,
      value: value,
      mode: step.defaults.mode || "ro",
      durationSeconds: step.defaults.durationSeconds,
    });
  }

  // ---------- poll loop ----------
  var lastPeerLoad = 0;
  function refresh() {
    return api("GET", "/status").then(function (s) {
      render(s);
      // refresh the selected peer's grants/shares every few cycles
      if (state.selected && Date.now() - lastPeerLoad > 7000) {
        lastPeerLoad = Date.now();
        loadPeer(state.selected);
      }
    }).catch(function () { /* node restarting */ });
  }
  $("sh-kind").onchange();
  refresh();
  setInterval(refresh, 2500);
})();
</script>
</body>
</html>
`
