/* dom helpers */
export function $(id) { return document.getElementById(id); }
export function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
export function el(tag, attrs, text) {
  var e = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  if (text !== undefined) e.textContent = text;
  return e;
}
export function on(node, ev, fn) { node.addEventListener(ev, fn); return node; }
// Plays a short sound effect. Caller decides whether sound is wanted (the
// audio setting) -- this just plays `src`, silently giving up on any
// failure (a browser blocking autoplay before the user has interacted with
// the page, a missing file, an unsupported format), since a sound effect is
// never worth surfacing an error over.
export function playSfx(src) {
  try {
    var a = new window.Audio(src), p = a.play();
    if (p && typeof p.catch === "function") p.catch(function () {});
  } catch (e) { /* no audio support */ }
}
// A pencil icon button: the app's one affordance for "change this text".
var PENCIL = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
export function pencilButton(label, title, onClick) {
  var b = el("button", { type: "button", "class": "pencil", "aria-label": label, title: title });
  b.innerHTML = PENCIL;
  if (onClick) on(b, "click", onClick);
  return b;
}
// Turns the text in `display` into an input in place. Enter or clicking away saves,
// Esc cancels. opts: { label, max, value(), onSave(v), onEmpty(), onDone() }. onDone
// runs first (so callers can restore their pencil), then onSave.
export function editInline(display, opts) {
  var input = el("input", { type: "text", "class": "inlineedit", "aria-label": opts.label, maxlength: String(opts.max || 200), autocomplete: "off" });
  input.value = opts.value();
  input.style.font = window.getComputedStyle(display).font;
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
export function scrollTop() { try { window.scrollTo(0, 0); } catch (e) { /* ignore */ } }
