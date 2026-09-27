import { state } from "./state.js";
import { fmt, fmtY, addDays, addMonths, parseISO, TODAY } from "./dates.js";
import { totalUnits, checkpoints, planned, chartStart, counted, taskStart, taskEnd, chosen, live, dispProject, findProject, projectBurn, projectBurnTasks, burnTasks, short } from "./model.js";
import { el, on } from "./dom.js";

export function svgEl(tag, attrs, text) {
  var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  if (text !== undefined) e.textContent = text; return e;
}
// Dismisses a tap-opened tooltip when the user taps anywhere that is not a chart
// (a tap elsewhere does not blur the chart on every phone browser).
var dismissTip = null;
if (typeof document !== "undefined") document.addEventListener("pointerdown", function (e) {
  if (dismissTip && !(e.target && e.target.closest && e.target.closest("svg.chart"))) dismissTip();
});

// Draws a burndown. cfg: { cps, planned[], actual[] (null = no point), total, label,
// marks[] ({ms, text}) for milestone diamonds on the axis, tip(i) -> the text for week i }.
// Shared by the global chart and each project's chart. Each week is a full-height
// hover column and the chart is ONE keyboard stop: Left and Right move between weeks
// and milestones, Home and End jump, Esc closes. The same text shows on mouse hover,
// on tap, and on keyboard focus, in a small tooltip that is also a live region, so it
// reaches phones and screen readers (a native SVG <title> reaches neither).
function renderBurn(host, wide, cfg) {
  host.innerHTML = "";
  host.style.position = "relative";
  var cps = cfg.cps, n = cps.length, pl = cfg.planned, acts = cfg.actual;
  var ymax = Math.max(cfg.total, 1); acts.forEach(function (a) { if (a !== null && a > ymax) ymax = a; });
  var tick = Math.max(1, Math.ceil(ymax / 8));
  var W = wide ? 960 : 640, H = wide ? 320 : 300, L = 40, R = 18, T = 16, B = 44;
  var svg = svgEl("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "group", tabindex: "0" });
  svg.setAttribute("aria-label", cfg.label + " Use the left and right arrow keys to move between weeks.");
  function x(i) { return L + (W - L - R) * i / (n - 1); }
  function y(v) { return T + (H - T - B) * (1 - v / ymax); }
  for (var v = 0; v <= ymax; v += tick) {
    svg.appendChild(svgEl("line", { "class": "grid", x1: L, x2: W - R, y1: y(v), y2: y(v) }));
    svg.appendChild(svgEl("text", { "class": "axis", x: L - 10, y: y(v) + 4, "text-anchor": "end" }, String(v)));
  }
  // Thin the date labels on a long axis so they never run together.
  var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 70))));
  cps.forEach(function (ms, i) { if (i % every === 0 || i === n - 1) svg.appendChild(svgEl("text", { "class": "axis", x: x(i), y: H - 16, "text-anchor": "middle" }, fmt(ms))); });
  svg.appendChild(svgEl("polyline", { "class": "planned", points: pl.map(function (p, i) { return x(i) + "," + y(p); }).join(" ") }));
  var seg = [];
  function flush() { if (seg.length > 1) svg.appendChild(svgEl("polyline", { "class": "actual", points: seg.join(" ") })); seg = []; }
  acts.forEach(function (a, i) { if (a === null) { flush(); return; } seg.push(x(i) + "," + y(a)); });
  flush();
  acts.forEach(function (a, i) { if (a !== null) svg.appendChild(svgEl("circle", { "class": "dot", cx: x(i), cy: y(a), r: 5.5 })); });

  // Everything the user can point at or arrow to, left to right.
  var guide = svgEl("line", { "class": "guide", x1: 0, x2: 0, y1: T, y2: H - B });
  guide.style.display = "none"; svg.appendChild(guide);
  var stops = [];
  cps.forEach(function (ms, i) {
    var x0 = i === 0 ? L : (x(i - 1) + x(i)) / 2, x1 = i === n - 1 ? W - R : (x(i) + x(i + 1)) / 2;
    var hit = svgEl("rect", { "class": "hit", x: x0, y: T, width: Math.max(1, x1 - x0), height: H - B - T });
    svg.appendChild(hit);
    var ys = [y(pl[i])]; if (acts[i] !== null) ys.push(y(acts[i]));
    stops.push({ x: x(i), y: Math.min.apply(null, ys), text: cfg.tip ? cfg.tip(i) : fmtY(cps[i]), el: hit, week: i, order: 0 });
  });
  (cfg.marks || []).forEach(function (m) {
    if (m.ms < cps[0] || m.ms > cps[n - 1]) return;
    var cx = L + (W - L - R) * (m.ms - cps[0]) / (cps[n - 1] - cps[0]), cy = y(0), r = 6;
    svg.appendChild(svgEl("polygon", { "class": "mark", points: cx + "," + (cy - r) + " " + (cx + r) + "," + cy + " " + cx + "," + (cy + r) + " " + (cx - r) + "," + cy }));
    var mh = svgEl("circle", { "class": "hit", cx: cx, cy: cy, r: 11 });
    svg.appendChild(mh);
    stops.push({ x: cx, y: cy, text: m.text + ", " + fmtY(m.ms), el: mh, week: -1, order: 1 });
  });
  stops.sort(function (p, q) { return p.x - q.x || p.order - q.order; });

  var tip = el("div", { "class": "charttip", role: "status", "aria-live": "polite" }); tip.hidden = true;
  host.appendChild(svg); host.appendChild(tip);
  var cur = -1, pinned = false;
  function hide() { cur = -1; tip.hidden = true; guide.style.display = "none"; }
  function show(k) {
    cur = k; var s = stops[k];
    tip.textContent = s.text; tip.hidden = false;
    guide.setAttribute("x1", s.x); guide.setAttribute("x2", s.x); guide.style.display = "";
    var r = svg.getBoundingClientRect(), hr = host.getBoundingClientRect(), sc = r.width / W;
    var px = (r.left - hr.left) + s.x * sc, py = (r.top - hr.top) + s.y * sc, w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(0, Math.min(px - w / 2, hr.width - w)) + "px";
    tip.style.top = (py - h - 12 < 0 ? py + 14 : py - h - 12) + "px";
  }
  // Where a keyboard user lands first: the latest week that has an actual point.
  function startStop() {
    var best = 0;
    stops.forEach(function (s, k) { if (s.week >= 0 && acts[s.week] !== null) best = k; });
    return best;
  }
  stops.forEach(function (s, k) {
    on(s.el, "mouseenter", function () { show(k); });
    on(s.el, "mouseleave", function () { if (!pinned) hide(); });
    on(s.el, "click", function () { pinned = true; dismissTip = clear; show(k); });
  });
  function clear() { pinned = false; hide(); }
  on(svg, "focus", function () { pinned = true; dismissTip = clear; if (cur < 0) show(startStop()); });
  on(svg, "blur", clear);
  // The focus ring is for keyboard users: hide it when focus came from a tap or click,
  // and bring it back the moment a key is pressed.
  on(svg, "pointerdown", function () { svg.classList.add("nofocusring"); });
  on(svg, "keydown", function (e) {
    svg.classList.remove("nofocusring");
    var nk = cur;
    if (e.key === "ArrowRight") nk = cur < 0 ? 0 : Math.min(stops.length - 1, cur + 1);
    else if (e.key === "ArrowLeft") nk = cur < 0 ? stops.length - 1 : Math.max(0, cur - 1);
    else if (e.key === "Home") nk = 0;
    else if (e.key === "End") nk = stops.length - 1;
    else if (e.key === "Escape") { if (cur >= 0) { e.preventDefault(); e.stopPropagation(); clear(); } return; }
    else return;
    e.preventDefault(); pinned = true; show(nk);
  });
}

// The text for one week: planned and actual counts, then which tasks finish and which
// were completed. The planned line is exact, so it can name the tasks that finish;
// the actual line is a weekly snapshot and steps carry no timestamps, so it can only
// say which tasks were completed that week (from doneAt), never which task caused a drop.
function nameList(ts, withProject) {
  var names = ts.slice(0, 6).map(function (t) { return (withProject ? dispProject(t) + ": " : "") + t.what; });
  return names.join(", ") + (ts.length > 6 ? ", and " + (ts.length - 6) + " more" : "");
}
function weekTip(cps, i, pl, act, tasks, span, withProject) {
  var lines = ["Week of " + fmtY(cps[i]), "Planned: " + pl[i] + " remaining"];
  if (act[i] !== null) lines.push("Actual: " + act[i] + " remaining");
  var fin = tasks.filter(function (t) { var e = taskEnd(t); return e <= cps[i] && (i === 0 || e > cps[i - 1]); });
  if (fin.length) lines.push("Finishing: " + nameList(fin, withProject));
  var done = tasks.filter(function (t) { if (!t.doneAt) return false; var d = parseISO(t.doneAt); return d >= cps[i] && d < cps[i] + span; });
  if (done.length) lines.push("Completed this week: " + nameList(done, withProject));
  return lines.join("\n");
}

export function drawChart(host, wide) {
  var total = totalUnits(), cps = checkpoints(), n = cps.length;
  var acts = state.actual.map(function (a, i) { return (a === null && i === 0) ? total : a; });
  var pl = cps.map(planned), tasks = burnTasks();
  renderBurn(host, wide, {
    cps: cps, planned: pl, actual: acts, total: total,
    label: "Burndown chart. Planned items remaining fall from " + pl[0] + " to " + pl[n - 1] + " between " + fmt(cps[0]) + " and " + fmt(cps[n - 1]) + ".",
    tip: function (i) { return weekTip(cps, i, pl, acts, tasks, 7 * 86400000, true); }
  });
}

// One project's own burndown.
export function drawProjectChart(host, p, wide) {
  var bd = projectBurn(p);
  if (!bd) { host.innerHTML = ""; return false; }
  var cps = bd.cps, n = cps.length, pl = bd.planned, span = 7 * bd.step * 86400000;
  var marks = live(state.milestones).filter(function (m) { return m.projectId === p.id; }).map(function (m) { return { ms: parseISO(m.date), text: m.text }; });
  renderBurn(host, wide, {
    cps: cps, planned: pl, actual: bd.actual, total: bd.total, marks: marks,
    label: "Burndown chart for " + p.name + ". Planned steps remaining fall from " + pl[0] + " to " + pl[n - 1] + " between " + fmt(cps[0]) + " and " + fmt(cps[n - 1]) + ".",
    tip: function (i) { return weekTip(cps, i, pl, bd.actual, bd.tasks, span, false); }
  });
  return true;
}

// Draws a timeline: the month header, one lane per entry, the milestones lane,
// and the today line. Shared by the all-projects Timeline and a project's own.
function timelineNode(lanes, mss, rs, maxEnd, hint) {
  var wrap = el("div", { "class": "range" });
  mss.forEach(function (m) { if (m.date > maxEnd) maxEnd = m.date; });
  var capEnd = addMonths(rs, 25); if (maxEnd > capEnd) maxEnd = capEnd;
  var e0 = new Date(maxEnd);
  var re = Date.UTC(e0.getUTCFullYear(), e0.getUTCMonth() + 1, 1);
  function pct(ms) { return Math.max(0, Math.min(100, 100 * (ms - rs) / (re - rs))); }
  var months = el("div", { "class": "months" });
  var mcount = 0, cur = rs;
  while (cur < re && mcount < 30) {
    var dd = new Date(cur), lab = dd.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
    if (mcount === 0 || dd.getUTCMonth() === 0) lab += " '" + String(dd.getUTCFullYear()).slice(2);
    months.appendChild(el("span", { style: "left:" + pct(cur) + "%" }, lab));
    cur = addMonths(cur, 1); mcount++;
  }
  wrap.appendChild(months);
  var area = el("div", { style: "position:relative" });
  lanes.forEach(function (ln) {
    var lane = el("div", { "class": "lane" });
    var nm = el("div", { "class": "lname" }, ln.name); nm.appendChild(el("span", { "class": "ldates" }, ln.dates)); lane.appendChild(nm);
    var tr = el("div", { "class": "track" });
    ln.bars.forEach(function (bar) {
      var left = pct(bar.a), right = bar.b === null ? 100 : pct(bar.b);
      tr.appendChild(el("div", { "class": "bar " + bar.cls, style: "left:" + left + "%;width:" + Math.max(0.6, right - left) + "%" }));
    });
    lane.appendChild(tr); area.appendChild(lane);
  });
  var ml = el("div", { "class": "lane" }); ml.appendChild(el("div", { "class": "lname" }, "Milestones"));
  var mt = el("div", { "class": "track" });
  // Each diamond is a real control. renderTimeline() (views.js) attaches the
  // edit handler by data-ms-id, so this module needs no dialog import.
  mss.forEach(function (m) { mt.appendChild(el("span", { "class": "ms", "data-ms-id": m.id, role: "button", tabindex: "0", "aria-label": "Edit milestone: " + m.text + ", " + fmtY(m.date), style: "left:" + pct(m.date) + "%", title: m.text + ", " + fmtY(m.date) })); });
  ml.appendChild(mt); area.appendChild(ml);
  if (TODAY >= rs && TODAY <= re) area.appendChild(el("div", { "class": "today", style: "left:" + pct(TODAY) + "%", title: "Today" }));
  wrap.appendChild(area);
  wrap.appendChild(el("p", { "class": "hint", style: "margin-top:10px" }, hint));
  return wrap;
}

export function rangeBlock() {
  var s0 = chartStart(), d0 = new Date(s0);
  var rs = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1);
  var lanes = [], groups = {}, order = [];
  counted().forEach(function (t) {
    if (t.isNext || t.block === 0) return;
    var g = groups[t.projectId], a = taskStart(t), b = taskEnd(t);
    if (!g) { g = groups[t.projectId] = { projectId: t.projectId, name: dispProject(t), a: a, b: b }; order.push(t.projectId); }
    if (a < g.a) g.a = a;
    if (b > g.b) g.b = b;
  });
  var maxEnd = addDays(s0, 400);
  order.forEach(function (pid) {
    var g = groups[pid], p = findProject(pid), bars = [{ a: g.a, b: g.b, cls: "" }], dates = fmt(g.a) + " to " + fmt(g.b), due = p && p.due ? parseISO(p.due) : null;
    if (due && due > g.b) { bars.push({ a: addDays(g.b, 1), b: due, cls: "est" }); dates += ", due " + fmtY(due); if (due > maxEnd) maxEnd = due; }
    lanes.push({ name: g.name, bars: bars, dates: dates });
  });
  var c = chosen(), openEnded = false;
  if (c && c.start) {
    var ca = parseISO(c.start), cb;
    if (c.due) { cb = parseISO(c.due); lanes.push({ name: c.name, bars: [{ a: ca, b: cb, cls: "" }], dates: fmt(ca) + " to " + fmtY(cb) }); if (cb > maxEnd) maxEnd = cb; }
    else { openEnded = true; lanes.push({ name: c.name, bars: [{ a: ca, b: null, cls: "open" }], dates: "from " + fmtY(ca) }); }
  }
  // Milestones require a direct project link (see DESIGN.md) -- labeled by
  // project name here since the Timeline shows every project's milestones together.
  var mss = [];
  live(state.milestones).forEach(function (m) { var p = findProject(m.projectId); mss.push({ id: m.id, text: (p ? p.name + ": " : "") + m.text, date: parseISO(m.date) }); });
  var wrap = timelineNode(lanes, mss, rs, maxEnd, "The red line marks today." + (openEnded ? " The chosen project has no length set, so its bar runs open-ended." : ""));
  return { node: wrap, milestones: mss };
}

// A project's own timeline: a lane per scheduled task plus that project's
// milestones. Backlog tasks have no dates, so they are counted, not drawn.
export function projectRangeBlock(p) {
  var ts = projectBurnTasks(p).slice().sort(function (x, y) { return taskStart(x) - taskStart(y); });
  var mss = [];
  live(state.milestones).forEach(function (m) { if (m.projectId === p.id) mss.push({ id: m.id, text: m.text, date: parseISO(m.date) }); });
  var nb = counted().filter(function (t) { return t.projectId === p.id && !t.isNext && t.block === 0; }).length;
  var backlog = nb ? " " + nb + (nb === 1 ? " backlog item is" : " backlog items are") + " not shown until scheduled." : "";
  if (!ts.length) return { node: el("p", { "class": "hint" }, "Nothing is scheduled yet. Create a task with a date to see them here." + backlog), milestones: mss, empty: true };
  var first = Infinity, maxEnd = -Infinity;
  var lanes = ts.map(function (t) {
    var a = taskStart(t), b = taskEnd(t);
    if (a < first) first = a;
    if (b > maxEnd) maxEnd = b;
    return { name: short(t.what, 60), bars: [{ a: a, b: b, cls: t.status === "Completed" ? "done" : "" }], dates: fmt(a) + " to " + fmt(b) };
  });
  mss.forEach(function (m) { if (m.date < first) first = m.date; });
  var f0 = new Date(first), rs = Date.UTC(f0.getUTCFullYear(), f0.getUTCMonth(), 1);
  return { node: timelineNode(lanes, mss, rs, maxEnd, "The red line marks today." + backlog), milestones: mss, empty: false };
}
