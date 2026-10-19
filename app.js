(function () {
  "use strict";
  var cfg = window.ORBI_CONFIG || {};
  var sb = null;
  var MEDIA_BASE = (cfg.url || "") + "/storage/v1/object/public/media/";

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function hue(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function ic(path, cls) { return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + path + "</svg>"; }
  function num(n) {
    n = Number(n) || 0;
    if (n < 1000) return String(n);
    if (n < 10000) return (Math.floor(n / 100) / 10).toString().replace(/\.0$/, "") + "K";
    if (n < 1000000) return Math.floor(n / 1000) + "K";
    return (Math.floor(n / 100000) / 10).toString().replace(/\.0$/, "") + "M";
  }
  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "now";
    if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h";
    if (s < 604800) return Math.floor(s / 86400) + "d";
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  function fullTime(iso) {
    var d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) + " · " + d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  function until(iso) {
    var s = (new Date(iso).getTime() - Date.now()) / 1000;
    if (s <= 0) return "Final results";
    if (s < 3600) return Math.max(1, Math.ceil(s / 60)) + "m left";
    if (s < 86400) return Math.ceil(s / 3600) + "h left";
    return Math.ceil(s / 86400) + "d left";
  }
  function niceErr(e) {
    var m = (e && (e.message || e.error_description || e.msg)) || "";
    if (/invalid login/i.test(m)) return "Email or password is incorrect.";
    if (/already (been )?registered|already exists/i.test(m)) return "An account with this email already exists. Try logging in.";
    if (/rate limit|too many/i.test(m)) return "Too many attempts. Wait a few minutes and try again.";
    if (/not confirmed/i.test(m)) return "Confirm your email first. Check your inbox for the link.";
    if (/not enabled|unsupported provider/i.test(m)) return "This sign-in method is not switched on yet.";
    if (/failed to fetch|network|load failed/i.test(m)) return "No connection. Check your internet and try again.";
    if (/password.*(weak|short|characters)/i.test(m)) return "Choose a stronger password with at least 8 characters.";
    if (/exceeded the maximum allowed size|payload too large|too large/i.test(m)) return "That file is too big. The limit is 50 MB.";
    if (/mime type|not supported/i.test(m)) return "That file type is not supported.";
    if (/row-level security|violates|permission denied/i.test(m)) return "You can't do that.";
    return m || "Something went wrong. Try again.";
  }
  var toastTimer;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2800);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function link(path) { return location.origin + location.pathname + "#/" + path; }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return legacyCopy(t); });
    return Promise.resolve(legacyCopy(t));
  }
  function legacyCopy(t) {
    try { var a = document.createElement("textarea"); a.value = t; a.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(a); a.select(); var ok = document.execCommand("copy"); a.remove(); return ok; } catch (e) { return false; }
  }

  /* turn plain text into safe HTML with links, @mentions and #tags */
  function linkify(raw) {
    var s = String(raw == null ? "" : raw), out = "", last = 0, m;
    var re = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])|(^|[^\w@])@([A-Za-z0-9_.]{3,15})|(^|[^\w&#])#([\p{L}\p{N}_]{2,40})/gu;
    while ((m = re.exec(s))) {
      out += esc(s.slice(last, m.index));
      if (m[1]) {
        var own = location.origin + location.pathname + "#";
        if (m[1].indexOf(own) === 0) out += '<a href="' + esc(m[1]) + '" data-act="deeplink" data-hash="' + esc(m[1].slice(own.length)) + '">' + esc(m[1].length > 32 ? m[1].slice(0, 30) + "…" : m[1]) + "</a>";
        else out += '<a href="' + esc(m[1]) + '" target="_blank" rel="noopener noreferrer nofollow" data-act="link">' + esc(m[1].replace(/^https?:\/\//, "").slice(0, 30) + (m[1].length > 38 ? "…" : "")) + "</a>";
      } else if (m[3]) {
        var h = m[3].replace(/\.+$/, ""), tail = m[3].slice(h.length);
        out += esc(m[2]) + '<a href="#/u/' + esc(h.toLowerCase()) + '" data-act="mention" data-h="' + esc(h.toLowerCase()) + '">@' + esc(h) + "</a>" + esc(tail);
      } else {
        out += esc(m[4]) + '<a href="#" data-act="tag" data-tag="' + esc(m[5]) + '">#' + esc(m[5]) + "</a>";
      }
      last = re.lastIndex;
    }
    return out + esc(s.slice(last));
  }

  var I = {
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/>',
    bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    reply: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>',
    reorb: '<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 13.5A9 9 0 1 1 10.5 3a7 7 0 0 0 10.5 10.5z"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    account: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.5c1.3-2.2 3.4-3 5.8-3s4.5.8 5.8 3"/>',
    out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    device: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    install: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    chat: '<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .6 3.5 2.2 3.5 5.2"/>',
    list: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    reels: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 9h18M9 3l3 6M15 3l3 6"/><path d="M10.5 13.2v4l3.4-2z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10.5l5-3v9l-5-3"/>',
    poll: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a14 14 0 0 1-3 3.8M6.5 7.7A14 14 0 0 0 2.5 12C3.5 14 7 18 12 18a9.5 9.5 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    eye: '<path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6S3.5 14 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    share: '<path d="M12 15V3"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    send: '<path d="M21 3L10 14"/><path d="M21 3l-6.5 18-3.5-8-8-3.5z"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    quote: '<path d="M4 20l1.2-4.2A8 8 0 1 1 8.4 19z"/><path d="M9 10h6M9 13.5h3.5"/>',
    camera: '<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    mapPin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8 3v4M16 3v4"/>',
    volume: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    mute: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pause: '<rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/>',
    music: '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2.4"/><circle cx="17" cy="16" r="2.4"/>'
  };

  var GOOGLE = '<svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>';
  var APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';

  /* ---------- theme ---------- */
  function effectiveDark() {
    var t = document.documentElement.getAttribute("data-theme");
    if (t) return t === "dark";
    return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function setTheme(m) {
    theme = m;
    if (m === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", m);
    try { localStorage.setItem("orbi-theme", m); } catch (e) {}
  }
  try { var saved = localStorage.getItem("orbi-theme"); if (saved === "light" || saved === "dark") setTheme(saved); } catch (e) {}


  /* ---------- state ---------- */
  var S = {
    user: null, profile: null, me: null, view: "home", tab: "home", params: null, hist: [], feed: "foryou",
    following: {}, unread: 0, chatUnread: 0, installEvt: null,
    lists: { home: [], explore: [], profile: [], bookmarks: [], post: [] },
    homeLoading: false, homeEnd: false, homeBusy: false,
    people: [], searchQ: "", searchToken: 0, trending: [],
    opened: {}, tray: [], trayLoaded: false,
    pf: null, post: null, ppl: null, bm: { tab: "orbs", reels: [], loaded: false },
    reels: { list: [], idx: 0, ctx: null, end: false, loading: false },
    reelMuted: false,
    pwOpen: false, pwMsg: "", pwOk: false, recovery: false,
    chatThreads: [], thread: null, threadMsgs: [], pendingMsgs: [], threadSig: "", soonTitle: "", newPeople: [],
    posting: false
  };
  var theme = theme || "system";

  /* ---------- avatars with the story ring ---------- */
  function initial(name) { return esc((name || "?").trim().charAt(0).toUpperCase() || "?"); }
  function avInner(name, url, size) {
    return '<span class="av" style="--h:' + hue(name || "?") + ";--s:" + size + 'px"><i>' + initial(name) + "</i>" + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy" onerror="this.remove()">' : "") + "</span>";
  }
  function avU(o, size, opt) {
    opt = opt || {};
    if (opt.plain) return '<span class="avw" style="--s:' + size + 'px">' + avInner(o.name, o.url, size) + "</span>";
    var st = o.story || 0;
    return '<button type="button" class="avw st' + st + '" data-act="avatar" data-uid="' + esc(o.uid) + '" data-st="' + st + '" style="--s:' + size + 'px" aria-label="' + (st ? "Play story from " : "Open profile of ") + esc(o.name) + '">' +
      avInner(o.name, o.url, size) + (opt.add ? '<span class="avadd" data-act="addstory" aria-label="Add to your story">' + ic(I.plus) + "</span>" : "") + "</button>";
  }
  function storyState(p) { return p && p.has_story ? (p.story_unseen ? 2 : 1) : 0; }
  function avOrb(p, size) { return avU({ uid: p.author_id, name: p.display_name, url: p.avatar_url, story: storyState(p) }, size); }
  function avProf(p, size, opt) { return avU({ uid: p.id, name: p.display_name, url: p.avatar_url, story: storyState(p) }, size, opt); }
  function avSelf(size, plain) {
    var m = S.me || {}, pr = S.profile || {};
    return avU({ uid: S.user.id, name: pr.display_name, url: pr.avatar_url, story: storyState(m) }, size, plain ? { plain: true } : {});
  }

  /* ---------- sheets (bottom panels) and confirmations ---------- */
  var sheetPick = null, sheetOnClose = null;
  function openSheet(html, o) {
    o = o || {};
    var w = $("#sheet");
    w.className = "sheetwrap" + (o.tall ? " tall" : "");
    w.innerHTML = '<div class="scrim" data-act="sheetclose"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(o.label || "Options") + '"><div class="grab"></div>' + html + "</div>";
    w.hidden = false; sheetOnClose = o.onClose || null;
    return $(".sheet", w);
  }
  function closeSheet() {
    var w = $("#sheet"); if (w.hidden) return;
    w.hidden = true; w.innerHTML = "";
    var f = sheetOnClose; sheetOnClose = null; if (f) f();
    if (sheetPick) { var r = sheetPick; sheetPick = null; r(null); }
  }
  function actionSheet(items, title, desc) {
    return new Promise(function (res) {
      var h = (title ? '<p class="sh-title">' + esc(title) + "</p>" : "") + (desc ? '<p class="sh-desc">' + esc(desc) + "</p>" : "") +
        items.map(function (it) {
          return '<button class="sh-item' + (it.danger ? " danger" : "") + '" data-sheet="' + esc(it.id) + '">' + (it.icon ? ic(it.icon) : "") + "<span><b>" + esc(it.label) + "</b>" + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</span></button>";
        }).join("") + '<button class="sh-cancel" data-sheet="">Cancel</button>';
      closeSheet(); openSheet(h, { label: title || "Options" }); sheetPick = res;
    });
  }
  function confirmSheet(title, desc, okLabel, danger) {
    return actionSheet([{ id: "ok", label: okLabel, danger: !!danger }], title, desc).then(function (r) { return r === "ok"; });
  }

  /* ---------- little UI pieces ---------- */
  function skel(n) {
    var h = ""; for (var i = 0; i < n; i++) h += '<div class="post gx sk"><span class="skc"></span><div class="pbody"><span class="skl w40"></span><span class="skl w90"></span><span class="skl w70"></span></div></div>';
    return h;
  }
  function emptyHTML(t, d) { return '<div class="empty gx"><b>' + t + "</b>" + d + "</div>"; }
  function errHTML(e) { return emptyHTML("Something went wrong", esc(niceErr(e))); }

  /* ---------- photos, videos and uploads ---------- */
  var MAX_FILE = 50 * 1024 * 1024;
  function fileExt(type, name) {
    var m = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
    if (m[type]) return m[type];
    var e = (name || "").split(".").pop().toLowerCase(); return /^[a-z0-9]{2,4}$/.test(e) ? e : "bin";
  }
  function vidType(f) {
    if (/^video\/(mp4|webm|quicktime)$/.test(f.type)) return f.type;
    var e = (f.name || "").split(".").pop().toLowerCase();
    return e === "mp4" || e === "m4v" ? "video/mp4" : e === "webm" ? "video/webm" : e === "mov" ? "video/quicktime" : "";
  }
  function isVideoFile(f) { return /^video\//.test(f.type) || /\.(mp4|m4v|webm|mov)$/i.test(f.name || ""); }
  function imgEl(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), i = new Image();
      i.onload = function () { URL.revokeObjectURL(u); res(i); };
      i.onerror = function () { URL.revokeObjectURL(u); rej(new Error("Could not read that image.")); };
      i.src = u;
    });
  }
  function loadBitmap(file) {
    if (window.createImageBitmap) return createImageBitmap(file).catch(function () { return imgEl(file); });
    return imgEl(file);
  }
  /* shrink and recompress a photo so uploads are quick and storage lasts longer */
  async function prepImage(file, o) {
    o = o || {};
    if (!/^image\//.test(file.type)) throw new Error("That file type is not supported.");
    if (file.type === "image/gif" && !o.ratio) {
      if (file.size > 8 * 1024 * 1024) throw new Error("GIFs can be up to 8 MB.");
      var g0 = await imgEl(file);
      return { blob: file, w: g0.naturalWidth || g0.width, h: g0.naturalHeight || g0.height, ext: "gif", type: "image/gif" };
    }
    var src = await loadBitmap(file);
    var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, sx = 0, sy = 0, sw = w, sh = h;
    if (o.ratio) {
      if (w / h > o.ratio) { sw = Math.round(h * o.ratio); sx = Math.round((w - sw) / 2); } else { sh = Math.round(w / o.ratio); sy = Math.round((h - sh) / 2); }
    }
    var k = Math.min(1, (o.max || 1600) / Math.max(sw, sh)), cw = Math.max(1, Math.round(sw * k)), ch = Math.max(1, Math.round(sh * k));
    var c = document.createElement("canvas"); c.width = cw; c.height = ch;
    var g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cw, ch); g.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
    if (src.close) src.close();
    var blob = await new Promise(function (r) { c.toBlob(r, "image/jpeg", o.q || 0.86); });
    if (!blob) throw new Error("Could not read that image.");
    return { blob: blob, w: cw, h: ch, ext: "jpg", type: "image/jpeg" };
  }
  function probeVideo(file) {
    return new Promise(function (res, rej) {
      var v = document.createElement("video"), u = URL.createObjectURL(file), done = false, t;
      function fin(err, d) { if (done) return; done = true; clearTimeout(t); if (err) { URL.revokeObjectURL(u); rej(err); } else res(d); }
      t = setTimeout(function () { fin(new Error("Could not read that video. Try an MP4.")); }, 12000);
      v.preload = "metadata"; v.muted = true; v.playsInline = true;
      v.onloadedmetadata = function () { fin(null, { url: u, duration: isFinite(v.duration) ? v.duration : 0, w: v.videoWidth, h: v.videoHeight }); };
      v.onerror = function () { fin(new Error("This browser can't play that video. Try an MP4 (H.264).")); };
      v.src = u;
    });
  }
  function capturePoster(url, dur) {
    return new Promise(function (res) {
      var v = document.createElement("video"), done = false, t;
      function fin(b) { if (done) return; done = true; clearTimeout(t); v.removeAttribute("src"); res(b); }
      t = setTimeout(function () { fin(null); }, 6000);
      v.muted = true; v.playsInline = true; v.preload = "auto";
      v.onloadeddata = function () { try { v.currentTime = Math.min(0.6, (dur || 1) / 3); } catch (e) { fin(null); } };
      v.onseeked = function () {
        try {
          var k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(v.videoWidth * k)); c.height = Math.max(1, Math.round(v.videoHeight * k));
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(function (b) { fin(b); }, "image/jpeg", 0.8);
        } catch (e) { fin(null); }
      };
      v.onerror = function () { fin(null); };
      v.src = url;
    });
  }
  function xhrUpload(path, blob, onProg) {
    return new Promise(function (resolve, reject) {
      sb.auth.getSession().then(function (r) {
        var tok = r.data && r.data.session ? r.data.session.access_token : cfg.key;
        var x = new XMLHttpRequest();
        x.open("POST", cfg.url + "/storage/v1/object/media/" + path);
        x.setRequestHeader("Authorization", "Bearer " + tok); x.setRequestHeader("apikey", cfg.key); x.setRequestHeader("x-upsert", "false");
        var fd = new FormData(); fd.append("cacheControl", "31536000"); fd.append("", blob);
        if (x.upload && onProg) x.upload.onprogress = function (e) { if (e.lengthComputable) onProg(e.loaded / e.total); };
        x.onload = function () {
          if (x.status >= 200 && x.status < 300) return resolve();
          var msg = ""; try { msg = JSON.parse(x.responseText).message || ""; } catch (e) {}
          var err = new Error(msg || "Upload failed (" + x.status + ")"); if (x.status === 413 || x.status === 415 || x.status === 403) err.fatal = true; reject(err);
        };
        x.onerror = function () { reject(new Error("Failed to fetch")); };
        x.send(fd);
      }, reject);
    });
  }
  async function uploadFile(blob, ext, type, onProg) {
    var path = S.user.id + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + "." + ext;
    var typed = blob.type === type ? blob : blob.slice(0, blob.size, type);
    try { await xhrUpload(path, typed, onProg); }
    catch (e) {
      if (e && e.fatal) throw e;
      var r = await sb.storage.from("media").upload(path, typed, { contentType: type, cacheControl: "31536000", upsert: true });
      if (r.error) throw r.error;
    }
    if (onProg) onProg(1);
    return { url: MEDIA_BASE + path, path: path };
  }
  function pathFromUrl(u) { return u && u.indexOf(MEDIA_BASE) === 0 ? u.slice(MEDIA_BASE.length) : null; }
  function removeMedia(urls) {
    var paths = (urls || []).map(pathFromUrl).filter(function (p) { return p && p.indexOf(S.user.id + "/") === 0; });
    if (paths.length) { try { Promise.resolve(sb.storage.from("media").remove(paths)).catch(function () {}); } catch (e) {} }
  }
  function pickFiles(accept, multiple) {
    return new Promise(function (res) {
      var i = $("#filepick"); i.value = ""; i.accept = accept; i.multiple = !!multiple;
      i.onchange = function () { res(Array.prototype.slice.call(i.files || [])); i.onchange = null; };
      i.click();
    });
  }


  /* ---------- boot: splash (2s), then session check ---------- */
  function boot() {
    document.body.classList.add("on-auth");
    $("#splash").hidden = false; $("#splash .lockup").hidden = false; $("#splash-err").hidden = true;
    var delay = new Promise(function (r) { setTimeout(r, 2000); });
    var sessionP;
    if (window.supabase && cfg.url && cfg.key) {
      if (!sb) {
        sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
        sb.auth.onAuthStateChange(function (ev) {
          if (ev === "SIGNED_OUT") setTimeout(goAuth, 0);
          if (ev === "PASSWORD_RECOVERY") S.recovery = true;
        });
      }
      sessionP = sb.auth.getSession().catch(function (e) { return { error: e }; });
    } else {
      sessionP = Promise.resolve({ error: { message: "Failed to fetch" } });
    }
    Promise.all([delay, sessionP]).then(function (res) {
      var r = res[1];
      if (r.error && !(r.data && r.data.session)) { return splashError("We could not reach Orbi. Check your internet connection and try again."); }
      var session = r.data && r.data.session;
      if (session) startApp(session.user); else goAuth();
    });
  }
  function splashError(msg) {
    $("#splash .lockup").hidden = true; $("#splash-err").hidden = false; $("#splash-err-text").textContent = msg;
  }
  $("#splash-retry").addEventListener("click", function () { if (!window.supabase) { location.reload(); } else { boot(); } });

  function hideLayers() {
    ["#drawer", "#compose", "#sheet", "#lightbox", "#story", "#modal"].forEach(function (s) { var e = $(s); if (e) e.hidden = true; });
    var f = $("#fab"); if (f) f.hidden = true;
    stopStory(true); pauseReels();
  }
  function goAuth() {
    S.user = null; S.profile = null; S.me = null;
    document.body.classList.add("on-auth");
    $("#splash").hidden = true; $("#app").hidden = true; $("#auth").hidden = false;
    hideLayers();
    S.thread = null; S.threadMsgs = []; S.pendingMsgs = []; S.chatThreads = []; S.chatUnread = 0;
    S.lists = { home: [], explore: [], profile: [], bookmarks: [], post: [] }; S.tray = []; S.trayLoaded = false; S.hist = [];
    S.reels = { list: [], idx: 0, ctx: null, end: false, loading: false }; S.pf = null; S.post = null; S.opened = {};
    if (aview !== "confirm") { aview = mode === "signup" ? "options" : "email"; }
    renderAuth();
  }

  /* ---------- enter the app ---------- */
  async function startApp(user) {
    S.user = user;
    var pr = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (pr.error || !pr.data) {
      await sb.auth.signOut();
      aview = mode === "signup" ? "options" : "email"; goAuth();
      return toast("We could not load your profile. Please try again.");
    }
    S.profile = pr.data; S.hist = []; S.feed = "foryou"; S.trayLoaded = false;
    resetComposer(); armBack();
    document.body.classList.remove("on-auth");
    $("#splash").hidden = true; $("#auth").hidden = true; $("#app").hidden = false;
    $("#search-in").value = ""; S.searchQ = "";
    await Promise.all([loadFollowing(), loadUnread(), loadMe()]);
    show(S.recovery ? "security" : "home");
    if (S.recovery) { S.pwOpen = true; renderSecurity(); toast("Choose a new password."); }
    else if (needsProfileSetup(S.profile)) setTimeout(openFinishProfile, 400);
  }
  async function logout() {
    await sb.auth.signOut();
    mode = "login"; aview = "email"; goAuth();
  }

  /* ---------- data loading ---------- */
  async function loadFollowing() {
    var r = await sb.from("orbits").select("following_id").eq("follower_id", S.user.id);
    S.following = {}; (r.data || []).forEach(function (x) { S.following[x.following_id] = true; });
  }
  async function loadMe() {
    var r = await sb.from("profile_cards").select("*").eq("id", S.user.id).maybeSingle();
    if (r.data) S.me = r.data;
    else if (!S.me) S.me = { id: S.user.id, orbiting_count: 0, orbiter_count: 0, orb_count: 0, reel_count: 0 };
  }
  async function loadUnread() {
    var res = await Promise.all([
      sb.from("notifications").select("id", { count: "exact", head: true }).eq("read", false),
      sb.from("messages").select("id", { count: "exact", head: true }).eq("recipient_id", S.user.id).is("read_at", null)
    ]);
    S.unread = res[0].count || 0; S.chatUnread = res[1].count || 0; renderTabbar();
  }
  setInterval(function () { if (S.user && !document.hidden) loadUnread(); }, 60000);
  /* chat refresh: the open conversation or chat list checks for new messages every few seconds */
  var tick = 0;
  setInterval(function () {
    if (!S.user || document.hidden) return;
    tick++;
    if (S.view === "thread") loadThread(true);
    else if (S.view === "chat") loadChat(true);
    if (tick % 4 === 0 && S.view !== "thread") loadUnread();
  }, 4000);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { pauseReels(); return; }
    if (S.user && S.view === "home") { loadHome(true); loadTray(); }
    if (S.user && S.view === "reels") resumeReels();
  });

  /* ---------- navigation ---------- */
  var TABS = [["home", "Home", I.home], ["explore", "Explore", I.search], ["reels", "Reels", I.reels], ["alerts", "Alerts", I.bell], ["chat", "Chat", I.chat], ["profile", "Profile", I.user]];
  var TAB_VIEWS = { home: 1, explore: 1, reels: 1, alerts: 1, chat: 1, profile: 1 };
  var TITLES = { settings: "Settings", security: "Security", newchat: "New message", post: "Orb", bookmarks: "Bookmarks" };
  function topTitle(v) {
    if (v === "thread") return S.thread ? S.thread.display_name : "Chat";
    if (v === "soon") return S.soonTitle;
    if (v === "user") return S.pf && S.pf.profile ? S.pf.profile.display_name : "Profile";
    if (v === "people") return S.ppl ? S.ppl.name : "People";
    return TITLES[v];
  }
  function show(v, params, opt) {
    opt = opt || {};
    if (S.view === "reels" && v !== "reels") pauseReels();
    S.view = v; S.params = params || null;
    if (TAB_VIEWS[v]) S.tab = v;
    else if (v === "settings" || v === "security" || v === "bookmarks") S.tab = "profile";
    else if (v === "thread" || v === "newchat") S.tab = "chat";
    closeDrawer(); closeSheet();
    $$("#content > section").forEach(function (s) { s.hidden = s.dataset.view !== v; });
    var app = $("#app");
    app.classList.toggle("in-thread", v === "thread"); app.classList.toggle("in-reels", v === "reels");
    $("#fab").hidden = v !== "home";
    renderTop(); renderTabbar();
    $("#content").scrollTop = 0;
    if (v === "home") { renderFeed(); renderTray(); loadHome(S.lists.home.length > 0); loadTray(); }
    else if (v === "explore") loadExplore();
    else if (v === "reels") showReels();
    else if (v === "alerts") loadAlerts();
    else if (v === "chat") { renderChatList(); loadChat(); }
    else if (v === "newchat") { $("#newchat-in").value = ""; loadNewChat(); }
    else if (v === "soon") renderSoon();
    else if (v === "profile") openOwnProfile();
    else if (v === "user") loadUserView();
    else if (v === "post") loadPost();
    else if (v === "bookmarks") loadBookmarks();
    else if (v === "people") loadPeople();
    else if (v === "settings") renderSettings();
    else if (v === "security") renderSecurity();
  }
  function go(v, params) {
    S.hist.push({ view: S.view, params: S.params, scroll: $("#content").scrollTop });
    show(v, params);
  }
  function back() {
    var h = S.hist.pop();
    if (!h) return show(TAB_VIEWS[S.tab] ? S.tab : "home");
    show(h.view, h.params);
    $("#content").scrollTop = h.scroll || 0;
  }
  function tabTo(t) { S.hist = []; show(t); }
  function renderTabbar() {
    var cur = S.tab;
    $("#tabbar").innerHTML = TABS.map(function (t) {
      var n = t[0] === "alerts" ? S.unread : t[0] === "chat" ? S.chatUnread : 0;
      return '<button data-nav="' + t[0] + '"' + (cur === t[0] ? ' aria-current="page"' : "") + ">" + ic(t[2]) + "<span>" + t[1] + "</span>" + (n ? '<span class="badge" aria-label="' + n + ' unread">' + (n > 99 ? "99+" : n) + "</span>" : "") + "</button>";
    }).join("");
  }
  function themeBtn() {
    var dark = effectiveDark();
    return '<button class="iconbtn" data-act="theme" aria-label="Switch to ' + (dark ? "light" : "dark") + ' mode">' + ic(dark ? I.sun : I.moon) + "</button>";
  }
  function renderTop() {
    var v = S.view, t = $("#topbar"), title = topTitle(v);
    if (title) t.innerHTML = '<button class="iconbtn" data-act="back" aria-label="Back">' + ic(I.back) + '</button><div class="mid">' + esc(title) + "</div>" +
      (v === "user" ? '<button class="iconbtn" data-act="usermore" aria-label="More">' + ic(I.more) + "</button>" : themeBtn());
    else t.innerHTML = '<button class="iconbtn" data-act="menu" aria-label="Open menu">' + avInner(S.profile.display_name, S.profile.avatar_url, 32) + '</button><button class="iconbtn" style="width:auto;margin:0 auto" data-act="top" aria-label="Orbi, back to top"><span class="ring" style="width:28px;color:var(--accent)"></span></button>' + themeBtn();
  }
  document.addEventListener("click", function (e) {
    var nav = e.target.closest("[data-nav]");
    if (nav && !$("#app").hidden) {
      var same = S.view === nav.dataset.nav;
      if (same && nav.dataset.nav === "reels") { var rs = $("#reels-scroll"); if (rs) rs.scrollTo({ top: 0, behavior: "smooth" }); return; }
      tabTo(nav.dataset.nav);
      if (same) $("#content").scrollTop = 0;
    }
  });

  /* ---------- links into the app (shared links, mentions) ---------- */
  function routeTo(str) {
    var m = String(str || "").replace(/^#?\/?/, "").split("/");
    if (!m[0] || !S.user) return false;
    if (m[0] === "orb" && m[1]) { openPost(m[1]); return true; }
    if (m[0] === "reel" && m[1]) { openReelById(m[1]); return true; }
    if (m[0] === "u" && m[1]) { openUserByHandle(m[1]); return true; }
    return false;
  }
  function routeHash() {
    var h = location.hash;
    if (!h || h.length < 3) return false;
    var ok = routeTo(h);
    if (ok) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }
    return ok;
  }
  window.addEventListener("hashchange", function () { if (S.user) routeHash(); });

  /* ---------- auth ---------- */
  var mode = "signup", aview = "options", pendingPhone = "", pendingEmail = "";
  var COUNTRIES = [["+234", "NG +234"], ["+1", "US +1"], ["+44", "UK +44"], ["+233", "GH +233"], ["+254", "KE +254"], ["+27", "ZA +27"], ["+91", "IN +91"], ["+33", "FR +33"], ["+49", "DE +49"], ["+55", "BR +55"]];
  var PHONE = ic(I.device), MAIL = ic(I.mail);
  function renderAuth() {
    var su = mode === "signup";
    $("#auth-title").textContent = aview === "confirm" ? "Check your email." : su ? "Join the orbit." : "Welcome back.";
    $("#auth-sub").textContent = aview === "confirm" ? "One more step to finish your account." : su ? "Create your Orbi account in a minute." : "Log in to see what is moving in your orbit.";
    $("#tab-signup").setAttribute("aria-selected", su); $("#tab-login").setAttribute("aria-selected", !su);
    var h = "", p = $("#auth-panel");
    if (!su && aview !== "confirm") aview = "email";
    if (aview === "options") {
      h += '<button class="abtn solid" data-a="apple">' + APPLE + "Continue with Apple" + "</button>";
      h += '<button class="abtn solid" data-a="google">' + GOOGLE + "Continue with Google" + "</button>";
      h += '<div class="or">or</div>';
      h += '<button class="abtn" data-a="phone">' + PHONE + "Continue with phone number</button>";
      h += '<button class="abtn" data-a="email">' + MAIL + "Continue with email</button>";
    } else if (aview === "email") {
      if (su) h += '<button class="backbtn" data-a="back">' + ic(I.back) + "Back</button>";
      if (su) {
        h += '<div class="field"><label for="a-name">Name</label><input class="ain" id="a-name" autocomplete="name" maxlength="40" placeholder="Your name"></div>';
        h += '<div class="field"><label for="a-handle">Handle</label><input class="ain" id="a-handle" autocomplete="username" maxlength="16" placeholder="yourname" autocapitalize="none" spellcheck="false"></div>';
      }
      h += '<div class="field"><label for="a-email">Email</label><input class="ain" id="a-email" type="email" autocomplete="email" placeholder="you@example.com"></div>';
      h += '<div class="field"><label for="a-pass">Password</label><div class="pw"><input class="ain" id="a-pass" type="password" autocomplete="' + (su ? "new-password" : "current-password") + '" placeholder="' + (su ? "At least 8 characters" : "Your password") + '"><button type="button" data-a="showpw" aria-label="Show password">Show</button></div></div>';
      h += '<p class="err" id="a-err" role="alert"></p>';
      h += '<button class="abtn primary" id="a-go" data-a="emailgo">' + (su ? "Create account" : "Log in") + "</button>";
      if (!su) h += '<button class="linkbtn" data-a="forgot">Forgot password?</button>';
    } else if (aview === "phone") {
      h += '<button class="backbtn" data-a="back">' + ic(I.back) + "Back</button>";
      h += '<div class="field"><label for="a-num">Phone number</label><div class="phone-row"><select class="ain" id="a-cc" aria-label="Country code">' + COUNTRIES.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + "</option>"; }).join("") + '</select><input class="ain" id="a-num" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="801 234 5678"></div></div>';
      h += '<p class="err" id="a-err" role="alert"></p>';
      h += '<button class="abtn primary" id="a-go" data-a="sendcode">Send code</button>';
    } else if (aview === "code") {
      h += '<button class="backbtn" data-a="phone">' + ic(I.back) + "Change number</button>";
      h += '<div class="field"><label for="a-code">6-digit code</label><input class="ain code-in" id="a-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······"></div>';
      h += '<p class="legal" style="text-align:left">Sent to ' + esc(pendingPhone) + ".</p>";
      h += '<p class="err" id="a-err" role="alert"></p>';
      h += '<button class="abtn primary" id="a-go" data-a="verify">Verify and continue</button>';
    } else if (aview === "confirm") {
      h += '<p style="margin:0;color:var(--auth-dim)">We sent a confirmation link to <b style="color:var(--auth-fg)">' + esc(pendingEmail) + "</b>. Open it on this device to finish creating your account.</p>";
      h += '<button class="abtn primary" data-a="toLogin">Back to log in</button>';
    }
    p.innerHTML = h;
    var first = $("input,select", p); if (first && aview !== "options" && aview !== "email") first.focus();
  }
  function aerr(m) { var e = $("#a-err"); if (e) e.textContent = m; }
  function busy(on) { var b = $("#a-go"); if (b) { b.classList.toggle("busy", on); b.disabled = on; } }

  $("#auth").addEventListener("click", function (e) {
    var b = e.target.closest("[data-mode],[data-a]"); if (!b) return;
    if (b.dataset.mode) { mode = b.dataset.mode; aview = mode === "signup" ? "options" : "email"; renderAuth(); return; }
    var a = b.dataset.a;
    if (a === "email") { aview = "email"; renderAuth(); }
    else if (a === "phone") {
      if (!provOn("phone")) return toast("Phone sign-in is not switched on yet. Use email for now.");
      aview = "phone"; renderAuth();
    }
    else if (a === "back" || a === "toLogin") { if (a === "toLogin") mode = "login"; aview = mode === "signup" ? "options" : "email"; renderAuth(); }
    else if (a === "apple" || a === "google") oauth(a);
    else if (a === "showpw") { var f = $("#a-pass"), show = f.type === "password"; f.type = show ? "text" : "password"; b.textContent = show ? "Hide" : "Show"; b.setAttribute("aria-label", show ? "Hide password" : "Show password"); }
    else if (a === "forgot") forgot();
    else if (a === "emailgo") emailGo();
    else if (a === "sendcode") sendCode();
    else if (a === "verify") verifyCode();
  });
  $("#auth").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || e.target.tagName === "SELECT") return;
    var go = $("#a-go"); if (go) { e.preventDefault(); go.click(); }
  });
  function redirectUrl() { return location.origin + location.pathname; }
  /* which sign-in methods are switched on in Supabase (public setting, read in the browser) */
  var PROV = null;
  function loadProviders() {
    return fetch(cfg.url + "/auth/v1/settings", { headers: { apikey: cfg.key } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.external) PROV = { google: !!j.external.google, apple: !!j.external.apple, phone: !!j.external.phone }; })
      .catch(function () {});
  }
  function provOn(p) { return PROV ? !!PROV[p] : !!(cfg.providers && cfg.providers[p]); }
  loadProviders();
  function oauth(p) {
    var label = p === "apple" ? "Apple" : "Google";
    if (!provOn(p)) return toast(label + " sign-in is not switched on yet. Use email for now.");
    toast("Opening " + label + "...");
    sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: redirectUrl() } }).then(function (r) { if (r.error) toast(niceErr(r.error)); });
  }
  /* people who join with Google, Apple or a phone number get a placeholder handle; let them pick their own once */
  function needsProfileSetup(pr) {
    if (!pr) return false;
    if (!/^orbiter[0-9a-f]{6}$/.test(pr.handle) && pr.display_name !== "New Orbiter") return false;
    try { if (localStorage.getItem("orbi-setup-skip-" + pr.id)) return false; } catch (e) {}
    return true;
  }
  function openFinishProfile() {
    var pr = S.profile; if (!pr || !$("#sheet").hidden) return;
    var nm = pr.display_name === "New Orbiter" ? "" : pr.display_name;
    var h = '<p class="sh-title">Finish your profile</p><p class="sh-desc">Pick the name and handle people will see.</p>' +
      '<div class="fp"><div class="field"><label for="fp-name">Name</label><input class="in" id="fp-name" maxlength="40" autocomplete="name" placeholder="Your name" value="' + esc(nm) + '"></div>' +
      '<div class="field"><label for="fp-handle">Handle</label><input class="in" id="fp-handle" maxlength="15" autocapitalize="none" spellcheck="false" placeholder="yourname" value=""></div>' +
      '<p class="fp-err" id="fp-err" role="alert"></p>' +
      '<button class="btn fill fp-save" id="fp-save" data-fp="save">Save</button><button class="btn fp-skip" data-fp="skip">Skip for now</button></div>';
    openSheet(h, { label: "Finish your profile" });
  }
  $("#sheet").addEventListener("click", async function (e) {
    var b = e.target.closest("[data-fp]"); if (!b) return;
    if (b.dataset.fp === "skip") { try { localStorage.setItem("orbi-setup-skip-" + S.user.id, "1"); } catch (x) {} closeSheet(); return; }
    var name = $("#fp-name").value.trim(), handle = $("#fp-handle").value.trim().replace(/^@/, "").toLowerCase(), er = $("#fp-err");
    if (!name) { er.textContent = "Add your name."; return; }
    if (!/^[a-z0-9_.]{3,15}$/.test(handle)) { er.textContent = "Handles are 3 to 15 letters, numbers, dots or underscores."; return; }
    b.disabled = true; er.textContent = "";
    try {
      var pr = await saveProfileRow({ display_name: name, handle: handle });
      S.profile = pr; closeSheet(); toast("Profile saved.");
    } catch (err) {
      b.disabled = false;
      er.textContent = err && (err.code === "23505" || /duplicate|unique/i.test(err.message || "")) ? "That handle is taken. Try another." : niceErr(err);
    }
  });
  async function forgot() {
    var em = $("#a-email").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) return aerr("Enter your email above and we will send a reset link.");
    var r = await sb.auth.resetPasswordForEmail(em, { redirectTo: redirectUrl() });
    if (r.error) return aerr(niceErr(r.error));
    aerr(""); toast("If that email has an account, a reset link is on its way.");
  }
  async function emailGo() {
    var su = mode === "signup", em = $("#a-email").value.trim(), pw = $("#a-pass").value;
    var name = su ? $("#a-name").value.trim() : "", handle = su ? $("#a-handle").value.trim().replace(/^@/, "").toLowerCase() : "";
    if (su && !name) return aerr("Add your name.");
    if (su && !/^[a-z0-9_.]{3,15}$/.test(handle)) return aerr("Handles are 3 to 15 letters, numbers, dots or underscores.");
    if (!/^\S+@\S+\.\S+$/.test(em)) return aerr("Enter a valid email address.");
    if (su && pw.length < 8) return aerr("Use at least 8 characters for your password.");
    if (!su && !pw) return aerr("Enter your password.");
    aerr(""); busy(true);
    try {
      if (su) {
        var taken = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("handle", handle);
        if (taken.error) throw taken.error;
        if (taken.count > 0) { busy(false); return aerr("That handle is taken. Try another."); }
        var r = await sb.auth.signUp({ email: em, password: pw, options: { data: { handle: handle, display_name: name }, emailRedirectTo: redirectUrl() } });
        if (r.error) throw r.error;
        if (r.data && r.data.session) return startApp(r.data.session.user);
        pendingEmail = em; aview = "confirm"; renderAuth();
      } else {
        var l = await sb.auth.signInWithPassword({ email: em, password: pw });
        if (l.error) throw l.error;
        startApp(l.data.user);
      }
    } catch (err) { busy(false); aerr(niceErr(err)); }
  }
  async function sendCode() {
    var num = $("#a-num").value.replace(/[\s-]/g, "").replace(/^0+/, "");
    if (!/^\d{6,14}$/.test(num)) return aerr("Enter a valid phone number, digits only.");
    pendingPhone = $("#a-cc").value + num; aerr(""); busy(true);
    var r = await sb.auth.signInWithOtp({ phone: pendingPhone });
    if (r.error) { busy(false); return aerr(niceErr(r.error)); }
    aview = "code"; renderAuth();
  }
  async function verifyCode() {
    var c = $("#a-code").value.trim();
    if (!/^\d{6}$/.test(c)) return aerr("Enter the 6 digits from your message.");
    aerr(""); busy(true);
    var r = await sb.auth.verifyOtp({ phone: pendingPhone, token: c, type: "sms" });
    if (r.error) { busy(false); return aerr(niceErr(r.error)); }
    startApp(r.data.user);
  }


  /* ---------- posts ---------- */
  function rowKey(p) { return p.id + (p.actor_id && p.actor_id !== p.author_id ? "~" + p.actor_id : ""); }
  function eachOrb(id, fn) { Object.keys(S.lists).forEach(function (k) { S.lists[k].forEach(function (o) { if (o.id === id) fn(o); }); }); }
  function findRowByKey(k) {
    var ks = Object.keys(S.lists);
    for (var i = 0; i < ks.length; i++) { var a = S.lists[ks[i]]; for (var j = 0; j < a.length; j++) if (rowKey(a[j]) === k) return a[j]; }
  }
  function findOrb(id) { var f; Object.keys(S.lists).some(function (k) { return S.lists[k].some(function (o) { if (o.id === id) { f = o; return true; } }); }); return f; }
  function repaint(id) {
    $$('.post[data-id="' + id + '"]').forEach(function (el) {
      var row = findRowByKey(el.dataset.k); if (!row) return;
      var tmp = document.createElement("div");
      tmp.innerHTML = postHTML(row, { focus: el.classList.contains("focus"), anc: el.classList.contains("anc"), hideRto: el.dataset.hr === "1" });
      if (tmp.firstChild) el.replaceWith(tmp.firstChild);
    });
  }

  function mediaHTML(m) {
    if (!m || !m.length) return "";
    if (m[0].type === "video") {
      var v = m[0], ar = v.w && v.h ? "aspect-ratio:" + Math.max(0.56, Math.min(1.78, v.w / v.h)).toFixed(3) + ";" : "";
      return '<div class="mv" data-act="vtoggle" style="' + ar + '"><video src="' + esc(v.url) + '#t=0.1" playsinline muted loop preload="metadata" data-auto="1"></video>' +
        '<button class="vmute" data-act="vmute" aria-label="Unmute">' + ic(I.mute) + '</button><span class="vplay">' + ic(I.play) + "</span></div>";
    }
    return '<div class="mg n' + m.length + '">' + m.map(function (x, i) {
      var st = m.length === 1 && x.w && x.h ? ' style="aspect-ratio:' + Math.max(0.6, Math.min(1.9, x.w / x.h)).toFixed(3) + '"' : "";
      return '<button class="mi" data-act="img" data-i="' + i + '" aria-label="View photo ' + (i + 1) + '"' + st + '><img src="' + esc(x.url) + '" alt="" loading="lazy"></button>';
    }).join("") + "</div>";
  }
  function coverHTML(id) {
    return '<div class="cover"><span class="cv-ic">' + ic(I.eyeoff) + "</span><b>Sensitive content</b><span>The author marked this orb as sensitive.</span>" +
      '<button class="btn sm fill" data-act="opencover" aria-label="Open sensitive orb">Open</button></div>';
  }
  function quoteHTML(q) {
    var inner;
    if (q.sensitive) inner = '<p class="qtext muted">' + ic(I.eyeoff) + " Sensitive content</p>";
    else {
      var first = q.media && q.media[0];
      inner = (q.body ? '<p class="qtext">' + linkify(q.body) + "</p>" : "") +
        (first ? '<div class="qmedia">' + (first.type === "video" ? '<span class="vplay sm">' + ic(I.play) + "</span>" : '<img src="' + esc(first.url) + '" alt="" loading="lazy">') + "</div>" : "");
    }
    return '<div class="qcard" data-act="openquote" data-qid="' + q.id + '" role="link" tabindex="0"><div class="qhead">' + avInner(q.display_name, q.avatar_url, 20) + "<b>" + esc(q.display_name) + '</b><span class="muted">@' + esc(q.handle) + " · " + ago(q.created_at) + "</span></div>" + inner + "</div>";
  }
  function pollHTML(p) {
    var po = p.poll; if (!po || !po.options) return "";
    var counts = po.counts || [], total = counts.reduce(function (a, b) { return a + Number(b); }, 0), ended = new Date(po.ends_at) <= new Date(),
      voted = po.my_vote != null, show = voted || ended || p.author_id === S.user.id, top = Math.max.apply(null, counts.concat([0]));
    var h = '<div class="poll" data-act="pollbox">';
    po.options.forEach(function (o, i) {
      if (!show) h += '<button class="popt" data-act="vote" data-i="' + i + '">' + esc(o) + "</button>";
      else {
        var c = Number(counts[i]) || 0, pct = total ? Math.round(c * 100 / total) : 0;
        h += '<div class="pres' + (po.my_vote === i ? " mine" : "") + (c === top && total ? " top" : "") + '"><span class="pbar" style="width:' + pct + '%"></span><span class="pl">' + esc(o) + (po.my_vote === i ? ic(I.check) : "") + "</span><b>" + pct + "%</b></div>";
      }
    });
    return h + '<p class="pmeta muted">' + total + (total === 1 ? " vote" : " votes") + " · " + until(po.ends_at) + "</p></div>";
  }
  function contentHTML(p, o) {
    if (p.sensitive && !S.opened[p.id]) return coverHTML(p.id);
    return (p.body ? '<p class="ptext' + (o.focus ? " big" : "") + '">' + linkify(p.body) + "</p>" : "") + mediaHTML(p.media) + pollHTML(p) + (p.quoted ? quoteHTML(p.quoted) : "");
  }
  function actBtn(act, path, count, on, label, cls) {
    return '<button class="act' + (on ? " on" : "") + (cls && cls.pop ? " pop" : "") + '" data-act="' + act + '" aria-label="' + label + '"' + (act === "like" || act === "reorb" || act === "bookmark" ? ' aria-pressed="' + !!on + '"' : "") + ">" + ic(path, cls && cls.ic || "") + (count != null ? "<span>" + (count ? num(count) : "") + "</span>" : "") + "</button>";
  }
  function actsHTML(p, focus, pop) {
    return '<div class="pacts' + (focus ? " big" : "") + '">' +
      actBtn("reply", I.reply, focus ? null : p.reply_count, false, "Reply") +
      actBtn("reorb", I.reorb, focus ? null : p.reorb_count, p.reorbed_by_me, "Re-orb") +
      actBtn("like", I.heart, focus ? null : p.like_count, p.liked_by_me, "Like", { ic: "i-heart", pop: pop === "like" }) +
      actBtn("bookmark", I.bookmark, null, p.bookmarked_by_me, p.bookmarked_by_me ? "Remove bookmark" : "Bookmark", { ic: "i-bm", pop: pop === "bookmark" }) +
      actBtn("share", I.share, null, false, "Share") + "</div>";
  }
  function postHTML(p, o) {
    o = o || {};
    var pop = p._pop || ""; delete p._pop;
    var attrs = 'data-id="' + p.id + '" data-k="' + esc(rowKey(p)) + '"' + (o.hideRto ? ' data-hr="1"' : "");
    var moreBtn = '<button class="mini" data-act="more" aria-label="More options">' + ic(I.more) + "</button>";
    var who = '<a class="pwho" href="#/u/' + esc(p.handle) + '" data-act="mention" data-h="' + esc(p.handle) + '"><b>' + esc(p.display_name) + '</b><span class="muted">@' + esc(p.handle) + "</span></a>";
    if (o.focus) {
      return '<article class="post gx focus" ' + attrs + '><div class="fhead">' + avOrb(p, 48) + who + moreBtn + "</div>" +
        (p.reply_to_handle ? '<p class="rto">Replying to <a href="#/u/' + esc(p.reply_to_handle) + '" data-act="mention" data-h="' + esc(p.reply_to_handle) + '">@' + esc(p.reply_to_handle) + "</a></p>" : "") +
        contentHTML(p, o) + '<p class="ftime muted">' + fullTime(p.created_at) + "</p>" +
        '<div class="fstats"><span><b>' + num(p.reorb_count) + "</b> " + (Number(p.reorb_count) === 1 ? "Re-orb" : "Re-orbs") + "</span><span><b>" + num(p.like_count) + "</b> " + (Number(p.like_count) === 1 ? "Like" : "Likes") + "</span><span><b>" + num(p.reply_count) + "</b> " + (Number(p.reply_count) === 1 ? "Reply" : "Replies") + "</span></div>" +
        actsHTML(p, true, pop) + "</article>";
    }
    return '<article class="post gx' + (o.anc ? " anc" : "") + '" ' + attrs + ">" +
      (p.reposted_by_name ? '<div class="rpl">' + ic(I.reorb) + "<span>" + (p.actor_id === S.user.id ? "You" : esc(p.reposted_by_name)) + " re-orbed</span></div>" : "") +
      '<div class="prow2"><div class="pav">' + avOrb(p, 42) + (o.anc ? '<i class="thr"></i>' : "") + '</div><div class="pbody"><div class="phead">' + who + '<span class="muted sep">·</span><time class="muted">' + ago(p.created_at) + "</time>" + moreBtn + "</div>" +
      (p.reply_to_handle && !o.hideRto ? '<p class="rto">Replying to <a href="#/u/' + esc(p.reply_to_handle) + '" data-act="mention" data-h="' + esc(p.reply_to_handle) + '">@' + esc(p.reply_to_handle) + "</a></p>" : "") +
      contentHTML(p, o) + actsHTML(p, false, pop) + "</div></div></article>";
  }
  function listPosts(arr, t, d, o) {
    if (!arr.length) return emptyHTML(t, d);
    return arr.map(function (p) { return postHTML(p, o); }).join("");
  }

  /* ---------- home feed ---------- */
  function renderFeed() {
    ["foryou", "orbiting"].forEach(function (k) { $("#ft-" + k).setAttribute("aria-selected", S.feed === k); });
    var el = $("#feed");
    if (S.homeLoading && !S.lists.home.length) { el.innerHTML = skel(4); return; }
    var h = S.feed === "orbiting"
      ? listPosts(S.lists.home, "Nothing here yet", "Orbit people in Explore and their orbs will show up here.")
      : listPosts(S.lists.home, "No orbs yet", "Be the first. Tap Create to write an orb.");
    if (S.lists.home.length && !S.homeEnd) h += '<div id="feed-more" class="more">Loading more…</div>';
    el.innerHTML = h;
    watchMore("#feed-more", function () { loadHome(true, true); });
  }
  var moreIO = null;
  function watchMore(sel, fn) {
    if (moreIO) { moreIO.disconnect(); moreIO = null; }
    var el = $(sel); if (!el || !window.IntersectionObserver) return;
    moreIO = new IntersectionObserver(function (es) { if (es[0].isIntersecting) fn(); }, { root: $("#content"), rootMargin: "500px" });
    moreIO.observe(el);
  }
  async function loadHome(quiet, more) {
    if (S.homeBusy) return;
    if (quiet && !more && $("#content").scrollTop > 500) return;
    S.homeBusy = true;
    var feed = S.feed;
    if (!quiet && !more) { S.homeLoading = true; renderFeed(); }
    var q = sb.from("orb_timeline").select("*").is("reply_to", null).order("sort_at", { ascending: false }).limit(30);
    if (feed === "orbiting") q = q.in("actor_id", Object.keys(S.following).concat([S.user.id]));
    if (more && S.lists.home.length) q = q.lt("sort_at", S.lists.home[S.lists.home.length - 1].sort_at);
    var r = await q;
    S.homeBusy = false; S.homeLoading = false;
    if (feed !== S.feed) return loadHome(false);
    if (r.error) toast(niceErr(r.error));
    else { var rows = r.data || []; S.lists.home = more ? S.lists.home.concat(rows) : rows; S.homeEnd = rows.length < 30; }
    if (S.view === "home") renderFeed();
  }
  $$("[data-feed]").forEach(function (b) { b.addEventListener("click", function () { S.feed = b.dataset.feed; S.lists.home = []; S.homeEnd = false; S.homeBusy = false; renderFeed(); loadHome(); }); });

  /* ---------- likes, re-orbs, bookmarks ---------- */
  async function toggleOrbRel(table, orb, flag, countKey) {
    var on = !orb[flag], mk = flag === "liked_by_me" ? "like" : flag === "bookmarked_by_me" ? "bookmark" : "";
    eachOrb(orb.id, function (o) { o[flag] = on; if (countKey) o[countKey] += on ? 1 : -1; if (on && mk) o._pop = mk; });
    repaint(orb.id);
    var r = on
      ? await sb.from(table).insert({ user_id: S.user.id, orb_id: orb.id })
      : await sb.from(table).delete().eq("user_id", S.user.id).eq("orb_id", orb.id);
    if (r.error) { eachOrb(orb.id, function (o) { o[flag] = !on; if (countKey) o[countKey] += on ? -1 : 1; }); repaint(orb.id); return toast(niceErr(r.error)); }
    if (table === "bookmarks") {
      toast(on ? "Added to your Bookmarks." : "Removed from Bookmarks.");
      if (!on && S.view === "bookmarks") { S.lists.bookmarks = S.lists.bookmarks.filter(function (x) { return x.id !== orb.id; }); renderBookmarks(); }
    }
    if (table === "reorbs") toast(on ? "Re-orbed." : "Re-orb removed.");
  }
  async function votePoll(p, i) {
    var po = p.poll; if (!po || po.my_vote != null || new Date(po.ends_at) <= new Date()) return;
    eachOrb(p.id, function (o) { o.poll.my_vote = i; o.poll.counts[i] = Number(o.poll.counts[i] || 0) + 1; }); repaint(p.id);
    var r = await sb.from("poll_votes").insert({ orb_id: p.id, user_id: S.user.id, option_idx: i });
    if (r.error) { eachOrb(p.id, function (o) { o.poll.my_vote = null; o.poll.counts[i] = Number(o.poll.counts[i]) - 1; }); repaint(p.id); toast(niceErr(r.error)); }
  }
  async function deleteOrb(orb) {
    var ok = await confirmSheet("Delete this orb?", "This can't be undone. Its likes and replies will go with it.", "Delete", true);
    if (!ok) return;
    var r = await sb.from("orbs").delete().eq("id", orb.id).eq("author_id", S.user.id);
    if (r.error) return toast(niceErr(r.error));
    removeMedia((orb.media || []).map(function (m) { return m.url; }));
    Object.keys(S.lists).forEach(function (k) { S.lists[k] = S.lists[k].filter(function (x) { return x.id !== orb.id; }); });
    if (S.view === "post" && S.post && S.post.id === orb.id) { toast("Orb deleted."); loadMe(); return back(); }
    refreshLists(); loadMe(); toast("Orb deleted.");
  }
  async function reorbMenu(p) {
    var id = await actionSheet([
      { id: "reorb", icon: I.reorb, label: p.reorbed_by_me ? "Undo re-orb" : "Re-orb", sub: p.reorbed_by_me ? "Remove it from your profile" : "Share it with your orbiters" },
      { id: "quote", icon: I.quote, label: "Quote", sub: "Add your own words" }]);
    if (id === "reorb") toggleOrbRel("reorbs", p, "reorbed_by_me", "reorb_count");
    else if (id === "quote") openCompose({ quote: p });
  }
  async function orbMore(p) {
    var own = p.author_id === S.user.id, items = [{ id: "copy", icon: I.link, label: "Copy link" }];
    if (!own) items.push({ id: "orbit", icon: I.user, label: (S.following[p.author_id] ? "Stop orbiting @" : "Orbit @") + p.handle });
    if (own) items.push({ id: "delete", icon: I.trash, label: "Delete orb", danger: true });
    var id = await actionSheet(items);
    if (id === "copy") copyText(link("orb/" + p.id)).then(function (ok) { toast(ok ? "Link copied." : "Could not copy the link."); });
    else if (id === "orbit") toggleOrbit(p.author_id);
    else if (id === "delete") deleteOrb(p);
  }
  async function shareMenu(title, text, path) {
    var items = [{ id: "chat", icon: I.send, label: "Send in chat" }, { id: "copy", icon: I.link, label: "Copy link" }];
    if (navigator.share) items.push({ id: "native", icon: I.share, label: "Share to other apps" });
    var id = await actionSheet(items, title);
    var url = link(path);
    if (id === "chat") sendInChat(url);
    else if (id === "copy") copyText(url).then(function (ok) { toast(ok ? "Link copied." : "Could not copy the link."); });
    else if (id === "native") { try { await navigator.share({ title: "Orbi", text: text || "", url: url }); } catch (e) {} }
  }

  /* ---------- post page: the orb, what it replies to, and its replies ---------- */
  function openPost(id) { go("post", { id: id }); }
  async function loadPost() {
    var id = S.params && S.params.id; if (!id) return back();
    var cached = findOrb(id);
    S.post = { id: id, focus: null, anc: [], replies: [] };
    $("#v-post").innerHTML = cached ? "" : skel(3);
    var r = await sb.from("orb_feed").select("*").eq("id", id).maybeSingle();
    if (S.view !== "post" || !S.params || S.params.id !== id) return;
    if (r.error) { $("#v-post").innerHTML = errHTML(r.error); return; }
    if (!r.data) { $("#v-post").innerHTML = emptyHTML("This orb isn't available", "It may have been deleted."); return; }
    var focus = r.data, anc = [], cur = focus, guard = 0;
    while (cur.reply_to && guard++ < 6) {
      var pr = await sb.from("orb_feed").select("*").eq("id", cur.reply_to).maybeSingle();
      if (!pr.data) break; anc.unshift(pr.data); cur = pr.data;
    }
    var rp = await sb.from("orb_feed").select("*").eq("reply_to", id).order("created_at", { ascending: true }).limit(100);
    if (S.view !== "post" || !S.params || S.params.id !== id) return;
    S.post = { id: id, focus: focus, anc: anc, replies: rp.data || [] };
    S.lists.post = anc.concat([focus], S.post.replies);
    renderPost();
  }
  function renderPost() {
    var P = S.post; if (!P || !P.focus) return;
    var h = P.anc.map(function (a) { return postHTML(a, { anc: true }); }).join("") + postHTML(P.focus, { focus: true }) +
      '<button class="rbar gx" data-act="replyfocus">' + avSelf(36, true) + "<span>Post your reply</span></button>" +
      (P.replies.length ? P.replies.map(function (r) { return postHTML(r, { hideRto: r.reply_to === P.focus.id }); }).join("") : '<p class="muted noreplies gx">No replies yet. Be the first.</p>');
    $("#v-post").innerHTML = h;
  }

  /* ---------- lightbox for photos ---------- */
  function openLightbox(urls, i) {
    var lb = $("#lightbox");
    lb.innerHTML = '<button class="lb-x" data-act="lbclose" aria-label="Close">' + ic(I.close) + '</button><div class="lb-track" id="lb-track">' +
      urls.map(function (u) { return '<div class="lb-s" data-act="lbclose"><img src="' + esc(u) + '" alt=""></div>'; }).join("") + "</div>" +
      (urls.length > 1 ? '<div class="lb-n" id="lb-n">' + (i + 1) + " / " + urls.length + "</div>" : "");
    lb.hidden = false;
    var tr = $("#lb-track"); tr.scrollLeft = tr.clientWidth * i;
    tr.addEventListener("scroll", function () { var n = $("#lb-n"); if (n) n.textContent = Math.round(tr.scrollLeft / tr.clientWidth) + 1 + " / " + urls.length; });
  }
  function closeLightbox() { var lb = $("#lightbox"); lb.hidden = true; lb.innerHTML = ""; }

  /* ---------- autoplay videos while they are on screen ---------- */
  var vidIO = null;
  function watchVideo(v) {
    if (!window.IntersectionObserver) return;
    if (!vidIO) vidIO = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting && e.intersectionRatio > 0.6) { if (!v.dataset.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
        else v.pause();
      });
    }, { root: $("#content"), threshold: [0, 0.6, 1] });
    vidIO.observe(v);
  }
  new MutationObserver(function (ms) {
    ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) { if (n.matches && n.matches("video[data-auto]")) watchVideo(n); $$("video[data-auto]", n).forEach(watchVideo); } }); });
  }).observe($("#content"), { childList: true, subtree: true });

  /* ---------- the Create screen ---------- */
  var C = null;
  function resetComposer() { C = { media: [], sensitive: false, poll: null, quote: null, reply: null, busy: false }; }
  function cmpHasContent() { return !!($("#composer-text").value.trim() || C.media.length || C.poll || C.quote); }
  function openCompose(o) {
    o = o || {};
    resetComposer(); C.reply = o.reply ? { id: o.reply.id, handle: o.reply.handle } : null; C.quote = o.quote || null;
    $("#composer-text").value = "";
    $("#composer-av").innerHTML = avSelf(44, true);
    $("#composer-text").placeholder = C.reply ? "Post your reply" : C.quote ? "Add a comment" : "What's happening in your orbit?";
    $("#composer-post").textContent = C.reply ? "Reply" : "Orb";
    $("#compose").hidden = false; $("#cmp-progress").hidden = true;
    renderCmpAll();
    setTimeout(function () { $("#composer-text").focus(); }, 0);
  }
  function renderCmpAll() { renderCmpCtx(); renderCmpMedia(); renderCmpPoll(); renderCmpQuote(); renderCmpTools(); updateComposer(); }
  function renderCmpCtx() {
    var c = $("#cmp-ctx");
    c.innerHTML = C.reply ? '<div class="replychip">Replying to <b>@' + esc(C.reply.handle) + "</b></div>" : "";
  }
  function renderCmpQuote() {
    var q = $("#cmp-quote");
    q.innerHTML = C.quote ? '<div class="qwrap">' + quoteHTML({ id: C.quote.id, body: C.quote.body, media: C.quote.media, sensitive: C.quote.sensitive, handle: C.quote.handle, display_name: C.quote.display_name, avatar_url: C.quote.avatar_url, created_at: C.quote.created_at }) +
      '<button class="x" data-act="cmpquoteoff" aria-label="Remove quote">' + ic(I.close) + "</button></div>" : "";
  }
  function renderCmpMedia() {
    var el = $("#cmp-media");
    if (!C.media.length) { el.innerHTML = ""; return; }
    el.innerHTML = '<div class="cm n' + C.media.length + '">' + C.media.map(function (m, i) {
      return '<div class="ct">' + (m.type === "video" ? '<video src="' + esc(m.url) + '" muted playsinline preload="metadata"></video><span class="vplay sm">' + ic(I.play) + "</span>" : '<img src="' + esc(m.url) + '" alt="">') +
        '<button class="x" data-act="cmprm" data-i="' + i + '" aria-label="Remove">' + ic(I.close) + "</button></div>";
    }).join("") + "</div>";
  }
  function renderCmpPoll() {
    var el = $("#cmp-poll");
    if (!C.poll) { el.innerHTML = ""; return; }
    var P = C.poll;
    el.innerHTML = '<div class="pe"><div class="pe-h"><b>Poll</b><button class="linkish" data-act="cmppolloff">Remove</button></div>' +
      P.opts.map(function (o, i) { return '<div class="pe-r"><input class="in" data-pi="' + i + '" maxlength="25" placeholder="Choice ' + (i + 1) + '" value="' + esc(o) + '"' + (i > 1 ? "" : "") + ">" + (i > 1 ? '<button class="iconbtn" data-act="cmppolldel" data-i="' + i + '" aria-label="Remove choice">' + ic(I.close) + "</button>" : "") + "</div>"; }).join("") +
      (P.opts.length < 4 ? '<button class="linkish" data-act="cmppolladd">+ Add a choice</button>' : "") +
      '<label class="pe-l">Poll length<select class="in" id="pe-dur"><option value="60">1 hour</option><option value="1440">1 day</option><option value="4320">3 days</option><option value="10080">7 days</option></select></label></div>';
    $("#pe-dur").value = String(P.dur);
  }
  function renderCmpTools() {
    var hasVid = C.media.length && C.media[0].type === "video", full = C.media.length >= 4 || hasVid;
    var n = $("#composer-text").value.length, left = 280 - n, r = 10, circ = 2 * Math.PI * r, frac = Math.min(1, n / 280);
    $("#cmp-tools").innerHTML =
      '<button class="iconbtn" data-act="cmpattach" aria-label="Add photos or video"' + (C.poll || (full && !hasVid && C.media.length >= 4) ? " disabled" : "") + ">" + ic(I.image) + "</button>" +
      '<button class="iconbtn" data-act="cmppoll" aria-label="Add a poll"' + (C.media.length || C.quote || C.reply ? " disabled" : "") + (C.poll ? ' aria-pressed="true"' : "") + ">" + ic(I.poll) + "</button>" +
      '<button class="chip' + (C.sensitive ? " on" : "") + '" data-act="cmpsens" aria-pressed="' + !!C.sensitive + '">' + ic(I.eyeoff) + "Sensitive</button>" +
      '<span class="grow"></span>' +
      (n > 0 ? '<span class="cring' + (left < 0 ? " over" : left <= 20 ? " warn" : "") + '"><svg viewBox="0 0 26 26" aria-hidden="true"><circle class="bg" cx="13" cy="13" r="' + r + '"/><circle class="fg" cx="13" cy="13" r="' + r + '" style="stroke-dasharray:' + (circ * frac).toFixed(1) + " " + circ.toFixed(1) + '"/></svg>' + (left <= 20 ? "<em>" + left + "</em>" : "") + "</span>" : "");
  }
  function composeValid() {
    var t = $("#composer-text").value, n = t.trim().length;
    if (t.length > 280) return false;
    if (C.poll) return n > 0 && C.poll.opts.filter(function (o) { return o.trim(); }).length >= 2;
    return n > 0 || C.media.length > 0 || !!C.quote;
  }
  function updateComposer() { $("#composer-post").disabled = C.busy || !composeValid(); renderCmpTools(); }
  function setCmpProgress(label, frac) {
    var p = $("#cmp-progress"); p.hidden = false; $("span", p).textContent = label; $("i", p).style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + "%";
  }
  function clearCmpMedia() { C.media.forEach(function (m) { try { URL.revokeObjectURL(m.url); } catch (e) {} }); C.media = []; }
  async function cmpAddFiles(files) {
    if (!files.length) return;
    var vids = files.filter(isVideoFile), imgs = files.filter(function (f) { return !isVideoFile(f); });
    try {
      if (vids.length) {
        var f = vids[0], vt = vidType(f);
        if (!vt) throw new Error("Use an MP4 or WebM video.");
        if (f.size > MAX_FILE) throw new Error("That video is over 50 MB. Trim it and try again.");
        var meta = await probeVideo(f);
        if (meta.duration > 140) { URL.revokeObjectURL(meta.url); throw new Error("Videos can be up to 2 minutes 20 seconds."); }
        clearCmpMedia(); C.media = [{ type: "video", blob: f, mime: vt, ext: fileExt(vt, f.name), url: meta.url, w: meta.w, h: meta.h }];
      } else {
        if (C.media.length && C.media[0].type === "video") clearCmpMedia();
        var room = 4 - C.media.length;
        if (imgs.length > room) toast("You can add up to 4 photos.");
        for (var i = 0; i < Math.min(room, imgs.length); i++) {
          var p = await prepImage(imgs[i], { max: 1600 });
          C.media.push({ type: "image", blob: p.blob, mime: p.type, ext: p.ext, url: URL.createObjectURL(p.blob), w: p.w, h: p.h });
        }
      }
      C.poll = null;
    } catch (e) { toast(e.message || niceErr(e)); }
    renderCmpAll();
  }
  async function post() {
    if (C.busy || !composeValid()) return;
    var t = $("#composer-text").value.trim(), uploaded = [], orbId = null;
    C.busy = true; updateComposer();
    try {
      var media = [], total = C.media.length;
      for (var i = 0; i < total; i++) {
        var m = C.media[i];
        setCmpProgress(total > 1 ? "Uploading " + (i + 1) + " of " + total + "…" : "Uploading…", i / total);
        var up = await uploadFile(m.blob, m.ext, m.mime, function (f) { setCmpProgress(total > 1 ? "Uploading " + (i + 1) + " of " + total + "…" : "Uploading…", (i + f) / total); });
        uploaded.push(up.url); media.push({ type: m.type, url: up.url, w: m.w, h: m.h });
      }
      if (total) setCmpProgress("Posting…", 1);
      var r = await sb.from("orbs").insert({ author_id: S.user.id, body: t, reply_to: C.reply ? C.reply.id : null, media: media, sensitive: !!C.sensitive, quote_of: C.quote ? C.quote.id : null }).select("id").single();
      if (r.error) throw r.error;
      orbId = r.data && r.data.id;
      if (C.poll) {
        var opts = C.poll.opts.map(function (o) { return o.trim(); }).filter(Boolean);
        var pr = await sb.from("polls").insert({ orb_id: orbId, options: opts, ends_at: new Date(Date.now() + C.poll.dur * 60000).toISOString() });
        if (pr.error) { await sb.from("orbs").delete().eq("id", orbId); throw pr.error; }
      }
    } catch (e) {
      removeMedia(uploaded); C.busy = false; $("#cmp-progress").hidden = true; updateComposer();
      return toast(niceErr(e));
    }
    var wasReply = !!C.reply, replyTo = C.reply && C.reply.id;
    closeCompose(true);
    toast(wasReply ? "Reply sent." : "Your orb is live.");
    loadMe();
    if (S.view === "home") loadHome(true);
    else if (S.view === "post" && wasReply) loadPost();
    else if (S.view === "profile" || S.view === "user") loadProfileTab(true);
    if (wasReply && replyTo) eachOrb(replyTo, function (o) { o.reply_count += 1; });
  }
  async function closeCompose(force) {
    if (!force && !C.busy && cmpHasContent()) {
      var ok = await confirmSheet("Discard this orb?", "What you wrote won't be saved.", "Discard", true);
      if (!ok) return;
    }
    clearCmpMedia(); $("#compose").hidden = true; $("#composer-text").value = ""; resetComposer(); $("#cmp-progress").hidden = true;
  }
  $("#composer-text").addEventListener("input", updateComposer);
  $("#composer-post").addEventListener("click", post);
  $("#cmp-poll").addEventListener("input", function (e) {
    if (e.target.dataset.pi != null) { C.poll.opts[+e.target.dataset.pi] = e.target.value; updateComposer(); }
    else if (e.target.id === "pe-dur") C.poll.dur = +e.target.value;
  });


  /* ---------- refresh whatever lists are on screen ---------- */
  function refreshLists() {
    if (S.view === "home") renderFeed();
    else if (S.view === "explore") renderExploreBody();
    else if (S.view === "profile" || S.view === "user") { renderProfile(); }
    else if (S.view === "bookmarks") renderBookmarks();
    else if (S.view === "people") renderPeople();
    else if (S.view === "post") renderPost();
  }

  /* ---------- following ---------- */
  function personRow(p, opt) {
    var f = S.following[p.id], own = p.id === S.user.id;
    return '<div class="person" data-act="openuser" data-id="' + p.id + '">' + avProf(p, 48) + '<div class="pi"><b>' + esc(p.display_name) + "</b><span>@" + esc(p.handle) + (p.bio ? " · " + esc(p.bio) : "") + "</span></div>" +
      (own ? "" : '<button class="btn sm' + (f ? " on" : " fill") + '" data-act="orbit" data-id="' + p.id + '" aria-pressed="' + !!f + '">' + (f ? "Orbiting" : "Orbit") + "</button>") + "</div>";
  }
  async function toggleOrbit(id) {
    var on = !S.following[id]; if (on) S.following[id] = true; else delete S.following[id];
    applyFollow(id, on);
    var r = on
      ? await sb.from("orbits").insert({ follower_id: S.user.id, following_id: id })
      : await sb.from("orbits").delete().eq("follower_id", S.user.id).eq("following_id", id);
    if (r.error) { if (on) delete S.following[id]; else S.following[id] = true; applyFollow(id, !on); return toast(niceErr(r.error)); }
    loadMe();
    if (S.view === "home" && S.feed === "orbiting") loadHome(true);
    loadTray();
  }
  function applyFollow(id, on) {
    S.people.forEach(function (p) { if (p.id === id) p.followed_by_me = on; });
    if (S.pf && S.pf.profile && S.pf.profile.id === id) { S.pf.profile.followed_by_me = on; S.pf.profile.orbiter_count = Number(S.pf.profile.orbiter_count) + (on ? 1 : -1); }
    if (S.ppl) S.ppl.rows.forEach(function (p) { if (p.id === id) p.followed_by_me = on; });
    S.reels.list.forEach(function (r) { if (r.author_id === id) r.followed_by_me = on; });
    if (S.view === "reels") renderReelRail(id);
    else refreshLists();
  }

  /* ---------- explore ---------- */
  var PEOPLE_COLS = "id,handle,display_name,bio,avatar_url,has_story,story_unseen";
  async function loadExplore() {
    S.searchQ = $("#search-in").value.trim();
    if (S.searchQ) return runSearch();
    $("#explore-body").innerHTML = skel(3);
    var tok = ++S.searchToken, since = new Date(Date.now() - 7 * 864e5).toISOString();
    var res = await Promise.all([
      sb.from("profile_cards").select(PEOPLE_COLS).neq("id", S.user.id).order("created_at", { ascending: false }).limit(12),
      sb.from("orb_feed").select("*").is("reply_to", null).order("created_at", { ascending: false }).limit(30),
      sb.from("orb_feed").select("body").ilike("body", "%#%").gte("created_at", since).order("created_at", { ascending: false }).limit(200)
    ]);
    if (tok !== S.searchToken) return;
    S.people = res[0].data || []; S.lists.explore = res[1].data || [];
    var c = {};
    (res[2].data || []).forEach(function (r) { (String(r.body).match(/#[\p{L}\p{N}_]{2,40}/gu) || []).forEach(function (t) { t = t.toLowerCase(); c[t] = (c[t] || 0) + 1; }); });
    S.trending = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).slice(0, 6).map(function (t) { return { tag: t, n: c[t] }; });
    renderExploreBody();
  }
  function renderExploreBody() {
    var b = $("#explore-body"), q = S.searchQ, h = "";
    if (!q) {
      if (S.trending.length) h += '<div class="sect">Trending</div><div class="trend">' + S.trending.map(function (t) { return '<button class="trow2" data-act="tag" data-tag="' + esc(t.tag.slice(1)) + '"><b>' + esc(t.tag) + "</b><small>" + t.n + (t.n === 1 ? " orb" : " orbs") + "</small></button>"; }).join("") + "</div>";
      h += '<div class="sect">People to orbit</div>' + (S.people.length ? S.people.map(personRow).join("") : '<p class="muted">No one else has joined yet. Invite a friend to be first in your orbit.</p>');
      h += '<div class="sect">Latest orbs</div>' + (S.lists.explore.length ? '<div class="flush">' + S.lists.explore.map(function (p) { return postHTML(p); }).join("") + "</div>" : '<p class="muted">No orbs yet.</p>');
    } else {
      h += '<div class="sect">People</div>' + (S.people.length ? S.people.map(personRow).join("") : '<p class="muted">No people match "' + esc(q) + '".</p>');
      h += '<div class="sect">Orbs</div>' + (S.lists.explore.length ? '<div class="flush">' + S.lists.explore.map(function (p) { return postHTML(p); }).join("") + "</div>" : '<p class="muted">No orbs match "' + esc(q) + '".</p>');
    }
    b.innerHTML = h;
  }
  async function runSearch() {
    var raw = S.searchQ.replace(/^@/, ""), q = raw.replace(/[^\p{L}\p{N} _.#-]/gu, "").trim(), tok = ++S.searchToken;
    if (!q) { S.people = []; S.lists.explore = []; return renderExploreBody(); }
    var like = "%" + q.replace(/%/g, "") + "%", plike = "%" + q.replace(/^#/, "").replace(/%/g, "") + "%";
    var res = await Promise.all([
      sb.from("profile_cards").select(PEOPLE_COLS).or("handle.ilike." + plike + ",display_name.ilike." + plike).limit(15),
      sb.from("orb_feed").select("*").ilike("body", like).order("created_at", { ascending: false }).limit(30)
    ]);
    if (tok !== S.searchToken) return;
    S.people = res[0].data || []; S.lists.explore = res[1].data || [];
    renderExploreBody();
  }
  var searchTimer;
  $("#search-in").addEventListener("input", function (e) {
    S.searchQ = e.target.value.trim(); clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { S.searchQ ? runSearch() : loadExplore(); }, 280);
  });
  function searchTag(tag) {
    S.hist = []; show("explore"); $("#search-in").value = "#" + tag; S.searchQ = "#" + tag; runSearch();
  }

  /* ---------- alerts ---------- */
  var NOTE_ICON = { orbit: I.user, like: I.heart, reorb: I.reorb, reply: I.reply, mention: I.user, quote: I.quote, reel_like: I.heart, reel_comment: I.reply, reel_reorb: I.reorb };
  var NOTE_TEXT = { orbit: "started orbiting you", like: "liked your orb", reorb: "re-orbed your orb", reply: "replied to your orb", mention: "mentioned you in an orb", quote: "quoted your orb", reel_like: "liked your reel", reel_comment: "commented on your reel", reel_reorb: "re-orbed your reel" };
  async function loadAlerts() {
    var el = $("#alerts-list"); el.innerHTML = skel(4);
    var r = await sb.from("notifications").select("id,type,orb_id,reel_id,read,created_at,actor:profiles!actor_id(id,handle,display_name,avatar_url)").order("created_at", { ascending: false }).limit(50);
    if (r.error) { el.innerHTML = errHTML(r.error); return; }
    var rows = r.data || [];
    el.innerHTML = rows.length ? rows.map(function (n) {
      var a = n.actor || {}, who = a.display_name || "Someone";
      return '<button class="note-row gx' + (n.read ? "" : " unread") + '" data-act="note" data-type="' + esc(n.type) + '" data-orb="' + esc(n.orb_id || "") + '" data-reel="' + esc(n.reel_id || "") + '" data-uid="' + esc(a.id || "") + '">' +
        '<span class="note-av">' + avInner(who, a.avatar_url, 42) + '<span class="note-ic">' + ic(NOTE_ICON[n.type] || I.bell) + '</span></span><div class="nt"><p><b>' + esc(who) + "</b> " + (NOTE_TEXT[n.type] || "sent you an alert") + "</p><small>" + ago(n.created_at) + "</small></div></button>";
    }).join("") : emptyHTML("No alerts yet", "When someone orbits you or likes an orb, you will see it here.");
    if (rows.some(function (n) { return !n.read; })) {
      sb.from("notifications").update({ read: true }).eq("user_id", S.user.id).eq("read", false).then(function () { S.unread = 0; renderTabbar(); });
    }
  }

  /* ---------- profiles (yours and everyone else's) ---------- */
  function newPf(id, handle) { return { id: id || null, handle: handle || null, profile: null, tab: "orbs", lists: {}, missing: false }; }
  function pfEl() { return $(S.view === "user" ? "#v-user" : "#v-profile"); }
  function openUser(id) { if (id === S.user.id) { if (S.view !== "profile") tabTo("profile"); return; } go("user", { id: id }); }
  function openUserByHandle(h) {
    h = String(h || "").toLowerCase();
    if (S.profile && S.profile.handle === h) { if (S.view !== "profile") tabTo("profile"); return; }
    go("user", { handle: h });
  }
  function openOwnProfile() {
    if (!S.pf || S.pf.id !== S.user.id) S.pf = newPf(S.user.id);
    if (S.me && S.me.handle) S.pf.profile = S.me;
    renderProfile(); loadProfileHeader();
  }
  function loadUserView() {
    var p = S.params || {};
    S.pf = newPf(p.id, p.handle);
    $("#v-user").innerHTML = '<div class="banner"></div>' + skel(3);
    loadProfileHeader();
  }
  async function loadProfileHeader() {
    var P = S.pf, q = sb.from("profile_cards").select("*");
    q = P.id ? q.eq("id", P.id) : q.eq("handle", P.handle);
    var r = await q.maybeSingle();
    if (S.pf !== P) return;
    if (!r.data) { P.missing = true; renderProfile(); return; }
    P.profile = r.data; P.id = r.data.id;
    if (P.id === S.user.id) S.me = r.data;
    if (S.view === "user") renderTop();
    renderProfile(); loadProfileTab(!!P.lists[P.tab]);
  }
  function pfTabs(own) {
    var t = [["orbs", "Orbs"], ["replies", "Replies"], ["media", "Media"], ["reels", "Reels"]];
    if (own) t.push(["likes", "Likes"]);
    return t;
  }
  function profileHeaderHTML(P) {
    var u = P.profile, own = u.id === S.user.id;
    var joined = new Date(u.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    var site = u.website ? u.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
    return '<div class="banner"' + (u.banner_url ? ' data-act="viewbanner"' : "") + ">" + (u.banner_url ? '<img src="' + esc(u.banner_url) + '" alt="">' : "") + "</div>" +
      '<div class="gx pinfo"><div class="prow">' + avProf(u, 84, own ? { add: true } : {}) +
      '<div class="btns">' + (own
        ? '<button class="iconbtn bord" data-act="settings" aria-label="Settings">' + ic(I.gear) + '</button><button class="btn" data-act="edit">Edit profile</button>'
        : '<button class="iconbtn bord" data-act="messageuser" aria-label="Message ' + esc(u.display_name) + '">' + ic(I.chat) + '</button><button class="btn' + (u.followed_by_me ? " on" : " fill") + '" data-act="orbit" data-id="' + u.id + '" aria-pressed="' + !!u.followed_by_me + '">' + (u.followed_by_me ? "Orbiting" : "Orbit") + "</button>") + "</div></div>" +
      '<h2 class="pname">' + esc(u.display_name) + '</h2><div class="phandle muted">@' + esc(u.handle) + (!own && u.follows_me ? '<span class="tag">Orbits you</span>' : "") + "</div>" +
      (u.bio ? '<p class="pbio">' + linkify(u.bio) + "</p>" : own ? '<p class="pbio muted">Add a bio so people know who you are.</p>' : "") +
      '<div class="pmeta2">' + (u.location ? "<span>" + ic(I.mapPin) + esc(u.location) + "</span>" : "") +
      (site ? '<span>' + ic(I.link) + '<a href="' + esc(u.website) + '" target="_blank" rel="noopener noreferrer nofollow" data-act="link">' + esc(site) + "</a></span>" : "") +
      "<span>" + ic(I.calendar) + "Joined " + esc(joined) + "</span></div>" +
      '<div class="stats"><button data-act="people" data-t="orbiting"><b>' + num(u.orbiting_count) + '</b> Orbiting</button><button data-act="people" data-t="orbiters"><b>' + num(u.orbiter_count) + "</b> Orbiters</button></div></div>" +
      '<div class="ptabs" role="tablist">' + pfTabs(own).map(function (t) { return '<button role="tab" data-act="ptab" data-t="' + t[0] + '" aria-selected="' + (P.tab === t[0]) + '">' + t[1] + "</button>"; }).join("") + '</div><div id="pf-body"></div>';
  }
  function renderProfile() {
    var P = S.pf, el = pfEl(); if (!P || !el) return;
    if (P.missing) { el.innerHTML = emptyHTML("This account doesn't exist", "Check the handle and try again."); return; }
    if (!P.profile) { el.innerHTML = '<div class="banner"></div>' + skel(3); return; }
    var keep = el.querySelector(".ptabs") ? $("#content").scrollTop : 0;
    el.innerHTML = profileHeaderHTML(P); renderProfileBody();
    if (keep) $("#content").scrollTop = keep;
  }
  function gridTile(r, kind, i) {
    if (kind === "reel") {
      return '<button class="gt" data-act="reelgrid" data-i="' + i + '" aria-label="Play reel">' + (r.poster_url ? '<img src="' + esc(r.poster_url) + '" alt="" loading="lazy">' : '<video src="' + esc(r.video_url) + '#t=0.5" muted playsinline preload="metadata"></video>') +
        '<span class="gmeta">' + ic(I.play) + num(r.like_count) + "</span>" + (r.reposted_by_name ? '<span class="gre">' + ic(I.reorb) + "</span>" : "") + "</button>";
    }
    var m = r.media[0];
    return '<button class="gt" data-act="openpost" data-id="' + r.id + '" aria-label="Open orb">' + (m.type === "video" ? '<video src="' + esc(m.url) + '#t=0.5" muted playsinline preload="metadata"></video><span class="gmeta">' + ic(I.play) + "</span>" : '<img src="' + esc(m.url) + '" alt="" loading="lazy">') +
      (r.media.length > 1 ? '<span class="gmulti">' + ic(I.image) + "</span>" : "") + "</button>";
  }
  function renderProfileBody() {
    var P = S.pf, b = $("#pf-body", pfEl()); if (!P || !b) return;
    var rows = P.lists[P.tab], own = P.id === S.user.id;
    if (!rows) { b.innerHTML = skel(3); return; }
    if (P.tab === "reels") {
      b.innerHTML = rows.length ? '<div class="grid rg">' + rows.map(function (r, i) { return gridTile(r, "reel", i); }).join("") + "</div>" : emptyHTML("No reels yet", own ? "Tap Reels, then the camera, to share your first one." : "When they share a reel, it will show up here.");
    } else if (P.tab === "media") {
      b.innerHTML = rows.length ? '<div class="grid">' + rows.map(function (r, i) { return gridTile(r, "orb", i); }).join("") + "</div>" : emptyHTML("No photos or videos", "Photos and videos will show up here.");
    } else {
      var t = { orbs: ["No orbs yet", own ? "Your orbs will show up here once you post." : "Their orbs will show up here."], replies: ["No replies yet", "Replies will show up here."], likes: ["No likes yet", "Orbs you like will show up here."] }[P.tab];
      b.innerHTML = listPosts(rows, t[0], t[1]);
    }
  }
  async function loadProfileTab(quiet) {
    var P = S.pf; if (!P || !P.id) return;
    var tab = P.tab, id = P.id;
    if (!quiet || !P.lists[tab]) { P.lists[tab] = null; syncProfileLists(); renderProfileBody(); }
    var r, f = sb;
    if (tab === "orbs") r = await f.from("orb_timeline").select("*").eq("actor_id", id).is("reply_to", null).order("sort_at", { ascending: false }).limit(40);
    else if (tab === "replies") r = await f.from("orb_feed").select("*").eq("author_id", id).not("reply_to", "is", null).order("created_at", { ascending: false }).limit(40);
    else if (tab === "media") r = await f.from("orb_feed").select("*").eq("author_id", id).eq("has_media", true).order("created_at", { ascending: false }).limit(60);
    else if (tab === "reels") r = await f.from("reel_timeline").select("*").eq("actor_id", id).order("sort_at", { ascending: false }).limit(60);
    else {
      var l = await f.from("likes").select("orb_id,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(40);
      var ids = (l.data || []).map(function (x) { return x.orb_id; });
      if (l.error) r = l;
      else if (!ids.length) r = { data: [] };
      else { r = await f.from("orb_feed").select("*").in("id", ids); if (r.data) r.data.sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); }); }
    }
    if (S.pf !== P || P.tab !== tab) return;
    if (r.error) { var b = $("#pf-body", pfEl()); if (b) b.innerHTML = errHTML(r.error); return; }
    P.lists[tab] = r.data || [];
    syncProfileLists(); renderProfileBody();
  }
  function syncProfileLists() {
    var P = S.pf; S.lists.profile = P && P.tab !== "reels" && P.lists[P.tab] ? P.lists[P.tab] : [];
  }
  async function saveProfileRow(vals) {
    var r = await sb.from("profiles").update(vals).eq("id", S.user.id).select().single();
    if (r.error) throw r.error;
    return r.data;
  }

  /* ---------- edit profile ---------- */
  var E = null;
  function openEditProfile() {
    var u = S.profile;
    E = { name: u.display_name, bio: u.bio || "", location: u.location || "", website: u.website || "", avatar: null, banner: null, busy: false };
    var m = $("#modal"); m.className = "modal light"; m.hidden = false;
    m.innerHTML = '<div class="compose-top gx"><button class="btn" data-act="modalclose">Cancel</button><b class="mtitle">Edit profile</b><button class="btn fill" data-act="saveprofile" id="ep-save">Save</button></div>' +
      '<div class="mscroll"><div class="ep-banner" data-act="pickbanner" role="button" tabindex="0" aria-label="Change banner photo" id="ep-banner">' + (u.banner_url ? '<img src="' + esc(u.banner_url) + '" alt="">' : "") + '<span class="ep-cam">' + ic(I.camera) + "</span></div>" +
      '<div class="gx ep-av"><div class="ep-avbtn" data-act="pickavatar" role="button" tabindex="0" aria-label="Change profile photo" id="ep-avatar">' + avInner(u.display_name, u.avatar_url, 84) + '<span class="ep-cam">' + ic(I.camera) + "</span></div></div>" +
      '<div class="gx ep-form"><label for="e-name">Name</label><input class="in" id="e-name" value="' + esc(u.display_name) + '" maxlength="40">' +
      '<label for="e-bio">Bio</label><textarea class="in" id="e-bio" maxlength="160" rows="3">' + esc(u.bio || "") + "</textarea>" +
      '<label for="e-loc">Location</label><input class="in" id="e-loc" value="' + esc(u.location || "") + '" maxlength="30" placeholder="Lagos, Nigeria">' +
      '<label for="e-web">Website</label><input class="in" id="e-web" value="' + esc(u.website || "") + '" maxlength="100" placeholder="yoursite.com" inputmode="url" autocapitalize="none"></div></div>';
  }
  function closeModal() { var m = $("#modal"); m.hidden = true; m.innerHTML = ""; E = null; }
  async function pickProfileImage(kind) {
    var f = (await pickFiles("image/*", false))[0]; if (!f) return;
    try {
      var p = await prepImage(f, kind === "avatar" ? { ratio: 1, max: 512 } : { ratio: 3, max: 1500 });
      E[kind] = p;
      var url = URL.createObjectURL(p.blob);
      if (kind === "avatar") $("#ep-avatar").innerHTML = '<span class="av" style="--s:84px"><img src="' + url + '" alt=""></span><span class="ep-cam">' + ic(I.camera) + "</span>";
      else $("#ep-banner").innerHTML = '<img src="' + url + '" alt=""><span class="ep-cam">' + ic(I.camera) + "</span>";
    } catch (e) { toast(e.message || niceErr(e)); }
  }
  async function saveEditProfile() {
    if (!E || E.busy) return;
    var name = $("#e-name").value.trim(), bio = $("#e-bio").value.trim(), loc = $("#e-loc").value.trim(), web = $("#e-web").value.trim();
    if (!name) return toast("Your name can't be empty.");
    if (web) {
      if (!/^https?:\/\//i.test(web)) web = "https://" + web;
      try { var u = new URL(web); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw 0; web = u.href.replace(/\/$/, ""); } catch (e) { return toast("That website address doesn't look right."); }
      if (web.length > 100) return toast("The website address is too long.");
    }
    E.busy = true; var btn = $("#ep-save"); btn.disabled = true; btn.textContent = "Saving…";
    var old = [], vals = { display_name: name, bio: bio, location: loc, website: web };
    try {
      if (E.avatar) { var a = await uploadFile(E.avatar.blob, E.avatar.ext, E.avatar.type); vals.avatar_url = a.url; old.push(S.profile.avatar_url); }
      if (E.banner) { var b = await uploadFile(E.banner.blob, E.banner.ext, E.banner.type); vals.banner_url = b.url; old.push(S.profile.banner_url); }
      S.profile = await saveProfileRow(vals);
      removeMedia(old);
    } catch (e) { E.busy = false; btn.disabled = false; btn.textContent = "Save"; return toast(niceErr(e)); }
    closeModal(); renderTop(); await loadMe();
    if (S.view === "profile") { S.pf = null; openOwnProfile(); }
    toast("Profile saved.");
  }

  /* ---------- followers and following ---------- */
  function openPeople(uid, name, tab) { go("people", { uid: uid, name: name, tab: tab }); }
  async function loadPeople() {
    var p = S.params || {}; S.ppl = { uid: p.uid, name: p.name, tab: p.tab || "orbiters", rows: null };
    renderPeople(); renderTop();
    var tab = S.ppl.tab, me = S.ppl;
    var col = tab === "orbiters" ? "following_id" : "follower_id", other = tab === "orbiters" ? "follower_id" : "following_id";
    var r = await sb.from("orbits").select(other).eq(col, me.uid).order("created_at", { ascending: false }).limit(100);
    var ids = (r.data || []).map(function (x) { return x[other]; });
    var rows = [];
    if (ids.length) { var pr = await sb.from("profile_cards").select(PEOPLE_COLS + ",followed_by_me").in("id", ids); rows = pr.data || []; }
    if (S.ppl !== me || S.ppl.tab !== tab) return;
    me.rows = rows; renderPeople();
  }
  function renderPeople() {
    var P = S.ppl; if (!P) return;
    $("#v-people").innerHTML = '<div class="tabs2"><button role="tab" data-act="peopletab" data-t="orbiters" aria-selected="' + (P.tab === "orbiters") + '">Orbiters</button><button role="tab" data-act="peopletab" data-t="orbiting" aria-selected="' + (P.tab === "orbiting") + '">Orbiting</button></div><div class="pad gx">' +
      (!P.rows ? skel(3) : P.rows.length ? P.rows.map(personRow).join("") : emptyHTML(P.tab === "orbiters" ? "No orbiters yet" : "Not orbiting anyone yet", "People will show up here.")) + "</div>";
  }

  /* ---------- bookmarks ---------- */
  async function loadBookmarks() {
    var tab = S.bm.tab; renderBookmarks();
    if (tab === "orbs") {
      var r = await sb.from("bookmarks").select("orb_id,created_at").eq("user_id", S.user.id).order("created_at", { ascending: false }).limit(50);
      var ids = (r.data || []).map(function (x) { return x.orb_id; }), rows = [];
      if (ids.length) { var o = await sb.from("orb_feed").select("*").in("id", ids); rows = (o.data || []).sort(function (a, b) { return ids.indexOf(a.id) - ids.indexOf(b.id); }); }
      if (S.view !== "bookmarks" || S.bm.tab !== tab) return;
      S.lists.bookmarks = rows; S.bm.loaded = true;
    } else {
      var rr = await sb.from("reel_saves").select("reel_id,created_at").eq("user_id", S.user.id).order("created_at", { ascending: false }).limit(60);
      var rids = (rr.data || []).map(function (x) { return x.reel_id; }), rl = [];
      if (rids.length) { var q = await sb.from("reel_feed").select("*").in("id", rids); rl = (q.data || []).sort(function (a, b) { return rids.indexOf(a.id) - rids.indexOf(b.id); }); }
      if (S.view !== "bookmarks" || S.bm.tab !== tab) return;
      S.bm.reels = rl; S.bm.loaded = true;
    }
    renderBookmarks();
  }
  function renderBookmarks() {
    var tab = S.bm.tab, h = '<div class="tabs2"><button role="tab" data-act="bmtab" data-t="orbs" aria-selected="' + (tab === "orbs") + '">Orbs</button><button role="tab" data-act="bmtab" data-t="reels" aria-selected="' + (tab === "reels") + '">Reels</button></div>';
    if (!S.bm.loaded) h += skel(3);
    else if (tab === "orbs") h += listPosts(S.lists.bookmarks, "Nothing saved yet", "Tap the bookmark on any orb to keep it here.");
    else h += S.bm.reels.length ? '<div class="grid rg">' + S.bm.reels.map(function (r, i) { return gridTile(r, "reel", i); }).join("") + "</div>" : emptyHTML("No saved reels", "Tap the bookmark on a reel to keep it here.");
    $("#v-bookmarks").innerHTML = h;
  }

  /* ---------- avatar menu (side drawer) ---------- */
  var MENU = [["profile", "Profile", I.user], ["bookmarks", "Bookmarks", I.bookmark], ["soon:Premium", "Premium", I.star], ["soon:Communities", "Communities", I.people], ["soon:Lists", "Lists", I.list]];
  function renderDrawer() {
    var u = S.profile, c = S.me || {};
    $("#drawer-panel").innerHTML =
      '<button class="dhead" data-act="drawergo" data-go="profile" aria-label="Open your profile">' + avInner(u.display_name, u.avatar_url, 52) +
      '<b>' + esc(u.display_name) + '</b><span class="muted">@' + esc(u.handle) + "</span></button>" +
      '<div class="dstats"><span><b>' + num(c.orbiting_count) + "</b> Orbiting</span><span><b>" + num(c.orbiter_count) + "</b> Orbiters</span></div>" +
      '<div class="dsep"></div>' +
      MENU.map(function (m) { return '<button class="ditem" data-act="drawergo" data-go="' + m[0] + '">' + ic(m[2]) + "<span>" + m[1] + "</span></button>"; }).join("") +
      '<div class="dsep"></div>' +
      '<button class="ditem small" data-act="drawergo" data-go="settings">' + ic(I.gear) + "<span>Settings and privacy</span></button>";
  }
  async function openDrawer() {
    renderDrawer(); $("#drawer").hidden = false;
    var b = $("#drawer-panel .dhead"); if (b) b.focus();
    await loadMe();
    if (!$("#drawer").hidden) renderDrawer();
  }
  function closeDrawer() { var d = $("#drawer"); if (d) d.hidden = true; }
  function drawerGo(go_) {
    closeDrawer();
    if (go_.indexOf("soon:") === 0) { S.soonTitle = go_.slice(5); go("soon"); }
    else if (go_ === "profile") tabTo("profile");
    else if (go_ === "bookmarks") { S.bm.loaded = false; go("bookmarks"); }
    else go(go_);
  }
  function renderSoon() {
    $("#v-soon").innerHTML = '<div class="empty gx"><b>' + esc(S.soonTitle) + " is coming soon</b>We are still building this. It will show up here when it is ready.</div>";
  }


  /* ---------- stories ---------- */
  var STORY_BG = [
    "linear-gradient(160deg,#ff9a3c,#e0360b)", "linear-gradient(160deg,#ffb347,#ff5e62)", "linear-gradient(160deg,#2b2540,#8f7ab5)", "linear-gradient(160deg,#0f2027,#2c5364)",
    "linear-gradient(160deg,#42275a,#b4527a)", "linear-gradient(160deg,#134e5e,#71b280)", "linear-gradient(160deg,#8e1b2d,#ef473a)", "linear-gradient(160deg,#171717,#4a4a4a)"
  ];
  var STORY_COLS = "id,author_id,kind,media_url,caption,bg,reel_id,created_at,expires_at,author:profiles!author_id(handle,display_name,avatar_url)";
  function groupStories(rows, seen) {
    var m = {}, order = [], now = Date.now();
    rows.forEach(function (s) {
      if (new Date(s.expires_at).getTime() <= now) return;
      var a = s.author || {}, u = m[s.author_id];
      if (!u) { u = m[s.author_id] = { uid: s.author_id, name: a.display_name, handle: a.handle, avatar: a.avatar_url, items: [], latest: s.created_at }; order.push(u); }
      s.seen = !!seen[s.id]; u.items.push(s); u.latest = s.created_at;
    });
    order.forEach(function (u) { u.unseen = u.items.some(function (s) { return !s.seen; }); });
    return order;
  }
  async function attachReels(users) {
    var ids = [];
    users.forEach(function (u) { u.items.forEach(function (s) { if (s.reel_id && ids.indexOf(s.reel_id) < 0) ids.push(s.reel_id); }); });
    if (!ids.length) return;
    var r = await sb.from("reel_feed").select("id,handle,display_name,video_url,poster_url,author_id,audio_track,audio_url,audio_title,audio_artist,audio_start,audio_vol,video_vol").in("id", ids), by = {};
    (r.data || []).forEach(function (x) { by[x.id] = x; });
    users.forEach(function (u) { u.items.forEach(function (s) { if (s.reel_id) s.reel = by[s.reel_id] || null; }); });
  }
  async function loadTray() {
    if (!S.user) return;
    var cut = new Date(Date.now() - 26 * 3600e3).toISOString();
    var res = await Promise.all([
      sb.from("stories").select(STORY_COLS).order("created_at", { ascending: true }).limit(300),
      sb.from("story_views").select("story_id").eq("viewer_id", S.user.id).gte("created_at", cut).limit(1000)
    ]);
    if (res[0].error || !S.user) return;
    var seen = {}; (res[1].data || []).forEach(function (v) { seen[v.story_id] = true; });
    var rows = (res[0].data || []).filter(function (s) { return s.author_id === S.user.id || S.following[s.author_id]; });
    var users = groupStories(rows, seen);
    await attachReels(users);
    S.tray = users; S.trayLoaded = true;
    users.forEach(function (u) { setStoryFlags(u.uid, true, u.unseen, true); });
    if (S.view === "home") renderTray();
  }
  function renderTray() {
    var el = $("#tray"); if (!el) return;
    var mine = null, others = [];
    S.tray.forEach(function (u) { if (u.uid === S.user.id) mine = u; else others.push(u); });
    others.sort(function (a, b) { return (b.unseen - a.unseen) || (new Date(b.latest) - new Date(a.latest)); });
    function bubble(u, isMe) {
      var name = isMe ? "Your story" : (u.name || "").split(" ")[0], st = u && u.items.length ? (u.unseen ? 2 : 1) : 0;
      var nm = isMe ? S.profile.display_name : u.name, url = isMe ? S.profile.avatar_url : u.avatar;
      return '<button class="tb" data-act="' + (isMe && !st ? "addstory" : "traystory") + '" data-uid="' + esc(isMe ? S.user.id : u.uid) + '" aria-label="' + (isMe ? (st ? "View your story" : "Add to your story") : "Play story from " + esc(u.name)) + '">' +
        '<span class="avw st' + st + '" style="--s:58px">' + avInner(nm, url, 58) + "</span>" + (isMe ? '<span class="avadd" data-act="addstory" aria-label="Add to your story">' + ic(I.plus) + "</span>" : "") + '<span class="tn">' + esc(name) + "</span></button>";
    }
    el.innerHTML = bubble(mine, true) + others.map(function (u) { return bubble(u, false); }).join("");
  }
  /* keep the ring state of the same person consistent everywhere on screen */
  function setStoryFlags(uid, has, unseen, silent) {
    function fix(o, idKey) { if (o && o[idKey] === uid) { o.has_story = has; o.story_unseen = has && unseen; } }
    Object.keys(S.lists).forEach(function (k) { S.lists[k].forEach(function (o) { fix(o, "author_id"); if (o.quoted) fix(o.quoted, "author_id"); }); });
    S.people.forEach(function (p) { fix(p, "id"); });
    if (S.ppl && S.ppl.rows) S.ppl.rows.forEach(function (p) { fix(p, "id"); });
    S.reels.list.forEach(function (r) { fix(r, "author_id"); });
    if (S.pf && S.pf.profile) fix(S.pf.profile, "id");
    if (S.me) fix(S.me, "id");
    if (!silent) { refreshLists(); if (S.view === "reels") renderReelRail(uid); }
  }

  /* ---------- the story viewer ---------- */
  var SV = null;
  function stopStory(silent) {
    if (SV && SV.raf) cancelAnimationFrame(SV.raf);
    if (SV && SV.video) { try { SV.video.pause(); } catch (e) {} }
    RS.stop();
    if (SV) { SV.closed = true; }
    var el = $("#story"); if (el) { el.hidden = true; if (!silent) el.innerHTML = ""; else el.innerHTML = ""; }
  }
  async function openUserStory(uid, onEnd) {
    var cut = new Date(Date.now() - 26 * 3600e3).toISOString();
    var res = await Promise.all([
      sb.from("stories").select(STORY_COLS).eq("author_id", uid).order("created_at", { ascending: true }).limit(60),
      sb.from("story_views").select("story_id").eq("viewer_id", S.user.id).gte("created_at", cut).limit(1000)
    ]);
    var seen = {}; (res[1].data || []).forEach(function (v) { seen[v.story_id] = true; });
    var users = groupStories(res[0].data || [], seen);
    if (!users.length) { setStoryFlags(uid, false, false); return onEnd ? onEnd() : openUser(uid); }
    await attachReels(users);
    openStoryViewer(users, 0, onEnd);
  }
  function openTrayStory(uid) {
    var order = [], mine = null, others = [];
    S.tray.forEach(function (u) { if (u.uid === S.user.id) mine = u; else others.push(u); });
    others.sort(function (a, b) { return (b.unseen - a.unseen) || (new Date(b.latest) - new Date(a.latest)); });
    order = (mine ? [mine] : []).concat(others);
    var i = 0; order.forEach(function (u, k) { if (u.uid === uid) i = k; });
    if (!order.length) return;
    openStoryViewer(order, i, null);
  }
  function firstUnseen(u) { for (var i = 0; i < u.items.length; i++) if (!u.items[i].seen) return i; return 0; }
  function openStoryViewer(users, ui, after) {
    pauseReels();
    SV = { users: users, ui: ui, ii: firstUnseen(users[ui]), after: after || null, paused: false, held: false, touched: {}, closed: false };
    $("#story").hidden = false;
    showStoryItem();
  }
  function curStory() { var u = SV.users[SV.ui]; return { u: u, s: u.items[SV.ii], own: u.uid === S.user.id }; }
  function showStoryItem() {
    if (SV.raf) cancelAnimationFrame(SV.raf);
    if (SV.video) { try { SV.video.pause(); } catch (e) {} }
    RS.stop();
    var c = curStory(), u = c.u, s = c.s, el = $("#story");
    SV.video = null; SV.elapsed = 0; SV.dur = 5000; SV.ready = false; SV.paused = false; SV.held = false;
    var bars = u.items.map(function (x, i) { return '<i class="' + (i < SV.ii ? "done" : "") + '"><b></b></i>'; }).join("");
    var media = "";
    if (s.kind === "text") media = '<div class="sv-text" style="background:' + STORY_BG[s.bg % STORY_BG.length] + '"><p>' + esc(s.caption) + "</p></div>";
    else if (s.kind === "image") media = '<img class="sv-img" id="sv-img" src="' + esc(s.media_url) + '" alt="">';
    else media = '<video class="sv-vid" id="sv-vid" src="' + esc(s.media_url) + '" playsinline></video>';
    var reelChip = s.reel_id && s.reel ? '<button class="sv-reel" data-act="svreel">' + ic(I.reels) + "Reel by @" + esc(s.reel.handle) + "</button>" : "";
    var foot = c.own
      ? '<button class="sv-views" data-act="svviews" id="sv-views">' + ic(I.eye) + '<span id="sv-vc">…</span></button><button class="sv-del" data-act="svdelete" aria-label="Delete story">' + ic(I.trash) + "</button>"
      : '<form class="sv-reply" id="sv-reply" autocomplete="off"><input id="sv-in" maxlength="300" placeholder="Send message to ' + esc((u.name || "").split(" ")[0]) + '"><button type="submit" class="iconbtn" aria-label="Send">' + ic(I.send) + "</button></form>";
    el.innerHTML = '<div class="sv-stage" id="sv-stage">' + media + '<div class="sv-shade"></div></div>' +
      '<div class="sv-bars">' + bars + "</div>" +
      '<div class="sv-head"><button class="sv-who" data-act="svprofile">' + avInner(u.name, u.avatar, 36) + "<b>" + esc(u.name || "") + "</b><span>" + ago(s.created_at) + '</span></button><span class="grow"></span><button class="iconbtn" data-act="svclose" aria-label="Close story">' + ic(I.close) + "</button></div>" +
      (s.kind !== "text" && s.caption ? '<p class="sv-cap">' + esc(s.caption) + "</p>" : "") + reelChip + '<div class="sv-foot">' + foot + "</div>";
    SV.bar = $$(".sv-bars i", el)[SV.ii] && $$(".sv-bars i", el)[SV.ii].firstChild;
    if (s.kind === "image") {
      var im = $("#sv-img"), me_ = SV;
      var imgGo = function () { if (SV !== me_ || SV.ready) return; SV.ready = true; if (im.naturalWidth && im.naturalHeight / im.naturalWidth > 1.15) im.style.objectFit = "cover"; beginStoryTimer(); };
      im.onload = imgGo; im.onerror = imgGo; if (im.complete && im.naturalWidth) imgGo();
    } else if (s.kind === "video") {
      var v = $("#sv-vid"); SV.video = v;
      v.onloadedmetadata = function () { SV.ready = true; if (v.videoWidth && v.videoHeight / v.videoWidth > 1.15) v.style.objectFit = "cover"; if (isFinite(v.duration) && v.duration > 0) SV.dur = v.duration * 1000; };
      v.onerror = function () { SV.ready = true; SV.dur = 1500; };
      v.muted = false;
      var ssnd = s.reel ? soundOf(s.reel) : null;
      if (ssnd) RS.set(v, soundParams(ssnd), false);
      var p = v.play(); if (p && p.catch) p.catch(function () { v.muted = true; RS.mute(true); v.play().catch(function () {}); });
      beginStoryTimer();
    } else { SV.ready = true; beginStoryTimer(); }
    if (!c.own) logStoryView(s, u);
    else loadStoryViews(s);
  }
  function beginStoryTimer() {
    if (SV.raf) cancelAnimationFrame(SV.raf);
    SV.last = performance.now();
    SV.raf = requestAnimationFrame(storyTick);
  }
  function storyTick(now) {
    if (!SV || SV.closed) return;
    var dt = now - SV.last; SV.last = now;
    if (!SV.paused && SV.ready) {
      if (SV.video && SV.video.duration > 0 && isFinite(SV.video.duration)) { SV.dur = SV.video.duration * 1000; SV.elapsed = SV.video.currentTime * 1000; }
      else SV.elapsed += dt;
      if (SV.bar) SV.bar.style.width = Math.min(100, SV.elapsed / SV.dur * 100) + "%";
      if (SV.elapsed >= SV.dur - 30 || (SV.video && SV.video.ended)) return nextStory();
    }
    SV.raf = requestAnimationFrame(storyTick);
  }
  function pauseStory(on) {
    if (!SV) return; SV.paused = on;
    if (SV.video) { if (on) SV.video.pause(); else { var p = SV.video.play(); if (p && p.catch) p.catch(function () {}); } }
  }
  function nextStory() {
    var u = SV.users[SV.ui];
    if (SV.ii < u.items.length - 1) { SV.ii++; return showStoryItem(); }
    if (SV.ui < SV.users.length - 1) { SV.ui++; SV.ii = firstUnseen(SV.users[SV.ui]); return showStoryItem(); }
    finishStories(true);
  }
  function prevStory() {
    if (SV.ii > 0) SV.ii--; else if (SV.ui > 0) { SV.ui--; SV.ii = 0; }
    showStoryItem();
  }
  function finishStories(natural) {
    if (!SV) return;
    var users = SV.users, after = natural ? SV.after : null;
    stopStory(true); SV = null;
    users.forEach(function (u) {
      u.unseen = u.items.some(function (s) { return !s.seen; });
      setStoryFlags(u.uid, u.items.length > 0, u.unseen, true);
    });
    S.tray.forEach(function (t) { users.forEach(function (u) { if (u.uid === t.uid) { t.items = u.items; t.unseen = u.unseen; } }); });
    S.tray = S.tray.filter(function (t) { return t.items.length; });
    refreshLists(); if (S.view === "home") renderTray();
    if (S.view === "reels") resumeReels();
    if (after) after();
  }
  function logStoryView(s, u) {
    if (s.seen) return; s.seen = true;
    sb.from("story_views").upsert({ story_id: s.id, viewer_id: S.user.id }, { onConflict: "story_id,viewer_id", ignoreDuplicates: true }).then(function () {}, function () {});
  }
  async function loadStoryViews(s) {
    var r = await sb.from("story_views").select("created_at,viewer:profiles!viewer_id(id,handle,display_name,avatar_url)").eq("story_id", s.id).order("created_at", { ascending: false }).limit(100);
    s.views = r.data || [];
    var vc = $("#sv-vc"); if (vc && SV && curStory().s === s) vc.textContent = s.views.length;
  }
  async function showStoryViewers() {
    var s = curStory().s; pauseStory(true);
    var rows = s.views || [];
    var h = '<p class="sh-title">' + rows.length + (rows.length === 1 ? " view" : " views") + "</p>" + (rows.length ? rows.map(function (v) {
      var p = v.viewer || {};
      return '<div class="person">' + avInner(p.display_name, p.avatar_url, 40) + '<div class="pi"><b>' + esc(p.display_name || "Someone") + "</b><span>@" + esc(p.handle || "") + "</span></div><small class=\"muted\">" + ago(v.created_at) + "</small></div>";
    }).join("") : '<p class="muted sh-desc">No one has seen this yet.</p>');
    openSheet(h, { tall: rows.length > 5, label: "Story views", onClose: function () { pauseStory(false); } });
  }
  async function deleteCurrentStory() {
    pauseStory(true);
    var c = curStory(), ok = await confirmSheet("Delete this story?", "It will be removed for everyone.", "Delete", true);
    if (!ok) { pauseStory(false); return; }
    var r = await sb.from("stories").delete().eq("id", c.s.id).eq("author_id", S.user.id);
    if (r.error) { pauseStory(false); return toast(niceErr(r.error)); }
    if (c.s.media_url && !c.s.reel_id) removeMedia([c.s.media_url]);
    c.u.items.splice(SV.ii, 1);
    S.tray.forEach(function (t) { if (t.uid === c.u.uid) t.items = c.u.items.slice(); });
    toast("Story deleted.");
    if (!c.u.items.length) { setStoryFlags(c.u.uid, false, false, true); S.tray = S.tray.filter(function (t) { return t.items.length; }); finishStories(false); return; }
    if (SV.ii >= c.u.items.length) SV.ii = c.u.items.length - 1;
    showStoryItem();
  }
  async function sendStoryReply(text) {
    var u = curStory().u; text = text.trim(); if (!text) return;
    var r = await sb.from("messages").insert({ sender_id: S.user.id, recipient_id: u.uid, body: ("Replied to your story: " + text).slice(0, 1000) });
    if (r.error) return toast(niceErr(r.error));
    toast("Reply sent.");
  }
  /* tap zones, hold to pause, swipe down to close */
  (function () {
    var st = $("#story"), down = null;
    st.addEventListener("pointerdown", function (e) {
      if (!SV || e.target.closest(".sv-head,.sv-foot,.sv-reel")) return;
      down = { x: e.clientX, y: e.clientY, t: Date.now(), held: false, id: e.pointerId };
      down.timer = setTimeout(function () { if (down) { down.held = true; pauseStory(true); st.classList.add("held"); } }, 220);
    });
    st.addEventListener("pointermove", function (e) {
      if (!down || !SV) return;
      if (e.clientY - down.y > 110 && Math.abs(e.clientX - down.x) < 80) { clearTimeout(down.timer); down = null; st.classList.remove("held"); finishStories(false); }
    });
    function up(e) {
      if (!down || !SV) { down = null; return; }
      var d = down; down = null; clearTimeout(d.timer); st.classList.remove("held");
      if (d.held) { pauseStory(false); return; }
      if (e.type === "pointercancel") return;
      if (Math.abs(e.clientX - d.x) > 20 || Math.abs(e.clientY - d.y) > 20) return;
      var r = st.getBoundingClientRect();
      if (e.clientX - r.left < r.width * 0.33) prevStory(); else nextStory();
    }
    st.addEventListener("pointerup", up); st.addEventListener("pointercancel", up);
    st.addEventListener("focusin", function (e) { if (e.target.id === "sv-in") pauseStory(true); });
    st.addEventListener("focusout", function (e) { if (e.target.id === "sv-in") pauseStory(false); });
    st.addEventListener("submit", function (e) {
      if (e.target.id !== "sv-reply") return; e.preventDefault();
      var i = $("#sv-in"); var t = i.value; i.value = ""; i.blur(); sendStoryReply(t);
    });
  })();

  /* ---------- adding to your story ---------- */
  var SC = null;
  function openStoryCreate() {
    SC = { kind: null, blob: null, ext: "", mime: "", url: "", w: 0, h: 0, bg: 0, busy: false };
    var m = $("#modal"); m.className = "modal dark"; m.hidden = false; renderStoryCreate();
  }
  function renderStoryCreate() {
    var m = $("#modal");
    if (!SC.kind) {
      m.innerHTML = '<div class="compose-top gx"><button class="iconbtn" data-act="modalclose" aria-label="Close">' + ic(I.close) + '</button><b class="mtitle">Add to your story</b><span style="width:40px"></span></div>' +
        '<div class="sc-choose"><button class="sc-opt" data-act="scpick">' + ic(I.image) + "<b>Photo or video</b><small>Up to 60 seconds</small></button>" +
        '<button class="sc-opt" data-act="sctext">' + ic(I.text) + "<b>Text</b><small>Write something on a colour</small></button></div>" +
        '<p class="sc-note">Stories disappear after 24 hours.</p>';
      return;
    }
    var body;
    if (SC.kind === "text") body = '<div class="sc-stage text" id="sc-stage" style="background:' + STORY_BG[SC.bg] + '"><textarea id="sc-text" maxlength="200" placeholder="Type something…" aria-label="Story text">' + esc(SC.text || "") + "</textarea></div>" +
      '<div class="sc-sw">' + STORY_BG.map(function (g, i) { return '<button class="sw' + (SC.bg === i ? " on" : "") + '" data-act="scbg" data-i="' + i + '" style="background:' + g + '" aria-label="Colour ' + (i + 1) + '"></button>'; }).join("") + "</div>";
    else body = '<div class="sc-stage">' + (SC.kind === "video" ? '<video src="' + esc(SC.url) + '" autoplay muted loop playsinline></video>' : '<img src="' + esc(SC.url) + '" alt="">') + '</div><input class="in sc-cap" id="sc-cap" maxlength="200" placeholder="Add a caption…">';
    m.innerHTML = '<div class="compose-top gx"><button class="iconbtn" data-act="scback" aria-label="Back">' + ic(I.back) + '</button><b class="mtitle">New story</b><button class="btn fill" data-act="scshare" id="sc-share">Share</button></div>' + body + '<div class="cmp-prog" id="sc-prog" hidden><div class="bar"><i></i></div><span></span></div>';
  }
  async function scPick() {
    var f = (await pickFiles("image/*,video/*", false))[0]; if (!f || !SC) return;
    try {
      if (isVideoFile(f)) {
        var vt = vidType(f); if (!vt) throw new Error("Use an MP4 or WebM video.");
        if (f.size > MAX_FILE) throw new Error("That video is over 50 MB. Trim it and try again.");
        var meta = await probeVideo(f);
        if (meta.duration > 61) { URL.revokeObjectURL(meta.url); throw new Error("Stories can be up to 60 seconds."); }
        SC.kind = "video"; SC.blob = f; SC.mime = vt; SC.ext = fileExt(vt, f.name); SC.url = meta.url;
      } else {
        var p = await prepImage(f, { max: 1440 });
        SC.kind = "image"; SC.blob = p.blob; SC.mime = p.type; SC.ext = p.ext; SC.url = URL.createObjectURL(p.blob);
      }
      renderStoryCreate();
    } catch (e) { toast(e.message || niceErr(e)); }
  }
  async function scShare() {
    if (!SC || SC.busy) return;
    var btn = $("#sc-share"), prog = $("#sc-prog"), row = { author_id: S.user.id };
    try {
      if (SC.kind === "text") {
        var t = $("#sc-text").value.trim(); if (!t) return toast("Write something first.");
        row.kind = "text"; row.caption = t; row.bg = SC.bg;
      } else {
        SC.busy = true; btn.disabled = true; prog.hidden = false;
        var up = await uploadFile(SC.blob, SC.ext, SC.mime, function (f) { $("i", prog).style.width = Math.round(f * 100) + "%"; $("span", prog).textContent = f < 1 ? "Uploading…" : "Sharing…"; });
        row.kind = SC.kind; row.media_url = up.url; row.caption = ($("#sc-cap").value || "").trim();
        SC.uploaded = up.url;
      }
      SC.busy = true; btn.disabled = true;
      var r = await sb.from("stories").insert(row);
      if (r.error) { if (SC.uploaded) removeMedia([SC.uploaded]); throw r.error; }
    } catch (e) { if (SC) { SC.busy = false; btn.disabled = false; prog.hidden = true; } return toast(niceErr(e)); }
    closeModal(); SC = null; toast("Added to your story."); loadTray(); loadMe();
  }
  async function addReelToStory(r) {
    var res = await sb.from("stories").insert({ author_id: S.user.id, kind: "video", media_url: r.video_url, caption: "", reel_id: r.id });
    if (res.error) return toast(niceErr(res.error));
    toast("Added to your story."); loadTray(); loadMe();
  }
  /* what happens when someone taps an avatar */
  function avatarTap(uid, st) {
    var onProfile = (S.view === "profile" || S.view === "user") && S.pf && S.pf.id === uid;
    if (st > 0) return openUserStory(uid, onProfile ? null : function () { openUser(uid); });
    if (onProfile) { var u = S.pf.profile; if (u && u.avatar_url) openLightbox([u.avatar_url], 0); return; }
    openUser(uid);
  }


  /* ---------- sending something to a friend in chat ---------- */
  async function sendInChat(text) {
    S.sendText = text;
    openSheet('<p class="sh-title">Send in chat</p><div class="sh-pad"><input class="in" id="sc-in" placeholder="Search people" autocomplete="off"></div><div id="sc-list" class="sc-list">' + skel(2) + "</div>", { tall: true, label: "Send in chat" });
    loadSendList("");
  }
  var sendTimer;
  async function loadSendList(q) {
    var rows = [], tok = S.searchToken = (S.searchToken || 0) + 1;
    if (!q) {
      if (!S.chatThreads.length) await loadChat(true);
      var seen = {};
      S.chatThreads.forEach(function (t) { seen[t.other_id] = 1; rows.push({ id: t.other_id, display_name: t.display_name, handle: t.handle, avatar_url: null }); });
      var ids = Object.keys(S.following).filter(function (id) { return !seen[id]; }).slice(0, 20);
      if (ids.length) { var pr = await sb.from("profile_cards").select("id,handle,display_name,avatar_url").in("id", ids); rows = rows.concat(pr.data || []); }
    } else {
      var like = "%" + q.replace(/^@/, "").replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/%/g, "") + "%";
      var r = await sb.from("profile_cards").select("id,handle,display_name,avatar_url").neq("id", S.user.id).or("handle.ilike." + like + ",display_name.ilike." + like).limit(20);
      rows = r.data || [];
    }
    var box = $("#sc-list"); if (!box || tok !== S.searchToken) return;
    box.innerHTML = rows.length ? rows.map(function (p) {
      return '<button class="trow" data-act="sendto" data-id="' + p.id + '" data-name="' + esc(p.display_name) + '">' + avInner(p.display_name, p.avatar_url, 44) + '<div class="pi"><b>' + esc(p.display_name) + '</b><span class="tprev">@' + esc(p.handle) + "</span></div></button>";
    }).join("") : '<p class="muted sh-desc">' + (q ? "No one matches." : "Orbit someone or search to send this.") + "</p>";
  }
  document.addEventListener("input", function (e) {
    if (e.target.id === "sc-in") { clearTimeout(sendTimer); var v = e.target.value.trim(); sendTimer = setTimeout(function () { loadSendList(v); }, 250); }
  });
  async function sendTo(id, name) {
    var r = await sb.from("messages").insert({ sender_id: S.user.id, recipient_id: id, body: S.sendText });
    if (r.error) return toast(niceErr(r.error));
    closeSheet(); toast("Sent to " + name + ".");
  }

  /* ---------- reels ---------- */
  var RPAGE = 12, lastTap = 0, lastTapId = "", tapTimer = null, reelIO = null;
  function openReels(list, idx) {
    S.reels = { list: list.slice(), idx: idx || 0, ctx: true, end: true, loading: false };
    go("reels", { ctx: true });
  }
  async function openReelById(id) {
    var r = await sb.from("reel_feed").select("*").eq("id", id).maybeSingle();
    if (!r.data) return toast("That reel isn't available.");
    openReels([r.data], 0);
  }
  function showReels() {
    var ctx = S.params && S.params.ctx;
    if (!ctx && S.reels.ctx) S.reels = { list: [], idx: 0, ctx: null, end: false, loading: false };
    renderReels();
    if (!S.reels.list.length) loadReels(false);
  }
  async function loadReels(more) {
    var R = S.reels; if (R.loading || (more && R.end)) return;
    R.loading = true;
    var q = sb.from("reel_feed").select("*").order("created_at", { ascending: false }).limit(RPAGE);
    if (more && R.list.length) q = q.lt("created_at", R.list[R.list.length - 1].created_at);
    var r = await q;
    R.loading = false;
    if (S.reels !== R) return;
    if (r.error) { toast(niceErr(r.error)); if (!R.list.length) renderReels(); return; }
    var rows = r.data || []; R.end = rows.length < RPAGE;
    R.list = more ? R.list.concat(rows) : rows;
    if (S.view === "reels") { if (more) appendReels(rows); else renderReels(); }
  }
  function railHTML(r) {
    var own = r.author_id === S.user.id;
    function b(act, path, count, on, label, cls) { return '<button class="rb' + (on ? " on" : "") + (cls ? " " + cls : "") + '" data-act="' + act + '" aria-label="' + label + '"' + (act === "rlike" || act === "rsave" || act === "rreorb" ? ' aria-pressed="' + !!on + '"' : "") + '><span class="rbi">' + ic(path) + "</span>" + (count != null ? "<em>" + (count ? num(count) : "") + "</em>" : "") + "</button>"; }
    return '<div class="rav">' + avOrb(r, 44) + (!own && !r.followed_by_me && !S.following[r.author_id] ? '<button class="rfollow" data-act="rfollow" aria-label="Orbit @' + esc(r.handle) + '">' + ic(I.plus) + "</button>" : "") + "</div>" +
      b("rlike", I.heart, r.like_count, r.liked_by_me, "Like", "like") + b("rcomment", I.reply, r.comment_count, false, "Comments") +
      b("rreorb", I.reorb, r.reorb_count, r.reorbed_by_me, "Re-orb") + b("rsave", I.bookmark, null, r.saved_by_me, r.saved_by_me ? "Unsave" : "Save") +
      b("rshare", I.send, null, false, "Share") + b("rmore", I.more, null, false, "More") + discHTML(r);
  }
  function infoHTML(r) {
    var own = r.author_id === S.user.id, fol = r.followed_by_me || S.following[r.author_id];
    return '<div class="rwho"><a class="rh" href="#/u/' + esc(r.handle) + '" data-act="mention" data-h="' + esc(r.handle) + '">@' + esc(r.handle) + "</a>" + (!own && !fol ? '<button class="rchip" data-act="rfollow">Orbit</button>' : "") + "</div>" +
      (r.caption ? '<p class="rcap" data-act="rcap">' + linkify(r.caption) + "</p>" : "") + soundChipHTML(r) +
      (r.reposted_by_name ? '<p class="rre">' + ic(I.reorb) + (r.actor_id === S.user.id ? "You" : esc(r.reposted_by_name)) + " re-orbed</p>" : "");
  }
  function reelHTML(r, i) {
    return '<section class="reel" data-i="' + i + '" data-id="' + r.id + '"><video class="rv" playsinline loop preload="none"' + (r.poster_url ? ' poster="' + esc(r.poster_url) + '"' : "") + ' data-src="' + esc(r.video_url) + '"></video>' +
      '<div class="rtap" data-act="reeltap"></div><div class="rshade"></div><div class="rinfo">' + infoHTML(r) + '</div><div class="rrail">' + railHTML(r) + '</div><div class="rprog"><i></i></div><span class="rflash"></span></section>';
  }
  function reelsTopHTML() {
    return '<div class="rtop">' + (S.reels.ctx ? '<button class="iconbtn" data-act="back" aria-label="Back">' + ic(I.back) + "</button>" : "") + '<b>Reels</b><span class="grow"></span>' +
      '<button class="iconbtn" data-act="reelmute" aria-label="' + (S.reelMuted ? "Unmute" : "Mute") + '">' + ic(S.reelMuted ? I.mute : I.volume) + "</button>" +
      '<button class="iconbtn" data-act="reelnew" aria-label="Share a reel">' + ic(I.camera) + "</button></div>";
  }
  function renderReels() {
    var R = S.reels, el = $("#v-reels");
    var body;
    if (!R.list.length) body = R.loading || !R.end ? '<div class="rempty"><div class="spin"></div></div>' : '<div class="rempty"><b>No reels yet</b><span>Be the first to share one.</span><button class="btn fill" data-act="reelnew">Share a reel</button></div>';
    else body = R.list.map(reelHTML).join("");
    el.innerHTML = reelsTopHTML() + '<div id="reels-scroll" class="rscroll">' + body + "</div>";
    if (!R.list.length) return;
    var sc = $("#reels-scroll");
    sc.addEventListener("loadedmetadata", function (e) { var v = e.target; if (v.videoWidth && v.videoWidth > v.videoHeight * 1.05) v.style.objectFit = "contain"; }, true);
    sc.addEventListener("timeupdate", function (e) {
      var v = e.target; if (!v.duration) return;
      var bar = v.parentNode.querySelector(".rprog i"); if (bar) bar.style.width = (v.currentTime / v.duration * 100) + "%";
    }, true);
    requestAnimationFrame(function () {
      sc.scrollTop = R.idx * sc.clientHeight;
      initReelIO(); setActiveReel(R.idx);
    });
  }
  function appendReels(rows) {
    var sc = $("#reels-scroll"); if (!sc) return;
    var start = S.reels.list.length - rows.length;
    rows.forEach(function (r, k) { var d = document.createElement("div"); d.innerHTML = reelHTML(r, start + k); var el = d.firstChild; sc.appendChild(el); if (reelIO) reelIO.observe(el); });
  }
  function initReelIO() {
    if (reelIO) reelIO.disconnect();
    var sc = $("#reels-scroll"); if (!sc || !window.IntersectionObserver) return;
    reelIO = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio >= 0.6) setActiveReel(+e.target.dataset.i); }); }, { root: sc, threshold: [0.6] });
    $$(".reel", sc).forEach(function (el) { reelIO.observe(el); });
  }
  function reelVideo(i) { var el = $('#reels-scroll .reel[data-i="' + i + '"]'); return el && $(".rv", el); }
  function playReel(v) {
    if (!v || !v.getAttribute("src")) return;
    v.muted = S.reelMuted;
    var p = v.play();
    if (p && p.catch) p.catch(function () { S.reelMuted = true; v.muted = true; RS.mute(true); v.play().catch(function () {}); syncMuteBtn(); });
  }
  function setActiveReel(i) {
    var R = S.reels; R.idx = i;
    $$("#reels-scroll .reel").forEach(function (el, j) {
      var v = $(".rv", el), d = Math.abs(j - i);
      if (d <= 1 && !v.getAttribute("src")) v.src = v.dataset.src;
      else if (d > 2 && v.getAttribute("src")) { v.pause(); v.removeAttribute("src"); v.load(); }
      if (j === i) {
        el.classList.remove("paused");
        var snd = soundOf(R.list[j]);
        if (snd) RS.set(v, soundParams(snd), S.reelMuted); else { RS.stop(); try { v.volume = 1; } catch (e) {} }
        playReel(v);
        fitMarquee(el);
      } else { v.pause(); }
    });
    if (i >= R.list.length - 3 && !R.end) loadReels(true);
  }
  function fitMarquee(el) {
    var m = $(".marq", el); if (!m || m.classList.contains("long")) return;
    var i = m.firstChild; if (i && i.scrollWidth > m.clientWidth + 2) { i.innerHTML = i.innerHTML + "&emsp;&emsp;" + i.innerHTML; m.classList.add("long"); }
  }
  function pauseReels() { $$("#reels-scroll .rv").forEach(function (v) { try { v.pause(); } catch (e) {} }); RS.pause(); }
  function resumeReels() { if (S.view !== "reels" || (SV && !SV.closed) || !$("#sheet").hidden) return; var v = reelVideo(S.reels.idx); if (v && !v.closest(".reel").classList.contains("paused")) playReel(v); }
  function syncMuteBtn() { var b = $('.rtop [data-act="reelmute"]'); if (b) { b.innerHTML = ic(S.reelMuted ? I.mute : I.volume); b.setAttribute("aria-label", S.reelMuted ? "Unmute" : "Mute"); } }
  function findReel(id) {
    var out; [S.reels.list, S.bm.reels, S.pf && S.pf.lists.reels || []].some(function (a) { return a.some(function (r) { if (r.id === id) { out = r; return true; } }); });
    return out;
  }
  function eachReel(id, fn) { [S.reels.list, S.bm.reels, S.pf && S.pf.lists.reels || []].forEach(function (a) { a.forEach(function (r) { if (r.id === id) fn(r); }); }); }
  function paintReel(id) {
    var el = $('#reels-scroll .reel[data-id="' + id + '"]'), r = findReel(id); if (!el || !r) return;
    $(".rrail", el).innerHTML = railHTML(r); $(".rinfo", el).innerHTML = infoHTML(r); fitMarquee(el);
  }
  function renderReelRail(authorId) {
    S.reels.list.forEach(function (r) { if (r.author_id === authorId) paintReel(r.id); });
  }
  async function toggleReelRel(table, r, flag, countKey) {
    var on = !r[flag];
    eachReel(r.id, function (x) { x[flag] = on; if (countKey) x[countKey] = Number(x[countKey]) + (on ? 1 : -1); }); paintReel(r.id);
    var res = on ? await sb.from(table).insert({ user_id: S.user.id, reel_id: r.id }) : await sb.from(table).delete().eq("user_id", S.user.id).eq("reel_id", r.id);
    if (res.error) { eachReel(r.id, function (x) { x[flag] = !on; if (countKey) x[countKey] = Number(x[countKey]) + (on ? -1 : 1); }); paintReel(r.id); return toast(niceErr(res.error)); }
    if (table === "reel_saves") { toast(on ? "Saved to Bookmarks." : "Removed from Bookmarks."); if (!on && S.view === "bookmarks") { S.bm.reels = S.bm.reels.filter(function (x) { return x.id !== r.id; }); renderBookmarks(); } }
    if (table === "reel_reorbs") toast(on ? "Re-orbed to your profile." : "Re-orb removed.");
  }
  function burst(el, x, y) {
    var h = document.createElement("span"); h.className = "rburst"; h.innerHTML = ic(I.heart);
    var b = el.getBoundingClientRect(); h.style.left = (x - b.left) + "px"; h.style.top = (y - b.top) + "px"; el.appendChild(h);
    setTimeout(function () { h.remove(); }, 800);
  }
  function reelTap(el, e) {
    var id = el.dataset.id, r = findReel(id), now = Date.now();
    if (tapTimer && lastTapId === id && now - lastTap < 300) {
      clearTimeout(tapTimer); tapTimer = null; lastTap = 0;
      burst(el, e.clientX, e.clientY);
      if (r && !r.liked_by_me) toggleReelRel("reel_likes", r, "liked_by_me", "like_count");
      return;
    }
    lastTap = now; lastTapId = id;
    tapTimer = setTimeout(function () {
      tapTimer = null; var v = $(".rv", el), fl = $(".rflash", el);
      if (v.paused) { el.classList.remove("paused"); playReel(v); fl.innerHTML = ic(I.play); } else { v.pause(); el.classList.add("paused"); fl.innerHTML = ic(I.play); }
      fl.classList.remove("on"); void fl.offsetWidth; fl.classList.add("on");
    }, 260);
  }
  async function openReelComments(r) {
    pauseReels();
    openSheet('<p class="sh-title" id="cm-title">Comments</p><div class="cmts" id="cmts">' + skel(2) + '</div><form class="cmt-form" id="cmt-form" autocomplete="off"><input class="in" id="cmt-in" maxlength="300" placeholder="Add a comment…" aria-label="Add a comment"><button type="submit" class="btn fill" id="cmt-send" disabled>Post</button></form>',
      { tall: true, label: "Comments", onClose: function () { resumeReels(); } });
    S.cmtReel = r.id; loadReelComments();
  }
  async function loadReelComments() {
    var id = S.cmtReel;
    var r = await sb.from("reel_comments").select("id,body,created_at,author_id,author:profiles!author_id(handle,display_name,avatar_url)").eq("reel_id", id).order("created_at", { ascending: false }).limit(100);
    var box = $("#cmts"); if (!box || S.cmtReel !== id) return;
    var reel = findReel(id), mine = reel && reel.author_id === S.user.id, rows = r.data || [];
    if (reel) { eachReel(id, function (x) { x.comment_count = rows.length; }); paintReel(id); }
    var t = $("#cm-title"); if (t) t.textContent = rows.length + (rows.length === 1 ? " comment" : " comments");
    box.innerHTML = rows.length ? rows.map(function (c) {
      var a = c.author || {};
      return '<div class="cmt">' + avInner(a.display_name, a.avatar_url, 34) + '<div class="cb"><div><b>' + esc(a.display_name || "Someone") + '</b> <span class="muted">' + ago(c.created_at) + '</span></div><p>' + linkify(c.body) + "</p></div>" +
        (c.author_id === S.user.id || mine ? '<button class="iconbtn" data-act="cmtdel" data-id="' + c.id + '" aria-label="Delete comment">' + ic(I.trash) + "</button>" : "") + "</div>";
    }).join("") : '<p class="muted sh-desc">No comments yet. Start the conversation.</p>';
  }
  async function postReelComment() {
    var i = $("#cmt-in"), t = i.value.trim(); if (!t) return;
    var b = $("#cmt-send"); b.disabled = true; i.value = "";
    var r = await sb.from("reel_comments").insert({ reel_id: S.cmtReel, author_id: S.user.id, body: t });
    if (r.error) { i.value = t; b.disabled = false; return toast(niceErr(r.error)); }
    loadReelComments();
  }
  async function reelShare(r) {
    var items = [{ id: "story", icon: I.plus, label: "Add to your story", sub: "Share this reel with your orbiters" }, { id: "chat", icon: I.send, label: "Send in chat" }, { id: "copy", icon: I.link, label: "Copy link" }];
    if (navigator.share) items.push({ id: "native", icon: I.share, label: "Share to other apps" });
    var id = await actionSheet(items, "Share reel"), url = link("reel/" + r.id);
    if (id === "story") addReelToStory(r);
    else if (id === "chat") sendInChat(url);
    else if (id === "copy") copyText(url).then(function (ok) { toast(ok ? "Link copied." : "Could not copy the link."); });
    else if (id === "native") { try { await navigator.share({ title: "Orbi", text: r.caption || "A reel on Orbi", url: url }); } catch (e) {} }
    resumeReels();
  }
  async function reelMore(r) {
    var own = r.author_id === S.user.id, items = [{ id: "copy", icon: I.link, label: "Copy link" }];
    if (own) items.push({ id: "delete", icon: I.trash, label: "Delete reel", danger: true });
    var id = await actionSheet(items);
    if (id === "copy") copyText(link("reel/" + r.id)).then(function (ok) { toast(ok ? "Link copied." : "Could not copy the link."); });
    else if (id === "delete") deleteReel(r);
  }
  async function deleteReel(r) {
    var ok = await confirmSheet("Delete this reel?", "It will be removed for everyone.", "Delete", true);
    if (!ok) return;
    var res = await sb.from("reels").delete().eq("id", r.id).eq("author_id", S.user.id);
    if (res.error) return toast(niceErr(res.error));
    removeMedia([r.video_url, r.poster_url]);
    if (r.audio_url && r.audio_url.indexOf("/" + S.user.id + "/") > 0) {
      sb.from("reels").select("id", { count: "exact", head: true }).eq("audio_key", r.audio_url).then(function (c) { if (!c.error && !c.count) removeMedia([r.audio_url]); }, function () {});
    }
    S.reels.list = S.reels.list.filter(function (x) { return x.id !== r.id; });
    S.bm.reels = S.bm.reels.filter(function (x) { return x.id !== r.id; });
    if (S.pf && S.pf.lists.reels) S.pf.lists.reels = S.pf.lists.reels.filter(function (x) { return x.id !== r.id; });
    toast("Reel deleted."); loadMe();
    if (!S.reels.list.length && S.reels.ctx) return back();
    S.reels.idx = Math.min(S.reels.idx, Math.max(0, S.reels.list.length - 1));
    renderReels();
  }

  /* ---------- sharing a reel ---------- */
  var RU = null;
  function openReelUpload(sound) {
    pauseReels();
    RU = { blob: null, url: "", dur: 0, w: 0, h: 0, mime: "", ext: "", busy: false, cap: "", sync: null, sound: sound ? Object.assign({ start: 0, vol: 0.8, vvol: 1 }, sound) : null };
    var m = $("#modal"); m.className = "modal dark"; m.hidden = false; renderReelUpload();
  }
  function ruCleanup() {
    if (!RU) return;
    if (RU.sync) RU.sync.stop();
    if (RU.url) { try { URL.revokeObjectURL(RU.url); } catch (e) {} }
    if (RU.sound && RU.sound.blob) { try { URL.revokeObjectURL(RU.sound.url); } catch (e) {} }
  }
  function ruMixHTML() {
    var sn = RU.sound; if (!sn) return "";
    var maxStart = sn.dur ? Math.max(0, Math.floor((sn.dur - 1) * 2) / 2) : 0;
    return '<label class="ru-sl"><span>Music volume</span><input type="range" id="ru-vol" min="0" max="100" value="' + Math.round(sn.vol * 100) + '" aria-label="Music volume"></label>' +
      '<label class="ru-sl"><span>Original sound</span><input type="range" id="ru-vvol" min="0" max="100" value="' + Math.round(sn.vvol * 100) + '" aria-label="Original sound volume"></label>' +
      (maxStart > 0 ? '<label class="ru-sl"><span>Starts at <b id="ru-sv">' + mmss(sn.start) + '</b></span><input type="range" id="ru-start" min="0" max="' + maxStart + '" step="0.5" value="' + Math.min(sn.start, maxStart) + '" aria-label="Where the song starts"></label>' : "");
  }
  function ruSoundHTML() {
    var sn = RU.sound;
    if (!sn) return '<button class="ru-sndbtn" data-act="rusound">' + ic(I.music) + "<span>Add sound</span>" + ic(I.chev, "chev") + "</button>";
    return '<div class="ru-chip"><button class="ru-sndbtn on" data-act="rusound">' + ic(I.music) + "<span>" + esc(soundLabel(sn)) + '</span></button><button class="iconbtn" data-act="rusoundx" aria-label="Remove sound">' + ic(I.close) + '</button></div><div class="ru-mix" id="ru-mix">' + ruMixHTML() + "</div>";
  }
  function renderReelUpload() {
    var m = $("#modal");
    if (RU.sync) RU.sync.stop();
    if (!RU.blob) {
      m.innerHTML = '<div class="compose-top gx"><button class="iconbtn" data-act="modalclose" aria-label="Close">' + ic(I.close) + '</button><b class="mtitle">New reel</b><span style="width:40px"></span></div>' +
        '<div class="sc-choose"><button class="sc-opt" data-act="rupick">' + ic(I.video) + "<b>Choose a video</b><small>Up to 90 seconds and 50 MB. Tall videos look best.</small></button>" +
        (RU.sound ? '<p class="ru-note">' + ic(I.music) + "Sound: " + esc(soundLabel(RU.sound)) + "</p>" : "") + "</div>";
      return;
    }
    m.innerHTML = '<div class="compose-top gx"><button class="iconbtn" data-act="ruback" aria-label="Back">' + ic(I.back) + '</button><b class="mtitle">New reel</b><button class="btn fill" data-act="rushare" id="ru-share">Share</button></div>' +
      '<div class="ru-body"><div class="ru-prev"><video id="ru-vid" src="' + esc(RU.url) + '" autoplay loop playsinline></video><button class="ru-mute" data-act="rumute" aria-label="Mute preview">' + ic(I.volume) + '</button></div>' +
      '<div class="ru-snd" id="ru-snd">' + ruSoundHTML() + '</div>' +
      '<textarea class="in" id="ru-cap" maxlength="150" rows="3" placeholder="Write a caption…" aria-label="Caption"></textarea></div>' +
      '<div class="cmp-prog" id="ru-prog" hidden><div class="bar"><i></i></div><span></span></div>';
    var cap = $("#ru-cap"); cap.value = RU.cap || "";
    var v = $("#ru-vid"); RU.sync = RU.sync || makeSync();
    var el = RU.sync.el; el.onloadedmetadata = function () { if (RU && RU.sound && !RU.sound.dur && isFinite(el.duration)) { RU.sound.dur = el.duration; var mx = $("#ru-mix"); if (mx) mx.innerHTML = ruMixHTML(); } };
    if (RU.sound) RU.sync.set(v, soundParams(RU.sound), false);
    var pr = v.play(); if (pr && pr.catch) pr.catch(function () { v.muted = true; RU.sync.mute(true); ruMuteBtn(); v.play().catch(function () {}); });
  }
  function ruMuteBtn() { var v = $("#ru-vid"), b = $(".ru-mute"); if (v && b) { b.innerHTML = ic(v.muted ? I.mute : I.volume); b.setAttribute("aria-label", v.muted ? "Unmute preview" : "Mute preview"); } }
  document.addEventListener("input", function (e) {
    var id = e.target.id; if (!RU || !RU.sound || (id !== "ru-vol" && id !== "ru-vvol" && id !== "ru-start")) return;
    var sn = RU.sound, val = +e.target.value;
    if (id === "ru-vol") sn.vol = val / 100; else if (id === "ru-vvol") sn.vvol = val / 100;
    else { sn.start = val; var sv = $("#ru-sv"); if (sv) sv.textContent = mmss(val); }
    var v = $("#ru-vid"); if (RU.sync && v) RU.sync.update(soundParams(sn), v.muted);
  });
  function ruSetCap() { var c = $("#ru-cap"); if (c && RU) RU.cap = c.value; }
  async function ruPick() {
    var f = (await pickFiles("video/*", false))[0]; if (!f || !RU) return;
    try {
      var vt = vidType(f); if (!vt) throw new Error("Use an MP4 or WebM video.");
      if (f.size > MAX_FILE) throw new Error("That video is over 50 MB. Trim it and try again.");
      var meta = await probeVideo(f);
      if (meta.duration > 91) { URL.revokeObjectURL(meta.url); throw new Error("Reels can be up to 90 seconds."); }
      if (meta.duration && meta.duration < 0.5) { URL.revokeObjectURL(meta.url); throw new Error("That video is too short."); }
      RU.blob = f; RU.url = meta.url; RU.dur = meta.duration; RU.w = meta.w; RU.h = meta.h; RU.mime = vt; RU.ext = fileExt(vt, f.name);
      renderReelUpload();
    } catch (e) { toast(e.message || niceErr(e)); }
  }
  async function ruShare() {
    if (!RU || RU.busy) return;
    ruSetCap();
    RU.busy = true; var btn = $("#ru-share"), prog = $("#ru-prog"), caption = ($("#ru-cap").value || "").trim(), ups = [];
    btn.disabled = true; prog.hidden = false;
    function setP(l, f) { $("span", prog).textContent = l; $("i", prog).style.width = Math.round(f * 100) + "%"; }
    try {
      setP("Preparing…", 0.02);
      var pb = await capturePoster(RU.url, RU.dur), poster = null;
      if (pb) { poster = await uploadFile(pb, "jpg", "image/jpeg"); ups.push(poster.url); }
      var row = { author_id: S.user.id, poster_url: poster ? poster.url : null, caption: caption, duration: RU.dur && isFinite(RU.dur) ? Math.round(RU.dur * 10) / 10 : null };
      var sn = RU.sound;
      if (sn) {
        if (sn.track) { row.audio_track = sn.track; }
        else if (sn.blob) { setP("Uploading sound…", 0.04); var au = await uploadFile(sn.blob, sn.ext, sn.mime); ups.push(au.url); row.audio_url = au.url; }
        else row.audio_url = sn.url;
        row.audio_title = (sn.title || "").slice(0, 60) || null; row.audio_artist = (sn.artist || "").slice(0, 40) || null;
        row.audio_start = Math.round((sn.start || 0) * 10) / 10; row.audio_vol = Math.round(sn.vol * 100) / 100; row.video_vol = Math.round(sn.vvol * 100) / 100;
      }
      var vid = await uploadFile(RU.blob, RU.ext, RU.mime, function (f) { setP(f < 1 ? "Uploading…" : "Sharing…", 0.08 + f * 0.87); });
      ups.push(vid.url); row.video_url = vid.url;
      var r = await sb.from("reels").insert(row);
      if (r.error) throw r.error;
    } catch (e) { removeMedia(ups); RU.busy = false; btn.disabled = false; prog.hidden = true; return toast(niceErr(e)); }
    ruCleanup();
    closeModal(); RU = null; toast("Your reel is live."); loadMe();
    if (S.view === "reels") { S.reels = { list: [], idx: 0, ctx: null, end: false, loading: false }; renderReels(); loadReels(false); }
  }


  /* ---------- songs on reels ---------- */
  var SONGS = [{"id":"orbi-glow","title":"Glow","artist":"Orbi Originals","mood":"Chill pop","bpm":100,"dur":38.4},{"id":"orbi-sunset-drive","title":"Sunset Drive","artist":"Orbi Originals","mood":"Synthwave","bpm":118,"dur":32.5},{"id":"orbi-lagos-nights","title":"Lagos Nights","artist":"Orbi Originals","mood":"Afro groove","bpm":104,"dur":36.9},{"id":"orbi-orange-hour","title":"Orange Hour","artist":"Orbi Originals","mood":"Lo-fi","bpm":84,"dur":45.7},{"id":"orbi-pulse","title":"Pulse","artist":"Orbi Originals","mood":"House","bpm":124,"dur":31.0},{"id":"orbi-daydream","title":"Daydream","artist":"Orbi Originals","mood":"Dreamy","bpm":76,"dur":50.5},{"id":"orbi-hype-up","title":"Hype Up","artist":"Orbi Originals","mood":"Trap","bpm":140,"dur":27.4},{"id":"orbi-soft-landing","title":"Soft Landing","artist":"Orbi Originals","mood":"Piano ballad","bpm":68,"dur":56.5},{"id":"orbi-street-lights","title":"Street Lights","artist":"Orbi Originals","mood":"Boom bap","bpm":92,"dur":41.7},{"id":"orbi-island-breeze","title":"Island Breeze","artist":"Orbi Originals","mood":"Tropical","bpm":108,"dur":35.6},{"id":"orbi-neon-run","title":"Neon Run","artist":"Orbi Originals","mood":"Electro","bpm":128,"dur":30.0},{"id":"orbi-quiet-orbit","title":"Quiet Orbit","artist":"Orbi Originals","mood":"Ambient","bpm":60,"dur":48.0}];
  var SONG_BY = {}; SONGS.forEach(function (s) { SONG_BY[s.id] = s; });
  var MAX_AUDIO = 15 * 1024 * 1024;
  function songUrl(id) { try { return new URL("audio/" + id + ".mp3", document.baseURI).href; } catch (e) { return "audio/" + id + ".mp3"; } }
  function clamp01(x) { x = Number(x); return isNaN(x) ? 1 : Math.max(0, Math.min(1, x)); }
  function mmss(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }
  /* what a reel (or a reel story) is playing, in one shape */
  function soundOf(r) {
    if (!r) return null;
    var base = { start: Math.max(0, Number(r.audio_start) || 0), vol: r.audio_vol == null ? 0.8 : clamp01(r.audio_vol), vvol: r.video_vol == null ? 1 : clamp01(r.video_vol) };
    if (r.audio_track) {
      var sg = SONG_BY[r.audio_track];
      return Object.assign(base, { key: r.audio_track, track: r.audio_track, url: songUrl(r.audio_track), title: r.audio_title || (sg && sg.title) || "Song", artist: r.audio_artist || (sg && sg.artist) || "Orbi Originals", dur: sg ? sg.dur : 0 });
    }
    if (r.audio_url) return Object.assign(base, { key: r.audio_url, url: r.audio_url, title: r.audio_title || "Original song", artist: r.audio_artist || "", dur: 0 });
    return null;
  }
  /* one audio element kept in step with whichever video is on screen */
  function makeSync() {
    var a = new Audio(), v = null, p = null;
    a.preload = "auto"; a.loop = false;
    function tgt() { var d = a.duration, t = p.start + (v.currentTime || 0); return d && isFinite(d) && d > 0 ? t % d : t; }
    function align(force) { if (!v || !p) return; var t = tgt(); if (force || Math.abs(a.currentTime - t) > 0.3) { try { a.currentTime = t; } catch (e) {} } }
    function go() { var pr = a.play(); if (pr && pr.catch) pr.catch(function () {}); }
    function onEv(vv, type) {
      if (vv !== v || !p) return;
      if (type === "play" || type === "playing") { align(true); go(); }
      else if (type === "pause" || type === "waiting") a.pause();
      else if (type === "seeked") align(true);
      else if (type === "timeupdate") { if (!v.paused && a.paused) go(); align(false); }
    }
    a.addEventListener("ended", function () { if (v && p && !v.paused) { align(true); go(); } });
    function bind(vv) {
      if (vv._sy) return; vv._sy = 1;
      ["play", "playing", "pause", "waiting", "seeked", "timeupdate"].forEach(function (t) { vv.addEventListener(t, function () { onEv(vv, t); }); });
    }
    function apply(muted) {
      a.volume = clamp01(p.vol); a.muted = !!muted;
      try { v.volume = clamp01(p.vvol); } catch (e) {}
    }
    return {
      el: a,
      set: function (vv, pp, muted) {
        if (!pp || !vv) return this.stop();
        v = vv; p = pp; bind(vv);
        if (a.getAttribute("src") !== pp.url) a.src = pp.url;
        apply(muted);
        if (!vv.paused) { align(true); go(); } else a.pause();
      },
      update: function (pp, muted) { if (!v) return; p = pp; apply(muted); align(true); },
      mute: function (m) { a.muted = !!m; },
      pause: function () { a.pause(); },
      resume: function () { if (v && p && !v.paused) { align(true); go(); } },
      stop: function () { a.pause(); v = null; p = null; },
      active: function () { return !!p; }
    };
  }
  var RS = makeSync();   /* reels player and reel stories */

  function soundParams(snd) { return snd ? { url: snd.url, start: snd.start || 0, vol: snd.vol, vvol: snd.vvol } : null; }
  function soundLabel(snd) { return snd.title + (snd.artist ? " · " + snd.artist : ""); }
  function soundChipHTML(r) {
    var s = soundOf(r);
    if (!s) return '<p class="rsound orig">' + ic(I.music) + "<span>Original audio · @" + esc(r.handle) + "</span></p>";
    return '<button class="rsound" data-act="rsound" aria-label="Sound: ' + esc(soundLabel(s)) + '">' + ic(I.music) + '<span class="marq"><i>' + esc(soundLabel(s)) + "</i></span></button>";
  }
  function discHTML(r) {
    var s = soundOf(r); if (!s) return "";
    return '<button class="rdisc" data-act="rsound" aria-label="Sound: ' + esc(soundLabel(s)) + '"><span class="disc">' + ic(I.music) + "</span></button>";
  }

  /* ----- sound page: tap the song on a reel ----- */
  var PV = new Audio(); PV.preload = "auto"; var pvKey = "";
  function pvToggle(snd, btn) {
    var same = pvKey === snd.key && !PV.paused;
    pvStop();
    if (same) return;
    PV.src = snd.url; pvKey = snd.key; try { PV.currentTime = snd.start || 0; } catch (e) {}
    var pr = PV.play(); if (pr && pr.catch) pr.catch(function () { pvStop(); toast("Could not play that sound."); });
    $$('[data-snd="play"]').forEach(function (b) { b.classList.toggle("on", b.dataset.key === snd.key); b.innerHTML = ic(b.dataset.key === snd.key ? I.pause : I.play); });
  }
  function pvStop() {
    try { PV.pause(); } catch (e) {} pvKey = "";
    $$('[data-snd="play"]').forEach(function (b) { b.classList.remove("on"); b.innerHTML = ic(I.play); });
  }
  PV.addEventListener("ended", pvStop);
  async function openSoundPage(r) {
    var snd = soundOf(r); if (!snd) return;
    pauseReels(); RS.pause();
    S.sndCur = snd;
    openSheet('<div class="sp-head"><span class="sp-art">' + ic(I.music) + '</span><div class="sp-meta"><b>' + esc(snd.title) + "</b><small>" + esc(snd.artist || "Original song") + '</small><small id="sp-count">&nbsp;</small></div></div>' +
      '<div class="sp-actions"><button class="btn" data-snd="play" data-key="' + esc(snd.key) + '">' + ic(I.play) + '</button><button class="btn fill" data-snd="usethis">Use this sound</button></div>' +
      '<p class="sh-title sp-sub">Reels with this sound</p><div class="sp-grid" id="sp-grid">' + skel(1) + "</div>", { tall: true, label: "Sound", onClose: function () { pvStop(); resumeReels(); } });
    var q = await sb.from("reel_feed").select("*").eq("audio_key", snd.key).order("created_at", { ascending: false }).limit(30);
    var box = $("#sp-grid"); if (!box || !S.sndCur || S.sndCur.key !== snd.key) return;
    var rows = q.data || []; S.sndReels = rows;
    var c = $("#sp-count"); if (c) c.textContent = rows.length + (rows.length === 1 ? " reel" : " reels") + (rows.length >= 30 ? "+" : "");
    box.innerHTML = rows.length ? rows.map(function (x, i) {
      return '<button class="sp-cell" data-snd="open" data-i="' + i + '" aria-label="Reel by @' + esc(x.handle) + '">' + (x.poster_url ? '<img alt="" loading="lazy" src="' + esc(x.poster_url) + '">' : "") + "<span>" + ic(I.play) + num(x.like_count) + "</span></button>";
    }).join("") : '<p class="muted sh-desc">No reels use this sound yet.</p>';
  }

  /* ----- picking a sound while sharing a reel ----- */
  var SP = null;   /* { q, pop } */
  async function openSoundPicker() {
    SP = { q: "", pop: [] };
    pauseReels();
    openSheet('<p class="sh-title">Add sound</p><div class="sh-pad"><input class="in" id="sp-q" placeholder="Search songs" autocomplete="off" aria-label="Search songs"></div><div class="sp-list" id="sp-list"></div>',
      { tall: true, label: "Add sound", onClose: function () { pvStop(); SP = null; } });
    renderPicker();
    try {
      var r = await sb.from("reels").select("audio_key,audio_track,audio_url,audio_title,audio_artist").not("audio_key", "is", null).order("created_at", { ascending: false }).limit(200);
      var by = {}, order = [];
      (r.data || []).forEach(function (x) {
        var s = soundOf(x); if (!s) return;
        if (!by[s.key]) { by[s.key] = { snd: s, n: 0 }; order.push(s.key); }
        by[s.key].n++;
      });
      if (SP) { SP.pop = order.map(function (k) { return by[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8); renderPicker(); }
    } catch (e) {}
  }
  function rowHTML(s, sub, n) {
    return '<div class="srow"><button class="splay" data-snd="play" data-key="' + esc(s.key) + '" data-pick="' + esc(s.key) + '" aria-label="Preview ' + esc(s.title) + '">' + ic(I.play) + '</button><div class="sinfo"><b>' + esc(s.title) + "</b><small>" + esc(sub) + (n ? " · " + n + (n === 1 ? " reel" : " reels") : "") + '</small></div><button class="suse" data-snd="use" data-key="' + esc(s.key) + '">Use</button></div>';
  }
  function renderPicker() {
    var box = $("#sp-list"); if (!box || !SP) return;
    var q = SP.q.toLowerCase(), h = "";
    function hit(s) { return !q || (s.title + " " + (s.artist || "") + " " + (s.mood || "")).toLowerCase().indexOf(q) >= 0; }
    h += '<button class="srow up" data-snd="upload"><span class="splay">' + ic(I.plus) + '</span><div class="sinfo"><b>Upload your own audio</b><small>MP3 or M4A, up to 15 MB</small></div></button>';
    var pops = SP.pop.filter(function (x) { return hit(x.snd); });
    if (pops.length) { h += '<p class="sp-sec">Popular on Orbi</p>' + pops.map(function (x) { return rowHTML(x.snd, (x.snd.artist || "Original song") + (x.snd.dur ? " · " + mmss(x.snd.dur) : ""), x.n); }).join(""); }
    var og = SONGS.filter(hit);
    if (og.length) h += '<p class="sp-sec">Orbi Originals</p>' + og.map(function (s) { return rowHTML(soundOf({ audio_track: s.id }), s.mood + " · " + mmss(s.dur)); }).join("");
    if (!pops.length && !og.length) h += '<p class="muted sh-desc">No songs match.</p>';
    box.innerHTML = h;
  }
  document.addEventListener("input", function (e) {
    if (e.target.id === "sp-q" && SP) { SP.q = e.target.value.trim(); renderPicker(); }
  });
  function findPickable(key) {
    var s = SONG_BY[key] ? soundOf({ audio_track: key }) : null;
    if (!s && SP) SP.pop.some(function (x) { if (x.snd.key === key) { s = x.snd; return true; } });
    if (!s && S.sndCur && S.sndCur.key === key) s = S.sndCur;
    return s;
  }
  function audioMeta(file) {
    return new Promise(function (res, rej) {
      var a = new Audio(), u = URL.createObjectURL(file), t = setTimeout(function () { URL.revokeObjectURL(u); rej(new Error("Could not read that audio file.")); }, 10000);
      a.preload = "metadata";
      a.onloadedmetadata = function () { clearTimeout(t); res({ url: u, dur: isFinite(a.duration) ? a.duration : 0 }); };
      a.onerror = function () { clearTimeout(t); URL.revokeObjectURL(u); rej(new Error("This browser can't play that audio. Try an MP3 or M4A.")); };
      a.src = u;
    });
  }
  function audType(f) {
    if (/^audio\/(mpeg|mp4|aac|x-m4a|webm|ogg|wav|x-wav)$/.test(f.type)) return f.type === "audio/x-m4a" ? "audio/mp4" : f.type;
    var e = (f.name || "").split(".").pop().toLowerCase();
    return { mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", weba: "audio/webm" }[e] || "";
  }
  async function pickUploadAudio() {
    var f = (await pickFiles("audio/*,.mp3,.m4a,.aac,.wav,.ogg", false))[0]; if (!f) return;
    try {
      var ty = audType(f); if (!ty) throw new Error("Use an MP3 or M4A audio file.");
      if (f.size > MAX_AUDIO) throw new Error("That audio is over 15 MB.");
      var m = await audioMeta(f);
      var name = (f.name || "My sound").replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, " ").trim().slice(0, 60) || "My sound";
      var snd = { key: "local:" + Date.now(), url: m.url, blob: f, mime: ty, ext: fileExt(ty, f.name), title: name, artist: S.profile ? S.profile.display_name.slice(0, 40) : "", dur: m.dur, start: 0, vol: 0.8, vvol: 1, kind: "upload" };
      chooseSound(snd);
    } catch (e) { toast(e.message || niceErr(e)); }
  }
  function chooseSound(snd) {
    pvStop(); closeSheet();
    if (!RU) return;
    if (RU.sound && RU.sound.blob && RU.sound.url && RU.sound.url !== snd.url) { try { URL.revokeObjectURL(RU.sound.url); } catch (e) {} }
    RU.sound = Object.assign({ start: 0, vol: 0.8, vvol: 1 }, snd);
    renderReelUpload();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-snd]"); if (!b) return;
    var a = b.dataset.snd;
    if (a === "play") { var s0 = findPickable(b.dataset.key); if (s0) pvToggle(s0, b); }
    else if (a === "use") { var s1 = findPickable(b.dataset.key); if (s1) chooseSound(Object.assign({}, s1, { start: 0 })); }
    else if (a === "upload") pickUploadAudio();
    else if (a === "usethis") { var cur = S.sndCur; if (cur) { closeSheet(); openReelUpload(Object.assign({}, cur, { start: 0 })); } }
    else if (a === "open") { var list = S.sndReels || [], i = +b.dataset.i; if (list[i]) { closeSheet(); openReels(list, i); } }
  });

  /* ---------- chat ---------- */
  function msgTime(iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  async function loadChat(quiet) {
    var el = $("#chat-list");
    if (!quiet && !S.chatThreads.length) el.innerHTML = '<div class="loading">Loading…</div>';
    var r = await sb.from("chat_threads").select("*").order("last_at", { ascending: false }).limit(50);
    if (r.error) { if (!quiet) el.innerHTML = '<div class="empty gx"><b>Could not load chats</b>' + esc(niceErr(r.error)) + "</div>"; return; }
    S.chatThreads = r.data || [];
    if (S.view === "chat") renderChatList();
  }
  function renderChatList() {
    $("#chat-list").innerHTML = S.chatThreads.length ? S.chatThreads.map(function (t) {
      var n = Number(t.unread_count) || 0;
      return '<button class="trow gx" data-act="openthread" data-id="' + t.other_id + '">' + avInner(t.display_name, t.avatar_url, 46) +
        '<div class="pi"><div class="ttop"><b>' + esc(t.display_name) + '</b><span class="muted">' + ago(t.last_at) + "</span></div>" +
        '<span class="tprev' + (n ? " unread" : "") + '">' + (t.last_from_me ? "You: " : "") + esc(t.last_body) + "</span></div>" +
        (n ? '<span class="dot" aria-label="' + n + ' unread">' + n + "</span>" : "") + "</button>";
    }).join("") : '<div class="empty gx"><b>No chats yet</b>Tap New message to start a conversation.</div>';
  }
  var ncTok = 0, ncTimer;
  async function loadNewChat() {
    var tok = ++ncTok, q = $("#newchat-in").value.trim().replace(/^@/, "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim(), body = $("#newchat-body");
    body.innerHTML = '<div class="loading">Loading…</div>';
    var qy = sb.from("profiles").select("id,handle,display_name,bio,avatar_url").neq("id", S.user.id).limit(20);
    if (q) { var like = "%" + q.replace(/%/g, "") + "%"; qy = qy.or("handle.ilike." + like + ",display_name.ilike." + like); }
    else qy = qy.order("created_at", { ascending: false });
    var r = await qy;
    if (tok !== ncTok || S.view !== "newchat") return;
    S.newPeople = r.data || [];
    body.innerHTML = S.newPeople.length ? S.newPeople.map(function (p) {
      return '<button class="trow" data-act="openthread" data-id="' + p.id + '">' + avInner(p.display_name, p.avatar_url, 46) +
        '<div class="pi"><b>' + esc(p.display_name) + '</b><span class="tprev">@' + esc(p.handle) + (p.bio ? " · " + esc(p.bio) : "") + "</span></div></button>";
    }).join("") : '<p class="muted">' + (q ? 'No one matches "' + esc(q) + '".' : "No one else has joined yet.") + "</p>";
  }
  async function openThread(id) {
    var pr = await sb.from("profile_cards").select("id,handle,display_name,avatar_url").eq("id", id).maybeSingle();
    if (pr.error || !pr.data) return toast("Could not open that chat.");
    S.thread = pr.data; S.threadMsgs = []; S.pendingMsgs = []; S.threadSig = "";
    $("#thread-in").value = ""; updateSend();
    go("thread"); renderThread(true);
    await loadThread(false);
  }
  async function loadThread(quiet) {
    var o = S.thread && S.thread.id, me = S.user.id; if (!o) return;
    var r = await sb.from("messages").select("id,sender_id,recipient_id,body,created_at,read_at")
      .or("and(sender_id.eq." + me + ",recipient_id.eq." + o + "),and(sender_id.eq." + o + ",recipient_id.eq." + me + ")")
      .order("created_at", { ascending: false }).limit(200);
    if (!S.thread || S.thread.id !== o || S.view !== "thread") return;
    if (r.error) { if (!quiet) toast(niceErr(r.error)); return; }
    var rows = (r.data || []).slice().reverse(), sig = rows.length + ":" + (rows.length ? rows[rows.length - 1].id : "");
    if (sig !== S.threadSig) { S.threadSig = sig; S.threadMsgs = rows; renderThread(false); }
    if (rows.some(function (m) { return m.sender_id === o && !m.read_at; })) {
      sb.from("messages").update({ read_at: new Date().toISOString() }).eq("sender_id", o).eq("recipient_id", me).is("read_at", null).then(function () { loadUnread(); });
    }
  }
  function renderThread(bottom) {
    var box = $("#thread-msgs"), c = $("#content"), me = S.user.id;
    var near = bottom || (c.scrollHeight - c.scrollTop - c.clientHeight < 140);
    var rows = S.threadMsgs.concat(S.pendingMsgs);
    box.innerHTML = rows.length ? rows.map(function (m) {
      return '<div class="bub ' + (m.sender_id === me ? "me" : "them") + (m.pending ? " pend" : "") + '"><span>' + linkify(m.body) + "</span><small>" + msgTime(m.created_at) + "</small></div>";
    }).join("") : '<div class="empty"><b>Say hello</b>Send the first message to ' + esc(S.thread.display_name) + ".</div>";
    if (near) c.scrollTop = c.scrollHeight;
  }
  function updateSend() { $("#thread-send").disabled = !$("#thread-in").value.trim(); }
  async function sendMessage() {
    var inp = $("#thread-in"), body = inp.value.trim(), o = S.thread && S.thread.id;
    if (!body || body.length > 1000 || !o) return;
    var tmp = { id: "p" + Date.now(), sender_id: S.user.id, body: body, created_at: new Date().toISOString(), pending: true };
    S.pendingMsgs.push(tmp); inp.value = ""; updateSend(); renderThread(true);
    var r = await sb.from("messages").insert({ sender_id: S.user.id, recipient_id: o, body: body });
    S.pendingMsgs = S.pendingMsgs.filter(function (m) { return m !== tmp; });
    if (r.error) { renderThread(false); if (!inp.value) { inp.value = body; updateSend(); } return toast(niceErr(r.error)); }
    S.threadSig = ""; await loadThread(true); renderThread(true);
  }
  $("#thread-in").addEventListener("input", updateSend);
  $("#thread-form").addEventListener("submit", function (e) { e.preventDefault(); sendMessage(); });
  $("#newchat-in").addEventListener("input", function () { clearTimeout(ncTimer); ncTimer = setTimeout(loadNewChat, 280); });

  /* ---------- settings + security ---------- */
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  function isStandalone() { return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone; }
  function renderSettings() {
    var u = S.profile, contact = S.user.email || S.user.phone || "";
    var install = "";
    if (!isStandalone()) {
      if (S.installEvt) install = '<button class="row" data-act="install">' + ic(I.install, "ri") + '<div class="rt"><b>Install Orbi</b><span>Add Orbi to your home screen</span></div>' + ic(I.chev, "chev") + "</button>";
      else if (isIOS()) install = '<div class="row">' + ic(I.install, "ri") + '<div class="rt"><b>Install Orbi</b><span>In Safari, tap Share, then Add to Home Screen.</span></div></div>';
    }
    $("#v-settings").innerHTML = '<div class="pad gx">' +
      '<div class="group"><p class="glabel">Appearance</p><div class="seg" role="radiogroup" aria-label="Theme">' +
      [["light", "Light"], ["dark", "Dark"], ["system", "System"]].map(function (t) { return '<button role="radio" data-theme-set="' + t[0] + '" aria-checked="' + (theme === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="group"><p class="glabel">Account</p><div class="card">' +
      '<div class="row">' + ic(I.account, "ri") + '<div class="rt"><b>@' + esc(u.handle) + "</b><span>" + esc(contact) + "</span></div></div>" +
      '<button class="row" data-act="security">' + ic(I.shield, "ri") + '<div class="rt"><b>Security</b><span>Password, sign-in methods, devices</span></div>' + ic(I.chev, "chev") + "</button>" + install + "</div></div>" +
      '<div class="group"><div class="card"><button class="row" data-act="logout" style="color:var(--danger)">' + ic(I.out, "ri") + '<div class="rt"><b>Log out</b></div></button></div></div></div>';
  }
  function renderSecurity() {
    var u = S.user, ids = (u.identities || []).map(function (i) { return i.provider; });
    function method(key, label, ico) {
      var on = ids.indexOf(key) > -1, live = cfg.providers && cfg.providers[key];
      return '<div class="row">' + ico + '<div class="rt"><b>' + label + "</b><span>" + (on ? "Connected" : live ? "Not connected" : "Not available yet") + "</span></div>" + (on ? '<span class="tag ok">Active</span>' : live ? "" : '<span class="tag soon">Coming soon</span>') + "</div>";
    }
    var h = '<div class="pad gx">';
    h += '<div class="group"><p class="glabel">Sign-in methods</p><div class="card">' +
      '<div class="row">' + ic(I.mail, "ri") + '<div class="rt"><b>Email</b><span>' + esc(u.email || "No email added") + "</span></div>" + (u.email ? '<span class="tag ok">Active</span>' : "") + "</div>" +
      method("google", "Google", ic(I.account, "ri")) + method("apple", "Apple", ic(I.account, "ri")) + method("phone", "Phone number", ic(I.device, "ri")) + "</div></div>";
    if (u.email) {
      h += '<div class="group"><p class="glabel">Password</p><div class="card"><button class="row" data-act="pwtoggle" aria-expanded="' + S.pwOpen + '"><div class="rt"><b>Change password</b><span>Use at least 8 characters</span></div>' + ic(I.chev, "chev") + "</button>";
      if (S.pwOpen) {
        h += '<div class="pwform">' + (S.recovery ? "" : '<label class="sr" for="pw-cur">Current password</label><input class="in" id="pw-cur" type="password" placeholder="Current password" autocomplete="current-password">') +
          '<label class="sr" for="pw-new">New password</label><input class="in" id="pw-new" type="password" placeholder="New password" autocomplete="new-password">' +
          '<label class="sr" for="pw-con">Confirm new password</label><input class="in" id="pw-con" type="password" placeholder="Confirm new password" autocomplete="new-password">' +
          '<p class="errl' + (S.pwOk ? " okl" : "") + '" role="alert" id="pw-msg">' + esc(S.pwMsg) + '</p><button class="btn fill" id="pw-save" data-act="pwsave">Update password</button></div>';
      }
      h += "</div></div>";
    }
    h += '<div class="group"><p class="glabel">Protection</p><div class="card"><div class="row"><div class="rt"><b>Two-step verification</b><span>An extra code when you log in</span></div><span class="tag soon">Coming soon</span></div></div></div>';
    h += '<div class="group"><p class="glabel">Devices</p><div class="card">' +
      '<button class="row" data-act="endall">' + ic(I.out, "ri") + '<div class="rt"><b>Log out of all other devices</b><span>Keeps you signed in here</span></div></button></div></div></div>';
    $("#v-security").innerHTML = h;
  }
  async function savePassword() {
    var cur = $("#pw-cur") ? $("#pw-cur").value : "", nw = $("#pw-new").value, con = $("#pw-con").value, msg = "";
    if (!S.recovery && !cur) msg = "Enter your current password."; else if (nw.length < 8) msg = "Use at least 8 characters for the new password."; else if (!S.recovery && nw === cur) msg = "Choose a password you have not used here."; else if (nw !== con) msg = "The new passwords do not match.";
    var m = $("#pw-msg"), btn = $("#pw-save");
    if (msg) { m.textContent = msg; return; }
    btn.classList.add("busy"); m.textContent = "";
    if (!S.recovery) {
      var v = await sb.auth.signInWithPassword({ email: S.user.email, password: cur });
      if (v.error) { btn.classList.remove("busy"); m.textContent = "Your current password is incorrect."; return; }
    }
    var up = await sb.auth.updateUser({ password: nw });
    if (up.error) { btn.classList.remove("busy"); m.textContent = niceErr(up.error); return; }
    S.pwOpen = false; S.recovery = false; renderSecurity(); toast("Password updated.");
  }


  /* ---------- layers (close the top-most thing first) and the phone's back button ---------- */
  function topLayer() {
    if (!$("#lightbox").hidden) return "lightbox";
    if (!$("#sheet").hidden) return "sheet";
    if (!$("#story").hidden) return "story";
    if (!$("#modal").hidden) return "modal";
    if (!$("#compose").hidden) return "compose";
    if (!$("#drawer").hidden) return "drawer";
    return "";
  }
  function closeTopLayer() {
    var l = topLayer();
    if (l === "lightbox") closeLightbox();
    else if (l === "sheet") closeSheet();
    else if (l === "story") finishStories(false);
    else if (l === "modal") cancelModal();
    else if (l === "compose") closeCompose(false);
    else if (l === "drawer") closeDrawer();
    return !!l;
  }
  function cancelModal() {
    if (SC && SC.url) { try { URL.revokeObjectURL(SC.url); } catch (e) {} }
    var hadRU = !!RU; ruCleanup();
    SC = null; RU = null; closeModal();
    if (hadRU) resumeReels();
  }
  var armed = false;
  function armBack() { if (armed) return; try { history.pushState({ orbi: 1 }, ""); armed = true; } catch (e) {} }
  window.addEventListener("popstate", function () {
    armed = false;
    if (!S.user) return;
    if (topLayer()) { closeTopLayer(); armBack(); return; }
    if (S.hist.length) { back(); armBack(); return; }
    if (S.view !== "home") { tabTo("home"); armBack(); return; }
    history.back();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && S.user) closeTopLayer();
  });

  /* ---------- the one place every tap goes through ---------- */
  function rowOf(el) { var a = el.closest(".post"); return a ? findRowByKey(a.dataset.k) || findOrb(a.dataset.id) : null; }
  function reelOf(el) { var a = el.closest(".reel"); return a ? findReel(a.dataset.id) : null; }
  document.addEventListener("click", function (e) {
    var sh = e.target.closest("[data-sheet]");
    if (sh) { var pick = sheetPick, id = sh.dataset.sheet; sheetPick = null; closeSheet(); if (pick) pick(id || null); return; }
    if ($("#app").hidden) return;
    var tg = e.target.closest("[data-theme-set]");
    if (tg) { setTheme(tg.dataset.themeSet); renderSettings(); renderTop(); return; }
    var b = e.target.closest("[data-act]");
    if (!b) {
      var art = e.target.closest(".post:not(.focus)");
      if (art && !e.target.closest("a,button,video,input,textarea,.poll,.qcard,.mg,.mv,.cover") && !(window.getSelection && String(window.getSelection()).length)) openPost(art.dataset.id);
      return;
    }
    var act = b.dataset.act, p, r;
    switch (act) {
      case "link": return; /* let the browser open it */
      case "theme": setTheme(effectiveDark() ? "light" : "dark"); renderTop(); if (S.view === "settings") renderSettings(); break;
      case "top": if (S.view === "home") { loadHome(true); loadTray(); } $("#content").scrollTop = 0; break;
      case "back": back(); break;
      case "menu": openDrawer(); break;
      case "drawerclose": closeDrawer(); break;
      case "drawergo": drawerGo(b.dataset.go); break;
      case "sheetclose": closeSheet(); break;
      case "lbclose": closeLightbox(); break;
      case "modalclose": cancelModal(); break;

      /* writing */
      case "create": openCompose(); break;
      case "closecompose": closeCompose(false); break;
      case "cmpattach": pickFiles("image/*,video/*", true).then(cmpAddFiles); break;
      case "cmprm": { var m = C.media.splice(+b.dataset.i, 1)[0]; if (m) { try { URL.revokeObjectURL(m.url); } catch (x) {} } renderCmpAll(); break; }
      case "cmppoll": if (C.poll) { C.poll = null; } else { clearCmpMedia(); C.poll = { opts: ["", ""], dur: 1440 }; } renderCmpAll(); if (C.poll) { var pi = $("#cmp-poll input"); if (pi) pi.focus(); } break;
      case "cmppolloff": C.poll = null; renderCmpAll(); break;
      case "cmppolladd": if (C.poll.opts.length < 4) { C.poll.opts.push(""); renderCmpPoll(); updateComposer(); } break;
      case "cmppolldel": C.poll.opts.splice(+b.dataset.i, 1); renderCmpPoll(); updateComposer(); break;
      case "cmpsens": C.sensitive = !C.sensitive; renderCmpTools(); break;
      case "cmpquoteoff": C.quote = null; renderCmpAll(); break;

      /* orbs */
      case "like": p = rowOf(b); if (p) toggleOrbRel("likes", p, "liked_by_me", "like_count"); break;
      case "reorb": p = rowOf(b); if (p) reorbMenu(p); break;
      case "bookmark": p = rowOf(b); if (p) toggleOrbRel("bookmarks", p, "bookmarked_by_me", null); break;
      case "share": p = rowOf(b); if (p) shareMenu("Share orb", p.body, "orb/" + p.id); break;
      case "reply": p = rowOf(b); if (p) openCompose({ reply: { id: p.id, handle: p.handle } }); break;
      case "replyfocus": if (S.post && S.post.focus) openCompose({ reply: { id: S.post.focus.id, handle: S.post.focus.handle } }); break;
      case "more": p = rowOf(b); if (p) orbMore(p); break;
      case "openpost": openPost(b.dataset.id); break;
      case "openquote": openPost(b.dataset.qid); break;
      case "vote": p = rowOf(b); if (p) votePoll(p, +b.dataset.i); break;
      case "opencover": p = rowOf(b); if (p) { S.opened[p.id] = true; repaint(p.id); } break;
      case "img": p = rowOf(b); if (p) openLightbox(p.media.map(function (x) { return x.url; }), +b.dataset.i); break;
      case "vtoggle": { var v = $("video", b); if (v) { if (v.paused) { delete v.dataset.paused; v.play().catch(function () {}); } else { v.dataset.paused = "1"; v.pause(); } b.classList.toggle("paused", v.paused); } break; }
      case "vmute": { var vv = $("video", b.parentNode); if (vv) { vv.muted = !vv.muted; b.innerHTML = ic(vv.muted ? I.mute : I.volume); b.setAttribute("aria-label", vv.muted ? "Unmute" : "Mute"); } break; }
      case "pollbox": break;
      case "mention": e.preventDefault(); openUserByHandle(b.dataset.h); break;
      case "tag": e.preventDefault(); searchTag(b.dataset.tag); break;
      case "deeplink": e.preventDefault(); routeTo(b.dataset.hash); break;

      /* people */
      case "avatar": avatarTap(b.dataset.uid, +b.dataset.st); break;
      case "openuser": openUser(b.dataset.id); break;
      case "orbit": toggleOrbit(b.dataset.id); break;
      case "people": if (S.pf && S.pf.profile) openPeople(S.pf.id, S.pf.profile.display_name, b.dataset.t); break;
      case "peopletab": S.params.tab = b.dataset.t; loadPeople(); break;
      case "ptab": S.pf.tab = b.dataset.t; renderProfile(); loadProfileTab(!!S.pf.lists[S.pf.tab]); break;
      case "bmtab": S.bm.tab = b.dataset.t; S.bm.loaded = false; loadBookmarks(); break;
      case "messageuser": if (S.pf && S.pf.profile) openThread(S.pf.id); break;
      case "usermore": userMore(); break;
      case "viewbanner": if (S.pf && S.pf.profile && S.pf.profile.banner_url) openLightbox([S.pf.profile.banner_url], 0); break;
      case "edit": openEditProfile(); break;
      case "saveprofile": saveEditProfile(); break;
      case "pickavatar": pickProfileImage("avatar"); break;
      case "pickbanner": pickProfileImage("banner"); break;
      case "note": noteTap(b); break;
      case "settings": go("settings"); break;
      case "security": go("security"); break;

      /* stories */
      case "addstory": openStoryCreate(); break;
      case "traystory": openTrayStory(b.dataset.uid); break;
      case "svclose": finishStories(false); break;
      case "svprofile": { var su = curStory().u.uid; finishStories(false); openUser(su); break; }
      case "svviews": showStoryViewers(); break;
      case "svdelete": deleteCurrentStory(); break;
      case "svreel": { var rs = curStory().s.reel; if (rs) { finishStories(false); openReelById(rs.id); } break; }
      case "scpick": scPick(); break;
      case "sctext": SC.kind = "text"; renderStoryCreate(); setTimeout(function () { var t = $("#sc-text"); if (t) t.focus(); }, 0); break;
      case "scback": if (SC.url) { try { URL.revokeObjectURL(SC.url); } catch (x) {} } openStoryCreate(); break;
      case "scbg": SC.text = $("#sc-text").value; SC.bg = +b.dataset.i; renderStoryCreate(); break;
      case "scshare": scShare(); break;

      /* reels */
      case "reeltap": reelTap(b.closest(".reel"), e); break;
      case "reelmute": S.reelMuted = !S.reelMuted; syncMuteBtn(); { var av_ = reelVideo(S.reels.idx); if (av_) av_.muted = S.reelMuted; RS.mute(S.reelMuted); } break;
      case "rsound": r = reelOf(b); if (r) openSoundPage(r); break;
      case "rusound": ruSetCap(); openSoundPicker(); break;
      case "rusoundx": ruSetCap(); if (RU.sound && RU.sound.blob) { try { URL.revokeObjectURL(RU.sound.url); } catch (x) {} } RU.sound = null; renderReelUpload(); break;
      case "rumute": { var pv_ = $("#ru-vid"); if (pv_) { pv_.muted = !pv_.muted; if (RU.sync) RU.sync.mute(pv_.muted); ruMuteBtn(); } break; }
      case "reelnew": openReelUpload(); break;
      case "rlike": r = reelOf(b); if (r) toggleReelRel("reel_likes", r, "liked_by_me", "like_count"); break;
      case "rreorb": r = reelOf(b); if (r) toggleReelRel("reel_reorbs", r, "reorbed_by_me", "reorb_count"); break;
      case "rsave": r = reelOf(b); if (r) toggleReelRel("reel_saves", r, "saved_by_me", null); break;
      case "rcomment": r = reelOf(b); if (r) openReelComments(r); break;
      case "rshare": r = reelOf(b); if (r) { pauseReels(); reelShare(r); } break;
      case "rmore": r = reelOf(b); if (r) reelMore(r); break;
      case "rfollow": r = reelOf(b); if (r) toggleOrbit(r.author_id); break;
      case "rcap": b.classList.toggle("open"); break;
      case "reelgrid": { var list = S.view === "bookmarks" ? S.bm.reels : (S.pf && S.pf.lists.reels) || []; openReels(list, +b.dataset.i); break; }
      case "rupick": ruPick(); break;
      case "ruback": { var keep = RU.sound; if (RU.sync) RU.sync.stop(); if (RU.url) { try { URL.revokeObjectURL(RU.url); } catch (x) {} } RU.blob = null; RU.url = ""; RU.sound = keep; renderReelUpload(); break; }
      case "rushare": ruShare(); break;
      case "cmtdel": sb.from("reel_comments").delete().eq("id", b.dataset.id).then(function (res) { if (res.error) toast(niceErr(res.error)); else loadReelComments(); }); break;
      case "sendto": sendTo(b.dataset.id, b.dataset.name); break;

      /* chat and account */
      case "newchat": go("newchat"); break;
      case "openthread": openThread(b.dataset.id); break;
      case "logout": logout(); break;
      case "pwtoggle": S.pwOpen = !S.pwOpen; S.pwMsg = ""; S.pwOk = false; renderSecurity(); break;
      case "pwsave": savePassword(); break;
      case "endall": sb.auth.signOut({ scope: "others" }).then(function (res) { toast(res.error ? niceErr(res.error) : "Logged out of all other devices."); }); break;
      case "install": if (S.installEvt) { S.installEvt.prompt(); S.installEvt.userChoice.then(function () { S.installEvt = null; renderSettings(); }); } break;
    }
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id === "cmt-form") { e.preventDefault(); postReelComment(); }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "cmt-in") { var s = $("#cmt-send"); if (s) s.disabled = !e.target.value.trim(); }
  });
  function noteTap(b) {
    var t = b.dataset.type;
    if (t === "orbit") { if (b.dataset.uid) openUser(b.dataset.uid); }
    else if (b.dataset.reel) openReelById(b.dataset.reel);
    else if (b.dataset.orb) openPost(b.dataset.orb);
  }
  async function userMore() {
    var u = S.pf && S.pf.profile; if (!u) return;
    var items = [{ id: "copy", icon: I.link, label: "Copy profile link" }, { id: "msg", icon: I.chat, label: "Send a message" }];
    var id = await actionSheet(items, "@" + u.handle);
    if (id === "copy") copyText(link("u/" + u.handle)).then(function (ok) { toast(ok ? "Link copied." : "Could not copy the link."); });
    else if (id === "msg") openThread(u.id);
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); S.installEvt = e; if (S.view === "settings" && S.user) renderSettings(); });

  /* ---------- go ---------- */
  if ("serviceWorker" in navigator && /^https:$|^http:$/.test(location.protocol) && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  boot();
})();

