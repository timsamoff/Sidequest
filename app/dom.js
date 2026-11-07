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
// True when running as a hosted artifact: inside Claude, or any host that sets window.sidequestHosted. Wording about where data lives and the web-only features follow this; Claude-only abilities use inClaude().
export function isHosted() {
  try { return inClaude() || window.sidequestHosted === true; } catch (e) { return false; }
}
// Plays a short sound effect, silently giving up on any failure (autoplay
// blocked, missing file) since a sound effect is never worth surfacing an error
// over. `volume` is optional, 0 to 1.
export function playSfx(src, volume) {
  try {
    var a = new window.Audio(src);
    if (volume !== undefined) a.volume = volume;
    var p = a.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  } catch (e) { /* no audio support */ }
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
// Reads a typed or pasted amount as a number, or "" if it is not one. Either style is accepted:
// when both separators appear the later one is the decimal point, and a lone separator followed
// by exactly three digits is the style's thousands separator.
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
export function notify(msg, undo) {
  var t = $("toast"); t.innerHTML = ""; t.appendChild(document.createTextNode(msg)); clearTimeout(toastTimer);
  if (undo) {
    var b = el("button", { type: "button", "class": "toastbtn" }, "Undo");
    on(b, "click", function () { clearTimeout(toastTimer); t.innerHTML = ""; undo(); });
    t.appendChild(b);
  }
  toastTimer = setTimeout(function () { t.innerHTML = ""; }, undo ? 7000 : 4200);
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
