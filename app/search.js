import { state, ui } from "./state.js";
import { parseISO, fmt, fmtY } from "./dates.js";
import { taskStart, taskEnd, dispProject, projectNames, liveCands, projectMeta, short, validPage } from "./model.js";
import { $, el, on, scrollTop } from "./dom.js";
import { go, openTask, renderAll } from "./app.js";

/* search */
export var SEARCH_LABELS = { task: "Tasks", step: "Steps", project: "Projects", idea: "Ideas", decision: "Decisions", milestone: "Milestones" };
export var SEARCH_ORDER = ["task", "step", "project", "idea", "decision", "milestone"];
export var searchFlat = [];
export function escRe(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
export function searchTerms(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
export function highlight(text, terms) {
  var frag = document.createDocumentFragment();
  if (!terms.length) { frag.appendChild(document.createTextNode(text)); return frag; }
  var parts = text.split(new RegExp("(" + terms.map(escRe).join("|") + ")", "gi"));
  parts.forEach(function (part, i) { if (!part) return; if (i % 2 === 1) frag.appendChild(el("mark", null, part)); else frag.appendChild(document.createTextNode(part)); });
  return frag;
}
export function snippetOf(text, terms) {
  var flat = text.replace(/\s+/g, " "), low = flat.toLowerCase(), at = -1;
  terms.forEach(function (t) { var i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; });
  if (at < 0) return null;
  var a = Math.max(0, at - 40), b = Math.min(flat.length, at + 110);
  return (a > 0 ? "…" : "") + flat.slice(a, b) + (b < flat.length ? "…" : "");
}
export function searchAll(q, includeArchive) {
  var terms = searchTerms(q), groups = {};
  SEARCH_ORDER.forEach(function (k) { groups[k] = []; });
  function consider(kind, title, fields, sub, open, arch, fieldLabels) {
    if (arch && !includeArchive) return;
    var hay = [title].concat(fields).filter(Boolean).join("\n").toLowerCase();
    for (var i = 0; i < terms.length; i++) if (hay.indexOf(terms[i]) < 0) return;
    var tl = title.toLowerCase(), inTitle = terms.every(function (t) { return tl.indexOf(t) >= 0; });
    var snip = null;
    for (var j = 0; j < fields.length; j++) {
      var lbl = fieldLabels ? fieldLabels[j] : "";
      if (!fields[j] || !lbl) continue;
      var sn = snippetOf(fields[j], terms); if (sn) { snip = { label: lbl, text: sn }; break; }
    }
    groups[kind].push({ kind: kind, title: title, sub: sub, snip: snip, arch: !!arch, score: inTitle ? 2 : 0, idx: groups[kind].length, open: open });
  }
  state.tasks.forEach(function (t) {
    var when = t.block === 0 ? "Backlog" : fmt(taskStart(t)) + " to " + fmt(taskEnd(t));
    consider("task", t.what, [t.notes, t.done, t.project, dispProject(t)], dispProject(t) + " · " + when + " · " + t.status, function () { if (t.arch) go("archive"); else openTask(t.id); }, !!t.arch, ["Notes", "Done when", "", ""]);
    t.steps.forEach(function (st) {
      consider("step", st.text, [], "Step of " + dispProject(t) + ": " + short(t.what, 50) + (st.done ? " · done" : ""), function () { if (t.arch) go("archive"); else openTask(t.id); }, !!t.arch);
    });
  });
  projectNames().forEach(function (n) {
    var cand = liveCands().filter(function (c) { return c.name === n; })[0];
    consider("project", n, [state.pnotes[n], cand && cand.note], projectMeta(n), function () { go(validPage("proj:" + n) ? "proj:" + n : "projects"); }, false, ["Notes", "Note"]);
  });
  state.candidates.forEach(function (c) { if (c.arch) consider("project", c.name, [c.note], "Archived project", function () { go("archive"); }, true, ["Note"]); });
  state.parked.forEach(function (p) { consider("idea", p.text, [p.note], "Parking lot", function () { go(p.arch ? "archive" : "parking"); }, !!p.arch, ["Note"]); });
  state.decisions.forEach(function (d) { consider("decision", d.q, [d.a], d.a ? "Decided" : "Open", function () { go(d.arch ? "archive" : "kofi"); }, !!d.arch, ["Answer"]); });
  state.milestones.forEach(function (m) { consider("milestone", m.text, [fmtY(parseISO(m.date)), m.date], fmtY(parseISO(m.date)), function () { go(m.arch ? "archive" : "timeline"); }, !!m.arch); });
  SEARCH_ORDER.forEach(function (k) { groups[k].sort(function (a, b) { return b.score - a.score || a.idx - b.idx; }); });
  return { terms: terms, groups: groups };
}
export function updateSearchResults() {
  var box = $("searchResults"); if (!box) return;
  box.innerHTML = ""; searchFlat.length = 0;
  var status = $("searchStatus"), q = ui.query.trim();
  if (!q) { if (status) status.textContent = ""; box.appendChild(el("p", { "class": "hint" }, "Type to search tasks, steps, notes, projects, ideas, decisions, and milestones. Enter opens the first result.")); return; }
  var res = searchAll(q, ui.searchArchive), total = 0;
  SEARCH_ORDER.forEach(function (k) { total += res.groups[k].length; });
  if (status) status.textContent = total + (total === 1 ? " result" : " results");
  if (!total) {
    box.appendChild(el("p", { "class": "hint" }, "No matches for “" + q + "”." + (ui.searchArchive ? "" : " Try including the Archive.")));
    return;
  }
  var CAP = 30;
  SEARCH_ORDER.forEach(function (k) {
    var list = res.groups[k]; if (!list.length) return;
    var sec = el("section", { "class": "sgroup", "data-kind": k });
    sec.appendChild(el("h3", null, SEARCH_LABELS[k] + " (" + list.length + ")"));
    var ul = el("ul", { "class": "tlist", style: "margin-top:10px" });
    list.slice(0, CAP).forEach(function (r) {
      searchFlat.push(r);
      var li = el("li"), b = el("button", { type: "button", "class": "item" });
      var l1 = el("div", { "class": "l1" }); l1.appendChild(document.createTextNode(r.sub)); if (r.arch) { l1.appendChild(document.createTextNode(" ")); l1.appendChild(el("span", { "class": "chip arch" }, "Archived")); }
      b.appendChild(l1);
      var l2 = el("div", { "class": "l2" }); l2.appendChild(highlight(r.title, res.terms)); b.appendChild(l2);
      if (r.snip) { var sn = el("div", { "class": "snip" }); if (r.snip.label) sn.appendChild(document.createTextNode(r.snip.label + ": ")); sn.appendChild(highlight(r.snip.text, res.terms)); b.appendChild(sn); }
      on(b, "click", function () { r.open(); });
      li.appendChild(b); ul.appendChild(li);
    });
    sec.appendChild(ul);
    if (list.length > CAP) sec.appendChild(el("p", { "class": "hint" }, (list.length - CAP) + " more. Add a word to narrow the search."));
    box.appendChild(sec);
  });
}
export function setQuery(q, from) {
  ui.query = q;
  var sb = $("searchBox"), mb = $("searchMain");
  if (sb && from !== "side") sb.value = q;
  if (mb && from !== "main") mb.value = q;
}
export function openSearch(focusMain) {
  if (ui.view !== "search") { ui.prev = ui.view; ui.view = "search"; ui.detail = false; renderAll(); scrollTop(); }
  if (focusMain) { var m = $("searchMain"); if (m) m.focus(); }
}
export function closeSearch() { setQuery("", ""); ui.view = ui.prev || "today"; if (ui.view === "search") ui.view = "today"; renderAll(); }
export function firstResult() { return searchFlat[0] || null; }
export function wireSearchInput(inp, from) {
  on(inp, "input", function () {
    setQuery(inp.value, from);
    if (!ui.query.trim() && from === "side") { if (ui.view === "search") closeSearch(); return; }
    if (ui.view !== "search") openSearch(false); else updateSearchResults();
  });
  on(inp, "keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); setQuery("", ""); if (ui.view === "search") closeSearch(); inp.blur(); }
    else if (e.key === "Enter") { var r = firstResult(); if (r) { e.preventDefault(); r.open(); } }
  });
}
export function focusSearch() {
  var box = $("searchBox");
  if (box && box.offsetParent !== null) { box.focus(); box.select(); return; }
  openSearch(true);
}
export function renderSearch(root) {
  var bar = el("div", { "class": "searchbar" });
  var inp = el("input", { type: "search", id: "searchMain", placeholder: "Search tasks, steps, notes, projects, decisions", "aria-label": "Search", autocomplete: "off" }); inp.value = ui.query;
  wireSearchInput(inp, "main"); bar.appendChild(inp);
  var lab = el("label"), cb = el("input", { type: "checkbox", id: "searchArch" }); cb.checked = ui.searchArchive;
  on(cb, "change", function () { ui.searchArchive = cb.checked; updateSearchResults(); });
  lab.appendChild(cb); lab.appendChild(document.createTextNode("Include the Archive")); bar.appendChild(lab);
  root.appendChild(bar);
  root.appendChild(el("p", { "class": "msg", id: "searchStatus", role: "status", "aria-live": "polite" }));
  root.appendChild(el("div", { id: "searchResults" }));
  updateSearchResults();
}
