import { state, ui, save, changed, autoVault, purgeOldVault, APP_NAME, APP_VERSION, loadFromDbIfAvailable, checkForAppUpdate, pickAffirmation } from "./state.js";
import { CORE, BOTTOM, isCore, validPage, pageTitle, findAnyTask, findQuest, isLooseIssue, lateTasks, questNameTaken } from "./model.js";
import { $, el, on, focusKey, setFocusKey, scrollTop, scrollToRow, notify, editInline, playSfx, inClaude, isStandalone } from "./dom.js";
import { TODAY } from "./dates.js";
import { renderJobs } from "./errands.js";
import { renderHelp } from "./help.js";
import { alignStatuses, renderQuestPage } from "./quest-page.js";
import { renderSettings, setDeferredInstallPrompt, setInstalledThisSession } from "./settings.js";
import { renderToday, renderSchedule, renderQuests, renderWorkshop, renderVault, renderTimeline, setAvailableUpdateVersion } from "./views.js";
import { renderSearch, openSearch, closeSearch, wireSearchInput, focusSearch } from "./search.js";
import {
  taskDialog, questDialog, ideaDialog, jobDialog, decisionDialog, stepDialog, issueDialog
} from "./dialogs.js";
import { playSplash } from "./splash.js";
import { noteBurnView } from "./chart.js";
import { stopTutorial } from "./tutorial.js";

/* navigation */
export function leaveSearch() { if (ui.view === "search") { ui.query = ""; var b = $("searchBox"); if (b) b.value = ""; } }
export function go(view) { leaveSearch(); ui.view = view; ui.detail = false; renderAll(); scrollTop(); }
export function openTask(id) {
  var at = findAnyTask(id);
  if (at && at.vault) { go("vault"); notify("That task is in the Vault. Restore it to work on it.", null, "problem"); return; }
  // An issue with no due date is not on the Tasks page, so it opens in place on its quest's page.
  if (at && isLooseIssue(at) && findQuest(at.questId)) { ui.questOpen[at.questId] = id; go("quest:" + at.questId); landOnTask(id); return; }
  leaveSearch(); ui.view = "schedule"; ui.sel = id; ui.detail = true; renderAll(); scrollTop(); landOnTask(id);
}
// After a search or link opens a task, scrolls its row to just under the header. It waits for the page-top reset.
function landOnTask(id) {
  setTimeout(function () {
    var row = document.getElementById("ptask-" + id) || document.getElementById("itask-" + id) || document.querySelector('#view .listpane [aria-current="true"]');
    scrollToRow(row);
  }, 80);
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
  var active = ui.view; if (ui.view === "search") active = ""; else if (!isCore(active) && !isBottom && pinned.indexOf(active) < 0) {
    var shown = active.indexOf("quest:") === 0 ? findQuest(active.slice(6)) : null;
    active = shown && shown.vault ? "vault" : "projects";
  }
  function addTab(host, key, label, extra) {
    var b = el("button", { type: "button", "class": "tab" + (extra ? " " + extra : ""), "data-view": key });
    if (key === active) b.setAttribute("aria-current", "page");
    b.appendChild(el("span", null, label));
    if (key === "today") { var n = lateTasks().length; if (n) b.appendChild(el("span", { "class": "badge tabbadge", "aria-label": n + " overdue" }, String(n))); }
    on(b, "click", function () { go(key); });
    host.appendChild(b);
  }
  CORE.forEach(function (c) { addTab(nav, c[0], c[1]); });
  // Pinned quests are the only part of the sidebar meant to scroll -- CORE
  // above and navBottom below always keep their own full, fixed height.
  if (pinned.length) {
    var pinnedWrap = el("div", { "class": "pinnedwrap" });
    pinnedWrap.appendChild(el("div", { "class": "navlabel" }, "Pinned"));
    pinned.forEach(function (k) { addTab(pinnedWrap, k, pageTitle(k), "pinnedtab"); });
    nav.appendChild(pinnedWrap);
  }
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
    onSave: function (v) {
      var other = questNameTaken(v, p.id);
      if (other) { notify("A quest named “" + other.name + "” already exists. Choose another name.", null, "problem"); return; }
      p.name = v.slice(0, 120); changed();
    },
    onEmpty: function () { notify("A quest needs a title.", null, "problem"); },
    onDone: function () { $("renameBtn").hidden = false; }
  });
}
on($("renameBtn"), "click", renameCurrentQuest);
// On narrow screens the page name is a heading under the leather header; on wide ones it sits in the bar.
if (typeof window.matchMedia === "function") {
  var narrowBar = window.matchMedia("(max-width: 639px), (max-width: 899px) and (orientation: portrait), (max-width: 899px) and (not (pointer: coarse))");
  var placeTitle = function () { ($("pageHead") && narrowBar.matches ? $("pageHead") : document.querySelector(".tbleft")).appendChild($("titleRow")); };
  placeTitle();
  if (narrowBar.addEventListener) narrowBar.addEventListener("change", placeTitle);
}

// Installed PWA only (display-mode or navigator.standalone), computed once per session since it cannot change.
var isStandaloneApp = isStandalone();
if (isStandaloneApp) {
  $("refreshBtn").hidden = false;
  on($("refreshBtn"), "click", function () {
    var btn = $("refreshBtn");
    btn.classList.add("spinning"); btn.disabled = true;
    function doRefresh() {
      // Force a service-worker update check and clear its cache before reloading, so a new app shell is picked up.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.update(); }));
        }).then(function () {
          return "caches" in window ? caches.keys().then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); }) : null;
        }).then(function () { window.location.reload(); }).catch(function () { window.location.reload(); });
      } else {
        window.location.reload();
      }
    }
    // The reload would cut the sound off, so it waits out the 2.4s clip; with
    // sound off it waits one 0.6s spin (reduced motion skips the spin only).
    var sound = state.settings.audio;
    if (sound) playSfx("../assets/sfx/refresh.mp3", 0.25);
    setTimeout(doRefresh, sound ? 2400 : 600);
  });
}

// "Open tab in app" (and install) moves this page into the app window without
// reloading it, so it would stay on its old view with no splash. Reload once it
// becomes the installed app for a normal launch.
if (!isStandaloneApp && typeof window.matchMedia === "function") {
  var standaloneQuery = window.matchMedia("(display-mode: standalone)");
  if (standaloneQuery && typeof standaloneQuery.addEventListener === "function") {
    standaloneQuery.addEventListener("change", function (e) { if (e.matches) window.location.reload(); });
  }
}

// The quest page showing on the last draw, so leaving it can close its open task.
var lastQuestView = null;
var lastView = null;
export function renderView() {
  var root = $("view");
  // A redraw of the same page keeps its scroll position; emptying the page lets a phone jump it.
  var keepY = ui.view === lastView && document.body.style.position !== "fixed" ? (window.pageYOffset || 0) : null;
  // The page keeps its height while it redraws, so a framed copy's host page is not clamped to the bottom.
  root.style.minHeight = root.offsetHeight + "px";
  root.innerHTML = "";
  if (ui.view.indexOf("quest:") === 0 && !validPage(ui.view)) ui.view = "projects";
  noteBurnView(ui.view);
  var questView = ui.view.indexOf("quest:") === 0 ? ui.view : null;
  if (lastQuestView && lastQuestView !== questView) ui.questOpen = {};
  lastQuestView = questView;
  root.className = "content";
  if (ui.view === "today") renderToday(root);
  else if (ui.view === "schedule") renderSchedule(root);
  else if (ui.view === "projects") renderQuests(root);
  else if (ui.view === "workshop") renderWorkshop(root);
  else if (ui.view === "jobs") renderJobs(root);
  else if (ui.view === "search") renderSearch(root);
  else if (ui.view === "vault") renderVault(root);
  else if (ui.view === "settings") renderSettings(root);
  else if (ui.view === "help") renderHelp(root);
  else if (ui.view.indexOf("quest:") === 0) renderQuestPage(root, ui.view.slice(6));
  else renderTimeline(root);
  renderChrome();
  alignStatuses(root);
  root.style.minHeight = "";
  if (keepY !== null) { try { window.scrollTo(0, keepY); } catch (e) { /* ignore */ } }
  lastView = ui.view;
  if (focusKey) { var f = document.querySelector('[data-focus="' + focusKey + '"]'); if (f) f.focus({ preventScroll: true }); setFocusKey(null); }
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
    ({ newTask: taskDialog, newStep: function () { stepDialog(); }, newQuest: questDialog, newIdea: ideaDialog, newJob: jobDialog, newDecision: decisionDialog, newIssue: issueDialog, vault: function () { go("vault"); }, settings: function () { go("settings"); } })[act]();
  });
  on(m, "keydown", function (e) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    var items = Array.prototype.slice.call(m.querySelectorAll("button")); var i = items.indexOf(document.activeElement);
    e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  });
}

// Exposed so a test can cancel the splash's pending timers after itself.
export var cancelSplash = function () {};
export var cancelTutorial = stopTutorial;

// Plays the launch sequence again on demand (after a backup restore).
export function replaySplash() {
  cancelSplash();
  cancelSplash = playSplash(state.settings.showSplash, undefined, state.settings.audio, pickAffirmation) || cancelSplash;
}

// Deferred one microtask so the whole import cycle (state.js etc.) finishes evaluating first.
Promise.resolve().then(function () {
  // A reload starts at the top, not wherever the browser last scrolled.
  try { window.history.scrollRestoration = "manual"; } catch (e) { /* ignore */ }
  scrollTop();
  $("brand").textContent = APP_NAME;
  applyTheme();
  // A first run records the version without a banner; later runs on a newer version show it (see versionBanner()).
  if (!state.settings.seenVersion) state.settings.seenVersion = APP_VERSION;
  autoVault(); purgeOldVault(); save();
  renderAll();

  // Decorative only -- the app has already rendered above.
  // The quote bucket is saved to local storage only, never the db or sync stamp.
  cancelSplash = playSplash(state.settings.showSplash, undefined, state.settings.audio, pickAffirmation) || cancelSplash;
  // Checked after first paint -- no-op on the web app, real on a published artifact with db.
  var dbLoaded = loadFromDbIfAvailable();
  dbLoaded.then(function (swapped) {
    if (!swapped) return;
    autoVault(); purgeOldVault(); save();
    renderAll();
  });

  // No-op on the web app. Checks the db stamp and the latest GitHub release; both fail silently.
  checkForAppUpdate().then(function (latest) {
    if (!latest) return;
    setAvailableUpdateVersion(latest);
    renderAll();
  });

  // PWA install path is web-build only -- a Claude artifact has no sw.js/manifest.json alongside it.
  if (!inClaude() && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  // Chrome/Edge/Android fire this once installable; stored in views.js so
  // Settings can offer a real Install button instead of guessing readiness.
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    setDeferredInstallPrompt(e);
    // The event can arrive after Options is already drawn, which would leave the unknown-status copy up.
    if (ui.view === "settings") renderAll(); else renderChrome();
  });
  // Chrome may move the open page into the app window without a reload, so reload for a normal launch.
  // A page that stays in a browser tab just redraws Options as installed.
  window.addEventListener("appinstalled", function () {
    setDeferredInstallPrompt(null);
    setTimeout(function () {
      if (isStandalone()) { window.location.reload(); return; }
      setInstalledThisSession(true);
      renderAll();
    }, 300);
  });

  // TODAY is fixed when the page loads, so a page left open overnight reloads when it is next looked at.
  function reloadOnNewDay() {
    var n = new Date();
    if (document.visibilityState === "hidden" || Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) === TODAY) return;
    if (!$("overlay").hidden) return;
    window.location.reload();
  }
  // The status pulldowns on task rows follow their titles when the width changes or the fonts arrive.
  window.addEventListener("resize", function () { alignStatuses($("view")); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { alignStatuses($("view")); });
  document.addEventListener("visibilitychange", reloadOnNewDay);
  window.addEventListener("focus", reloadOnNewDay);

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
