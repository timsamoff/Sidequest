import { state } from "./state.js";
import { fmt, fmtY, addDays, addMonths, parseISO, TODAY } from "./dates.js";
import { totalUnits, checkpoints, planned, chartStart, counted, taskStart, taskEnd, chosen, live, dispProject, findProject } from "./model.js";
import { el } from "./dom.js";

export function svgEl(tag, attrs, text) {
  var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  if (text !== undefined) e.textContent = text; return e;
}
export function drawChart(host, wide) {
  host.innerHTML = "";
  var total = totalUnits(), cps = checkpoints(), n = cps.length;
  var acts = state.actual.map(function (a, i) { return (a === null && i === 0) ? total : a; });
  var ymax = Math.max(total, 1); acts.forEach(function (a) { if (a !== null && a > ymax) ymax = a; });
  var tick = Math.max(1, Math.ceil(ymax / 8));
  var W = wide ? 960 : 640, H = wide ? 320 : 300, L = 40, R = 18, T = 16, B = 44;
  var svg = svgEl("svg", { "class": "chart", viewBox: "0 0 " + W + " " + H, role: "img" });
  var pl = cps.map(planned);
  svg.setAttribute("aria-label", "Burndown chart. Planned items remaining fall from " + pl[0] + " to " + pl[n - 1] + " between " + fmt(cps[0]) + " and " + fmt(cps[n - 1]) + ".");
  function x(i) { return L + (W - L - R) * i / (n - 1); }
  function y(v) { return T + (H - T - B) * (1 - v / ymax); }
  for (var v = 0; v <= ymax; v += tick) {
    svg.appendChild(svgEl("line", { "class": "grid", x1: L, x2: W - R, y1: y(v), y2: y(v) }));
    svg.appendChild(svgEl("text", { "class": "axis", x: L - 10, y: y(v) + 4, "text-anchor": "end" }, String(v)));
  }
  cps.forEach(function (ms, i) { svg.appendChild(svgEl("text", { "class": "axis", x: x(i), y: H - 16, "text-anchor": "middle" }, fmt(ms))); });
  svg.appendChild(svgEl("polyline", { "class": "planned", points: pl.map(function (p, i) { return x(i) + "," + y(p); }).join(" ") }));
  var seg = [];
  function flush() { if (seg.length > 1) svg.appendChild(svgEl("polyline", { "class": "actual", points: seg.join(" ") })); seg = []; }
  acts.forEach(function (a, i) { if (a === null) { flush(); return; } seg.push(x(i) + "," + y(a)); });
  flush();
  acts.forEach(function (a, i) {
    if (a === null) return;
    var dot = svgEl("circle", { "class": "dot", cx: x(i), cy: y(a), r: 5.5 });
    dot.appendChild(svgEl("title", null, fmtY(cps[i]) + ": " + a + (a === 1 ? " item" : " items") + " remaining"));
    svg.appendChild(dot);
  });
  host.appendChild(svg);
}

export function rangeBlock() {
  var wrap = el("div", { "class": "range" });
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
    var g = groups[pid], p = findProject(pid), bars = [{ a: g.a, b: g.b, cls: "" }], dates = fmt(g.a) + " to " + fmt(g.b), est = p && p.months;
    if (est) { var ea = addDays(g.b, 1), eb = addMonths(ea, est); bars.push({ a: ea, b: eb, cls: "est" }); dates += ", estimate to " + fmtY(eb); if (eb > maxEnd) maxEnd = eb; }
    lanes.push({ name: g.name, bars: bars, dates: dates });
  });
  var c = chosen(), openEnded = false;
  if (c && c.start) {
    var ca = parseISO(c.start), cb;
    if (c.months) { cb = addMonths(ca, c.months); lanes.push({ name: c.name, bars: [{ a: ca, b: cb, cls: "" }], dates: fmt(ca) + " to " + fmtY(cb) }); if (cb > maxEnd) maxEnd = cb; }
    else { openEnded = true; lanes.push({ name: c.name, bars: [{ a: ca, b: null, cls: "open" }], dates: "from " + fmtY(ca) }); }
  }
  // Milestones require a direct project link (see DESIGN.md) -- labeled by
  // project name here since the Timeline shows every project's milestones together.
  var mss = [];
  live(state.milestones).forEach(function (m) { var p = findProject(m.projectId); mss.push({ id: m.id, text: (p ? p.name + ": " : "") + m.text, date: parseISO(m.date) }); });
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
  mss.forEach(function (m) { mt.appendChild(el("span", { "class": "ms", style: "left:" + pct(m.date) + "%", title: m.text + ", " + fmtY(m.date) })); });
  ml.appendChild(mt); area.appendChild(ml);
  if (TODAY >= rs && TODAY <= re) area.appendChild(el("div", { "class": "today", style: "left:" + pct(TODAY) + "%", title: "Today" }));
  wrap.appendChild(area);
  wrap.appendChild(el("p", { "class": "hint", style: "margin-top:10px" }, "The orange line marks today." + (openEnded ? " The chosen project has no length set, so its bar runs open-ended." : "")));
  return { node: wrap, milestones: mss };
}
