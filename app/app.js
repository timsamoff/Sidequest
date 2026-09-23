import { state, ui, save, saveUI, autoArchive, archivedToast, APP_NAME, loadFromDbIfAvailable } from "./state.js";
import { CORE, BOTTOM, isCore, validPage, pageTitle, findAnyTask } from "./model.js";
import { $, el, on, focusKey, setFocusKey, scrollTop, notify } from "./dom.js";
import { lateTasks } from "./model.js";
import {
  renderToday, renderSchedule, renderKofi, renderProjects, renderParkingLot,
  renderArchive, renderSettings, renderHelp, renderProjectPage, renderTimeline
} from "./views.js";
import { renderSearch, openSearch, closeSearch, wireSearchInput, focusSearch } from "./search.js";
import {
  taskDialog, projectDialog, ideaDialog, decisionDialog, milestoneDialog, slipDialog, stepDialog
} from "./dialogs.js";

/* navigation */
export function leaveSearch() { if (ui.view === "search") { ui.query = ""; var b = $("searchBox"); if (b) b.value = ""; } }
export function go(view) { leaveSearch(); ui.view = view; ui.detail = false; saveUI(); renderAll(); scrollTop(); }
export function openTask(id) {
  var at = findAnyTask(id);
  if (at && at.arch) { go("archive"); notify("That task is in the Archive. Restore it to work on it."); return; }
  leaveSearch(); ui.view = "schedule"; ui.sel = id; ui.detail = true; saveUI(); renderAll(); scrollTop();
}
export var ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>';
export var ICON_CANCEL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
export function buildMoreMenu(pinned) {
  var m = $("moreMenu"); m.innerHTML = "";
  function item(key, label) {
    var b = el("button", { type: "button", role: "menuitem", "data-view": key }, label);
    if (key === ui.view) b.setAttribute("aria-current", "page");
    m.appendChild(b);
  }
  CORE.forEach(function (c) { item(c[0], c[1]); });
  if (pinned.length) { m.appendChild(el("hr")); m.appendChild(el("div", { "class": "menulabel", role: "presentation" }, "Pinned")); pinned.forEach(function (k) { item(k, pageTitle(k)); }); }
  m.appendChild(el("hr"));
  BOTTOM.forEach(function (c) { item(c[0], c[1]); });
  m.appendChild(el("hr"));
  m.appendChild(el("button", { type: "button", role: "menuitem", "data-act": "slip" }, "Slip the schedule"));
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
  document.title = title + " · " + APP_NAME;
}

export function renderView() {
  var root = $("view"); root.innerHTML = "";
  if (ui.view.indexOf("proj:") === 0 && !validPage(ui.view)) ui.view = "projects";
  root.className = "content" + (ui.view === "timeline" ? " wide" : "");
  if (ui.view === "today") renderToday(root);
  else if (ui.view === "schedule") renderSchedule(root);
  else if (ui.view === "kofi") renderKofi(root);
  else if (ui.view === "projects") renderProjects(root);
  else if (ui.view === "parking") renderParkingLot(root);
  else if (ui.view === "search") renderSearch(root);
  else if (ui.view === "archive") renderArchive(root);
  else if (ui.view === "settings") renderSettings(root);
  else if (ui.view === "help") renderHelp(root);
  else if (ui.view.indexOf("proj:") === 0) renderProjectPage(root, ui.view.slice(5));
  else renderTimeline(root);
  renderChrome();
  if (focusKey) { var f = document.querySelector('[data-focus="' + focusKey + '"]'); if (f) f.focus(); setFocusKey(null); }
}
export function renderAll() { renderView(); }

export function applyTheme() {
  var th = state.settings && state.settings.theme, r = document.documentElement;
  if (th === "light" || th === "dark") r.setAttribute("data-theme", th); else r.removeAttribute("data-theme");
}
export function launchNote() { return ""; }

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
    ({ newTask: taskDialog, newBacklog: function () { taskDialog(undefined, true); }, newStep: function () { stepDialog(false); }, newProject: projectDialog, newIdea: ideaDialog, newDecision: decisionDialog, newMilestone: milestoneDialog, slip: slipDialog, archive: function () { go("archive"); }, settings: function () { go("settings"); } })[act]();
  });
  on(m, "keydown", function (e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    var items = Array.prototype.slice.call(m.querySelectorAll("button")); var i = items.indexOf(document.activeElement);
    e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  });
}

// Boot sequence. Deferred one microtask past module evaluation: app.js sits in a
// genuine import cycle with state.js/views.js/dialogs.js/search.js (confirmed
// acceptable, see DESIGN.md), and a module graph this cyclic can evaluate this
// entry module's own top-level code before every module it transitively imports
// has finished its own top-level evaluation, depending on which module the loader
// happens to enter the graph from. Deferring the boot sequence past microtask
// queue drain guarantees the whole graph (including state.js's `state = load()`)
// has finished evaluating first, regardless of traversal order.
Promise.resolve().then(function () {
  $("brand").textContent = APP_NAME;
  applyTheme();
  var bootIds = autoArchive(); if (bootIds.length) save();
  renderAll();
  if (bootIds.length) archivedToast(bootIds);

  // If this view is running as a published Claude artifact with the db
  // capability granted, its saved state lives there, not in this browser's
  // localStorage -- check for it after the page has already painted once
  // (never blocks first render on an async capability lookup). On the web
  // app, getDb() resolves null immediately and this is a no-op. See
  // DESIGN.md's "Claude Artifact parity version" section.
  loadFromDbIfAvailable().then(function (swapped) {
    if (!swapped) return;
    var swappedIds = autoArchive(); if (swappedIds.length) save();
    renderAll();
    if (swappedIds.length) archivedToast(swappedIds);
  });

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
