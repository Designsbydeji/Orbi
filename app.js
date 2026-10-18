(function () {
  "use strict";
  var cfg = window.ORBI_CONFIG || {};
  var sb = null;

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function hue(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function av(name, size) { name = name || "?"; return '<span class="av" style="--h:' + hue(name) + ";--s:" + size + 'px" aria-hidden="true">' + esc(name.trim().charAt(0).toUpperCase() || "?") + "</span>"; }
  function ic(path, cls) { return '<svg class="ic ' + (cls || "") + '" viewBox="0 0 24 24" aria-hidden="true">' + path + "</svg>"; }
  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "now";
    if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) return Math.floor(s / 3600) + "h";
    if (s < 604800) return Math.floor(s / 86400) + "d";
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
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
    return m || "Something went wrong. Try again.";
  }
  var toastTimer;
  function toast(msg) {
    var t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2800);
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
    list: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>'
  };
  var GOOGLE = '<svg viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>';
  var APPLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';

  /* ---------- state ---------- */
  var S = {
    user: null, profile: null, view: "home", feed: "foryou",
    following: {}, unread: 0, replyTo: null, posting: false,
    lists: { home: [], explore: [], profile: [] }, people: [], searchQ: "", searchToken: 0,
    homeLoading: false, editing: false, pwOpen: false, pwMsg: "", pwOk: false, recovery: false,
    confirmDel: null, installEvt: null, counts: { orbiting: 0, orbiters: 0, orbs: 0 },
    chatUnread: 0, chatThreads: [], thread: null, threadMsgs: [], pendingMsgs: [], threadSig: "", soonTitle: "", newPeople: []
  };
  var theme = "system";

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

  function goAuth() {
    S.user = null; S.profile = null;
    document.body.classList.add("on-auth");
    $("#splash").hidden = true; $("#app").hidden = true; $("#auth").hidden = false;
    $("#drawer").hidden = true; $("#compose").hidden = true; $("#fab").hidden = true;
    S.thread = null; S.threadMsgs = []; S.pendingMsgs = []; S.chatThreads = []; S.chatUnread = 0;
    if (aview !== "confirm") { aview = "options"; }
    renderAuth();
  }

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
    if (aview === "options") {
      h += '<button class="abtn solid" data-a="apple">' + APPLE + (su ? "Sign up with Apple" : "Log in with Apple") + "</button>";
      h += '<button class="abtn solid" data-a="google">' + GOOGLE + (su ? "Sign up with Google" : "Log in with Google") + "</button>";
      h += '<div class="or">or</div>';
      h += '<button class="abtn" data-a="phone">' + PHONE + "Continue with phone number</button>";
      h += '<button class="abtn" data-a="email">' + MAIL + "Continue with email</button>";
    } else if (aview === "email") {
      h += '<button class="backbtn" data-a="back">' + ic(I.back) + "Back</button>";
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
    var first = $("input,select", p); if (first && aview !== "options") first.focus();
  }
  function aerr(m) { var e = $("#a-err"); if (e) e.textContent = m; }
  function busy(on) { var b = $("#a-go"); if (b) { b.classList.toggle("busy", on); b.disabled = on; } }

  $("#auth").addEventListener("click", function (e) {
    var b = e.target.closest("[data-mode],[data-a]"); if (!b) return;
    if (b.dataset.mode) { mode = b.dataset.mode; aview = "options"; renderAuth(); return; }
    var a = b.dataset.a;
    if (a === "email") { aview = "email"; renderAuth(); }
    else if (a === "phone") {
      if (!(cfg.providers && cfg.providers.phone)) return toast("Phone sign-in is coming soon. Use email for now.");
      aview = "phone"; renderAuth();
    }
    else if (a === "back" || a === "toLogin") { if (a === "toLogin") mode = "login"; aview = "options"; renderAuth(); }
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
  function oauth(p) {
    if (!(cfg.providers && cfg.providers[p])) return toast((p === "apple" ? "Apple" : "Google") + " sign-in is coming soon. Use email for now.");
    sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: redirectUrl() } }).then(function (r) { if (r.error) toast(niceErr(r.error)); });
  }
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

  /* ---------- enter the app ---------- */
  async function startApp(user) {
    S.user = user;
    var pr = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (pr.error || !pr.data) {
      await sb.auth.signOut();
      aview = "options"; goAuth();
      return toast("We could not load your profile. Please try again.");
    }
    S.profile = pr.data; S.editing = false; S.feed = "foryou"; S.replyTo = null;
    document.body.classList.remove("on-auth");
    $("#splash").hidden = true; $("#auth").hidden = true; $("#app").hidden = false;
    $("#composer-av").innerHTML = av(S.profile.display_name, 42);
    $("#composer-text").value = ""; $("#search-in").value = ""; S.searchQ = "";
    updateComposer(); renderReplyChip();
    await Promise.all([loadFollowing(), loadUnread()]);
    show(S.recovery ? "security" : "home");
    if (S.recovery) { S.pwOpen = true; renderSecurity(); toast("Choose a new password."); }
    else toast("Welcome to Orbi, " + S.profile.display_name.split(" ")[0] + ".");
  }
  async function logout() {
    await sb.auth.signOut();
    mode = "login"; aview = "options"; goAuth();
  }

  /* ---------- data loading ---------- */
  async function loadFollowing() {
    var r = await sb.from("orbits").select("following_id").eq("follower_id", S.user.id);
    S.following = {}; (r.data || []).forEach(function (x) { S.following[x.following_id] = true; });
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
  document.addEventListener("visibilitychange", function () { if (!document.hidden && S.user && S.view === "home") loadHome(true); });

  async function loadHome(quiet) {
    if (!quiet) { S.homeLoading = true; renderFeed(); }
    var q = sb.from("orb_feed").select("*").order("created_at", { ascending: false }).limit(50);
    if (S.feed === "orbiting") q = q.in("author_id", Object.keys(S.following).concat([S.user.id]));
    var r = await q;
    S.homeLoading = false;
    if (r.error) { toast(niceErr(r.error)); } else { S.lists.home = r.data || []; }
    if (S.view === "home") renderFeed();
  }

  /* ---------- navigation ---------- */
  var TABS = [["home", "Home", I.home], ["explore", "Explore", I.search], ["alerts", "Alerts", I.bell], ["chat", "Chat", I.chat], ["profile", "Profile", I.user]];
  var TITLES = { settings: "Settings", security: "Security", newchat: "New message" };
  function navKey(v) { return v === "settings" || v === "security" ? "profile" : v === "thread" || v === "newchat" ? "chat" : v; }
  function topTitle(v) { return v === "thread" ? (S.thread ? S.thread.display_name : "Chat") : v === "soon" ? S.soonTitle : TITLES[v]; }
  function show(v) {
    S.view = v;
    closeDrawer();
    $$("#content > section").forEach(function (s) { s.hidden = s.dataset.view !== v; });
    $("#app").classList.toggle("in-thread", v === "thread");
    $("#fab").hidden = v !== "home";
    renderTop(); renderTabbar();
    $("#content").scrollTop = 0;
    if (v === "home") { renderFeed(); loadHome(); }
    else if (v === "explore") loadExplore();
    else if (v === "alerts") loadAlerts();
    else if (v === "chat") { renderChatList(); loadChat(); }
    else if (v === "newchat") { $("#newchat-in").value = ""; loadNewChat(); }
    else if (v === "soon") renderSoon();
    else if (v === "profile") loadProfile();
    else if (v === "settings") renderSettings();
    else if (v === "security") renderSecurity();
  }
  function renderTabbar() {
    var cur = navKey(S.view);
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
    if (title) t.innerHTML = '<button class="iconbtn" data-act="back" aria-label="Back">' + ic(I.back) + '</button><div class="mid">' + esc(title) + "</div>" + themeBtn();
    else t.innerHTML = '<button class="iconbtn" data-act="menu" aria-label="Open menu">' + av(S.profile.display_name, 32) + '</button><button class="iconbtn" style="width:auto;margin:0 auto" data-act="top" aria-label="Orbi, back to top"><span class="ring" style="width:28px;color:var(--accent)"></span></button>' + themeBtn();
  }
  document.addEventListener("click", function (e) {
    var nav = e.target.closest("[data-nav]");
    if (nav && !$("#app").hidden) { var same = S.view === nav.dataset.nav; show(nav.dataset.nav); if (same) $("#content").scrollTop = 0; }
  });

  /* ---------- posts ---------- */
  function allOrbs() { return S.lists.home.concat(S.lists.explore, S.lists.profile); }
  function findOrb(id) { var a = allOrbs(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; }
  function postHTML(p) {
    var own = p.author_id === S.user.id, sure = S.confirmDel === p.id;
    return '<article class="post gx" data-id="' + p.id + '">' + av(p.display_name, 42) +
      '<div class="pbody"><div class="phead"><b>' + esc(p.display_name) + '</b><span class="muted">@' + esc(p.handle) + " · " + ago(p.created_at) + "</span></div>" +
      (p.reply_to_handle ? '<p class="rto">Replying to @' + esc(p.reply_to_handle) + "</p>" : "") +
      '<p class="ptext">' + esc(p.body) + "</p>" +
      '<div class="pacts">' +
      '<button class="act" data-act="reply" aria-label="Reply to ' + esc(p.display_name) + '">' + ic(I.reply) + "<span>" + p.reply_count + "</span></button>" +
      '<button class="act' + (p.reorbed_by_me ? " on" : "") + '" data-act="reorb" aria-pressed="' + !!p.reorbed_by_me + '" aria-label="Re-orb">' + ic(I.reorb) + "<span>" + p.reorb_count + "</span></button>" +
      '<button class="act' + (p.liked_by_me ? " on" : "") + '" data-act="like" aria-pressed="' + !!p.liked_by_me + '" aria-label="Like">' + ic(I.heart, "i-heart") + "<span>" + p.like_count + "</span></button>" +
      (own ? '<button class="act del' + (sure ? " sure" : "") + '" data-act="delete" aria-label="' + (sure ? "Tap again to delete" : "Delete orb") + '">' + (sure ? "Delete?" : "Delete") + "</button>" : "") +
      "</div></div></article>";
  }
  function listPosts(arr, t, d) {
    if (!arr.length) return '<div class="empty gx"><b>' + t + "</b>" + d + "</div>";
    return arr.map(postHTML).join("");
  }
  function renderFeed() {
    ["foryou", "orbiting"].forEach(function (k) { $("#ft-" + k).setAttribute("aria-selected", S.feed === k); });
    var el = $("#feed");
    if (S.homeLoading && !S.lists.home.length) { el.innerHTML = '<div class="loading">Loading orbs…</div>'; return; }
    el.innerHTML = S.feed === "orbiting"
      ? listPosts(S.lists.home, "Nothing here yet", "Orbit people in Explore and their orbs will show up here.")
      : listPosts(S.lists.home, "No orbs yet", "Be the first. Tap Create to write an orb.");
  }
  function refreshLists() {
    if (S.view === "home") renderFeed();
    else if (S.view === "explore") renderExploreBody();
    else if (S.view === "profile") renderProfile();
  }
  function updateComposer() {
    var v = $("#composer-text").value, n = v.length, c = $("#composer-count");
    c.textContent = n + "/280"; c.classList.toggle("over", n > 280);
    $("#composer-post").disabled = S.posting || !v.trim() || n > 280;
  }
  function renderReplyChip() {
    var c = $("#reply-chip");
    if (!S.replyTo) { c.hidden = true; c.innerHTML = ""; return; }
    c.hidden = false; c.innerHTML = "<span>Replying to @" + esc(S.replyTo.handle) + '</span><button data-act="cancelreply" aria-label="Cancel reply">×</button>';
  }
  async function post() {
    var ta = $("#composer-text"), t = ta.value.trim(); if (!t || t.length > 280 || S.posting) return;
    S.posting = true; updateComposer();
    var r = await sb.from("orbs").insert({ author_id: S.user.id, body: t, reply_to: S.replyTo ? S.replyTo.id : null });
    S.posting = false;
    if (r.error) { updateComposer(); return toast(niceErr(r.error)); }
    var wasReply = !!S.replyTo;
    closeCompose(true);
    toast(wasReply ? "Reply sent." : "Your orb is live.");
    loadHome(true);
    if (S.view === "profile") loadProfile(true);
  }
  function openCompose() {
    $("#compose").hidden = false; updateComposer();
    setTimeout(function () { $("#composer-text").focus(); }, 0);
  }
  function closeCompose(clear) {
    $("#compose").hidden = true;
    if (clear) { $("#composer-text").value = ""; S.replyTo = null; renderReplyChip(); updateComposer(); }
  }
  $("#composer-text").addEventListener("input", updateComposer);
  $("#composer-post").addEventListener("click", post);
  $$("[data-feed]").forEach(function (b) { b.addEventListener("click", function () { S.feed = b.dataset.feed; S.lists.home = []; renderFeed(); loadHome(); }); });

  async function toggleOrbRel(table, orb, flag, countKey) {
    var on = !orb[flag]; orb[flag] = on; orb[countKey] += on ? 1 : -1; refreshLists();
    var r = on
      ? await sb.from(table).insert({ user_id: S.user.id, orb_id: orb.id })
      : await sb.from(table).delete().eq("user_id", S.user.id).eq("orb_id", orb.id);
    if (r.error) { orb[flag] = !on; orb[countKey] += on ? -1 : 1; refreshLists(); toast(niceErr(r.error)); }
  }
  async function deleteOrb(orb) {
    if (S.confirmDel !== orb.id) {
      S.confirmDel = orb.id; refreshLists();
      setTimeout(function () { if (S.confirmDel === orb.id) { S.confirmDel = null; refreshLists(); } }, 3000);
      return;
    }
    S.confirmDel = null;
    var r = await sb.from("orbs").delete().eq("id", orb.id).eq("author_id", S.user.id);
    if (r.error) return toast(niceErr(r.error));
    ["home", "explore", "profile"].forEach(function (k) { S.lists[k] = S.lists[k].filter(function (x) { return x.id !== orb.id; }); });
    if (S.view === "profile") loadProfile(true); else refreshLists();
    toast("Orb deleted.");
  }

  /* ---------- explore ---------- */
  function personRow(p) {
    var f = S.following[p.id];
    return '<div class="person">' + av(p.display_name, 44) + '<div class="pi"><b>' + esc(p.display_name) + "</b><span>@" + esc(p.handle) + (p.bio ? " · " + esc(p.bio) : "") + '</span></div><button class="btn sm' + (f ? " on" : " fill") + '" data-act="orbit" data-id="' + p.id + '" aria-pressed="' + !!f + '">' + (f ? "Orbiting" : "Orbit") + "</button></div>";
  }
  async function loadExplore() {
    S.searchQ = $("#search-in").value.trim();
    if (S.searchQ) return runSearch();
    $("#explore-body").innerHTML = '<div class="loading">Loading…</div>';
    var tok = ++S.searchToken;
    var res = await Promise.all([
      sb.from("profiles").select("id,handle,display_name,bio").neq("id", S.user.id).order("created_at", { ascending: false }).limit(15),
      sb.from("orb_feed").select("*").order("created_at", { ascending: false }).limit(20)
    ]);
    if (tok !== S.searchToken) return;
    S.people = res[0].data || []; S.lists.explore = res[1].data || [];
    renderExploreBody();
  }
  function renderExploreBody() {
    var b = $("#explore-body"), q = S.searchQ, h = "";
    if (!q) {
      h += '<div class="sect">People to orbit</div>' + (S.people.length ? S.people.map(personRow).join("") : '<p class="muted">No one else has joined yet. Invite a friend to be first in your orbit.</p>');
      h += '<div class="sect">Latest orbs</div>' + (S.lists.explore.length ? S.lists.explore.map(postHTML).join("") : '<p class="muted">No orbs yet.</p>');
    } else {
      h += '<div class="sect">People</div>' + (S.people.length ? S.people.map(personRow).join("") : '<p class="muted">No people match "' + esc(q) + '".</p>');
      h += '<div class="sect">Orbs</div>' + (S.lists.explore.length ? S.lists.explore.map(postHTML).join("") : '<p class="muted">No orbs match "' + esc(q) + '".</p>');
    }
    b.innerHTML = h;
  }
  async function runSearch() {
    var raw = S.searchQ.replace(/^@/, ""), q = raw.replace(/[^\p{L}\p{N} _.-]/gu, "").trim(), tok = ++S.searchToken;
    if (!q) { S.people = []; S.lists.explore = []; return renderExploreBody(); }
    var like = "%" + q.replace(/%/g, "") + "%";
    var res = await Promise.all([
      sb.from("profiles").select("id,handle,display_name,bio").or("handle.ilike." + like + ",display_name.ilike." + like).limit(15),
      sb.from("orb_feed").select("*").ilike("body", like).order("created_at", { ascending: false }).limit(30)
    ]);
    if (tok !== S.searchToken) return;
    S.people = (res[0].data || []).filter(function (p) { return p.id !== S.user.id; }); S.lists.explore = res[1].data || [];
    renderExploreBody();
  }
  var searchTimer;
  $("#search-in").addEventListener("input", function (e) {
    S.searchQ = e.target.value.trim(); clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { S.searchQ ? runSearch() : loadExplore(); }, 280);
  });
  async function toggleOrbit(id, btn) {
    var on = !S.following[id]; if (on) S.following[id] = true; else delete S.following[id];
    refreshLists();
    var r = on
      ? await sb.from("orbits").insert({ follower_id: S.user.id, following_id: id })
      : await sb.from("orbits").delete().eq("follower_id", S.user.id).eq("following_id", id);
    if (r.error) { if (on) delete S.following[id]; else S.following[id] = true; refreshLists(); toast(niceErr(r.error)); }
  }

  /* ---------- alerts ---------- */
  var NOTE_ICON = { orbit: I.user, like: I.heart, reorb: I.reorb, reply: I.reply };
  var NOTE_TEXT = { orbit: "started orbiting you", like: "liked your orb", reorb: "re-orbed your orb", reply: "replied to your orb" };
  async function loadAlerts() {
    var el = $("#alerts-list"); el.innerHTML = '<div class="loading">Loading…</div>';
    var r = await sb.from("notifications").select("id,type,orb_id,read,created_at,actor:profiles!actor_id(handle,display_name)").order("created_at", { ascending: false }).limit(50);
    if (r.error) { el.innerHTML = '<div class="empty gx"><b>Could not load alerts</b>' + esc(niceErr(r.error)) + "</div>"; return; }
    var rows = r.data || [];
    el.innerHTML = rows.length ? rows.map(function (n) {
      var who = n.actor ? n.actor.display_name : "Someone";
      return '<div class="note-row gx' + (n.read ? "" : " unread") + '"><span class="note-ic">' + ic(NOTE_ICON[n.type] || I.bell) + '</span><div><p><b>' + esc(who) + "</b> " + (NOTE_TEXT[n.type] || "sent you an alert") + "</p><small>" + ago(n.created_at) + "</small></div></div>";
    }).join("") : '<div class="empty gx"><b>No alerts yet</b>When someone orbits you or likes an orb, you will see it here.</div>';
    if (rows.some(function (n) { return !n.read; })) {
      sb.from("notifications").update({ read: true }).eq("user_id", S.user.id).eq("read", false).then(function () { S.unread = 0; renderTabbar(); });
    }
  }

  /* ---------- profile ---------- */
  async function loadProfile(quiet) {
    if (!quiet) $("#v-profile").innerHTML = '<div class="loading">Loading…</div>';
    var id = S.user.id;
    var res = await Promise.all([
      sb.from("orb_feed").select("*").eq("author_id", id).order("created_at", { ascending: false }).limit(50),
      sb.from("orbits").select("follower_id", { count: "exact", head: true }).eq("follower_id", id),
      sb.from("orbits").select("follower_id", { count: "exact", head: true }).eq("following_id", id)
    ]);
    S.lists.profile = res[0].data || [];
    S.counts = { orbs: S.lists.profile.length, orbiting: res[1].count || 0, orbiters: res[2].count || 0 };
    if (S.view === "profile") renderProfile();
  }
  function renderProfile() {
    var u = S.profile, c = S.counts;
    var h = '<div class="banner" aria-hidden="true"></div><div class="gx pinfo"><div class="prow">' + av(u.display_name, 76) +
      '<div class="btns"><button class="iconbtn" style="border:1px solid var(--line)" data-act="settings" aria-label="Settings">' + ic(I.gear) + '</button><button class="btn" data-act="edit">' + (S.editing ? "Cancel" : "Edit profile") + "</button></div></div>" +
      '<h2 class="pname">' + esc(u.display_name) + '</h2><span class="muted">@' + esc(u.handle) + '</span><p style="margin:8px 0 0">' + esc(u.bio || "New to Orbi.") + "</p>" +
      '<div class="stats"><span><b>' + c.orbiting + "</b> Orbiting</span><span><b>" + c.orbiters + "</b> Orbiters</span><span><b>" + c.orbs + "</b> Orbs</span></div>";
    if (S.editing) h += '<div class="editbox"><label for="e-name">Name</label><input class="in" id="e-name" value="' + esc(u.display_name) + '" maxlength="40"><label for="e-bio">Bio</label><textarea class="in" id="e-bio" maxlength="160" rows="3">' + esc(u.bio || "") + '</textarea><button class="btn fill" data-act="saveprofile">Save profile</button></div>';
    h += '</div><div class="tabs2" style="grid-template-columns:1fr"><button role="tab" aria-selected="true">Orbs</button></div>' + listPosts(S.lists.profile, "No orbs yet", "Your orbs will show up here once you post.");
    $("#v-profile").innerHTML = h;
  }
  async function saveProfile() {
    var nm = $("#e-name").value.trim(), bio = $("#e-bio").value.trim();
    if (!nm) return toast("Your name can't be empty.");
    var r = await sb.from("profiles").update({ display_name: nm, bio: bio }).eq("id", S.user.id).select().single();
    if (r.error) return toast(niceErr(r.error));
    S.profile = r.data; S.editing = false;
    $("#composer-av").innerHTML = av(nm, 42); renderTop(); loadProfile(true); toast("Profile saved.");
  }

  /* ---------- avatar menu (side drawer) ---------- */
  var MENU = [["profile", "Profile", I.user], ["soon:Bookmarks", "Bookmarks", I.bookmark], ["soon:Premium", "Premium", I.star], ["soon:Communities", "Communities", I.people], ["soon:Lists", "Lists", I.list]];
  function renderDrawer() {
    var u = S.profile, c = S.counts;
    $("#drawer-panel").innerHTML =
      '<button class="dhead" data-act="drawergo" data-go="profile" aria-label="Open your profile">' + av(u.display_name, 52) +
      '<b>' + esc(u.display_name) + '</b><span class="muted">@' + esc(u.handle) + "</span></button>" +
      '<div class="dstats"><span><b>' + c.orbiting + "</b> Orbiting</span><span><b>" + c.orbiters + "</b> Orbiters</span></div>" +
      '<div class="dsep"></div>' +
      MENU.map(function (m) { return '<button class="ditem" data-act="drawergo" data-go="' + m[0] + '">' + ic(m[2]) + "<span>" + m[1] + "</span></button>"; }).join("") +
      '<div class="dsep"></div>' +
      '<button class="ditem small" data-act="drawergo" data-go="settings">' + ic(I.gear) + "<span>Settings and privacy</span></button>";
  }
  async function openDrawer() {
    renderDrawer(); $("#drawer").hidden = false;
    var b = $("#drawer-panel .dhead"); if (b) b.focus();
    var id = S.user.id;
    var res = await Promise.all([
      sb.from("orbits").select("follower_id", { count: "exact", head: true }).eq("follower_id", id),
      sb.from("orbits").select("follower_id", { count: "exact", head: true }).eq("following_id", id)
    ]);
    S.counts.orbiting = res[0].count || 0; S.counts.orbiters = res[1].count || 0;
    if (!$("#drawer").hidden) renderDrawer();
  }
  function closeDrawer() { $("#drawer").hidden = true; }
  function drawerGo(go) {
    closeDrawer();
    if (go.indexOf("soon:") === 0) { S.soonTitle = go.slice(5); show("soon"); } else show(go);
  }
  function renderSoon() {
    $("#v-soon").innerHTML = '<div class="empty gx"><b>' + esc(S.soonTitle) + " is coming soon</b>We are still building this. It will show up here when it is ready.</div>";
  }

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
      return '<button class="trow gx" data-act="openthread" data-id="' + t.other_id + '">' + av(t.display_name, 46) +
        '<div class="pi"><div class="ttop"><b>' + esc(t.display_name) + '</b><span class="muted">' + ago(t.last_at) + "</span></div>" +
        '<span class="tprev' + (n ? " unread" : "") + '">' + (t.last_from_me ? "You: " : "") + esc(t.last_body) + "</span></div>" +
        (n ? '<span class="dot" aria-label="' + n + ' unread">' + n + "</span>" : "") + "</button>";
    }).join("") : '<div class="empty gx"><b>No chats yet</b>Tap New message to start a conversation.</div>';
  }
  var ncTok = 0, ncTimer;
  async function loadNewChat() {
    var tok = ++ncTok, q = $("#newchat-in").value.trim().replace(/^@/, "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim(), body = $("#newchat-body");
    body.innerHTML = '<div class="loading">Loading…</div>';
    var qy = sb.from("profiles").select("id,handle,display_name,bio").neq("id", S.user.id).limit(20);
    if (q) { var like = "%" + q.replace(/%/g, "") + "%"; qy = qy.or("handle.ilike." + like + ",display_name.ilike." + like); }
    else qy = qy.order("created_at", { ascending: false });
    var r = await qy;
    if (tok !== ncTok || S.view !== "newchat") return;
    S.newPeople = r.data || [];
    body.innerHTML = S.newPeople.length ? S.newPeople.map(function (p) {
      return '<button class="trow" data-act="openthread" data-id="' + p.id + '">' + av(p.display_name, 46) +
        '<div class="pi"><b>' + esc(p.display_name) + '</b><span class="tprev">@' + esc(p.handle) + (p.bio ? " · " + esc(p.bio) : "") + "</span></div></button>";
    }).join("") : '<p class="muted">' + (q ? 'No one matches "' + esc(q) + '".' : "No one else has joined yet.") + "</p>";
  }
  async function openThread(id) {
    var pr = await sb.from("profiles").select("id,handle,display_name").eq("id", id).maybeSingle();
    if (pr.error || !pr.data) return toast("Could not open that chat.");
    S.thread = pr.data; S.threadMsgs = []; S.pendingMsgs = []; S.threadSig = "";
    $("#thread-in").value = ""; updateSend();
    show("thread"); renderThread(true);
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
      return '<div class="bub ' + (m.sender_id === me ? "me" : "them") + (m.pending ? " pend" : "") + '"><span>' + esc(m.body) + "</span><small>" + msgTime(m.created_at) + "</small></div>";
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
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("#compose").hidden) closeCompose(true); else if (!$("#drawer").hidden) closeDrawer();
  });

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

  /* ---------- delegated actions ---------- */
  $("#app").addEventListener("click", function (e) {
    var tg = e.target.closest("[data-theme-set]");
    if (tg) { setTheme(tg.dataset.themeSet); renderSettings(); renderTop(); return; }
    var b = e.target.closest("[data-act]"); if (!b) return;
    var act = b.dataset.act, art = b.closest(".post"), p = art ? findOrb(art.dataset.id) : null;
    if (act === "theme") { setTheme(effectiveDark() ? "light" : "dark"); renderTop(); if (S.view === "settings") renderSettings(); }
    else if (act === "top") { if (S.view === "home") loadHome(true); $("#content").scrollTop = 0; }
    else if (act === "back") show(S.view === "security" ? "settings" : S.view === "thread" || S.view === "newchat" ? "chat" : S.view === "soon" ? "home" : "profile");
    else if (act === "menu") openDrawer();
    else if (act === "drawerclose") closeDrawer();
    else if (act === "drawergo") drawerGo(b.dataset.go);
    else if (act === "create") { S.replyTo = null; renderReplyChip(); openCompose(); }
    else if (act === "closecompose") closeCompose(true);
    else if (act === "newchat") show("newchat");
    else if (act === "openthread") openThread(b.dataset.id);
    else if (act === "settings") show("settings");
    else if (act === "security") show("security");
    else if (act === "logout") logout();
    else if (act === "like" && p) toggleOrbRel("likes", p, "liked_by_me", "like_count");
    else if (act === "reorb" && p) { toggleOrbRel("reorbs", p, "reorbed_by_me", "reorb_count"); }
    else if (act === "delete" && p) deleteOrb(p);
    else if (act === "reply" && p) { S.replyTo = { id: p.id, handle: p.handle }; renderReplyChip(); openCompose(); }
    else if (act === "cancelreply") { S.replyTo = null; renderReplyChip(); }
    else if (act === "orbit") toggleOrbit(b.dataset.id, b);
    else if (act === "edit") { S.editing = !S.editing; renderProfile(); }
    else if (act === "saveprofile") saveProfile();
    else if (act === "pwtoggle") { S.pwOpen = !S.pwOpen; S.pwMsg = ""; S.pwOk = false; renderSecurity(); }
    else if (act === "pwsave") savePassword();
    else if (act === "endall") sb.auth.signOut({ scope: "others" }).then(function (r) { toast(r.error ? niceErr(r.error) : "Logged out of all other devices."); });
    else if (act === "install" && S.installEvt) { S.installEvt.prompt(); S.installEvt.userChoice.then(function () { S.installEvt = null; renderSettings(); }); }
  });
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); S.installEvt = e; if (S.view === "settings" && S.user) renderSettings(); });

  /* ---------- go ---------- */
  if ("serviceWorker" in navigator && /^https:$|^http:$/.test(location.protocol) && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  boot();
})();
