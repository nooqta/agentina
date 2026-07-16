// --- The agentina console ---
//
// v3 "minimalist redesign": a friendly, mobile-shaped, light-theme
// console — one 520px column, one screen at a time, zero jargon.
// Design principles carried over from v2 and sharpened:
//   1. CONTACTS, NOT CONCEPTS — home is the people you work with.
//      Grants/sessions/adapters stay machinery; users see "shares",
//      "asking", and an activity log in plain sentences.
//   2. ONE SCREEN, ONE JOB — every flow is a short wizard (share it,
//      new agent, invite) with a progress bar and a big next button.
//   3. HONEST UI — nothing is simulated. Every button calls the node's
//      real /agentina/v1 API; denials and offline states show as what
//      they are.
//
// Served at GET / (loopback-only). Vanilla JS, no CDN dependencies —
// Google-font links degrade to system fonts when offline/air-gapped.
// NOTE: the page lives in a TS template literal — the inline <script>
// avoids backticks, dollar-brace, and ALL backslash escapes on purpose;
// string concatenation only (see console.test.ts for the regression).

export const CONSOLE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>agentina</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f8f9fa; font-family: 'Outfit', -apple-system, 'Segoe UI', system-ui, sans-serif; color: #202124; }
  a { color: #2979FF; text-decoration: none; font-weight: 700; }
  a:hover { color: #1B5FD9; }
  button { font-family: inherit; }
  input { font-family: inherit; }
  input::placeholder { color: #9aa0a6; }
  .wrap { min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 0 20px 48px; }
  .col { width: 100%; max-width: 520px; display: flex; flex-direction: column; flex: 1; }
  .mono { font-family: 'Roboto Mono', ui-monospace, 'SF Mono', monospace; }

  .title { font-size: 30px; font-weight: 800; letter-spacing: -0.5px; margin: 12px 0 8px; }
  .title2 { font-size: 28px; font-weight: 800; letter-spacing: -0.5px; margin: 16px 0 6px; }
  .sub { font-size: 17px; color: #5f6368; line-height: 1.5; margin-bottom: 28px; }
  .sub2 { font-size: 16px; color: #5f6368; line-height: 1.5; margin-bottom: 24px; }
  .eyebrow { font-size: 14px; font-weight: 700; color: #9aa0a6; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
  .hint { font-size: 13.5px; color: #9aa0a6; line-height: 1.5; }

  .hdr { display: flex; align-items: center; height: 76px; gap: 14px; }
  .btn-back { width: 44px; height: 44px; border: 2px solid #e8eaed; border-radius: 50%; background: #ffffff; color: #5f6368; font-size: 19px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex: none; padding: 0; }
  .btn-back:hover { background: #f1f3f4; }

  .btn { display: flex; align-items: center; justify-content: center; width: 100%; height: 58px; border: none; border-radius: 16px; font-size: 18px; font-weight: 700; cursor: pointer; }
  .btn-blue { background: #2979FF; color: #ffffff; box-shadow: 0 4px 0 #1B5FD9; }
  .btn-blue:hover { background: #2168E8; }
  .btn-blue:active { transform: translateY(3px); box-shadow: 0 1px 0 #1B5FD9; }
  .btn-green { background: #22B573; color: #ffffff; box-shadow: 0 4px 0 #178F58; }
  .btn-green:hover { background: #1EA466; }
  .btn-green:active { transform: translateY(3px); box-shadow: 0 1px 0 #178F58; }
  .btn-white { background: #ffffff; color: #2979FF; border: 2px solid #dadce0; box-shadow: 0 4px 0 #dadce0; }
  .btn-white:hover { background: #F2F7FF; }
  .btn-white:active { transform: translateY(3px); box-shadow: 0 1px 0 #dadce0; }
  .btn-plain { background: #ffffff; color: #202124; border: 2px solid #dadce0; box-shadow: 0 3px 0 #dadce0; height: 52px; font-size: 16px; }
  .btn-plain:hover { background: #f8f9fa; }
  .btn-plain:active { transform: translateY(2px); box-shadow: 0 1px 0 #dadce0; }
  .linkbtn { border: none; background: none; color: #2979FF; font-size: 14.5px; font-weight: 700; cursor: pointer; padding: 8px; }
  .linkbtn:hover { color: #1B5FD9; }
  .mutedbtn { border: none; background: none; color: #9aa0a6; font-size: 13.5px; font-weight: 600; cursor: pointer; padding: 8px; }
  .mutedbtn:hover { color: #5f6368; }

  .card { display: flex; align-items: center; gap: 16px; width: 100%; background: #ffffff; border: 2px solid #e8eaed; border-radius: 20px; padding: 18px 20px; cursor: pointer; text-align: left; box-shadow: 0 3px 0 #e8eaed; }
  .card:hover { border-color: #A9CBFF; background: #FAFCFF; }
  .card:active { transform: translateY(2px); box-shadow: 0 1px 0 #e8eaed; }
  .card.hov-green:hover { border-color: #A9E8C9; background: #F7FCFA; }
  .card.hov-amber:hover { border-color: #FFE08A; background: #FFFCF5; }
  .rowcard { display: flex; align-items: center; gap: 14px; background: #ffffff; border: 2px solid #e8eaed; border-radius: 16px; padding: 14px 16px; }
  .chev { color: #dadce0; font-size: 22px; font-weight: 700; }

  .avatar { border-radius: 50%; color: #ffffff; display: flex; align-items: center; justify-content: center; font-weight: 700; flex: none; }
  .glyph { border-radius: 14px; display: flex; align-items: center; justify-content: center; font-weight: 800; flex: none; }

  .input { width: 100%; box-sizing: border-box; height: 58px; border: 2px solid #dadce0; border-radius: 16px; padding: 0 20px; font-size: 16px; background: #ffffff; outline: none; }
  .input:focus { border-color: #2979FF; }
  .input.mono { font-size: 14px; }

  .pill { font-size: 12.5px; font-weight: 700; border-radius: 999px; padding: 4px 12px; white-space: nowrap; }
  .chip { display: flex; align-items: center; gap: 6px; border: 2px solid #e8eaed; border-radius: 999px; background: #ffffff; color: #5f6368; font-size: 14px; font-weight: 700; cursor: pointer; padding: 8px 16px; }
  .chip.sel { border-color: #2979FF; background: #E7F0FF; color: #2979FF; }
  .chip-sm { border: 2px solid #e8eaed; border-radius: 999px; background: #ffffff; color: #5f6368; font-size: 13px; font-weight: 700; cursor: pointer; padding: 6px 14px; }
  .chip-sm.sel { border-color: #2979FF; background: #2979FF; color: #ffffff; }
  .sug { border: 2px solid #e8eaed; border-radius: 999px; background: #ffffff; color: #5f6368; font-size: 14px; font-weight: 600; cursor: pointer; padding: 8px 16px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sug:hover { border-color: #A9CBFF; color: #2979FF; }

  .b-me { align-self: flex-end; max-width: 80%; background: #2979FF; color: #ffffff; border-radius: 18px 18px 4px 18px; padding: 12px 16px; font-size: 15.5px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  .b-them { align-self: flex-start; max-width: 80%; background: #ffffff; border: 2px solid #e8eaed; border-radius: 18px 18px 18px 4px; padding: 12px 16px; font-family: 'Roboto Mono', monospace; font-size: 13px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
  .b-err { align-self: flex-start; max-width: 80%; background: #FEECEC; border: 2px solid #F9C1C1; color: #F23A3A; border-radius: 18px 18px 18px 4px; padding: 12px 16px; font-size: 14.5px; font-weight: 600; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  .b-via { align-self: center; font-size: 12.5px; font-weight: 700; color: #9aa0a6; background: #f1f3f4; border-radius: 999px; padding: 6px 16px; max-width: 92%; text-align: center; line-height: 1.5; }

  .code { font-family: 'Roboto Mono', monospace; font-size: 12.5px; background: #f8f9fa; border: 1px solid #e8eaed; border-radius: 8px; padding: 7px 12px; word-break: break-all; }
  .progress { flex: 1; height: 14px; background: #e8eaed; border-radius: 999px; overflow: hidden; }
  .progress div { height: 100%; background: #22B573; border-radius: 999px; transition: width .3s; }
  .toggle { width: 52px; height: 30px; border: none; border-radius: 999px; cursor: pointer; position: relative; padding: 0; flex: none; transition: background .2s; }
  .toggle div { position: absolute; top: 3px; width: 24px; height: 24px; border-radius: 50%; background: #ffffff; box-shadow: 0 1px 3px rgba(32,33,36,.3); transition: left .2s; }

  #toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #202124; color: #ffffff; border-radius: 999px; padding: 12px 24px; font-size: 15px; font-weight: 600; z-index: 50; max-width: 80vw; box-shadow: 0 4px 16px rgba(32,33,36,.3); opacity: 0; pointer-events: none; transition: opacity .25s; }
  #toast.show { opacity: 1; }

  .stack { display: flex; flex-direction: column; gap: 12px; }
  .stack-sm { display: flex; flex-direction: column; gap: 10px; }
  .chips { display: flex; gap: 8px; flex-wrap: wrap; }
  .rail { display: flex; gap: 12px; overflow-x: auto; padding: 4px 2px 12px; scroll-snap-type: x mandatory; }
  .wordmark { font-family: 'Fredoka', 'Outfit', sans-serif; font-weight: 600; cursor: pointer; user-select: none; letter-spacing: -0.2px; }
  .dotwrap { position: relative; display: inline-block; color: #F23A3A; font-style: normal; }
  .hopdot { position: absolute; top: 0.09em; left: 50%; transform: translateX(-50%); width: 0.17em; height: 0.17em; border-radius: 50%; background: #FFB300; }
  .popin { animation: pop .45s ease-out; }
  .pulse { width: 10px; height: 10px; border-radius: 50%; background: #22B573; animation: pulse 1.4s infinite; }

  @keyframes pop { 0% { transform: scale(0); } 70% { transform: scale(1.15); } 100% { transform: scale(1); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
  @keyframes dotDrop { 0% { transform: translate(-50%, -0.6em); opacity: 0; } 60% { transform: translate(-50%, 0.05em); opacity: 1; } 80% { transform: translate(-50%, -0.03em); } 100% { transform: translate(-50%, 0); opacity: 1; } }
  @keyframes dotDrop2 { 0% { transform: translate(-50%, -0.6em); opacity: 0; } 60% { transform: translate(-50%, 0.05em); opacity: 1; } 80% { transform: translate(-50%, -0.03em); } 100% { transform: translate(-50%, 0); opacity: 1; } }
</style>
</head>
<body>
<div class="wrap"><div class="col" id="col"></div></div>
<div id="toast"></div>
<script>
(function () {
  "use strict";
  var API = "/agentina/v1";
  var BLUE = "#2979FF", BLUE_D = "#1B5FD9", GREEN = "#22B573", GREEN_D = "#178F58",
      RED = "#F23A3A", YELLOW = "#FFB300", AMBER = "#9A6700",
      BLUE_BG = "#E7F0FF", GREEN_BG = "#E4F8EE", AMBER_BG = "#FFF6DE", RED_BG = "#FEECEC";
  var AVATARS = [BLUE, GREEN, RED, YELLOW];

  var S = {
    screen: null, stack: [],
    status: null, lastHash: "",
    contact: null, peerInfo: {}, shares: {}, threads: {},
    chip: {}, conv: {},
    inviteLink: null, inviteBaseline: 0,
    share: {}, agentNew: {}, edit: null, skillEdit: {}, form: {},
    channelId: null, hopFlip: false, quickPicks: [],
    toastT: null, sugT: null
  };

  // ---------- tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement("div"); d.textContent = String(s == null ? "" : s); return d.innerHTML; }
  function E(tag, cls, html) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    if (html != null) d.innerHTML = html;
    return d;
  }
  function B(cls, html, onclick) { var b = E("button", cls, html); b.onclick = onclick; return b; }
  function css(node, styles) { for (var k in styles) node.style[k] = styles[k]; return node; }
  function api(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json()["catch"](function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
        return data;
      });
    });
  }
  function toast(msg) {
    clearTimeout(S.toastT);
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    S.toastT = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }
  function copyText(text, msg) {
    var done = function () { toast(msg || "Copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { toast("Copy failed — select it by hand"); });
    } else {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed — select it by hand"); }
      document.body.removeChild(ta);
    }
  }
  function countdown(iso) {
    var left = Math.round((Date.parse(iso) - Date.now()) / 1000);
    if (left <= 0) return "expiring…";
    if (left < 90) return left + "s left";
    if (left < 5400) return Math.round(left / 60) + "m left";
    if (left < 129600) return Math.round(left / 3600) + "h left";
    return Math.round(left / 86400) + "d left";
  }
  function fmtTime(iso) {
    var d = new Date(iso), now = new Date();
    var hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    var day = function (x) { return x.getFullYear() + "-" + x.getMonth() + "-" + x.getDate(); };
    if (day(d) === day(now)) return "Today, " + hm;
    var y = new Date(now.getTime() - 86400000);
    if (day(d) === day(y)) return "Yesterday, " + hm;
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return d.getDate() + " " + months[d.getMonth()] + ", " + hm;
  }
  function initialOf(name) { return (String(name || "?").trim().charAt(0) || "?").toUpperCase(); }
  function baseName(p) {
    var parts = String(p || "").split("/").filter(function (x) { return x; });
    return parts.length ? parts[parts.length - 1] : String(p || "");
  }

  // ---------- brand ----------
  function logoDots(size, gap) {
    return "<div style='display:flex;gap:" + gap + "px;align-items:center'>" +
      "<svg width='" + size + "' height='" + size + "' viewBox='0 0 17 17'><rect x='0.5' y='0.5' width='16' height='16' rx='3' fill='#2979FF'></rect></svg>" +
      "<svg width='" + size + "' height='" + size + "' viewBox='0 0 17 17'><path d='M8.5 0.8 L16.4 15.6 Q16.6 16.2 16 16.2 L1 16.2 Q0.4 16.2 0.6 15.6 Z' fill='#F23A3A'></path></svg>" +
      "<svg width='" + size + "' height='" + size + "' viewBox='0 0 17 17'><rect x='2.2' y='2.2' width='12.6' height='12.6' rx='2' fill='#FFB300' transform='rotate(45 8.5 8.5)'></rect></svg>" +
      "<svg width='" + size + "' height='" + size + "' viewBox='0 0 17 17'><circle cx='8.5' cy='8.5' r='8' fill='#22B573'></circle></svg>" +
      "</div>";
  }
  function wordmark(px) {
    var anim = (S.hopFlip ? "dotDrop2" : "dotDrop") + " .45s .15s cubic-bezier(.3,.7,.4,1.2) 1 both";
    var w = E("div", "wordmark",
      "<span style='color:#2979FF'>agent</span>" +
      "<span class='dotwrap'>ı<span class='hopdot' style='animation:" + anim + "'></span></span>" +
      "<span style='color:#FFB300'>n</span><span style='color:#22B573'>a</span>");
    w.style.fontSize = px + "px";
    w.onclick = function () { S.hopFlip = !S.hopFlip; render(); };
    return w;
  }
  function homeIcon() {
    return "<svg width='20' height='20' viewBox='0 0 24 24' fill='none'><rect x='6' y='8' width='12' height='12' rx='1.6' stroke='#2979FF' stroke-width='1.6' stroke-linejoin='round'></rect><path d='M8 8 C8 3, 16 3, 16 8' stroke='#2979FF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'></path><path d='M9.5 20 V15 C9.5 12, 14.5 12, 14.5 15 V20' stroke='#2979FF' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'></path></svg>";
  }
  function checkCircle() {
    var d = E("div", "popin");
    css(d, { width: "110px", height: "110px", borderRadius: "50%", background: GREEN, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 0 " + GREEN_D });
    d.innerHTML = "<svg width='52' height='52' viewBox='0 0 24 24' fill='none'><path d='M4 12.5l5 5L20 6.5' stroke='#ffffff' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'></path></svg>";
    return d;
  }

  // ---------- state accessors ----------
  function peers() { return (S.status && S.status.peers) || []; }
  function env() { return (S.status && S.status.environment) || null; }
  function cur() {
    if (S.screen) return S.screen;
    return peers().length ? "home" : "onboarding";
  }
  function contactOf(name) {
    var idx = 0;
    var list = peers();
    for (var i = 0; i < list.length; i++) if (list[i].peer === name) idx = i;
    var p = list.filter(function (x) { return x.peer === name; })[0];
    return {
      name: name,
      healthy: Boolean(p && p.healthy),
      color: AVATARS[idx % AVATARS.length],
      initial: initialOf(name)
    };
  }
  function myAgents() {
    return ((S.status && S.status.agents) || []).filter(function (a) {
      return a.id !== "echo" && !a.session &&
        a.id.indexOf("folder-") !== 0 && a.id.indexOf("server-") !== 0 && a.id.indexOf("repo-") !== 0;
    });
  }
  function agentShared(id) {
    return ((S.status && S.status.grants) || []).some(function (g) {
      return g.status === "active" && (g.agentIds || []).indexOf(id) >= 0;
    });
  }
  function grantedAgents(name) {
    var info = S.peerInfo[name];
    if (!info) return [];
    var granted = {};
    (info.grantedToMe || []).forEach(function (g) {
      (g.agentIds || []).forEach(function (id) { granted[id] = g; });
    });
    return (info.agents || [])
      .filter(function (a) { return granted[a.id] && a.id !== "echo"; })
      .map(function (a) { return { id: a.id, tags: a.tags || [], grant: granted[a.id] }; });
  }
  function partyNames() {
    var map = {};
    peers().forEach(function (p) { if (p.partyId) map[p.partyId] = p.peer; });
    return map;
  }
  function channelRunning(id) {
    return ((S.status && S.status.channels) || []).indexOf(id) >= 0;
  }
  function bindings() {
    return (S.status && S.status.channelBindings) || [];
  }
  function channelConfigured(kind) {
    return bindings().some(function (b) { return b.kind === kind; });
  }
  function bindingFor(kind, agentId) {
    return bindings().filter(function (b) {
      return b.kind === kind && (b.agentId || null) === (agentId || null);
    })[0];
  }
  // Each connection keeps its token under its own env name, so two
  // Telegram bots (two agents) never collide: TG_BOT_TOKEN_BOOKKEEPER.
  function secretName(base, agentId) {
    if (!agentId) return base;
    var suffix = String(agentId).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return base + "_" + (suffix || "AGENT");
  }
  function claudeFound() {
    var e = env();
    return Boolean(e && e.ai && e.ai.claude && e.ai.claude.found);
  }
  function runtimeProbe(key) {
    var e = env();
    var r = e && e.ai && e.ai.runtimes && e.ai.runtimes[key];
    return r || { found: key === "claude" ? claudeFound() : false };
  }
  // Can another MACHINE reach this node? Two things must hold: the
  // listener isn't loopback-only, and the advertised URL (embedded in
  // every invite) isn't a loopback address.
  function connectivity() {
    var s = S.status || {};
    var url = String(s.url || "");
    var bind = String(s.bind || "127.0.0.1");
    var boundWide = bind !== "127.0.0.1" && bind !== "localhost" && bind !== "::1";
    var urlPublic = url.indexOf("127.0.0.1") < 0 && url.indexOf("localhost") < 0;
    var e = env();
    var ip = e && e.network && e.network.tailscale && e.network.tailscale.ip;
    return { reachable: boundWide && urlPublic, ip: ip || null };
  }
  /** Set the reachable address in one call — the node re-listens by
   *  itself, no terminal, no restart. Used by the one-tap buttons. */
  function applyAddress(address, after) {
    api("POST", "/account", { url: address }).then(function () {
      toast("Done — you're reachable at " + address + " now");
      refresh().then(function () { if (after) after(); });
    })["catch"](function (e) { toast(e.message); });
  }
  function connectivityCard() {
    var conn = connectivity();
    var box = E("div");
    css(box, { background: AMBER_BG, border: "2px solid #FFE08A", borderRadius: "16px", padding: "16px 18px", marginBottom: "20px" });
    box.appendChild(css(E("div", null, "Inviting someone on another machine? One tap first."), { fontSize: "15px", fontWeight: "700", lineHeight: "1.45", marginBottom: "6px" }));
    box.appendChild(css(E("div", null,
      "Right now this machine only answers to itself, so the link below works for same-machine demos only." +
      (conn.ip ? " Tailscale is already on this machine — use its address and agentina applies it instantly:" : " Set your network address and agentina applies it instantly — no restart.")
    ), { fontSize: "14px", color: "#5f6368", lineHeight: "1.5", marginBottom: "10px" }));
    if (conn.ip) {
      var useIp = B("", "Use my Tailscale address — " + esc(conn.ip), function () {
        applyAddress(conn.ip, function () {
          // The link on screen embeds the old address — mint a fresh one.
          api("POST", "/invites").then(function (r) { S.inviteLink = r.link; render(); })["catch"](function () { render(); });
        });
      });
      css(useIp, { border: "none", borderRadius: "12px", background: BLUE, color: "#ffffff", fontSize: "14.5px", fontWeight: "700", cursor: "pointer", padding: "10px 16px", boxShadow: "0 3px 0 " + BLUE_D });
      box.appendChild(useIp);
    }
    var links = css(E("div"), { display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "8px" });
    var mk = function (label, fn) {
      var b = B("", label, fn);
      css(b, { border: "none", background: "none", color: AMBER, fontSize: "13.5px", fontWeight: "700", cursor: "pointer", padding: "6px" });
      return b;
    };
    links.appendChild(mk("New to this? The plain-language guide →", function () { go("networkHelp"); }));
    links.appendChild(mk("Network settings →", openAccount));
    box.appendChild(links);
    return box;
  }

  // ---------- navigation ----------
  function go(screen, extra) {
    S.stack.push(cur());
    S.screen = screen;
    if (extra) for (var k in extra) S[k] = extra[k];
    render();
  }
  function goHome() { S.screen = peers().length ? "home" : "onboarding"; S.stack = []; render(); }
  function back() {
    if (cur() === "share" && S.share.step && S.share.step !== "done") {
      var order = ["kind", "what", "access", "duration", "confirm"];
      var i = order.indexOf(S.share.step);
      if (i > 0) { S.share.step = order[i - 1]; render(); return; }
    }
    if (cur() === "agentNew" && S.agentNew.step && S.agentNew.step !== "done") {
      var order2 = ["name", "folder", "purpose"];
      var j = order2.indexOf(S.agentNew.step);
      if (j > 0) { S.agentNew.step = order2[j - 1]; render(); return; }
    }
    var prev = S.stack.pop();
    S.screen = prev || (peers().length ? "home" : "onboarding");
    render();
  }
  function hdr(children) {
    var d = E("div", "hdr");
    d.appendChild(B("btn-back", "←", back));
    (children || []).forEach(function (c) { d.appendChild(c); });
    return d;
  }

  // ---------- data loads ----------
  function loadPeer(name, thenRender) {
    api("GET", "/peer-grants?peer=" + encodeURIComponent(name)).then(function (info) {
      var changed = JSON.stringify(S.peerInfo[name]) !== JSON.stringify(info);
      S.peerInfo[name] = info;
      if (changed && thenRender) maybeRender();
    })["catch"](function () { /* peer offline */ });
    api("GET", "/shares?peer=" + encodeURIComponent(name)).then(function (r) {
      var next = r.shares || [];
      var changed = JSON.stringify(S.shares[name]) !== JSON.stringify(next);
      S.shares[name] = next;
      if (changed && thenRender) maybeRender();
    })["catch"](function () { /* */ });
    api("GET", "/chat?peer=" + encodeURIComponent(name)).then(function (r) {
      var next = r.entries || [];
      var changed = JSON.stringify(S.threads[name]) !== JSON.stringify(next);
      S.threads[name] = next;
      if (changed && thenRender) {
        // The ask thread must update live even while the user is typing —
        // re-render but keep the input's value and focus.
        if (cur() === "ask" && name === S.contact) { renderKeepAskFocus(); scrollThread(); }
        else { maybeRender(); }
      }
    })["catch"](function () { /* */ });
  }
  function loadQuickPicks(cb) {
    api("GET", "/fs/suggest?path=").then(function (r) {
      S.quickPicks = r.quickPicks || [];
      if (cb) cb();
    })["catch"](function () { if (cb) cb(); });
  }

  // ---------- rendering ----------
  function render() {
    var col = $("col");
    col.innerHTML = "";
    var scr = cur();
    if (scr !== "onboarding" && scr !== "home") col.appendChild(brandBar());
    var fn = SCREENS[scr] || SCREENS.home;
    col.appendChild(fn());
  }
  function maybeRender() {
    var a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return;
    render();
  }
  function scrollThread() {
    if (cur() !== "ask") return;
    requestAnimationFrame(function () { window.scrollTo(0, document.body.scrollHeight); });
  }
  function renderKeepAskFocus() {
    var hadFocus = document.activeElement && document.activeElement.id === "ask-input";
    render();
    var inp = $("ask-input");
    if (inp) {
      inp.value = S.form.ask || "";
      if (hadFocus) inp.focus();
    }
  }
  function brandBar() {
    var bar = E("div");
    css(bar, { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 0 6px" });
    var left = B("", "", goHome);
    css(left, { display: "flex", alignItems: "center", gap: "8px", background: "none", border: "none", cursor: "pointer", padding: "0" });
    left.innerHTML = logoDots(10, 5);
    var wm = wordmark(17);
    wm.onclick = goHome;
    left.appendChild(wm);
    bar.appendChild(left);
    var homeBtn = B("", homeIcon(), goHome);
    homeBtn.title = "Home";
    css(homeBtn, { width: "40px", height: "40px", border: "2px solid #e8eaed", borderRadius: "50%", background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" });
    bar.appendChild(homeBtn);
    return bar;
  }
  function screenRoot(name) {
    var d = E("div");
    d.setAttribute("data-screen", name);
    return d;
  }

  var SCREENS = {};

  // ============ ONBOARDING ============
  SCREENS.onboarding = function () {
    var d = screenRoot("onboarding");
    css(d, { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: "96px" });
    d.appendChild(E("div", null, logoDots(17, 9)));
    var wm = wordmark(42);
    css(wm, { margin: "28px 0 12px" });
    d.appendChild(wm);
    var tag = E("div", null, "Work together, safely. Connect with one other person — share exactly what's needed, nothing more.");
    css(tag, { fontSize: "19px", color: "#5f6368", lineHeight: "1.5", maxWidth: "380px", marginBottom: "44px" });
    d.appendChild(tag);
    d.appendChild(B("btn btn-blue", "Invite someone", startInvite));
    var joinB = B("btn btn-white", "I have an invite link", function () { go("join"); });
    css(joinB, { marginTop: "14px" });
    d.appendChild(joinB);
    var foot = E("div", null, "No accounts. No cloud in the middle. Connecting shares nothing by itself.");
    css(foot, { fontSize: "14px", color: "#9aa0a6", marginTop: "32px", maxWidth: "340px", lineHeight: "1.5" });
    d.appendChild(foot);
    if (S.status && !connectivity().reachable) {
      var connLink = B("linkbtn", "Connecting across two machines? How to get reachable →", function () { go("networkHelp"); });
      css(connLink, { marginTop: "10px" });
      d.appendChild(connLink);
    }
    var helpLink = B("mutedbtn", "New here? Help & guides", function () { go("help"); });
    css(helpLink, { marginTop: "4px" });
    d.appendChild(helpLink);
    return d;
  };

  function startInvite() {
    S.inviteLink = null;
    S.inviteBaseline = peers().length;
    go("invite");
    api("POST", "/invites").then(function (r) {
      S.inviteLink = r.link;
      if (cur() === "invite") render();
    })["catch"](function (e) { toast("Could not create an invite — " + e.message); });
  }

  // ============ INVITE ============
  SCREENS.invite = function () {
    var d = screenRoot("invite");
    d.appendChild(hdr());
    d.appendChild(E("div", "title", "Send them this link"));
    d.appendChild(E("div", "sub", "Over any chat. It works once and expires in 15 minutes — worthless after they join."));
    if (S.status && !connectivity().reachable) d.appendChild(connectivityCard());
    var box = E("div", "mono", S.inviteLink ? esc(S.inviteLink) : "creating your invite…");
    css(box, { background: "#ffffff", border: "2px dashed #A9CBFF", borderRadius: "16px", padding: "18px 20px", fontSize: "13px", color: BLUE, wordBreak: "break-all", lineHeight: "1.6" });
    d.appendChild(box);
    var cp = B("btn btn-blue", "Copy link", function () {
      if (!S.inviteLink) { toast("Still creating the link…"); return; }
      copyText(S.inviteLink, "Copied — send it over any chat");
    });
    css(cp, { marginTop: "20px" });
    d.appendChild(cp);
    var wait = E("div", null, "<div class='pulse'></div>Waiting for them to join…");
    css(wait, { display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "36px", color: "#5f6368", fontSize: "16px", fontWeight: "500" });
    d.appendChild(wait);
    return d;
  };

  // ============ JOIN ============
  SCREENS.join = function () {
    var d = screenRoot("join");
    d.appendChild(hdr());
    d.appendChild(E("div", "title", "Paste the invite"));
    d.appendChild(E("div", "sub", "The link they sent you — it starts with <span class='mono' style='font-size:14px;color:#202124'>agentina://join/</span>"));
    var input = E("input", "input");
    input.placeholder = "agentina://join/…";
    input.value = S.form.join || "";
    input.oninput = function () { S.form.join = input.value; };
    d.appendChild(input);
    var joinBtn = B("btn btn-green", "Join", function () {
      var link = (S.form.join || "").trim();
      if (!link) { toast("Paste the invite link first"); return; }
      joinBtn.disabled = true;
      api("POST", "/join", { link: link }).then(function (r) {
        S.form.join = "";
        toast("Connected with " + r.party.name);
        refresh().then(goHome);
      })["catch"](function (e) { joinBtn.disabled = false; toast("That didn't work — " + e.message); });
    });
    css(joinBtn, { marginTop: "20px" });
    input.onkeydown = function (e) { if (e.key === "Enter") joinBtn.click(); };
    d.appendChild(joinBtn);
    return d;
  };

  // ============ HOME ============
  SCREENS.home = function () {
    var d = screenRoot("home");

    var head = E("div");
    css(head, { display: "flex", alignItems: "center", gap: "8px", height: "76px" });
    head.appendChild(E("div", null, logoDots(10, 5)));
    head.appendChild(wordmark(21));
    head.appendChild(css(E("div"), { flex: "1" }));
    var me = (S.status && S.status.party) || { name: "…" };
    var profile = (S.status && S.status.profile) || {};
    var acct = B("", "", function () { openAccount(); });
    css(acct, { display: "flex", alignItems: "center", gap: "8px", background: "#ffffff", border: "2px solid #e8eaed", borderRadius: "999px", padding: "5px 14px 5px 6px", cursor: "pointer" });
    var av = E("div", "avatar", esc(initialOf(me.name)));
    css(av, { width: "28px", height: "28px", background: profile.color || BLUE, fontSize: "14px" });
    acct.appendChild(av);
    acct.appendChild(css(E("div", null, esc(me.name)), { fontSize: "14.5px", fontWeight: "600", color: "#5f6368" }));
    head.appendChild(acct);
    d.appendChild(head);

    if (env() && !claudeFound()) d.appendChild(aiBanner());

    d.appendChild(css(E("div", null, "Your people"), { fontSize: "30px", fontWeight: "800", letterSpacing: "-0.5px", margin: "28px 0 6px" }));
    d.appendChild(css(E("div", null, "Everyone this machine works with."), { fontSize: "16px", color: "#5f6368", marginBottom: "20px" }));

    var list = E("div", "stack");
    peers().forEach(function (p, i) {
      var card = B("card", "", function () { openContact(p.peer); });
      var av2 = E("div", "avatar", esc(initialOf(p.peer)));
      css(av2, { width: "52px", height: "52px", background: AVATARS[i % AVATARS.length], fontSize: "22px" });
      card.appendChild(av2);
      var mid = css(E("div"), { flex: "1", minWidth: "0" });
      mid.appendChild(css(E("div", null, esc(p.peer)), { fontSize: "18px", fontWeight: "700" }));
      var info = S.peerInfo[p.peer];
      var n = info ? grantedAgents(p.peer).length : -1;
      var statusText = !p.healthy ? "Offline"
        : n > 0 ? ("Sharing " + n + " thing" + (n > 1 ? "s" : "") + " with you")
        : n === 0 ? "Online · nothing shared yet" : "Online";
      var st = E("div", null, "<div style='width:8px;height:8px;border-radius:50%;background:" + (p.healthy ? GREEN : "#dadce0") + "'></div>" + esc(statusText));
      css(st, { display: "flex", alignItems: "center", gap: "6px", fontSize: "14.5px", color: "#5f6368", marginTop: "2px" });
      mid.appendChild(st);
      card.appendChild(mid);
      card.appendChild(E("div", "chev", "›"));
      list.appendChild(card);
    });
    d.appendChild(list);

    var inv = B("btn btn-blue", "+ Invite someone", startInvite);
    css(inv, { marginTop: "20px" });
    d.appendChild(inv);

    var row = css(E("div"), { display: "flex", gap: "12px", marginTop: "14px" });
    var agentsB = B("btn btn-plain", "My agents", function () { go("agents"); });
    css(agentsB, { flex: "1" });
    var actB = B("btn btn-plain", "Activity", function () { go("activity"); });
    css(actB, { flex: "1" });
    row.appendChild(agentsB); row.appendChild(actB);
    d.appendChild(row);

    var foot = css(E("div"), { display: "flex", justifyContent: "center", gap: "8px", marginTop: "36px" });
    foot.appendChild(B("mutedbtn", "Help & guides", function () { go("help"); }));
    foot.appendChild(css(E("div", null, "·"), { color: "#dadce0", alignSelf: "center" }));
    foot.appendChild(B("mutedbtn", "Advanced settings", function () { go("advanced"); }));
    d.appendChild(foot);
    return d;
  };

  function aiBanner() {
    var e = env();
    var box = E("div");
    css(box, { background: AMBER_BG, border: "2px solid #FFE08A", borderRadius: "16px", padding: "16px 18px", marginTop: "8px" });
    box.appendChild(css(E("div", null, "AI assistants aren't set up on this machine yet — everything else works."), { fontSize: "15px", fontWeight: "600", lineHeight: "1.45", marginBottom: "10px" }));
    var row = css(E("div"), { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" });
    var cmd = e.ai.installCommand;
    var code = E("code", "mono", esc(cmd));
    css(code, { fontSize: "12.5px", background: "#ffffff", border: "1px solid #F5DE9B", borderRadius: "8px", padding: "6px 10px" });
    row.appendChild(code);
    var mk = function (label, fn) {
      var b = B("", label, fn);
      css(b, { border: "none", background: "none", color: AMBER, fontSize: "13.5px", fontWeight: "700", cursor: "pointer", padding: "6px" });
      return b;
    };
    row.appendChild(mk("Copy", function () { copyText(cmd, "Copied — paste it in a terminal"); }));
    row.appendChild(mk("I installed it", recheckEnv));
    box.appendChild(row);
    var more = mk("Prefer Gemini or Codex? See all runtimes →", function () { go("runtimes"); });
    css(more, { padding: "6px 6px 0 6px", marginTop: "4px" });
    box.appendChild(more);
    return box;
  }
  function recheckEnv() {
    api("POST", "/environment/refresh").then(function (r) {
      if (S.status) S.status.environment = r.environment;
      toast(r.environment.ai.claude.found ? "Found it — AI assistants are ready" : "Still not found — did the install finish?");
      render();
    })["catch"](function (e) { toast(e.message); });
  }

  // ============ CONTACT ============
  function openContact(name) {
    S.contact = name;
    loadPeer(name, true);
    go("contact");
  }
  SCREENS.contact = function () {
    var d = screenRoot("contact");
    var c = contactOf(S.contact);
    d.appendChild(hdr());

    var head = css(E("div"), { display: "flex", alignItems: "center", gap: "16px", margin: "8px 0 24px" });
    var av = E("div", "avatar", esc(c.initial));
    css(av, { width: "64px", height: "64px", background: c.color, fontSize: "28px" });
    head.appendChild(av);
    var hh = E("div");
    hh.appendChild(css(E("div", null, esc(c.name)), { fontSize: "26px", fontWeight: "800", letterSpacing: "-0.5px" }));
    var st = css(E("div"), { display: "flex", alignItems: "center", gap: "6px", fontSize: "15px", color: "#5f6368" });
    st.innerHTML = "<div style='width:8px;height:8px;border-radius:50%;background:" + (c.healthy ? GREEN : "#dadce0") + "'></div>" + (c.healthy ? "Online" : "Offline") + " · ";
    var test = B("", "test connection", function () {
      api("POST", "/test", { peer: c.name }).then(function (r) {
        toast(r.party.name + " answered in " + r.latencyMs + " ms");
      })["catch"](function () { toast(c.name + " didn't answer — are they online?"); });
    });
    css(test, { border: "none", background: "none", color: BLUE, fontSize: "15px", fontWeight: "600", cursor: "pointer", padding: "0" });
    st.appendChild(test);
    hh.appendChild(st);
    head.appendChild(hh);
    d.appendChild(head);

    var stack = E("div", "stack");
    // Ask — the blue primary card.
    var granted = grantedAgents(c.name);
    var askSub = granted.length
      ? "They shared: " + granted.map(function (g) { return chipText(g); }).join(", ")
      : "They haven't shared anything yet";
    var ask = B("", "", function () { go("ask"); });
    css(ask, { display: "flex", alignItems: "center", gap: "16px", width: "100%", background: BLUE, border: "none", borderRadius: "20px", padding: "20px", cursor: "pointer", textAlign: "left", boxShadow: "0 4px 0 " + BLUE_D });
    ask.innerHTML =
      "<div style='width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center'>" +
      "<svg width='24' height='24' viewBox='0 0 24 24' fill='none'><path d='M21 12a8 8 0 0 1-8 8H4l2.2-2.6A8 8 0 1 1 21 12z' stroke='#ffffff' stroke-width='2' stroke-linejoin='round'></path></svg></div>" +
      "<div style='flex:1'><div style='font-size:18px;font-weight:700;color:#ffffff'>Ask their agents</div>" +
      "<div style='font-size:14.5px;color:rgba(255,255,255,0.85);margin-top:2px'>" + esc(askSub) + "</div></div>" +
      "<div style='color:rgba(255,255,255,0.6);font-size:22px;font-weight:700'>›</div>";
    stack.appendChild(ask);

    var share = B("card hov-green", "", function () { openShare(); });
    share.innerHTML =
      "<div class='glyph' style='width:48px;height:48px;background:" + GREEN_BG + "'>" +
      "<svg width='24' height='24' viewBox='0 0 24 24' fill='none'><path d='M12 5v16M4 9h16v4H4zM4 13h16v8H4z' stroke='#178F58' stroke-width='2' stroke-linejoin='round'></path></svg></div>" +
      "<div style='flex:1'><div style='font-size:18px;font-weight:700'>Share something</div>" +
      "<div style='font-size:14.5px;color:#5f6368;margin-top:2px'>A folder, an agent, a server — you stay in control</div></div>" +
      "<div class='chev'>›</div>";
    stack.appendChild(share);

    var act = B("card hov-amber", "", function () { go("activity"); });
    act.innerHTML =
      "<div class='glyph' style='width:48px;height:48px;background:" + AMBER_BG + "'>" +
      "<svg width='24' height='24' viewBox='0 0 24 24' fill='none'><path d='M5 4h14v17H5z' stroke='#9A6700' stroke-width='2' stroke-linejoin='round'></path><path d='M9 9h6M9 13h6M9 17h4' stroke='#9A6700' stroke-width='2' stroke-linecap='round'></path></svg></div>" +
      "<div style='flex:1'><div style='font-size:18px;font-weight:700'>Activity</div>" +
      "<div style='font-size:14.5px;color:#5f6368;margin-top:2px'>Every use, every denial — both sides keep this log</div></div>" +
      "<div class='chev'>›</div>";
    stack.appendChild(act);
    d.appendChild(stack);

    var mine = (S.shares[c.name] || []).filter(function (x) { return x.status === "active"; });
    if (mine.length) {
      var eb = E("div", "eyebrow", "You share with " + esc(c.name));
      css(eb, { margin: "32px 0 12px" });
      d.appendChild(eb);
      var list = E("div", "stack-sm");
      mine.forEach(function (x) {
        var row = E("div", "rowcard");
        var g = shareGlyph(x.kind);
        var gl = E("div", "glyph", g.glyph);
        css(gl, { width: "40px", height: "40px", borderRadius: "12px", background: g.bg, color: g.fg, fontSize: "15px" });
        row.appendChild(gl);
        var mid = css(E("div"), { flex: "1", minWidth: "0" });
        mid.appendChild(css(E("div", null, esc(shareLabel(x))), { fontSize: "16px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }));
        mid.appendChild(css(E("div", null, esc(shareDesc(x))), { fontSize: "13.5px", color: "#5f6368" }));
        row.appendChild(mid);
        if (x.expiresAt) {
          var ttl = E("div", "pill", esc(countdown(x.expiresAt)));
          css(ttl, { color: AMBER, background: AMBER_BG });
          row.appendChild(ttl);
        }
        var stop = B("", "Stop", function () {
          api("POST", "/shares/stop", { id: x.id }).then(function () {
            toast("Stopped — their next use is denied");
            loadPeer(c.name, true);
            refresh();
          })["catch"](function (e2) { toast(e2.message); });
        });
        css(stop, { border: "2px solid #F9C1C1", borderRadius: "12px", background: "#ffffff", color: RED, fontSize: "14px", fontWeight: "700", cursor: "pointer", padding: "8px 16px" });
        row.appendChild(stop);
        list.appendChild(row);
      });
      d.appendChild(list);
    }
    return d;
  };

  function shareGlyph(kind) {
    if (kind === "folder") return { glyph: "F", bg: BLUE_BG, fg: BLUE };
    if (kind === "server") return { glyph: "SV", bg: AMBER_BG, fg: AMBER };
    if (kind === "repo") return { glyph: "R", bg: RED_BG, fg: RED };
    return { glyph: "AI", bg: GREEN_BG, fg: GREEN_D };
  }
  function shareLabel(x) {
    if (x.kind === "folder") return baseName(x.value);
    if (x.kind === "repo") return baseName(x.value);
    return x.value;
  }
  function shareDesc(x) {
    var kindLabel = { folder: "folder", server: "server", repo: "repository", agent: "my agent" }[x.kind] || x.kind;
    var mode = x.mode === "rw" ? "read & write" : "look only";
    return kindLabel + " · " + mode;
  }

  // ============ ASK ============
  var USAGE = {
    "scoped-fs": "Try “read brief.txt”, or “list”",
    "scoped-git": "Try “branches”, or “log 10”",
    "ssh-exec": "Type a command to run on their server",
    "claude-code": "Plain language — ask about what they shared"
  };
  function chipText(a) {
    var sc = (a.grant.scopes || [])[0];
    if (sc && sc.kind === "fs" && a.id.indexOf("folder-") === 0) return baseName(sc.root);
    if (sc && sc.kind === "ssh") return sc.host;
    if (sc && sc.kind === "repo") return baseName(sc.url);
    return a.id;
  }
  function chipGlyph(a) {
    var sc = (a.grant.scopes || [])[0];
    if (a.id.indexOf("folder-") === 0) return "F";
    if (sc && sc.kind === "ssh") return "SV";
    if (sc && sc.kind === "repo") return "R";
    return "AI";
  }
  SCREENS.ask = function () {
    var d = screenRoot("ask");
    css(d, { display: "flex", flexDirection: "column", flex: "1" });
    var c = contactOf(S.contact);

    var head = E("div", "hdr");
    head.appendChild(B("btn-back", "←", back));
    var av = E("div", "avatar", esc(c.initial));
    css(av, { width: "40px", height: "40px", background: c.color, fontSize: "17px" });
    head.appendChild(av);
    var hh = E("div");
    hh.appendChild(css(E("div", null, "Ask " + esc(c.name) + "'s agents"), { fontSize: "18px", fontWeight: "800" }));
    hh.appendChild(css(E("div", null, "only what they shared · they see every ask"), { fontSize: "13px", color: "#5f6368" }));
    head.appendChild(hh);
    d.appendChild(head);

    var granted = grantedAgents(c.name);
    if (!granted.length) {
      var empty = css(E("div"), { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: "72px" });
      empty.innerHTML =
        "<div style='width:88px;height:88px;border-radius:50%;background:#e8eaed;display:flex;align-items:center;justify-content:center;margin-bottom:20px'>" +
        "<svg width='38' height='38' viewBox='0 0 24 24' fill='none'><rect x='5' y='10' width='14' height='10' rx='2.5' stroke='#5f6368' stroke-width='2'></rect><path d='M8 10V7a4 4 0 0 1 8 0v3' stroke='#5f6368' stroke-width='2'></path></svg></div>" +
        "<div style='font-size:22px;font-weight:800;margin-bottom:8px'>" + esc(c.name) + " hasn't shared anything yet</div>" +
        "<div style='font-size:16px;color:#5f6368;line-height:1.5;max-width:360px'>Sharing happens on their side — ask them to open agentina and tap “Share something”.</div>";
      d.appendChild(empty);
      return d;
    }

    // Channels row — honest: mentions from a connected channel reach the
    // same agents under the same rules; nothing is mirrored magically.
    var convRow = css(E("div"), { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", margin: "2px 0 10px" });
    convRow.appendChild(css(E("div", null, "Talk here or via"), { fontSize: "13px", fontWeight: "700", color: "#9aa0a6" }));
    var convKey = S.conv[c.name] || "console";
    var CONV_WHERE = {
      telegram: "from your Telegram bot",
      gitlab: "in a GitLab issue or MR comment",
      whatsapp: "from WhatsApp — text the number like a contact",
      github: "in a GitHub issue or PR comment",
      discord: "in any Discord channel the bot can see",
      slack: "in any Slack channel the bot is in"
    };
    var CONV_LABEL = { console: "Console", whatsapp: "WhatsApp", telegram: "Telegram", github: "GitHub", gitlab: "GitLab", discord: "Discord", slack: "Slack" };
    // Console always; then only channels that are actually set up — six
    // dormant chips would be noise. One shortcut covers the rest.
    var convChips = [{ key: "console" }];
    CHANNELS.forEach(function (ch) {
      if (ch.ready && (channelRunning(ch.id) || channelConfigured(ch.id))) convChips.push({ key: ch.id });
    });
    convChips.forEach(function (cc) {
      var b = B("chip-sm" + (convKey === cc.key ? " sel" : ""), esc(CONV_LABEL[cc.key] || cc.key), function () {
        S.conv[c.name] = cc.key;
        render();
      });
      convRow.appendChild(b);
    });
    convRow.appendChild(B("chip-sm", "+ Set up a channel", function () { go("advanced"); }));
    d.appendChild(convRow);
    if (convKey !== "console") {
      var label = CONV_LABEL[convKey] || convKey;
      var noteText = label + " is connected — @mention an agent " + (CONV_WHERE[convKey] || "there") + " and it reaches " + c.name + "'s side too. Their rules still decide, and every ask lands in Activity.";
      var note = E("div", null, esc(noteText));
      css(note, { background: BLUE_BG, border: "2px solid #A9CBFF", borderRadius: "14px", padding: "12px 16px", fontSize: "14px", color: BLUE_D, fontWeight: "600", lineHeight: "1.5", marginBottom: "12px" });
      d.appendChild(note);
    }

    // Share chips.
    if (!S.chip[c.name] || !granted.some(function (a) { return a.id === S.chip[c.name]; })) {
      S.chip[c.name] = granted[0].id;
    }
    var chips = css(E("div", "chips"), { margin: "6px 0 16px" });
    granted.forEach(function (a) {
      var sel = S.chip[c.name] === a.id;
      var label = chipGlyph(a) + " · " + chipText(a);
      if (a.grant.expiresAt) label += " · " + countdown(a.grant.expiresAt);
      var b = B("chip" + (sel ? " sel" : ""), esc(label), function () { S.chip[c.name] = a.id; render(); });
      chips.appendChild(b);
    });
    d.appendChild(chips);

    // Thread.
    var thread = css(E("div"), { flex: "1", display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "16px" });
    var entries = S.threads[c.name] || [];
    if (!entries.length) {
      var blank = E("div", null, "This conversation survives refreshes — and you also see what they ask your agents. Pick a share above, then ask.");
      css(blank, { color: "#9aa0a6", textAlign: "center", margin: "auto", maxWidth: "360px", fontSize: "15px", lineHeight: "1.5" });
      thread.appendChild(blank);
    }
    entries.forEach(function (m) {
      if (m.pending) { thread.appendChild(E("div", "b-me", esc(m.text))); return; }
      if (m.dir === "out") {
        thread.appendChild(E("div", "b-me", esc(m.text)));
        if (m.error) thread.appendChild(E("div", "b-err", esc(m.error)));
        else if (m.reply != null) thread.appendChild(E("div", "b-them", esc(m.reply)));
      } else {
        var s = esc(c.name) + " asked your " + esc(m.agent || "agent") + ": “" + esc(String(m.text || "").slice(0, 120)) + "”";
        thread.appendChild(E("div", "b-via", s));
      }
    });
    d.appendChild(thread);

    // Ask bar.
    var chosen = granted.filter(function (a) { return a.id === S.chip[c.name]; })[0];
    var ph = "Your message";
    (chosen && chosen.tags || []).forEach(function (t) { if (USAGE[t]) ph = USAGE[t]; });
    var bar = css(E("div"), { display: "flex", gap: "10px", position: "sticky", bottom: "20px" });
    var input = E("input", "input");
    input.id = "ask-input";
    css(input, { flex: "1", height: "56px", boxShadow: "0 3px 0 #e8eaed" });
    input.placeholder = ph;
    input.value = S.form.ask || "";
    input.oninput = function () { S.form.ask = input.value; };
    var send = B("", "Ask", function () { sendAsk(); });
    css(send, { width: "100px", height: "56px", border: "none", borderRadius: "16px", background: BLUE, color: "#ffffff", fontSize: "17px", fontWeight: "700", cursor: "pointer", boxShadow: "0 4px 0 " + BLUE_D, flex: "none" });
    input.onkeydown = function (e) { if (e.key === "Enter") sendAsk(); };
    bar.appendChild(input); bar.appendChild(send);
    d.appendChild(bar);
    return d;
  };

  function sendAsk() {
    var name = S.contact;
    var text = (S.form.ask || "").trim();
    if (!text) return;
    S.form.ask = "";
    S.threads[name] = S.threads[name] || [];
    S.threads[name].push({ pending: true, text: text });
    render();
    scrollThread();
    var inp = $("ask-input");
    if (inp) inp.focus();
    api("POST", "/task", { peer: name, agent: S.chip[name], message: text }).then(function () {
      loadPeer(name, true);
    })["catch"](function () {
      loadPeer(name, true); // the error is in the durable log — reload shows it
    });
  }

  // ============ SHARE WIZARD ============
  function openShare() {
    S.share = { step: "kind", kind: null, value: "", mode: "ro", duration: null };
    loadQuickPicks();
    go("share");
  }
  var SHARE_KINDS = {
    folder: { glyph: "F", fg: BLUE, bg: BLUE_BG, label: "A folder", desc: "Files they can use", title: "Which folder?", sub: "They see this folder — and never anything above it. Sneaky “..” paths fail, guaranteed.", ph: "/path/to/folder", mono: true },
    agent: { glyph: "AI", fg: GREEN_D, bg: GREEN_BG, label: "One of my agents", desc: "It answers their questions", title: "Which agent?", sub: "It answers their questions — inside its own folder only.", ph: "agent name", mono: false },
    server: { glyph: "SV", fg: AMBER, bg: AMBER_BG, label: "A server", desc: "Run commands, scoped", title: "Which server?", sub: "Commands run through the share — credentials never leave your machine.", ph: "user@host", mono: true },
    repo: { glyph: "R", fg: RED, bg: RED_BG, label: "A repository", desc: "Browse code, no keys", title: "Which repository?", sub: "They can browse it through your machine — no deploy keys handed over.", ph: "https://… or git@…", mono: true }
  };
  var DURATIONS = [
    { key: 3600, glyph: "1h", label: "1 hour", desc: "Quick help — gone before dinner" },
    { key: 86400, glyph: "1d", label: "1 day", desc: "Today's task" },
    { key: 604800, glyph: "1w", label: "1 week", desc: "This sprint" },
    { key: 0, glyph: "∞", label: "Until I stop it", desc: "Ongoing — one tap ends it" }
  ];
  function durText(sec) {
    if (!sec) return "until you stop it";
    if (sec === 3600) return "for 1 hour";
    if (sec === 86400) return "for 1 day";
    return "for 1 week";
  }
  SCREENS.share = function () {
    var d = screenRoot("share");
    var c = contactOf(S.contact);
    var st = S.share;

    var head = E("div", "hdr");
    head.appendChild(B("btn-back", "←", back));
    var prog = E("div", "progress", "<div></div>");
    prog.firstChild.style.width = { kind: "16%", what: "36%", access: "56%", duration: "76%", confirm: "92%", done: "100%" }[st.step] || "16%";
    head.appendChild(prog);
    d.appendChild(head);

    if (st.step === "kind") {
      d.appendChild(E("div", "title2", "What do you want to share with " + esc(c.name) + "?"));
      d.appendChild(E("div", "sub2", "Exactly this, nothing else — and you can stop it anytime."));
      var grid = css(E("div"), { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" });
      ["folder", "agent", "server", "repo"].forEach(function (k) {
        var m = SHARE_KINDS[k];
        var b = B("card", "", function () {
          st.kind = k; st.value = ""; st.step = "what"; render();
        });
        css(b, { flexDirection: "column", gap: "10px", padding: "26px 16px", alignItems: "center" });
        b.innerHTML =
          "<div class='glyph' style='width:56px;height:56px;border-radius:16px;background:" + m.bg + ";color:" + m.fg + ";font-size:20px'>" + m.glyph + "</div>" +
          "<div style='font-size:17px;font-weight:700'>" + m.label + "</div>" +
          "<div style='font-size:13.5px;color:#5f6368;text-align:center;line-height:1.4'>" + m.desc + "</div>";
        grid.appendChild(b);
      });
      d.appendChild(grid);
      return d;
    }

    var m = SHARE_KINDS[st.kind];
    if (st.step === "what") {
      d.appendChild(E("div", "title2", m.title));
      d.appendChild(E("div", "sub2", m.sub));
      var input = E("input", "input" + (m.mono ? " mono" : ""));
      input.placeholder = m.ph;
      input.value = st.value;
      input.oninput = function () {
        st.value = input.value;
        if (st.kind === "folder") {
          clearTimeout(S.sugT);
          S.sugT = setTimeout(function () { loadDirSuggestions(input.value); }, 250);
        }
      };
      d.appendChild(input);
      var sugs = css(E("div", "chips"), { marginTop: "14px" });
      sugs.id = "sugs";
      d.appendChild(sugs);
      renderSuggestions(sugs);
      var next = B("btn btn-blue", "Continue", function () {
        if (!(st.value || "").trim()) { toast("Pick or type something first"); return; }
        st.value = st.value.trim();
        st.step = "access"; render();
      });
      css(next, { marginTop: "28px" });
      input.onkeydown = function (e) { if (e.key === "Enter") next.click(); };
      d.appendChild(next);
      return d;
    }

    if (st.step === "access") {
      d.appendChild(E("div", "title2", "How much can they do?"));
      d.appendChild(E("div", "sub2", "Look only means look only — enforced by your machine, not by trust."));
      var stack = E("div", "stack");
      var opt = function (glyph, glyphBg, glyphFg, label, desc, mode) {
        var b = B("card", "", function () { st.mode = mode; st.step = "duration"; render(); });
        b.innerHTML =
          "<div class='glyph' style='width:48px;height:48px;background:" + glyphBg + ";color:" + glyphFg + ";font-size:16px'>" + glyph + "</div>" +
          "<div><div style='font-size:18px;font-weight:700'>" + label + "</div>" +
          "<div style='font-size:14.5px;color:#5f6368;margin-top:2px'>" + desc + "</div></div>";
        return b;
      };
      stack.appendChild(opt("RO", BLUE_BG, BLUE, "Look only", "They can read — never change anything", "ro"));
      stack.appendChild(opt("RW", AMBER_BG, AMBER, "Read &amp; write", "They can also make changes — still only here", "rw"));
      d.appendChild(stack);
      return d;
    }

    if (st.step === "duration") {
      d.appendChild(E("div", "title2", "For how long?"));
      d.appendChild(E("div", "sub2", "When time's up it self-destructs — no cleanup to remember."));
      var stack2 = E("div", "stack");
      DURATIONS.forEach(function (opt) {
        var b = B("card", "", function () { st.duration = opt.key; st.step = "confirm"; render(); });
        b.innerHTML =
          "<div class='glyph' style='width:44px;height:44px;background:" + BLUE_BG + ";color:" + BLUE + ";font-size:14px'>" + opt.glyph + "</div>" +
          "<div><div style='font-size:18px;font-weight:700'>" + opt.label + "</div>" +
          "<div style='font-size:14.5px;color:#5f6368;margin-top:2px'>" + opt.desc + "</div></div>";
        stack2.appendChild(b);
      });
      d.appendChild(stack2);
      return d;
    }

    if (st.step === "confirm") {
      d.appendChild(E("div", "title2", "Ready to share?"));
      d.appendChild(E("div", "sub2", "This is everything " + esc(c.name) + " will get."));
      var box = css(E("div"), { background: "#ffffff", border: "2px solid #e8eaed", borderRadius: "20px", padding: "24px", display: "flex", flexDirection: "column", gap: "14px" });
      box.innerHTML =
        "<div style='display:flex;align-items:center;gap:14px'>" +
        "<div class='glyph' style='width:44px;height:44px;background:" + m.bg + ";color:" + m.fg + ";font-size:15px'>" + m.glyph + "</div>" +
        "<div style='font-size:18px;font-weight:700;word-break:break-all'>" + esc(st.value) + "</div></div>" +
        "<div style='display:flex;align-items:center;gap:14px;font-size:16px;color:#5f6368'><div style='font-size:13px;font-weight:800;width:36px;text-align:center'>" + (st.mode === "rw" ? "RW" : "RO") + "</div>" + (st.mode === "rw" ? "Read &amp; write" : "Look only — they can never change anything") + "</div>" +
        "<div style='display:flex;align-items:center;gap:14px;font-size:16px;color:#5f6368'><div style='font-size:13px;font-weight:800;width:36px;text-align:center'>TTL</div>" + (st.duration ? "Self-destructs after " + durText(st.duration).replace("for ", "") : "Until you stop it") + "</div>" +
        "<div style='display:flex;align-items:center;gap:14px;font-size:16px;color:#5f6368'><div style='font-size:13px;font-weight:800;width:36px;text-align:center;color:" + RED + "'>STOP</div>You can stop it anytime, in one tap</div>";
      d.appendChild(box);
      var goBtn = B("btn btn-green", "Share it", function () {
        goBtn.disabled = true;
        var body = { peer: c.name, kind: st.kind, value: st.value, mode: st.mode };
        if (st.duration) body.durationSeconds = st.duration;
        api("POST", "/shares", body).then(function () {
          st.step = "done";
          loadPeer(c.name, false);
          refresh();
          render();
        })["catch"](function (e) { goBtn.disabled = false; toast(e.message); });
      });
      css(goBtn, { marginTop: "24px" });
      d.appendChild(goBtn);
      return d;
    }

    // done
    var doneBox = css(E("div"), { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: "64px" });
    doneBox.appendChild(checkCircle());
    doneBox.appendChild(css(E("div", null, "Shared with " + esc(c.name) + "!"), { fontSize: "28px", fontWeight: "800", letterSpacing: "-0.5px", margin: "28px 0 8px" }));
    doneBox.appendChild(css(E("div", null,
      esc(st.value) + " · " + (st.mode === "rw" ? "read & write" : "look only") + " · " + durText(st.duration) + ".<br>It shows up in their “Ask” screen right away."
    ), { fontSize: "16.5px", color: "#5f6368", lineHeight: "1.5", maxWidth: "360px" }));
    var doneBtn = B("btn btn-blue", "Done", function () { S.screen = "contact"; S.stack = ["home"]; render(); });
    css(doneBtn, { marginTop: "36px" });
    doneBox.appendChild(doneBtn);
    d.appendChild(doneBox);
    return d;
  };

  function renderSuggestions(container) {
    container.innerHTML = "";
    var st = S.share;
    var picks = [];
    if (st.kind === "agent") {
      picks = myAgents().map(function (a) { return { label: a.id, value: a.id }; });
    } else if (st.kind === "folder") {
      picks = (S.quickPicks || []).map(function (q) { return { label: q.label, value: q.path }; });
    }
    picks.slice(0, 6).forEach(function (p) {
      container.appendChild(B("sug", esc(p.label), function () {
        st.value = p.value;
        var inp = document.querySelector("input.input");
        if (inp) inp.value = p.value;
      }));
    });
  }
  function loadDirSuggestions(path) {
    if (cur() !== "share" || S.share.step !== "what" || S.share.kind !== "folder") return;
    api("GET", "/fs/suggest?path=" + encodeURIComponent(path)).then(function (r) {
      var box = $("sugs");
      if (!box) return;
      box.innerHTML = "";
      var dirs = (r.dirs || []).slice(0, 6);
      if (!dirs.length && !path.trim()) { renderSuggestions(box); return; }
      dirs.forEach(function (p) {
        box.appendChild(B("sug", esc(p), function () {
          S.share.value = p;
          var inp = document.querySelector("input.input");
          if (inp) { inp.value = p; inp.focus(); }
          loadDirSuggestions(p);
        }));
      });
    })["catch"](function () { /* */ });
  }

  // ============ MY AGENTS ============
  var PROVIDERS = [
    { key: "claude-code", label: "Claude Code", desc: "Anthropic's CLI — thinks in its folder", probe: "claude", supported: true },
    { key: "gemini-cli", label: "Gemini CLI", desc: "Google's assistant CLI", probe: "gemini", supported: false },
    { key: "codex", label: "Codex CLI", desc: "OpenAI's assistant CLI", probe: "codex", supported: false },
    { key: "scoped-fs", label: "Files only", desc: "No AI — serves files from the folder", probe: null, supported: true }
  ];
  function providerLabel(key) {
    var p = PROVIDERS.filter(function (x) { return x.key === key; })[0];
    return p ? p.label : key;
  }
  SCREENS.agents = function () {
    var d = screenRoot("agents");
    d.appendChild(hdr());
    d.appendChild(E("div", "title", "My agents"));
    d.appendChild(E("div", "sub2", "Your AI workers. Tap one to edit it, pick its skills, or change its runtime."));
    var list = E("div", "stack");
    var agents = myAgents();
    if (!agents.length) {
      var blank = E("div", null, "No agents yet — create your first below. It lives in a folder and answers questions about what's inside.");
      css(blank, { fontSize: "14.5px", color: "#9aa0a6", background: "#ffffff", border: "2px dashed #e8eaed", borderRadius: "16px", padding: "16px 18px", textAlign: "center", lineHeight: "1.5" });
      list.appendChild(blank);
    }
    agents.forEach(function (a) {
      var card = B("card", "", function () { openAgentEdit(a); });
      var skills = a.skills || [];
      var on = skills.filter(function (s) { return s.on; }).length;
      var descParts = [providerLabel(a.adapter)];
      if (a.workspace) descParts.push(a.workspace);
      if (skills.length) descParts.push(on + "/" + skills.length + " skills on");
      card.innerHTML =
        "<div class='glyph' style='width:52px;height:52px;border-radius:16px;background:" + GREEN_BG + ";color:" + GREEN_D + ";font-size:16px'>AI</div>" +
        "<div style='flex:1;min-width:0'><div style='font-size:18px;font-weight:700'>" + esc(a.id) + "</div>" +
        "<div style='font-size:14px;color:#5f6368;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'>" + esc(descParts.join(" · ")) + "</div></div>" +
        (agentShared(a.id) ? "<div class='pill' style='color:" + GREEN_D + ";background:" + GREEN_BG + "'>shared</div>" : "") +
        "<div class='chev'>›</div>";
      list.appendChild(card);
    });
    d.appendChild(list);
    var newB = B("btn btn-green", "+ New agent", function () {
      S.agentNew = { step: "name", name: "", folder: "", purpose: "" };
      loadQuickPicks();
      go("agentNew");
    });
    css(newB, { marginTop: "20px" });
    d.appendChild(newB);
    var rt = B("linkbtn", "AI runtimes — Claude, Gemini, Codex →", function () { go("runtimes"); });
    css(rt, { alignSelf: "center", marginTop: "24px" });
    d.appendChild(rt);
    return d;
  };

  // ============ AGENT EDIT ============
  function openAgentEdit(a) {
    S.edit = {
      id: a.id,
      provider: a.adapter,
      workspace: a.workspace || "",
      purpose: a.prompt || "",
      skills: (a.skills || []).map(function (s) { return { file: s.file, desc: s.desc, on: s.on }; })
    };
    go("agentEdit");
  }
  // Pull the just-saved skill list back onto the open editor after an
  // add/remove, so the agentEdit screen reflects disk without a reopen.
  function reloadEditSkills() {
    if (!S.edit) return;
    var a = ((S.status && S.status.agents) || []).filter(function (x) { return x.id === S.edit.id; })[0];
    if (a) S.edit.skills = (a.skills || []).map(function (s) { return { file: s.file, desc: s.desc, on: s.on }; });
    render();
  }
  // Open the skill editor — blank for a new skill, or prefilled with the
  // file's current content for an edit.
  function openSkillEdit(agentId, file) {
    if (!file) { S.skillEdit = { agentId: agentId, file: "", content: "", isNew: true }; go("skillEdit"); return; }
    api("GET", "/skills/content?agentId=" + encodeURIComponent(agentId) + "&file=" + encodeURIComponent(file)).then(function (r) {
      S.skillEdit = { agentId: agentId, file: r.file, content: r.content || "", isNew: false };
      go("skillEdit");
    })["catch"](function (e) { toast(e.message); });
  }
  SCREENS.skillEdit = function () {
    var d = screenRoot("skillEdit");
    var st = S.skillEdit || { file: "", content: "", isNew: true };
    var head = E("div", "hdr");
    head.appendChild(B("btn-back", "←", back));
    d.appendChild(head);
    d.appendChild(E("div", "title2", st.isNew ? "New skill" : "Edit skill"));
    d.appendChild(E("div", "sub2", "A markdown file the agent reads on its very next answer — no restart. Lead with a one-line summary."));
    var name = E("input", "input mono");
    css(name, { height: "50px", marginBottom: "16px" });
    name.placeholder = "e.g. status-reports";
    name.value = st.file;
    name.disabled = !st.isNew;
    if (!st.isNew) css(name, { opacity: "0.55", cursor: "not-allowed" });
    name.oninput = function () { st.file = name.value; };
    d.appendChild(name);
    var ta = E("textarea", "input mono");
    css(ta, { display: "block", width: "100%", minHeight: "320px", padding: "14px 16px", lineHeight: "1.55", resize: "vertical" });
    ta.placeholder = "# Status reports — lead with what shipped, then blockers. Always cite the source file.";
    ta.value = st.content;
    ta.oninput = function () { st.content = ta.value; };
    d.appendChild(ta);
    var save = B("btn btn-blue", "Save skill", function () {
      if (!(st.file || "").trim()) { toast("Give the skill a name first"); return; }
      save.disabled = true;
      api("POST", "/skills", { agentId: st.agentId, file: st.file.trim(), content: st.content }).then(function () {
        toast("Saved — the next answer uses it");
        return refresh();
      }).then(function () { reloadEditSkills(); back(); })["catch"](function (e) { save.disabled = false; toast(e.message); });
    });
    css(save, { marginTop: "20px" });
    d.appendChild(save);
    return d;
  };

  SCREENS.agentEdit = function () {
    var d = screenRoot("agentEdit");
    var ed = S.edit || { id: "?", skills: [] };
    d.appendChild(hdr());

    var head = css(E("div"), { display: "flex", alignItems: "center", gap: "16px", margin: "8px 0 24px" });
    head.innerHTML =
      "<div class='glyph' style='width:60px;height:60px;border-radius:18px;background:" + GREEN_BG + ";color:" + GREEN_D + ";font-size:18px'>AI</div>" +
      "<div><div style='font-size:26px;font-weight:800;letter-spacing:-0.5px'>" + esc(ed.id) + "</div>" +
      "<div style='font-size:14.5px;color:#5f6368'>" + (agentShared(ed.id) ? "Shared with a contact — changes apply to their next ask" : "Not shared yet") + "</div></div>";
    d.appendChild(head);

    d.appendChild(E("div", "eyebrow", "Runtime"));
    var radios = css(E("div", "stack-sm"), { marginBottom: "24px" });
    PROVIDERS.forEach(function (p) {
      var sel = ed.provider === p.key;
      var installed = p.probe ? runtimeProbe(p.probe).found : true;
      var b = B("", "", function () {
        if (!p.supported) { toast(p.label + " support is coming — Claude Code is the AI runtime today"); return; }
        if (p.probe && !installed) toast(p.label + " isn't installed — see AI runtimes");
        ed.provider = p.key;
        render();
      });
      css(b, { display: "flex", alignItems: "center", gap: "14px", width: "100%", background: sel ? BLUE_BG : "#ffffff", border: "2px solid " + (sel ? BLUE : "#e8eaed"), borderRadius: "16px", padding: "14px 16px", cursor: "pointer", textAlign: "left" });
      var pillHtml = !p.supported
        ? "<div class='pill' style='color:" + AMBER + ";background:" + AMBER_BG + "'>coming soon</div>"
        : (p.probe && !installed ? "<div class='pill' style='color:" + AMBER + ";background:" + AMBER_BG + "'>not installed</div>" : "");
      b.innerHTML =
        "<div style='width:22px;height:22px;border-radius:50%;border:2px solid " + (sel ? BLUE : "#dadce0") + ";background:" + (sel ? BLUE : "#ffffff") + ";display:flex;align-items:center;justify-content:center;flex:none'>" +
        (sel ? "<div style='width:10px;height:10px;border-radius:50%;background:#ffffff'></div>" : "") + "</div>" +
        "<div style='flex:1'><div style='font-size:16px;font-weight:700'>" + p.label + "</div>" +
        "<div style='font-size:13.5px;color:#5f6368'>" + p.desc + "</div></div>" + pillHtml;
      radios.appendChild(b);
    });
    d.appendChild(radios);
    var rtLink = B("linkbtn", "How to set these up alongside agentina →", function () { go("runtimes"); });
    css(rtLink, { alignSelf: "flex-start", padding: "0", margin: "-14px 0 24px" });
    d.appendChild(rtLink);

    d.appendChild(E("div", "eyebrow", "Workspace folder"));
    var ws = E("input", "input mono");
    css(ws, { height: "54px", marginBottom: "24px" });
    ws.value = ed.workspace;
    ws.oninput = function () { ed.workspace = ws.value; };
    d.appendChild(ws);

    d.appendChild(E("div", "eyebrow", "What it helps with"));
    var pp = E("input", "input");
    css(pp, { height: "54px", marginBottom: "24px" });
    pp.placeholder = "e.g. answer questions about the Acme project";
    pp.value = ed.purpose;
    pp.oninput = function () { ed.purpose = pp.value; };
    d.appendChild(pp);

    d.appendChild(E("div", "eyebrow", "Skills"));
    d.appendChild(css(E("div", null, "Markdown files in <span class='mono' style='font-size:12.5px'>workspace/skills/</span> — edit them anytime, the next answer uses them. Toggle which ones are active."), { fontSize: "14px", color: "#5f6368", lineHeight: "1.5", marginBottom: "12px" }));
    if (ed.skills.length) {
      var list = E("div", "stack-sm");
      ed.skills.forEach(function (sk) {
        var row = E("div", "rowcard");
        var mid = B("", "", function () { openSkillEdit(ed.id, sk.file); });
        css(mid, { flex: "1", minWidth: "0", background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: "0" });
        mid.appendChild(css(E("div", "mono", esc(sk.file)), { fontSize: "13.5px", fontWeight: "700" }));
        if (sk.desc) mid.appendChild(css(E("div", null, esc(sk.desc)), { fontSize: "13.5px", color: "#5f6368", marginTop: "2px" }));
        row.appendChild(mid);
        var tg = B("toggle", "<div></div>", function () {
          sk.on = !sk.on;
          tg.style.background = sk.on ? GREEN : "#dadce0";
          tg.firstChild.style.left = sk.on ? "25px" : "3px";
          api("POST", "/skills/toggle", { agentId: ed.id, file: sk.file, on: sk.on })["catch"](function (e) { toast(e.message); });
        });
        tg.style.background = sk.on ? GREEN : "#dadce0";
        tg.firstChild.style.left = sk.on ? "25px" : "3px";
        row.appendChild(tg);
        var rm = B("", "×", function () {
          api("POST", "/skills/remove", { agentId: ed.id, file: sk.file }).then(function () {
            toast("Removed " + sk.file);
            refresh().then(reloadEditSkills);
          })["catch"](function (e) { toast(e.message); });
        });
        css(rm, { border: "2px solid #F9C1C1", borderRadius: "10px", background: "#ffffff", color: RED, fontSize: "20px", fontWeight: "700", cursor: "pointer", width: "38px", height: "38px", flex: "none", lineHeight: "1", padding: "0" });
        row.appendChild(rm);
        list.appendChild(row);
      });
      d.appendChild(list);
    } else {
      var blank = E("div", null, "No skills yet — add one below, or drop a .md file in <span class='mono' style='font-size:12.5px'>workspace/skills/</span>.");
      css(blank, { fontSize: "14.5px", color: "#9aa0a6", background: "#ffffff", border: "2px dashed #e8eaed", borderRadius: "16px", padding: "16px 18px", textAlign: "center" });
      d.appendChild(blank);
    }
    var addSkill = B("linkbtn", "+ New skill", function () { openSkillEdit(ed.id, null); });
    css(addSkill, { alignSelf: "flex-start", padding: "0", marginTop: "12px" });
    d.appendChild(addSkill);

    // Channels — this agent's own faces on the outside world. Bind a
    // bot/number to it and talking to that bot IS talking to this agent.
    var ebCh = E("div", "eyebrow", "Channels");
    css(ebCh, { marginTop: "24px" });
    d.appendChild(ebCh);
    d.appendChild(css(E("div", null, "Give " + esc(ed.id) + " its own bot or number — message it there like a person, no @mention needed. Works with zero contacts: your own assistant, on your own machine."), { fontSize: "14px", color: "#5f6368", lineHeight: "1.5", marginBottom: "12px" }));
    var mineCh = bindings().filter(function (b) { return b.agentId === ed.id; });
    if (mineCh.length) {
      var chList = css(E("div", "stack-sm"), { marginBottom: "12px" });
      mineCh.forEach(function (b) {
        var chn = CHANNELS.filter(function (x) { return x.id === b.kind; })[0] || { name: b.kind, glyph: "?", bg: BLUE_BG, fg: BLUE };
        var row = E("div", "rowcard");
        row.innerHTML =
          "<div class='glyph' style='width:40px;height:40px;border-radius:12px;background:" + chn.bg + ";color:" + chn.fg + ";font-size:13px'>" + chn.glyph + "</div>" +
          "<div style='flex:1;min-width:0'><div style='font-size:15px;font-weight:700'>" + esc(chn.name) + "</div></div>" +
          "<div class='pill' style='color:" + (b.running ? GREEN_D : AMBER) + ";background:" + (b.running ? GREEN_BG : AMBER_BG) + "'>" + (b.running ? "On" : "Not running") + "</div>";
        var open = B("", "Open", function () { S.channelId = b.kind; S.chAgent = ed.id; go("channel"); });
        css(open, { border: "2px solid #dadce0", borderRadius: "12px", background: "#ffffff", color: BLUE, fontSize: "13.5px", fontWeight: "700", cursor: "pointer", padding: "8px 14px", flex: "none" });
        row.appendChild(open);
        chList.appendChild(row);
      });
      d.appendChild(chList);
    }
    var connectRow = E("div", "chips");
    CHANNELS.filter(function (chn) { return chn.ready && !mineCh.some(function (b) { return b.kind === chn.id; }); }).forEach(function (chn) {
      connectRow.appendChild(B("sug", "+ " + esc(chn.name), function () {
        S.channelId = chn.id;
        S.chAgent = ed.id;
        go("channel");
      }));
    });
    d.appendChild(connectRow);

    var save = B("btn btn-blue", "Save changes", function () {
      if (!(ed.workspace || "").trim()) { toast("Every agent needs a workspace folder"); return; }
      save.disabled = true;
      api("POST", "/agents", {
        id: ed.id,
        provider: ed.provider,
        workspace: ed.workspace.trim(),
        systemPrompt: (ed.purpose || "").trim() || undefined,
        disabledSkills: ed.skills.filter(function (s) { return !s.on; }).map(function (s) { return s.file; })
      }).then(function () {
        toast("Saved — applies to the next ask");
        refresh().then(function () { back(); });
      })["catch"](function (e) { save.disabled = false; toast(e.message); });
    });
    css(save, { marginTop: "28px" });
    d.appendChild(save);
    return d;
  };

  // ============ NEW AGENT ============
  SCREENS.agentNew = function () {
    var d = screenRoot("agentNew");
    var st = S.agentNew;

    var head = E("div", "hdr");
    head.appendChild(B("btn-back", "←", back));
    var prog = E("div", "progress", "<div></div>");
    prog.firstChild.style.width = { name: "25%", folder: "50%", purpose: "75%", done: "100%" }[st.step] || "25%";
    head.appendChild(prog);
    d.appendChild(head);

    if (st.step === "name") {
      d.appendChild(E("div", "title2", "Name your agent"));
      d.appendChild(E("div", "sub2", "Short and memorable — people will @mention it."));
      var input = E("input", "input");
      input.placeholder = "e.g. bookkeeper";
      input.value = st.name;
      input.oninput = function () { st.name = input.value; };
      d.appendChild(input);
      var next = B("btn btn-blue", "Continue", function () {
        if (!(st.name || "").trim()) { toast("Give it a name first"); return; }
        st.name = st.name.trim();
        st.step = "folder"; render();
      });
      css(next, { marginTop: "28px" });
      input.onkeydown = function (e) { if (e.key === "Enter") next.click(); };
      d.appendChild(next);
      return d;
    }

    if (st.step === "folder") {
      d.appendChild(E("div", "title2", "Which folder does it work in?"));
      d.appendChild(E("div", "sub2", "Its whole world — it can't see outside this folder."));
      var input2 = E("input", "input mono");
      input2.placeholder = "/path/to/its/folder";
      input2.value = st.folder;
      input2.oninput = function () { st.folder = input2.value; };
      d.appendChild(input2);
      var sugs = css(E("div", "chips"), { marginTop: "14px" });
      (S.quickPicks || []).slice(0, 6).forEach(function (q) {
        sugs.appendChild(B("sug", esc(q.label), function () { st.folder = q.path; input2.value = q.path; }));
      });
      d.appendChild(sugs);
      var next2 = B("btn btn-blue", "Continue", function () {
        if (!(st.folder || "").trim()) { toast("Every agent needs a folder"); return; }
        st.folder = st.folder.trim();
        st.step = "purpose"; render();
      });
      css(next2, { marginTop: "28px" });
      input2.onkeydown = function (e) { if (e.key === "Enter") next2.click(); };
      d.appendChild(next2);
      return d;
    }

    if (st.step === "purpose") {
      d.appendChild(E("div", "title2", "What should it help with?"));
      d.appendChild(E("div", "sub2", "Plain language — this becomes its personality."));
      var input3 = E("input", "input");
      input3.placeholder = "e.g. answer questions about the Acme project";
      input3.value = st.purpose;
      input3.oninput = function () { st.purpose = input3.value; };
      d.appendChild(input3);
      var create = B("btn btn-green", "Create agent", function () {
        create.disabled = true;
        api("POST", "/agents", {
          id: st.name,
          provider: "claude-code",
          workspace: st.folder,
          systemPrompt: (st.purpose || "").trim() || undefined
        }).then(function () {
          st.step = "done";
          refresh();
          render();
        })["catch"](function (e) { create.disabled = false; toast(e.message); });
      });
      css(create, { marginTop: "28px" });
      input3.onkeydown = function (e) { if (e.key === "Enter") create.click(); };
      d.appendChild(create);
      return d;
    }

    var doneBox = css(E("div"), { display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: "64px" });
    doneBox.appendChild(checkCircle());
    doneBox.appendChild(css(E("div", null, esc(st.name) + " is ready!"), { fontSize: "28px", fontWeight: "800", letterSpacing: "-0.5px", margin: "28px 0 8px" }));
    doneBox.appendChild(css(E("div", null, "It lives in its folder and waits. Share it with a contact and it starts answering."), { fontSize: "16.5px", color: "#5f6368", lineHeight: "1.5", maxWidth: "360px" }));
    var doneBtn = B("btn btn-blue", "Done", function () { S.screen = "agents"; S.stack = ["home"]; render(); });
    css(doneBtn, { marginTop: "36px" });
    doneBox.appendChild(doneBtn);
    d.appendChild(doneBox);
    return d;
  };

  // ============ AI RUNTIMES ============
  var RUNTIMES = [
    { key: "claude", name: "Claude Code", glyph: "CC", bg: BLUE_BG, fg: BLUE, desc: "Anthropic's CLI — the default runtime", cmd: "npm i -g @anthropic-ai/claude-code", url: "https://docs.anthropic.com/en/docs/claude-code/overview" },
    { key: "gemini", name: "Gemini CLI", glyph: "GM", bg: GREEN_BG, fg: GREEN_D, desc: "Google's open-source assistant CLI", cmd: "npm i -g @google/gemini-cli", url: "https://github.com/google-gemini/gemini-cli" },
    { key: "codex", name: "Codex CLI", glyph: "CX", bg: AMBER_BG, fg: AMBER, desc: "OpenAI's assistant CLI", cmd: "npm i -g @openai/codex", url: "https://github.com/openai/codex" }
  ];
  SCREENS.runtimes = function () {
    var d = screenRoot("runtimes");
    d.appendChild(hdr());
    d.appendChild(E("div", "title", "AI runtimes"));
    d.appendChild(E("div", "sub2", "agentina drives whichever assistant CLI you already use. Install one, then pick it as an agent's runtime — the agent stays jailed to its folder either way."));
    var stack = E("div", "stack");
    RUNTIMES.forEach(function (rt) {
      var probe = runtimeProbe(rt.key);
      var card = css(E("div"), { background: "#ffffff", border: "2px solid #e8eaed", borderRadius: "20px", padding: "20px" });
      var top = css(E("div"), { display: "flex", alignItems: "center", gap: "14px", marginBottom: "12px" });
      top.innerHTML =
        "<div class='glyph' style='width:48px;height:48px;background:" + rt.bg + ";color:" + rt.fg + ";font-size:15px'>" + rt.glyph + "</div>" +
        "<div style='flex:1'><div style='font-size:17px;font-weight:700'>" + rt.name + "</div>" +
        "<div style='font-size:13.5px;color:#5f6368'>" + rt.desc + (probe.version ? " · " + esc(probe.version) : "") + "</div></div>" +
        (probe.found ? "<div class='pill' style='color:" + GREEN_D + ";background:" + GREEN_BG + "'>installed</div>" : "");
      card.appendChild(top);
      var row = css(E("div"), { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" });
      var code = E("code", "code", esc(rt.cmd));
      css(code, { flex: "1", minWidth: "200px" });
      row.appendChild(code);
      var cp = B("", "Copy", function () { copyText(rt.cmd, "Copied — paste it in a terminal"); });
      css(cp, { border: "2px solid #dadce0", borderRadius: "12px", background: "#ffffff", color: BLUE, fontSize: "13.5px", fontWeight: "700", cursor: "pointer", padding: "8px 14px" });
      row.appendChild(cp);
      var a = E("a", null, "Setup guide →");
      a.href = rt.url; a.target = "_blank";
      css(a, { fontSize: "13.5px", padding: "8px 4px" });
      row.appendChild(a);
      card.appendChild(row);
      stack.appendChild(card);
    });
    d.appendChild(stack);
    var foot = css(E("div", "hint", "After installing, tap the button below — agentina re-checks your machine. API keys stay in your shell environment, never in agentina's files."), { marginTop: "16px" });
    d.appendChild(foot);
    var re = B("btn btn-white", "I installed one — check again", recheckEnv);
    css(re, { marginTop: "16px" });
    d.appendChild(re);
    return d;
  };

  // ============ ACTIVITY ============
  function humanizeAudit(e) {
    var names = partyNames();
    var who = e.partyId && e.partyId !== "local" ? (names[e.partyId] || "someone you removed") : null;
    var agent = e.agentId || "agent";
    var denied = e.decision === "denied";
    var detail = e.detail || "";
    var kind = e.kind;
    if (kind === "pair") {
      if (denied) return "Blocked: an invalid or expired invite link";
      if (detail.indexOf("joined") === 0) return "You connected with " + (who || "them") + " from their invite";
      return (who || "Someone") + " joined from your invite link";
    }
    if (kind === "ping") return who ? who + " checked the connection — it answered" : "Connection test";
    if (kind === "task") {
      if (denied) {
        if (e.reason === "scope-denied") return "Blocked: " + (who || "a request") + " tried to go outside what you shared";
        if (e.reason === "no-grant" || e.reason === "agent-not-granted") return "Blocked: " + (who || "someone") + " tried to use " + agent + " — nothing is shared with them";
        if (e.reason === "unknown-agent") return "Blocked: a request for an agent that doesn't exist";
        return "Blocked: " + (who || "a request") + " — " + (detail || e.reason || "denied");
      }
      if (who) return who + " asked your " + agent + (detail ? ": “" + detail + "”" : "");
      return "Your " + agent + " was used here" + (detail ? " — " + detail : "");
    }
    if (kind === "grant-create") {
      if (e.reason === "proposed") return (who || "Someone") + " asked for access — approve it from your side or ignore it";
      return "You shared with " + (who || "a contact") + (detail ? " — " + detail : "");
    }
    if (kind === "grant-revoke") return "You stopped sharing with " + (who || "a contact");
    if (kind === "session-open") return "You shared something temporary with " + (who || "a contact") + " — it self-destructs";
    if (kind === "session-close") return "A temporary share ended" + (detail ? " (" + detail + ")" : "");
    if (kind === "auth-denied") return "Blocked: a request that isn't from one of your people";
    return kind + (detail ? " — " + detail : "");
  }
  SCREENS.activity = function () {
    var d = screenRoot("activity");
    d.appendChild(hdr());
    d.appendChild(E("div", "title", "Activity"));
    d.appendChild(E("div", "sub2", "Everything that happened — both sides keep this log, including denials."));
    var entries = ((S.status && S.status.audit) || []).slice().reverse();
    if (!entries.length) {
      d.appendChild(css(E("div", "hint", "Nothing yet — the first connection, share, or ask lands here."), { textAlign: "center", marginTop: "24px" }));
      return d;
    }
    var list = E("div", "stack-sm");
    entries.forEach(function (e) {
      var denied = e.decision === "denied";
      var row = E("div");
      css(row, { display: "flex", alignItems: "center", gap: "14px", background: denied ? RED_BG : "#ffffff", border: "2px solid " + (denied ? "#F9C1C1" : "#e8eaed"), borderRadius: "16px", padding: "14px 16px" });
      var icon = denied
        ? "<svg width='16' height='16' viewBox='0 0 24 24' fill='none'><path d='M6 6l12 12M18 6L6 18' stroke='#ffffff' stroke-width='3' stroke-linecap='round'></path></svg>"
        : "<svg width='16' height='16' viewBox='0 0 24 24' fill='none'><path d='M4 12.5l5 5L20 6.5' stroke='#ffffff' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'></path></svg>";
      row.innerHTML =
        "<div style='width:36px;height:36px;border-radius:50%;background:" + (denied ? RED : GREEN) + ";display:flex;align-items:center;justify-content:center;flex:none'>" + icon + "</div>" +
        "<div style='flex:1;min-width:0'><div style='font-size:15.5px;font-weight:600;line-height:1.4'>" + esc(humanizeAudit(e)) + "</div>" +
        "<div style='font-size:13px;color:#9aa0a6;margin-top:2px'>" + esc(e.ts ? fmtTime(e.ts) : "") + "</div></div>";
      list.appendChild(row);
    });
    d.appendChild(list);
    return d;
  };

  // ============ ADVANCED ============
  var CHANNELS = [
    { id: "telegram", name: "Telegram", glyph: "TG", bg: BLUE_BG, fg: BLUE, ready: true,
      tagline: "DM the bot, or @mention an agent in a group",
      steps: [
        { n: "1", title: "Create a bot", body: "Message @BotFather on Telegram and send /newbot. Pick any name — this bot is yours alone." },
        { n: "2", title: "Copy the token it replies with", body: "You'll paste it in the form below — it stays on this machine." },
        { n: "3", title: "Save below — it starts right away", body: "No restart, no public address needed. Then DM the bot, or add it to a group and write @files read brief.txt. Mentions can cross the trust boundary — the other side's rules still decide." }
      ] },
    { id: "gitlab", name: "GitLab", glyph: "GL", bg: AMBER_BG, fg: AMBER, ready: true, hook: "/channels/gitlab/webhook",
      tagline: "Answers @mentions in issue and MR comments",
      steps: [
        { n: "1", title: "Create a bot user", body: "In your GitLab, add a user like agentina-bot and give it access to the project." },
        { n: "2", title: "Create its token", body: "Signed in as the bot: Settings → Access tokens, scope “api”. Copy the token — you'll paste it below." },
        { n: "3", title: "Add a webhook", body: "Project → Settings → Webhooks. Tick “Comments (note events)” and point it at your webhook address — it's shown below with a copy button." },
        { n: "4", title: "Give the webhook a secret", body: "Invent a long random phrase, put it in the webhook's “Secret token” field, and paste the same phrase below." },
        { n: "5", title: "Mention it", body: "Write @assistant summarize this MR in any issue or MR comment — the bot replies right in the thread." }
      ] },
    { id: "whatsapp", name: "WhatsApp", glyph: "WA", bg: GREEN_BG, fg: GREEN_D, ready: true, hook: "/channels/whatsapp/webhook",
      tagline: "Message an agent like any contact",
      steps: [
        { n: "1", title: "Get a Cloud API number", body: "In Meta's WhatsApp Business Cloud API (developers.facebook.com), create an app, add the WhatsApp product, and note the phone number ID it gives you." },
        { n: "2", title: "Copy the access token", body: "Generate a permanent access token in the app — you'll paste it below." },
        { n: "3", title: "Invent a verify word", body: "Any word. Type it in the form below, and give Meta the same word in the next step." },
        { n: "4", title: "Point the webhook here", body: "In the app's WhatsApp → Configuration: callback URL = your webhook address (shown below, with a copy button), verify token = your word, and subscribe to the “messages” field." },
        { n: "5", title: "Save below and message it", body: "Text the number like a contact: @assistant status of the books?" }
      ] },
    { id: "teams", name: "Microsoft Teams", glyph: "MT", bg: BLUE_BG, fg: BLUE, ready: false,
      tagline: "@mention an agent in a channel or chat",
      steps: [
        { n: "1", title: "Register a bot", body: "In Azure Bot Service, create a bot registration and note its App ID and secret." },
        { n: "2", title: "Point the messaging endpoint here", body: "Set the bot's endpoint to your node's /channels/teams/messages address." },
        { n: "3", title: "Add it to a team", body: "Sideload the app package, then @assistant summarize this thread in any channel." }
      ] },
    { id: "discord", name: "Discord", glyph: "DC", bg: BLUE_BG, fg: BLUE, ready: true,
      tagline: "@mention an agent in any server it's invited to",
      steps: [
        { n: "1", title: "Create an application", body: "discord.com/developers → New Application → Bot. Copy the bot token — you'll paste it below." },
        { n: "2", title: "Allow it to read messages", body: "Still under Bot: turn on the “Message Content Intent” toggle — without it Discord hides message text from the bot." },
        { n: "3", title: "Invite it to your server", body: "OAuth2 → URL Generator: scope “bot”, permissions “View Channels” and “Send Messages”. Open the generated link and pick your server." },
        { n: "4", title: "Save below — it starts right away", body: "No public address needed — the node connects out to Discord (needs Node 22+). DM the bot, or write @files read brief.txt in a channel; replies land in the same place." }
      ] },
    { id: "github", name: "GitHub", glyph: "GH", bg: "#f1f3f4", fg: "#202124", ready: true, hook: "/channels/github/webhook",
      tagline: "Answers @mentions in issues and pull requests",
      steps: [
        { n: "1", title: "Create a fine-grained token", body: "GitHub → Settings → Developer settings → Fine-grained tokens. Scope it to the one repo, with Issues and Pull requests read/write. Copy it — you'll paste it below." },
        { n: "2", title: "Add a webhook", body: "Repo → Settings → Webhooks → Add webhook. Content type application/json, event “Issue comments”, pointed at your webhook address — shown below with a copy button." },
        { n: "3", title: "Give the webhook a secret", body: "Invent a long random phrase, put it in the webhook's “Secret” field, and paste the same phrase below." },
        { n: "4", title: "Save below and mention it", body: "Write @assistant explain this failure in any issue or PR comment — the reply lands in the thread." }
      ] },
    { id: "slack", name: "Slack", glyph: "SL", bg: RED_BG, fg: RED, ready: true, hook: "/channels/slack/events",
      tagline: "@mention an agent in any channel it's in",
      steps: [
        { n: "1", title: "Create a Slack app", body: "api.slack.com/apps → Create New App. Under OAuth & Permissions add the bot scopes app_mentions:read and chat:write." },
        { n: "2", title: "Install it and copy the bot token", body: "Install the app to your workspace; the bot token starts with xoxb- — you'll paste it below." },
        { n: "3", title: "Copy the signing secret too", body: "From the app's Basic Information page — it lets the node reject forged events. Paste it below." },
        { n: "4", title: "Save below FIRST, then enable events", body: "Slack checks the address the moment you enter it. Turn on Event Subscriptions, subscribe to the app_mention bot event, and use your events address — shown below with a copy button." },
        { n: "5", title: "Mention it", body: "Invite the bot to a channel, then @assistant summarize this thread — the reply lands in the same thread." }
      ] }
  ];
  // One "Turn it on" form per channel. Secret fields take the pasted
  // VALUE (stored on this machine, owner-only, via POST /secrets) —
  // nobody has to open a terminal. The config only ever names the env
  // var, and a real environment variable still overrides the file.
  var CHANNEL_FORMS = {
    telegram: {
      note: "Starts the moment you save — Telegram needs no public address.",
      fields: [
        { key: "tokenEnv", secret: "TG_BOT_TOKEN", ph: "bot token from @BotFather", flex: "1", required: true }
      ]
    },
    gitlab: {
      note: "Starts when you save. The webhook address above must be reachable from your GitLab.",
      fields: [
        { key: "host", ph: "https://gitlab.example.com", flex: "2", required: true },
        { key: "tokenEnv", secret: "GL_BOT_TOKEN", ph: "bot token (glpat-…)", flex: "1", required: true },
        { key: "webhookSecretEnv", secret: "GL_HOOK_SECRET", ph: "webhook secret (optional)", flex: "1" }
      ]
    },
    whatsapp: {
      note: "Starts when you save. Meta calls the webhook address above — it must be public HTTPS.",
      fields: [
        { key: "tokenEnv", secret: "WA_TOKEN", ph: "access token from Meta", flex: "1", required: true },
        { key: "phoneNumberId", ph: "phone number ID", flex: "1", required: true },
        { key: "verifyTokenEnv", secret: "WA_VERIFY", ph: "verify word (invent one)", flex: "1" }
      ]
    },
    github: {
      note: "Starts when you save. GitHub calls the webhook address above — it must be public HTTPS.",
      fields: [
        { key: "tokenEnv", secret: "GH_BOT_TOKEN", ph: "fine-grained token (github_pat_…)", flex: "1", required: true },
        { key: "webhookSecretEnv", secret: "GH_HOOK_SECRET", ph: "webhook secret (optional)", flex: "1" }
      ]
    },
    discord: {
      note: "Starts when you save — the node dials out to Discord, no public address needed (Node 22+).",
      fields: [
        { key: "tokenEnv", secret: "DISCORD_BOT_TOKEN", ph: "bot token", flex: "1", required: true }
      ]
    },
    slack: {
      note: "Save first, then give Slack the events address above — it checks it immediately.",
      fields: [
        { key: "tokenEnv", secret: "SLACK_BOT_TOKEN", ph: "bot token (xoxb-…)", flex: "1", required: true },
        { key: "signingSecretEnv", secret: "SLACK_SIGNING_SECRET", ph: "signing secret", flex: "1" }
      ]
    }
  };
  function channelForm(chn, form) {
    var box = css(E("div"), { background: "#ffffff", border: "2px solid #e8eaed", borderRadius: "20px", padding: "20px", marginTop: "20px" });
    box.appendChild(css(E("div", null, "Turn it on"), { fontSize: "16px", fontWeight: "700", marginBottom: "10px" }));

    // Who answers this connection? A bound agent makes the channel that
    // agent's own face — no @mention needed. "Everyone" = shared bot.
    var agents = myAgents();
    if (agents.length) {
      box.appendChild(css(E("div", null, "Who answers here?"), { fontSize: "13px", fontWeight: "700", color: "#9aa0a6", marginBottom: "8px" }));
      var whoRow = css(E("div", "chips"), { marginBottom: "14px" });
      var mkWho = function (label, agentId) {
        var sel = (S.chAgent || null) === (agentId || null);
        whoRow.appendChild(B("chip-sm" + (sel ? " sel" : ""), esc(label), function () {
          S.chAgent = agentId;
          render();
        }));
      };
      mkWho("All agents — @mention picks", null);
      agents.forEach(function (a) { mkWho(a.id, a.id); });
      box.appendChild(whoRow);
      var whoHint = S.chAgent
        ? "This connection speaks for " + S.chAgent + " — every message goes straight to it, like texting a person. @mentions of other agents still work."
        : "A shared connection — @mention the agent you want; plain messages go to your first agent.";
      box.appendChild(css(E("div", null, esc(whoHint)), { fontSize: "13px", color: "#5f6368", lineHeight: "1.5", marginBottom: "14px" }));
    }

    var agentId = S.chAgent || null;
    var binding = bindingFor(chn.id, agentId);
    var row = css(E("div"), { display: "flex", gap: "10px", flexWrap: "wrap" });
    var inputs = {};
    form.fields.forEach(function (f) {
      var formKey = chn.id + "." + (agentId || "shared") + "." + f.key;
      var inp = E("input", "input");
      if (f.secret) inp.type = "password";
      css(inp, { flex: f.flex, height: "50px", borderRadius: "14px", fontSize: "14.5px", minWidth: "140px" });
      inp.placeholder = f.secret && binding ? "saved — paste to replace" : f.ph;
      inp.value = S.form[formKey] != null ? S.form[formKey] : (f.secret ? "" : ((binding && binding[f.key]) || ""));
      inp.oninput = function () { S.form[formKey] = inp.value; };
      inputs[f.key] = { el: inp, f: f, formKey: formKey };
      row.appendChild(inp);
    });
    var save = B("", binding ? "Update" : "Save", function () {
      var body = { kind: chn.id };
      if (binding) body.id = binding.id;
      if (agentId) body.agentId = agentId;
      var secretPosts = [];
      for (var i = 0; i < form.fields.length; i++) {
        var f = form.fields[i];
        var v = inputs[f.key].el.value.trim();
        if (f.secret) {
          var envName = secretName(f.secret, agentId);
          if (v) secretPosts.push({ name: envName, value: v });
          else if (f.required && !binding) { toast("Paste the " + f.ph + " first"); return; }
          if (v || (binding && binding[f.key]) || f.required) body[f.key] = envName;
        } else {
          if (f.required && !v && !(binding && binding[f.key])) { toast(chn.name + " needs the " + f.ph.replace("https://", "") + " field"); return; }
          if (v) body[f.key] = v;
        }
      }
      save.disabled = true;
      var storeAll = secretPosts.reduce(function (p, s) {
        return p.then(function () { return api("POST", "/secrets", s); });
      }, Promise.resolve());
      storeAll.then(function () {
        return api("POST", "/channels", body);
      }).then(function (r) {
        save.disabled = false;
        form.fields.forEach(function (f) { delete S.form[inputs[f.key].formKey]; });
        var note = String(r.note || "Saved");
        toast(note.charAt(0).toUpperCase() + note.slice(1));
        refresh();
      })["catch"](function (e) { save.disabled = false; toast(e.message); });
    });
    css(save, { width: "92px", height: "50px", border: "none", borderRadius: "14px", background: BLUE, color: "#ffffff", fontSize: "15px", fontWeight: "700", cursor: "pointer", boxShadow: "0 3px 0 " + BLUE_D, flex: "none" });
    row.appendChild(save);
    box.appendChild(row);
    box.appendChild(css(E("div", "hint", form.note + " What you paste stays on this machine, in an owner-only file — it never leaves."), { marginTop: "10px" }));
    return box;
  }
  // Every existing connection of this kind — who answers, is it up,
  // its own webhook address, and one tap to disconnect.
  function connectionList(chn) {
    var mine = bindings().filter(function (b) { return b.kind === chn.id; });
    if (!mine.length) return null;
    var wrap = css(E("div"), { marginTop: "20px" });
    wrap.appendChild(css(E("div", null, "Your " + chn.name + " connections"), { fontSize: "16px", fontWeight: "700", marginBottom: "10px" }));
    var list = E("div", "stack-sm");
    mine.forEach(function (b) {
      var row = E("div", "rowcard");
      var mid = css(E("div"), { flex: "1", minWidth: "0" });
      mid.appendChild(css(E("div", null,
        (b.agentId ? "Answers as <b>" + esc(b.agentId) + "</b>" : "Shared — @mentions decide")
      ), { fontSize: "15px", fontWeight: "600" }));
      if (chn.hook) {
        var full = webhookBase() + "/channels/" + b.id + "/webhook";
        mid.appendChild(css(E("div", "mono", esc(full)), { fontSize: "11.5px", color: "#9aa0a6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: "2px" }));
      }
      row.appendChild(mid);
      var pill = E("div", "pill", b.running ? "On" : "Not running");
      css(pill, { color: b.running ? GREEN_D : AMBER, background: b.running ? GREEN_BG : AMBER_BG });
      row.appendChild(pill);
      if (chn.hook) row.appendChild(copyBtn(webhookBase() + "/channels/" + b.id + "/webhook", "This connection's address copied"));
      var rm = B("", "Disconnect", function () {
        api("POST", "/channels/remove", { id: b.id }).then(function () {
          toast("Disconnected — it stops answering immediately");
          refresh();
        })["catch"](function (e) { toast(e.message); });
      });
      css(rm, { border: "2px solid #F9C1C1", borderRadius: "12px", background: "#ffffff", color: RED, fontSize: "13.5px", fontWeight: "700", cursor: "pointer", padding: "8px 12px", flex: "none" });
      row.appendChild(rm);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function channelPill(chn) {
    if (!chn.ready) return { text: "Soon", fg: AMBER, bg: AMBER_BG };
    if (channelRunning(chn.id)) return { text: "On", fg: GREEN_D, bg: GREEN_BG };
    if (channelConfigured(chn.id)) return { text: "Not running", fg: AMBER, bg: AMBER_BG };
    return { text: "Set up", fg: BLUE, bg: BLUE_BG };
  }
  // The address an outside service must call. publicUrl (the HTTPS
  // front) wins; the node's own address is the fallback.
  function webhookBase() {
    var s = S.status || {};
    return String(s.publicUrl || s.url || "").replace(/[/]+$/, "");
  }
  function copyBtn(text, msg) {
    var b = B("", "Copy", function () { copyText(text, msg || "Copied"); });
    css(b, { border: "2px solid #dadce0", borderRadius: "12px", background: "#ffffff", color: BLUE, fontSize: "13.5px", fontWeight: "700", cursor: "pointer", padding: "8px 14px", flex: "none" });
    return b;
  }
  function webhookBox(chn) {
    var base = webhookBase();
    // The selected connection's own address when it exists; the fresh
    // one gets its address the moment the form below is saved.
    var binding = bindingFor(chn.id, S.chAgent || null);
    var full = base + (binding ? "/channels/" + binding.id + "/webhook" : chn.hook);
    var isPublicHttps = base.indexOf("https://") === 0;
    var box = css(E("div"), { background: "#ffffff", border: "2px solid " + (isPublicHttps ? "#A9CBFF" : "#FFE08A"), borderRadius: "20px", padding: "20px", marginTop: "20px" });
    box.appendChild(css(E("div", null, "Your webhook address"), { fontSize: "16px", fontWeight: "700", marginBottom: "10px" }));
    var row = css(E("div"), { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" });
    var code = E("code", "code", esc(full));
    css(code, { flex: "1", minWidth: "200px" });
    row.appendChild(code);
    row.appendChild(copyBtn(full, "Copied — paste it in " + chn.name + "'s settings"));
    box.appendChild(row);
    if (!isPublicHttps) {
      box.appendChild(css(E("div", null,
        chn.name + " can only call an address that starts with https:// and is reachable from the internet. If you have one (a domain, a tunnel, or a reverse proxy in front of this machine), enter it here — the address above updates instantly:"
      ), { fontSize: "13.5px", color: AMBER, fontWeight: "600", lineHeight: "1.5", margin: "12px 0 8px" }));
      var setRow = css(E("div"), { display: "flex", gap: "8px" });
      var inp = E("input", "input mono");
      css(inp, { flex: "1", height: "46px", borderRadius: "12px", fontSize: "13px", minWidth: "0" });
      inp.placeholder = "https://agentina.example.com";
      inp.value = S.form.publicUrl || "";
      inp.oninput = function () { S.form.publicUrl = inp.value; };
      var saveB = B("", "Set", function () {
        var v = inp.value.trim();
        if (v.indexOf("https://") !== 0) { toast("The public address must start with https://"); return; }
        api("POST", "/account", { publicUrl: v }).then(function () {
          delete S.form.publicUrl;
          toast("Saved — your webhook address is ready to copy");
          refresh();
        })["catch"](function (e) { toast(e.message); });
      });
      css(saveB, { width: "72px", height: "46px", border: "none", borderRadius: "12px", background: BLUE, color: "#ffffff", fontSize: "14px", fontWeight: "700", cursor: "pointer", boxShadow: "0 3px 0 " + BLUE_D, flex: "none" });
      setRow.appendChild(inp); setRow.appendChild(saveB);
      box.appendChild(setRow);
      box.appendChild(css(E("div", "hint", "You can also serve HTTPS from the node itself with your own certificate — see Advanced → “Reachability”."), { marginTop: "8px" }));
    }
    return box;
  }
  SCREENS.advanced = function () {
    var d = screenRoot("advanced");
    d.appendChild(hdr());
    d.appendChild(css(E("div", "title", "Advanced"), { marginBottom: "24px" }));

    d.appendChild(E("div", "eyebrow", "This node"));
    var s = S.status || {};
    var me = s.party || {};
    var node = E("div", "mono",
      esc((s.url || "") + " · " + (s.protocol || "") + (s.tls ? " · https" : "")) + "<br>" +
      "party " + esc(me.id || "") + " · " + esc(me.name || "") + "<br>" +
      "agents: " + esc(myAgents().map(function (a) { return a.id; }).join(", ") || "none"));
    css(node, { background: "#ffffff", border: "2px solid #e8eaed", borderRadius: "16px", padding: "16px 20px", fontSize: "13px", color: "#5f6368", lineHeight: "1.8", wordBreak: "break-all" });
    d.appendChild(node);

    // Everything you might need to paste somewhere else — one tap each.
    var copies = css(E("div"), { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" });
    var copyChip = function (label, value) {
      if (!value) return;
      var b = B("sug", esc(label), function () { copyText(value, label + " copied"); });
      copies.appendChild(b);
    };
    copyChip("Copy node address", s.url);
    copyChip("Copy public address", s.publicUrl);
    copyChip("Copy party id", me.id);
    copyChip("Copy invite page", s.url ? s.url + "/" : null);
    d.appendChild(copies);

    var ebR = E("div", "eyebrow", "Reachability — for webhook channels");
    css(ebR, { margin: "28px 0 12px" });
    d.appendChild(ebR);
    var reach = css(E("div"), { background: "#ffffff", border: "2px solid #e8eaed", borderRadius: "20px", padding: "20px" });
    reach.appendChild(css(E("div", null, "WhatsApp, GitHub, Slack, and GitLab call your node over public HTTPS. Give agentina that address (a domain, a tunnel, or a reverse proxy pointing at this machine) — every channel screen then shows the exact URL to copy."), { fontSize: "14px", color: "#5f6368", lineHeight: "1.55", marginBottom: "12px" }));
    var pubRow = css(E("div"), { display: "flex", gap: "8px" });
    var pubInp = E("input", "input mono");
    css(pubInp, { flex: "1", height: "48px", borderRadius: "12px", fontSize: "13px", minWidth: "0" });
    pubInp.placeholder = "https://agentina.example.com";
    pubInp.value = S.form.advPublicUrl != null ? S.form.advPublicUrl : (s.publicUrl || "");
    pubInp.oninput = function () { S.form.advPublicUrl = pubInp.value; };
    var pubSave = B("", "Save", function () {
      var v = pubInp.value.trim();
      if (v && v.indexOf("https://") !== 0) { toast("The public address must start with https://"); return; }
      api("POST", "/account", { publicUrl: v }).then(function () {
        delete S.form.advPublicUrl;
        toast(v ? "Saved — channel screens show the new address" : "Cleared");
        refresh();
      })["catch"](function (e) { toast(e.message); });
    });
    css(pubSave, { width: "72px", height: "48px", border: "none", borderRadius: "12px", background: BLUE, color: "#ffffff", fontSize: "14px", fontWeight: "700", cursor: "pointer", boxShadow: "0 3px 0 " + BLUE_D, flex: "none" });
    pubRow.appendChild(pubInp); pubRow.appendChild(pubSave);
    reach.appendChild(pubRow);

    reach.appendChild(css(E("div", null, "Have your own certificate? The node can serve HTTPS directly — it switches over the moment you save."), { fontSize: "14px", color: "#5f6368", lineHeight: "1.55", margin: "16px 0 8px" }));
    var tlsRow = css(E("div"), { display: "flex", gap: "8px", flexWrap: "wrap" });
    var certInp = E("input", "input mono");
    css(certInp, { flex: "1", height: "48px", borderRadius: "12px", fontSize: "13px", minWidth: "140px" });
    certInp.placeholder = "/path/to/fullchain.pem";
    certInp.value = S.form.tlsCert || "";
    certInp.oninput = function () { S.form.tlsCert = certInp.value; };
    var keyInp = E("input", "input mono");
    css(keyInp, { flex: "1", height: "48px", borderRadius: "12px", fontSize: "13px", minWidth: "140px" });
    keyInp.placeholder = "/path/to/privkey.pem";
    keyInp.value = S.form.tlsKey || "";
    keyInp.oninput = function () { S.form.tlsKey = keyInp.value; };
    var tlsSave = B("", s.tls ? "Update" : "Save", function () {
      api("POST", "/account", { tlsCertPath: certInp.value.trim(), tlsKeyPath: keyInp.value.trim() }).then(function (r) {
        toast(r.tls ? "Saved — the node is switching to HTTPS now" : "Certificates cleared — back to plain HTTP");
        setTimeout(refresh, 1500);
      })["catch"](function (e) { toast(e.message); });
    });
    css(tlsSave, { width: "80px", height: "48px", border: "none", borderRadius: "12px", background: BLUE, color: "#ffffff", fontSize: "14px", fontWeight: "700", cursor: "pointer", boxShadow: "0 3px 0 " + BLUE_D, flex: "none" });
    tlsRow.appendChild(certInp); tlsRow.appendChild(keyInp); tlsRow.appendChild(tlsSave);
    reach.appendChild(tlsRow);
    if (s.tls) reach.appendChild(css(E("div", "hint", "HTTPS is on — the node serves your certificate."), { marginTop: "8px" }));
    d.appendChild(reach);

    var eb2 = E("div", "eyebrow", "Channels — talk to agents from chat");
    css(eb2, { margin: "28px 0 12px" });
    d.appendChild(eb2);
    var rail = E("div", "rail");
    CHANNELS.forEach(function (chn) {
      var pill = channelPill(chn);
      var card = B("card", "", function () { S.channelId = chn.id; S.chAgent = null; go("channel"); });
      css(card, { flexDirection: "column", gap: "12px", width: "158px", flex: "none", padding: "18px", alignItems: "stretch", scrollSnapAlign: "start" });
      var mine = bindings().filter(function (b) { return b.kind === chn.id; });
      var who = mine.length
        ? "<div style='font-size:12px;font-weight:700;color:" + GREEN_D + "'>" +
          esc(mine.map(function (b) { return b.agentId || "shared"; }).join(" · ")) + "</div>"
        : "";
      card.innerHTML =
        "<div style='display:flex;align-items:center;justify-content:space-between'>" +
        "<div class='glyph' style='width:44px;height:44px;background:" + chn.bg + ";color:" + chn.fg + ";font-size:14px'>" + chn.glyph + "</div>" +
        "<div class='pill' style='font-size:11.5px;color:" + pill.fg + ";background:" + pill.bg + "'>" + pill.text + "</div></div>" +
        "<div style='font-size:16.5px;font-weight:700'>" + chn.name + "</div>" +
        who +
        "<div style='font-size:13px;color:#5f6368;line-height:1.4'>" + chn.tagline + "</div>";
      rail.appendChild(card);
    });
    d.appendChild(rail);

    var eb3 = E("div", "eyebrow", "AI runtimes");
    css(eb3, { margin: "28px 0 12px" });
    d.appendChild(eb3);
    var rt = B("rowcard", "", function () { go("runtimes"); });
    css(rt, { cursor: "pointer", width: "100%", textAlign: "left" });
    rt.innerHTML =
      "<div class='glyph' style='width:44px;height:44px;background:" + BLUE_BG + ";color:" + BLUE + ";font-size:14px'>AI</div>" +
      "<div style='flex:1'><div style='font-size:16.5px;font-weight:700'>Claude Code, Gemini CLI, Codex…</div>" +
      "<div style='font-size:13.5px;color:#5f6368'>Install guides and what's on this machine</div></div>" +
      "<div class='chev' style='font-size:20px'>›</div>";
    d.appendChild(rt);

    d.appendChild(css(E("div", "hint", "Tokens you paste stay on this machine, in an owner-only file next to agentina's own credentials. Environment variables with the same names always win — pros can keep using them."), { marginTop: "20px" }));
    return d;
  };

  // ============ CHANNEL DETAIL ============
  SCREENS.channel = function () {
    var d = screenRoot("channel");
    var chn = CHANNELS.filter(function (x) { return x.id === S.channelId; })[0] || CHANNELS[0];
    d.appendChild(hdr());

    var head = css(E("div"), { display: "flex", alignItems: "center", gap: "16px", margin: "8px 0 8px" });
    var pill = channelPill(chn);
    head.innerHTML =
      "<div class='glyph' style='width:60px;height:60px;border-radius:18px;background:" + chn.bg + ";color:" + chn.fg + ";font-size:18px'>" + chn.glyph + "</div>" +
      "<div><div style='display:flex;align-items:center;gap:10px'>" +
      "<div style='font-size:26px;font-weight:800;letter-spacing:-0.5px'>" + chn.name + "</div>" +
      (chn.ready
        ? (channelRunning(chn.id) ? "<div class='pill' style='color:" + GREEN_D + ";background:" + GREEN_BG + "'>on</div>"
          : channelConfigured(chn.id) ? "<div class='pill' style='color:" + AMBER + ";background:" + AMBER_BG + "'>restart to start</div>" : "")
        : "<div class='pill' style='color:" + AMBER + ";background:" + AMBER_BG + "'>coming soon</div>") +
      "</div><div style='font-size:15px;color:#5f6368;margin-top:2px'>" + chn.tagline + "</div></div>";
    void pill;
    d.appendChild(head);

    d.appendChild(css(E("div", null, "Mention an agent where you already chat and it answers — even across the trust boundary. The other side's rules still apply: a denial comes back as the reply, honestly, and lands in both activity logs."), { fontSize: "15.5px", color: "#5f6368", lineHeight: "1.55", margin: "12px 0 24px" }));

    var steps = E("div", "stack");
    chn.steps.forEach(function (st2) {
      var row = css(E("div"), { display: "flex", gap: "16px", background: "#ffffff", border: "2px solid #e8eaed", borderRadius: "20px", padding: "18px 20px" });
      row.innerHTML =
        "<div style='width:36px;height:36px;border-radius:50%;background:" + BLUE_BG + ";color:" + BLUE + ";display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;flex:none'>" + st2.n + "</div>" +
        "<div style='flex:1;min-width:0'><div style='font-size:16.5px;font-weight:700;margin-bottom:4px'>" + esc(st2.title) + "</div>" +
        "<div style='font-size:14.5px;color:#5f6368;line-height:1.55'>" + esc(st2.body) + "</div>" +
        (st2.code ? "<code class='code' style='display:block;margin-top:8px'>" + esc(st2.code) + "</code>" : "") + "</div>";
      steps.appendChild(row);
    });
    d.appendChild(steps);

    if (chn.hook) d.appendChild(webhookBox(chn));
    var form = CHANNEL_FORMS[chn.id];
    if (form) d.appendChild(channelForm(chn, form));
    var existing = connectionList(chn);
    if (existing) d.appendChild(existing);

    if (!chn.ready) {
      var soon = E("div", null, "This channel ships soon — every adapter shares the same 4-method contract, so setup will look exactly like the steps above.");
      css(soon, { background: AMBER_BG, border: "2px solid #FFE08A", borderRadius: "16px", padding: "16px 18px", marginTop: "20px", fontSize: "14.5px", color: AMBER, fontWeight: "600", lineHeight: "1.5" });
      d.appendChild(soon);
    }
    return d;
  };

  // ============ ACCOUNT ============
  function openAccount() {
    var me = (S.status && S.status.party) || {};
    var profile = (S.status && S.status.profile) || {};
    var host = String((S.status && S.status.url) || "");
    host = host.replace("http://", "").replace("https://", "");
    var colon = host.lastIndexOf(":");
    if (colon > 0) host = host.slice(0, colon);
    S.form.acctName = me.name || "";
    S.form.acctRole = profile.role || "";
    S.form.acctColor = profile.color || BLUE;
    S.form.acctBind = host === "127.0.0.1" ? "" : host;
    go("account");
  }
  SCREENS.account = function () {
    var d = screenRoot("account");
    var me = (S.status && S.status.party) || {};
    d.appendChild(hdr());
    d.appendChild(E("div", "title", "Your account"));
    d.appendChild(E("div", "sub2", "This is how you show up to the people you connect with — nothing here leaves your machine."));

    var avRow = css(E("div"), { display: "flex", alignItems: "center", gap: "18px", marginBottom: "28px" });
    var av = E("div", "avatar", esc(initialOf(S.form.acctName)));
    av.id = "acct-av";
    css(av, { width: "76px", height: "76px", background: S.form.acctColor, fontSize: "32px", fontWeight: "800" });
    avRow.appendChild(av);
    var colWrap = css(E("div"), { flex: "1" });
    colWrap.appendChild(E("div", "eyebrow", "Avatar color"));
    var swatches = css(E("div"), { display: "flex", gap: "10px" });
    AVATARS.forEach(function (hex) {
      var b = B("", "", function () {
        S.form.acctColor = hex;
        av.style.background = hex;
        Array.prototype.forEach.call(swatches.children, function (x) {
          x.style.borderColor = x.getAttribute("data-hex") === hex ? "#202124" : "#ffffff";
        });
      });
      b.setAttribute("data-hex", hex);
      css(b, { width: "36px", height: "36px", borderRadius: "50%", background: hex, cursor: "pointer", border: "3px solid " + (S.form.acctColor === hex ? "#202124" : "#ffffff"), padding: "0" });
      swatches.appendChild(b);
    });
    colWrap.appendChild(swatches);
    avRow.appendChild(colWrap);
    d.appendChild(avRow);

    d.appendChild(E("div", "eyebrow", "Display name"));
    var name = E("input", "input");
    css(name, { height: "54px", marginBottom: "22px" });
    name.placeholder = "Your name";
    name.value = S.form.acctName;
    name.oninput = function () {
      S.form.acctName = name.value;
      av.textContent = initialOf(name.value);
    };
    d.appendChild(name);

    d.appendChild(E("div", "eyebrow", "Role / title <span style='text-transform:none;font-weight:600;color:#c0c4c9'>— optional</span>"));
    var role = E("input", "input");
    css(role, { height: "54px", marginBottom: "22px" });
    role.placeholder = "e.g. Freelance designer";
    role.value = S.form.acctRole;
    role.oninput = function () { S.form.acctRole = role.value; };
    d.appendChild(role);

    d.appendChild(E("div", "eyebrow", "Network address"));
    var bind = E("input", "input mono");
    css(bind, { height: "54px" });
    var e = env();
    var tsIp = e && e.network && e.network.tailscale && e.network.tailscale.ip;
    bind.placeholder = tsIp || "100.84.12.7";
    bind.value = S.form.acctBind;
    bind.oninput = function () { S.form.acctBind = bind.value; };
    d.appendChild(bind);
    d.appendChild(css(E("div", "hint",
      "The address others reach you on — your Tailscale / WireGuard IP, or a WAN address. It applies the moment you save: agentina starts answering on it and new invites carry it. Party id <span class='mono' style='font-size:12.5px'>" + esc(me.id || "") + "</span> stays fixed."
    ), { margin: "8px 0 20px" }));

    var help = B("", "", function () { go("networkHelp"); });
    css(help, { display: "flex", alignItems: "center", gap: "12px", width: "100%", background: BLUE_BG, border: "2px solid #A9CBFF", borderRadius: "16px", padding: "14px 16px", cursor: "pointer", textAlign: "left", marginBottom: "28px" });
    help.innerHTML =
      "<div style='width:34px;height:34px;border-radius:50%;background:" + BLUE + ";color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;flex:none'>?</div>" +
      "<div style='flex:1;min-width:0'><div style='font-size:15px;font-weight:700;color:" + BLUE_D + "'>New to this? What's a network address?</div>" +
      "<div style='font-size:13px;color:#5f6368'>Plain-language guide — pick the free option and get connected</div></div>" +
      "<div style='color:#A9CBFF;font-size:20px;font-weight:700'>›</div>";
    d.appendChild(help);

    var save = B("btn btn-blue", "Save", function () {
      if (!(S.form.acctName || "").trim()) { toast("Give yourself a name first"); return; }
      save.disabled = true;
      api("POST", "/account", {
        name: S.form.acctName.trim(),
        role: (S.form.acctRole || "").trim(),
        color: S.form.acctColor,
        url: (S.form.acctBind || "").trim() || undefined
      }).then(function () {
        toast("Saved — this is how you show up now");
        refresh().then(back);
      })["catch"](function (e2) { save.disabled = false; toast(e2.message); });
    });
    d.appendChild(save);
    return d;
  };

  // ============ HELP & GUIDES ============
  // Straightforward, numbered, no jargon. Every guide ends where the
  // reader can act — a button into the actual screen.
  var GUIDE_ACTIONS = {
    invite: function () { startInvite(); },
    join: function () { go("join"); },
    home: function () { goHome(); },
    account: function () { openAccount(); },
    networkHelp: function () { go("networkHelp"); },
    agents: function () { go("agents"); },
    activity: function () { go("activity"); },
    advanced: function () { go("advanced"); },
    runtimes: function () { go("runtimes"); }
  };
  var GUIDES = [
    { id: "start", glyph: "1", bg: BLUE_BG, fg: BLUE, title: "Start here", tagline: "What agentina is, in four steps",
      steps: [
        { title: "Two people, two machines", body: "You and one other person each run agentina on your own computer. There is no company server in the middle — your machines talk directly." },
        { title: "Connecting shares nothing", body: "An invite link only introduces the two machines. Until you share something, the other person can do exactly nothing." },
        { title: "Share one thing at a time", body: "A folder, an agent, a server, a repository — you pick how much they can do and for how long. Your machine enforces it; one tap stops it." },
        { title: "Everything is on the record", body: "Every use and every denial lands in Activity — on both sides. No silent access, ever." }
      ],
      links: [{ label: "Invite someone →", action: "invite" }, { label: "See your activity →", action: "activity" }] },
    { id: "solo", glyph: "2", bg: GREEN_BG, fg: GREEN_D, title: "Use it just for yourself", tagline: "Your own agents in your own chat apps — no second person needed",
      steps: [
        { title: "Create an agent", body: "My agents → New agent: give it a folder and a purpose. That's a private AI worker on your own machine — nothing is shared with anyone." },
        { title: "Give it its own line", body: "In the agent's edit screen, tap + Telegram (or WhatsApp, Discord…), paste a bot token, Save. That bot now IS your agent — its own face on the channel." },
        { title: "Message it like a person", body: "Text it from your phone. It answers from its folder, using its skills — no @mention needed, it's a private line straight to that agent." },
        { title: "One line per agent, per channel", body: "Your bookkeeper can have its own Telegram bot while your project assistant has its own WhatsApp number — and a shared bot with @mentions can exist alongside them." }
      ],
      links: [{ label: "Open My agents →", action: "agents" }] },
    { id: "connect", glyph: "3", bg: GREEN_BG, fg: GREEN_D, title: "Connect with someone", tagline: "One invite link, one paste",
      steps: [
        { title: "One of you invites", body: "Tap “Invite someone”. You get a link that works once and expires in 15 minutes — safe to send over any chat." },
        { title: "The other one joins", body: "They open agentina on their machine, tap “I have an invite link”, and paste it. That's the whole pairing." },
        { title: "Different machines? Get reachable first", body: "Your computer needs an address the other machine can dial. Tailscale (free) is the easiest way — the network guide walks you through it." },
        { title: "Test it", body: "Open the contact and tap “test connection” — you should see an answer in milliseconds." }
      ],
      links: [{ label: "Invite someone →", action: "invite" }, { label: "I have an invite link →", action: "join" }, { label: "Get reachable — the network guide →", action: "networkHelp" }] },
    { id: "share", glyph: "4", bg: AMBER_BG, fg: AMBER, title: "Share something safely", tagline: "Exactly this, nothing else, stop anytime",
      steps: [
        { title: "Open the contact, tap “Share something”", body: "Pick what to share: a folder, one of your agents, a server, or a repository." },
        { title: "Pick how much they can do", body: "“Look only” means look only — your machine refuses writes, not their good manners." },
        { title: "Pick how long", body: "An hour, a day, a week — when time's up the share self-destructs. Or keep it until you stop it." },
        { title: "Stop it in one tap", body: "On the contact screen, every share has a Stop button. Their very next use is denied." }
      ],
      links: [{ label: "Go to your people →", action: "home" }] },
    { id: "ask", glyph: "5", bg: BLUE_BG, fg: BLUE, title: "Ask their agents", tagline: "Only what they shared — and they see every ask",
      steps: [
        { title: "The chips are what they shared", body: "On the Ask screen, each chip is one thing they shared with you. Pick one, then write your message." },
        { title: "Plain language works", body: "Try “read brief.txt”, “list”, or just describe what you need — their AI agent answers from inside its folder." },
        { title: "Denials are normal, not errors", body: "Ask for something outside the share and the reply is an honest “denied”. It's logged on both sides — that's the system working." }
      ],
      links: [{ label: "Go to your people →", action: "home" }] },
    { id: "agents", glyph: "6", bg: GREEN_BG, fg: GREEN_D, title: "Your agents & skills", tagline: "AI workers, jailed to one folder each",
      steps: [
        { title: "Create one in “My agents”", body: "Give it a name, a folder, and a purpose in plain language. The folder is its whole world — it cannot see outside." },
        { title: "Skills are markdown files", body: "Drop .md files into workspace/skills/ — the agent reads them on its next answer. No restart, no config." },
        { title: "Toggle skills on and off", body: "In the agent's edit screen, switch individual skills off without deleting the files." },
        { title: "Share it like anything else", body: "An agent only answers a contact after you share it with them — with the same look-only/time-box controls." }
      ],
      links: [{ label: "Open My agents →", action: "agents" }, { label: "AI runtimes — install guides →", action: "runtimes" }] },
    { id: "channels", glyph: "7", bg: AMBER_BG, fg: AMBER, title: "Talk from your chat apps", tagline: "WhatsApp, Telegram, Discord, Slack, GitHub, GitLab",
      steps: [
        { title: "Connect a channel once", body: "In Advanced → Channels, each card walks you through it: copy the token from the service, paste it in the form, Save — the channel starts right away. What you paste stays on this machine." },
        { title: "Pick who answers", body: "A connection can speak for one agent (its own bot — no mention needed) or for all of them (@mention picks). Set it right in the form." },
        { title: "Mention an agent anywhere", body: "Write @assistant summarize this in a chat, an issue, or a PR comment — the reply comes back in the same thread." },
        { title: "The rules follow the mention", body: "A mention can reach an agent on the other side of the trust boundary. Their shares still decide — a denial comes back as the reply, and both activity logs record it." }
      ],
      links: [{ label: "Open Channels →", action: "advanced" }] },
    { id: "safety", glyph: "8", bg: RED_BG, fg: RED, title: "How you're protected", tagline: "The whole security model on one page",
      steps: [
        { title: "No accounts, no cloud", body: "Your machine talks to theirs directly. Nothing you share passes through anyone else's servers." },
        { title: "Every request is attributed", body: "Pairing mints two separate credentials — one per direction. A request without a valid one is rejected and logged." },
        { title: "Shares are enforced, not promised", body: "Look-only, folder boundaries, time limits — your machine refuses violations. Sneaky “..” paths fail, guaranteed." },
        { title: "The log can't be edited", body: "Activity is append-only, kept on both sides, and includes every denial. Stopping a share takes one tap and works instantly." }
      ],
      links: [{ label: "See your activity →", action: "activity" }] }
  ];
  SCREENS.help = function () {
    var d = screenRoot("help");
    d.appendChild(hdr());
    d.appendChild(E("div", "title", "Help & guides"));
    d.appendChild(E("div", "sub2", "Short, numbered, no jargon. Each one ends where you can act."));
    var list = E("div", "stack-sm");
    GUIDES.forEach(function (g) {
      var card = B("card", "", function () { S.guideId = g.id; go("guide"); });
      card.innerHTML =
        "<div class='glyph' style='width:44px;height:44px;background:" + g.bg + ";color:" + g.fg + ";font-size:16px'>" + g.glyph + "</div>" +
        "<div style='flex:1;min-width:0'><div style='font-size:17px;font-weight:700'>" + esc(g.title) + "</div>" +
        "<div style='font-size:13.5px;color:#5f6368;margin-top:2px'>" + esc(g.tagline) + "</div></div>" +
        "<div class='chev'>›</div>";
      list.appendChild(card);
    });
    d.appendChild(list);
    d.appendChild(css(E("div", "hint", "Looking for the network setup? It has its own plain-language guide."), { marginTop: "16px" }));
    var net = B("linkbtn", "Getting connected — the network guide →", function () { go("networkHelp"); });
    css(net, { alignSelf: "flex-start", padding: "8px 0" });
    d.appendChild(net);
    return d;
  };
  SCREENS.guide = function () {
    var d = screenRoot("guide");
    var g = GUIDES.filter(function (x) { return x.id === S.guideId; })[0] || GUIDES[0];
    d.appendChild(hdr());
    var head = css(E("div"), { display: "flex", alignItems: "center", gap: "16px", margin: "8px 0 24px" });
    head.innerHTML =
      "<div class='glyph' style='width:60px;height:60px;border-radius:18px;background:" + g.bg + ";color:" + g.fg + ";font-size:22px'>" + g.glyph + "</div>" +
      "<div><div style='font-size:26px;font-weight:800;letter-spacing:-0.5px'>" + esc(g.title) + "</div>" +
      "<div style='font-size:15px;color:#5f6368;margin-top:2px'>" + esc(g.tagline) + "</div></div>";
    d.appendChild(head);
    var steps = E("div", "stack");
    g.steps.forEach(function (st, i) {
      var row = css(E("div"), { display: "flex", gap: "16px", background: "#ffffff", border: "2px solid #e8eaed", borderRadius: "20px", padding: "18px 20px" });
      row.innerHTML =
        "<div style='width:36px;height:36px;border-radius:50%;background:" + g.bg + ";color:" + g.fg + ";display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;flex:none'>" + (i + 1) + "</div>" +
        "<div style='flex:1;min-width:0'><div style='font-size:16.5px;font-weight:700;margin-bottom:4px'>" + esc(st.title) + "</div>" +
        "<div style='font-size:14.5px;color:#5f6368;line-height:1.55'>" + esc(st.body) + "</div></div>";
      steps.appendChild(row);
    });
    d.appendChild(steps);
    var links = css(E("div"), { display: "flex", flexDirection: "column", alignItems: "flex-start", marginTop: "16px" });
    (g.links || []).forEach(function (l) {
      links.appendChild(B("linkbtn", esc(l.label), GUIDE_ACTIONS[l.action] || goHome));
    });
    d.appendChild(links);
    return d;
  };

  // ============ NETWORK HELP ============
  SCREENS.networkHelp = function () {
    var d = screenRoot("networkHelp");
    d.appendChild(hdr());
    d.appendChild(E("div", "title", "Getting connected"));
    d.appendChild(css(E("div", "sub2", "agentina works by letting your computer and one other person's computer talk directly — no company's servers sit in the middle. For that, each computer needs an <b>address</b> the other can reach, like a phone number for machines."), { marginBottom: "24px" }));

    var why = css(E("div"), { background: GREEN_BG, border: "2px solid #A9E8C9", borderRadius: "20px", padding: "20px", marginBottom: "24px" });
    why.innerHTML =
      "<div style='font-size:17px;font-weight:800;margin-bottom:8px'>Why not just use the internet directly?</div>" +
      "<div style='font-size:15px;color:#3c5a4e;line-height:1.55'>Home internet usually hides your computer behind the router, so nobody can reach it from outside — which is good for safety. A <b>private network</b> gives your machine a stable address that only the people you invite can use. Think of it as a private hallway between two houses, not a public street.</div>";
    d.appendChild(why);

    d.appendChild(E("div", "eyebrow", "Pick one way to connect"));
    var stack = E("div", "stack");

    var ts = css(E("div"), { background: "#ffffff", border: "2px solid #A9CBFF", borderRadius: "20px", padding: "20px" });
    var e = env();
    var tsFound = e && e.network && e.network.tailscale && e.network.tailscale.found;
    var tsIp = e && e.network && e.network.tailscale && e.network.tailscale.ip;
    ts.innerHTML =
      "<div style='display:flex;align-items:center;gap:12px;margin-bottom:10px'>" +
      "<div class='glyph' style='width:44px;height:44px;background:" + BLUE_BG + ";color:" + BLUE + ";font-size:13px'>T</div>" +
      "<div style='flex:1'><div style='font-size:17px;font-weight:800'>Tailscale <span class='pill' style='color:" + GREEN_D + ";background:" + GREEN_BG + ";font-size:12.5px;padding:3px 10px;margin-left:4px'>easiest · free</span></div>" +
      "<div style='font-size:13.5px;color:#5f6368'>Best if you're not sure — it just works</div></div></div>" +
      "<div style='font-size:14.5px;color:#5f6368;line-height:1.6'>1. Install Tailscale on both computers and sign in (Google or email — no card).<br>2. It gives each machine an address that looks like <span class='mono' style='font-size:12.5px;color:#202124'>100.84.12.7</span>.<br>3. Paste that address into the box on the previous screen. Done.</div>" +
      (tsFound
        ? "<div style='font-size:14px;font-weight:700;color:" + GREEN_D + ";margin-top:12px'>Tailscale is on this machine" + (tsIp ? " — your address is <span class='mono' style='font-size:12.5px'>" + esc(tsIp) + "</span>" : "") + "</div>"
        : "<a href='https://tailscale.com/download' target='_blank' style='display:inline-block;font-size:14px;margin-top:12px'>Get Tailscale →</a>");
    stack.appendChild(ts);

    var wg = css(E("div"), { background: "#ffffff", border: "2px solid #e8eaed", borderRadius: "20px", padding: "20px" });
    wg.innerHTML =
      "<div style='display:flex;align-items:center;gap:12px;margin-bottom:10px'>" +
      "<div class='glyph' style='width:44px;height:44px;background:" + AMBER_BG + ";color:" + AMBER + ";font-size:13px'>W</div>" +
      "<div style='flex:1'><div style='font-size:17px;font-weight:800'>WireGuard <span class='pill' style='color:" + AMBER + ";background:" + AMBER_BG + ";font-size:12.5px;padding:3px 10px;margin-left:4px'>free · more setup</span></div>" +
      "<div style='font-size:13.5px;color:#5f6368'>If you or a techy friend already run one</div></div></div>" +
      "<div style='font-size:14.5px;color:#5f6368;line-height:1.6'>Same idea as Tailscale, but you configure the private network yourself. Once connected, each machine has a private address — paste yours into the box. headscale (self-hosted) works too.</div>" +
      "<a href='https://www.wireguard.com/install/' target='_blank' style='display:inline-block;font-size:14px;margin-top:12px'>About WireGuard →</a>";
    stack.appendChild(wg);

    var wan = css(E("div"), { background: "#ffffff", border: "2px solid #e8eaed", borderRadius: "20px", padding: "20px" });
    wan.innerHTML =
      "<div style='display:flex;align-items:center;gap:12px;margin-bottom:10px'>" +
      "<div class='glyph' style='width:44px;height:44px;background:" + RED_BG + ";color:" + RED + ";font-size:13px'>IP</div>" +
      "<div style='flex:1'><div style='font-size:17px;font-weight:800'>A public (WAN) address <span class='pill' style='color:" + RED + ";background:" + RED_BG + ";font-size:12.5px;padding:3px 10px;margin-left:4px'>advanced</span></div>" +
      "<div style='font-size:13.5px;color:#5f6368'>Only if you know your way around a router</div></div></div>" +
      "<div style='font-size:14.5px;color:#5f6368;line-height:1.6'>If your machine already has a public address on the internet (a server, or a home router set up to forward a port), you can use that directly — with TLS. Most people should pick Tailscale instead.</div>";
    stack.appendChild(wan);
    d.appendChild(stack);

    // The concluding step — every option above ends here.
    var conn = connectivity();
    var last = css(E("div"), { background: BLUE_BG, border: "2px solid #A9CBFF", borderRadius: "20px", padding: "20px", marginTop: "24px" });
    last.appendChild(css(E("div", null, "Last step — tell agentina your address"), { fontSize: "17px", fontWeight: "800", marginBottom: "8px" }));
    last.appendChild(css(E("div", null, "Type it into your account settings — agentina applies it right away, no restart. New invite links carry it automatically."), { fontSize: "14.5px", color: "#3c4a5f", lineHeight: "1.55", marginBottom: "10px" }));
    if (conn.ip && !conn.reachable) {
      var useIp2 = B("", "Use my Tailscale address — " + esc(conn.ip), function () { applyAddress(conn.ip); });
      css(useIp2, { border: "none", borderRadius: "12px", background: BLUE, color: "#ffffff", fontSize: "14.5px", fontWeight: "700", cursor: "pointer", padding: "10px 16px", boxShadow: "0 3px 0 " + BLUE_D, marginBottom: "6px" });
      last.appendChild(useIp2);
    }
    var acct = B("", "Open your account settings →", openAccount);
    css(acct, { display: "block", border: "none", background: "none", color: BLUE_D, fontSize: "13.5px", fontWeight: "700", cursor: "pointer", padding: "6px 6px 0 0", marginTop: "4px" });
    last.appendChild(acct);
    d.appendChild(last);

    d.appendChild(css(E("div", "hint", "Whichever you pick, agentina only needs “an address that answers.” Nothing you do here shares any files — that always happens later, one share at a time."), { marginTop: "20px" }));
    return d;
  };

  // ---------- poll loop ----------
  var lastPeerLoad = 0;
  function refresh() {
    return api("GET", "/status").then(function (s) {
      S.status = s;
      // Invite screen: detect the join the moment it lands.
      if (cur() === "invite" && (s.peers || []).length > S.inviteBaseline) {
        var newest = s.peers[s.peers.length - 1];
        toast(newest.peer + " joined — you're connected");
        S.inviteLink = null;
        goHome();
        return;
      }
      // Keep grant counts for the home cards fresh (cheap, small mesh).
      if (Date.now() - lastPeerLoad > 7000) {
        lastPeerLoad = Date.now();
        (s.peers || []).forEach(function (p) { loadPeer(p.peer, p.peer === S.contact); });
      }
      // Only re-render on MEANINGFUL change — mesh health checks stamp
      // volatile fields (lastCheck) every cycle; hashing them would
      // rebuild the DOM every poll and make the page feel haunted.
      var stablePeers = (s.peers || []).map(function (p) {
        return { peer: p.peer, healthy: p.healthy, partyId: p.partyId, skills: p.skills };
      });
      var hash = JSON.stringify([
        stablePeers, s.agents, s.audit, s.grants && s.grants.length,
        s.environment && s.environment.ai, s.channels, s.channelsConfig,
        s.party, s.profile, s.url
      ]);
      if (hash !== S.lastHash) {
        var first = !S.lastHash;
        S.lastHash = hash;
        if (first) render(); else maybeRender();
      }
    })["catch"](function () { /* node restarting — keep the last view */ });
  }
  refresh();
  setInterval(refresh, 2500);
})();
</script>
</body>
</html>
`
