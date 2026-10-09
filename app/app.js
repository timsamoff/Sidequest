import { state, ui, save, saveUI, changed, autoVault, purgeOldVault, APP_NAME, loadFromDbIfAvailable, checkForAppUpdate, nextAffirmationIndex } from "./state.js";
import { CORE, BOTTOM, isCore, validPage, pageTitle, findAnyTask, findQuest } from "./model.js";
import { $, el, on, focusKey, setFocusKey, scrollTop, notify, editInline } from "./dom.js";
import { lateTasks } from "./model.js";
import {
  renderToday, renderSchedule, renderQuests, renderWorkshop,
  renderVault, renderSettings, renderHelp, renderQuestPage, renderTimeline, setDeferredInstallPrompt, setAvailableUpdateVersion
} from "./views.js";
import { renderSearch, openSearch, closeSearch, wireSearchInput, focusSearch } from "./search.js";
import {
  taskDialog, questDialog, ideaDialog, decisionDialog, milestoneDialog, stepDialog
} from "./dialogs.js";
import { playSplash } from "./splash.js";

/* navigation */
export function leaveSearch() { if (ui.view === "search") { ui.query = ""; var b = $("searchBox"); if (b) b.value = ""; } }
export function go(view) { leaveSearch(); ui.view = view; ui.detail = false; saveUI(); renderAll(); scrollTop(); }
export function openTask(id) {
  var at = findAnyTask(id);
  if (at && at.vault) { go("vault"); notify("That task is in the Vault. Restore it to work on it."); return; }
  leaveSearch(); ui.view = "schedule"; ui.sel = id; ui.detail = true; saveUI(); renderAll(); scrollTop();
}
export var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>';
export var ICON_CANCEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
export function buildMoreMenu(pinned) {
  var m = $("moreMenu"); m.innerHTML = "";
  function item(key, label) {
    var b = el("button", { type: "button", role: "menuitem", "data-view": key, title: "Go to " + label }, label);
    if (key === ui.view) b.setAttribute("aria-current", "page");
    m.appendChild(b);
  }
  CORE.forEach(function (c) { item(c[0], c[1]); });
  if (pinned.length) { m.appendChild(el("hr")); m.appendChild(el("div", { "class": "menulabel", role: "presentation" }, "Pinned")); pinned.forEach(function (k) { item(k, pageTitle(k)); }); }
  m.appendChild(el("hr"));
  BOTTOM.forEach(function (c) { item(c[0], c[1]); });
}
export function renderChrome() {
  var nav = $("nav"); nav.innerHTML = ""; var nb = $("navBottom"); nb.innerHTML = "";
  var pinned = state.pins.filter(validPage);
  var isBottom = BOTTOM.some(function (b) { return b[0] === ui.view; });
  var active = ui.view; if (ui.view === "search") active = ""; else if (!isCore(active) && !isBottom && pinned.indexOf(active) < 0) active = "projects";
  function addTab(host, key, label, extra) {
    var b = el("button", { type: "button", "class": "tab" + (extra ? " " + extra : ""), "data-view": key });
    if (key === active) b.setAttribute("aria-current", "page");
    b.appendChild(el("span", null, label));
    if (key === "today") { var n = lateTasks().length; if (n) b.appendChild(el("span", { "class": "badge tabbadge", "aria-label": n + " overdue" }, String(n))); }
    on(b, "click", function () { go(key); });
    host.appendChild(b);
  }
  CORE.forEach(function (c) { addTab(nav, c[0], c[1]); });
  if (pinned.length) { nav.appendChild(el("div", { "class": "navlabel" }, "Pinned")); pinned.forEach(function (k) { addTab(nav, k, pageTitle(k), "pinnedtab"); }); }
  BOTTOM.forEach(function (c) { addTab(nb, c[0], c[1]); });
  var sbtn = $("searchBtn"), searching = ui.view === "search";
  sbtn.innerHTML = searching ? ICON_CANCEL : ICON_SEARCH;
  sbtn.setAttribute("aria-label", searching ? "Cancel search" : "Search"); sbtn.title = searching ? "Cancel search" : "Search";
  buildMoreMenu(pinned);
  var title = pageTitle(ui.view) || "Today";
  $("viewTitle").textContent = title;
  // The pencil next to the title renames the quest (not shown for a vaulted one).
  var cur = ui.view.indexOf("quest:") === 0 ? findQuest(ui.view.slice(6)) : null;
  $("renameBtn").hidden = !(cur && !cur.vault);
  document.title = title + " · " + APP_NAME;
}
// Names are edited in place: safe to change because tasks, pins, links, and
// milestones all point at the quest id, never its name.
function renameCurrentQuest() {
  var p = ui.view.indexOf("quest:") === 0 ? findQuest(ui.view.slice(6)) : null;
  if (!p || p.vault) return;
  $("renameBtn").hidden = true;
  editInline($("viewTitle"), {
    label: "Quest name", max: 120, value: function () { return p.name; },
    onSave: function (v) { p.name = v.slice(0, 120); changed(); },
    onEmpty: function () { notify("A quest needs a name."); },
    onDone: function () { $("renameBtn").hidden = false; }
  });
}
on($("renameBtn"), "click", renameCurrentQuest);

export function renderView() {
  var root = $("view"); root.innerHTML = "";
  if (ui.view.indexOf("quest:") === 0 && !validPage(ui.view)) ui.view = "projects";
  root.className = "content";
  if (ui.view === "today") renderToday(root);
  else if (ui.view === "schedule") renderSchedule(root);
  else if (ui.view === "projects") renderQuests(root);
  else if (ui.view === "workshop") renderWorkshop(root);
  else if (ui.view === "search") renderSearch(root);
  else if (ui.view === "vault") renderVault(root);
  else if (ui.view === "settings") renderSettings(root);
  else if (ui.view === "help") renderHelp(root);
  else if (ui.view.indexOf("quest:") === 0) renderQuestPage(root, ui.view.slice(6));
  else renderTimeline(root);
  renderChrome();
  if (focusKey) { var f = document.querySelector('[data-focus="' + focusKey + '"]'); if (f) f.focus(); setFocusKey(null); }
}
export function renderAll() { renderView(); }

export function applyTheme() {
  var th = state.settings && state.settings.theme, r = document.documentElement;
  if (th === "light" || th === "dark") r.setAttribute("data-theme", th); else r.removeAttribute("data-theme");
}
/* menus */
export function closeMenus(returnFocus) {
  ["newMenu", "moreMenu"].forEach(function (id) {
    var m = $(id), b = $(id === "newMenu" ? "newBtn" : "moreBtn");
    if (!m.hidden) { m.hidden = true; b.setAttribute("aria-expanded", "false"); if (returnFocus) b.focus(); }
  });
}
export function wireMenu(btnId, menuId) {
  var b = $(btnId), m = $(menuId);
  on(b, "click", function (e) {
    e.stopPropagation();
    var wasOpen = !m.hidden; closeMenus(false);
    if (!wasOpen) { m.hidden = false; b.setAttribute("aria-expanded", "true"); var f = m.querySelector("button"); if (f) f.focus(); }
  });
  on(m, "click", function (e) {
    var t = e.target.closest ? e.target.closest("button[data-act], button[data-view]") : null; if (!t) return;
    closeMenus(false);
    if (t.getAttribute("data-view")) { go(t.getAttribute("data-view")); return; }
    var act = t.getAttribute("data-act");
    ({ newTask: taskDialog, newStep: function () { stepDialog(); }, newQuest: questDialog, newIdea: ideaDialog, newDecision: decisionDialog, newMilestone: milestoneDialog, vault: function () { go("vault"); }, settings: function () { go("settings"); } })[act]();
  });
  on(m, "keydown", function (e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    var items = Array.prototype.slice.call(m.querySelectorAll("button")); var i = items.indexOf(document.activeElement);
    e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  });
}

// Exposed so a test can cancel the splash's own pending timers after itself.
export var cancelSplash = function () {};

// Deferred one microtask so the whole import cycle (state.js etc.) finishes evaluating first.
Promise.resolve().then(function () {
  $("brand").textContent = APP_NAME;
  applyTheme();
  autoVault(); purgeOldVault(); save();
  renderAll();

  // Decorative only -- the app has already rendered above.
  // Mutates state.settings.affirmationBucket in memory only -- it rides along
  // with the next real save() rather than forcing one of its own, so a reload
  // with no other edits in between can't make two otherwise-identical devices
  // disagree over db sync.
  cancelSplash = playSplash(state.settings.showSplash, undefined, state.settings.audio, nextAffirmationIndex) || cancelSplash;

  // Checked after first paint -- no-op on the web app, real on a published artifact with db.
  loadFromDbIfAvailable().then(function (swapped) {
    if (!swapped) return;
    autoVault(); purgeOldVault(); save();
    renderAll();
  });

  // No-op on the web app, since checkForAppUpdate() resolves null with no db.
  // The stamp read here is set by hand when a new sidequest.html is published,
  // never written by this app's own code.
  checkForAppUpdate().then(function (latest) {
    if (!latest) return;
    setAvailableUpdateVersion(latest);
    renderAll();
  });

  // PWA install path is web-build only -- a Claude artifact has no sw.js/manifest.json alongside it.
  var inClaude = !!(window.claude && typeof window.claude.use === "function");
  if (!inClaude && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  // Chrome/Edge/Android fire this once installable; stored in views.js so
  // Settings can offer a real Install button instead of guessing readiness.
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    setDeferredInstallPrompt(e);
    renderChrome();
  });
  window.addEventListener("appinstalled", function () { setDeferredInstallPrompt(null); renderChrome(); });

  wireMenu("newBtn", "newMenu"); wireMenu("moreBtn", "moreMenu");
  wireSearchInput($("searchBox"), "side");
  on($("searchBtn"), "click", function () { if (ui.view === "search") closeSearch(); else openSearch(true); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (!$("overlay").hidden) return;
    e.preventDefault(); focusSearch();
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest(".menuwrap")) closeMenus(false);
  });
});
