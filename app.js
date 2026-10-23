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
    if (/suspended/i.test(m)) return "Your account is suspended, so you can't post right now. Contact support from Settings if you think this is a mistake.";
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
  function actionSheet(items, title, desc, opt) {
    opt = opt || {};
    return new Promise(function (res) {
      var h = (title ? '<p class="sh-title">' + esc(title) + "</p>" : "") + (desc ? '<p class="sh-desc">' + esc(desc) + "</p>" : "") +
        items.map(function (it) {
          return (it.sep ? '<i class="sh-sep"></i>' : "") + '<button class="sh-item' + (it.danger ? " danger" : "") + '" data-sheet="' + esc(it.id) + '">' + (it.icon ? ic(it.icon) : "") + "<span><b>" + esc(it.label) + "</b>" + (it.sub ? "<small>" + esc(it.sub) + "</small>" : "") + "</span></button>";
        }).join("") + (opt.ig ? "" : '<button class="sh-cancel" data-sheet="">Cancel</button>');
      closeSheet(); openSheet(h, { label: title || "Options" }); sheetPick = res;
      if (opt.ig) $("#sheet").classList.add("ig");
    });
  }
  /* a small menu that drops down from a button (used for filters and "more" menus) */
  function popMenu(items, o) {
    o = o || {};
    return new Promise(function (res) {
      var w = $("#sheet"), pos = "top:56px;right:12px";
      if (o.anchor) {
        var r = o.anchor.getBoundingClientRect(), a = $("#app").getBoundingClientRect();
        pos = "top:" + Math.round(r.bottom - a.top + 6) + "px;right:" + Math.max(8, Math.round(a.right - r.right)) + "px";
      }
      closeSheet();
      w.className = "sheetwrap popwrap";
      w.innerHTML = '<div class="scrim clear" data-act="sheetclose"></div><div class="popm" role="menu" style="' + pos + '">' + items.map(function (it) {
        return '<button class="pm-item' + (it.danger ? " danger" : "") + (it.sep ? " sep" : "") + (it.lead ? " lead" : "") + '" role="menuitem" data-sheet="' + esc(it.id) + '">' + (it.lead && it.icon ? ic(it.icon) : "") + "<span>" + esc(it.label) + "</span>" + (it.lead ? (it.check ? ic(I.check, "pmck") : "") : (it.icon ? ic(it.icon) : "")) + "</button>";
      }).join("") + "</div>";
      w.hidden = false; sheetOnClose = null; sheetPick = res;
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
  function pickFiles(accept, multiple, capture) {
    return new Promise(function (res) {
      var i = $("#filepick"); i.value = ""; i.accept = accept; i.multiple = !!multiple;
      if (capture) i.setAttribute("capture", capture); else i.removeAttribute("capture");
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
    f = $("#fab2"); if (f) f.hidden = true;
    stopStory(true); pauseReels(); stopRec(false); stopVoice();
  }
  function goAuth() {
    S.user = null; S.profile = null; S.me = null;
    document.body.classList.add("on-auth");
    $("#splash").hidden = true; $("#app").hidden = true; $("#auth").hidden = false;
    hideLayers();
    S.thread = null; S.threadMsgs = []; S.pendingMsgs = []; S.chatThreads = []; S.chatUnread = 0; S.cp = {}; S.blocked = {}; S.muted = {}; S.replyTo = null; S.threadQ = ""; S.setQ = "";
    PREFS = Object.assign({}, PREF_DEF, { words: [] }); DMPERM = "everyone"; applyPrefs();
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
    try { localStorage.setItem("orbi-returning", "1"); } catch (e) {}
    S.profile = pr.data; S.hist = []; S.feed = "foryou"; S.trayLoaded = false;
    loadLocalPrefs(); resetComposer(); armBack();
    document.body.classList.remove("on-auth");
    $("#splash").hidden = true; $("#auth").hidden = true; $("#app").hidden = false;
    $("#search-in").value = ""; S.searchQ = "";
    await Promise.all([loadFollowing(), loadMe(), loadSafety(), loadServerPrefs()]);
    await loadUnread();
    try {
      var st = await sb.from("account_status").select("banned_at").eq("user_id", user.id).maybeSingle();
      if (st && st.data && st.data.banned_at) setTimeout(function () { toast("Your account is suspended. You can browse but not post."); }, 900);
    } catch (e) {}
    if (S.recovery) { show("setpage", { k: "password" }); toast("Choose a new password."); }
    else show("home");
    if (S.recovery) { /* stay on the password page */ }
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
    var off = offTypes(), nq = sb.from("notifications").select("id", { count: "exact", head: true }).eq("read", false);
    if (off.length) nq = nq.not("type", "in", "(" + off.join(",") + ")");
    var res = await Promise.all([nq, loadChat(true)]);
    S.unread = res[0].count || 0; renderTabbar();
  }
  setInterval(function () { if (S.user && !document.hidden) loadUnread(); }, 60000);
  /* chat refresh: the open conversation or chat list checks for new messages every few seconds */
  var tick = 0;
  setInterval(function () {
    if (!S.user || document.hidden) return;
    tick++;
    if (S.view === "thread") loadThread(true);
    else if (S.view === "chat" || S.view === "requests") loadChat(true);
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
  var TITLES = { settings: "Settings", newchat: "New message", requests: "Message requests", post: "Orb", bookmarks: "Bookmarks", chatmedia: "Media, links, voice" };
  function topTitle(v) {
    if (v === "thread") return S.thread ? dispName(S.thread) : "Chat";
    if (v === "setpage") return setTitle();
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
    else if (v === "setpage" && params && params.k === "chatset") S.tab = "chat";
    else if (v === "settings" || v === "setpage" || v === "bookmarks") S.tab = "profile";
    else if (v === "thread" || v === "newchat" || v === "requests" || v === "chatinfo" || v === "chatmedia") S.tab = "chat";
    if (v !== "thread" && v !== "chatmedia") stopVoice();
    if (v !== "thread") stopRec(false);
    closeDrawer(); closeSheet();
    $$("#content > section").forEach(function (s) { s.hidden = s.dataset.view !== v; });
    var app = $("#app");
    app.classList.toggle("in-thread", v === "thread" || v === "chatinfo" || v === "chatmedia"); app.classList.toggle("in-reels", v === "reels"); app.classList.toggle("in-explore", v === "explore");
    $("#fab").hidden = v !== "home"; $("#fab2").hidden = v !== "chat";
    renderTop(); renderTabbar();
    $("#content").scrollTop = 0;
    if (v === "home") { renderFeed(); renderTray(); loadHome(S.lists.home.length > 0); loadTray(); }
    else if (v === "explore") loadExplore();
    else if (v === "reels") showReels();
    else if (v === "alerts") loadAlerts();
    else if (v === "chat") { renderChatList(); loadChat(); }
    else if (v === "newchat") { $("#newchat-in").value = S.ncPre || ""; S.ncPre = ""; loadNewChat(); }
    else if (v === "thread") renderThread(true);
    else if (v === "requests") { renderRequests(); loadChat(); }
    else if (v === "chatinfo") renderChatInfo();
    else if (v === "chatmedia") loadChatMedia();
    else if (v === "soon") renderSoon();
    else if (v === "profile") openOwnProfile();
    else if (v === "user") loadUserView();
    else if (v === "post") loadPost();
    else if (v === "bookmarks") loadBookmarks();
    else if (v === "people") loadPeople();
    else if (v === "settings") renderSettings();
    else if (v === "setpage") renderSetPage();
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
    t.className = "topbar gx";
    if (v === "chat") {
      t.innerHTML = '<button class="iconbtn" data-act="menu" aria-label="Open menu">' + avInner(S.profile.display_name, S.profile.avatar_url, 32) + '</button><div class="mid">Chat</div><button class="pillbtn" data-act="chatfilter" aria-haspopup="menu" aria-label="Filter chats">' + FILTERS[S.chatFilter] + ic(I.down) + "</button>";
      t.classList.add("tb-chat"); return;
    }
    if (v === "thread" && S.thread) {
      t.innerHTML = '<button class="iconbtn" data-act="back" aria-label="Back">' + ic(I.back) + '</button><button class="tbwho" data-act="chatinfo" aria-label="Conversation info">' + avInner(S.thread.display_name, S.thread.avatar_url, 36) + '<span><b>' + esc(dispName(S.thread)) + "</b><small>@" + esc(S.thread.handle) + "</small></span></button>" +
        '<button class="iconbtn" data-act="callsoon" aria-label="Voice call">' + ic(I.phone) + '</button><button class="iconbtn" data-act="callsoon" aria-label="Video call">' + ic(I.video) + '</button><button class="iconbtn" data-act="threadmore" aria-label="More" aria-haspopup="menu">' + ic(I.more) + "</button>";
      t.classList.add("tb-thread"); return;
    }
    if (v === "chatinfo") {
      t.innerHTML = '<button class="iconbtn" data-act="back" aria-label="Back">' + ic(I.back) + '</button><div class="mid"></div><button class="iconbtn" data-act="nickedit" aria-label="Edit nickname">' + ic(I.pencil) + "</button>";
      return;
    }
    if (v === "settings" || v === "setpage") {
      t.innerHTML = '<button class="iconbtn" data-act="back" aria-label="Back">' + ic(I.back) + '</button><div class="mid left"><b>' + esc(title) + "</b><small>" + esc(setHandle()) + "</small></div>" + themeBtn();
      t.classList.add("tb-set"); return;
    }
    if (title) t.innerHTML = '<button class="iconbtn" data-act="back" aria-label="Back">' + ic(I.back) + '</button><div class="mid">' + esc(title) + "</div>" +
      (v === "user" ? '<button class="iconbtn" data-act="usermore" aria-label="More">' + ic(I.more) + "</button>" : themeBtn());
    else {
      t.innerHTML = '<button class="tbstory" data-act="addstory" aria-label="Add to your story"><span class="plus">' + ic(I.plus) + '</span><small>your story</small></button><button class="iconbtn" style="width:auto;margin:0 auto" data-act="top" aria-label="Orbi, back to top"><span class="ring" style="width:28px;color:var(--accent)"></span></button><button class="iconbtn" data-act="menu" aria-label="Open menu">' + avInner(S.profile.display_name, S.profile.avatar_url, 32) + "</button>";
      t.classList.add("tb-home");
    }
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
  var mode = "signup", aview = "options", pendingEmail = "";
  /* a device that has logged in before opens on Log in; a brand new visitor opens on Sign up */
  try { if (localStorage.getItem("orbi-returning")) { mode = "login"; aview = "email"; } } catch (e) {}
  var MAIL = ic(I.mail);
  function renderAuth() {
    var su = mode === "signup";
    $("#auth-title").textContent = aview === "confirm" ? "Check your email." : su ? "Join the orbit." : "Welcome back.";
    $("#auth-sub").textContent = aview === "confirm" ? "One more step to finish your account." : su ? "Create your Orbi account in a minute." : "Log in to see what is moving in your orbit.";
    var sw = $("#auth-switch");
    sw.hidden = aview === "confirm";
    sw.innerHTML = su ? 'Already have an account? <button type="button" class="linkbtn" data-mode="login">Click here to log in</button>'
      : '<button type="button" class="linkbtn" data-mode="signup">Create another account</button>';
    var h = "", p = $("#auth-panel");
    if (!su && aview !== "confirm") aview = "email";
    if (aview === "options") {
      h += '<button class="abtn solid" data-a="google">' + GOOGLE + "Continue with Google" + "</button>";
      h += '<div class="or">or</div>';
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
    else if (a === "back" || a === "toLogin") { if (a === "toLogin") mode = "login"; aview = mode === "signup" ? "options" : "email"; renderAuth(); }
    else if (a === "google") oauth(a);
    else if (a === "showpw") { var f = $("#a-pass"), show = f.type === "password"; f.type = show ? "text" : "password"; b.textContent = show ? "Hide" : "Show"; b.setAttribute("aria-label", show ? "Hide password" : "Show password"); }
    else if (a === "forgot") forgot();
    else if (a === "emailgo") emailGo();
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
      .then(function (j) { if (j && j.external) PROV = { google: !!j.external.google }; })
      .catch(function () {});
  }
  function provOn(p) { return PROV ? !!PROV[p] : !!(cfg.providers && cfg.providers[p]); }
  loadProviders();
  function oauth(p) {
    var label = "Google";
    if (!provOn(p)) return toast(label + " sign-in is not switched on yet. Use email for now.");
    toast("Opening " + label + "...");
    sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: redirectUrl() } }).then(function (r) { if (r.error) toast(niceErr(r.error)); });
  }
  /* people who join with Google get a placeholder handle; let them pick their own once */
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
    if (p.sensitive && !S.opened[p.id] && !PREFS.showSensitive) return coverHTML(p.id);
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
    else { var rows = r.data || [], shown = vis(rows); S.lists.home = more ? S.lists.home.concat(shown) : shown; S.homeEnd = rows.length < 30; }
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
        if (e.isIntersecting && e.intersectionRatio > 0.6 && PREFS.autoplay && !PREFS.dataSaver) { if (!v.dataset.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } }
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
  function resetComposer() { C = { media: [], sensitive: !!PREFS.markSensitive, poll: null, quote: null, reply: null, busy: false }; }
  function cmpHasContent() { return !!($("#composer-text").value.trim() || C.media.length || C.poll || C.quote); }
  function openCompose(o) {
    o = o || {};
    resetComposer(); C.reply = o.reply ? { id: o.reply.id, handle: o.reply.handle } : null; C.quote = o.quote || null;
    $("#composer-text").value = "";
    $("#composer-av").innerHTML = avSelf(44, true);
    $("#composer-text").placeholder = C.reply ? "Post your reply" : C.quote ? "Add a comment" : "What's happening?";
    $("#composer-post").textContent = C.reply ? "Reply" : "Orb";
    $("#cmp-aud").hidden = !!(C.reply || C.quote); $("#cmp-rep").hidden = !!C.reply;
    $("#composer-text").style.height = "";
    if (o.text) { $("#composer-text").value = o.text; }
    updateDraftBtn();
    $("#compose").hidden = false; $("#cmp-progress").hidden = true;
    renderCmpAll();
    setTimeout(function () { $("#composer-text").focus(); }, 0);
  }
  function renderCmpAll() { renderCmpCtx(); renderCmpMedia(); renderCmpPoll(); renderCmpQuote(); renderCmpTools(); updateComposer(); }
  function renderCmpCtx() {
    var c = $("#cmp-ctx");
    c.innerHTML = C.reply ? '<p class="cx-replying">Replying to <b>@' + esc(C.reply.handle) + "</b></p>" : "";
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
      '<button class="iconbtn" data-act="cmpsens" aria-label="Mark as sensitive" aria-pressed="' + !!C.sensitive + '">' + ic(I.eyeoff) + "</button>" +
      '<span class="grow"></span>' +
      (n > 0 ? '<span class="cring' + (left < 0 ? " over" : left <= 20 ? " warn" : "") + '"><svg viewBox="0 0 26 26" aria-hidden="true"><circle class="bg" cx="13" cy="13" r="' + r + '"/><circle class="fg" cx="13" cy="13" r="' + r + '" style="stroke-dasharray:' + (circ * frac).toFixed(1) + " " + circ.toFixed(1) + '"/></svg>' + (left <= 20 ? "<em>" + left + "</em>" : "") + "</span>" : "");
  }
  function composeValid() {
    var t = $("#composer-text").value, n = t.trim().length;
    if (t.length > 280) return false;
    if (C.poll) return n > 0 && C.poll.opts.filter(function (o) { return o.trim(); }).length >= 2;
    return n > 0 || C.media.length > 0 || !!C.quote;
  }
  function updateComposer() { $("#composer-post").disabled = C.busy || !composeValid(); renderCmpTools(); autoGrow(); }
  function autoGrow() { var t = $("#composer-text"); t.style.height = "auto"; t.style.height = Math.max(56, t.scrollHeight) + "px"; }
  /* drafts (text only, kept on this device) */
  function draftKey() { return "orbi-drafts-" + (S.user ? S.user.id : "x"); }
  function getDrafts() { try { return JSON.parse(localStorage.getItem(draftKey()) || "[]") || []; } catch (e) { return []; } }
  function setDrafts(a) { try { localStorage.setItem(draftKey(), JSON.stringify(a.slice(0, 20))); } catch (e) {} updateDraftBtn(); }
  function updateDraftBtn() { var b = $("#cmp-drafts"); if (b) b.hidden = !!(C && (C.reply || C.quote)) || !getDrafts().length; }
  async function openDrafts() {
    var d = getDrafts(); if (!d.length) return;
    var items = d.map(function (x, i) { return { id: "d" + i, label: x.t.length > 70 ? x.t.slice(0, 70) + "..." : x.t, sub: ago(new Date(x.ts).toISOString()) }; });
    items.push({ id: "clear", label: "Delete all drafts", danger: true });
    var r = await actionSheet(items, "Drafts");
    if (!r) return;
    if (r === "clear") { setDrafts([]); return; }
    var i = +r.slice(1), x = d[i]; if (!x) return;
    d.splice(i, 1); setDrafts(d);
    $("#composer-text").value = x.t; updateComposer(); $("#composer-text").focus();
  }
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
      var t = $("#composer-text").value.trim();
      if (t && !C.reply && !C.quote && !C.media.length && !C.poll) {
        var r = await actionSheet([{ id: "save", label: "Save draft" }, { id: "del", label: "Delete", danger: true }], "Save post?", "You can save this to send later from your drafts.");
        if (!r) return;
        if (r === "save") { var dd = getDrafts(); dd.unshift({ t: t, ts: Date.now() }); setDrafts(dd); toast("Draft saved."); }
      } else {
        var ok = await confirmSheet("Discard this orb?", "What you wrote won't be saved.", "Discard", true);
        if (!ok) return;
      }
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

  /* ---------- explore, the X way: tabs, news, trends, who to follow ---------- */
  var PEOPLE_COLS = "id,handle,display_name,bio,avatar_url,has_story,story_unseen";
  var XI = {
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    news: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h6M7 13h10M7 16h10"/><rect x="15" y="8" width="2.5" height="2.5"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/><path d="M12 3v4M16 10l4-1M14.5 15l2.5 4M9.5 15L7 19M8 10L4 9"/>',
    ent: '<path d="M4 8a2 2 0 0 0 0 4v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5a2 2 0 0 0 0-4V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1z"/><path d="M12 6v12" stroke-dasharray="2 2.5"/>',
    dots: '<circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/>'
  };
  var XTABS = [["explore", "Explore", null], ["trending", "Trending", XI.trend], ["news", "News", XI.news], ["sports", "Sports", XI.ball], ["ent", "Entertainment", XI.ent]];
  var XCATS = [
    ["Sports", /\b(football|soccer|goal|goals|match|fixture|league|premier|ucl|fc|madrid|barca|arsenal|chelsea|liverpool|city|united|super eagles|nba|nfl|ballon|ronaldo|messi|salah|boxing|ufc|tennis|olympic|coach|striker|sevilla|clasico|score|transfer)\b/i],
    ["Music", /\b(music|song|songs|album|ep|single|concert|afrobeats?|amapiano|rapper|dj|lyrics|burna|wizkid|davido|asake|tiwa|playlist|gig)\b/i],
    ["Entertainment", /\b(movie|movies|film|nollywood|bbn|bbnaija|series|netflix|tv|show|celebrity|celeb|actor|actress|premiere|trailer|reality|comedy|skit|award|awards)\b/i],
    ["Politics", /\b(election|elections|president|presidency|senate|senator|governor|vote|votes|voting|apc|pdp|inec|tinubu|obi|atiku|minister|government|policy|parliament|congress|politics|party)\b/i],
    ["Business & finance", /\b(market|naira|dollar|bitcoin|btc|crypto|stock|stocks|bank|banks|economy|inflation|business|startup|invest|investing|finance|price|prices|fuel|tax|salary)\b/i],
    ["Technology", /\b(tech|ai|app|apps|software|code|coding|developer|dev|iphone|android|google|openai|startup|gadget|laptop)\b/i],
    ["Fashion & beauty", /\b(fashion|style|outfit|makeup|beauty|skincare|hair|ankara|wig|runway)\b/i]
  ];
  var XGROUP = { sports: ["Sports"], ent: ["Entertainment", "Music", "Fashion & beauty"] };
  function xCat(text) {
    for (var i = 0; i < XCATS.length; i++) if (XCATS[i][1].test(text)) return XCATS[i][0];
    return "";
  }
  S.xtab = "explore"; S.xhide = {}; S.xdata = null; S.trending = [];
  function xHeadline(body) {
    var t = String(body || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    var m = t.match(/^(.{20,140}?[.!?])(\s|$)/);
    return (m ? m[1] : t.slice(0, 140) + (t.length > 140 ? "…" : ""));
  }
  function xAgo(iso) {
    var m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return "Trending now";
    var h = Math.floor(m / 60); if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    var d = Math.floor(h / 24); return d + (d === 1 ? " day ago" : " days ago");
  }
  /* turn the last two weeks of orbs into trends and news */
  function xBuild(orbs) {
    var tags = {}, now = Date.now();
    orbs.forEach(function (o) {
      (String(o.body || "").match(/#[\p{L}\p{N}_]{2,40}/gu) || []).forEach(function (t) {
        var k = t.toLowerCase(), e = tags[k] || (tags[k] = { tag: k, disp: t, n: 0, last: 0, text: "", orbs: [] });
        e.n++; e.orbs.push(o); e.last = Math.max(e.last, new Date(o.created_at).getTime()); e.text += " " + o.body;
      });
    });
    var trends = Object.keys(tags).map(function (k) { var e = tags[k]; e.cat = xCat(e.text); e.score = e.n * 4 + Math.max(0, 14 - (now - e.last) / 864e5); return e; })
      .sort(function (a, b) { return b.score - a.score; }).slice(0, 30);
    var news = orbs.filter(function (o) { return xHeadline(o.body).length >= 12; }).map(function (o) {
      var eng = Number(o.like_count || 0) + Number(o.reorb_count || 0) * 2 + Number(o.reply_count || 0) * 1.5, age = (now - new Date(o.created_at).getTime()) / 36e5;
      var tg = (String(o.body).match(/#[\p{L}\p{N}_]{2,40}/u) || [""])[0].toLowerCase(), grp = tg && tags[tg] ? tags[tg].orbs : [o];
      var seen = {}, who = [];
      [o].concat(grp).forEach(function (x) { if (!seen[x.author_id] && who.length < 3) { seen[x.author_id] = 1; who.push(x); } });
      return { o: o, title: xHeadline(o.body), cat: xCat(o.body + " " + (tg && tags[tg] ? tags[tg].text : "")), posts: grp.length > 1 ? grp.length : Math.max(1, Math.round(eng)), who: who, score: (eng + 1) / Math.pow(age + 2, 0.7) };
    }).sort(function (a, b) { return b.score - a.score; }).slice(0, 12);
    return { trends: trends, news: news };
  }
  async function loadExplore() {
    S.searchQ = $("#search-in").value.trim();
    xHead();
    if (S.searchQ) return runSearch();
    if (!S.xdata) $("#explore-body").innerHTML = skel(3);
    var tok = ++S.searchToken, since = new Date(Date.now() - 14 * 864e5).toISOString();
    var res = await Promise.all([
      sb.from("profile_cards").select(PEOPLE_COLS).neq("id", S.user.id).order("created_at", { ascending: false }).limit(12),
      sb.from("orb_feed").select("*").is("reply_to", null).gte("created_at", since).order("created_at", { ascending: false }).limit(300)
    ]);
    if (tok !== S.searchToken) return;
    S.people = visPeople(res[0].data); S.lists.explore = vis(res[1].data);
    S.xdata = xBuild(S.lists.explore);
    S.trending = S.xdata.trends;
    renderExploreBody();
  }
  function xHead() {
    var l = $("#xh-l"), r = $("#xh-r"); if (!l || !r || !S.profile) return;
    l.innerHTML = '<button class="iconbtn xbk" data-act="xback" aria-label="Back">' + ic(I.back) + "</button>";
    r.innerHTML = '<button class="iconbtn xav" data-act="menu" aria-label="Open menu">' + avInner(S.profile.display_name, S.profile.avatar_url, 32) + "</button>";
    $("#v-explore").classList.toggle("searching", !!S.searchQ);
  }
  function xTabsHTML() {
    return XTABS.map(function (t) {
      var on = S.xtab === t[0];
      return '<button role="tab" class="xtab' + (on ? " on" : "") + '" data-act="xtab" data-t="' + t[0] + '" aria-selected="' + on + '">' + (on && t[2] ? ic(t[2]) : "") + "<span>" + t[1] + "</span></button>";
    }).join("");
  }
  function xNewsRow(n) {
    var av = n.who.map(function (w) { return avInner(w.display_name, w.avatar_url, 20); }).join("");
    return '<div class="xnews" data-act="openpost" data-id="' + n.o.id + '" role="link" tabindex="0"><div class="xnt">' + esc(n.title) + '</div><div class="xnm"><span class="xst">' + av + "</span><span>" + xAgo(n.o.created_at) + (n.cat ? " · " + esc(n.cat) : "") + " · " + num(n.posts) + (n.posts === 1 ? " orb" : " orbs") + "</span></div></div>";
  }
  function xTrendRow(t, i) {
    var lead = i != null ? (i + 1) + " • " + (t.cat ? esc(t.cat) + " • Trending" : "Trending in Orbi") : (t.cat ? esc(t.cat) + " · Trending" : "Trending in Orbi");
    return '<div class="xtr" data-act="tag" data-tag="' + esc(t.tag.slice(1)) + '" role="link" tabindex="0"><div class="xtl"><small>' + lead + "</small><b>" + esc(t.disp) + "</b>" + (i != null ? "<small>" + num(t.n) + (t.n === 1 ? " orb" : " orbs") + "</small>" : "") + '</div><button class="xdots" data-act="xmore" data-tag="' + esc(t.tag) + '" aria-label="More options for ' + esc(t.disp) + '">' + ic(XI.dots) + "</button></div>";
  }
  function xTrends(list) { return list.filter(function (t) { return !S.xhide[t.tag]; }); }
  function xEmpty(msg) { return '<p class="muted xempty">' + msg + "</p>"; }
  function renderExploreBody() {
    var b = $("#explore-body"), q = S.searchQ, h = "";
    xHead();
    $("#xtabs").innerHTML = xTabsHTML();
    if (q) {
      h += '<div class="pad gx" style="padding-top:0"><div class="sect">People</div>' + (S.people.length ? S.people.map(personRow).join("") : '<p class="muted">No people match "' + esc(q) + '".</p>') + "</div>";
      h += '<div class="pad gx" style="padding-top:0"><div class="sect">Orbs</div></div>' + (S.lists.explore.length ? '<div class="flush">' + S.lists.explore.map(function (p) { return postHTML(p); }).join("") + "</div>" : '<p class="muted gx">No orbs match "' + esc(q) + '".</p>');
      b.innerHTML = h; return;
    }
    var d = S.xdata || { trends: [], news: [] }, tr = xTrends(d.trends), t = S.xtab;
    if (t === "explore") {
      if (d.news.length) h += '<div class="xsec">Today\'s News</div>' + d.news.slice(0, 3).map(xNewsRow).join("");
      h += tr.slice(0, 6).map(function (x) { return xTrendRow(x); }).join("");
      h += '<div class="xsec">Who to follow</div>' + (S.people.length ? '<div class="gx">' + S.people.slice(0, 4).map(personRow).join("") + "</div>" : xEmpty("No one else has joined yet. Invite a friend to be first in your orbit."));
      if (!d.news.length && !tr.length) h = xEmpty("Nothing is trending yet. Post an orb with a #hashtag to start one.") + h;
      h += tr.slice(6, 12).map(function (x) { return xTrendRow(x); }).join("");
    } else if (t === "trending") {
      h += '<div class="xban"><div><b>Global Trending</b><span>The most popular orbs</span><button class="btn sm" data-act="xtab" data-t="explore">Explore</button></div><i aria-hidden="true"></i></div>';
      h += tr.length ? tr.slice(0, 20).map(function (x, i) { return xTrendRow(x, i); }).join("") : xEmpty("Nothing is trending yet.");
    } else if (t === "news") {
      h += d.news.length ? d.news.map(xNewsRow).join("") : "";
      h += tr.slice(0, 12).map(function (x) { return xTrendRow(x); }).join("");
      if (!d.news.length && !tr.length) h = xEmpty("No news yet.");
    } else {
      var g = XGROUP[t], nn = d.news.filter(function (n) { return g.indexOf(n.cat) > -1; }), tt = tr.filter(function (x) { return g.indexOf(x.cat) > -1; });
      h += nn.map(xNewsRow).join("") + tt.map(function (x) { return xTrendRow(x); }).join("");
      if (!nn.length && !tt.length) h = xEmpty("Nothing in " + (t === "sports" ? "Sports" : "Entertainment") + " yet.");
    }
    b.innerHTML = h;
  }
  function xSetTab(t) {
    S.xtab = t; renderExploreBody();
    var on = $("#xtabs .xtab.on"); if (on && on.scrollIntoView) on.scrollIntoView({ inline: "center", block: "nearest" });
    var c = $("#content"), top = $("#xtabs").offsetTop; if (c && c.scrollTop > top) c.scrollTop = top;
  }
  async function xMore(tag) {
    var id = await actionSheet([{ id: "ni", label: "Not interested in this", icon: I.eyeoff }, { id: "go", label: "Search this trend", icon: I.search }], tag, "");
    if (id === "ni") { S.xhide[tag] = true; renderExploreBody(); toast("We will show fewer trends like this."); }
    else if (id === "go") searchTag(tag.slice(1));
  }
  function xBack() { $("#search-in").value = ""; S.searchQ = ""; S.searchToken++; loadExplore(); }
  async function runSearch() {
    var raw = S.searchQ.replace(/^@/, ""), q = raw.replace(/[^\p{L}\p{N} _.#-]/gu, "").trim(), tok = ++S.searchToken;
    if (!q) { S.people = []; S.lists.explore = []; return renderExploreBody(); }
    var like = "%" + q.replace(/%/g, "") + "%", plike = "%" + q.replace(/^#/, "").replace(/%/g, "") + "%";
    var res = await Promise.all([
      sb.from("profile_cards").select(PEOPLE_COLS).or("handle.ilike." + plike + ",display_name.ilike." + plike).limit(15),
      sb.from("orb_feed").select("*").ilike("body", like).order("created_at", { ascending: false }).limit(30)
    ]);
    if (tok !== S.searchToken) return;
    S.people = visPeople(res[0].data); S.lists.explore = vis(res[1].data);
    renderExploreBody();
  }
  var searchTimer;
  $("#search-in").addEventListener("input", function (e) {
    S.searchQ = e.target.value.trim(); clearTimeout(searchTimer); $("#v-explore").classList.toggle("searching", !!S.searchQ);
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
    var rows = (r.data || []).filter(function (n) { return !notifOff(n.type) && !userHidden(n.actor && n.actor.id); });
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
      S.lists.bookmarks = vis(rows); S.bm.loaded = true;
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
  var MENU = [["bookmarks", "Bookmarks", I.bookmark], ["soon:Lists", "Lists", I.list], ["soon:Communities", "Communities", I.people], ["soon:Premium", "Premium", I.star]];
  function renderDrawer() {
    var u = S.profile, c = S.me || {}, dark = effectiveDark();
    $("#drawer-panel").innerHTML =
      '<div class="dhead" id="dhead">' + avInner(u.display_name, u.avatar_url, 52) +
      '<b>' + esc(u.display_name) + '</b><span class="muted">@' + esc(u.handle) + "</span></div>" +
      '<div class="dstats"><span><b>' + num(c.orbiting_count) + "</b> Orbiting</span><span><b>" + num(c.orbiter_count) + "</b> Orbiters</span></div>" +
      '<div class="dsep"></div>' +
      MENU.map(function (m) { return '<button class="ditem" data-act="drawergo" data-go="' + m[0] + '">' + ic(m[2]) + "<span>" + m[1] + "</span></button>"; }).join("") +
      '<div class="dsep"></div>' +
      '<div class="ditem dtheme">' + ic(dark ? I.moon : I.sun) + '<span id="dthlabel">Dark mode</span><button class="switch" id="dthsw" role="switch" aria-checked="' + dark + '" aria-labelledby="dthlabel" data-act="drawertheme"></button></div>';
  }
  async function openDrawer() {
    renderDrawer(); $("#drawer").hidden = false;
    var b = $("#drawer-panel .ditem"); if (b) b.focus();
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
    "linear-gradient(160deg,#42275a,#b4527a)", "linear-gradient(160deg,#134e5e,#71b280)", "linear-gradient(160deg,#8e1b2d,#ef473a)", "linear-gradient(160deg,#171717,#4a4a4a)",
    "linear-gradient(160deg,#ff3d77,#ff9a3c)", "linear-gradient(160deg,#6a11cb,#2575fc)", "linear-gradient(160deg,#00b09b,#96c93d)", "linear-gradient(160deg,#f9d423,#ff4e50)"
  ];
  var STORY_COLS = "id,author_id,kind,media_url,caption,bg,reel_id,overlays,audience,created_at,expires_at,author:profiles!author_id(handle,display_name,avatar_url)";
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
    var others = [];
    S.tray.forEach(function (u) { if (u.uid !== S.user.id) others.push(u); });
    others.sort(function (a, b) { return (b.unseen - a.unseen) || (new Date(b.latest) - new Date(a.latest)); });
    el.innerHTML = others.map(function (u) {
      var st = u.unseen ? 2 : 1;
      return '<button class="tb" data-act="traystory" data-uid="' + esc(u.uid) + '" aria-label="Play story from ' + esc(u.name) + '">' +
        '<span class="avw st' + st + '" style="--s:58px">' + avInner(u.name, u.avatar, 58) + '</span><span class="tn">' + esc((u.name || "").split(" ")[0]) + "</span></button>";
    }).join("");
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
    stopStoryMusic();
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
    stopStoryMusic();
    RS.stop();
    var c = curStory(), u = c.u, s = c.s, el = $("#story");
    SV.video = null; SV.elapsed = 0; SV.dur = 5000; SV.ready = false; SV.paused = false; SV.held = false;
    var bars = u.items.map(function (x, i) { return '<i class="' + (i < SV.ii ? "done" : "") + '"><b></b></i>'; }).join("");
    var ov = s.overlays && s.overlays.v ? s.overlays : null, flt = ov && ov.filter ? ' style="filter:' + esc(filterCss(ov.filter)) + '"' : "", media = "";
    if (s.kind === "text") media = '<div class="sv-text' + (ov ? " nt" : "") + '" style="background:' + STORY_BG[s.bg % STORY_BG.length] + '">' + (ov ? "" : "<p>" + esc(s.caption) + "</p>") + "</div>";
    else if (s.kind === "image") media = '<img class="sv-img' + (ov ? " cover" : "") + '" id="sv-img" src="' + esc(s.media_url) + '" alt=""' + flt + ">";
    else media = '<video class="sv-vid' + (ov ? " cover" : "") + '" id="sv-vid" src="' + esc(s.media_url) + '" playsinline' + flt + "></video>";
    var reelChip = s.reel_id && s.reel ? '<button class="sv-reel" data-act="svreel">' + ic(I.reels) + "Reel by @" + esc(s.reel.handle) + "</button>" : "";
    var foot = c.own
      ? '<button class="sv-views" data-act="svviews" id="sv-views">' + ic(I.eye) + '<span id="sv-vc">…</span></button><button class="sv-del" data-act="svdelete" aria-label="Delete story">' + ic(I.trash) + "</button>"
      : (ov && ov.noreply ? '<p class="sv-off">Replies are turned off for this story.</p>' : '<form class="sv-reply" id="sv-reply" autocomplete="off"><input id="sv-in" maxlength="300" placeholder="Send message to ' + esc((u.name || "").split(" ")[0]) + '"><button type="submit" class="iconbtn" aria-label="Send">' + ic(I.send) + "</button></form>");
    el.innerHTML = '<div class="sv-stage" id="sv-stage">' + media + (ov ? ovlStageHTML(ov, false) : "") + '<div class="sv-shade"></div></div>' +
      '<div class="sv-bars">' + bars + "</div>" +
      '<div class="sv-head"><button class="sv-who" data-act="svprofile">' + avInner(u.name, u.avatar, 36) + "<b>" + esc(u.name || "") + "</b><span>" + ago(s.created_at) + "</span>" + (s.audience === "close" ? '<i class="sv-cf">' + ic(I.star) + "Close Friends</i>" : "") + '</button><span class="grow"></span><button class="iconbtn" data-act="svclose" aria-label="Close story">' + ic(I.close) + "</button></div>" +
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
    storyMusic(ov);
    if (ov) loadStickerState(s);
  }
  function stopStoryMusic() { if (SV && SV.music) { try { SV.music.pause(); } catch (e) {} SV.music = null; } }
  function storyMusic(ov) {
    stopStoryMusic(); var mu = ov && ov.music; if (!mu || !SV) return;
    var url = mu.url || (mu.track ? songUrl(mu.track) : ""); if (!url) return;
    try {
      var a = new Audio(url); a.currentTime = mu.start || 0; a.volume = mu.vol == null ? 0.8 : mu.vol; SV.music = a;
      var p = a.play(); if (p && p.catch) p.catch(function () {});
      if (SV.video && mu.vvol != null) SV.video.volume = Math.max(0, Math.min(1, mu.vvol));
    } catch (e) {}
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
    if (SV.music) { if (on) SV.music.pause(); else { var mp = SV.music.play(); if (mp && mp.catch) mp.catch(function () {}); } }
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
      if (!SV || e.target.closest(".sv-head,.sv-foot,.sv-reel,.oi[data-k=poll],.oi[data-k=slider],.oi[data-k=question],.oi[data-k=addyours],.oi[data-k=link],.oi[data-k=mention],.oi[data-k=hashtag],.oi[data-k=location]")) return;
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
    st.addEventListener("click", function (e) {
      var o = e.target.closest(".oi[data-k]"); if (!o || !SV) return;
      if (/^(poll|slider|question|addyours|link|mention|hashtag|location)$/.test(o.dataset.k)) stickerTap(o, e);
    });
    st.addEventListener("focusin", function (e) { if (e.target.id === "sv-in") pauseStory(true); });
    st.addEventListener("focusout", function (e) { if (e.target.id === "sv-in") pauseStory(false); });
    st.addEventListener("submit", function (e) {
      if (e.target.id !== "sv-reply") return; e.preventDefault();
      var i = $("#sv-in"); var t = i.value; i.value = ""; i.blur(); sendStoryReply(t);
    });
  })();

  /* ---------- adding to your story ---------- */
  var SC = null;
  function openStoryCreate() { openCreator("story"); }
  function openOldStoryCreate() {
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
    if (!ctx && S.reelFeed !== "friends") loadMutuals();
    if (!S.reels.list.length) loadReels(false);
  }
  function reelHTML(r, i) {
    return '<section class="reel" data-i="' + i + '" data-id="' + r.id + '"><video class="rv" playsinline loop preload="none"' + ovlFilterAttr(r.overlays) + (r.poster_url ? ' poster="' + esc(r.poster_url) + '"' : "") + ' data-src="' + esc(r.video_url) + '"></video>' +
      '<div class="rovl-wrap">' + ovlHTML(r.overlays) + '</div><div class="rtap" data-act="reeltap"></div><div class="rshade"></div><div class="rinfo">' + infoHTML(r) + '</div><div class="rrail">' + railHTML(r) + '</div><div class="rprog"><i></i></div><span class="rflash"></span></section>';
  }
  function renderReels() {
    var R = S.reels, el = $("#v-reels");
    var body;
    if (!R.list.length) body = R.loading || !R.end ? '<div class="rempty"><div class="spin"></div></div>' : (S.reelFeed === "following" && !S.reels.ctx ? '<div class="rempty"><b>Nothing from people you orbit</b><span>Orbit people to see their reels here.</span></div>' : S.reelFeed === "friends" && !S.reels.ctx ? '<div class="rempty"><b>No friends\' reels yet</b><span>When you and someone orbit each other, their reels show up here.</span></div>' : '<div class="rempty"><b>No reels yet</b><span>Be the first to share one.</span><button class="btn fill" data-act="reelnew">Share a reel</button></div>');
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
        try { v.playbackRate = S.reelRate || 1; } catch (e) {}
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
  function syncMuteBtn() { var b = $('#v-reels [data-act="reelmute"]'); if (b) { b.innerHTML = ic(S.reelMuted ? I.mute : I.volume); b.setAttribute("aria-label", S.reelMuted ? "Unmute" : "Mute"); } }
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
    RU = { step: "edit", ovl: [], ted: null, blob: null, url: "", dur: 0, w: 0, h: 0, mime: "", ext: "", busy: false, cap: "", sync: null, sound: sound ? Object.assign({ start: 0, vol: 0.8, vvol: 1 }, sound) : null };
    var m = $("#modal"); m.className = "modal dark"; m.hidden = false; renderReelUpload();
  }
  function ovlFilterAttr(o) { var f = o && !Array.isArray(o) && o.v ? filterCss(o.filter) : ""; return f ? ' style="filter:' + esc(f) + '"' : ""; }
  function reelShareFromCreator(ru) {
    pauseReels();
    RU = { step: "share", ovl: [], ov2: ru.ov2, ted: null, blob: ru.file, url: ru.url, dur: ru.dur, w: ru.w, h: ru.h, mime: ru.mime, ext: ru.ext, busy: false, cap: ru.cap || "", sync: null, keep: ru.keep || [], sound: ru.sound ? Object.assign({ start: 0, vol: 0.8, vvol: 1 }, ru.sound) : null };
    var m = $("#modal"); m.className = "modal dark"; m.hidden = false; renderReelUpload();
  }
  function ruCleanup() {
    if (!RU) return;
    (RU.keep || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
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
    if (RU.sync) RU.sync.stop();
    if (!RU.blob) return ruPickHTML();
    if (RU.step === "share") return ruShareHTML();
    ruEditHTML();
  }
  function ruPickHTML() {
    var m = $("#modal");
    m.innerHTML = '<div class="compose-top gx"><button class="iconbtn" data-act="modalclose" aria-label="Close">' + ic(I.close) + '</button><b class="mtitle">New reel</b><span style="width:40px"></span></div>' +
      '<div class="sc-choose"><div class="nr-head"><b>Recents</b></div><div class="nr-grid"><button class="nr-tile" data-act="rucam">' + ic(I.camera) + "<span>Camera</span></button><button class=\"nr-tile\" data-act=\"rupick\">" + ic(I.video) + "<span>Gallery</span></button></div>" +
      '<p class="nr-note">Videos can be up to 90 seconds and 50 MB. Tall videos look best.</p>' +
      (RU.sound ? '<p class="ru-note">' + ic(I.music) + "Sound: " + esc(soundLabel(RU.sound)) + "</p>" : "") + "</div>";
  }
  function ruStartPreview() {
    var v = $("#ru-vid"); RU.sync = RU.sync || makeSync();
    var el = RU.sync.el; el.onloadedmetadata = function () { if (RU && RU.sound && !RU.sound.dur && isFinite(el.duration)) { RU.sound.dur = el.duration; var mx = $("#ru-mix"); if (mx) mx.innerHTML = ruMixHTML(); } };
    if (RU.sound) RU.sync.set(v, soundParams(RU.sound), false);
    var pr = v.play(); if (pr && pr.catch) pr.catch(function () { v.muted = true; RU.sync.mute(true); ruMuteBtn(); v.play().catch(function () {}); });
  }
  function ruOvlEditHTML() {
    return RU.ovl.map(function (o, i) {
      return '<span class="ovl f-' + esc(o.f) + '" data-i="' + i + '" style="left:' + o.x + "%;top:" + o.y + "%;color:" + esc(o.c) + '">' + esc(o.t) + "</span>";
    }).join("");
  }
  function ruEditHTML() {
    var m = $("#modal");
    m.innerHTML = '<div class="ed"><video id="ru-vid" src="' + esc(RU.url) + '" autoplay loop playsinline></video><div class="ed-ovl" id="ed-ovl">' + ruOvlEditHTML() + "</div>" +
      '<div class="ed-top"><button class="iconbtn" data-act="ruback" aria-label="Back">' + ic(I.close) + '</button><span class="grow"></span><button class="ru-mute iconbtn" data-act="rumute" aria-label="Mute preview">' + ic(I.volume) + "</button></div>" +
      '<div class="ed-bar"><div class="ed-tools"><button data-act="rusound">' + ic(I.music) + "<span>Audio</span></button><button data-act=\"rutext\">" + ic(I.textaa) + "<span>Text</span></button></div>" +
      '<div class="ed-foot"><span class="ed-hint">' + (RU.sound ? esc(soundLabel(RU.sound)) : "") + '</span><button class="ed-next" data-act="runext">Next ' + ic(I.send) + "</button></div></div></div>";
    ruStartPreview();
  }
  function ruShareHTML() {
    var m = $("#modal");
    m.innerHTML = '<div class="compose-top gx"><button class="iconbtn" data-act="rushareback" aria-label="Back">' + ic(I.back) + '</button><b class="mtitle">New reel</b><button class="btn fill" data-act="rushare" id="ru-share">Share</button></div>' +
      '<div class="ru-body"><div class="ru-prev"><video id="ru-vid" src="' + esc(RU.url) + '" autoplay loop playsinline' + ovlFilterAttr(RU.ov2) + '></video><div class="rovl-wrap">' + ovlHTML(RU.ov2 || RU.ovl) + '</div><button class="ru-mute" data-act="rumute" aria-label="Mute preview">' + ic(I.volume) + '</button></div>' +
      '<div class="ru-snd" id="ru-snd">' + ruSoundHTML() + '</div>' +
      '<textarea class="in" id="ru-cap" maxlength="150" rows="3" placeholder="Write a caption…" aria-label="Caption"></textarea></div>' +
      '<div class="cmp-prog" id="ru-prog" hidden><div class="bar"><i></i></div><span></span></div>';
    var cap = $("#ru-cap"); cap.value = RU.cap || "";
    ruStartPreview();
  }
  /* ----- text on the video ----- */
  var TED_COLS = ["#ffffff", "#000000", "#ff7a1a", "#ffd23f", "#ff4d8d", "#3aa0ff", "#2ecc71"];
  function ruTextOpen(i) {
    var o = i > -1 ? RU.ovl[i] : { t: "", f: "modern", c: "#ffffff", x: 50, y: 42 };
    if (i < 0 && RU.ovl.length >= 3) return toast("You can add up to 3 texts.");
    RU.ted = { i: i, f: o.f, c: o.c, x: o.x, y: o.y };
    var d = document.createElement("div"); d.id = "ted"; d.className = "ted";
    d.innerHTML = '<div class="ted-top">' + (i > -1 ? '<button class="iconbtn" data-act="tedel" aria-label="Delete text">' + ic(I.trash) + "</button>" : "<span></span>") + '<button class="ted-done" data-act="tedone">Done</button></div>' +
      '<textarea id="ted-in" class="ted-in" maxlength="80" rows="3" placeholder="Type something" aria-label="Text">' + esc(o.t) + "</textarea>" +
      '<div class="ted-fonts">' + Object.keys(OVL_FONTS).map(function (k) { return '<button data-act="tedfont" data-f="' + k + '" class="' + (o.f === k ? "on" : "") + '">' + OVL_FONTS[k] + "</button>"; }).join("") + "</div>" +
      '<div class="ted-cols">' + TED_COLS.map(function (c) { return '<button data-act="tedcol" data-c="' + c + '" class="' + (o.c === c ? "on" : "") + '" style="--c:' + c + '" aria-label="Colour ' + c + '"></button>'; }).join("") + "</div>";
    $("#modal").appendChild(d); tedStyle(); $("#ted-in").focus();
  }
  function tedStyle() {
    var t = $("#ted-in"); if (!t || !RU || !RU.ted) return;
    t.className = "ted-in ovl-in f-" + RU.ted.f; t.style.color = RU.ted.c;
    $$("#ted .ted-fonts button").forEach(function (b) { b.classList.toggle("on", b.dataset.f === RU.ted.f); });
    $$("#ted .ted-cols button").forEach(function (b) { b.classList.toggle("on", b.dataset.c === RU.ted.c); });
  }
  function ruTextDone(del) {
    var t = RU.ted, val = ($("#ted-in").value || "").trim(); $("#ted").remove(); RU.ted = null;
    if (t.i > -1) { if (del || !val) RU.ovl.splice(t.i, 1); else Object.assign(RU.ovl[t.i], { t: val, f: t.f, c: t.c }); }
    else if (val) RU.ovl.push({ t: val, f: t.f, c: t.c, x: t.x, y: t.y });
    var w = $("#ed-ovl"); if (w) w.innerHTML = ruOvlEditHTML();
  }
  var drag = null;
  document.addEventListener("pointerdown", function (e) {
    var o = e.target.closest && e.target.closest("#ed-ovl .ovl"); if (!o || !RU) return;
    var box = $("#ed-ovl").getBoundingClientRect(); drag = { el: o, box: box, moved: false, sx: e.clientX, sy: e.clientY };
    try { o.setPointerCapture(e.pointerId); } catch (x) {}
  });
  document.addEventListener("pointermove", function (e) {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 6) drag.moved = true;
    if (!drag.moved) return;
    var x = Math.max(8, Math.min(92, (e.clientX - drag.box.left) / drag.box.width * 100)), y = Math.max(6, Math.min(94, (e.clientY - drag.box.top) / drag.box.height * 100));
    drag.el.style.left = x + "%"; drag.el.style.top = y + "%"; drag.x = x; drag.y = y;
  });
  document.addEventListener("pointerup", function () {
    if (!drag) return; var d = drag; drag = null; if (!RU) return;
    var i = +d.el.dataset.i;
    if (d.moved) { RU.ovl[i].x = Math.round(d.x * 10) / 10; RU.ovl[i].y = Math.round(d.y * 10) / 10; } else ruTextOpen(i);
  });
  document.addEventListener("input", function (e) { if (e.target.id === "ted-in") tedStyle(); });
  function ruMuteBtn() { var v = $("#ru-vid"), b = $(".ru-mute"); if (v && b) { b.innerHTML = ic(v.muted ? I.mute : I.volume); b.setAttribute("aria-label", v.muted ? "Unmute preview" : "Mute preview"); } }
  document.addEventListener("input", function (e) {
    var id = e.target.id; if (!RU || !RU.sound || (id !== "ru-vol" && id !== "ru-vvol" && id !== "ru-start")) return;
    var sn = RU.sound, val = +e.target.value;
    if (id === "ru-vol") sn.vol = val / 100; else if (id === "ru-vvol") sn.vvol = val / 100;
    else { sn.start = val; var sv = $("#ru-sv"); if (sv) sv.textContent = mmss(val); }
    var v = $("#ru-vid"); if (RU.sync && v) RU.sync.update(soundParams(sn), v.muted);
  });
  function ruSetCap() { var c = $("#ru-cap"); if (c && RU) RU.cap = c.value; }
  async function ruPick(cam) {
    var f = (await pickFiles("video/*", false, cam ? "environment" : ""))[0]; if (!f || !RU) return;
    try {
      var vt = vidType(f); if (!vt) throw new Error("Use an MP4 or WebM video.");
      if (f.size > MAX_FILE) throw new Error("That video is over 50 MB. Trim it and try again.");
      var meta = await probeVideo(f);
      if (meta.duration > 91) { URL.revokeObjectURL(meta.url); throw new Error("Reels can be up to 90 seconds."); }
      if (meta.duration && meta.duration < 0.5) { URL.revokeObjectURL(meta.url); throw new Error("That video is too short."); }
      RU.step = "edit"; RU.blob = f; RU.url = meta.url; RU.dur = meta.duration; RU.w = meta.w; RU.h = meta.h; RU.mime = vt; RU.ext = fileExt(vt, f.name);
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
      var ovOut = RU.ovl.length ? RU.ovl : null;
      if (RU.ov2) { var po = await prepOverlays(RU.ov2, setP); po.ups.forEach(function (u) { ups.push(u); }); po.ov.music = null; ovOut = ovlHas(po.ov) ? po.ov : null; }
      var row = { overlays: ovOut, author_id: S.user.id, poster_url: poster ? poster.url : null, caption: caption, duration: RU.dur && isFinite(RU.dur) ? Math.round(RU.dur * 10) / 10 : null };
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

  /* ---------- Reels, the Instagram way ---------- */
  Object.assign(I, {
    lines: '<path d="M5 9h14M5 15h14"/>',
    tune: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    chevd: '<path d="M6 9l6 6 6-6"/>',
    textaa: '<path d="M4 18l4.5-12L13 18M5.7 14h5.6"/><path d="M15 18l2.6-7L20 18M15.9 16h3.4"/>'
  });
  S.reelFeed = "foryou"; S.mutuals = null; S.friendAv = []; S.reelRate = 1;
  function rnum(n) {
    n = Number(n) || 0;
    if (n < 10000) return n.toLocaleString("en-US");
    if (n < 100000) return (Math.floor(n / 100) / 10).toString().replace(/\.0$/, "") + "K";
    if (n < 1000000) return Math.floor(n / 1000) + "K";
    return (Math.floor(n / 100000) / 10).toString().replace(/\.0$/, "") + "M";
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k + (S.user ? S.user.id : "x")) || "[]"); } catch (e) { return []; } }
  function lsSet(k, v) { try { localStorage.setItem(k + (S.user ? S.user.id : "x"), JSON.stringify(v.slice(-300))); } catch (e) {} }
  function reelHidden(id) { return lsGet("orbi-rhide-").indexOf(id) > -1; }

  /* people who orbit each other */
  async function loadMutuals() {
    var res = await Promise.all([sb.from("orbits").select("following_id").eq("follower_id", S.user.id), sb.from("orbits").select("follower_id").eq("following_id", S.user.id)]);
    var theirs = {}; (res[1].data || []).forEach(function (x) { theirs[x.follower_id] = 1; });
    S.mutuals = (res[0].data || []).map(function (x) { return x.following_id; }).filter(function (id) { return theirs[id] && !userHidden(id); });
    if (S.mutuals.length) {
      var p = await sb.from("profile_cards").select("id,display_name,avatar_url").in("id", S.mutuals.slice(0, 3));
      S.friendAv = p.data || [];
    } else S.friendAv = [];
    var b = $("#rbubs"); if (b) b.innerHTML = bubsHTML();
    return S.mutuals;
  }
  function bubsHTML() { return S.friendAv.map(function (p) { return avInner(p.display_name, p.avatar_url, 20); }).join(""); }

  async function loadReels(more) {
    var R = S.reels; if (R.loading || (more && R.end)) return;
    R.loading = true;
    var q = sb.from("reel_feed").select("*").order("created_at", { ascending: false }).limit(RPAGE), feed = R.ctx ? "foryou" : S.reelFeed, ids = null;
    if (feed === "following") ids = Object.keys(S.following);
    else if (feed === "friends") ids = (more && S.mutuals) || await loadMutuals();
    if (ids && !ids.length) { R.loading = false; R.end = true; R.list = []; if (S.view === "reels") renderReels(); return; }
    if (ids) q = q.in("author_id", ids);
    if (more && R.list.length) q = q.lt("created_at", R.list[R.list.length - 1].created_at);
    var r = await q;
    R.loading = false;
    if (S.reels !== R) return;
    if (r.error) { toast(niceErr(r.error)); if (!R.list.length) renderReels(); return; }
    var raw = r.data || [], rows = vis(raw).filter(function (x) { return !reelHidden(x.id); }); R.end = raw.length < RPAGE;
    R.list = more ? R.list.concat(rows) : rows;
    if (S.view === "reels") { if (more) appendReels(rows); else renderReels(); }
  }
  function setReelFeed(f) {
    if (S.reelFeed === f && S.reels.list.length) return;
    S.reelFeed = f; S.reels = { list: [], idx: 0, ctx: null, end: false, loading: false };
    renderReels(); loadReels(false);
  }
  async function reelFeedMenu(anchor) {
    var f = S.reelFeed, items = [];
    if (f !== "foryou") items.push({ id: "foryou", label: "Reels", icon: I.reels });
    if (f !== "following") items.push({ id: "following", label: "Following", icon: I.people });
    items.push({ id: "tune", label: "Tune", icon: I.tune });
    items.forEach(function (x) { x.lead = 1; });
    var k = await popMenu(items, { anchor: anchor });
    if (k === "tune") go("setpage", { k: "reelprefs" });
    else if (k) setReelFeed(k);
  }
  function reelsTopHTML() {
    var ctx = S.reels.ctx, f = S.reelFeed, fr = f === "friends";
    return '<div class="rtop">' + (ctx ? '<button class="iconbtn" data-act="back" aria-label="Back">' + ic(I.back) + '</button><b class="rtt">Reels</b>' :
      '<button class="iconbtn" data-act="reelnew" aria-label="New reel">' + ic(I.plus) + "</button>" +
      '<button class="rtab' + (fr ? "" : " on") + '" data-act="reelfeed" aria-haspopup="menu">' + (f === "following" ? "Following" : "Reels") + ic(I.chevd) + "</button>" +
      '<button class="rtab' + (fr ? " on" : "") + '" data-act="reelfriends">Friends<span class="rbubs" id="rbubs">' + bubsHTML() + "</span></button>") +
      '<span class="grow"></span>' +
      (ctx ? "" : '<button class="iconbtn" data-act="reeltune" aria-label="Tune your reels">' + ic(I.tune) + "</button>") + "</div>" +
      '<button class="rmute" data-act="reelmute" aria-label="' + (S.reelMuted ? "Unmute" : "Mute") + '">' + ic(S.reelMuted ? I.mute : I.volume) + "</button>";
  }
  function railHTML(r) {
    function b(act, path, count, on, label, cls) { return '<button class="rb' + (on ? " on" : "") + (cls ? " " + cls : "") + '" data-act="' + act + '" aria-label="' + label + '"' + (act === "rlike" || act === "rsave" || act === "rreorb" ? ' aria-pressed="' + !!on + '"' : "") + '><span class="rbi">' + ic(path) + "</span>" + (count != null ? "<em>" + rnum(Number(count) || 0) + "</em>" : "") + "</button>"; }
    return b("rlike", I.heart, r.like_count, r.liked_by_me, "Like", "like") + b("rcomment", I.reply, r.comment_count, false, "Comments") +
      b("rreorb", I.reorb, r.reorb_count, r.reorbed_by_me, "Repost") + b("rshare", I.send, null, false, "Share") +
      b("rsave", I.bookmark, r.save_count, r.saved_by_me, r.saved_by_me ? "Unsave" : "Save") + b("rmore", I.lines, null, false, "About this reel");
  }
  function infoHTML(r) {
    var own = r.author_id === S.user.id, fol = r.followed_by_me || S.following[r.author_id];
    return '<div class="rwho">' + avOrb(r, 40) + '<a class="rh" href="#/u/' + esc(r.handle) + '" data-act="mention" data-h="' + esc(r.handle) + '">' + esc(r.handle) + "</a>" + (!own && !fol ? '<button class="rchip" data-act="rfollow">Orbit</button>' : "") + "</div>" +
      (soundOf(r) ? soundChipHTML(r) : "") + (r.caption ? '<p class="rcap" data-act="rcap">' + linkify(r.caption) + "</p>" : "") +
      (r.reposted_by_name ? '<p class="rre">' + ic(I.reorb) + (r.actor_id === S.user.id ? "You" : esc(r.reposted_by_name)) + " re-orbed</p>" : "");
  }
  var OVL_FONTS = { classic: "Classic", modern: "Modern", type: "Typewriter", neon: "Neon" };
  function ovlHTML(list) {
    if (list && !Array.isArray(list) && list.v) return ovlStageHTML(list, false);
    return (list || []).map(function (o) {
      return '<span class="ovl f-' + esc(o.f || "classic") + '" style="left:' + (+o.x || 50) + "%;top:" + (+o.y || 40) + "%;color:" + esc(/^#[0-9a-f]{3,8}$/i.test(o.c) ? o.c : "#fff") + '">' + esc(o.t) + "</span>";
    }).join("");
  }

  /* ----- reposting: the snackbar with Undo ----- */
  async function toggleReelRel(table, r, flag, countKey) {
    var on = !r[flag];
    eachReel(r.id, function (x) { x[flag] = on; if (countKey) x[countKey] = Number(x[countKey]) + (on ? 1 : -1); }); paintReel(r.id);
    var res = on ? await sb.from(table).insert({ user_id: S.user.id, reel_id: r.id }) : await sb.from(table).delete().eq("user_id", S.user.id).eq("reel_id", r.id);
    if (res.error) { eachReel(r.id, function (x) { x[flag] = !on; if (countKey) x[countKey] = Number(x[countKey]) + (on ? -1 : 1); }); paintReel(r.id); return toast(niceErr(res.error)); }
    if (table === "reel_saves") {
      eachReel(r.id, function (x) { x.save_count = Math.max(0, Number(x.save_count || 0) + (on ? 1 : -1)); }); paintReel(r.id);
      toast(on ? "Saved to Bookmarks." : "Removed from Bookmarks.");
      if (!on && S.view === "bookmarks") { S.bm.reels = S.bm.reels.filter(function (x) { return x.id !== r.id; }); renderBookmarks(); }
    }
    if (table === "reel_reorbs") { if (on) reelSnack("Reposted", r); else toast("Repost removed."); }
  }
  var snackT;
  function reelSnack(text, r) {
    var el = $("#rsnack"); if (!el) { el = document.createElement("div"); el.id = "rsnack"; el.className = "rsnack"; $("#v-reels").appendChild(el); }
    el.innerHTML = ic(I.reorb) + "<span>" + esc(text) + '</span><button data-act="rsnackundo" data-id="' + r.id + '">Undo</button>'; el.classList.add("on");
    clearTimeout(snackT); snackT = setTimeout(function () { el.classList.remove("on"); }, 4200);
  }

  /* ----- share sheet ----- */
  S.shSel = {};
  async function reelShare(r) {
    S.shSel = {}; S.shReel = r;
    openSheet('<div class="shr"><div class="shr-top"><div class="search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg><label class="sr" for="sh-in">Search</label><input id="sh-in" class="in" placeholder="Search" autocomplete="off"></div></div>' +
      '<div id="sh-grid" class="shr-grid">' + skel(1) + '</div><div id="sh-send" class="shr-send" hidden><input id="sh-note" class="in" maxlength="200" placeholder="Write a message…" autocomplete="off"><button class="btn fill" data-act="shsend">Send</button></div>' +
      '<div class="shr-act"><button data-act="shstory"><span>' + ic(I.plus) + "</span>Add to story</button><button data-act=\"shcopy\"><span>" + ic(I.link) + '</span>Copy link</button><button data-act="shwa" class="wa"><span>' + ic(I.send) + '</span>WhatsApp</button><button data-act="shdl"><span>' + ic(I.install) + "</span>Download</button><button data-act=\"shnative\"><span>" + ic(I.share) + "</span>Share</button></div></div>",
      { tall: true, label: "Share reel", onClose: function () { resumeReels(); } });
    loadShareGrid("");
  }
  var shT;
  async function loadShareGrid(q) {
    var rows = [], tok = S.searchToken = (S.searchToken || 0) + 1;
    if (!q) {
      if (!S.chatThreads.length) await loadChat(true);
      var seen = {};
      S.chatThreads.forEach(function (t) { seen[t.other_id] = 1; rows.push({ id: t.other_id, display_name: t.display_name, handle: t.handle, avatar_url: t.avatar_url }); });
      var ids = Object.keys(S.following).filter(function (id) { return !seen[id]; }).slice(0, 12);
      if (ids.length) { var pr = await sb.from("profile_cards").select("id,handle,display_name,avatar_url").in("id", ids); rows = rows.concat(pr.data || []); }
    } else {
      var like = "%" + q.replace(/^@/, "").replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/%/g, "") + "%";
      var r = await sb.from("profile_cards").select("id,handle,display_name,avatar_url").neq("id", S.user.id).or("handle.ilike." + like + ",display_name.ilike." + like).limit(15);
      rows = r.data || [];
    }
    var box = $("#sh-grid"); if (!box || tok !== S.searchToken) return;
    rows = rows.filter(function (p) { return !userHidden(p.id); });
    box.innerHTML = rows.length ? rows.map(function (p) {
      return '<button class="shc' + (S.shSel[p.id] ? " on" : "") + '" data-act="shsel" data-id="' + p.id + '" data-name="' + esc(p.display_name) + '" aria-pressed="' + !!S.shSel[p.id] + '"><span class="shav">' + avInner(p.display_name, p.avatar_url, 64) + '<i>' + ic(I.check) + "</i></span><span class=\"shn\">" + esc(p.display_name) + "</span></button>";
    }).join("") : '<p class="muted shr-empty">' + (q ? "No one matches." : "Orbit someone or search to send this.") + "</p>";
  }
  document.addEventListener("input", function (e) {
    if (e.target.id === "sh-in") { clearTimeout(shT); var v = e.target.value.trim(); shT = setTimeout(function () { loadShareGrid(v); }, 250); }
  });
  function shToggle(b) {
    var id = b.dataset.id; if (S.shSel[id]) delete S.shSel[id]; else S.shSel[id] = b.dataset.name;
    b.classList.toggle("on", !!S.shSel[id]); b.setAttribute("aria-pressed", !!S.shSel[id]);
    var n = Object.keys(S.shSel).length; $("#sh-send").hidden = !n; $(".shr-act").hidden = !!n;
  }
  async function shSend() {
    var ids = Object.keys(S.shSel), r = S.shReel; if (!ids.length || !r) return;
    var note = ($("#sh-note").value || "").trim(), body = (note ? note + "\n" : "") + link("reel/" + r.id);
    var res = await Promise.all(ids.map(function (id) { return sb.from("messages").insert({ sender_id: S.user.id, recipient_id: id, body: body }); }));
    var bad = res.filter(function (x) { return x.error; })[0];
    if (bad) return toast(niceErr(bad.error));
    closeSheet(); toast("Sent to " + (ids.length === 1 ? S.shSel[ids[0]] : ids.length + " people") + ".");
  }
  async function downloadReel(r) {
    toast("Downloading…");
    try { var res = await fetch(r.video_url); if (!res.ok) throw new Error("x"); var b = await res.blob(), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "orbi-reel-" + String(r.id).slice(0, 8) + ".mp4"; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 1500); }
    catch (e) { window.open(r.video_url, "_blank"); }
  }
  function shAction(kind) {
    var r = S.shReel; if (!r) return; var url = link("reel/" + r.id);
    if (kind === "story") { closeSheet(); addReelToStory(r); }
    else if (kind === "copy") { copyText(url).then(function (ok) { toast(ok ? "Link copied." : "Could not copy the link."); }); closeSheet(); }
    else if (kind === "wa") { window.open("https://wa.me/?text=" + encodeURIComponent((r.caption ? r.caption + " " : "") + url), "_blank"); closeSheet(); }
    else if (kind === "dl") { closeSheet(); downloadReel(r); }
    else if (kind === "native") { closeSheet(); if (navigator.share) navigator.share({ title: "Orbi", text: r.caption || "A reel on Orbi", url: url }).catch(function () {}); else copyText(url).then(function () { toast("Link copied."); }); }
  }

  /* ----- About this reel ----- */
  async function reelMore(r) {
    pauseReels();
    var own = r.author_id === S.user.id, sn = soundOf(r), items = [];
    items.push({ id: "audio", icon: I.music, label: sn ? soundLabel(sn) : "Original audio · " + r.handle, sub: "Audio" });
    items.push({ id: "speed", icon: I.play, label: "Playback", sub: S.reelRate === 1 ? "Normal speed" : S.reelRate + "x", sep: 1 });
    if (!own) {
      items.push({ id: "why", icon: I.info, label: "Why you're seeing this post", sep: 1 }, { id: "interested", icon: I.check, label: "Interested" }, { id: "not", icon: I.close, label: "Not interested" });
    }
    items.push({ id: "copy", icon: I.link, label: "Copy link" });
    items.push(own ? { id: "delete", icon: I.trash, label: "Delete reel", danger: true } : { id: "report", icon: I.flag, label: "Report", danger: true });
    var id = await actionSheet(items, "About this reel", (r.caption ? r.caption : "No caption.") + " · Shared " + ago(r.created_at) + " ago by @" + r.handle, { ig: 1 });
    if (id === "audio") { if (sn) openSoundPage(r); else resumeReels(); }
    else if (id === "speed") reelSpeed();
    else if (id === "why") reelWhy(r);
    else if (id === "interested") { var a = lsGet("orbi-rint-"); a.push(r.id); lsSet("orbi-rint-", a); toast("Thanks. We'll show you more reels like this."); resumeReels(); }
    else if (id === "not") reelNotInterested(r);
    else if (id === "copy") { copyText(link("reel/" + r.id)).then(function (ok) { toast(ok ? "Link copied." : "Could not copy the link."); }); resumeReels(); }
    else if (id === "delete") deleteReel(r);
    else if (id === "report") { await reportSheet("reel", r.author_id, r.id, "Report this reel"); resumeReels(); }
    else resumeReels();
  }
  async function reelSpeed() {
    var id = await actionSheet([[0.5, "0.5x"], [1, "Normal"], [1.5, "1.5x"], [2, "2x"]].map(function (x) { return { id: String(x[0]), label: x[1], icon: S.reelRate === x[0] ? I.check : null }; }), "Playback speed");
    if (id) { S.reelRate = +id; var v = reelVideo(S.reels.idx); if (v) v.playbackRate = S.reelRate; }
    resumeReels();
  }
  async function reelWhy(r) {
    var why = S.following[r.author_id] ? "You orbit @" + r.handle + "." : r.like_count > 50 ? "This reel is popular on Orbi right now." : "It is one of the newest reels on Orbi.";
    await actionSheet([{ id: "ok", label: "Got it" }], "Why you're seeing this post", why); resumeReels();
  }
  function reelNotInterested(r) {
    var a = lsGet("orbi-rhide-"); a.push(r.id); lsSet("orbi-rhide-", a);
    var i = S.reels.list.findIndex(function (x) { return x.id === r.id; });
    S.reels.list = S.reels.list.filter(function (x) { return x.id !== r.id; });
    toast("Got it. We'll show fewer reels like this.");
    if (!S.reels.list.length && S.reels.ctx) return back();
    S.reels.idx = Math.min(Math.max(0, i), Math.max(0, S.reels.list.length - 1)); renderReels();
  }
  function reelPrefsBody() {
    var hid = lsGet("orbi-rhide-").length, int = lsGet("orbi-rint-").length;
    return sInfo("Interested", int + (int === 1 ? " reel" : " reels"), null) + sInfo("Not interested", hid + (hid === 1 ? " reel" : " reels"), null) +
      '<button class="sset" data-act="reelreset"><span class="st"><b>Reset suggested content</b><span>Clear what you told us you are interested in or not, so Reels starts fresh.</span></span>' + ic(I.chev, "chev") + "</button>";
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
    if (SOUND_HOOK) { var hk = SOUND_HOOK; SOUND_HOOK = null; return hk(snd); }
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
    else if (a === "usethis") { var cur = S.sndCur; if (cur) { closeSheet(); openCreator("reel", { sound: Object.assign({}, cur, { start: 0 }) }); } }
    else if (a === "open") { var list = S.sndReels || [], i = +b.dataset.i; if (list[i]) { closeSheet(); openReels(list, i); } }
  });


  /* ---------- story and reel overlays: the model and one renderer shared by the editor and the viewers ---------- */
  var CFONTS = [["modern", "Modern"], ["classic", "Classic"], ["signature", "Signature"], ["editor", "Editor"], ["poster", "Poster"], ["bubble", "Bubble"], ["deco", "Deco"], ["squeeze", "Squeeze"], ["typewriter", "Typewriter"], ["strong", "Strong"], ["meme", "Meme"], ["elegant", "Elegant"]];
  var CANIMS = [["typewriter", "Typewriter"], ["pop", "Pop"], ["jump", "Jump"], ["fade", "Fade in"]];
  var CTFX = [["sparkle", "Sparkle"], ["neon", "Neon"], ["shimmer", "Shimmer"], ["pixel", "Pixel"]];
  var CCOLS = ["#ffffff", "#000000", "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#0a84ff", "#5e5ce6", "#bf5af2", "#ff2d92", "#ffd6a5", "#fdffb6", "#caffbf", "#9bf6ff", "#a0c4ff", "#bdb2ff", "#ffc6ff", "#8d6e63", "#607d8b", "#1b5e20", "#880e4f", "#bf360c", "#0d47a1"];
  var CFILTERS = [
    { id: "", name: "Normal", css: "" },
    { id: "warm", name: "Warm", css: "sepia(.25) saturate(1.3) hue-rotate(-8deg) brightness(1.03)" },
    { id: "cool", name: "Cool", css: "saturate(1.1) hue-rotate(12deg) brightness(1.02) contrast(1.03)" },
    { id: "vivid", name: "Vivid", css: "saturate(1.65) contrast(1.1)" },
    { id: "fade", name: "Fade", css: "contrast(.85) brightness(1.1) saturate(.8)" },
    { id: "mono", name: "Mono", css: "grayscale(1) contrast(1.1)" },
    { id: "noir", name: "Noir", css: "grayscale(1) contrast(1.4) brightness(.9)" },
    { id: "sunset", name: "Sunset", css: "sepia(.4) saturate(1.8) hue-rotate(-18deg)" },
    { id: "dream", name: "Dream", css: "brightness(1.1) saturate(1.3) hue-rotate(14deg) blur(.4px)" },
    { id: "retro", name: "Retro", css: "sepia(.6) contrast(1.1) saturate(.9)" },
    { id: "glow", name: "Glow", css: "brightness(1.15) contrast(.95) saturate(1.2)" },
    { id: "soft", name: "Touch up", css: "blur(.5px) brightness(1.06) saturate(1.1) contrast(.97)" }
  ];
  var CFX = [["", "None"], ["vignette", "Vignette"], ["grain", "Grain"], ["glow", "Glow"], ["sparkles", "Sparkles"], ["hearts", "Hearts"], ["snow", "Snow"], ["confetti", "Confetti"]];
  var CDECO = [
    ["sound", "SOUND ON", "d1"], ["new", "NEW", "d2"], ["love", "LOVE", "d3"], ["vibes", "GOOD VIBES", "d4"], ["mood", "MOOD", "d5"], ["ootd", "OOTD", "d6"],
    ["morning", "GOOD MORNING", "d4"], ["night", "GOOD NIGHT", "d1"], ["throw", "THROWBACK", "d5"], ["bday", "BIRTHDAY!", "d2"], ["lagos", "LAGOS", "d6"], ["orbi", "ORBI", "d3"],
    ["weekend", "WEEKEND", "d1"], ["hype", "HYPE", "d2"], ["wow", "WOW!", "d3"], ["omg", "OMG", "d5"], ["fire", "FIRE", "d6"], ["slay", "SLAY", "d4"], ["friyay", "FRIDAY", "d2"], ["chill", "CHILL", "d1"],
    ["day", "", "d4"]
  ];
  var CEMOJI = "😀😁😂🤣😊😍🥰😘😎🤩🥳😜🤪😇🤗🤭🥹😢😭😤😡🤯😱🥶🥵🤔🙄😴🤤😋🙌👏🙏💪👍👎👌✌️🤞🤙👋🫶❤️🧡💛💚💙💜🖤🤍💔💖💕🔥✨⭐🌟💫💥💯🎉🎊🎈🎂🎁🏆🥇⚡🌈☀️🌙🌸🌺🌴🍀🍕🍔🍟🍩🍰☕🍹🍾🥂🎶🎵🎤🎧📸🎬✈️🚗🏝️🏖️⚽🏀🏈🎮💃🕺👑💎💸📍🏠🌍🇳🇬".match(/(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*|🇳🇬)/gu) || ["😀"];
  var CFRAMES = [["round", "Rounded"], ["circle", "Circle"], ["arch", "Arch"], ["heart", "Heart"], ["star", "Star"], ["polaroid", "Polaroid"]];
  var oidN = 0;
  function oid() { return Date.now().toString(36).slice(-4) + (++oidN).toString(36) + Math.random().toString(36).slice(2, 4); }
  function newOvl() { return { v: 1, items: [], filter: "", fx: "", mentions: [], music: null, noreply: false, ai: false }; }
  function ovlHas(o) { return !!(o && !Array.isArray(o) && o.v && ((o.items && o.items.length) || o.filter || o.fx || o.music)); }
  function filterCss(id) { for (var i = 0; i < CFILTERS.length; i++) if (CFILTERS[i].id === id) return CFILTERS[i].css; return ""; }
  function safeUrl(u) {
    u = String(u || "").trim(); if (!u) return "";
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u;
    try { var x = new URL(u); return /^https?:$/.test(x.protocol) && x.hostname.indexOf(".") > 0 ? x.href : ""; } catch (e) { return ""; }
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return u; } }
  function contrastOf(hex) {
    var h = String(hex || "#fff").replace("#", ""); if (h.length === 3) h = h.replace(/(.)/g, "$1$1");
    var r = parseInt(h.slice(0, 2), 16) || 0, g = parseInt(h.slice(2, 4), 16) || 0, b = parseInt(h.slice(4, 6), 16) || 0;
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#000000" : "#ffffff";
  }
  function okColor(c) { return /^#[0-9a-f]{3,8}$/i.test(c) ? c : "#ffffff"; }
  function clockParts(ts) {
    var d = ts ? new Date(ts) : new Date(), h12 = false;
    try { h12 = !!new Intl.DateTimeFormat([], { hour: "numeric" }).resolvedOptions().hour12; } catch (e) {}
    var h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? "PM" : "AM";
    if (h12) h = h % 12 || 12;
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return { h: p(h), m: p(m), ap: h12 ? ap : "", date: d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }), txt: (h12 ? h : p(h)) + ":" + p(m) + (h12 ? " " + ap : "") };
  }
  function cdParts(end) {
    var ms = new Date(end).getTime() - Date.now(); if (isNaN(ms)) return null;
    if (ms <= 0) return { done: true, d: "00", h: "00", m: "00", s: "00" };
    var s = Math.floor(ms / 1000);
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return { done: false, d: p(Math.floor(s / 86400)), h: p(Math.floor(s % 86400 / 3600)), m: p(Math.floor(s % 3600 / 60)), s: p(s % 60) };
  }
  var ICN = {
    gif: '<circle cx="11" cy="11" r="6.5"/><path d="M21 21l-5.2-5.2"/>',
    addyours: '<rect x="3" y="7" width="14" height="14" rx="3"/><path d="M7 7V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/><path d="M10 11v6M7 14h6"/>',
    frames: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><rect x="8" y="8" width="8" height="8" rx="1.5"/>',
    strip: '<rect x="4" y="3" width="9" height="7" rx="1"/><rect x="4" y="12" width="9" height="7" rx="1"/><rect x="14" y="6" width="6" height="12" rx="1"/>',
    photo: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
    cutout: '<circle cx="6" cy="6.5" r="2.6"/><circle cx="6" cy="17.5" r="2.6"/><path d="M8.2 8l11 9.5M8.2 16l11-9.5"/>',
    question: '<path d="M4 20l1.2-4.2A8 8 0 1 1 8.4 19z"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5M12 16.2v.1"/>',
    avatar: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10.5" r="1"/><circle cx="15" cy="10.5" r="1"/><path d="M8.5 14.5c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2"/>',
    poll: '<path d="M4 8h10M4 12h16M4 16h7"/>',
    link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
    hash: '<path d="M9 3L7 21M17 3l-2 18M4 9h17M3 15h17"/>',
    count: '<circle cx="12" cy="13" r="8"/><path d="M12 8.5V13l3 2M9.5 2.5h5"/>',
    at: '<circle cx="12" cy="12" r="3.6"/><path d="M15.6 8.4v5a2.4 2.4 0 0 0 4.8 0V12a8.4 8.4 0 1 0-3.3 6.7"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    draw: '<path d="M3 17c3-6 5-9 7-9s0 8 3 8 3-7 6-7"/><path d="M4 21h16"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    brush: '<path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-2.1.9H5v-4.4a3 3 0 0 1 .9-2.1z"/><path d="M12.5 5.5l6 6"/>',
    bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    boltoff: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/><path d="M3 3l18 18"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9.5 2.5h5"/>',
    flip: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 3v5.5h-5.5M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 21v-5.5h5.5"/>',
    expand: '<path d="M6 9l6 6 6-6"/>', collapse: '<path d="M6 15l6-6 6 6"/>',
    textaa: '<path d="M2.8 19L8 5l5.2 14M4.7 14h6.6M14.5 19l3.3-8.5L21.2 19M15.6 16.4h4.4"/>',
    sticker: '<path d="M14 21H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v6z"/><path d="M21 14h-3.5a3.5 3.5 0 0 0-3.5 3.5V21"/><path d="M9 9.5v.5M15 9.5v.5M9 14c.8.8 1.8 1.2 3 1.2"/>',
    loop: '<path d="M7 8a4.5 4.5 0 1 0 0 8c4 0 6-8 10-8a4 4 0 1 1 0 8c-4 0-6-8-10-8z"/>',
    rainbow: '<circle cx="12" cy="12" r="9"/>',
    anim: '<path d="M6 5l-3 14M12 5L9 19"/><path d="M15 19l3.5-14L22 19M16.2 15h4.7"/>',
    fx: '<path d="M12 3.5l8 14.5H4z"/><path d="M12 3v-1.5M5 7L3.8 6M19 7l1.2-1"/>',
    alignL: '<path d="M4 6h16M4 11h10M4 16h16M4 21h9"/>', alignC: '<path d="M4 6h16M7 11h10M4 16h16M8 21h8"/>', alignR: '<path d="M4 6h16M10 11h10M4 16h16M11 21h9"/>',
    abox: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7.5 17L12 6.5 16.5 17M9.2 13.5h5.6"/>',
    eyedrop: '<path d="M15 4l5 5-3 1-8.5 8.5-3.5 1 1-3.5L14 7z"/><path d="M13 6l5 5"/>',
    send: '<path d="M9 5l7 7-7 7"/>',
    arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    gear2: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    face: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c.6-3.8 3.3-6 7-6s6.4 2.2 7 6"/>',
    wand: '<path d="M4 20L16 8M14 6l1-3 1 3 3 1-3 1-1 3-1-3-3-1z"/>',
    gridic: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
    length: '<circle cx="12" cy="12" r="9" stroke-dasharray="2.4 2.4"/>',
    undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  function cic(k, cls) { return ic(ICN[k] || I[k] || "", cls); }

  /* ----- one text layer ----- */
  function textInner(it) {
    var anim = it.anim || "", lines = String(it.text || "").split("\n"), n = 0;
    function word(w) { return '<span class="w">' + Array.from(w).map(function (c) { return '<i style="--n:' + (n++) + '">' + esc(c) + "</i>"; }).join("") + "</span>"; }
    if (anim === "typewriter" || anim === "jump") return lines.map(function (l) { return l.split(" ").map(function (w) { n++; return w ? word(w) : ""; }).join(" "); }).join("<br>");
    return lines.map(esc).join("<br>");
  }
  function textHTML(it) {
    var col = okColor(it.color), bgm = it.bgm | 0, tc = bgm === 2 ? contrastOf(col) : col, inner = "";
    if (bgm === 1) inner = "background:rgba(0,0,0,.78);"; else if (bgm === 2) inner = "background:" + col + ";";
    var st = "--fs:" + (it.size || 8) + ";color:" + tc + ";--c:" + tc;
    var cls = "tx f-" + esc(it.font || "classic") + " a-" + esc(it.align || "center") + (it.fx ? " fx-" + esc(it.fx) : "") + (it.anim ? " an-" + esc(it.anim) : "") + (bgm ? " hasbg" : "");
    return '<div class="' + cls + '" style="' + st + '"><span class="txi" style="' + inner + '"><span class="txt">' + textInner(it) + "</span></span></div>";
  }

  /* ----- stickers ----- */
  function stkClass(it, extra) { return "stk k-" + it.k + " s" + ((it.st | 0) % 4) + (extra ? " " + extra : ""); }
  function flipHTML(c) {
    function box(ch) { return '<b class="fl">' + ch + "</b>"; }
    return '<span class="flg">' + box(c.h[0]) + box(c.h[1]) + '</span><span class="flg">' + box(c.m[0]) + box(c.m[1]) + "</span>" + (c.ap ? '<span class="flap">' + c.ap + "</span>" : "");
  }
  function cdHTML(it) {
    var p = cdParts(it.d.end) || { d: "00", h: "00", m: "00", s: "00" };
    function cell(v, l, k) { return '<span class="cdc"><b data-cdv="' + k + '">' + v + "</b><small>" + l + "</small></span>"; }
    return '<div class="cdt">' + esc(it.d.title || "Countdown") + '</div><div class="cdb" data-cd="' + esc(it.d.end) + '">' + (p.done ? '<span class="cdend">Ended</span>' : cell(p.d, "DAYS", "d") + cell(p.h, "HRS", "h") + cell(p.m, "MINS", "m") + cell(p.s, "SECS", "s")) + "</div>";
  }
  function frameHTML(it) {
    var shape = it.d.shape || "round", u = it.d.url || "";
    return '<div class="frm fr-' + esc(shape) + '"><span class="fri" style="background-image:url(&quot;' + esc(u).replace(/"/g, "") + '&quot;)"></span></div>';
  }
  function decoText(it) {
    var id = it.d && it.d.id, row = null;
    CDECO.forEach(function (r) { if (r[0] === id) row = r; });
    if (id === "day") return new Date().toLocaleDateString([], { weekday: "long" }).toUpperCase();
    return row ? row[1] : "";
  }
  function stickerInner(it) {
    var d = it.d || {}, c;
    switch (it.k) {
      case "location": return ic(I.mapPin) + "<span>" + esc(d.name || "Location") + "</span>";
      case "mention": return "<span>@" + esc(d.handle || "") + "</span>";
      case "hashtag": return "<span>#" + esc(d.tag || "") + "</span>";
      case "link": return ic(I.link) + "<span>" + esc(d.label || hostOf(d.url || "")) + "</span>";
      case "music": return '<span class="mu-art">' + ic(I.music) + '</span><span class="mu-t"><b>' + esc(d.title || "Song") + "</b><small>" + esc(d.artist || "") + "</small></span>";
      case "time":
        c = clockParts(d.ts);
        if (it.st % 3 === 0) return flipHTML(c);
        if (it.st % 3 === 1) return '<span class="tm-big">' + esc(c.txt) + "</span>";
        return ic(ICN.clock) + "<span>" + esc(c.txt) + " · " + esc(c.date) + "</span>";
      case "countdown": return cdHTML(it);
      case "poll": return '<div class="pq">' + esc(d.q || "Ask a question") + '</div><div class="po"><button type="button" class="pb" data-opt="0"><i></i><span>' + esc(d.a || "Yes") + '</span><em></em></button><button type="button" class="pb" data-opt="1"><i></i><span>' + esc(d.b || "No") + "</span><em></em></button></div>";
      case "slider": return '<div class="sq">' + esc(d.q || "") + '</div><div class="sl" data-sl><span class="slf"></span><span class="slk">' + esc(d.e || "😍") + '</span></div><div class="sla"></div>';
      case "question": return '<div class="qh">Questions</div><div class="qb">' + esc(d.q || "Ask me a question") + '</div><div class="qa">Tap to answer</div>';
      case "addyours": return '<span class="ay-i">' + cic("addyours") + '</span><span class="ay-t"><small>ADD YOURS</small><b>' + esc(d.q || "Add yours") + "</b></span>";
      case "photo": return '<span class="ph s' + (it.st % 4) + '" style="background-image:url(&quot;' + esc(d.url || "").replace(/"/g, "") + '&quot;)"></span>';
      case "frame": return frameHTML(it);
      case "strip": return (d.urls || []).map(function (u) { return '<span class="sp" style="background-image:url(&quot;' + esc(u).replace(/"/g, "") + '&quot;)"></span>'; }).join("");
      case "emoji": return '<span class="em">' + esc(d.e || "😀") + "</span>";
      case "avatar": return avInner(d.name, d.url, 120);
      case "deco": return "<span>" + esc(decoText(it)) + "</span>";
      case "gif": return '<img alt="" src="' + esc(d.url || "") + '" draggable="false">';
    }
    return "";
  }
  function ovlItemHTML(it, edit) {
    var x = Number(it.x) || 50, y = Number(it.y) || 50, r = Number(it.r) || 0, s = Number(it.s) || 1;
    var tf = "left:" + x + "%;top:" + y + "%;transform:translate(-50%,-50%) rotate(" + r + "deg) scale(" + s + ")";
    if (it.t === "text") return '<div class="oi" data-id="' + esc(it.id) + '" data-t="text" style="' + tf + '">' + textHTML(it) + "</div>";
    return '<div class="oi" data-id="' + esc(it.id) + '" data-t="sticker" data-k="' + esc(it.k) + '" style="' + tf + '"><div class="' + stkClass(it, it.k === "deco" ? "deco " + esc(((CDECO.filter(function (r0) { return r0[0] === (it.d && it.d.id); })[0]) || [0, 0, "d1"])[2]) : "") + '">' + stickerInner(it) + "</div></div>";
  }
  function drawSvg(items) {
    var out = "";
    (items || []).forEach(function (it) {
      if (it.t !== "draw") return;
      (it.paths || []).forEach(function (p) {
        if (!p.p || !p.p.length) return;
        var d = "M" + p.p[0][0] + " " + p.p[0][1];
        if (p.p.length === 1) d += " l0.01 0"; else for (var i = 1; i < p.p.length; i++) d += " L" + p.p[i][0] + " " + p.p[i][1];
        var neon = p.b === "neon", pc = okColor(p.c);
        out += '<path d="' + d + '" class="dp b-' + esc(p.b || "pen") + '" stroke="' + (neon ? "#fff" : pc) + '" stroke-width="' + (Number(p.w) || 1) + '" fill="none" stroke-linecap="round" stroke-linejoin="round"' + (neon ? ' style="filter:drop-shadow(0 0 1.2px ' + pc + ") drop-shadow(0 0 2.6px " + pc + ')"' : "") + "/>";
      });
    });
    return out ? '<svg class="odraw" viewBox="0 0 100 177.78" preserveAspectRatio="none" aria-hidden="true">' + out + "</svg>" : "";
  }
  function fxHTML(k) {
    if (!k) return "";
    var n = { sparkles: 14, hearts: 10, snow: 26, confetti: 22 }[k] || 0, parts = "";
    var glyph = { sparkles: "✦", hearts: "❤", snow: "❄", confetti: "" }[k] || "";
    for (var i = 0; i < n; i++) {
      var x = (i * 37 + 11) % 100, d = ((i * 53) % 40) / 10, sz = 3 + (i * 7) % 5, dur = 4 + (i * 13) % 5;
      parts += '<i style="left:' + x + "%;--d:" + d + "s;--z:" + sz + ";--t:" + dur + "s;--h:" + ((i * 47) % 360) + '">' + glyph + "</i>";
    }
    return '<div class="ofx fx-' + esc(k) + '">' + parts + "</div>";
  }
  /* the whole 9:16 layer: effects, drawings, text and stickers */
  function ovlStageHTML(o, edit) {
    if (!o || Array.isArray(o)) return "";
    var items = (o.items || []).filter(function (it) { return it.t !== "draw"; });
    return '<div class="ostage' + (edit ? " edit" : "") + '">' + fxHTML(o.fx) + drawSvg(o.items) + items.map(function (it) { return ovlItemHTML(it, edit); }).join("") + (o.ai ? '<span class="oai">AI info</span>' : "") + "</div>";
  }
  /* a live clock for countdowns */
  setInterval(function () {
    $$("[data-cd]").forEach(function (el) {
      var p = cdParts(el.dataset.cd); if (!p) return;
      if (p.done) { if (!el.querySelector(".cdend")) el.innerHTML = '<span class="cdend">Ended</span>'; return; }
      ["d", "h", "m", "s"].forEach(function (k) { var b = el.querySelector('[data-cdv="' + k + '"]'); if (b && b.textContent !== p[k]) b.textContent = p[k]; });
    });
  }, 1000);

  /* ---------- using stickers in the story viewer ---------- */
  var STKX = {};  /* story id -> { stats: {stickerId: {choice: n}|{avg,n}}, mine: {stickerId: {...}} } */
  async function loadStickerState(s) {
    var o = s.overlays; if (!o || !o.items) return;
    var live = o.items.some(function (it) { return it.t === "sticker" && (it.k === "poll" || it.k === "slider" || it.k === "question"); });
    if (!live) return;
    var st = STKX[s.id] = STKX[s.id] || { stats: {}, mine: {} };
    var res = await Promise.all([
      sb.rpc("story_sticker_stats", { p_story: s.id }),
      sb.from("story_responses").select("sticker_id,choice,num,body").eq("story_id", s.id).eq("user_id", S.user.id)
    ]);
    st.stats = {}; (res[0].data || []).forEach(function (r) {
      var e = st.stats[r.sticker_id] = st.stats[r.sticker_id] || { c: {}, n: 0, avg: null };
      if (r.choice != null) e.c[r.choice] = Number(r.n); e.n += Number(r.n); if (r.avg_num != null) e.avg = r.avg_num;
    });
    st.mine = {}; (res[1].data || []).forEach(function (r) { st.mine[r.sticker_id] = r; });
    if (SV && curStory().s === s) paintStickers(s);
  }
  function paintStickers(s) {
    var st = STKX[s.id]; if (!st) return;
    $$("#story .oi[data-k]").forEach(function (el) {
      var id = el.dataset.id, k = el.dataset.k, mine = st.mine[id], e = st.stats[id];
      if (k === "poll") {
        var tot = e ? e.n : 0, own = curStory().own;
        el.classList.toggle("voted", !!mine || own);
        $$(".pb", el).forEach(function (b) {
          var i = +b.dataset.opt, n = e ? (e.c[i] || 0) : 0, pct = tot ? Math.round(n / tot * 100) : 0;
          b.querySelector("i").style.width = (mine || own ? pct : 0) + "%"; b.querySelector("em").textContent = mine || own ? pct + "%" : "";
          b.classList.toggle("mine", !!mine && mine.choice === i);
        });
      } else if (k === "slider") {
        var sl = $(".sl", el), av = e && e.avg != null ? e.avg : null, val = mine ? mine.num : (curStory().own && av != null ? av : null);
        if (val != null) { sl.style.setProperty("--v", val); sl.classList.add("set"); }
        $(".sla", el).textContent = av != null && (mine || curStory().own) ? "Average " + Math.round(av * 100) + "%" + (e.n ? " · " + e.n + (e.n === 1 ? " response" : " responses") : "") : "";
      } else if (k === "question") {
        $(".qa", el).textContent = curStory().own ? (e ? e.n : 0) + (e && e.n === 1 ? " answer" : " answers") : mine ? "Answer sent" : "Tap to answer";
      }
    });
  }
  async function respond(s, id, row) {
    var r = await sb.from("story_responses").insert(Object.assign({ story_id: s.id, sticker_id: id }, row));
    if (r.error) { toast(/duplicate|unique/i.test(r.error.message || "") ? "You already answered." : niceErr(r.error)); return false; }
    var st = STKX[s.id] = STKX[s.id] || { stats: {}, mine: {} };
    st.mine[id] = Object.assign({ sticker_id: id }, row);
    await loadStickerState(s); return true;
  }
  async function stickerNav(it, inStory, onDone) {
    var d = it.d || {}, k = it.k, hold = function (on) { if (inStory) pauseStory(on); else if (typeof pauseReels === "function") { if (on) pauseReels(); else resumeReels(); } };
    if (k === "mention") { var h = d.handle; if (inStory) finishStories(false); return openUserByHandle(h), true; }
    if (k === "hashtag") { var tg = d.tag; if (inStory) finishStories(false); return searchTag(tg), true; }
    if (k === "link") {
      var u = safeUrl(d.url); if (!u) return toast("That link can't be opened."), true;
      hold(true); var ok = await confirmSheet("Open this link?", u, "Open", false); hold(false);
      if (ok) window.open(u, "_blank", "noopener,noreferrer"); return true;
    }
    if (k === "location") {
      hold(true); var ok2 = await confirmSheet("See " + (d.name || "this place") + " on the map?", "Opens OpenStreetMap in a new tab.", "Open map", false); hold(false);
      if (ok2) window.open("https://www.openstreetmap.org/" + (d.lat != null ? "?mlat=" + d.lat + "&mlon=" + d.lon + "#map=15/" + d.lat + "/" + d.lon : "search?query=" + encodeURIComponent(d.name || "")), "_blank", "noopener,noreferrer"); return true;
    }
    return false;
  }
  document.addEventListener("click", function (e) {
    var o = e.target.closest && e.target.closest("#v-reels .rovl-wrap .oi[data-k]"); if (!o) return;
    var rl = o.closest(".reel"), r = rl && findReel(rl.dataset.id), it = null;
    if (!r || !r.overlays || !r.overlays.items) return;
    r.overlays.items.forEach(function (x) { if (x.id === o.dataset.id) it = x; });
    if (it) stickerNav(it, false);
  });
  async function stickerTap(el, ev) {
    if (!SV) return;
    var c = curStory(), s = c.s, it = null, id = el.dataset.id, k = el.dataset.k;
    ((s.overlays && s.overlays.items) || []).forEach(function (x) { if (x.id === id) it = x; });
    if (!it) return;
    var d = it.d || {};
    if (await stickerNav(it, true)) return;
    var st = STKX[s.id] || { stats: {}, mine: {} };
    if (k === "poll" && !c.own && !st.mine[id]) {
      var b = ev.target.closest(".pb"); if (!b) return;
      await respond(s, id, { choice: +b.dataset.opt });
    } else if (k === "slider" && !c.own && !st.mine[id]) {
      var sl = $(".sl", el), rc = sl.getBoundingClientRect(), v = Math.max(0, Math.min(1, (ev.clientX - rc.left) / rc.width));
      sl.style.setProperty("--v", v); sl.classList.add("set");
      await respond(s, id, { num: Math.round(v * 100) / 100 });
    } else if (k === "question" && !c.own && !st.mine[id]) {
      pauseStory(true);
      openSheet('<p class="sh-title">' + esc(d.q || "Ask me a question") + '</p><div class="sh-pad"><textarea class="in" id="qa-in" maxlength="300" rows="3" placeholder="Type your answer" aria-label="Your answer"></textarea></div><div class="sh-pad"><button class="btn fill wide" id="qa-send" data-act="qasend">Send</button></div>', { label: "Answer", onClose: function () { pauseStory(false); } });
      S.qaCtx = { s: s, id: id }; setTimeout(function () { var q = $("#qa-in"); if (q) q.focus(); }, 80);
    } else if (k === "question" && c.own) {
      showAnswers(s, id, d.q);
    } else if (k === "addyours") {
      finishStories(false); openCreator("story", { addYours: { q: d.q } });
    }
  }
  async function sendAnswer() {
    var cx = S.qaCtx, t = ($("#qa-in") || {}).value || ""; t = t.trim(); if (!cx || !t) return;
    var ok = await respond(cx.s, cx.id, { body: t.slice(0, 300) });
    if (ok) { closeSheet(); toast("Answer sent."); }
  }
  async function showAnswers(s, id, q) {
    pauseStory(true);
    var r = await sb.from("story_responses").select("body,created_at,user:profiles!user_id(display_name,handle,avatar_url)").eq("story_id", s.id).eq("sticker_id", id).order("created_at", { ascending: false }).limit(100);
    var rows = r.data || [];
    openSheet('<p class="sh-title">' + esc(q || "Questions") + "</p>" + (rows.length ? rows.map(function (x) {
      var p = x.user || {};
      return '<div class="person">' + avInner(p.display_name, p.avatar_url, 40) + '<div class="pi"><b>' + esc(p.display_name || "Someone") + "</b><span>" + esc(x.body || "") + "</span></div></div>";
    }).join("") : '<p class="muted sh-desc">No answers yet.</p>'), { tall: rows.length > 5, label: "Answers", onClose: function () { pauseStory(false); } });
  }
  /* the slider thumb follows a finger */
  document.addEventListener("pointerdown", function (e) {
    var sl = e.target.closest && e.target.closest("#story .oi[data-k=slider] .sl"); if (!sl || !SV) return;
    var c = curStory(), id = sl.closest(".oi").dataset.id, st = STKX[c.s.id] || { mine: {} };
    if (c.own || st.mine[id]) return;
    e.stopPropagation();
    var rc = sl.getBoundingClientRect();
    function mv(ev) { var v = Math.max(0, Math.min(1, (ev.clientX - rc.left) / rc.width)); sl.style.setProperty("--v", v); sl.classList.add("set"); sl.dataset.v = v; }
    function up(ev) {
      document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up);
      var v = Math.round((+sl.dataset.v || 0) * 100) / 100; if (SV && curStory().s === c.s) respond(c.s, id, { num: v });
    }
    mv(e); document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up);
  }, true);


  /* ---------- the creator: camera, modes (story / reel / templates) and text-create ---------- */
  var CR = null, SOUND_HOOK = null;
  var CR_MODES = [["story", "STORY"], ["reel", "REEL"], ["templates", "TEMPLATES"]];
  var TPLS = [
    { id: "duo", name: "Duo", n: 2, cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
    { id: "trio", name: "Trio", n: 3, cells: [[0, 0, 1, 1 / 3], [0, 1 / 3, 1, 1 / 3], [0, 2 / 3, 1, 1 / 3]] },
    { id: "grid", name: "Grid", n: 4, cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
    { id: "polaroid", name: "Polaroids", n: 3, polaroid: true }
  ];
  function openCreator(mode, opt) {
    if (CR) return;
    opt = opt || {};
    pauseReels();
    if (typeof SV !== "undefined" && SV) finishStories(false);
    CR = { mode: mode || "story", screen: "cam", facing: "user", flash: false, timer: 0, filter: "", length: 15, grid: false, mirror: true, toolsOpen: true, sound: null, ov: newOvl(), cap: "", aud: "all", busy: false, opt: opt, stream: null, rec: null, boom: false, sel: null, media: null, expanded: false, tbg: 0, count: 0 };
    if (opt.sound) CR.sound = opt.sound;
    if (opt.addYours) { CR.mode = "story"; CR.pendingAY = opt.addYours; }
    var el = $("#creator"); el.hidden = false; el.className = "creator";
    armBack();
    renderCam();
    setTimeout(function () { if (CR) { CR.toolsOpen = false; camTools(); } }, 3200);
    startCam();
  }
  function crTeardown() {
    if (!CR) return;
    camStop();
    if (CR.recAud) { try { CR.recAud.pause(); } catch (e) {} }
    if (CR.sync) { CR.sync.stop(); }
    if (CR.edAud) { try { CR.edAud.pause(); } catch (e) {} }
    var m = CR.media; if (m && m.url && m.blobUrl) { try { URL.revokeObjectURL(m.url); } catch (e) {} }
    (CR.blobUrls || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    clearInterval(CR.recTick); clearTimeout(CR.holdT);
  }
  function closeCreator() {
    if (!CR) return;
    crTeardown(); CR = null;
    var el = $("#creator"); el.hidden = true; el.innerHTML = ""; el.className = "creator";
    if (S.view === "reels") resumeReels();
  }
  async function exitCreator() {
    if (!CR) return;
    if (CR.screen === "edit" && !CR.opt.nodiscard) {
      var ok = await confirmSheet("Discard this " + (CR.mode === "reel" ? "reel" : "story") + "?", "If you go back now, you will lose your edits.", "Discard", true);
      if (!ok) return;
    }
    if (CR && CR.recording) { try { CR.rec.onstop = null; CR.rec.stop(); } catch (e) {} }
    closeCreator();
  }

  /* ----- the camera skeleton ----- */
  function renderCam() {
    var el = $("#creator");
    el.innerHTML = '<div class="cr-cam" id="cr-cam">' +
      '<video class="cr-live" id="cr-live" autoplay muted playsinline></video><div class="cr-tcbg" id="cr-tcbg"></div><div class="cr-gridl" id="cr-gridl"></div><div class="cr-flash" id="cr-flash"></div>' +
      '<div class="cr-noperm" id="cr-noperm" hidden><p>Allow camera access to take photos and videos.</p><button class="btn fill" data-cr="retry">Allow camera</button></div>' +
      '<div class="cr-top" id="cr-top"></div><button class="cr-audio" id="cr-audio" data-cr="audio" hidden></button>' +
      '<div class="cr-tools" id="cr-tools"></div>' +
      '<div class="cr-tpl" id="cr-tpl" hidden></div>' +
      '<div class="cr-count" id="cr-count" hidden></div><div class="cr-rectime" id="cr-rectime" hidden>0:00</div>' +
      '<div class="cr-shutrow" id="cr-shutrow"><button class="cr-undo" id="cr-undo" data-cr="discard" hidden>Undo</button><button class="cr-shut" id="cr-shut" aria-label="Capture"></button><div class="cr-strip" id="cr-strip"></div><button class="cr-next" id="cr-next" data-cr="finish" hidden aria-label="Next">' + cic("send") + "</button></div>" +
      '<div class="cr-bot"><button class="cr-gal" data-cr="gallery" aria-label="Choose from gallery">' + ic(I.image) + '</button><div class="cr-modes" id="cr-modes" role="tablist" aria-label="Create mode"></div><button class="cr-flip" data-cr="flip" aria-label="Flip camera">' + cic("flip") + "</button></div></div>";
    camTop(); camTools(); camModes(); camStrip(); camShut();
    bindShutter();
    var cam = $("#cr-cam"), sx = null;
    cam.addEventListener("pointerdown", function (e) { if (e.target.closest("button,.cr-strip,.cr-tpl")) { sx = null; return; } sx = { x: e.clientX, y: e.clientY }; });
    cam.addEventListener("pointerup", function (e) {
      if (!sx || !CR || CR.recording) return;
      var dx = e.clientX - sx.x, dy = e.clientY - sx.y; sx = null;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) crSlide(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && CR.screen === "tcreate") textCreateStart();
    });
  }
  function camTop() {
    var t = $("#cr-top"); if (!t || !CR) return;
    var tc = CR.screen === "tcreate";
    t.innerHTML = '<button class="cr-ic" data-cr="close" aria-label="Close">' + ic(I.close) + "</button>" +
      (tc ? "" : '<div class="cr-mid"><button class="cr-pill' + (CR.flash ? " on" : "") + '" data-cr="flash" aria-label="Flash ' + (CR.flash ? "on" : "off") + '">' + cic(CR.flash ? "bolt" : "boltoff") + "</button>" +
        '<button class="cr-pill' + (CR.timer ? " on" : "") + '" data-cr="timer" aria-label="Timer">' + (CR.timer ? "<b>" + CR.timer + "s</b>" : cic("timer")) + "</button></div>") +
      '<button class="cr-ic" data-cr="gear" aria-label="Camera settings">' + cic("gear2") + "</button>";
    t.classList.toggle("rec", !!CR.recording);
    var a = $("#cr-audio");
    if (a) { a.hidden = !(CR.mode === "reel" && CR.screen === "cam"); a.classList.toggle("on", !!CR.sound); a.innerHTML = ic(I.music) + "<span>" + (CR.sound ? esc(soundLabel(CR.sound)) : "Add audio") + "</span>"; }
  }
  function camTools() {
    var t = $("#cr-tools"); if (!t || !CR) return;
    var rows = [], open = CR.toolsOpen;
    function row(act, icon, label, on) { return '<button class="cr-tl' + (on ? " on" : "") + '" data-cr="' + act.slice(2) + '" aria-label="' + label + '">' + icon + (open ? "<span>" + label + "</span>" : "") + "</button>"; }
    if (CR.screen === "tcreate") rows.push('<button class="cr-tl pill on" data-cr="create">' + cic("textaa") + "<span>Create</span></button>");
    else if (CR.mode === "reel") {
      rows.push(row("craudio", ic(I.music), "Audio", !!CR.sound), row("creffects", cic("sparkle"), "Effects", !!CR.filter && CR.filter !== "soft"), row("crtouch", cic("face"), "Touch up", CR.filter === "soft"), row("crlength", cic("length"), "Length " + CR.length + "s", CR.length !== 15));
      if (CR.expanded) rows.push(row("crgrid", cic("gridic"), "Grid", CR.grid), row("crmirror", cic("flip"), "Mirror", CR.mirror));
    } else if (CR.mode === "story") {
      rows.push(row("crcreate", cic("textaa"), "Create", false), row("crboom", cic("loop"), "Boomerang", CR.boom), row("creffects", cic("sparkle"), "Effects", !!CR.filter));
      if (CR.expanded) rows.push(row("crgrid", cic("gridic"), "Grid", CR.grid), row("crmirror", cic("flip"), "Mirror", CR.mirror));
    }
    if (rows.length) rows.push('<button class="cr-tl chev" data-cr="expand" aria-label="' + (CR.expanded ? "Fewer tools" : "More tools") + '">' + cic(CR.expanded ? "collapse" : "expand") + "</button>");
    t.innerHTML = rows.join("");
    t.classList.toggle("labels", open);
    t.hidden = !!CR.recording;
  }
  function camModes() {
    var m = $("#cr-modes"); if (!m || !CR) return;
    var cur = CR.screen === "tcreate" ? "story" : CR.mode;
    m.innerHTML = CR_MODES.map(function (x) { return '<button role="tab" class="' + (x[0] === cur ? "on" : "") + '" aria-selected="' + (x[0] === cur) + '" data-cr="mode" data-m="' + x[0] + '">' + x[1] + "</button>"; }).join("");
    m.hidden = !!CR.recording;
    var cam = $("#cr-cam"); if (cam) { cam.dataset.mode = CR.mode; cam.classList.toggle("tc", CR.screen === "tcreate"); cam.classList.toggle("tpl", CR.mode === "templates"); }
    var tp = $("#cr-tpl"); if (tp) {
      tp.hidden = CR.mode !== "templates";
      if (CR.mode === "templates") tp.innerHTML = '<p class="cr-tplh">Templates</p><div class="cr-tplg">' + TPLS.map(function (t) {
        var cells = t.polaroid ? '<i class="po p1"></i><i class="po p2"></i><i class="po p3"></i>' : t.cells.map(function (c) { return '<i style="left:' + c[0] * 100 + "%;top:" + c[1] * 100 + "%;width:" + c[2] * 100 + "%;height:" + c[3] * 100 + '%"></i>'; }).join("");
        return '<button class="cr-tplc" data-cr="tpl" data-id="' + t.id + '"><span class="cr-tpli' + (t.polaroid ? " pol" : "") + '">' + cells + "</span><b>" + t.name + "</b><small>" + t.n + " photos</small></button>";
      }).join("") + "</div>";
    }
    var sr = $("#cr-shutrow"); if (sr) sr.hidden = CR.mode === "templates";
  }
  function camStrip() {
    var s = $("#cr-strip"); if (!s || !CR) return;
    if (CR.screen === "tcreate") {
      s.innerHTML = '<button class="cr-grad" data-cr="grad" aria-label="Change background" style="background:' + STORY_BG[CR.tbg % STORY_BG.length] + '"></button>'; s.classList.add("tc"); return;
    }
    s.classList.remove("tc");
    s.innerHTML = CFILTERS.map(function (f) {
      return '<button class="cr-fl' + (CR.filter === f.id ? " on" : "") + '" data-cr="filter" data-f="' + f.id + '" aria-label="' + f.name + '"><i style="filter:' + (f.css || "none") + '"></i></button>';
    }).join("");
    s.hidden = !!CR.recording;
  }
  function camShut() {
    var b = $("#cr-shut"); if (!b || !CR) return;
    var tc = CR.screen === "tcreate";
    b.className = "cr-shut" + (CR.recording ? " rec" : "") + (CR.paused ? " paused" : "") + (tc ? " aa" : "") + (CR.mode === "reel" ? " reel" : "");
    b.innerHTML = '<svg class="cr-ring" viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="37" class="r0"/><circle cx="40" cy="40" r="37" class="r1" id="cr-r1" transform="rotate(-90 40 40)"/></svg><span class="cr-core">' + (tc ? cic("textaa") : "") + "</span>";
    var u = $("#cr-undo"), n = $("#cr-next");
    if (u) u.hidden = !(CR.paused && CR.recording);
    if (n) n.hidden = !(CR.paused && CR.recording);
    var st = $("#cr-strip"); if (st) st.hidden = !!CR.recording;
  }
  function crSlide(dir) {
    if (!CR || CR.screen === "edit") return;
    var order = ["story", "reel", "templates"], cur = CR.screen === "tcreate" ? "story" : CR.mode, i = order.indexOf(cur) + dir;
    if (i < 0 || i >= order.length) return;
    setMode(order[i]);
  }
  function setMode(m) {
    if (!CR || CR.recording) return;
    var wasTc = CR.screen === "tcreate";
    CR.mode = m; CR.screen = "cam"; CR.boom = false;
    var cam = $("#cr-cam"); if (cam) { cam.classList.remove("slide-l", "slide-r"); void cam.offsetWidth; cam.classList.add("pulse"); setTimeout(function () { var c2 = $("#cr-cam"); if (c2) c2.classList.remove("pulse"); }, 260); }
    camTop(); camTools(); camModes(); camStrip(); camShut();
    if (m === "templates") camStop(); else if (!CR.stream || wasTc) startCam();
  }

  /* ----- the live camera ----- */
  async function startCam() {
    if (!CR) return;
    var v = $("#cr-live"), np = $("#cr-noperm");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { if (np) { np.hidden = false; $("p", np).textContent = "This browser can't open the camera. You can still pick from your gallery."; $(".btn", np).hidden = true; } return; }
    camStop();
    try {
      var st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: CR && CR.facing || "user", width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: false });
      if (!CR) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
      CR.stream = st; var v2 = $("#cr-live"); if (!v2) return;
      v2.srcObject = st; v2.play().catch(function () {});
      if (np) np.hidden = true;
      camApplyLook();
    } catch (e) {
      if (!CR) return;
      if (np) { np.hidden = false; $("p", np).textContent = "Allow camera access to take photos and videos."; $(".btn", np).hidden = false; }
    }
  }
  function camStop() {
    if (!CR || !CR.stream) return;
    CR.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
    CR.stream = null; var v = $("#cr-live"); if (v) v.srcObject = null;
  }
  function camApplyLook() {
    var v = $("#cr-live"); if (!v || !CR) return;
    v.style.filter = filterCss(CR.filter) || "";
    v.classList.toggle("mirror", CR.facing === "user" && CR.mirror);
    var g = $("#cr-gridl"); if (g) g.hidden = !CR.grid;
  }
  async function camTorch(on) {
    if (!CR || !CR.stream || CR.facing === "user") return false;
    try { var tr = CR.stream.getVideoTracks()[0]; await tr.applyConstraints({ advanced: [{ torch: !!on }] }); return true; } catch (e) { return false; }
  }

  /* ----- the shutter ----- */
  function bindShutter() {
    var b = $("#cr-shut"); if (!b) return;
    b.addEventListener("pointerdown", function (e) {
      if (!CR || CR.busy || CR.count) return; e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (x) {}
      CR.down = Date.now();
      if (CR.screen === "tcreate") return;
      if (CR.mode === "reel") {
        if (CR.recording && !CR.paused) { pauseRec(); return; }
        if (CR.recording && CR.paused) { resumeRec(); return; }
        CR.holdMode = false; if (CR.timer) return;
        crStartRec();
      } else if (CR.mode === "story" && !CR.boom) {
        CR.holdT = setTimeout(function () { if (CR && CR.down) { CR.holdMode = true; crStartRec(); } }, 380);
      }
    });
    b.addEventListener("pointerup", function (e) {
      if (!CR || CR.busy) return;
      var held = Date.now() - (CR.down || 0); CR.down = 0; clearTimeout(CR.holdT);
      if (CR.screen === "tcreate") return textCreateStart();
      if (CR.mode === "reel") {
        if (CR.timer && !CR.recording && !CR.count) return countThen(function () { crStartRec(); });
        if (CR.recording && CR.holdMode && held > 500) finishRec();
        return;
      }
      if (CR.recording) return finishRec();
      if (CR.boom) return CR.timer ? countThen(boomerang) : boomerang();
      if (CR.timer) return countThen(snap);
      snap();
    });
    b.addEventListener("pointercancel", function () { if (CR) { CR.down = 0; clearTimeout(CR.holdT); } });
  }
  function countThen(fn) {
    if (!CR) return;
    var n = CR.timer, c = $("#cr-count"); CR.count = n; c.hidden = false; c.textContent = n;
    var iv = setInterval(function () {
      if (!CR) return clearInterval(iv);
      CR.count--; if (CR.count <= 0) { clearInterval(iv); c.hidden = true; CR.count = 0; fn(); } else c.textContent = CR.count;
    }, 1000);
  }
  async function flashOn() {
    if (!CR || !CR.flash) return;
    if (CR.facing === "user") { var f = $("#cr-flash"); if (f) { f.classList.add("on"); setTimeout(function () { f.classList.remove("on"); }, 350); } }
    else await camTorch(true);
  }
  function frameCanvas(w, h) {
    var v = $("#cr-live"); if (!v || !v.videoWidth) return null;
    var c = document.createElement("canvas"), r = 9 / 16, vw = v.videoWidth, vh = v.videoHeight, sw = vw, sh = vh, sx = 0, sy = 0;
    if (vw / vh > r) { sw = Math.round(vh * r); sx = Math.round((vw - sw) / 2); } else { sh = Math.round(vw / r); sy = Math.round((vh - sh) / 2); }
    c.width = w; c.height = h; var g = c.getContext("2d");
    if (CR.facing === "user" && CR.mirror) { g.translate(w, 0); g.scale(-1, 1); }
    g.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    return c;
  }
  async function snap() {
    if (!CR) return;
    await flashOn();
    await sleep(CR.flash ? 120 : 0);
    var c = frameCanvas(1080, 1920);
    if (CR.flash && CR.facing !== "user") camTorch(false);
    if (!c) return toast("The camera isn't ready yet.");
    var blob = await new Promise(function (r) { c.toBlob(r, "image/jpeg", 0.9); });
    if (!blob || !CR) return;
    toEditor({ kind: "image", blob: blob, ext: "jpg", mime: "image/jpeg", url: URL.createObjectURL(blob), blobUrl: true, w: 1080, h: 1920 });
    CR.ov.filter = CR.filter || "";
  }
  function recMime() {
    if (!window.MediaRecorder) return "";
    var c = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (var i = 0; i < c.length; i++) { try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {} }
    return "";
  }
  async function crStartRec() {
    if (!CR || CR.recording) return;
    if (!CR.stream) return toast("The camera isn't ready yet.");
    if (!window.MediaRecorder) return toast("This browser can't record video here. Pick a video from your gallery.");
    var tracks = CR.stream.getVideoTracks().slice();
    if (!CR.sound) {
      try { if (!CR.mic) CR.mic = await navigator.mediaDevices.getUserMedia({ audio: true }); if (CR.mic) tracks = tracks.concat(CR.mic.getAudioTracks()); } catch (e) {}
    }
    if (!CR) return;
    var mt = recMime(), rec;
    try { rec = new MediaRecorder(new MediaStream(tracks), mt ? { mimeType: mt, videoBitsPerSecond: 4000000 } : {}); } catch (e) { return toast("Could not start recording."); }
    CR.chunks = []; CR.rec = rec; CR.recMime = (rec.mimeType || mt || "video/webm").split(";")[0]; CR.recT = 0; CR.recLast = Date.now(); CR.recording = true; CR.paused = false;
    rec.ondataavailable = function (e) { if (e.data && e.data.size) CR.chunks.push(e.data); };
    rec.onstop = function () { recStopped(); };
    rec.start(500);
    await flashOn();
    if (CR.sound) {
      try { CR.recAud = new Audio(CR.sound.url); CR.recAud.currentTime = CR.sound.start || 0; CR.recAud.volume = CR.sound.vol == null ? 0.8 : CR.sound.vol; CR.recAud.play().catch(function () {}); } catch (e) {}
    }
    var max = CR.mode === "reel" ? CR.length : 60;
    CR.max = max;
    clearInterval(CR.recTick);
    CR.recTick = setInterval(function () {
      if (!CR || !CR.recording) return clearInterval(CR && CR.recTick);
      if (!CR.paused) { var now = Date.now(); CR.recT += (now - CR.recLast) / 1000; CR.recLast = now; } else CR.recLast = Date.now();
      var r1 = $("#cr-r1"); if (r1) { r1.style.strokeDashoffset = String(232.5 * (1 - Math.min(1, CR.recT / max))); }
      var tm = $("#cr-rectime"); if (tm) { tm.hidden = false; tm.textContent = mmss(CR.recT); }
      if (CR.recT >= max) finishRec();
    }, 100);
    camTop(); camTools(); camModes(); camShut();
  }
  function pauseRec() { if (!CR || !CR.recording || CR.paused) return; try { CR.rec.pause(); } catch (e) {} if (CR.recAud) CR.recAud.pause(); CR.paused = true; camShut(); }
  function resumeRec() { if (!CR || !CR.recording || !CR.paused) return; try { CR.rec.resume(); } catch (e) {} if (CR.recAud) CR.recAud.play().catch(function () {}); CR.paused = false; CR.recLast = Date.now(); camShut(); }
  function finishRec() {
    if (!CR || !CR.recording) return;
    if (CR.recT < 0.6 && CR.mode !== "story") { toast("Keep recording a little longer."); return; }
    CR.recording = false; clearInterval(CR.recTick); CR.stopping = true;
    try { if (CR.rec.state !== "inactive") CR.rec.stop(); } catch (e) { recStopped(); }
    if (CR.recAud) CR.recAud.pause();
    CR.recFinish = true;
  }
  function discardRec() {
    if (!CR || !CR.recording) return;
    CR.recording = false; CR.paused = false; clearInterval(CR.recTick); CR.discard = true;
    try { CR.rec.stop(); } catch (e) {}
    if (CR.recAud) CR.recAud.pause();
    var tm = $("#cr-rectime"); if (tm) tm.hidden = true;
    var r1 = $("#cr-r1"); if (r1) r1.style.strokeDashoffset = "232.5";
    camTop(); camTools(); camModes(); camStrip(); camShut();
  }
  function recStopped() {
    if (!CR) return;
    var wasDiscard = CR.discard; CR.discard = false; CR.recording = false; CR.paused = false;
    var tm = $("#cr-rectime"); if (tm) tm.hidden = true;
    if (CR.flash && CR.facing !== "user") camTorch(false);
    if (wasDiscard) return;
    var type = CR.recMime || "video/webm", blob = new Blob(CR.chunks || [], { type: type }), dur = CR.recT;
    CR.chunks = [];
    if (blob.size < 500) { camTop(); camTools(); camModes(); camStrip(); camShut(); return toast("That recording was empty."); }
    var ext = type.indexOf("mp4") > -1 ? "mp4" : "webm", url = URL.createObjectURL(blob);
    toEditor({ kind: "video", blob: blob, ext: ext, mime: type, url: url, blobUrl: true, dur: dur, w: 1080, h: 1920 });
    CR.ov.filter = CR.filter || "";
  }

  /* a boomerang: a short burst played forwards and back, saved as a looping clip */
  async function boomerang() {
    if (!CR || CR.busy) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return toast("Boomerang isn't supported in this browser.");
    CR.busy = true; var ov = $("#cr-count"); ov.hidden = false; ov.className = "cr-count small"; ov.textContent = "Recording…";
    var frames = [], W = 540, H = 960;
    for (var i = 0; i < 14; i++) { var c = frameCanvas(W, H); if (c) frames.push(c); await sleep(80); }
    if (!CR) return;
    ov.textContent = "Making your boomerang…";
    var seq = frames.concat(frames.slice(1, -1).reverse()), out = document.createElement("canvas"); out.width = W; out.height = H;
    var g = out.getContext("2d"), stream = out.captureStream(15), mt = recMime(), chunks = [], rec;
    try { rec = new MediaRecorder(stream, mt ? { mimeType: mt, videoBitsPerSecond: 2500000 } : {}); } catch (e) { CR.busy = false; ov.hidden = true; ov.className = "cr-count"; return toast("Boomerang isn't supported in this browser."); }
    var done = new Promise(function (res) { rec.onstop = res; });
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(200);
    var rounds = 3;
    for (var r = 0; r < rounds; r++) for (var k = 0; k < seq.length; k++) { g.drawImage(seq[k], 0, 0); await sleep(66); }
    await sleep(120); rec.stop(); await done;
    if (!CR) return;
    CR.busy = false; ov.hidden = true; ov.className = "cr-count";
    var type = (rec.mimeType || mt || "video/webm").split(";")[0], blob = new Blob(chunks, { type: type }), ext = type.indexOf("mp4") > -1 ? "mp4" : "webm";
    toEditor({ kind: "video", blob: blob, ext: ext, mime: type, url: URL.createObjectURL(blob), blobUrl: true, dur: rounds * seq.length / 15, w: W, h: H, loop: true });
    CR.ov.filter = CR.filter || "";
  }

  /* ----- gallery and templates ----- */
  async function crGallery() {
    if (!CR || CR.busy) return;
    var reel = CR.mode === "reel", fs = await pickFiles(reel ? "video/*" : "image/*,video/*", false);
    var f = fs[0]; if (!f || !CR) return;
    try {
      if (isVideoFile(f)) {
        var vt = vidType(f); if (!vt) throw new Error("Use an MP4 or WebM video.");
        if (f.size > MAX_FILE) throw new Error("That video is over 50 MB. Trim it and try again.");
        var meta = await probeVideo(f), lim = reel ? 91 : 61;
        if (meta.duration > lim) { URL.revokeObjectURL(meta.url); throw new Error(reel ? "Reels can be up to 90 seconds." : "Stories can be up to 60 seconds."); }
        if (!CR) { URL.revokeObjectURL(meta.url); return; }
        toEditor({ kind: "video", blob: f, ext: fileExt(vt, f.name), mime: vt, url: meta.url, blobUrl: true, dur: meta.duration, w: meta.w, h: meta.h });
      } else {
        if (reel) throw new Error("Pick a video for your reel.");
        var p = await prepImage(f, { max: 1440 });
        if (!CR) return;
        toEditor({ kind: "image", blob: p.blob, ext: p.ext, mime: p.type, url: URL.createObjectURL(p.blob), blobUrl: true, w: p.w, h: p.h });
      }
      CR.ov.filter = "";
    } catch (e) { toast(e.message || niceErr(e)); }
  }
  async function crTemplate(id) {
    var t = null; TPLS.forEach(function (x) { if (x.id === id) t = x; });
    if (!t || !CR) return;
    var fs = await pickFiles("image/*", true);
    if (!fs.length || !CR) return;
    var W = 1080, H = 1920, c = document.createElement("canvas"); c.width = W; c.height = H; var g = c.getContext("2d");
    try {
      var imgs = [];
      for (var i = 0; i < Math.min(t.n, fs.length); i++) imgs.push(await loadBitmap(fs[i]));
      while (imgs.length < t.n) imgs.push(imgs[imgs.length % Math.max(1, fs.length)]);
      function cover(im, x, y, w, h, rad) {
        var iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height, s = Math.max(w / iw, h / ih), sw = w / s, sh = h / s;
        g.save(); if (rad) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, rad); else g.rect(x, y, w, h); g.clip(); } else { g.beginPath(); g.rect(x, y, w, h); g.clip(); }
        g.drawImage(im, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h); g.restore();
      }
      if (t.polaroid) {
        var gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, "#ff9a3c"); gr.addColorStop(1, "#e0360b"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        var specs = [[-0.12, 70, 140], [0.1, 330, 600], [-0.06, 160, 1130]];
        specs.forEach(function (s, k) {
          g.save(); g.translate(s[1] + 340, s[2] + 400); g.rotate(s[0]);
          g.fillStyle = "#fff"; g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 40; g.fillRect(-340, -400, 680, 800); g.shadowColor = "transparent";
          cover(imgs[k], -310, -370, 620, 620, 0); g.restore();
        });
      } else {
        g.fillStyle = "#111"; g.fillRect(0, 0, W, H);
        t.cells.forEach(function (cl, k) { cover(imgs[k], cl[0] * W + 6, cl[1] * H + 6, cl[2] * W - 12, cl[3] * H - 12, 0); });
      }
      imgs.forEach(function (im) { if (im && im.close) im.close(); });
      var blob = await new Promise(function (r) { c.toBlob(r, "image/jpeg", 0.88); });
      if (!CR || !blob) return;
      CR.mode = "story";
      toEditor({ kind: "image", blob: blob, ext: "jpg", mime: "image/jpeg", url: URL.createObjectURL(blob), blobUrl: true, w: W, h: H });
    } catch (e) { toast(e.message || "Could not make that template."); }
  }

  /* ----- text-create: a story made of words on a colour ----- */
  function openTextCreate() {
    if (!CR) return;
    CR.screen = "tcreate"; CR.mode = "story"; camStop();
    var bg = $("#cr-tcbg"); if (bg) bg.style.background = STORY_BG[CR.tbg % STORY_BG.length];
    var cam = $("#cr-cam"); if (cam) cam.classList.add("tc");
    camTop(); camTools(); camModes(); camStrip(); camShut();
    var tt = $("#cr-tcbg"); if (tt) tt.innerHTML = '<span class="cr-tap">Tap to type</span>';
  }
  function textCreateStart() {
    if (!CR) return;
    CR.ov = newOvl();
    toEditor({ kind: "text", bg: CR.tbg % STORY_BG.length }, true);
  }
  function crGrad() {
    if (!CR) return; CR.tbg = (CR.tbg + 1) % STORY_BG.length;
    var bg = $("#cr-tcbg"); if (bg) bg.style.background = STORY_BG[CR.tbg]; camStrip();
  }


  /* ---------- the story / reel editor ---------- */
  function toEditor(media, textFirst) {
    if (!CR) return;
    camStop(); clearInterval(CR.recTick);
    if (CR.recAud) { try { CR.recAud.pause(); } catch (e) {} }
    CR.media = media; CR.screen = "edit"; CR.expanded = false; CR.sel = null;
    if (media.kind === "text") CR.tbg = media.bg | 0;
    if (media.kind === "video" && CR.mode === "reel" && CR.sound && !CR.ov.music) {
      CR.ov.music = { track: CR.sound.track || null, url: CR.sound.url, title: CR.sound.title, artist: CR.sound.artist || "", start: CR.sound.start || 0, vol: CR.sound.vol == null ? 0.8 : CR.sound.vol, blob: CR.sound.blob || null, mime: CR.sound.mime, ext: CR.sound.ext, vvol: CR.sound.vvol == null ? 1 : CR.sound.vvol };
    }
    renderEditor();
    if (CR.pendingAY) { var q = CR.pendingAY; CR.pendingAY = null; addItem({ t: "sticker", k: "addyours", d: { q: q.q || "Add yours" }, st: 0, x: 50, y: 30, s: 1 }); toast("Add your own to " + (q.q || "this") + "."); }
    if (textFirst) openTextEditor(null);
  }
  function edBgCss() { return STORY_BG[(CR.tbg | 0) % STORY_BG.length]; }
  function edMediaHTML() {
    var m = CR.media, f = filterCss(CR.ov.filter), st = f ? ' style="filter:' + f + '"' : "";
    if (m.kind === "image") return '<img class="cr-m" id="cr-m" alt="" src="' + esc(m.url) + '"' + st + ">";
    if (m.kind === "video") return '<video class="cr-m" id="cr-m" src="' + esc(m.url) + '" loop playsinline autoplay' + (CR.ov.music ? " muted" : "") + st + "></video>";
    return '<div class="cr-m bgfill" id="cr-m" style="background:' + edBgCss() + '"></div>';
  }
  function edRailHTML() {
    var text = CR.media.kind === "text", reel = CR.mode === "reel", open = CR.expanded;
    function b(a, icon, label, on) { return '<div class="rr"><span class="rl">' + label + '</span><button class="cr-rb' + (on ? " on" : "") + '" data-cr="' + a + '" aria-label="' + label + '">' + icon + "</button></div>"; }
    var h = b("edtext", cic("textaa"), "Text") + b("edstk", cic("sticker"), "Stickers") + b("edmusic", ic(I.music), reel ? "Audio" : "Music", !!CR.ov.music) + b("edrestyle", text ? cic("rainbow") : cic("brush"), text ? "Background" : "Restyle", !!CR.ov.filter);
    if (open) h += b("edfx", cic("sparkle"), "Effects", !!CR.ov.fx) + (reel ? "" : b("edmention", cic("at"), "Mention", !!CR.ov.mentions.length)) + b("eddraw", cic("draw"), "Draw") + b("edsave", cic("download"), "Save") + (reel ? "" : b("edmore", ic(I.more), "More"));
    h += '<button class="cr-rb sm" data-cr="edexpand" aria-label="' + (open ? "Fewer tools" : "More tools") + '">' + cic(open ? "collapse" : "expand") + "</button>";
    return h;
  }
  function renderEditor() {
    var el = $("#creator"), text = CR.media.kind === "text", reel = CR.mode === "reel", pr = S.profile || {};
    el.innerHTML = '<div class="cr-ed' + (CR.expanded ? " open" : "") + '" id="cr-ed"><div class="cr-card" id="cr-card" data-kind="' + CR.media.kind + '">' + edMediaHTML() +
      '<div class="cr-sw" id="cr-sw"></div><div class="cr-shade"></div>' +
      '<button class="cr-back" data-cr="edback" aria-label="Back">' + cic("arrowL") + "</button>" +
      '<div class="cr-rail" id="cr-rail">' + edRailHTML() + "</div>" +
      (text ? "" : '<input class="cr-cap" id="cr-cap" maxlength="200" placeholder="Add a caption..." aria-label="Add a caption" autocomplete="off">') +
      '<div class="cr-trash" id="cr-trash" hidden>' + ic(I.trash) + "</div></div>" +
      '<div class="cr-foot" id="cr-foot">' + (reel
        ? '<span class="grow"></span><button class="cr-nextbtn" data-cr="edreelnext">Next ' + cic("send") + "</button>"
        : '<button class="cr-fpill" data-cr="edshare" data-aud="all">' + avInner(pr.display_name, pr.avatar_url, 28) + '<span>Your story</span></button><button class="cr-fpill" data-cr="edshare" data-aud="close"><i class="cf">' + ic(I.star) + '</i><span>Close Friends</span></button><button class="cr-go" data-cr="edgo" aria-label="Share to">' + cic("send") + "</button>") + "</div></div>";
    var cap = $("#cr-cap"); if (cap) cap.value = CR.cap || "";
    renderStage(); edMediaPlay(); edAudio();
  }
  function renderStage() { var w = $("#cr-sw"); if (w) w.innerHTML = ovlStageHTML(CR.ov, true); }
  function edRefresh() {
    var m = $("#cr-m"), f = filterCss(CR.ov.filter); if (m && CR.media.kind !== "text") m.style.filter = f || "";
    var r = $("#cr-rail"); if (r) r.innerHTML = edRailHTML();
    var ed = $("#cr-ed"); if (ed) ed.classList.toggle("open", !!CR.expanded);
  }
  function edMediaPlay() {
    var v = $("#cr-m"); if (!v || v.tagName !== "VIDEO") return;
    v.muted = !!CR.ov.music; var p = v.play(); if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () {}); });
  }
  function edAudio() {
    if (CR.edAud) { try { CR.edAud.pause(); } catch (e) {} CR.edAud = null; }
    var mu = CR.ov.music; if (!mu || CR.screen !== "edit") return;
    try { var a = new Audio(mu.url); a.loop = true; a.currentTime = mu.start || 0; a.volume = mu.vol == null ? 0.8 : mu.vol; var p = a.play(); if (p && p.catch) p.catch(function () {}); CR.edAud = a; } catch (e) {}
  }
  function findItem(id) { var r = null; CR.ov.items.forEach(function (x) { if (x.id === id) r = x; }); return r; }
  function addItem(it) {
    it.id = oid(); CR.ov.items.push(it);
    if (it.t === "sticker" && it.k !== "draw") { it.x = it.x || 50; it.y = it.y || 42; }
    renderStage(); return it;
  }
  function removeItem(id) { CR.ov.items = CR.ov.items.filter(function (x) { return x.id !== id; }); renderStage(); }

  /* ----- dragging, pinching and tapping the things on the picture ----- */
  var DR = null, PT = {};
  document.addEventListener("pointerdown", function (e) {
    if (!CR || CR.screen !== "edit" || CR.ted || CR.drawing) return;
    var o = e.target.closest && e.target.closest("#cr-sw .oi"); if (!o) return;
    var it = findItem(o.dataset.id); if (!it) return;
    e.preventDefault();
    var card = $("#cr-card").getBoundingClientRect();
    PT[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (!DR || DR.el !== o) {
      DR = { el: o, it: it, card: card, x0: it.x, y0: it.y, sx: e.clientX, sy: e.clientY, moved: false, ids: [e.pointerId], s0: it.s || 1, r0: it.r || 0, t0: Date.now() };
      DR.long = setTimeout(function () { if (DR && !DR.moved && DR.it === it) { DR.handled = true; editItem(it); } }, 520);
    } else if (DR.ids.indexOf(e.pointerId) < 0) {
      DR.ids.push(e.pointerId);
      var a = PT[DR.ids[0]], b = PT[DR.ids[1]]; DR.d0 = Math.hypot(a.x - b.x, a.y - b.y); DR.a0 = Math.atan2(b.y - a.y, b.x - a.x); DR.s1 = it.s || 1; DR.r1 = it.r || 0; DR.pinch = true; DR.moved = true;
    }
  });
  document.addEventListener("pointermove", function (e) {
    if (!DR || !PT[e.pointerId]) return;
    PT[e.pointerId] = { x: e.clientX, y: e.clientY };
    var it = DR.it, el = DR.el;
    if (DR.pinch && DR.ids.length >= 2 && PT[DR.ids[0]] && PT[DR.ids[1]]) {
      var a = PT[DR.ids[0]], b = PT[DR.ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      it.s = Math.max(0.3, Math.min(4, DR.s1 * d / (DR.d0 || 1))); it.r = Math.round(DR.r1 + (ang - DR.a0) * 180 / Math.PI);
    } else if (e.pointerId === DR.ids[0]) {
      var dx = e.clientX - DR.sx, dy = e.clientY - DR.sy;
      if (!DR.moved && Math.hypot(dx, dy) < 7) return;
      DR.moved = true; clearTimeout(DR.long);
      it.x = Math.max(0, Math.min(100, DR.x0 + dx / DR.card.width * 100)); it.y = Math.max(0, Math.min(100, DR.y0 + dy / DR.card.height * 100));
      var tr = $("#cr-trash"); if (tr) { tr.hidden = false; var over = e.clientY > DR.card.bottom - 90 && Math.abs(e.clientX - (DR.card.left + DR.card.width / 2)) < 60; tr.classList.toggle("hot", over); DR.over = over; el.classList.toggle("dying", over); }
    }
    el.style.left = it.x + "%"; el.style.top = it.y + "%"; el.style.transform = "translate(-50%,-50%) rotate(" + (it.r || 0) + "deg) scale(" + (it.s || 1) + ")";
  });
  function drUp(e) {
    delete PT[e.pointerId];
    if (!DR) return;
    var i = DR.ids.indexOf(e.pointerId); if (i < 0) return;
    if (DR.ids.length > 1 && DR.pinch) { DR.ids.splice(i, 1); if (DR.ids.length === 1) { var p = PT[DR.ids[0]]; if (p) { DR.sx = p.x; DR.sy = p.y; DR.x0 = DR.it.x; DR.y0 = DR.it.y; } DR.pinch = false; } return; }
    var d = DR; DR = null; clearTimeout(d.long);
    var tr = $("#cr-trash"); if (tr) { tr.hidden = true; tr.classList.remove("hot"); }
    if (d.over) { removeItem(d.it.id); return; }
    if (e.type !== "pointercancel" && !d.moved && !d.handled) tapItem(d.it);
  }
  document.addEventListener("pointerup", drUp); document.addEventListener("pointercancel", drUp);
  document.addEventListener("wheel", function (e) {
    if (!CR || CR.screen !== "edit") return; var o = e.target.closest && e.target.closest("#cr-sw .oi"); if (!o) return;
    var it = findItem(o.dataset.id); if (!it) return; e.preventDefault();
    if (e.altKey) it.r = Math.round((it.r || 0) + (e.deltaY > 0 ? 5 : -5)); else it.s = Math.max(0.3, Math.min(4, (it.s || 1) * (e.deltaY > 0 ? 0.94 : 1.06)));
    o.style.transform = "translate(-50%,-50%) rotate(" + (it.r || 0) + "deg) scale(" + (it.s || 1) + ")";
  }, { passive: false });
  var STYLED = { location: 1, mention: 1, time: 1, music: 1, photo: 1, hashtag: 1, link: 1, countdown: 1, avatar: 0, deco: 0 };
  function tapItem(it) {
    if (it.t === "text") return openTextEditor(it);
    if (it.k === "photo" || it.k === "frame") return it.k === "frame" ? cycleFrame(it) : cycleStyle(it);
    if (STYLED[it.k]) return cycleStyle(it);
    editItem(it);
  }
  function cycleStyle(it) { it.st = ((it.st | 0) + 1) % 3; if (it.k === "photo") it.st = (it.st) % 4; reStage(); }
  function cycleFrame(it) { var i = 0; CFRAMES.forEach(function (f, k) { if (f[0] === (it.d.shape || "round")) i = k; }); it.d.shape = CFRAMES[(i + 1) % CFRAMES.length][0]; reStage(); }
  function reStage() { renderStage(); }
  function editItem(it) {
    if (it.t === "text") return openTextEditor(it);
    switch (it.k) {
      case "poll": return stkPollForm(it); case "question": return stkQuestionForm(it); case "slider": return stkSliderForm(it);
      case "addyours": return stkAddYoursForm(it); case "countdown": return stkCountdownForm(it); case "link": return stkLinkForm(it); case "hashtag": return stkHashtagForm(it);
      default: return confirmSheet("Remove this sticker?", "", "Remove", true).then(function (ok) { if (ok && CR) removeItem(it.id); });
    }
  }

  /* ----- restyle and effects ----- */
  function openRestylePanel(kind) {
    var foot = $("#cr-foot"); if (!foot) return;
    CR.panel = kind;
    var text = CR.media.kind === "text", list;
    if (kind === "fx") list = CFX.map(function (f) { return { id: f[0], name: f[1], on: (CR.ov.fx || "") === f[0], sw: '<i class="pv fxp fx-' + f[0] + '"></i>' }; });
    else if (text) list = STORY_BG.map(function (g, i) { return { id: String(i), name: "Colour " + (i + 1), on: (CR.tbg | 0) === i, sw: '<i class="pv" style="background:' + g + '"></i>' }; });
    else list = CFILTERS.map(function (f) { var m = CR.media; return { id: f.id, name: f.name, on: (CR.ov.filter || "") === f.id, sw: '<i class="pv" style="filter:' + (f.css || "none") + ";background:" + (m.kind === "image" ? "url(&quot;" + esc(m.url) + "&quot;) center/cover" : "linear-gradient(135deg,#ff9a3c,#8f3fd6)") + '"></i>' }; });
    foot.className = "cr-foot panel";
    foot.innerHTML = '<div class="cr-pstrip">' + list.map(function (x) { return '<button class="cr-pi' + (x.on ? " on" : "") + '" data-cr="edpick" data-k="' + kind + '" data-id="' + esc(x.id) + '">' + x.sw + "<small>" + esc(x.name) + "</small></button>"; }).join("") + '</div><button class="cr-pdone" data-cr="edpdone">Done</button>';
  }
  function pickPanel(kind, id) {
    if (kind === "fx") CR.ov.fx = id; else if (CR.media.kind === "text") { CR.tbg = +id; var m = $("#cr-m"); if (m) m.style.background = edBgCss(); } else CR.ov.filter = id;
    renderStage(); edRefresh(); openRestylePanel(kind);
  }
  function closePanel() { if (!CR) return; CR.panel = null; renderEditor(); }

  /* ----- sharing ----- */
  async function prepOverlays(src, setP) {
    var ov = JSON.parse(JSON.stringify(src, function (k, v) { return k === "blob" || k === "blobs" ? undefined : v; })), ups = [], i, orig = src.items;
    var done = 0, total = 0;
    orig.forEach(function (it) { if (it.d && it.d.blob) total++; if (it.d && it.d.blobs) total += it.d.blobs.length; });
    if (src.music && src.music.blob) total++;
    async function up(blob, ext, mime) { var r = await uploadFile(blob, ext, mime); ups.push(r.url); done++; setP("Uploading…", 0.05 + done / Math.max(1, total) * 0.2); return r.url; }
    try {
      for (i = 0; i < orig.length; i++) {
        var it = orig[i], out = ov.items[i];
        if (it.d && it.d.blob) out.d.url = await up(it.d.blob, "jpg", "image/jpeg");
        if (it.d && it.d.blobs) { out.d.urls = []; for (var j = 0; j < it.d.blobs.length; j++) out.d.urls.push(await up(it.d.blobs[j], "jpg", "image/jpeg")); }
      }
      var mu = src.music;
      if (mu && mu.blob) { ov.music.url = await up(mu.blob, mu.ext || "mp3", mu.mime || "audio/mpeg"); ov.music.track = null; }
      if (ov.music) { delete ov.music.blob; if (ov.music.track) delete ov.music.url; }
    } catch (e) { removeMedia(ups); throw e; }
    ov.items = ov.items.filter(function (x) { return !(x.t === "draw" && !(x.paths && x.paths.length)); });
    return { ov: ov, ups: ups };
  }
  async function shareStory(aud) {
    if (!CR || CR.busy) return;
    var m = CR.media, text = m.kind === "text";
    if (text && !CR.ov.items.some(function (x) { return x.t === "text" && x.text.trim(); })) return toast("Add some text first.");
    if (aud === "close") { var cf = await loadCloseFriends(); if (!cf.length) return openCloseFriends(true); }
    CR.busy = true; var prog = openProgress("Sharing…"), ups = [];
    function setP(l, f) { prog.set(l, f); }
    try {
      var po = await prepOverlays(CR.ov, setP); ups = po.ups;
      var row = { author_id: S.user.id, audience: aud === "close" ? "close" : "all", caption: "" };
      var capEl = $("#cr-cap"); if (capEl) CR.cap = capEl.value;
      if (text) {
        var first = CR.ov.items.filter(function (x) { return x.t === "text" && x.text.trim(); })[0];
        row.kind = "text"; row.bg = CR.tbg % STORY_BG.length; row.caption = first.text.slice(0, 200);
      } else {
        var up = await uploadFile(m.blob, m.ext, m.mime, function (f) { setP(f < 1 ? "Uploading…" : "Sharing…", 0.3 + f * 0.65); });
        ups.push(up.url); row.kind = m.kind; row.media_url = up.url; row.caption = (CR.cap || "").trim().slice(0, 200);
      }
      var hasOv = ovlHas(po.ov) || po.ov.noreply || po.ov.ai || (po.ov.mentions && po.ov.mentions.length);
      row.overlays = hasOv ? Object.assign(po.ov, { cover: 1, loop: m.loop ? 1 : 0 }) : (m.kind === "text" ? null : { v: 1, items: [], cover: 1, filter: "", fx: "", mentions: [], music: null, noreply: false, ai: false });
      var r = await sb.from("stories").insert(row);
      if (r.error) throw r.error;
    } catch (e) { removeMedia(ups); if (CR) CR.busy = false; prog.close(); return toast(niceErr(e)); }
    prog.close(); closeCreator(); toast(aud === "close" ? "Shared with Close Friends." : "Added to your story."); loadTray(); loadMe();
  }
  function openProgress(label) {
    var d = document.createElement("div"); d.className = "cr-prog"; d.innerHTML = '<div class="bar"><i></i></div><span>' + esc(label) + "</span>";
    $("#creator").appendChild(d);
    return { set: function (l, f) { $("span", d).textContent = l; $("i", d).style.width = Math.round(f * 100) + "%"; }, close: function () { d.remove(); } };
  }
  async function reelNext() {
    if (!CR || CR.busy) return;
    var m = CR.media; if (m.kind !== "video") return toast("Reels are made from videos.");
    var capEl = $("#cr-cap"); if (capEl) CR.cap = capEl.value;
    var mu = CR.ov.music, sound = null;
    if (mu) sound = { key: mu.track || mu.url, track: mu.track || null, url: mu.url || (mu.track ? songUrl(mu.track) : ""), title: mu.title, artist: mu.artist, start: mu.start || 0, vol: mu.vol == null ? 0.8 : mu.vol, vvol: mu.vvol == null ? 1 : mu.vvol, dur: 0, blob: mu.blob || null, mime: mu.mime, ext: mu.ext };
    var ov = CR.ov; ov.music = null;
    var ru = { file: m.blob, url: m.url, dur: m.dur || 0, w: m.w, h: m.h, ext: m.ext, mime: m.mime, ov2: ov, sound: sound, cap: CR.cap || "", keep: CR.blobUrls || [] };
    m.blobUrl = false; CR.blobUrls = [];
    crTeardown(); CR = null; var el = $("#creator"); el.hidden = true; el.innerHTML = ""; el.className = "creator";
    reelShareFromCreator(ru);
  }
  async function saveToDevice() {
    if (!CR) return;
    var card = $("#cr-card"), m = CR.media;
    try {
      if (!window.html2canvas) {
        await new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"; s.onload = res; s.onerror = function () { rej(new Error("x")); }; document.head.appendChild(s); });
      }
      var ed = $("#cr-ed"); ed.classList.add("saving");
      var cv = await window.html2canvas(card, { backgroundColor: null, scale: 2, useCORS: true, ignoreElements: function (e) { return e.classList && (e.classList.contains("cr-rail") || e.classList.contains("cr-back") || e.classList.contains("cr-cap")); } });
      ed.classList.remove("saving");
      var blob = await new Promise(function (r) { cv.toBlob(r, "image/png"); });
      downloadBlob(blob, "orbi-story.png"); toast("Saved to your device.");
    } catch (e) {
      var ed2 = $("#cr-ed"); if (ed2) ed2.classList.remove("saving");
      if (m.blob) { downloadBlob(m.blob, "orbi-story." + (m.ext || "jpg")); toast("Saved the original " + (m.kind === "video" ? "video" : "photo") + ". Stickers can't be saved offline."); }
      else toast("Could not save that.");
    }
  }
  function downloadBlob(blob, name) {
    var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 1500);
  }


  /* ---------- text editor, stickers, drawing, people and Close Friends ---------- */
  function vvSync() {
    var c = $("#creator"); if (!c || c.hidden) return;
    var vv = window.visualViewport;
    c.style.setProperty("--vvh", (vv ? vv.height : window.innerHeight) + "px"); c.style.setProperty("--vvt", (vv ? vv.offsetTop : 0) + "px");
    var t = $("#cr-ted"); if (t) tedFit();
  }
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", vvSync); window.visualViewport.addEventListener("scroll", vvSync); }
  window.addEventListener("resize", vvSync);

  /* ----- a thin vertical slider (text size, brush size) ----- */
  function bindVSlider(box, get, set) {
    var knob = $("b", box), active = false;
    function paint() { var t = get(); knob.style.top = (1 - t) * 100 + "%"; }
    function move(e) { var r = box.getBoundingClientRect(); var t = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)); set(t); paint(); }
    box.addEventListener("pointerdown", function (e) { active = true; try { box.setPointerCapture(e.pointerId); } catch (x) {} move(e); e.preventDefault(); });
    box.addEventListener("pointermove", function (e) { if (active) move(e); });
    box.addEventListener("pointerup", function () { active = false; }); box.addEventListener("pointercancel", function () { active = false; });
    paint();
  }

  /* ----- the text editor ----- */
  function openTextEditor(it) {
    if (!CR || CR.ted) return;
    var base = { t: "text", text: "", font: "classic", color: "#ffffff", anim: "", fx: "", align: "center", bgm: CR.media.kind === "text" ? 0 : 1, size: 8, x: 50, y: 42, r: 0, s: 1 };
    if (!it && CR.media.kind === "text") base.y = 38 + (CR.ov.items.length % 4) * 8;
    CR.ted = { orig: it || null, d: Object.assign({}, base, it ? JSON.parse(JSON.stringify(it)) : {}), panel: "font" };
    var el = document.createElement("div"); el.id = "cr-ted"; el.className = "cr-ted";
    var cw = ($("#cr-card") || $("#cr-cam") || document.body).getBoundingClientRect().width;
    el.style.setProperty("--cw", cw + "px");
    el.innerHTML = '<div class="ted-dim"></div><button class="ted-done" data-cr="tdone">Done</button><div class="ted-size" id="ted-size" aria-label="Text size"><i></i><b></b></div>' +
      '<div class="ted-stage"><div class="ted-surf" id="ted-surf"><div class="ted-mirror" id="ted-mirror"></div><textarea id="ted-in" class="ted-in" spellcheck="true" autocapitalize="sentences" aria-label="Your text" rows="1"></textarea></div></div>' +
      '<div class="ted-bar"><div class="ted-opts" id="ted-opts"></div><div class="ted-tools" id="ted-tools"></div><div class="ted-short"><button data-cr="tmention">' + cic("at") + "<span>Mention</span></button><button data-cr=\"tloc\">" + ic(I.mapPin) + "<span>Location</span></button></div></div>";
    $("#creator").appendChild(el);
    if (it) { var o = $('#cr-sw .oi[data-id="' + it.id + '"]'); if (o) o.style.visibility = "hidden"; }
    var ta = $("#ted-in"); ta.value = CR.ted.d.text;
    bindVSlider($("#ted-size"), function () { return (CR.ted.d.size - 3.5) / 12.5; }, function (t) { CR.ted.d.size = Math.round((3.5 + t * 12.5) * 10) / 10; tedPaint(); });
    ta.addEventListener("input", function () { CR.ted.d.text = ta.value; tedPaint(); });
    vvSync(); tedPaint(); tedOpts(); tedTools();
    setTimeout(function () { ta.focus(); }, 60);
  }
  function tedFit() {
    var m = $("#ted-mirror"), ta = $("#ted-in"); if (!m || !ta) return;
    ta.style.width = (m.offsetWidth + 6) + "px"; ta.style.height = m.offsetHeight + "px";
    ta.style.textAlign = CR.ted.d.align; ta.style.fontSize = getComputedStyle(m.firstElementChild || m).fontSize;
    var s = $("#ted-surf"); if (s) s.className = "ted-surf a-" + CR.ted.d.align;
  }
  function tedPaint() {
    var d = CR.ted.d, m = $("#ted-mirror"); if (!m) return;
    var draft = Object.assign({}, d, { anim: "", text: (d.text || "") + "​" });
    m.innerHTML = textHTML(draft);
    var tx = $(".tx", m); if (tx) { tx.classList.toggle("ed-an-" + (d.anim || "x"), !!d.anim); if (d.anim) tx.classList.add("ed-an-" + d.anim); }
    var ta = $("#ted-in"); if (ta) ta.style.caretColor = d.bgm === 2 ? contrastOf(d.color) : d.color;
    tedFit();
  }
  function tedOpts() {
    var box = $("#ted-opts"), t = CR.ted, d = t.d; if (!box) return;
    var p = t.panel, h = "";
    if (p === "font") h = CFONTS.map(function (f) { return '<button class="ted-chip f-' + f[0] + (d.font === f[0] ? " on" : "") + '" data-cr="tfont" data-v="' + f[0] + '">' + f[1] + "</button>"; }).join("");
    else if (p === "color") h = '<button class="ted-eye" data-cr="teye" aria-label="Pick a colour from anywhere">' + cic("eyedrop") + '</button><input type="color" id="ted-cin" class="sr" tabindex="-1" aria-hidden="true">' + CCOLS.map(function (c) { return '<button class="ted-col' + (d.color.toLowerCase() === c ? " on" : "") + '" data-cr="tcolor" data-v="' + c + '" style="--c:' + c + '" aria-label="Colour ' + c + '"></button>'; }).join("");
    else if (p === "anim") h = '<button class="ted-chip none' + (!d.anim ? " on" : "") + '" data-cr="tanim" data-v="" aria-label="No animation">' + ic(I.close) + "</button>" + CANIMS.map(function (f) { return '<button class="ted-chip' + (d.anim === f[0] ? " on" : "") + '" data-cr="tanim" data-v="' + f[0] + '">' + f[1] + "</button>"; }).join("");
    else if (p === "fx") h = '<button class="ted-chip none' + (!d.fx ? " on" : "") + '" data-cr="tfx" data-v="" aria-label="No effect">' + ic(I.close) + "</button>" + CTFX.map(function (f) { return '<button class="ted-chip' + (d.fx === f[0] ? " on" : "") + '" data-cr="tfx" data-v="' + f[0] + '">' + f[1] + "</button>"; }).join("");
    box.innerHTML = h;
    var on = $(".on", box); if (on && on.scrollIntoView) { try { on.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) {} }
  }
  function tedTools() {
    var box = $("#ted-tools"), t = CR.ted, d = t.d; if (!box) return;
    function b(a, icon, on, label) { return '<button class="ted-tb' + (on ? " on" : "") + '" data-cr="' + a + '" aria-label="' + label + '">' + icon + "</button>"; }
    box.innerHTML = b("tpanel", '<span class="aa">Aa</span>', t.panel === "font", "Font") + b("tpanel_color", '<i class="wheel"></i>', t.panel === "color", "Colour") + b("tpanel_anim", cic("anim"), t.panel === "anim", "Animation") + b("tpanel_fx", cic("fx"), t.panel === "fx", "Effects") +
      b("talign", cic(d.align === "left" ? "alignL" : d.align === "right" ? "alignR" : "alignC"), false, "Alignment") + '<button class="ted-tb abox' + (d.bgm ? " on" : "") + '" data-cr="tbox" aria-label="Text background">' + cic("abox") + "</button>" + b("tadd", '<span class="aa plus">A<sup>+</sup></span>', false, "Add more text");
  }
  function tedDone() {
    var t = CR.ted; if (!t) return;
    var d = t.d, txt = (d.text || "").replace(/\s+$/g, "");
    var el = $("#cr-ted"); if (el) el.remove(); CR.ted = null;
    if (t.orig) {
      if (!txt.trim()) CR.ov.items = CR.ov.items.filter(function (x) { return x.id !== t.orig.id; });
      else Object.assign(t.orig, d, { text: txt });
    } else if (txt.trim()) { d.text = txt; addItem(d); }
    renderStage();
    if (CR.media.kind === "text") edRefresh();
  }
  function tedAddAnother() {
    var t = CR.ted, d = t.d; if (!(d.text || "").trim()) return toast("Type something first.");
    var keep = { font: d.font, color: d.color, anim: d.anim, fx: d.fx, align: d.align, bgm: d.bgm, size: d.size };
    tedDone(); openTextEditor(null); Object.assign(CR.ted.d, keep, { y: Math.min(80, d.y + 14) }); $("#ted-in").value = ""; tedPaint(); tedOpts(); tedTools();
  }
  function tedInsert(str) {
    var ta = $("#ted-in"); if (!ta) return; var a = ta.selectionStart || ta.value.length, b = ta.selectionEnd || a;
    ta.value = ta.value.slice(0, a) + str + ta.value.slice(b); ta.setSelectionRange(a + str.length, a + str.length); CR.ted.d.text = ta.value; tedPaint(); ta.focus();
  }

  /* ----- the stickers sheet ----- */
  var PILLS = [
    ["location", "LOCATION", "mapPin", "#e5383b"], ["mention", "MENTION", "at", "#f77f00"], ["music", "MUSIC", "music", "#e83e8c"],
    ["gif", "GIF", "gif", "#2fb344"], ["addyours", "ADD YOURS", "addyours", "#c2339f"], ["frames", "FRAMES", "frames", "#f08c00"],
    ["strip", "PHOTOSTRIP", "strip", "#4263eb"], ["photo", "PHOTO", "photo", "#2fb344"],
    ["question", "QUESTIONS", "question", "#7048e8"], ["avatar", "AVATAR", "avatar", "#f08c00"], ["emoji", "", "", ""], ["poll", "POLL", "poll", "#7048e8"],
    ["slider", "", "", ""], ["link", "LINK", "link", "#1c7ed6"], ["hashtag", "HASHTAG", "hash", "#e03131"], ["countdown", "COUNTDOWN", "count", "#7048e8"]
  ];
  var DBSTK = { poll: 1, slider: 1, question: 1, addyours: 1 };
  function stkPillHTML(p) {
    var rot = ((p[0].length * 7) % 5 - 2) * 0.8;
    if (p[0] === "emoji") return '<button class="stkp round" data-cr="stk" data-k="emoji" aria-label="Emoji stickers" style="transform:rotate(' + rot + 'deg)">😍</button>';
    if (p[0] === "slider") return '<button class="stkp slid" data-cr="stk" data-k="slider" aria-label="Emoji slider" style="transform:rotate(' + rot + 'deg)"><span class="mini"><i></i><b>😍</b></span></button>';
    return '<button class="stkp" data-cr="stk" data-k="' + p[0] + '" style="transform:rotate(' + rot + "deg);--ic:" + p[3] + '">' + cic(p[2]) + "<span>" + p[1] + "</span></button>";
  }
  function decoTileHTML(r) {
    var c = clockParts();
    return '<button class="stkd" data-cr="stk" data-k="deco" data-id="' + r[0] + '" aria-label="' + esc(r[1] || "Day") + '"><span class="stk deco ' + r[2] + '"><span>' + esc(r[0] === "day" ? new Date().toLocaleDateString([], { weekday: "long" }).toUpperCase() : r[1]) + "</span></span></button>";
  }
  function openStickers() {
    if (!CR) return;
    var reel = CR.mode === "reel";
    var pills = PILLS.filter(function (p) { return !(reel && (DBSTK[p[0]] || p[0] === "music")); });
    var c = clockParts();
    var sh = openSheet('<div class="stk-in"><label class="stk-search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M21 21l-5.2-5.2"/></svg><input id="stk-q" placeholder="Search" autocomplete="off" aria-label="Search stickers"></label>' +
      '<div class="stk-pills" id="stk-pills">' + pills.map(stkPillHTML).join("") + '</div><div class="stk-time"><button class="stkd" data-cr="stk" data-k="time" aria-label="Time sticker"><span class="stk k-time s0">' + flipHTML(c) + "</span></button></div>" +
      '<div class="stk-deco" id="stk-deco">' + CDECO.map(decoTileHTML).join("") + '</div><div id="stk-gifs"></div></div>', { tall: true, label: "Stickers" });
    $("#sheet").classList.add("stksheet");
  }
  document.addEventListener("input", function (e) {
    if (e.target.id !== "stk-q") return;
    var q = e.target.value.trim().toLowerCase();
    $$("#stk-pills .stkp").forEach(function (b) { var t = (b.textContent + " " + (b.dataset.k || "")).toLowerCase(); b.hidden = !!q && t.indexOf(q) < 0; });
    $$("#stk-deco .stkd").forEach(function (b) { b.hidden = !!q && b.textContent.toLowerCase().indexOf(q) < 0; });
    clearTimeout(e.target._t); e.target._t = setTimeout(function () { gifSearch(q); }, 350);
  });
  async function gifSearch(q) {
    var box = $("#stk-gifs"); if (!box) return;
    var key = cfg.giphyKey;
    if (!q || q.length < 2) { box.innerHTML = ""; return; }
    if (!key) { box.innerHTML = '<p class="stk-note">GIF search is not set up yet.</p>'; return; }
    box.innerHTML = '<p class="stk-note">Searching…</p>';
    try {
      var r = await fetch("https://api.giphy.com/v1/stickers/search?api_key=" + encodeURIComponent(key) + "&q=" + encodeURIComponent(q) + "&limit=24&rating=pg-13"), j = await r.json();
      if (!$("#stk-gifs")) return;
      var rows = (j.data || []).filter(function (g) { return g.images && g.images.fixed_width; });
      box.innerHTML = rows.length ? '<div class="stk-gifg">' + rows.map(function (g) { var im = g.images.fixed_width; return '<button data-cr="gifpick" data-url="' + esc(im.url) + '" data-w="' + im.width + '" data-h="' + im.height + '"><img alt="' + esc(g.title || "GIF") + '" src="' + esc(g.images.fixed_width_small ? g.images.fixed_width_small.url : im.url) + '" loading="lazy"></button>'; }).join("") + '</div><p class="stk-note">Powered by GIPHY</p>' : '<p class="stk-note">No GIFs found.</p>';
    } catch (e) { if ($("#stk-gifs")) $("#stk-gifs").innerHTML = '<p class="stk-note">Could not load GIFs.</p>'; }
  }
  function addSticker(k, d, extra) {
    if (!CR) return;
    closeSheet();
    var jitter = (CR.ov.items.length % 5) * 4;
    var it = addItem(Object.assign({ t: "sticker", k: k, d: d || {}, st: 0, x: 50, y: 36 + jitter, r: 0, s: 1 }, extra || {}));
    return it;
  }
  async function pickStickerPhotos(multi, max) {
    var fs = await pickFiles("image/*", !!multi); if (!fs.length || !CR) return [];
    var out = [];
    for (var i = 0; i < Math.min(fs.length, max || 1); i++) {
      try { var p = await prepImage(fs[i], { max: 900 }); var u = URL.createObjectURL(p.blob); (CR.blobUrls = CR.blobUrls || []).push(u); out.push({ blob: p.blob, url: u }); } catch (e) { toast(e.message || "Could not read that photo."); }
    }
    return out;
  }
  function stkAct(k, el) {
    switch (k) {
      case "location": return stkLocation();
      case "mention": return peopleSheet({ title: "Mention", desc: "", onPick: function (p) { addSticker("mention", { handle: p.handle, id: p.id }); } });
      case "music": return pickMusic(true);
      case "gif": { var q = $("#stk-q"); if (q) { q.focus(); } if (!cfg.giphyKey) toast("GIF search is not set up yet."); return; }
      case "addyours": return stkAddYoursForm();
      case "frames": return stkFrames();
      case "strip": return pickStickerPhotos(true, 4).then(function (ps) { if (ps.length) addSticker("strip", { urls: ps.map(function (p) { return p.url; }), blobs: ps.map(function (p) { return p.blob; }) }); });
      case "photo": return pickStickerPhotos(false, 1).then(function (ps) { if (ps.length) addSticker("photo", { url: ps[0].url, blob: ps[0].blob }, { st: 0 }); });
      case "question": return stkQuestionForm();
      case "avatar": return addSticker("avatar", { url: S.profile.avatar_url || "", name: S.profile.display_name });
      case "emoji": return stkEmoji();
      case "poll": return stkPollForm();
      case "slider": return stkSliderForm();
      case "link": return stkLinkForm();
      case "hashtag": return stkHashtagForm();
      case "countdown": return stkCountdownForm();
      case "time": return addSticker("time", { ts: new Date().toISOString() });
      case "deco": return addSticker("deco", { id: el.dataset.id }, { s: 1.1 });
    }
  }
  function stkEmoji() {
    openSheet('<p class="sh-title">Emoji</p><div class="stk-emo">' + CEMOJI.map(function (e) { return '<button data-cr="emopick" data-e="' + esc(e) + '">' + esc(e) + "</button>"; }).join("") + "</div>", { tall: true, label: "Emoji" });
    $("#sheet").classList.add("stksheet");
  }
  function stkFrames() {
    openSheet('<p class="sh-title">Frames</p><div class="stk-frames">' + CFRAMES.map(function (f) { return '<button data-cr="framepick" data-s="' + f[0] + '"><span class="frm fr-' + f[0] + '"><span class="fri"></span></span><small>' + f[1] + "</small></button>"; }).join("") + "</div>", { label: "Frames" });
    $("#sheet").classList.add("stksheet");
  }

  /* ----- little forms for the stickers that need words ----- */
  function stkForm(o) {
    var h = '<p class="sh-title">' + esc(o.title) + '</p><form class="stk-form" id="stk-form" autocomplete="off" novalidate>' + o.fields.map(function (f) {
      if (f.chips) return '<div class="stk-chips">' + f.chips.map(function (c) { return '<button type="button" data-cr="formchip" data-f="' + f.id + '" data-v="' + esc(c) + '">' + esc(c) + "</button>"; }).join("") + "</div>";
      return '<label><span>' + esc(f.label) + '</span><input class="in" id="sf-' + f.id + '" type="' + (f.type || "text") + '" maxlength="' + (f.max || 80) + '" placeholder="' + esc(f.ph || "") + '" value="' + esc(f.value || "") + '"' + (f.type === "url" ? ' inputmode="url" autocapitalize="off"' : "") + "></label>";
    }).join("") + '<button class="btn fill wide" type="submit">' + esc(o.cta || "Add") + "</button>" + (o.del ? '<button class="btn wide" type="button" data-cr="formdel">Remove sticker</button>' : "") + "</form>";
    openSheet(h, { label: o.title }); $("#sheet").classList.add("stksheet");
    var form = $("#stk-form"); S.stkForm = o;
    form.addEventListener("submit", function (e) {
      e.preventDefault(); var v = {}; o.fields.forEach(function (f) { if (f.id) { var i = $("#sf-" + f.id); v[f.id] = i ? i.value.trim() : ""; } });
      var err = o.onSubmit(v); if (err) toast(err);
    });
    var first = $(".in", form); if (first) setTimeout(function () { first.focus(); }, 80);
  }
  function putSticker(existing, k, d, extra) {
    if (existing) { existing.d = Object.assign(existing.d || {}, d); closeSheet(); renderStage(); return; }
    addSticker(k, d, extra);
  }
  function stkPollForm(it) { var d = it ? it.d : {}; stkForm({ title: "Poll", fields: [{ id: "q", label: "Question", ph: "Ask a question", value: d.q, max: 80 }, { id: "a", label: "Option 1", value: d.a || "Yes", max: 20 }, { id: "b", label: "Option 2", value: d.b || "No", max: 20 }], del: !!it, delItem: it, onSubmit: function (v) { if (!v.q) return "Write your question."; putSticker(it, "poll", { q: v.q, a: v.a || "Yes", b: v.b || "No" }); } }); }
  function stkQuestionForm(it) { var d = it ? it.d : {}; stkForm({ title: "Questions", fields: [{ id: "q", label: "Your prompt", ph: "Ask me a question", value: d.q || "Ask me a question", max: 80 }], del: !!it, delItem: it, onSubmit: function (v) { putSticker(it, "question", { q: v.q || "Ask me a question" }); } }); }
  function stkAddYoursForm(it) { var d = it ? it.d : {}; stkForm({ title: "Add Yours", fields: [{ id: "q", label: "Prompt", ph: "Show your best…", value: d.q, max: 60 }], del: !!it, delItem: it, onSubmit: function (v) { if (!v.q) return "Write a prompt."; putSticker(it, "addyours", { q: v.q }); } }); }
  function stkSliderForm(it) { var d = it ? it.d : {}; stkForm({ title: "Emoji slider", fields: [{ id: "q", label: "Question", ph: "How much do you like it?", value: d.q, max: 60 }, { id: "e", label: "Emoji", value: d.e || "😍", max: 4 }, { chips: ["😍", "🔥", "😂", "😮", "🥹", "😎", "❤️", "🤩"], id: "e" }], del: !!it, delItem: it, onSubmit: function (v) { putSticker(it, "slider", { q: v.q, e: v.e || "😍" }); } }); }
  function stkLinkForm(it) { var d = it ? it.d : {}; stkForm({ title: "Link", fields: [{ id: "u", label: "Web address", ph: "https://", value: d.url, type: "url", max: 300 }, { id: "l", label: "Link text (optional)", ph: "Shown on the sticker", value: d.label, max: 30 }], del: !!it, delItem: it, onSubmit: function (v) { var u = safeUrl(v.u); if (!u) return "Enter a valid web address."; putSticker(it, "link", { url: u, label: v.l }); } }); }
  function stkHashtagForm(it) {
    var d = it ? it.d : {}, tr = (S.trending || []).slice(0, 6).map(function (t) { return String(t.disp || t.tag || "").replace(/^#/, ""); }).filter(Boolean);
    var fields = [{ id: "t", label: "Hashtag", ph: "Type a hashtag", value: d.tag, max: 40 }];
    if (tr.length) fields.push({ id: "t", chips: tr.map(function (x) { return "#" + x; }) });
    stkForm({ title: "Hashtag", fields: fields, del: !!it, delItem: it, onSubmit: function (v) { var t = (v.t || "").replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, ""); if (!t) return "Type a hashtag."; putSticker(it, "hashtag", { tag: t }); } });
  }
  function stkCountdownForm(it) {
    var d = it ? it.d : {}, def = new Date(Date.now() + 86400000); def.setMinutes(0, 0, 0);
    function loc(dt) { function p(n) { return (n < 10 ? "0" : "") + n; } return dt.getFullYear() + "-" + p(dt.getMonth() + 1) + "-" + p(dt.getDate()) + "T" + p(dt.getHours()) + ":" + p(dt.getMinutes()); }
    stkForm({ title: "Countdown", fields: [{ id: "t", label: "Name", ph: "My birthday", value: d.title, max: 30 }, { id: "d", label: "Ends", type: "datetime-local", value: loc(d.end ? new Date(d.end) : def), max: 30 }], del: !!it, delItem: it, onSubmit: function (v) {
      var end = new Date(v.d); if (isNaN(end)) return "Pick when it ends."; if (end.getTime() <= Date.now()) return "Pick a time in the future.";
      putSticker(it, "countdown", { title: v.t || "Countdown", end: end.toISOString() });
    } });
  }

  /* ----- location ----- */
  async function placeName(lat, lon) {
    try {
      var r = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&lat=" + lat + "&lon=" + lon, { headers: { "Accept-Language": navigator.language || "en" } }), j = await r.json(), a = j.address || {};
      var parts = [a.suburb || a.neighbourhood || a.quarter || a.city_district, a.city || a.town || a.village || a.county || a.state].filter(Boolean);
      parts = parts.filter(function (x, i) { return parts.indexOf(x) === i; });
      return parts.slice(0, 2).join(", ") || (j.display_name || "").split(",").slice(0, 2).join(",").trim();
    } catch (e) { return ""; }
  }
  function stkLocation() {
    openSheet('<p class="sh-title">Location</p><div class="sh-pad"><input class="in" id="loc-q" placeholder="Search for a place" autocomplete="off" aria-label="Search for a place"></div><button class="srow up" data-cr="locnow"><span class="splay">' + ic(I.mapPin) + '</span><div class="sinfo"><b>Use my current location</b><small id="loc-sub">Orbi will ask to use your location</small></div></button><div id="loc-list" class="sp-list"></div>', { tall: true, label: "Location" });
    $("#sheet").classList.add("stksheet");
  }
  function locNow() {
    var sub = $("#loc-sub");
    if (!navigator.geolocation) return toast("This device can't share its location.");
    if (sub) sub.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(async function (pos) {
      if (!CR) return;
      var lat = Math.round(pos.coords.latitude * 1e4) / 1e4, lon = Math.round(pos.coords.longitude * 1e4) / 1e4, nm = await placeName(lat, lon);
      if (!CR) return;
      addSticker("location", { name: nm || "Current location", lat: lat, lon: lon });
    }, function (err) {
      if (sub) sub.textContent = "Location is off. Turn it on for Orbi in your browser settings, or search for a place above.";
      toast(err && err.code === 1 ? "Turn on location access to share where you are." : "Could not find your location.");
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }
  document.addEventListener("input", function (e) {
    if (e.target.id !== "loc-q") return;
    var q = e.target.value.trim(); clearTimeout(e.target._t);
    e.target._t = setTimeout(async function () {
      var box = $("#loc-list"); if (!box) return; if (q.length < 2) { box.innerHTML = ""; return; }
      box.innerHTML = '<p class="muted sh-desc">Searching…</p>';
      try {
        var r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q=" + encodeURIComponent(q), { headers: { "Accept-Language": navigator.language || "en" } }), j = await r.json();
        if (!$("#loc-list")) return;
        box.innerHTML = j.length ? j.map(function (p) {
          var nm = String(p.display_name || "").split(",").slice(0, 2).join(",").trim();
          return '<button class="srow" data-cr="locpick" data-n="' + esc(nm) + '" data-lat="' + p.lat + '" data-lon="' + p.lon + '"><span class="splay">' + ic(I.mapPin) + '</span><div class="sinfo"><b>' + esc(nm) + "</b><small>" + esc(String(p.display_name || "").split(",").slice(2, 4).join(",").trim()) + "</small></div></button>";
        }).join("") : '<p class="muted sh-desc">No places found.</p>';
      } catch (er) { if ($("#loc-list")) $("#loc-list").innerHTML = '<p class="muted sh-desc">Could not search right now.</p>'; }
    }, 400);
  });

  /* ----- music ----- */
  function pickMusic(asSticker) {
    SOUND_HOOK = function (snd) {
      if (!CR) return;
      CR.ov.music = { track: snd.track || null, url: snd.url, title: snd.title, artist: snd.artist || "", start: snd.start || 0, vol: snd.vol == null ? 0.8 : snd.vol, blob: snd.blob || null, mime: snd.mime, ext: snd.ext, vvol: snd.vvol == null ? 1 : snd.vvol };
      CR.sound = snd;
      if (CR.screen === "edit") {
        CR.ov.items = CR.ov.items.filter(function (x) { return !(x.t === "sticker" && x.k === "music"); });
        if (CR.mode !== "reel") addItem({ t: "sticker", k: "music", d: { title: snd.title, artist: snd.artist || "" }, st: 0, x: 50, y: 70, r: 0, s: 1 });
        else renderStage();
        edRefresh(); edAudio(); edMediaPlay();
      } else { camTop(); camTools(); }
    };
    closeSheet(); openSoundPicker();
  }

  /* ----- people (mentions and Close Friends) ----- */
  var PS = null;
  async function peopleSheet(o) {
    PS = { o: o, q: "", rows: [], picked: Object.assign({}, o.picked || {}), tok: 0 };
    openSheet('<p class="sh-title">' + esc(o.title) + '</p><div class="sh-pad"><input class="in" id="ps-q" placeholder="Search" autocomplete="off" aria-label="Search people"></div>' + (o.desc ? '<p class="sh-desc">' + esc(o.desc) + "</p>" : "") + '<div class="ps-list" id="ps-list">' + skel(1) + "</div>" + (o.multi && o.cta ? '<div class="sh-pad"><button class="btn fill wide" data-cr="psdone">' + esc(o.cta) + "</button></div>" : ""), { tall: true, label: o.title, onClose: function () { PS = null; } });
    $("#sheet").classList.add("stksheet");
    psLoad("");
  }
  async function psLoad(q) {
    if (!PS) return; var tok = ++PS.tok, rows = [];
    try {
      if (!q) {
        var ids = Object.keys(S.following || {}).slice(0, 60);
        var extra = Object.keys(PS.picked).filter(function (id) { return ids.indexOf(id) < 0; });
        ids = ids.concat(extra);
        if (ids.length) { var pr = await sb.from("profile_cards").select("id,handle,display_name,avatar_url").in("id", ids); rows = pr.data || []; }
      } else {
        var like = "%" + q.replace(/^@/, "").replace(/[^\p{L}\p{N} _.-]/gu, "").replace(/%/g, "") + "%";
        var r = await sb.from("profile_cards").select("id,handle,display_name,avatar_url").neq("id", S.user.id).or("handle.ilike." + like + ",display_name.ilike." + like).limit(20); rows = r.data || [];
      }
    } catch (e) {}
    if (!PS || tok !== PS.tok) return; PS.rows = rows; psPaint(q);
  }
  function psPaint(q) {
    var box = $("#ps-list"); if (!box || !PS) return;
    box.innerHTML = PS.rows.length ? PS.rows.map(function (p) {
      var on = !!PS.picked[p.id];
      return '<button class="trow ps" data-cr="pspick" data-id="' + p.id + '">' + avInner(p.display_name, p.avatar_url, 44) + '<div class="pi"><b>' + esc(p.display_name) + '</b><span class="tprev">@' + esc(p.handle) + "</span></div>" + (PS.o.multi ? '<span class="psbox' + (on ? " on" : "") + '">' + (on ? ic(I.check) : "") + "</span>" : "") + "</button>";
    }).join("") : '<p class="muted sh-desc">' + (q ? "No one matches." : "Orbit someone or search to find people.") + "</p>";
  }
  document.addEventListener("input", function (e) { if (e.target.id === "ps-q" && PS) { var v = e.target.value.trim(); clearTimeout(PS.t); PS.t = setTimeout(function () { PS.q = v; psLoad(v); }, 250); } });
  async function psPick(id) {
    if (!PS) return; var row = null; PS.rows.forEach(function (p) { if (p.id === id) row = p; }); if (!row) return;
    var o = PS.o;
    if (!o.multi) { var f = o.onPick; closeSheet(); return f(row); }
    var on = !PS.picked[id];
    if (o.instant) { var ok = await o.instant(row, on); if (!ok) return; }
    if (on) PS.picked[id] = row.handle; else delete PS.picked[id];
    psPaint(PS.q);
  }
  function psDone() { if (!PS) return; var o = PS.o, picked = PS.picked, rows = PS.rows; closeSheet(); if (o.onDone) o.onDone(picked); }

  /* ----- Close Friends ----- */
  async function loadCloseFriends() {
    var r = await sb.from("close_friends").select("friend_id").limit(500);
    S.cf = (r.data || []).map(function (x) { return x.friend_id; }); return S.cf;
  }
  async function openCloseFriends(thenShare) {
    var cur = await loadCloseFriends(), picked = {}; cur.forEach(function (id) { picked[id] = "x"; });
    peopleSheet({
      title: "Close Friends", desc: "Only the people you pick here can see stories you share with Close Friends. They are not told when you add or remove them.", multi: true, picked: picked, cta: thenShare ? "Done" : "Done",
      instant: async function (p, on) {
        var r = on ? await sb.from("close_friends").insert({ friend_id: p.id }) : await sb.from("close_friends").delete().eq("friend_id", p.id);
        if (r.error) { toast(niceErr(r.error)); return false; } return true;
      },
      onDone: function (pk) { S.cf = Object.keys(pk); if (thenShare && S.cf.length && CR) shareStory("close"); else if (thenShare) toast("Pick at least one friend to share with."); }
    });
  }

  /* ----- drawing ----- */
  var DCOLS = ["#ffffff", "#000000", "#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#00c7be", "#0a84ff", "#bf5af2", "#ff2d92"];
  function startDraw() {
    if (!CR || CR.drawing) return;
    CR.drawing = { color: "#ffffff", brush: "pen", size: 0.35, item: null, live: null };
    var card = $("#cr-card"), d = document.createElement("div"); d.className = "cr-draw"; d.id = "cr-draw";
    d.innerHTML = '<div class="dr-top"><button class="dr-b" data-cr="drundo" aria-label="Undo">' + cic("undo") + '</button><button class="ted-done" data-cr="drdone">Done</button></div><div class="ted-size dr-size" id="dr-size" aria-label="Brush size"><i></i><b></b></div><svg class="dr-live" id="dr-live" viewBox="0 0 100 177.78" preserveAspectRatio="none"></svg><div class="dr-surf" id="dr-surf"></div>';
    card.appendChild(d);
    var foot = $("#cr-foot"); foot.className = "cr-foot panel"; CR.drawing.prevFoot = foot.innerHTML;
    foot.innerHTML = '<div class="dr-tools"><div class="dr-brushes">' + [["pen", "Pen"], ["marker", "Marker"], ["neon", "Neon"], ["eraser", "Eraser"]].map(function (b) { return '<button data-cr="drbrush" data-b="' + b[0] + '" class="' + (b[0] === "pen" ? "on" : "") + '">' + b[1] + "</button>"; }).join("") + '</div><div class="dr-cols">' + DCOLS.map(function (c) { return '<button data-cr="drcol" data-c="' + c + '" class="' + (c === "#ffffff" ? "on" : "") + '" style="--c:' + c + '" aria-label="Colour ' + c + '"></button>'; }).join("") + "</div></div>";
    bindVSlider($("#dr-size"), function () { return (CR.drawing.size - 0.15) / 1.6; }, function (t) { CR.drawing.size = Math.round((0.15 + t * 1.6) * 100) / 100; });
    var surf = $("#dr-surf"), cur = null;
    function pt(e) { var r = surf.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1000) / 10, Math.round((e.clientY - r.top) / r.height * 17778) / 100]; }
    function ensureItem() { var it = CR.ov.items.filter(function (x) { return x.t === "draw"; })[0]; if (!it) { it = { t: "draw", id: oid(), paths: [] }; CR.ov.items.unshift(it); } return it; }
    function eraseAt(p) {
      var it = ensureItem(), n = it.paths.length;
      it.paths = it.paths.filter(function (s) { return !s.p.some(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]) < 3.5; }); });
      if (it.paths.length !== n) renderStage();
    }
    surf.addEventListener("pointerdown", function (e) {
      if (!CR || !CR.drawing) return; try { surf.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault();
      var dr = CR.drawing, p = pt(e);
      if (dr.brush === "eraser") { cur = { erase: true }; eraseAt(p); return; }
      var w = dr.size * (dr.brush === "marker" ? 3 : 1);
      cur = { c: dr.color, w: w, b: dr.brush, p: [p] };
      var live = $("#dr-live"); live.innerHTML = '<path class="dp b-' + dr.brush + '" id="dr-path" d="M' + p[0] + " " + p[1] + ' l0.01 0" stroke="' + (dr.brush === "neon" ? "#fff" : dr.color) + '" stroke-width="' + w + '" fill="none" stroke-linecap="round" stroke-linejoin="round"' + (dr.brush === "neon" ? ' style="filter:drop-shadow(0 0 1.2px ' + dr.color + ") drop-shadow(0 0 2.6px " + dr.color + ')"' : "") + "/>";
    });
    surf.addEventListener("pointermove", function (e) {
      if (!cur) return; var p = pt(e);
      if (cur.erase) return eraseAt(p);
      var last = cur.p[cur.p.length - 1]; if (Math.hypot(last[0] - p[0], last[1] - p[1]) < 0.35) return;
      cur.p.push(p); var el = $("#dr-path"); if (el) el.setAttribute("d", el.getAttribute("d").replace(/ l0\.01 0$/, "") + " L" + p[0] + " " + p[1]);
    });
    function end() {
      if (!cur) return; var c = cur; cur = null;
      if (!c.erase && c.p.length) { ensureItem().paths.push({ c: c.c, w: c.w, b: c.b, p: c.p }); renderStage(); }
      var live = $("#dr-live"); if (live) live.innerHTML = "";
    }
    surf.addEventListener("pointerup", end); surf.addEventListener("pointercancel", end);
    var r = $("#cr-rail"); if (r) r.hidden = true; var cap = $("#cr-cap"); if (cap) cap.hidden = true; var bk = $(".cr-back"); if (bk) bk.hidden = true;
  }
  function drawUndo() { var it = CR.ov.items.filter(function (x) { return x.t === "draw"; })[0]; if (it && it.paths.length) { it.paths.pop(); renderStage(); } }
  function endDraw() {
    var d = $("#cr-draw"); if (d) d.remove(); CR.drawing = null;
    var foot = $("#cr-foot"); if (foot) { CR.panel = null; }
    renderEditor();
  }

  /* ----- rail extras ----- */
  function openMore() {
    function row(id, label, sub, on) { return '<button class="sh-item" data-cr="moretoggle" data-id="' + id + '"><span><b>' + label + "</b><small>" + sub + '</small></span><i class="switch" role="switch" aria-checked="' + on + '"></i></button>'; }
    openSheet('<p class="sh-title">More</p>' + row("noreply", "Turn off commenting", "People can't reply to this story.", !!CR.ov.noreply) + row("ai", "Label as AI-generated", "Adds an AI info label to your story.", !!CR.ov.ai), { label: "More" });
    $("#sheet").classList.add("ig");
  }
  function openEffectsSheet() {
    var h = '<p class="sh-title">Effects</p><div class="cr-fxgrid">' + CFILTERS.map(function (f) { return '<button data-cr="crfilter" data-f="' + f.id + '" data-close="1" class="' + (CR.filter === f.id ? "on" : "") + '"><i style="filter:' + (f.css || "none") + '"></i><small>' + f.name + "</small></button>"; }).join("") + "</div>";
    openSheet(h, { label: "Effects" }); $("#sheet").classList.add("stksheet");
  }
  function openCamGear() {
    actionSheet([{ id: "grid", label: "Grid lines", sub: CR.grid ? "On" : "Off" }, { id: "mirror", label: "Mirror front camera", sub: CR.mirror ? "On" : "Off" }], "Camera settings", "", { ig: true }).then(function (r) {
      if (!CR || !r) return; if (r === "grid") CR.grid = !CR.grid; if (r === "mirror") CR.mirror = !CR.mirror; camApplyLook(); camTools();
    });
  }
  function openShareTo() {
    var pr = S.profile || {};
    openSheet('<p class="sh-title">Share to</p><button class="sh-item" data-cr="edshare" data-aud="all">' + avInner(pr.display_name, pr.avatar_url, 32) + "<span><b>Your story</b><small>Everyone who can see your profile</small></span></button>" +
      '<button class="sh-item" data-cr="edshare" data-aud="close"><i class="cf big">' + ic(I.star) + "</i><span><b>Close Friends</b><small>Only the people on your list</small></span></button>" +
      '<button class="sh-item" data-cr="edcf">' + cic("at") + "<span><b>Edit Close Friends</b></span></button>", { label: "Share to" });
    $("#sheet").classList.add("ig");
  }

  /* ----- every tap inside the creator ----- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-cr]"); if (!b || !S.user) return;
    var a = b.dataset.cr, v = b.dataset.v;
    if (a.indexOf("tpanel") === 0) { if (CR && CR.ted) { CR.ted.panel = a === "tpanel" ? "font" : a.slice(7); tedOpts(); tedTools(); var ta0 = $("#ted-in"); if (ta0) ta0.focus(); } return; }
    switch (a) {
      /* camera */
      case "close": return exitCreator();
      case "flash": CR.flash = !CR.flash; camTop(); return;
      case "timer": CR.timer = CR.timer === 0 ? 3 : CR.timer === 3 ? 10 : 0; camTop(); return;
      case "gear": return openCamGear();
      case "mode": return setMode(b.dataset.m);
      case "flip": CR.facing = CR.facing === "user" ? "environment" : "user"; return startCam();
      case "gallery": return crGallery();
      case "retry": return startCam();
      case "audio": return pickMusic(false);
      case "effects": return openEffectsSheet();
      case "touch": CR.filter = CR.filter === "soft" ? "" : "soft"; camApplyLook(); camTools(); camStrip(); return;
      case "length": CR.length = CR.length === 15 ? 30 : CR.length === 30 ? 60 : CR.length === 60 ? 90 : 15; camTools(); return;
      case "grid": CR.grid = !CR.grid; camApplyLook(); camTools(); return;
      case "mirror": CR.mirror = !CR.mirror; camApplyLook(); camTools(); return;
      case "expand": CR.expanded = !CR.expanded; CR.toolsOpen = CR.expanded || CR.toolsOpen; camTools(); return;
      case "create": return openTextCreate();
      case "boom": CR.boom = !CR.boom; toast(CR.boom ? "Boomerang: tap the shutter to make one." : "Boomerang off."); camTools(); return;
      case "filter": CR.filter = b.dataset.f || ""; if (b.dataset.close) closeSheet(); camApplyLook(); camStrip(); camTools(); return;
      case "tpl": return crTemplate(b.dataset.id);
      case "grad": return crGrad();
      case "finish": return finishRec();
      case "discard": return discardRec();
      /* editor */
      case "edback": return exitCreator();
      case "edtext": return openTextEditor(null);
      case "edstk": return openStickers();
      case "edmusic": return pickMusic(false);
      case "edrestyle": return openRestylePanel("filter");
      case "edfx": return openRestylePanel("fx");
      case "edexpand": CR.expanded = !CR.expanded; return edRefresh();
      case "edmention": return peopleSheet({ title: "Mention", desc: "People added here will be mentioned in your story but their username won't be visible.", multi: true, picked: CR.ov.mentions.reduce(function (m, x) { m[x.id] = x.handle; return m; }, {}), cta: "Add", onDone: function (pk) { CR.ov.mentions = Object.keys(pk).map(function (id) { return { id: id, handle: pk[id] }; }); edRefresh(); if (CR.ov.mentions.length) toast("Mentioned " + CR.ov.mentions.length + (CR.ov.mentions.length === 1 ? " person." : " people.")); } });
      case "eddraw": return startDraw();
      case "edsave": return saveToDevice();
      case "edmore": return openMore();
      case "edshare": closeSheet(); return shareStory(b.dataset.aud);
      case "edgo": return openShareTo();
      case "edcf": closeSheet(); return openCloseFriends(false);
      case "edreelnext": return reelNext();
      case "edpick": return pickPanel(b.dataset.k, b.dataset.id);
      case "edpdone": return closePanel();
      case "moretoggle": var key = b.dataset.id; CR.ov[key] = !CR.ov[key]; var sw = $(".switch", b); if (sw) sw.setAttribute("aria-checked", String(!!CR.ov[key])); return;
      /* text editor */
      case "tdone": return tedDone();
      case "tfont": CR.ted.d.font = v; tedPaint(); tedOpts(); return;
      case "tcolor": CR.ted.d.color = v; tedPaint(); tedOpts(); return;
      case "tanim": CR.ted.d.anim = v; tedPaint(); tedOpts(); return;
      case "tfx": CR.ted.d.fx = v; tedPaint(); tedOpts(); return;
      case "talign": CR.ted.d.align = CR.ted.d.align === "center" ? "left" : CR.ted.d.align === "left" ? "right" : "center"; tedPaint(); tedTools(); return;
      case "tbox": CR.ted.d.bgm = CR.ted.d.bgm === 1 ? 2 : CR.ted.d.bgm === 2 ? 0 : 1; tedPaint(); tedTools(); return;
      case "tadd": return tedAddAnother();
      case "teye":
        if (window.EyeDropper) { new window.EyeDropper().open().then(function (r) { CR.ted.d.color = r.sRGBHex; tedPaint(); tedOpts(); }, function () {}); }
        else { var ci = $("#ted-cin"); if (ci) { ci.onchange = function () { CR.ted.d.color = ci.value; tedPaint(); tedOpts(); }; ci.click(); } }
        return;
      case "tmention": return peopleSheet({ title: "Mention", onPick: function (p) { tedInsert("@" + p.handle + " "); } });
      case "tloc": return stkLocation();
      /* stickers */
      case "stk": return stkAct(b.dataset.k, b);
      case "emopick": return addSticker("emoji", { e: b.dataset.e }, { s: 1.4 });
      case "framepick": var sh0 = b.dataset.s; return pickStickerPhotos(false, 1).then(function (ps) { if (ps.length) addSticker("frame", { shape: sh0, url: ps[0].url, blob: ps[0].blob }); });
      case "gifpick": return addSticker("gif", { url: b.dataset.url, w: +b.dataset.w, h: +b.dataset.h });
      case "locnow": return locNow();
      case "locpick": return addSticker("location", { name: b.dataset.n, lat: Math.round(+b.dataset.lat * 1e4) / 1e4, lon: Math.round(+b.dataset.lon * 1e4) / 1e4 });
      case "pspick": return psPick(b.dataset.id);
      case "psdone": return psDone();
      case "formchip": var fi = $("#sf-" + b.dataset.f); if (fi) { fi.value = b.dataset.v; fi.dispatchEvent(new Event("input")); } return;
      case "formdel": var o = S.stkForm; if (o && o.delItem) { removeItem(o.delItem.id); closeSheet(); } return;
      /* drawing */
      case "drundo": return drawUndo();
      case "drdone": return endDraw();
      case "drbrush": CR.drawing.brush = b.dataset.b; $$(".dr-brushes button").forEach(function (x) { x.classList.toggle("on", x === b); }); return;
      case "drcol": CR.drawing.color = b.dataset.c; $$(".dr-cols button").forEach(function (x) { x.classList.toggle("on", x === b); }); if (CR.drawing.brush === "eraser") { CR.drawing.brush = "pen"; $$(".dr-brushes button").forEach(function (x) { x.classList.toggle("on", x.dataset.b === "pen"); }); } return;
    }
  });
  /* pressing Enter in a sticker form submits it; the answer box for questions sends */
  document.addEventListener("click", function (e) { var b = e.target.closest("[data-act=qasend]"); if (b) sendAnswer(); });


  /* ---------- preferences, blocked and muted accounts ---------- */
  var PREF_DEF = { fs: "m", reduceMotion: false, autoplay: true, dataSaver: false, showSensitive: false, markSensitive: false,
    nOrbit: true, nLike: true, nReorb: true, nReply: true, nMention: true, nQuote: true, nReel: true, callsOn: true, callsAll: true, relayCalls: true, words: [] };
  var PREFS = Object.assign({}, PREF_DEF), DMPERM = "everyone";
  function prefKey() { return "orbi-prefs-" + (S.user ? S.user.id : "x"); }
  function applyPrefs() {
    var h = document.documentElement;
    h.setAttribute("data-fs", PREFS.fs); h.classList.toggle("calm", !!PREFS.reduceMotion);
  }
  function mergePrefs(j) {
    if (!j || typeof j !== "object") return;
    Object.keys(PREF_DEF).forEach(function (k) {
      var v = j[k]; if (v === undefined) return;
      if (k === "words") { if (Array.isArray(v)) PREFS.words = v.filter(function (w) { return typeof w === "string" && w.trim(); }).map(function (w) { return w.trim().toLowerCase().slice(0, 30); }).slice(0, 50); }
      else if (k === "fs") { if (["s", "m", "l", "xl"].indexOf(v) > -1) PREFS.fs = v; }
      else if (typeof v === typeof PREF_DEF[k]) PREFS[k] = v;
    });
  }
  function loadLocalPrefs() {
    PREFS = Object.assign({}, PREF_DEF, { words: [] });
    try { mergePrefs(JSON.parse(localStorage.getItem(prefKey()) || "{}")); DMPERM = localStorage.getItem(prefKey() + "-dm") || "everyone"; } catch (e) {}
    applyPrefs();
  }
  async function loadServerPrefs() {
    var r = await sb.from("user_settings").select("who_can_message,data").eq("user_id", S.user.id).maybeSingle();
    if (r.error || !r.data) return;
    mergePrefs(r.data.data);
    if (["everyone", "following", "nobody"].indexOf(r.data.who_can_message) > -1) DMPERM = r.data.who_can_message;
    saveLocalPrefs(); applyPrefs();
  }
  function saveLocalPrefs() { try { localStorage.setItem(prefKey(), JSON.stringify(PREFS)); localStorage.setItem(prefKey() + "-dm", DMPERM); } catch (e) {} }
  var pushT;
  function setPref(patch, dm) {
    Object.assign(PREFS, patch); if (dm) DMPERM = dm;
    saveLocalPrefs(); applyPrefs();
    clearTimeout(pushT); pushT = setTimeout(pushPrefs, 500);
  }
  async function pushPrefs() {
    if (!S.user) return;
    var row = { who_can_message: DMPERM, data: Object.assign({}, PREFS) };
    var u = await sb.from("user_settings").update(row).eq("user_id", S.user.id).select("user_id");
    if (!u.error && !(u.data && u.data.length)) await sb.from("user_settings").insert(Object.assign({ user_id: S.user.id }, row));
  }

  /* blocked and muted accounts */
  S.blocked = {}; S.muted = {};
  async function loadSafety() {
    var me = S.user.id;
    var res = await Promise.all([sb.from("blocks").select("blocked_id").eq("blocker_id", me), sb.from("mutes").select("muted_id").eq("muter_id", me)]);
    S.blocked = {}; S.muted = {};
    (res[0].data || []).forEach(function (x) { S.blocked[x.blocked_id] = true; });
    (res[1].data || []).forEach(function (x) { S.muted[x.muted_id] = true; });
  }
  function userHidden(id) { return !!(id && (S.blocked[id] || S.muted[id])); }
  function wordHit(text) {
    if (!PREFS.words.length || !text) return false;
    var t = String(text).toLowerCase();
    return PREFS.words.some(function (w) { return t.indexOf(w) > -1; });
  }
  /* drop orbs and reels from blocked or muted accounts, and ones with a muted word */
  function vis(rows) {
    return (rows || []).filter(function (r) {
      if (userHidden(r.author_id) || userHidden(r.actor_id)) return false;
      return !wordHit(r.body != null ? r.body : r.caption);
    });
  }
  function visPeople(rows) { return (rows || []).filter(function (p) { return !userHidden(p.id); }); }
  function purgeLists() {
    ["home", "explore", "bookmarks", "post"].forEach(function (k) { S.lists[k] = vis(S.lists[k]); });
    if (S.reels && S.reels.list) S.reels.list = vis(S.reels.list);
    S.people = visPeople(S.people);
  }
  async function blockUser(u) {
    var r = await sb.from("blocks").insert({ blocker_id: S.user.id, blocked_id: u.id });
    if (r.error && !/duplicate|unique/i.test(r.error.message || "")) { toast(niceErr(r.error)); return false; }
    S.blocked[u.id] = true;
    if (S.following[u.id]) { await sb.from("orbits").delete().eq("follower_id", S.user.id).eq("following_id", u.id); delete S.following[u.id]; }
    purgeLists(); return true;
  }
  async function unblockUser(id) {
    var r = await sb.from("blocks").delete().eq("blocker_id", S.user.id).eq("blocked_id", id);
    if (r.error) { toast(niceErr(r.error)); return false; }
    delete S.blocked[id]; return true;
  }
  async function muteUser(u) {
    var r = await sb.from("mutes").insert({ muter_id: S.user.id, muted_id: u.id });
    if (r.error && !/duplicate|unique/i.test(r.error.message || "")) { toast(niceErr(r.error)); return false; }
    S.muted[u.id] = true; purgeLists(); return true;
  }
  async function unmuteUser(id) {
    var r = await sb.from("mutes").delete().eq("muter_id", S.user.id).eq("muted_id", id);
    if (r.error) { toast(niceErr(r.error)); return false; }
    delete S.muted[id]; return true;
  }
  var REPORT_WHY = ["Spam or fake account", "Harassment or abuse", "Hateful or violent content", "Sexual or inappropriate content", "Something else"];
  async function reportSheet(kind, targetId, refId, title) {
    var items = REPORT_WHY.map(function (w, i) { return { id: String(i), label: w }; });
    var id = await actionSheet(items, title || "Report", "Tell us what is wrong. Reports are private.");
    if (id == null) return false;
    var r = await sb.from("reports").insert({ reporter_id: S.user.id, target_id: targetId, kind: kind, ref_id: refId || null, reason: REPORT_WHY[+id] });
    if (r.error) { toast(niceErr(r.error)); return false; }
    toast("Thanks. We will take a look."); return true;
  }

  /* ---------- chat ---------- */
  Object.assign(I, {
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
    bellOff: '<path d="M6 8a6 6 0 0 1 9.5-4.9M18 11c.3 4.5 3 6 3 6H8"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/><path d="M3 3l18 18"/>',
    mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    block: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    photos: '<rect x="3" y="5" width="14" height="14" rx="3"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/><circle cx="8" cy="10" r="1.3"/><path d="M17 15l-4-4-6 6"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v3"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    compose: '<path d="M12 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6"/><path d="M18.5 3.5a2 2 0 0 1 3 3L12 16l-4 1 1-4z"/>'
  });
  var EMOJIS = ["❤️", "😂", "👍", "😮", "😢", "🙏"];
  S.cp = {}; S.accepted = {}; S.iSent = {}; S.chatFilter = "all"; S.chatQ = ""; S.replyTo = null; S.threadQ = ""; S.cm = { tab: "media", rows: [] };

  function msgTime(iso) { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
  function sepTime(iso) {
    var d = new Date(iso), n = new Date(), t = msgTime(iso), dd = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    if (dd === 0) return "Today at " + t;
    if (dd === 1) return "Yesterday at " + t;
    if (dd < 7) return d.toLocaleDateString(undefined, { weekday: "long" }) + " at " + t;
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() === n.getFullYear() ? undefined : "numeric" }) + " at " + t;
  }
  function mediaKind(u) { return /\.(webm|ogg|m4a|mp3|aac|wav)(\?|$)/i.test(u || "") ? "audio" : "image"; }
  function cpOf(id) { return S.cp[id] || (S.cp[id] = { nickname: null, muted: false, pinned: false, disappear_secs: 0, cleared_at: null }); }
  function dispName(p) { var c = S.cp[p.id || p.other_id]; return (c && c.nickname) || p.display_name || "Orbiter"; }
  function previewHTML(t) {
    var body = t.last_body || "";
    if (!body && t.last_media) return ic(I[mediaKind(t.last_media) === "audio" ? "mic" : "image"], "cmi") + (mediaKind(t.last_media) === "audio" ? "Voice message" : "Photo");
    return esc(body);
  }
  function secsLabel(s) { return s === 86400 ? "24 hours" : s === 604800 ? "7 days" : s === 7776000 ? "90 days" : "Off"; }

  /* ----- the list of chats ----- */
  async function loadChat(quiet) {
    var el = $("#chat-list");
    if (!quiet && !S.chatThreads.length) el.innerHTML = '<div class="loading">Loading…</div>';
    var res = await Promise.all([sb.from("chat_threads").select("*").order("last_at", { ascending: false }).limit(100),
      sb.from("chat_prefs").select("other_id").eq("user_id", S.user.id), sb.from("messages").select("recipient_id").eq("sender_id", S.user.id).limit(2000)]), r = res[0];
    S.accepted = {}; S.iSent = {};
    (res[1].data || []).forEach(function (x) { S.accepted[x.other_id] = true; }); (res[2].data || []).forEach(function (x) { S.iSent[x.recipient_id] = true; });
    if (r.error) { if (!quiet) el.innerHTML = '<div class="empty gx"><b>Could not load chats</b>' + esc(niceErr(r.error)) + "</div>"; return; }
    S.chatThreads = r.data || [];
    S.chatThreads.forEach(function (t) { var c = cpOf(t.other_id); c.nickname = t.nickname || null; c.muted = !!t.muted; c.pinned = !!t.pinned; c.disappear_secs = Number(t.disappear_secs) || 0; });
    countChatUnread();
    if (S.view === "chat") renderChatList(); else if (S.view === "requests") renderRequests();
  }
  function countChatUnread() {
    var n = 0; S.chatThreads.forEach(function (t) { if (!t.muted && !isRequest(t)) n += Number(t.unread_count) || 0; });
    if (n !== S.chatUnread) { S.chatUnread = n; renderTabbar(); }
  }
  /* someone I have never replied to, don't orbit and haven't accepted */
  function isRequest(t) { var o = t.other_id; return !S.accepted[o] && !S.iSent[o] && !S.following[o] && !t.last_from_me && !S.blocked[o]; }
  function requestRows() { return S.chatThreads.filter(isRequest); }
  var FILTERS = { all: "All", unread: "Unread", direct: "Direct", groups: "Groups", pinned: "Pinned", muted: "Muted" };
  function chatRows() {
    var q = S.chatQ.trim().toLowerCase().replace(/^@/, "");
    var rows = S.chatThreads.filter(function (t) {
      if (isRequest(t)) return false;
      if (S.blocked[t.other_id] && S.chatFilter !== "all") return false;
      if (S.chatFilter === "groups") return false;
      if (S.chatFilter === "unread" && !(Number(t.unread_count) > 0)) return false;
      if (S.chatFilter === "pinned" && !t.pinned) return false;
      if (S.chatFilter === "muted" && !t.muted) return false;
      if (q && (dispName(t) + " " + (t.display_name || "") + " " + t.handle).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    return rows.sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0); });
  }
  function chatRowHTML(t) {
        var n = Number(t.unread_count) || 0, nm = dispName(t);
        return '<button class="trow gx chat-row" data-act="openthread" data-id="' + t.other_id + '" data-hold="chatrow">' + avInner(t.display_name, t.avatar_url, 48) +
          '<div class="pi"><div class="ttop"><b>' + esc(nm) + "</b><span class=\"muted tmeta\">" + (t.pinned ? ic(I.pin, "cmi") : "") + (t.muted ? ic(I.bellOff, "cmi") : "") + ago(t.last_at) + "</span></div>" +
          '<span class="tprev' + (n && !t.muted ? " unread" : "") + '">' + (t.last_from_me ? "You: " : "") + previewHTML(t) + "</span></div>" +
          (n ? '<span class="dot' + (t.muted ? " quiet" : "") + '" aria-label="' + n + ' unread">' + n + "</span>" : "") + "</button>";
  }
  function renderRequests() {
    var rows = requestRows();
    $("#v-requests").innerHTML = '<div class="setd gx" style="padding:12px 16px 4px">People you do not follow can message you. Accept a request to reply, or delete it. They will not see that you read it until you accept.</div>' +
      (rows.length ? rows.map(chatRowHTML).join("") : '<div class="empty gx"><b>No message requests</b>When someone you don\'t follow messages you, it shows up here.</div>');
  }
  function renderChatList() {
    var rows = chatRows(), el = $("#chat-list"), q = S.chatQ.trim(), reqs = requestRows(), top = "";
    if (reqs.length && S.chatFilter === "all" && !q) {
      var un = 0; reqs.forEach(function (t) { un += Number(t.unread_count) || 0; });
      top = '<button class="trow gx reqrow" data-act="openrequests"><span class="reqic">' + ic(I.mail) + '</span><div class="pi"><b>Message requests</b><span class="tprev">' + reqs.length + (reqs.length === 1 ? " request" : " requests") + " from people you don't follow</span></div>" + (un ? '<span class="dot">' + un + "</span>" : "") + ic(I.chev, "chev") + "</button>";
    }
    if (rows.length) {
      el.innerHTML = top + rows.map(function (t) {
        var n = Number(t.unread_count) || 0, nm = dispName(t);
        return '<button class="trow gx chat-row" data-act="openthread" data-id="' + t.other_id + '" data-hold="chatrow">' + avInner(t.display_name, t.avatar_url, 48) +
          '<div class="pi"><div class="ttop"><b>' + esc(nm) + "</b><span class=\"muted tmeta\">" + (t.pinned ? ic(I.pin, "cmi") : "") + (t.muted ? ic(I.bellOff, "cmi") : "") + ago(t.last_at) + "</span></div>" +
          '<span class="tprev' + (n && !t.muted ? " unread" : "") + '">' + (t.last_from_me ? "You: " : "") + previewHTML(t) + "</span></div>" +
          (n ? '<span class="dot' + (t.muted ? " quiet" : "") + '" aria-label="' + n + ' unread">' + n + "</span>" : "") + "</button>";
      }).join("");
    } else if (top) {
      el.innerHTML = top;
    } else if (q) {
      el.innerHTML = '<div class="empty gx"><b>No chats match "' + esc(q) + '"</b>Want to start a new one?<br><button class="btn fill sm" style="margin-top:12px" data-act="newchatq">Find people</button></div>';
    } else if (S.chatFilter !== "all") {
      el.innerHTML = S.chatFilter === "groups" ? '<div class="empty gx"><b>No group chats</b>Group chats are coming to Orbi soon.</div>' : '<div class="empty gx"><b>Nothing here</b>No ' + FILTERS[S.chatFilter].toLowerCase() + " chats right now.</div>";
    } else {
      el.innerHTML = '<div class="empty gx"><b>No chats yet</b>Tap the new message button to start a conversation.</div>';
    }
  }
  async function chatFilterMenu(anchor) {
    var f = S.chatFilter;
    var items = [{ id: "all", label: "All", icon: I.chat }, { id: "unread", label: "Unread", icon: I.mail }, { id: "direct", label: "Direct", icon: I.compose }, { id: "groups", label: "Groups", icon: I.people },
      { id: "requests", label: "Requests", icon: I.reply, sep: 1 }, { id: "settings", label: "Settings", icon: I.gear }, { id: "markread", label: "Mark all as read", icon: I.checks, sep: 1 }]
      .map(function (x) { x.lead = 1; x.check = x.id === f; return x; });
    var k = await popMenu(items, { anchor: anchor });
    if (k === "requests") go("requests");
    else if (k === "settings") go("setpage", { k: "chatset" });
    else if (k === "markread") markAllRead();
    else if (k) { S.chatFilter = k; renderTop(); renderChatList(); }
  }
  async function chatRowMenu(id) {
    var c = cpOf(id), t = S.chatThreads.filter(function (x) { return x.other_id === id; })[0]; if (!t) return;
    var a = await actionSheet([
      { id: "pin", icon: I.pin, label: c.pinned ? "Unpin chat" : "Pin chat" },
      { id: "mute", icon: c.muted ? I.bell : I.bellOff, label: c.muted ? "Unmute chat" : "Mute chat" },
      { id: "del", icon: I.trash, label: "Delete conversation", danger: true }], dispName(t));
    if (a === "pin") { if (await setCp(id, { pinned: !c.pinned })) renderChatList(); }
    else if (a === "mute") { if (await setCp(id, { muted: !c.muted })) { countChatUnread(); renderChatList(); } }
    else if (a === "del") deleteConversation(id, true);
  }

  /* per-chat settings (nickname, mute, pin, deleted-before) live in chat_prefs */
  async function setCp(o, patch) {
    var me = S.user.id, c = cpOf(o), old = Object.assign({}, c);
    Object.assign(c, patch);
    S.chatThreads.forEach(function (t) { if (t.other_id === o) Object.assign(t, patch); });
    var u = await sb.from("chat_prefs").update(patch).eq("user_id", me).eq("other_id", o).select("other_id");
    var err = u.error;
    if (!err && !(u.data && u.data.length)) { var i = await sb.from("chat_prefs").insert(Object.assign({ user_id: me, other_id: o }, patch)); err = i.error; }
    if (err) { Object.assign(c, old); S.chatThreads.forEach(function (t) { if (t.other_id === o) Object.assign(t, old); }); toast(niceErr(err)); return false; }
    return true;
  }
  async function deleteConversation(o, stay) {
    var ok = await confirmSheet("Delete this conversation?", "It disappears from your chats. The other person keeps their copy.", "Delete", true);
    if (!ok) return;
    if (!(await setCp(o, { cleared_at: new Date().toISOString() }))) return;
    S.chatThreads = S.chatThreads.filter(function (t) { return t.other_id !== o; }); countChatUnread();
    toast("Conversation deleted.");
    if (stay) renderChatList(); else { S.hist = []; show("chat"); }
  }

  /* ----- start a new chat ----- */
  var ncTok = 0, ncTimer;
  async function loadNewChat() {
    var tok = ++ncTok, q = $("#newchat-in").value.trim().replace(/^@/, "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim(), body = $("#newchat-body");
    body.innerHTML = '<div class="loading">Loading…</div>';
    var qy = sb.from("profiles").select("id,handle,display_name,bio,avatar_url").neq("id", S.user.id).limit(20);
    if (q) { var like = "%" + q.replace(/%/g, "") + "%"; qy = qy.or("handle.ilike." + like + ",display_name.ilike." + like); }
    else qy = qy.order("created_at", { ascending: false });
    var r = await qy;
    if (tok !== ncTok || S.view !== "newchat") return;
    S.newPeople = visPeople(r.data || []);
    body.innerHTML = S.newPeople.length ? S.newPeople.map(function (p) {
      return '<button class="trow" data-act="openthread" data-id="' + p.id + '">' + avInner(p.display_name, p.avatar_url, 46) +
        '<div class="pi"><b>' + esc(p.display_name) + '</b><span class="tprev">@' + esc(p.handle) + (p.bio ? " · " + esc(p.bio) : "") + "</span></div></button>";
    }).join("") : '<p class="muted">' + (q ? 'No one matches "' + esc(q) + '".' : "No one else has joined yet.") + "</p>";
  }

  /* ----- one conversation ----- */
  async function openThread(id) {
    var res = await Promise.all([
      sb.from("profile_cards").select("id,handle,display_name,avatar_url,created_at").eq("id", id).maybeSingle(),
      sb.from("chat_prefs").select("nickname,muted,pinned,cleared_at,disappear_secs").eq("user_id", S.user.id).eq("other_id", id).maybeSingle()
    ]);
    var pr = res[0];
    if (pr.error || !pr.data) return toast("Could not open that chat.");
    if (res[1].data) Object.assign(cpOf(id), res[1].data);
    S.thread = pr.data; S.threadMsgs = []; S.pendingMsgs = []; S.threadSig = ""; S.replyTo = null; S.threadQ = "";
    $("#thread-in").value = ""; $("#thread-q").value = ""; updateSend();
    go("thread");
    await loadThread(false);
  }
  var MSG_COLS = "id,sender_id,recipient_id,body,created_at,read_at,media_url,reply_to,expires_at,message_reactions(user_id,emoji)";
  async function loadThread(quiet) {
    var o = S.thread && S.thread.id, me = S.user.id; if (!o) return;
    var qy = sb.from("messages").select(MSG_COLS)
      .or("and(sender_id.eq." + me + ",recipient_id.eq." + o + "),and(sender_id.eq." + o + ",recipient_id.eq." + me + ")")
      .order("created_at", { ascending: false }).limit(200);
    var cl = cpOf(o).cleared_at; if (cl) qy = qy.gt("created_at", cl);
    var r = await qy;
    if (!S.thread || S.thread.id !== o || S.view !== "thread") return;
    if (r.error) { if (!quiet) toast(niceErr(r.error)); return; }
    var now = Date.now(), rows = (r.data || []).filter(function (m) { return !m.expires_at || new Date(m.expires_at).getTime() > now; }).reverse();
    var sig = rows.map(function (m) { return m.id + (m.read_at ? "r" : "") + (m.message_reactions || []).map(function (x) { return x.user_id.slice(-3) + x.emoji; }).join(""); }).join("|");
    if (sig !== S.threadSig) { S.threadSig = sig; S.threadMsgs = rows; renderThread(false); }
    if (!threadIsRequest() && rows.some(function (m) { return m.sender_id === o && !m.read_at; })) {
      sb.from("messages").update({ read_at: new Date().toISOString() }).eq("sender_id", o).eq("recipient_id", me).is("read_at", null).then(function () { loadUnread(); });
    }
  }
  function findMsg(id) { return S.threadMsgs.concat(S.pendingMsgs).filter(function (m) { return m.id === id; })[0]; }
  function msgSnippet(m) { return m.body ? m.body : m.media_url ? (mediaKind(m.media_url) === "audio" ? "Voice message" : "Photo") : ""; }
  function voiceHTML(url) {
    return '<div class="vnote" data-url="' + esc(url) + '"><button type="button" class="vnplay" data-act="vplay" aria-label="Play voice message">' + ic(I.play) + '</button><span class="vbar"><i></i></span><em class="vtime">Voice</em></div>';
  }
  function reactHTML(m, me) {
    var rs = m.message_reactions || []; if (!rs.length) return "";
    var by = {}; rs.forEach(function (x) { by[x.emoji] = by[x.emoji] || { n: 0, mine: false }; by[x.emoji].n++; if (x.user_id === me) by[x.emoji].mine = true; });
    return '<div class="rx">' + Object.keys(by).map(function (e) { return '<button type="button" class="rxc' + (by[e].mine ? " mine" : "") + '" data-act="mchip" data-id="' + m.id + '" data-e="' + esc(e) + '" aria-label="React ' + esc(e) + '">' + esc(e) + (by[e].n > 1 ? "<i>" + by[e].n + "</i>" : "") + "</button>"; }).join("") + "</div>";
  }
  function msgHTML(m, prev, rows, me, isLast) {
    var mine = m.sender_id === me, h = "";
    if (!prev || new Date(m.created_at) - new Date(prev.created_at) > 36e5 || new Date(m.created_at).toDateString() !== new Date(prev.created_at).toDateString()) h += '<div class="tsep">' + sepTime(m.created_at) + "</div>";
    var rq = "";
    if (m.reply_to) {
      var src = rows.filter(function (x) { return x.id === m.reply_to; })[0];
      rq = '<div class="rq"><b>' + (src ? (src.sender_id === me ? "You" : esc(dispName(S.thread))) : "Message") + "</b><span>" + (src ? esc(msgSnippet(src)).slice(0, 120) : "Original message") + "</span></div>";
    }
    var media = "";
    if (m.media_url) media = mediaKind(m.media_url) === "audio" ? voiceHTML(m.media_url) : '<button type="button" class="mimg" data-act="mimg" data-url="' + esc(m.media_url) + '" aria-label="Open photo"><img src="' + esc(m.media_url) + '" alt="Photo" loading="lazy"></button>';
    else if (m.local) media = '<span class="mimg pend"><img src="' + esc(m.local) + '" alt=""></span>';
    h += '<div class="mrow ' + (mine ? "me" : "them") + '" data-mid="' + esc(m.id) + '"><div class="bub ' + (mine ? "me" : "them") + (m.pending ? " pend" : "") + (media && !m.body ? " mediaonly" : "") + '"' + (m.pending ? "" : ' data-act="msgmenu" data-id="' + esc(m.id) + '" data-hold="msg"') + ">" +
      rq + media + (m.body ? "<span>" + linkify(m.body) + "</span>" : "") + "<small>" + msgTime(m.created_at) + "</small></div>" + reactHTML(m, me) + "</div>";
    if (isLast && mine && !m.pending) h += '<div class="seen">' + (m.read_at ? "Seen" : "Sent") + "</div>";
    return h;
  }
  function renderThread(bottom) {
    var box = $("#thread-msgs"), c = $("#content"), me = S.user.id, t = S.thread; if (!t) return;
    var near = bottom || (c.scrollHeight - c.scrollTop - c.clientHeight < 140);
    var all = S.threadMsgs.concat(S.pendingMsgs), rows = all, q = S.threadQ.trim().toLowerCase(), h = "";
    if (q) rows = all.filter(function (m) { return (m.body || "").toLowerCase().indexOf(q) > -1; });
    var cp = cpOf(t.id);
    if (!q) {
      h += '<div class="tintro"><span>' + (t.created_at ? "Joined " + new Date(t.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "") + '</span><button type="button" class="pill" data-act="viewprof">View profile</button></div>';
      if (cp.disappear_secs) h += '<div class="tnote">' + ic(I.timer, "cmi") + "New messages disappear after " + secsLabel(cp.disappear_secs) + "</div>";
    } else h += '<div class="tnote">' + rows.length + (rows.length === 1 ? " message" : " messages") + ' match "' + esc(S.threadQ.trim()) + '"</div>';
    if (!all.length && !q) h += '<div class="empty"><b>Say hello</b>Send the first message to ' + esc(dispName(t)) + ".</div>";
    else h += rows.map(function (m, i) { return msgHTML(m, q ? null : rows[i - 1], all, me, !q && i === rows.length - 1); }).join("");
    box.innerHTML = h;
    syncComposer();
    if (near) c.scrollTop = c.scrollHeight;
  }
  /* the composer, the reply bar, or the "you blocked them" bar */
  function syncComposer() {
    var t = S.thread; if (!t) return;
    var blocked = !!S.blocked[t.id];
    var req = !blocked && threadIsRequest();
    $("#thread-form").hidden = blocked || req || !!REC; $("#thread-blocked").hidden = !(blocked || req);
    $("#thread-blocked").className = "blockedbar gx" + (req ? " reqbar" : "");
    $("#thread-blocked").innerHTML = blocked ? '<span>You blocked @' + esc(t.handle) + '.</span><button class="btn sm" data-act="unblockthread">Unblock</button>'
      : req ? '<b>' + esc(dispName(t)) + ' wants to message you</b><span>Accept to reply. Delete or block if you do not know them.</span><div class="reqbtns"><button class="btn fill" data-act="reqaccept">Accept</button><button class="btn danger" data-act="reqdelete">Delete</button><button class="btn danger" data-act="reqblock">Block</button></div>' : "";
    var rb = $("#thread-reply");
    if (S.replyTo && !blocked) { rb.hidden = false; rb.innerHTML = '<div class="rbody"><b>Replying to ' + (S.replyTo.sender_id === S.user.id ? "yourself" : esc(dispName(t))) + "</b><span>" + esc(msgSnippet(S.replyTo)).slice(0, 100) + '</span></div><button type="button" class="iconbtn" data-act="replyoff" aria-label="Cancel reply">' + ic(I.close) + "</button>"; }
    else { rb.hidden = true; rb.innerHTML = ""; }
    $("#thread-search").hidden = !S.threadQ && $("#thread-search").dataset.open !== "1";
  }
  function threadIsRequest() {
    var t = S.thread; if (!t || S.accepted[t.id] || S.iSent[t.id] || S.following[t.id]) return false;
    var all = S.threadMsgs.concat(S.pendingMsgs);
    return all.some(function (m) { return m.sender_id === t.id; }) && !all.some(function (m) { return m.sender_id === S.user.id; });
  }
  async function acceptRequest() {
    var t = S.thread; if (!t) return;
    S.accepted[t.id] = true; syncComposer();
    if (!(await setCp(t.id, { muted: false }))) { delete S.accepted[t.id]; syncComposer(); return; }
    countChatUnread(); toast("Request accepted. You can reply now.");
  }
  function updateSend() {
    var has = !!$("#thread-in").value.trim();
    $("#thread-send").disabled = !has; $("#thread-send").hidden = !has; $("#thread-mic").hidden = has;
  }
  function sendFail(e) {
    var m = (e && e.message) || "";
    if (/row-level security|violates|permission denied/i.test(m)) {
      if (S.thread && S.blocked[S.thread.id]) return toast("You blocked this account. Unblock them to message.");
      return toast("This person is not accepting messages from you right now.");
    }
    toast(niceErr(e));
  }
  async function sendMsg(o) {
    var to = S.thread && S.thread.id; if (!to) return false;
    var tmp = { id: "p" + Date.now() + Math.random().toString(36).slice(2, 5), sender_id: S.user.id, body: o.body || "", created_at: new Date().toISOString(), pending: true, local: o.local || null, reply_to: S.replyTo && !String(S.replyTo.id).startsWith("p") ? S.replyTo.id : null };
    var row = { sender_id: S.user.id, recipient_id: to, body: o.body || "" };
    if (o.media_url) row.media_url = o.media_url; if (tmp.reply_to) row.reply_to = tmp.reply_to;
    S.pendingMsgs.push(tmp); S.replyTo = null; renderThread(true);
    var r = await sb.from("messages").insert(row);
    S.pendingMsgs = S.pendingMsgs.filter(function (m) { return m !== tmp; });
    if (r.error) { renderThread(false); sendFail(r.error); return false; }
    S.iSent[to] = true; S.threadSig = ""; await loadThread(true); renderThread(true); return true;
  }
  async function sendMessage() {
    var inp = $("#thread-in"), body = inp.value.trim();
    if (!body || body.length > 1000 || !S.thread) return;
    inp.value = ""; updateSend();
    var ok = await sendMsg({ body: body });
    if (!ok && !inp.value) { inp.value = body; updateSend(); }
  }
  async function sendPhoto() {
    var fs = await pickFiles("image/*", false), f = fs[0]; if (!f) return;
    var local = URL.createObjectURL(f);
    try {
      toast("Sending photo…");
      var p = await prepImage(f, { max: 1600 }), up = await uploadFile(p.blob, p.ext, p.type);
      await sendMsg({ body: "", media_url: up.url, local: local });
    } catch (e) { toast(niceErr(e)); }
    setTimeout(function () { try { URL.revokeObjectURL(local); } catch (x) {} }, 4000);
  }

  /* ----- voice messages ----- */
  var REC = null;
  function recClock(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
  async function startRec() {
    if (REC) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) return toast("Voice messages are not supported on this device.");
    var st;
    try { st = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return toast("Allow the microphone to record a voice message."); }
    var mt = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || "";
    var rec; try { rec = new MediaRecorder(st, mt ? { mimeType: mt } : undefined); } catch (e) { st.getTracks().forEach(function (t) { t.stop(); }); return toast("Voice messages are not supported on this device."); }
    var chunks = []; rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    REC = { rec: rec, st: st, chunks: chunks, t0: Date.now(), type: mt || rec.mimeType || "audio/webm" };
    REC.timer = setInterval(function () { if (!REC) return; var ms = Date.now() - REC.t0; $("#rec-t").textContent = recClock(ms); if (ms > 180000) stopRec(true); }, 250);
    rec.start(250);
    $("#rec-t").textContent = "0:00"; $("#thread-rec").hidden = false; syncComposer();
  }
  async function stopRec(send) {
    if (!REC) return; var R = REC; REC = null; clearInterval(R.timer);
    var done = new Promise(function (res) { R.rec.onstop = res; });
    var live = R.rec.state !== "inactive";
    if (live) R.rec.stop();
    R.st.getTracks().forEach(function (t) { t.stop(); });
    if (live) await Promise.race([done, sleep(1500)]);
    $("#thread-rec").hidden = true; syncComposer();
    if (!send) return;
    if (Date.now() - R.t0 < 700) return toast("Hold on a little longer to record.");
    var base = String(R.type).split(";")[0], ext = base === "audio/mp4" ? "m4a" : base === "audio/ogg" ? "ogg" : "webm";
    var blob = new Blob(R.chunks, { type: base });
    if (blob.size < 200) return toast("That recording was empty. Try again.");
    if (blob.size > 12 * 1024 * 1024) return toast("That voice message is too long.");
    try { toast("Sending voice message…"); var up = await uploadFile(blob, ext, base); await sendMsg({ body: "", media_url: up.url }); }
    catch (e) { toast(niceErr(e)); }
  }
  var VA = null, VEL = null;
  function stopVoice() { if (VA) { try { VA.pause(); } catch (e) {} } if (VEL) { VEL.classList.remove("playing"); VEL = null; } VA = null; }
  function toggleVoice(el) {
    var box = el.closest(".vnote"); if (!box) return;
    if (VEL === box && VA && !VA.paused) { VA.pause(); box.classList.remove("playing"); box.querySelector(".vnplay").innerHTML = ic(I.play); return; }
    stopVoice(); document.querySelectorAll(".vnote.playing").forEach(function (n) { n.classList.remove("playing"); n.querySelector(".vnplay").innerHTML = ic(I.play); });
    var a = new Audio(box.dataset.url); VA = a; VEL = box;
    function paint() { var d = isFinite(a.duration) && a.duration > 0 ? a.duration : 0, bar = box.querySelector(".vbar i"); if (bar) bar.style.width = (d ? Math.min(100, a.currentTime / d * 100) : 0) + "%"; box.querySelector(".vtime").textContent = recClock(a.currentTime * 1000); }
    a.ontimeupdate = paint;
    a.onended = function () { box.classList.remove("playing"); box.querySelector(".vnplay").innerHTML = ic(I.play); var bar = box.querySelector(".vbar i"); if (bar) bar.style.width = "0"; box.querySelector(".vtime").textContent = "Voice"; if (VA === a) { VA = null; VEL = null; } };
    a.onerror = function () { toast("Could not play that voice message."); box.classList.remove("playing"); box.querySelector(".vnplay").innerHTML = ic(I.play); };
    box.classList.add("playing"); box.querySelector(".vnplay").innerHTML = ic(I.pause);
    var p = a.play(); if (p && p.catch) p.catch(function () { box.classList.remove("playing"); box.querySelector(".vnplay").innerHTML = ic(I.play); });
  }

  /* ----- a message: reactions, reply, copy, unsend ----- */
  function msgMenu(id) {
    var m = findMsg(id); if (!m || m.pending) return;
    S.menuMsg = id;
    var mine = m.sender_id === S.user.id, mineR = (m.message_reactions || []).filter(function (x) { return x.user_id === S.user.id; })[0];
    var h = '<div class="emrow" role="group" aria-label="React">' + EMOJIS.map(function (e) { return '<button type="button" class="em' + (mineR && mineR.emoji === e ? " on" : "") + '" data-act="mreact" data-e="' + e + '" aria-label="React ' + e + '">' + e + "</button>"; }).join("") + "</div>" +
      '<button class="sh-item" data-act="mreply">' + ic(I.undo) + "<span><b>Reply</b></span></button>" +
      (m.body ? '<button class="sh-item" data-act="mcopy">' + ic(I.copy) + "<span><b>Copy</b></span></button>" : "") +
      (mine ? '<button class="sh-item danger" data-act="munsend">' + ic(I.trash) + "<span><b>Unsend</b><small>Removes it for both of you</small></span></button>"
        : '<button class="sh-item danger" data-act="mreport">' + ic(I.flag) + "<span><b>Report</b></span></button>");
    openSheet(h, { label: "Message options" });
  }
  async function reactTo(id, e) {
    var m = findMsg(id); if (!m) return;
    var me = S.user.id, list = m.message_reactions || (m.message_reactions = []), mine = list.filter(function (x) { return x.user_id === me; })[0], prev = list.slice(), r;
    if (mine && mine.emoji === e) { m.message_reactions = list.filter(function (x) { return x !== mine; }); renderThread(false); r = await sb.from("message_reactions").delete().eq("message_id", id).eq("user_id", me); }
    else if (mine) { mine.emoji = e; renderThread(false); r = await sb.from("message_reactions").update({ emoji: e }).eq("message_id", id).eq("user_id", me); }
    else { list.push({ user_id: me, emoji: e }); renderThread(false); r = await sb.from("message_reactions").insert({ message_id: id, user_id: me, emoji: e }); }
    if (r.error) { m.message_reactions = prev; renderThread(false); toast(niceErr(r.error)); }
    else { S.threadSig = ""; }
  }
  async function unsend(id) {
    var m = findMsg(id); if (!m) return;
    var ok = await confirmSheet("Unsend this message?", "It will be removed for both of you.", "Unsend", true); if (!ok) return;
    var r = await sb.from("messages").delete().eq("id", id);
    if (r.error) return toast(niceErr(r.error));
    if (m.media_url) removeMedia([m.media_url]);
    S.threadMsgs = S.threadMsgs.filter(function (x) { return x.id !== id; }); S.threadSig = ""; renderThread(false); loadChat(true);
  }

  /* ----- conversation menu, info page, nickname, disappearing ----- */
  function convoMenuItems() {
    var t = S.thread, c = cpOf(t.id), bl = !!S.blocked[t.id];
    return [
      { id: "mute", icon: c.muted ? I.bell : I.bellOff, label: c.muted ? "Unmute conversation" : "Mute conversation" },
      { id: "pin", icon: I.pin, label: c.pinned ? "Unpin conversation" : "Pin conversation" },
      { id: "search", icon: I.search, label: "Search" },
      { id: "block", icon: I.block, label: bl ? "Unblock messages" : "Block messages" },
      { id: "rconvo", icon: I.flag, label: "Report conversation", danger: true },
      { id: "ruser", icon: I.flag, label: "Report user", danger: true },
      { id: "del", icon: I.trash, label: "Delete conversation", danger: true }];
  }
  async function convoMenu(anchor) {
    var id = await popMenu(convoMenuItems(), { anchor: anchor }), t = S.thread; if (!id || !t) return;
    var c = cpOf(t.id);
    if (id === "mute") { if (await setCp(t.id, { muted: !c.muted })) { countChatUnread(); toast(c.muted ? "Conversation muted." : "Conversation unmuted."); if (S.view === "chatinfo") renderChatInfo(); } }
    else if (id === "pin") { if (await setCp(t.id, { pinned: !c.pinned })) toast(c.pinned ? "Pinned to the top." : "Unpinned."); }
    else if (id === "search") { if (S.view === "chatinfo") back(); openThreadSearch(); }
    else if (id === "block") toggleBlockMessages();
    else if (id === "rconvo") reportSheet("conversation", t.id, null, "Report conversation");
    else if (id === "ruser") reportSheet("user", t.id, null, "Report @" + t.handle);
    else if (id === "del") deleteConversation(t.id, false);
  }
  async function toggleBlockMessages() {
    var t = S.thread; if (!t) return;
    if (S.blocked[t.id]) { if (await unblockUser(t.id)) { toast("Unblocked @" + t.handle + "."); syncComposer(); if (S.view === "chatinfo") renderChatInfo(); } return; }
    var ok = await confirmSheet("Block @" + t.handle + "?", "They won't be able to message you, you'll stop seeing their orbs, and you'll stop orbiting them.", "Block", true);
    if (!ok) return;
    if (await blockUser(t)) { toast("Blocked @" + t.handle + "."); syncComposer(); if (S.view === "chatinfo") renderChatInfo(); }
  }
  function openThreadSearch() {
    var s = $("#thread-search"); s.dataset.open = "1"; s.hidden = false; $("#thread-q").focus();
  }
  function closeThreadSearch() { var s = $("#thread-search"); s.dataset.open = ""; s.hidden = true; S.threadQ = ""; $("#thread-q").value = ""; renderThread(true); }
  function renderChatInfo() {
    var t = S.thread; if (!t) return back();
    var c = cpOf(t.id), nm = dispName(t);
    $("#v-chatinfo").innerHTML = '<div class="cinfo gx"><div class="cav">' + avInner(t.display_name, t.avatar_url, 96) + "</div><h2>" + esc(nm) + '</h2><p class="muted">@' + esc(t.handle) + (c.nickname ? " · " + esc(t.display_name) : "") + "</p>" +
      '<div class="circs">' +
      '<div><button class="circb" data-act="callsoon" aria-label="Call">' + ic(I.phone) + "</button><span>Call</span></div>" +
      '<div><button class="circb" data-act="callsoon" aria-label="Video">' + ic(I.video) + "</button><span>Video</span></div>" +
      '<div><button class="circb" data-act="viewprof" aria-label="Profile">' + ic(I.user) + "</button><span>Profile</span></div>" +
      '<div><button class="circb" data-act="convomore" aria-label="More">' + ic(I.more) + "</button><span>More</span></div></div>" +
      '<div class="card">' +
      '<button class="row" data-act="chatmedia">' + ic(I.photos, "ri") + '<div class="rt"><b>Media, links, voice</b></div>' + ic(I.chev, "chev") + "</button>" +
      '<button class="row" data-act="disappear">' + ic(I.timer, "ri") + '<div class="rt"><b>Disappearing messages</b></div><span class="rval">' + secsLabel(c.disappear_secs) + "</span>" + ic(I.chev, "chev") + "</button>" +
      '<button class="row" data-act="nickedit">' + ic(I.pencil, "ri") + '<div class="rt"><b>Nickname</b></div><span class="rval">' + (c.nickname ? esc(c.nickname) : "Add") + "</span>" + ic(I.chev, "chev") + "</button></div>" +
      (S.blocked[t.id] ? '<p class="muted cinote">You blocked this account. Use More to unblock.</p>' : "") + "</div>";
  }
  function nickSheet() {
    var t = S.thread, c = cpOf(t.id);
    openSheet('<p class="sh-title">Nickname</p><p class="sh-desc">Only you see this. It replaces ' + esc(t.display_name) + "'s name in your chats.</p>" +
      '<div class="sh-pad"><label class="sr" for="nick-in">Nickname</label><input id="nick-in" class="in" maxlength="30" placeholder="' + esc(t.display_name) + '" value="' + esc(c.nickname || "") + '" autocomplete="off"></div>' +
      '<div class="sh-pad nickbtns"><button class="btn fill" data-act="nicksave">Save</button>' + (c.nickname ? '<button class="btn" data-act="nickclear">Remove nickname</button>' : "") + "</div>", { label: "Nickname" });
  }
  async function saveNick(v) {
    var t = S.thread; v = (v || "").trim().slice(0, 30);
    closeSheet();
    if (await setCp(t.id, { nickname: v || null })) { toast(v ? "Nickname saved." : "Nickname removed."); renderChatInfo(); renderTop(); }
  }
  async function disappearMenu() {
    var t = S.thread, c = cpOf(t.id);
    var id = await actionSheet([{ id: "0", label: "Off", icon: c.disappear_secs === 0 ? I.check : null }, { id: "86400", label: "24 hours", icon: c.disappear_secs === 86400 ? I.check : null },
      { id: "604800", label: "7 days", icon: c.disappear_secs === 604800 ? I.check : null }, { id: "7776000", label: "90 days", icon: c.disappear_secs === 7776000 ? I.check : null }],
      "Disappearing messages", "New messages you and " + dispName(t) + " send will be removed after this time. Older messages stay.");
    if (id == null) return;
    var r = await sb.rpc("set_disappearing", { p_other: t.id, p_secs: +id });
    if (r.error) return toast(niceErr(r.error));
    c.disappear_secs = +id; toast(+id ? "Disappearing messages: " + secsLabel(+id) + "." : "Disappearing messages are off."); renderChatInfo();
  }
  async function loadChatMedia() {
    var t = S.thread; if (!t) return back();
    var me = S.user.id; S.cm.rows = [];
    renderChatMedia(true);
    var qy = sb.from("messages").select("id,sender_id,body,created_at,media_url")
      .or("and(sender_id.eq." + me + ",recipient_id.eq." + t.id + "),and(sender_id.eq." + t.id + ",recipient_id.eq." + me + ")")
      .order("created_at", { ascending: false }).limit(500);
    var cl = cpOf(t.id).cleared_at; if (cl) qy = qy.gt("created_at", cl);
    var r = await qy;
    if (S.view !== "chatmedia") return;
    S.cm.rows = r.data || []; renderChatMedia(false);
  }
  function renderChatMedia(loading) {
    var tab = S.cm.tab, rows = S.cm.rows, h = '<div class="tabs2 cmtabs" role="tablist">' + [["media", "Media"], ["links", "Links"], ["voice", "Voice"]].map(function (x) { return '<button role="tab" data-act="cmtab" data-t="' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div>";
    if (loading) h += '<div class="loading">Loading…</div>';
    else if (tab === "media") {
      var ph = rows.filter(function (m) { return m.media_url && mediaKind(m.media_url) === "image"; });
      h += ph.length ? '<div class="grid">' + ph.map(function (m) { return '<button class="gt" data-act="mimg" data-url="' + esc(m.media_url) + '" aria-label="Open photo"><img src="' + esc(m.media_url) + '" alt="" loading="lazy"></button>'; }).join("") + "</div>" : emptyHTML("No photos yet", "Photos you share in this chat show up here.");
    } else if (tab === "links") {
      var ls = []; rows.forEach(function (m) { (String(m.body || "").match(/https?:\/\/[^\s<]+[^\s<.,;:!?)"']/g) || []).forEach(function (u) { ls.push({ u: u, at: m.created_at }); }); });
      h += ls.length ? '<div class="pad gx">' + ls.map(function (x) { var host = x.u.replace(/^https?:\/\//, "").split("/")[0]; return '<a class="row linkrow" href="' + esc(x.u) + '" target="_blank" rel="noopener noreferrer nofollow">' + ic(I.link, "ri") + '<div class="rt"><b>' + esc(host) + "</b><span>" + esc(x.u.length > 60 ? x.u.slice(0, 58) + "…" : x.u) + "</span></div></a>"; }).join("") + "</div>" : emptyHTML("No links yet", "Links shared in this chat show up here.");
    } else {
      var vs = rows.filter(function (m) { return m.media_url && mediaKind(m.media_url) === "audio"; });
      h += vs.length ? '<div class="pad gx">' + vs.map(function (m) { return '<div class="vrow"><small class="muted">' + (m.sender_id === S.user.id ? "You" : esc(dispName(S.thread))) + " · " + sepTime(m.created_at) + "</small>" + voiceHTML(m.media_url) + "</div>"; }).join("") + "</div>" : emptyHTML("No voice messages yet", "Voice messages in this chat show up here.");
    }
    $("#v-chatmedia").innerHTML = h;
  }
  $("#thread-in").addEventListener("input", updateSend);
  $("#thread-form").addEventListener("submit", function (e) { e.preventDefault(); sendMessage(); });
  $("#thread-q").addEventListener("input", function (e) { S.threadQ = e.target.value; renderThread(true); });
  $("#chat-q").addEventListener("input", function (e) { S.chatQ = e.target.value; renderChatList(); });
  $("#newchat-in").addEventListener("input", function () { clearTimeout(ncTimer); ncTimer = setTimeout(loadNewChat, 280); });

  /* press and hold (or right-click) a chat or a message for more options */
  (function () {
    var timer = null, sx = 0, sy = 0;
    function clear() { clearTimeout(timer); timer = null; }
    function fire(el) {
      S.held = Date.now();
      if (el.dataset.hold === "msg") msgMenu(el.dataset.id);
      else if (el.dataset.hold === "chatrow") chatRowMenu(el.dataset.id);
    }
    document.addEventListener("pointerdown", function (e) {
      var el = e.target.closest("[data-hold]"); if (!el || (e.pointerType === "mouse" && e.button !== 0)) return;
      sx = e.clientX; sy = e.clientY; clear(); timer = setTimeout(function () { fire(el); }, 480);
    });
    document.addEventListener("pointermove", function (e) { if (timer && (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8)) clear(); });
    ["pointerup", "pointercancel", "scroll"].forEach(function (ev) { document.addEventListener(ev, clear, true); });
    document.addEventListener("contextmenu", function (e) { var el = e.target.closest("[data-hold]"); if (el) { e.preventDefault(); clear(); fire(el); } });
  })();

  /* ---------- settings (X-style: a list of sections, each one a page) ---------- */
  Object.assign(I, {
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    access: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="7.8" r="1"/><path d="M7.5 10.8h9M12 10.8V15l-2 3.5M12 15l2 3.5"/>',
    devices: '<rect x="3" y="5" width="12" height="9" rx="2"/><path d="M7 18h4M9 14v4"/><rect x="17" y="8" width="4" height="10" rx="1.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    type: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4M12 17h.01"/>'
  });
  var APP_VERSION = "2.0";
  var LEGAL_DATE = "20 October 2026";

  function setHandle() { return S.profile ? "@" + S.profile.handle : ""; }
  function sRow(it) { return '<button class="sset" data-act="setgo" data-k="' + it.k + '">' + ic(it.i, "si") + '<span class="st"><b>' + esc(it.t) + "</b><span>" + esc(it.d) + "</span></span></button>"; }
  function sTog(key, t, d) { return '<label class="sset tog"><span class="st"><b>' + esc(t) + "</b><span>" + esc(d) + '</span></span><input type="checkbox" class="swt" role="switch" data-pref="' + key + '"' + (PREFS[key] ? " checked" : "") + "></label>"; }
  function sInfo(t, v, act, extra) {
    var tag = act ? "button" : "div";
    return "<" + tag + ' class="sset' + (act ? "" : " static") + '"' + (act ? ' data-act="' + act + '"' : "") + '><span class="st"><b>' + esc(t) + "</b><span>" + (extra ? v : esc(v)) + "</span></span>" + (act ? ic(I.chev, "chev") : "") + "</" + tag + ">";
  }
  function sText(paras) { return '<div class="stext">' + paras.map(function (p) { return /^##/.test(p) ? "<h3>" + esc(p.slice(2).trim()) + "</h3>" : "<p>" + esc(p) + "</p>"; }).join("") + "</div>"; }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
  function isStandalone() { return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone; }
  function deviceName() {
    var ua = navigator.userAgent, os = /iphone|ipad|ipod/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "this device";
    var br = /edg\//i.test(ua) ? "Edge" : /opr\//i.test(ua) ? "Opera" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Browser";
    return br + " on " + os;
  }
  function notifOff(type) {
    var m = { orbit: "nOrbit", like: "nLike", reorb: "nReorb", reply: "nReply", mention: "nMention", quote: "nQuote", reel_like: "nReel", reel_comment: "nReel", reel_reorb: "nReel" }[type];
    return !!(m && !PREFS[m]);
  }
  function offTypes() {
    return ["orbit", "like", "reorb", "reply", "mention", "quote", "reel_like", "reel_comment", "reel_reorb"].filter(notifOff);
  }
  function resetFeeds() {
    S.lists.home = []; S.lists.explore = []; S.homeEnd = false; S.homeBusy = false;
    S.reels = { list: [], idx: 0, ctx: null, end: false, loading: false };
  }

  /* every page the settings can show */
  function pageDef(k) {
    var u = S.profile || {}, P = {
      account: { t: "Your account", d: "See information about your account, download an archive of your data, or delete your account.", items: [
        { k: "acctinfo", i: I.user, t: "Account information", d: "See your account information like your username and email address." },
        { k: "password", i: I.lock, t: "Change your password", d: "Change your password at any time." },
        { k: "archive", i: I.install, t: "Download an archive of your data", d: "Get a copy of the information Orbi stores for your account." },
        { k: "delete", i: I.trash, t: "Delete your account", d: "Find out how you can delete your account." }] },
      acctinfo: { t: "Account information", d: "See your account information like your username and email address.", body: function () {
        var ids = (S.user.identities || []).map(function (x) { return x.provider; });
        return sInfo("Username", "@" + u.handle, "editusername") + sInfo("Display name", u.display_name || "", "edit") +
          (S.user.email ? sInfo("Email", S.user.email, "editemail") : "") +
          sInfo("Joined", u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "") +
          sInfo("Sign-in", ids.length ? ids.map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); }).join(", ") : "Email"); } },
      password: { t: "Change your password", d: "Use at least 8 characters.", body: function () {
        return '<div class="pwform">' + (S.recovery ? "" : '<label class="sr" for="pw-cur">Current password</label><input class="in" id="pw-cur" type="password" placeholder="Current password" autocomplete="current-password">') +
          '<label class="sr" for="pw-new">New password</label><input class="in" id="pw-new" type="password" placeholder="New password" autocomplete="new-password">' +
          '<label class="sr" for="pw-con">Confirm new password</label><input class="in" id="pw-con" type="password" placeholder="Confirm new password" autocomplete="new-password">' +
          '<p class="errl" role="alert" id="pw-msg"></p><button class="btn fill" id="pw-save" data-act="pwsave">Update password</button></div>'; } },
      archive: { t: "Download an archive of your data", d: "Get a file with your profile, orbs, reels, likes, bookmarks, orbits and messages. It is built on this device and never leaves it until you save it.", body: function () {
        return '<div class="pwform"><button class="btn fill" id="arch-btn" data-act="archive">Create and download</button><p class="muted" id="arch-msg" role="status"></p></div>'; } },
      "delete": { t: "Delete your account", d: "This permanently removes your account and everything on it.", body: function () {
        return '<div class="stext"><p>Deleting your account removes your profile, orbs, reels, stories, likes, bookmarks, orbits and messages for good. This cannot be undone.</p><p>To confirm, type your username <b>@' + esc(u.handle) + '</b> below.</p></div>' +
          '<div class="pwform"><label class="sr" for="del-in">Your username</label><input class="in" id="del-in" placeholder="' + esc(u.handle) + '" autocomplete="off" autocapitalize="none"><p class="errl" role="alert" id="del-msg"></p><button class="btn danger fill" id="del-btn" data-act="deleteacct" disabled>Delete my account</button></div>'; } },
      security: { t: "Security and account access", d: "Manage your account's security and keep track of how it is used, including apps and devices that are signed in.", items: [
        { k: "sec", i: I.lock, t: "Security", d: "Manage your account's security." },
        { k: "sessions", i: I.devices, t: "Apps and sessions", d: "See where you are signed in, and log out of other devices." },
        { k: "connected", i: I.link, t: "Connected accounts", d: "Manage the Google account you use to log in to Orbi." }] },
      sec: { t: "Security", d: "Manage your account's security.", items: [{ k: "password", i: I.lock, t: "Change your password", d: "Change your password at any time." }], body: function () {
        return sInfo("Two-step verification", '<span class="tag soon">Coming soon</span>', null, true); } },
      sessions: { t: "Apps and sessions", d: "See where you are signed in. If you see something you do not recognise, log out of the other devices and change your password.", body: function () {
        return sInfo("This device", deviceName() + " · Active now") + '<button class="sset" data-act="endall">' + ic(I.out, "si") + '<span class="st"><b>Log out of all other devices</b><span>You stay signed in here.</span></span></button>'; } },
      connected: { t: "Connected accounts", d: "Manage the Google account you use to log in to Orbi.", body: function () {
        var ids = (S.user.identities || []).map(function (x) { return x.provider; });
        function m(key, label) { var on = ids.indexOf(key) > -1, live = provOn(key); return sInfo(label, on ? '<span class="tag ok">Connected</span>' : live ? "Not connected" : '<span class="tag soon">Coming soon</span>', null, true); }
        return sInfo("Email", S.user.email || "No email added") + m("google", "Google"); } },
      privacy: { t: "Privacy and safety", d: "Manage what information you see and share on Orbi.", items: [
        { k: "muteblock", i: I.block, t: "Mute and block", d: "Manage the accounts, words and chats you have muted or blocked." },
        { k: "dmperm", i: I.chat, t: "Chat", d: "Control who can start a conversation with you." },
        { k: "contentpref", i: I.eyeoff, t: "Content you see and share", d: "Control sensitive content in your timeline and on your own orbs." }], body: function () { return privLearnHTML(); } },
      muteblock: { t: "Mute and block", d: "Manage the accounts, words and chats you have muted or blocked.", items: [
        { k: "blocked", i: I.block, t: "Blocked accounts", d: "They can't message you, and you won't see their orbs." },
        { k: "muted", i: I.bellOff, t: "Muted accounts", d: "You won't see their orbs, but they can still message you." },
        { k: "words", i: I.text, t: "Muted words", d: "Hide orbs and reels that contain words you choose." }] },
      blocked: { t: "Blocked accounts", d: "Blocked accounts can't message you, and you won't see their orbs or reels.", body: function () { return '<div id="sp-list" class="loading">Loading…</div>'; }, after: function () { loadAccountList("blocks"); } },
      muted: { t: "Muted accounts", d: "You won't see orbs or reels from muted accounts. They can still message you and won't know.", body: function () { return '<div id="sp-list" class="loading">Loading…</div>'; }, after: function () { loadAccountList("mutes"); } },
      words: { t: "Muted words", d: "Orbs and reels containing these words are hidden from your timeline, Explore and Reels.", body: function () {
        return '<form class="wordform" id="word-form" autocomplete="off"><label class="sr" for="word-in">Add a word</label><input class="in" id="word-in" maxlength="30" placeholder="Add a word or phrase"><button class="btn fill" type="submit">Add</button></form><div id="word-list">' + wordListHTML() + "</div>"; } },
      dmperm: { t: "Chat", d: "Choose who can start a conversation with you. People you have already messaged can always reply.", body: function () {
        return [["everyone", "Everyone", "Anyone on Orbi can message you."], ["following", "People you orbit", "Only people you orbit can start a chat."], ["nobody", "No one", "Nobody can start a new chat with you."]].map(function (x) {
          return '<button class="sset rad" role="radio" aria-checked="' + (DMPERM === x[0]) + '" data-act="setdm" data-v="' + x[0] + '"><span class="st"><b>' + x[1] + "</b><span>" + x[2] + "</span></span>" + ic(I.check, "tick") + "</button>"; }).join(""); } },
      contentpref: { t: "Content you see and share", d: "Control sensitive content in your timeline and on your own orbs.", body: function () {
        return sTog("showSensitive", "Show sensitive content", "Skip the warning on orbs marked sensitive.") + sTog("markSensitive", "Mark my orbs as sensitive", "New orbs you write start with the Sensitive tag on."); } },
      notifs: { t: "Notifications", d: "Choose the activity that shows up in Alerts and on your Alerts badge.", body: function () {
        return sTog("nOrbit", "New orbiters", "When someone starts orbiting you.") + sTog("nLike", "Likes", "When someone likes your orb.") + sTog("nReorb", "Re-orbs", "When someone re-orbs your orb.") +
          sTog("nReply", "Replies", "When someone replies to your orb.") + sTog("nMention", "Mentions", "When someone mentions you.") + sTog("nQuote", "Quotes", "When someone quotes your orb.") + sTog("nReel", "Reel activity", "Likes, comments and re-orbs on your reels.") +
          '<p class="setd" style="margin-top:14px">Muted chats never add to your Chat badge. Mute a chat from its menu.</p>'; } },
      access: { t: "Accessibility, display, and languages", d: "Manage how Orbi content is displayed to you.", items: [
        { k: "a11y", i: I.access, t: "Accessibility", d: "Manage motion and other ways to make Orbi easier to use." },
        { k: "display", i: I.sparkle, t: "Display", d: "Manage your theme and text size." },
        { k: "datause", i: I.globe, t: "Data usage", d: "Limit how Orbi uses your network data." },
        { k: "langs", i: I.text, t: "Languages", d: "Manage which languages are used to personalise your Orbi." }] },
      a11y: { t: "Accessibility", d: "Make Orbi easier to see and use.", body: function () { return sTog("reduceMotion", "Reduce motion", "Turn off animations and transitions."); } },
      display: { t: "Display", d: "Manage your theme and text size.", body: function () {
        return '<p class="glabel sgl">Theme</p><div class="seg" role="radiogroup" aria-label="Theme">' +
          [["light", "Light"], ["dark", "Dark"], ["system", "System"]].map(function (t) { return '<button role="radio" data-theme-set="' + t[0] + '" aria-checked="' + (theme === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>" +
          '<p class="glabel sgl">Text size</p><div class="seg seg4" role="radiogroup" aria-label="Text size">' +
          [["s", "Small"], ["m", "Default"], ["l", "Large"], ["xl", "Largest"]].map(function (t) { return '<button role="radio" data-fs-set="' + t[0] + '" aria-checked="' + (PREFS.fs === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>" +
          '<div class="card fsprev"><div class="ptext">Orbs and chats look like this. Pick the size that is easiest on your eyes.</div></div>'; } },
      datause: { t: "Data usage", d: "Limit how Orbi uses your network data.", body: function () {
        return sTog("autoplay", "Video autoplay", "Play videos in your timeline as you scroll.") + sTog("dataSaver", "Data saver", "Stops videos from playing on their own to save data. Tap a video to play it."); } },
      langs: { t: "Languages", d: "Manage which languages are used to personalise your Orbi.", body: function () {
        return '<div class="sset rad static" aria-checked="true"><span class="st"><b>English</b><span>Display language</span></span>' + ic(I.check, "tick") + "</div>" + sInfo("More languages", '<span class="tag soon">Coming soon</span>', null, true); } },
      resources: { t: "Additional resources", d: "Check out other places for helpful information to learn more about Orbi products and services.", items: [
        { k: "helpcenter", i: I.help, t: "Help center", d: "Answers to common questions about using Orbi." },
        { k: "privpol", i: I.shield, t: "Privacy policy", d: "How Orbi handles your information." },
        { k: "terms", i: I.doc, t: "Terms of service", d: "The rules for using Orbi." },
        { k: "cookies", i: I.doc, t: "Cookie use", d: "How Orbi uses your browser's storage." },
        { k: "about", i: I.info, t: "About Orbi", d: "What Orbi is, and the version you are using." }], body: function () {
        var h = "";
        if (!isStandalone()) {
          if (S.installEvt) h += '<button class="sset" data-act="install">' + ic(I.install, "si") + '<span class="st"><b>Install Orbi</b><span>Add Orbi to your home screen.</span></span></button>';
          else if (isIOS()) h += '<div class="sset static">' + ic(I.install, "si") + '<span class="st"><b>Install Orbi</b><span>In Safari, tap Share, then Add to Home Screen.</span></span></div>';
        }
        return h; } },
      reelprefs: { t: "Content preferences", d: "Tune what you see in Reels.", items: [
        { k: "contentpref", i: I.eyeoff, t: "Sensitive content", d: "Control sensitive content in your timeline and Reels." },
        { k: "words", i: I.text, t: "Specific words and phrases", d: "Hide orbs and reels that contain words you choose." }], body: function () { return reelPrefsBody(); } },
      chatset: { t: "Chat Settings", d: "", body: function () { return chatSetBody(); } },
      privcenter: { t: "Privacy center", d: "", body: function () { return privCenterBody(); } },
      helpcenter: { t: "Help Center", d: "", body: function () { return hcBody(); } },
      partners: { t: "Our partners", d: "The companies that help us bring Orbi to you.", body: function () {
        return sText(["## Supabase", "Stores accounts, orbs, reels, stories, messages and uploaded media, and handles sign-in.", "## GitHub Pages", "Hosts the Orbi website and app files.", "## Google", "Only used if you choose to log in with it. They tell us your name and email address, nothing else."]); } },
      help: { t: "Help center", d: "Answers to common questions.", body: function () {
        var h = sText(["## What are orbs and orbits?", "An orb is a post. To orbit someone is to follow them. A re-orb shares someone's orb with your own orbiters.",
          "## How do I change my username or photo?", "Open Settings, then Your account, then Account information. For your photo, bio and banner, use Edit profile on your profile page.",
          "## How do I stop someone contacting me?", "Open their profile, tap the three dots, and choose Block. You can also choose who can start a chat with you in Settings, then Privacy and safety, then Chat.",
          "## How do I get my data or delete my account?", "Both are in Settings, then Your account."]);
        if (cfg.supportEmail) h += '<a class="sset" href="mailto:' + esc(cfg.supportEmail) + '">' + ic(I.mail, "si") + '<span class="st"><b>Contact support</b><span>' + esc(cfg.supportEmail) + "</span></span></a>";
        return h; } },
      privpol: { t: "Privacy policy", d: "Last updated " + LEGAL_DATE, body: function () {
        return sText(["## What we collect", "Your email address or sign-in provider, your username and display name, anything you choose to add to your profile, and the orbs, reels, stories, messages, likes and orbits you create. We also store the photos, videos and audio you upload.",
          "## How we use it", "To run Orbi: to show your profile and content, deliver your messages and alerts, keep your account secure, and prevent abuse. We do not sell your personal information.",
          "## What others can see", "Your profile, orbs, reels and stories are visible to other Orbi users. Messages are visible only to you and the person you message. Orbi does not currently use end-to-end encryption, so do not share secrets in chats.",
          "## Where it is stored", "Your data is stored with our hosting provider, Supabase, and is protected by access rules so people can only change their own content.",
          "## Your choices", "You can edit your profile, delete your orbs, block or mute accounts, download your data, and delete your account in Settings. Deleting your account removes your data.",
          "## Children", "Orbi is not meant for children under 13. If you believe a child has joined, report the account and it will be removed.",
          "## Changes", "We may update this policy and will change the date above when we do."]); } },
      terms: { t: "Terms of service", d: "Last updated " + LEGAL_DATE, body: function () {
        return sText(["## Using Orbi", "You must be at least 13 to use Orbi. You are responsible for your account and for what you post. Keep your password private.",
          "## Your content", "You own what you post. By posting it you let Orbi store and show it to others as part of the service. Only post things you have the right to share, including photos, videos and music.",
          "## Be decent", "Do not harass or threaten people, share illegal content, spam, impersonate others, or try to break or misuse the service. Mark adult or graphic media as sensitive.",
          "## Enforcement", "We may remove content or suspend accounts that break these terms. You can report people and content from their menus.",
          "## No guarantees", "Orbi is provided as it is. We work to keep it running but cannot promise it will always be available or error free.",
          "## Ending your account", "You can delete your account at any time in Settings.",
          "## Changes", "We may update these terms and will change the date above when we do."]); } },
      cookies: { t: "Cookie use", d: "Last updated " + LEGAL_DATE, body: function () {
        return sText(["Orbi does not use advertising or tracking cookies.", "Orbi stores a small amount of data in your browser: your sign-in session, your theme and display choices, and a cache of the app so it opens quickly and works offline. Clearing your browser's site data removes these, and you will need to log in again."]); } },
      about: { t: "About Orbi", d: "A free place for the whole world to share what is happening.", body: function () {
        return sText(["Post an orb. Orbit people you care about. Re-orb things worth sharing. Orbi is free for everyone, everywhere."]) + sInfo("Version", APP_VERSION); } }
    };
    return P[k] || null;
  }
  /* search index for the settings search box */
  var SEARCH_IDX = [
    ["acctinfo", "Account information", "username handle email joined name"], ["password", "Change your password", "password security"], ["archive", "Download an archive of your data", "export download backup data"],
    ["delete", "Delete your account", "deactivate remove close account"], ["sec", "Security", "two-step verification 2fa"], ["sessions", "Apps and sessions", "log out devices sessions"],
    ["connected", "Connected accounts", "google sign in"], ["blocked", "Blocked accounts", "block unblock"], ["muted", "Muted accounts", "mute unmute"], ["words", "Muted words", "hide filter words"],
    ["dmperm", "Chat", "who can message dm direct messages"], ["contentpref", "Content you see and share", "sensitive media nsfw"], ["notifs", "Notifications", "alerts likes badge"],
    ["a11y", "Accessibility", "reduce motion animations"], ["display", "Display", "theme dark mode light text size font"], ["datause", "Data usage", "autoplay data saver video"], ["langs", "Languages", "language english"],
    ["helpcenter", "Help Center", "support faq contact help"], ["chatset", "Chat Settings", "message requests calls media clear"], ["privcenter", "Privacy center", "privacy data rules"], ["privpol", "Privacy policy", "privacy data"], ["terms", "Terms of service", "rules terms"], ["cookies", "Cookie use", "cookies storage"], ["about", "About Orbi", "version"]];
  var ROOT_ITEMS = [
    { k: "account", i: I.user, t: "Your account", d: "See information about your account, download an archive of your data, or delete your account." },
    { k: "security", i: I.lock, t: "Security and account access", d: "Manage your account's security and keep track of your account's usage including apps that you have connected to your account." },
    { k: "privacy", i: I.shield, t: "Privacy and safety", d: "Manage what information you see and share on Orbi." },
    { k: "notifs", i: I.bell, t: "Notifications", d: "Select the kinds of notifications you get about your activities and recommendations." },
    { k: "access", i: I.access, t: "Accessibility, display, and languages", d: "Manage how Orbi content is displayed to you." },
    { k: "resources", i: I.link, t: "Additional resources", d: "Check out other places for helpful information to learn more about Orbi products and services." }];
  S.setQ = "";
  function settingsListHTML() {
    var q = S.setQ.trim().toLowerCase();
    if (!q) return ROOT_ITEMS.map(sRow).join("");
    var hits = SEARCH_IDX.filter(function (x) { return (x[1] + " " + x[2]).toLowerCase().indexOf(q) > -1; });
    if (!hits.length) return '<p class="muted" style="padding:6px 4px">No settings match "' + esc(S.setQ.trim()) + '".</p>';
    return hits.map(function (x) { var pg = pageDef(x[0]); return sRow({ k: x[0], i: I.gear, t: x[1], d: pg ? pg.d : "" }); }).join("");
  }
  function renderSettings() {
    $("#v-settings").innerHTML = '<div class="setp gx"><div class="search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg><label class="sr" for="set-q">Search settings</label>' +
      '<input id="set-q" class="in" type="search" placeholder="Search settings" autocomplete="off" value="' + esc(S.setQ) + '"></div>' +
      '<div id="set-list">' + settingsListHTML() + "</div>" +
      '<div class="setlist"><button class="sset danger" data-act="logout">' + ic(I.out, "si") + '<span class="st"><b>Log out</b></span></button></div>' +
      '<p class="setver">Orbi ' + APP_VERSION + "</p></div>";
  }
  function renderSetPage() {
    var k = S.params && S.params.k, pg = pageDef(k);
    if (!pg) { return show("settings"); }
    $("#v-setpage").innerHTML = '<div class="setp gx"><p class="setd">' + esc(pg.d || "") + "</p>" + (pg.items ? '<div class="setlist">' + pg.items.map(sRow).join("") + "</div>" : "") + '<div id="sp-body">' + (pg.body ? pg.body() : "") + "</div></div>";
    if (pg.after) pg.after();
  }
  function setTitle() {
    if (S.view === "settings") return "Settings";
    var pg = pageDef(S.params && S.params.k); return pg ? pg.t : "Settings";
  }

  /* ----- password ----- */
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
    S.recovery = false; toast("Password updated.");
    if (S.hist.length) back(); else show("settings");
  }

  /* ----- username and email ----- */
  function usernameSheet() {
    openSheet('<p class="sh-title">Change username</p><p class="sh-desc">3 to 15 letters, numbers, dots or underscores.</p>' +
      '<div class="sh-pad"><label class="sr" for="un-in">Username</label><input id="un-in" class="in" maxlength="15" value="' + esc(S.profile.handle) + '" autocomplete="off" autocapitalize="none" spellcheck="false"><p class="errl" id="un-err" role="alert"></p></div>' +
      '<div class="sh-pad nickbtns"><button class="btn fill" data-act="usersave">Save</button></div>', { label: "Change username" });
  }
  async function saveUsername() {
    var v = $("#un-in").value.trim().replace(/^@/, "").toLowerCase(), err = $("#un-err");
    if (!/^[a-z0-9_.]{3,15}$/.test(v)) { err.textContent = "Use 3 to 15 letters, numbers, dots or underscores."; return; }
    if (v === S.profile.handle) return closeSheet();
    try {
      var row = await saveProfileRow({ handle: v });
      S.profile = row; if (S.me) S.me.handle = v;
      closeSheet(); toast("Username changed."); renderTop(); renderSetPage();
    } catch (e) { err.textContent = (e && (e.code === "23505" || /duplicate|unique/i.test(e.message || ""))) ? "That username is taken." : niceErr(e); }
  }
  function emailSheet() {
    openSheet('<p class="sh-title">Change email</p><p class="sh-desc">We will send a confirmation link. Your email changes after you confirm it.</p>' +
      '<div class="sh-pad"><label class="sr" for="em-in">New email</label><input id="em-in" class="in" type="email" placeholder="you@example.com" autocomplete="email" autocapitalize="none"><p class="errl" id="em-err" role="alert"></p></div>' +
      '<div class="sh-pad nickbtns"><button class="btn fill" data-act="emailsave">Send confirmation</button></div>', { label: "Change email" });
  }
  async function saveEmail() {
    var v = $("#em-in").value.trim(), err = $("#em-err");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { err.textContent = "Enter a valid email address."; return; }
    var r = await sb.auth.updateUser({ email: v });
    if (r.error) { err.textContent = niceErr(r.error); return; }
    closeSheet(); toast("Check your inbox to confirm the new email.");
  }

  /* ----- blocked / muted lists and muted words ----- */
  async function loadAccountList(table) {
    var me = S.user.id, col = table === "blocks" ? "blocked_id" : "muted_id", own = table === "blocks" ? "blocker_id" : "muter_id";
    var r = await sb.from(table).select(col).eq(own, me);
    var ids = (r.data || []).map(function (x) { return x[col]; });
    var rows = [];
    if (ids.length) { var p = await sb.from("profile_cards").select("id,handle,display_name,avatar_url").in("id", ids); rows = p.data || []; }
    var el = $("#sp-list"); if (!el || !S.params || S.params.k !== (table === "blocks" ? "blocked" : "muted")) return;
    el.className = "";
    el.innerHTML = rows.length ? rows.map(function (p) {
      return '<div class="trow">' + avInner(p.display_name, p.avatar_url, 44) + '<div class="pi"><b>' + esc(p.display_name) + '</b><span class="tprev">@' + esc(p.handle) + '</span></div><button class="btn sm" data-act="' + (table === "blocks" ? "unblock" : "unmute") + '" data-id="' + p.id + '">' + (table === "blocks" ? "Unblock" : "Unmute") + "</button></div>";
    }).join("") : '<div class="empty"><b>' + (table === "blocks" ? "No blocked accounts" : "No muted accounts") + "</b>" + (table === "blocks" ? "People you block will show up here." : "People you mute will show up here.") + "</div>";
  }
  function wordListHTML() {
    return PREFS.words.length ? PREFS.words.map(function (w, i) { return '<div class="trow wordrow"><div class="pi"><b>' + esc(w) + '</b></div><button class="btn sm" data-act="wordrm" data-i="' + i + '" aria-label="Remove ' + esc(w) + '">Remove</button></div>'; }).join("") : '<div class="empty"><b>No muted words</b>Add a word to hide orbs that contain it.</div>';
  }
  function addWord() {
    var inp = $("#word-in"), w = inp.value.trim().toLowerCase().slice(0, 30);
    if (!w) return;
    if (PREFS.words.indexOf(w) > -1) { inp.value = ""; return toast("You already muted that word."); }
    if (PREFS.words.length >= 50) return toast("You can mute up to 50 words.");
    setPref({ words: PREFS.words.concat([w]) }); inp.value = ""; purgeLists(); $("#word-list").innerHTML = wordListHTML(); toast("Muted \"" + w + "\".");
  }

  /* ----- archive and deletion ----- */
  async function downloadArchive() {
    var btn = $("#arch-btn"), msg = $("#arch-msg"), me = S.user.id; btn.classList.add("busy"); msg.textContent = "Gathering your data…";
    function q(t, cols, col, v) { return sb.from(t).select(cols).eq(col, v).limit(5000).then(function (r) { return r.data || []; }, function () { return []; }); }
    var res = await Promise.all([q("orbs", "*", "author_id", me), q("reels", "*", "author_id", me), q("orbits", "following_id,created_at", "follower_id", me), q("orbits", "follower_id,created_at", "following_id", me),
      q("likes", "orb_id,created_at", "user_id", me), q("bookmarks", "orb_id,created_at", "user_id", me), q("reorbs", "orb_id,created_at", "user_id", me),
      q("messages", "id,sender_id,recipient_id,body,media_url,created_at", "sender_id", me), q("messages", "id,sender_id,recipient_id,body,media_url,created_at", "recipient_id", me),
      q("blocks", "blocked_id,created_at", "blocker_id", me), q("mutes", "muted_id,created_at", "muter_id", me)]);
    var msgs = {}; res[7].concat(res[8]).forEach(function (m) { msgs[m.id] = m; });
    var data = { exported_at: new Date().toISOString(), app: "Orbi " + APP_VERSION, account: { id: me, email: S.user.email || null, username: S.profile.handle, display_name: S.profile.display_name, bio: S.profile.bio, location: S.profile.location, website: S.profile.website, joined: S.profile.created_at },
      orbs: res[0], reels: res[1], orbiting: res[2], orbiters: res[3], likes: res[4], bookmarks: res[5], reorbs: res[6],
      messages: Object.keys(msgs).map(function (k) { return msgs[k]; }).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; }),
      blocked_accounts: res[9], muted_accounts: res[10], settings: Object.assign({}, PREFS, { who_can_message: DMPERM }) };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "orbi-archive-" + S.profile.handle + ".json"; document.body.appendChild(a); a.click();
    setTimeout(function () { a.remove(); URL.revokeObjectURL(a.href); }, 1500);
    btn.classList.remove("busy"); msg.textContent = "Done. Your file was saved to this device.";
  }
  async function deleteAccount() {
    var btn = $("#del-btn"), msg = $("#del-msg");
    if ($("#del-in").value.trim().replace(/^@/, "").toLowerCase() !== S.profile.handle) { msg.textContent = "Type your username exactly to confirm."; return; }
    var ok = await confirmSheet("Delete your account for good?", "Everything on your account will be removed. This cannot be undone.", "Delete my account", true);
    if (!ok) return;
    btn.classList.add("busy"); msg.textContent = "";
    try {
      var l = await sb.storage.from("media").list(S.user.id, { limit: 1000 });
      var names = (l && l.data || []).map(function (f) { return S.user.id + "/" + f.name; });
      if (names.length) await sb.storage.from("media").remove(names);
    } catch (e) {}
    var r;
    try { r = await sb.functions.invoke("delete-account", { method: "POST" }); } catch (e) { r = { error: e }; }
    if (r.error || (r.data && r.data.error)) { btn.classList.remove("busy"); msg.textContent = "We could not delete your account just now. Check your connection and try again."; return; }
    try { localStorage.removeItem(prefKey()); localStorage.removeItem(prefKey() + "-dm"); } catch (e) {}
    try { await sb.auth.signOut({ scope: "local" }); } catch (e) {}
    mode = "login"; aview = "email"; goAuth(); toast("Your account was deleted.");
  }

  /* ---------- Help Center, Privacy center, Chat settings (the X way) ---------- */
  I.checks = '<path d="M2.5 13l4 4 8-9.5"/><path d="M12 15.5l1.5 1.5L22 7.5"/>';
  S.hc = { tab: "contact", topic: null, sent: false, q: "" };
  var HC_TOPICS = [
    { id: "locked", t: "Locked and suspended account issues", d: "Next steps for accounts that have been flagged for potential violations.", c: "#7b83eb", i: I.people, opts: ["My account was suspended", "My account is locked", "I think a decision about my account was a mistake", "Something else"] },
    { id: "safety", t: "Staying safe on Orbi and sensitive content", d: "Report harassment and threats from other accounts, and orbs that may break our rules.", c: "#1d9bf0", i: I.shield, opts: ["I want to report harassment or threats", "I want to report spam", "I want to report sensitive content that is not marked", "Something else"] },
    { id: "access", t: "Problems with account access", d: "Get help logging in to Orbi, or with changing or recovering an account.", c: "#17a673", i: I.user, opts: ["I can't log in", "I forgot my password", "I can't change my email or username", "Something else"] },
    { id: "auth", t: "Authenticity on Orbi", d: "Report impersonation of a person or brand, and fake accounts or spam.", c: "#e8b400", i: I.star, opts: ["Someone is pretending to be me", "Someone is pretending to be a brand or another person", "I want to report a fake account or spam"] },
    { id: "privacy", t: "Privacy on Orbi", d: "Get answers about your account and our privacy policies, and request your Orbi information.", c: "#ff8a6b", i: I.eye, privacy: true },
    { id: "ip", t: "Help with intellectual property issues", d: "Report trademark and copyright infringement.", c: "#e0457b", i: I.doc, opts: ["Copyright infringement", "Trademark infringement", "Something else"] }];
  var HC_PRIVACY = ["I am requesting my Orbi account information", "I want to ask a question about privacy on Orbi", "I want to request deletion of my data", "I want to report content that violates my privacy rights"];
  function hcTopicsHTML() {
    var q = (S.hc.q || "").trim().toLowerCase();
    var l = HC_TOPICS.filter(function (t) { return !q || (t.t + " " + t.d).toLowerCase().indexOf(q) > -1; });
    return l.length ? l.map(function (t) {
      return '<button class="hct" data-act="hctopic" data-t="' + t.id + '"><span class="hci" style="--c:' + t.c + '">' + ic(t.i) + '</span><span class="st"><b>' + esc(t.t) + "</b><span>" + esc(t.d) + "</span></span></button>";
    }).join("") : '<p class="muted" style="padding:8px 4px">No topics match "' + esc(S.hc.q.trim()) + '".</p>';
  }
  function faqHTML() {
    return sText(["## What are orbs and orbits?", "An orb is a post. To orbit someone is to follow them. A re-orb shares someone's orb with your own orbiters.",
      "## How do I change my username or photo?", "Open Settings, then Your account, then Account information. For your photo, bio and banner, use Edit profile on your profile page.",
      "## How do I stop someone contacting me?", "Open their profile, tap the three dots, and choose Block. You can also choose who can start a chat with you in Chat settings.",
      "## How do I get my data or delete my account?", "Both are in Settings, then Your account."]);
  }
  function hcFormHTML(title, opts, topic) {
    if (S.hc.sent) return '<div class="hcdone">' + ic(I.check) + "<b>Thanks. We got your request.</b><span>It is saved with your account so we can follow up.</span><button class=\"btn sm\" data-act=\"hcagain\">Send another</button></div>";
    return '<h2 class="hch">' + esc(title) + '</h2><form id="hc-form" autocomplete="off"><label for="hc-sel">How can we help? (required)</label><select id="hc-sel" class="in" data-topic="' + esc(topic) + '"><option value=""></option>' +
      opts.map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + '</select><label for="hc-msg">Tell us more (required)</label><textarea id="hc-msg" class="in" rows="5" maxlength="2000" placeholder="Describe what is going on"></textarea>' +
      '<button class="btn fill" id="hc-send" type="submit" disabled>Submit</button></form>';
  }
  function hcBody() {
    var h = S.hc, t = HC_TOPICS.filter(function (x) { return x.id === h.topic; })[0], c;
    var tabs = '<div class="hctabs" role="tablist"><button role="tab" data-act="hctab" data-t="contact" aria-selected="' + (h.tab === "contact") + '">Contact us</button><button role="tab" data-act="hctab" data-t="privacy" aria-selected="' + (h.tab === "privacy") + '">Privacy</button></div>';
    if (h.tab === "privacy") c = hcFormHTML("Orbi privacy policy inquiries", HC_PRIVACY, "Privacy");
    else if (t && !t.privacy) c = '<button class="hcback" data-act="hcback">' + ic(I.back) + "All topics</button>" + hcFormHTML(t.t, t.opts, t.t);
    else c = '<div class="hchero"><small>Contact us</small><h2>We can help.</h2><div class="search"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.5-4.5"/></svg><label class="sr" for="hc-q">Search topics</label><input id="hc-q" class="in" type="search" placeholder="Search" value="' + esc(h.q) + '" autocomplete="off"></div></div><h2 class="hch">Select a topic</h2><p class="setd">Select the topic that best describes your issue, then you\'ll fill out a form with your specific details.</p><div id="hc-topics">' + hcTopicsHTML() + "</div>";
    return '<details class="hcarts"><summary>Helpful articles' + ic(I.down) + "</summary>" + faqHTML() + "</details>" + tabs + '<div class="hcbody">' + c + "</div>" + legalFoot();
  }
  function legalFoot() {
    return '<div class="legalfoot"><span>© 2026 Orbi</span><button data-act="setgo" data-k="cookies">Cookies</button><button data-act="setgo" data-k="privpol">Privacy</button><button data-act="setgo" data-k="terms">Terms and conditions</button></div>';
  }
  function hcRefresh() { var el = $("#sp-body"); if (el && S.view === "setpage") el.innerHTML = hcBody(); }
  function hcCheck() { var b = $("#hc-send"); if (b) b.disabled = !($("#hc-sel").value && $("#hc-msg").value.trim()); }
  async function hcSubmit() {
    var sel = $("#hc-sel"), msg = $("#hc-msg"), b = $("#hc-send"); if (!sel.value || !msg.value.trim()) return;
    b.disabled = true; b.textContent = "Sending…";
    var r = await sb.from("support_requests").insert({ user_id: S.user.id, topic: sel.dataset.topic, subject: sel.value, message: msg.value.trim().slice(0, 2000) });
    if (r.error) { toast(niceErr(r.error)); b.disabled = false; b.textContent = "Submit"; return; }
    S.hc.sent = true; hcRefresh();
  }
  function pcItem(t, d, k) { return '<div class="pcitem"><b>' + esc(t) + "</b><p>" + esc(d) + '</p><button class="pclink" data-act="setgo" data-k="' + k + '">Learn more</button></div>'; }
  function privCenterBody() {
    return '<div class="pchero"><h2>Everything you need to know about privacy on Orbi</h2><p class="lead">We want you to know how to make your Orbi experience better, and more secure. So whether it\'s new settings and controls or security updates, you\'ll find it all here.</p><p>We\'re no strangers to long privacy policies and complex rules, and we know how frustrating they can be to read. So we\'ll do our best to talk about it all like actual human beings.</p></div>' +
      '<div class="pcsec"><h2>Your privacy on Orbi</h2><i class="pcbar"></i><p>You have more control over your Orbi experience than you might think. We want you to know what data we collect, how we use it, when we share it, and what we do to protect it.</p></div>' +
      '<div class="pcsec"><h2>Our rules and policies related to privacy and data</h2><p>Complicated or not, this stuff is important, so here\'s a quick list of things to know.</p>' +
      pcItem("Terms of Service", "Explains the rules of the Orbi road: what you can do and what we can do.", "terms") +
      pcItem("Privacy Policy", "Helps you understand the data we collect, how it's used, and when it's shared so you can make the best decisions about the information you share with us.", "privpol") +
      pcItem("More about data collection", "Explains what Orbi stores in your browser, and how we keep it to a minimum.", "cookies") +
      pcItem("Help Center", "Additional privacy and security resources that will help you better understand how to use Orbi.", "helpcenter") +
      pcItem("Our partners", "Info about the companies that help us bring Orbi to you.", "partners") + "</div>" +
      '<div class="pcsec pcset"><h2>Orbi Settings</h2><i class="pcbar"></i><p>We know this stuff can feel overwhelming, so we made one place to manage your privacy, notifications, display and more.</p><button class="btn fill" data-act="settings">Learn more</button></div>' + legalFoot();
  }
  function linkRow(t, k, act) { return '<button class="sset lnk" data-act="' + (act || "setgo") + '" data-k="' + k + '"' + (act ? ' data-t="privacy"' : "") + '><span class="st"><b>' + esc(t) + "</b></span></button>"; }
  function privLearnHTML() {
    return '<h3 class="sgh">Learn more about privacy on Orbi</h3>' + linkRow("Privacy center", "privcenter") + linkRow("Privacy policy", "privpol") + linkRow("Contact us", "helpcenter", "hcopen");
  }
  function chatSetBody() {
    var radios = [["nobody", "No one"], ["following", "People you orbit"], ["everyone", "Everyone"]].map(function (x) {
      return '<button class="sset rad rc" role="radio" aria-checked="' + (DMPERM === x[0]) + '" data-act="setdm" data-v="' + x[0] + '"><span class="st"><b>' + x[1] + "</b></span>" + ic(I.check, "tick") + "</button>"; }).join("");
    function chk(label, on, dis, key) { return '<label class="sset tog chkr' + (dis ? " off" : "") + '"><span class="st"><b>' + label + '</b></span><input type="checkbox" class="cbx"' + (key ? ' data-pref="' + key + '"' : "") + (on ? " checked" : "") + (dis ? " disabled" : "") + "></label>"; }
    return '<h3 class="sgh">Allow message requests from:</h3><p class="sgd">People you have already messaged can always reply.</p>' + radios +
      '<div class="sdiv"></div>' + sTog("callsOn", "Enable audio and video calling", "Calls are coming to Orbi soon. Turn this on to be ready when they arrive.") +
      '<h3 class="sgh">Allow audio and video calls from:</h3><p class="sgd">To reduce unwanted calls, people need to have messaged you at least once before they can call you.</p>' +
      chk("People you orbit", true, true) + chk("Everyone", PREFS.callsAll, false, "callsAll") +
      sTog("relayCalls", "Always relay calls", "Hides your IP address from the person you call. Takes effect when calls arrive.") +
      '<h3 class="sgh">Data usage</h3>' + sRow({ k: "datause", i: I.install, t: "Autoplay and data saver", d: "Choose how Orbi uses your network data." }) +
      '<h3 class="sgh">Storage</h3><button class="sset lnk red" data-act="clearmedia"><span class="st"><b>Clear media</b><span>Removes photos and videos Orbi saved on this device so they load again. Nothing is deleted from your account.</span></span></button>';
  }
  async function clearMedia() {
    try { var ks = await caches.keys(); await Promise.all(ks.filter(function (k) { return k.indexOf("orbi-shell") !== 0; }).map(function (k) { return caches.delete(k); })); } catch (e) {}
    toast("Saved media cleared.");
  }
  async function markAllRead() {
    var ids = S.chatThreads.filter(function (t) { return !isRequest(t) && Number(t.unread_count) > 0; }).map(function (t) { return t.other_id; });
    if (!ids.length) return toast("Nothing to mark as read.");
    var r = await sb.from("messages").update({ read_at: new Date().toISOString() }).eq("recipient_id", S.user.id).in("sender_id", ids).is("read_at", null);
    if (r.error) return toast(niceErr(r.error));
    toast("All chats marked as read."); await loadChat(true); loadUnread();
  }

  /* ---------- "Install Orbi" banner at the top of the page ---------- */
  (function () {
    var KEY = "orbi-install-dismiss", WAIT = 24 * 3600 * 1000, bar = null, evt = null;
    var ua = navigator.userAgent || "";
    var IOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    function standalone() {
      try { return (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true; } catch (e) { return false; }
    }
    function dismissed() { try { var t = +localStorage.getItem(KEY) || 0; return t && Date.now() - t < WAIT; } catch (e) { return false; } }
    function remember() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} }
    function hide() { if (bar) { bar.classList.remove("on"); var b = bar; bar = null; setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 260); } }
    var APPICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="12" cy="3.2" r="1.7"/><circle cx="17.5" cy="5.6" r="1.6"/><circle cx="20.8" cy="12" r="1.6"/><circle cx="17.5" cy="18.4" r="1.5"/><circle cx="12" cy="20.8" r="1.5"/><circle cx="6.5" cy="18.4" r="1.4"/><circle cx="3.2" cy="12" r="1.4"/><circle cx="6.5" cy="5.6" r="1.3"/></g></svg>';
    function show() {
      if (bar || standalone() || dismissed()) return;
      if (!evt && !IOS) return;
      bar = document.createElement("div"); bar.className = "inst"; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Install Orbi");
      bar.innerHTML = '<div class="inst-in"><span class="inst-ic">' + APPICON + '</span><div class="inst-tx"><b>Install Orbi</b><span>Add it to your home screen for the full app.</span></div>' +
        '<button class="inst-go" type="button" data-inst="go">Install</button><button class="inst-x" type="button" data-inst="x" aria-label="Not now">' + ic(I.close) + "</button></div>";
      document.body.appendChild(bar);
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (bar) bar.classList.add("on"); }); });
    }
    function iosSteps() {
      if (!bar) return;
      var tx = $(".inst-tx", bar);
      tx.innerHTML = "<b>Add Orbi to your home screen</b><span>Tap the Share button in your browser, then choose <em>Add to Home Screen</em>.</span>";
      var go = $(".inst-go", bar); go.textContent = "Got it"; go.dataset.inst = "done";
    }
    async function install() {
      if (evt) {
        var e = evt; evt = null;
        try {
          e.prompt(); var r = await e.userChoice;
          if (r && r.outcome === "accepted") { hide(); return; }
        } catch (x) {}
        remember(); hide(); return;
      }
      if (IOS) iosSteps();
    }
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-inst]"); if (!b) return;
      var k = b.dataset.inst;
      if (k === "go") install();
      else if (k === "x" || k === "done") { remember(); hide(); }
    });
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); evt = e; show(); });
    if (window.__bip) { evt = window.__bip; }
    window.addEventListener("appinstalled", function () { remember(); evt = null; hide(); toast("Orbi is installed."); });
    function boot() { if (evt || IOS) setTimeout(show, 900); }
    if (document.readyState === "complete") boot(); else window.addEventListener("load", boot);
  })();


  /* ---------- layers (close the top-most thing first) and the phone's back button ---------- */
  function topLayer() {
    if (!$("#lightbox").hidden) return "lightbox";
    if (!$("#sheet").hidden) return "sheet";
    if (!$("#story").hidden) return "story";
    if (!$("#creator").hidden) return "creator";
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
    else if (l === "creator") exitCreator();
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
  function refreshSettingsView() { if (S.view === "settings") renderSettings(); else if (S.view === "setpage") renderSetPage(); }
  document.addEventListener("click", function (e) {
    if (Date.now() - (S.held || 0) < 700 && e.target.closest("[data-hold]")) { e.preventDefault(); return; }
    var sh = e.target.closest("[data-sheet]");
    if (sh) { var pick = sheetPick, id = sh.dataset.sheet; sheetPick = null; closeSheet(); if (pick) pick(id || null); return; }
    if ($("#app").hidden) return;
    var tg = e.target.closest("[data-theme-set]");
    if (tg) { setTheme(tg.dataset.themeSet); refreshSettingsView(); renderTop(); return; }
    var fz = e.target.closest("[data-fs-set]");
    if (fz) { setPref({ fs: fz.dataset.fsSet }); refreshSettingsView(); return; }
    var b = e.target.closest("[data-act]");
    if (!b) {
      var art = e.target.closest(".post:not(.focus)");
      if (art && !e.target.closest("a,button,video,input,textarea,.poll,.qcard,.mg,.mv,.cover") && !(window.getSelection && String(window.getSelection()).length)) openPost(art.dataset.id);
      return;
    }
    var act = b.dataset.act, p, r;
    switch (act) {
      case "link": return; /* let the browser open it */
      case "theme": setTheme(effectiveDark() ? "light" : "dark"); renderTop(); refreshSettingsView(); break;
      case "top": if (S.view === "home") { loadHome(true); loadTray(); } $("#content").scrollTop = 0; break;
      case "back": back(); break;
      case "menu": openDrawer(); break;
      case "drawerclose": closeDrawer(); break;
      case "drawergo": drawerGo(b.dataset.go); break;
      case "drawertheme": setTheme(effectiveDark() ? "light" : "dark"); renderDrawer(); refreshSettingsView(); { var ds = $("#dthsw"); if (ds) ds.focus(); } break;
      case "sheetclose": closeSheet(); break;
      case "lbclose": closeLightbox(); break;
      case "modalclose": cancelModal(); break;

      /* writing */
      case "create": openCompose(); break;
      case "closecompose": closeCompose(false); break;
      case "cmpdrafts": openDrafts(); break;
      case "cmpaud": actionSheet([{ id: "e", label: "Everyone", sub: "Anyone on Orbi can see this orb" }, { id: "c", label: "Orbit circle", sub: "Coming soon" }], "Choose audience").then(function (r) { if (r === "c") toast("Orbit circle is coming soon."); }); break;
      case "cmprep": actionSheet([{ id: "e", label: "Everyone", sub: "Everyone can reply" }, { id: "f", label: "Accounts you orbit", sub: "Coming soon" }, { id: "m", label: "Only accounts you mention", sub: "Coming soon" }], "Who can reply?", "Choose who can reply to this orb. Accounts you mention can always reply.").then(function (r) { if (r === "f" || r === "m") toast("Reply limits are coming soon."); }); break;
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

      /* stories */
      case "addstory": openCreator("story"); break;
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
      case "reelnew": openCreator("reel"); break;
      case "rlike": r = reelOf(b); if (r) toggleReelRel("reel_likes", r, "liked_by_me", "like_count"); break;
      case "rreorb": r = reelOf(b); if (r) toggleReelRel("reel_reorbs", r, "reorbed_by_me", "reorb_count"); break;
      case "rsave": r = reelOf(b); if (r) toggleReelRel("reel_saves", r, "saved_by_me", null); break;
      case "rcomment": r = reelOf(b); if (r) openReelComments(r); break;
      case "rshare": r = reelOf(b); if (r) { pauseReels(); reelShare(r); } break;
      case "rmore": r = reelOf(b); if (r) reelMore(r); break;
      case "rfollow": r = reelOf(b); if (r) toggleOrbit(r.author_id); break;
      case "rcap": b.classList.toggle("open"); break;
      case "reelfeed": reelFeedMenu(b); break;
      case "reelfriends": setReelFeed(S.reelFeed === "friends" ? "foryou" : "friends"); break;
      case "reeltune": go("setpage", { k: "reelprefs" }); break;
      case "rsnackundo": { var ur = findReel(b.dataset.id); if (ur && ur.reorbed_by_me) toggleReelRel("reel_reorbs", ur, "reorbed_by_me", "reorb_count"); var sn_ = $("#rsnack"); if (sn_) sn_.classList.remove("on"); break; }
      case "shsel": shToggle(b); break;
      case "shsend": shSend(); break;
      case "shstory": shAction("story"); break;
      case "shcopy": shAction("copy"); break;
      case "shwa": shAction("wa"); break;
      case "shdl": shAction("dl"); break;
      case "shnative": shAction("native"); break;
      case "reelreset": lsSet("orbi-rhide-", []); lsSet("orbi-rint-", []); toast("Suggested reels reset."); renderSetPage(); break;
      case "reelgrid": { var list = S.view === "bookmarks" ? S.bm.reels : (S.pf && S.pf.lists.reels) || []; openReels(list, +b.dataset.i); break; }
      case "rupick": ruPick(); break;
      case "rucam": ruPick(true); break;
      case "runext": ruSetCap(); RU.step = "share"; renderReelUpload(); break;
      case "rushareback": ruSetCap(); if (RU.ov2) { cancelModal(); break; } RU.step = "edit"; renderReelUpload(); break;
      case "rutext": ruTextOpen(-1); break;
      case "tedone": ruTextDone(false); break;
      case "tedel": ruTextDone(true); break;
      case "tedfont": RU.ted.f = b.dataset.f; tedStyle(); break;
      case "tedcol": RU.ted.c = b.dataset.c; tedStyle(); break;
      case "ruback": { var keep = RU.sound; if (RU.sync) RU.sync.stop(); if (RU.url) { try { URL.revokeObjectURL(RU.url); } catch (x) {} } RU.blob = null; RU.url = ""; RU.sound = keep; renderReelUpload(); break; }
      case "rushare": ruShare(); break;
      case "cmtdel": sb.from("reel_comments").delete().eq("id", b.dataset.id).then(function (res) { if (res.error) toast(niceErr(res.error)); else loadReelComments(); }); break;
      case "sendto": sendTo(b.dataset.id, b.dataset.name); break;

      /* chat and account */
      case "newchat": go("newchat"); break;
      case "newchatq": S.ncPre = S.chatQ; go("newchat"); break;
      case "openthread": openThread(b.dataset.id); break;
      case "openrequests": go("requests"); break;
      case "reqaccept": acceptRequest(); break;
      case "reqdelete": if (S.thread) deleteConversation(S.thread.id, false); break;
      case "reqblock": toggleBlockMessages(); break;
      case "chatfilter": chatFilterMenu(b); break;
      case "chatinfo": go("chatinfo"); break;
      case "chatmedia": S.cm.tab = "media"; go("chatmedia"); break;
      case "cmtab": S.cm.tab = b.dataset.t; renderChatMedia(false); break;
      case "callsoon": toast("Voice and video calls are coming soon to Orbi."); break;
      case "viewprof": if (S.thread) openUser(S.thread.id); break;
      case "threadmore": popMenu([{ id: "info", icon: I.info, label: "Conversation info" }, { id: "search", icon: I.search, label: "Search" }], { anchor: b }).then(function (id) { if (id === "info") go("chatinfo"); else if (id === "search") openThreadSearch(); }); break;
      case "convomore": convoMenu(b); break;
      case "tsearchoff": closeThreadSearch(); break;
      case "tplus": sendPhoto(); break;
      case "tmic": startRec(); break;
      case "recx": stopRec(false); break;
      case "recsend": stopRec(true); break;
      case "vplay": toggleVoice(b); break;
      case "mimg": openLightbox([b.dataset.url], 0); break;
      case "msgmenu": msgMenu(b.dataset.id); break;
      case "mreact": closeSheet(); reactTo(S.menuMsg, b.dataset.e); break;
      case "mchip": reactTo(b.dataset.id, b.dataset.e); break;
      case "mreply": { var mm = findMsg(S.menuMsg); closeSheet(); if (mm) { S.replyTo = mm; syncComposer(); $("#thread-in").focus(); } break; }
      case "mcopy": { var mc = findMsg(S.menuMsg); closeSheet(); if (mc) copyText(mc.body).then(function (ok) { toast(ok ? "Copied." : "Could not copy."); }); break; }
      case "munsend": { var mid = S.menuMsg; closeSheet(); unsend(mid); break; }
      case "mreport": closeSheet(); if (S.thread) reportSheet("conversation", S.thread.id, null, "Report message"); break;
      case "replyoff": S.replyTo = null; syncComposer(); break;
      case "unblockthread": toggleBlockMessages(); break;
      case "disappear": disappearMenu(); break;
      case "nickedit": if (S.thread) nickSheet(); break;
      case "nicksave": saveNick($("#nick-in").value); break;
      case "nickclear": saveNick(""); break;
      case "logout": logout(); break;
      case "xtab": xSetTab(b.dataset.t); break;
      case "xmore": e.stopPropagation(); xMore(b.dataset.tag); break;
      case "xback": xBack(); break;
      case "setgo": if (b.dataset.k === "helpcenter") S.hc = { tab: "contact", topic: null, sent: false, q: "" }; go("setpage", { k: b.dataset.k }); break;
      case "hcopen": S.hc = { tab: b.dataset.t || "contact", topic: null, sent: false, q: "" }; go("setpage", { k: "helpcenter" }); break;
      case "hctab": S.hc.tab = b.dataset.t; S.hc.topic = null; S.hc.sent = false; hcRefresh(); break;
      case "hctopic": { var tp = HC_TOPICS.filter(function (x) { return x.id === b.dataset.t; })[0]; if (tp && tp.privacy) S.hc.tab = "privacy"; else S.hc.topic = b.dataset.t; S.hc.sent = false; hcRefresh(); $("#content").scrollTop = 0; break; }
      case "hcback": S.hc.topic = null; S.hc.sent = false; hcRefresh(); break;
      case "hcagain": S.hc.sent = false; hcRefresh(); break;
      case "clearmedia": clearMedia(); break;
      case "editusername": usernameSheet(); break;
      case "usersave": saveUsername(); break;
      case "editemail": emailSheet(); break;
      case "emailsave": saveEmail(); break;
      case "archive": downloadArchive(); break;
      case "deleteacct": deleteAccount(); break;
      case "setdm": setPref({}, b.dataset.v); renderSetPage(); break;
      case "unblock": unblockUser(b.dataset.id).then(function (ok) { if (ok) { resetFeeds(); toast("Unblocked."); loadAccountList("blocks"); } }); break;
      case "unmute": unmuteUser(b.dataset.id).then(function (ok) { if (ok) { resetFeeds(); toast("Unmuted."); loadAccountList("mutes"); } }); break;
      case "wordrm": setPref({ words: PREFS.words.filter(function (w, i) { return i !== +b.dataset.i; }) }); resetFeeds(); $("#word-list").innerHTML = wordListHTML(); break;
      case "pwsave": savePassword(); break;
      case "endall": sb.auth.signOut({ scope: "others" }).then(function (res) { toast(res.error ? niceErr(res.error) : "Logged out of all other devices."); }); break;
      case "install": if (S.installEvt) { S.installEvt.prompt(); S.installEvt.userChoice.then(function () { S.installEvt = null; refreshSettingsView(); }); } break;
    }
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id === "cmt-form") { e.preventDefault(); postReelComment(); }
    if (e.target.id === "word-form") { e.preventDefault(); addWord(); }
    if (e.target.id === "hc-form") { e.preventDefault(); hcSubmit(); }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id === "cmt-in") { var s = $("#cmt-send"); if (s) s.disabled = !e.target.value.trim(); }
    if (e.target.id === "hc-q") { S.hc.q = e.target.value; $("#hc-topics").innerHTML = hcTopicsHTML(); }
    if (e.target.id === "hc-msg") hcCheck();
    if (e.target.id === "set-q") { S.setQ = e.target.value; $("#set-list").innerHTML = settingsListHTML(); }
    if (e.target.id === "del-in") { var db = $("#del-btn"); if (db) db.disabled = e.target.value.trim().replace(/^@/, "").toLowerCase() !== S.profile.handle; }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "hc-sel") hcCheck();
    var t = e.target, k = t.dataset && t.dataset.pref; if (!k) return;
    setPref((function () { var o = {}; o[k] = !!t.checked; return o; })());
    if (k.charAt(0) === "n" && k !== "nothing") loadUnread();
    if (k === "autoplay" || k === "dataSaver") { if (!PREFS.autoplay || PREFS.dataSaver) $$("video[data-auto]").forEach(function (v) { v.pause(); }); }
  });
  function noteTap(b) {
    var t = b.dataset.type;
    if (t === "orbit") { if (b.dataset.uid) openUser(b.dataset.uid); }
    else if (b.dataset.reel) openReelById(b.dataset.reel);
    else if (b.dataset.orb) openPost(b.dataset.orb);
  }
  async function userMore() {
    var u = S.pf && S.pf.profile; if (!u) return;
    var items = [{ id: "copy", icon: I.link, label: "Copy profile link" }, { id: "msg", icon: I.chat, label: "Send a message" },
      { id: "mute", icon: I.bellOff, label: (S.muted[u.id] ? "Unmute @" : "Mute @") + u.handle },
      { id: "block", icon: I.block, label: (S.blocked[u.id] ? "Unblock @" : "Block @") + u.handle, danger: true },
      { id: "report", icon: I.flag, label: "Report @" + u.handle, danger: true }];
    var id = await actionSheet(items, "@" + u.handle);
    if (id === "copy") copyText(link("u/" + u.handle)).then(function (ok) { toast(ok ? "Link copied." : "Could not copy the link."); });
    else if (id === "msg") openThread(u.id);
    else if (id === "mute") {
      if (S.muted[u.id]) { if (await unmuteUser(u.id)) { resetFeeds(); toast("Unmuted @" + u.handle + "."); } }
      else if (await muteUser(u)) toast("Muted @" + u.handle + ". You won't see their orbs.");
    } else if (id === "block") {
      if (S.blocked[u.id]) { if (await unblockUser(u.id)) { resetFeeds(); toast("Unblocked @" + u.handle + "."); } }
      else if (await confirmSheet("Block @" + u.handle + "?", "They won't be able to message you, you'll stop seeing their orbs, and you'll stop orbiting them.", "Block", true)) { if (await blockUser(u)) { toast("Blocked @" + u.handle + "."); if (S.pf && S.pf.profile) { S.pf.profile.followed_by_me = false; renderProfile(); } } }
    } else if (id === "report") reportSheet("user", u.id, null, "Report @" + u.handle);
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); S.installEvt = e; if (S.user) refreshSettingsView(); });

  /* ---------- go ---------- */
  if ("serviceWorker" in navigator && /^https:$|^http:$/.test(location.protocol) && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  boot();
})();

