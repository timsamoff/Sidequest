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
