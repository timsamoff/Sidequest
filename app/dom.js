/* dom helpers */
export function $(id) { return document.getElementById(id); }
// A new idea's resting pose on the Workshop board: sideways and up-down offsets from -1 to 1, and the size of the curled corner in pixels. Stored on the idea so it never changes.
export function newPin() { return { x: Math.round((Math.random() * 2 - 1) * 100) / 100, y: Math.round((Math.random() * 2 - 1) * 100) / 100, bend: 37 + Math.floor(Math.random() * 29) }; }
export function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
export function el(tag, attrs, text) {
  var e = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  if (text !== undefined) e.textContent = text;
  return e;
}
export function on(node, ev, fn) { node.addEventListener(ev, fn); return node; }
// A small "?" button (the mark is drawn in CSS, so it never joins its parent's text) that explains one Terms entry. views.js registers what it opens.
var helpOpener = null;
export function setHelpOpener(fn) { helpOpener = fn; }
export function helpLink(id, name) {
  var b = el("button", { type: "button", "class": "helpq", "data-term": id, "aria-label": "What is " + name + "?", title: "What is " + name + "?" });
  b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); if (helpOpener) helpOpener(id); });
  return b;
}
// True when the page is running as a Claude artifact (Claude's capabilities are present).
export function inClaude() {
  try { return !!(window.claude && typeof window.claude.use === "function"); } catch (e) { return false; }
}
// True in the installed app. navigator.standalone is a non-standard flag some mobile browsers use instead of the display-mode query.
export function isStandalone() {
  try { return (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true; } catch (e) { return false; }
}
// True when running as a hosted artifact: inside Claude, or any host that sets window.sidequestHosted. Wording about where data lives and the web-only features follow this; Claude-only abilities use inClaude().
export function isHosted() {
  try { return inClaude() || window.sidequestHosted === true; } catch (e) { return false; }
}
// Plays a short sound effect and silently gives up on any failure. `volume` is optional, 0 to 1.
export function playSfx(src, volume) {
  if (!src) return;
  try {
    var a = new window.Audio(src);
    if (volume !== undefined) a.volume = volume;
    var p = a.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  } catch (e) { /* no audio support */ }
}
// Loads a clip ahead of time and returns a function that plays it from the start, so a sound timed to an animation is not late while the file loads.
export function prepareSfx(src, volume) {
  var a = null;
  try { if (src) { a = new window.Audio(src); a.preload = "auto"; if (volume !== undefined) a.volume = volume; } } catch (e) { a = null; }
  return function () {
    if (!a) return;
    try { a.currentTime = 0; var p = a.play(); if (p && typeof p.catch === "function") p.catch(function () {}); } catch (e) { /* no audio support */ }
  };
}
var sfxCtx = null, sfxClips = {};
// One shared audio clock for sounds that must land on an animation frame. Null where Web Audio is missing.
function sfxContext() {
  try {
    if (!sfxCtx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) sfxCtx = new AC(); }
  } catch (e) { sfxCtx = null; }
  return sfxCtx;
}
// Decodes a clip once, reading data: URIs directly so it works in a published artifact. Resolves to null on failure.
export function warmSfx(src) {
  var ctx = sfxContext();
  if (!src || !ctx) return Promise.resolve(null);
  if (sfxClips[src]) return sfxClips[src].promise;
  var clip = sfxClips[src] = { buffer: null, lead: 0 };
  clip.promise = new Promise(function (resolve) {
    function decode(ab) {
      var done = function (buf) {
        // MP3 decoding leaves a little silence at the front; skip it so the first sound lands on time.
        var d = buf.getChannelData(0), i = 0;
        while (i < d.length && Math.abs(d[i]) < 0.02) i++;
        clip.buffer = buf; clip.lead = i / buf.sampleRate; resolve(clip);
      };
      try { var p = ctx.decodeAudioData(ab, done, function () { resolve(null); }); if (p && p.then) p.then(done, function () { resolve(null); }); } catch (e) { resolve(null); }
    }
    try {
      if (src.indexOf("data:") === 0) {
        var bin = window.atob(src.slice(src.indexOf(",") + 1)), u8 = new Uint8Array(bin.length);
        for (var n = 0; n < bin.length; n++) u8[n] = bin.charCodeAt(n);
        decode(u8.buffer);
      } else window.fetch(src).then(function (r) { return r.arrayBuffer(); }).then(decode, function () { resolve(null); });
    } catch (e) { resolve(null); }
  });
  return clip.promise;
}
// Starts the clip once per delay (ms from now) on the audio clock. Returns a stop function, or null if not ready.
export function scheduleSfx(src, volume, delaysMs) {
  var ctx = sfxContext(), clip = src && sfxClips[src];
  if (!ctx || !clip || !clip.buffer) { warmSfx(src); return null; }
  try {
    if (ctx.state === "suspended") ctx.resume();
    var gain = ctx.createGain(); gain.gain.value = volume === undefined ? 1 : volume; gain.connect(ctx.destination);
    var late = (ctx.outputLatency || ctx.baseLatency || 0), nodes = [];
    delaysMs.forEach(function (ms) {
      var s = ctx.createBufferSource(); s.buffer = clip.buffer; s.connect(gain);
      s.start(Math.max(ctx.currentTime, ctx.currentTime + ms / 1000 - late), clip.lead); nodes.push(s);
    });
    return function () { nodes.forEach(function (s) { try { s.stop(); } catch (e) { /* already ended */ } }); };
  } catch (e) { return null; }
}
// Cash-register money input: digits fill in from the cents, capped at 999,999.99. `style` is "us" or "eu" from the Options Coin format setting.
function moneySeps(style) { return style === "eu" ? { group: ".", dec: "," } : { group: ",", dec: "." }; }
export function formatMoney(n, style) {
  if (typeof n !== "number" || isNaN(n) || n <= 0) return "";
  var sep = moneySeps(style);
  var cents = Math.round(n * 100), whole = String(Math.floor(cents / 100)), frac = String(cents % 100), out = "";
  if (frac.length < 2) frac = "0" + frac;
  for (var i = 0; i < whole.length; i++) { if (i > 0 && (whole.length - i) % 3 === 0) out += sep.group; out += whole.charAt(i); }
  return out + sep.dec + frac;
}
// Reads a typed or pasted amount as a number, or "" if it is not one.
// With both separators the later one is the decimal; a lone one before three digits is thousands.
export function parseMoney(s, style) {
  var t = String(s || "").replace(/[^0-9.,]/g, "");
  var lastDot = t.lastIndexOf("."), lastCom = t.lastIndexOf(","), dec = "";
  if (lastDot >= 0 && lastCom >= 0) dec = lastDot > lastCom ? "." : ",";
  else if (lastDot >= 0 || lastCom >= 0) {
    var ch = lastDot >= 0 ? "." : ",", count = t.split(ch).length - 1, after = t.length - 1 - t.lastIndexOf(ch);
    if (count === 1 && !(after === 3 && moneySeps(style).group === ch)) dec = ch;
  }
  var norm = dec ? t.replace(dec === "." ? /,/g : /\./g, "").replace(dec, ".") : t.replace(/[.,]/g, "");
  var n = parseFloat(norm);
  if (isNaN(n) || n <= 0) return "";
  return Math.min(999999.99, Math.round(n * 100) / 100);
}
// Turns a text input into a money field; `onChange` gets the amount, or "" when empty.
export function moneyInput(input, onChange, style) {
  input.setAttribute("inputmode", "numeric"); input.setAttribute("autocomplete", "off");
  function apply(n) {
    input.value = formatMoney(n, style);
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* not a focusable text input */ }
    if (onChange) onChange(typeof n === "number" ? n : "");
  }
  on(input, "input", function () {
    var digits = input.value.replace(/[^0-9]/g, "").replace(/^0+/, "");
    if (digits.length > 8) digits = digits.slice(0, 8);
    apply(digits === "" ? "" : parseInt(digits, 10) / 100);
  });
  on(input, "paste", function (e) {
    var data = e.clipboardData || window.clipboardData, n = data ? parseMoney(data.getData("text"), style) : "";
    if (n === "") return;
    e.preventDefault(); apply(n);
  });
  return input;
}
// A plain check: something, an @, then a dotted domain ending in two or more letters, and no spaces.
export function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }
// An email input that saves only a valid address (or none). A bad one is reported when the field loses focus, never while typing.
export function emailField(id, value, onValid) {
  var wrap = el("div"), inp = el("input", { type: "email", id: id, autocomplete: "off" }), msg = el("p", { "class": "msg emailmsg", role: "alert" });
  inp.value = value;
  on(inp, "input", function () { var v = inp.value.trim(); if (!v || isEmail(v)) { setMsg(msg, "", ""); onValid(v); } });
  on(inp, "blur", function () { var v = inp.value.trim(); if (v && !isEmail(v)) setMsg(msg, "Not saved. Enter an address like name@example.com, or clear the field.", "error"); });
  wrap.appendChild(inp); wrap.appendChild(msg);
  return wrap;
}
// A pencil icon button: the app's one affordance for "change this text".
var PENCIL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
export function pencilButton(label, title, onClick) {
  var b = el("button", { type: "button", "class": "pencil", "aria-label": label, title: title });
  b.innerHTML = PENCIL;
  if (onClick) on(b, "click", onClick);
  return b;
}
// Turns `display` into an input in place; Enter or clicking away saves, Esc cancels. onDone runs before onSave.
export function editInline(display, opts) {
  var input = el("input", { type: "text", "class": "inlineedit", "aria-label": opts.label, maxlength: String(opts.max || 200), autocomplete: "off" });
  input.value = opts.value();
  var cs = window.getComputedStyle(display);
  ["fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing"].forEach(function (k) { input.style[k] = cs[k]; });
  var finished = false;
  function finish(save) {
    if (finished) return; finished = true;
    var v = input.value.trim();
    if (input.parentNode) input.parentNode.removeChild(input);
    display.style.display = "";
    if (opts.onDone) opts.onDone();
    if (!save) return;
    if (!v) { if (opts.onEmpty) opts.onEmpty(); return; }
    if (v !== opts.value()) opts.onSave(v);
  }
  on(input, "keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
  });
  on(input, "blur", function () { finish(true); });
  display.style.display = "none";
  display.parentNode.insertBefore(input, display.nextSibling);
  input.focus(); input.select();
}
export function arm(btn, label, armedLabel, action) {
  var timer = null;
  btn.addEventListener("click", function () {
    if (btn.getAttribute("data-armed") !== "1") {
      btn.setAttribute("data-armed", "1"); btn.textContent = armedLabel;
      timer = setTimeout(function () { btn.removeAttribute("data-armed"); btn.textContent = label; }, 4000);
      return;
    }
    clearTimeout(timer); btn.removeAttribute("data-armed"); btn.textContent = label; action();
  });
}
export var focusKey = null;
export function setFocusKey(v) { focusKey = v; }
var toastTimer = null;
// Sets a message line's text and look: "error" is red, "note" is orange, and "" is plain.
export function setMsg(node, text, kind) {
  node.textContent = text;
  node.classList.toggle("errmsg", kind === "error");
  node.classList.toggle("notemsg", kind === "note");
}
// A "problem" toast is red and stays longer; any other kind is the normal one.
export function notify(msg, undo, kind) {
  var t = $("toast"); t.className = kind === "problem" ? "toast problem" : "toast"; t.innerHTML = ""; t.appendChild(document.createTextNode(msg)); clearTimeout(toastTimer);
  if (undo) {
    var b = el("button", { type: "button", "class": "toastbtn" }, "Undo");
    on(b, "click", function () { clearTimeout(toastTimer); t.innerHTML = ""; undo(); });
    t.appendChild(b);
  }
  toastTimer = setTimeout(function () { t.innerHTML = ""; }, undo || kind === "problem" ? 7000 : 4200);
}
// Navigation only. A framed copy scrolls the host page, not this window, so every
// scroller is zeroed, the app's top is scrolled into view, and it repeats after paint.
export function scrollTop() {
  function reset() {
    try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
    try { document.documentElement.scrollTop = 0; if (document.body) document.body.scrollTop = 0; } catch (e) { /* ignore */ }
    try {
      var top = document.querySelector(".app") || document.body;
      if (top && typeof top.scrollIntoView === "function") top.scrollIntoView(true);
    } catch (e) { /* ignore */ }
  }
  reset();
  try { if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(reset); } catch (e) { /* ignore */ }
}
