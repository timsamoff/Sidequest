import { state } from "./state.js";
import { fmt, fmtY, iso, parseISO, TODAY } from "./dates.js";
import {
  wl, pset, linkedQuests, questBurn, questBurnTasks, isLate,
  taskStart, taskEnd, questEstimate, fmtHours, fmtHoursLong, live
} from "./model.js";

/* Client export: a single, self-contained, read-only HTML file for sharing one
   quest (and its Active/Complete linked quests, recursively) outside the
   app. See sentinel-notes/client-project-export-design-brief.md for the
   settled shape. Chart points are precomputed here, once, from the live data
   -- the exported file never recomputes scheduling math, it only draws the
   numbers it was given. */

// Tasks, steps, and the quest's own fields, frozen to plain data. Does not
// walk linked quests -- buildExportTree() does that, with the cycle guard.
function snapshotTasks(p) {
  return questBurnTasksOrdered(p).map(function (t) {
    return {
      id: t.id, what: t.what, done: t.done, status: t.status, notes: t.notes || "",
      block: t.block, start: fmtRange(t), late: isLate(t),
      est: t.est > 0 ? fmtHours(t.est) : "",
      steps: (t.steps || []).map(function (s) { return { text: s.text, done: !!s.done }; })
    };
  });
}
function questBurnTasksOrdered(p) {
  var ts = live(state.tasks).filter(function (t) { return !t.isNext && t.questId === p.id; });
  return ts.slice().sort(function (a, b) {
    var aDone = a.status === "Completed" ? 1 : 0, bDone = b.status === "Completed" ? 1 : 0;
    return aDone - bDone || (a.block || 99) - (b.block || 99);
  });
}
function fmtRange(t) { return t.block === 0 ? "Backlog" : fmt(taskStart(t)) + " to " + fmt(taskEnd(t)); }

// Precomputed chart data for one quest: the burndown's points (with tooltip
// text baked in) and the timeline's lanes. No live recomputation happens in
// the exported file -- see the design brief's leaning on this.
function snapshotCharts(p) {
  var bd = questBurn(p);
  if (!bd) return null;
  var milestones = live(state.milestones).filter(function (m) { return m.questId === p.id; });
  var points = bd.cps.map(function (ms, i) {
    return { date: fmtY(ms), planned: bd.planned[i], actual: bd.actual[i], scope: bd.scope[i], tip: chartTip(bd, i, ms) };
  });
  var lanes = snapshotLanes(p, bd);
  return {
    total: bd.total,
    points: points,
    milestones: milestones.map(function (m) { return { text: m.text, date: m.date }; }),
    lanes: lanes.lanes, rangeStart: lanes.rangeStart, rangeEnd: lanes.rangeEnd, today: fmtY(TODAY)
  };
}
function nameList(ts) {
  var names = ts.slice(0, 6).map(function (t) { return t.what; });
  return names.join(", ") + (ts.length > 6 ? ", and " + (ts.length - 6) + " more" : "");
}
function chartTip(bd, i, ms) {
  var cps = bd.cps, span = bd.stepDays * 86400000;
  var days = bd.stepDays, unit = days === 1 ? "day" : days === 7 ? "week" : "period";
  var lines = [(days === 1 ? "" : days === 7 ? "Week of " : "From ") + fmtY(ms), "Planned: " + bd.planned[i] + " remaining"];
  if (bd.actual[i] !== null) lines.push("Actual: " + bd.actual[i] + " remaining" + (bd.scope[i] !== null ? " of " + bd.scope[i] + " in scope" : ""));
  var prev = null;
  for (var j = i - 1; j >= 0 && prev === null; j--) if (bd.scope[j] !== null) prev = bd.scope[j];
  if (bd.scope[i] !== null && prev !== null && bd.scope[i] !== prev) lines.push(bd.scope[i] > prev ? "Scope grew from " + prev + " to " + bd.scope[i] : "Scope fell from " + prev + " to " + bd.scope[i]);
  var fin = bd.tasks.filter(function (t) { var e = taskEnd(t); return e <= ms && (i === 0 || e > cps[i - 1]); });
  if (fin.length) lines.push("Finishing: " + nameList(fin));
  var done = bd.tasks.filter(function (t) { if (!t.doneAt) return false; var d = parseISO(t.doneAt); return d >= ms && d < ms + span; });
  if (done.length) lines.push((days === 1 ? "Completed that day: " : "Completed this " + unit + ": ") + nameList(done));
  return lines.join("\n");
}
// One lane per scheduled task, as percentages of the lane's own date range --
// the exported file draws these numbers directly, no month-grid math at export time.
function snapshotLanes(p, bd) {
  var ts = questBurnTasks(p).slice().sort(function (a, b) { return taskStart(a) - taskStart(b); });
  if (!ts.length) return { lanes: [], rangeStart: null, rangeEnd: null };
  var first = Infinity, last = -Infinity;
  ts.forEach(function (t) { var a = taskStart(t), b = taskEnd(t); if (a < first) first = a; if (b > last) last = b; });
  live(state.milestones).forEach(function (m) { if (m.questId === p.id) { var d = parseISO(m.date); if (d < first) first = d; if (d > last) last = d; } });
  if (TODAY > last) last = TODAY;
  var span = Math.max(1, last - first);
  function pct(ms) { return Math.max(0, Math.min(100, 100 * (ms - first) / span)); }
  var lanes = ts.map(function (t) {
    var a = taskStart(t), b = taskEnd(t);
    return { name: t.what, dates: fmt(a) + " to " + fmt(b), left: pct(a), width: Math.max(0.6, pct(b) - pct(a)), status: t.status === "Completed" ? "done" : t.status === "In progress" ? "work" : "new" };
  });
  return { lanes: lanes, rangeStart: first, rangeEnd: last };
}

// Walks a quest and its Active/Complete linked quests, recursively, with
// a cycle guard (a quest already in the chain is not expanded again -- it's
// linked to the section that already covers it instead). Candidate and
// vaulted linked quests are skipped entirely, per the design brief.
function buildExportTree(p, seen) {
  seen = seen || {};
  seen[p.id] = true;
  var node = {
    id: p.id, name: p.name, status: p.status, notes: p.notes || "",
    meta: questMetaLine(p), tasks: snapshotTasks(p), charts: snapshotCharts(p),
    links: [], estimate: estimateLine(p)
  };
  linkedQuests(p).forEach(function (lp) {
    // A vaulted quest keeps its live status field (e.g. still "active"),
    // so being in the Vault is a separate check from status -- both exclude it.
    if (lp.vault || (lp.status !== "active" && lp.status !== "complete")) return;
    if (seen[lp.id]) { node.links.push({ id: lp.id, name: lp.name, cycle: true }); return; }
    var child = buildExportTree(lp, seen);
    node.links.push({ id: lp.id, name: lp.name, cycle: false, node: child });
  });
  return node;
}
function questMetaLine(p) {
  var eff = pset(p.id);
  var parts = ["Started " + (eff.start || "unset")];
  if (p.due) parts.push("due " + fmt(parseISO(p.due)));
  parts.push(wl() + " length " + eff.days + " days");
  return parts.join(", ") + ".";
}
function estimateLine(p) {
  var est = questEstimate(p);
  return est.total > 0 ? "Est. " + fmtHoursLong(est.left) + " remaining" : "";
}

// Flattens the tree into a list of sections in table-of-contents order (the
// root first, then each link depth-first), skipping cycle placeholders.
function flattenSections(node, out) {
  out = out || [];
  out.push(node);
  node.links.forEach(function (l) { if (!l.cycle && l.node) flattenSections(l.node, out); });
  return out;
}

// Builds the full snapshot for one quest's export: the root quest plus
// everything reachable through Active/Complete links.
// Resolves a field set to null when every value is blank, so a caller can
// tell "nothing filled in" apart from "filled in but empty" with one check.
function filledOrNull(fields) {
  return fields && Object.keys(fields).some(function (k) { return fields[k]; }) ? fields : null;
}

export function buildExportSnapshot(p) {
  var tree = buildExportTree(p);
  var sections = flattenSections(tree);
  var contact = filledOrNull(state.settings.contact);
  var client = filledOrNull(p.client);
  return { exportedAt: fmtY(TODAY), root: tree, sections: sections, contact: contact, client: client };
}

export var EXPORT_TEST_HOOKS = { buildExportTree: buildExportTree, flattenSections: flattenSections };

/* ---- standalone document ---- */
// Everything below builds the actual downloadable HTML string. It knows
// nothing about live state -- it only ever reads the plain snapshot object
// built above, so there's no way for it to accidentally reach back into the
// app's own data after the file is downloaded.

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
}
function escAttr(s) { return escHtml(s); }

function sectionId(id) { return "proj-" + id; }

function renderTocEntry(node) {
  var li = '<li><a href="#' + sectionId(node.id) + '">' + escHtml(node.name) + "</a>";
  var kids = node.links.filter(function (l) { return !l.cycle && l.node; });
  if (kids.length) li += "<ul>" + kids.map(function (l) { return renderTocEntry(l.node); }).join("") + "</ul>";
  li += "</li>";
  return li;
}

function renderTasks(node) {
  if (!node.tasks.length) return '<p class="hint">No tasks.</p>';
  var rows = node.tasks.map(function (t) {
    var steps = t.steps.length ? t.steps.filter(function (s) { return s.done; }).length + " of " + t.steps.length + " steps" : "";
    var cls = t.status === "Completed" ? " done" : "";
    var html = '<li class="etask' + cls + '">';
    html += '<div class="el1">' + escHtml(t.block === 0 ? "Backlog" : t.start) + (t.late ? ' <span class="badge">Overdue</span>' : "") + "</div>";
    html += '<div class="el2">' + escHtml(t.what) + "</div>";
    html += '<div class="el3"><span class="chip" data-v="' + escAttr(t.status) + '">' + escHtml(t.status) + "</span>";
    if (steps) html += "<span>" + escHtml(steps) + "</span>";
    if (t.est) html += "<span>Est " + escHtml(t.est) + "</span>";
    html += "</div>";
    if (t.done) html += '<p class="edone">Done when: ' + escHtml(t.done) + "</p>";
    if (t.steps.length) {
      html += '<ul class="esteps">' + t.steps.map(function (s) { return '<li class="' + (s.done ? "done" : "") + '">' + escHtml(s.text) + "</li>"; }).join("") + "</ul>";
    }
    if (t.notes) html += '<p class="enotes">' + escHtml(t.notes) + "</p>";
    html += "</li>";
    return html;
  });
  return '<ul class="etasklist">' + rows.join("") + "</ul>";
}

function renderLinks(node) {
  var real = node.links.filter(function (l) { return !l.cycle; });
  var cycles = node.links.filter(function (l) { return l.cycle; });
  if (!real.length && !cycles.length) return '<p class="hint">No linked quests.</p>';
  var items = real.map(function (l) { return '<li><a href="#' + sectionId(l.id) + '">' + escHtml(l.name) + "</a></li>"; })
    .concat(cycles.map(function (l) { return '<li><a href="#' + sectionId(l.id) + '">' + escHtml(l.name) + "</a> (already shown above)</li>"; }));
  return '<ul class="list">' + items.join("") + "</ul>";
}

// One burndown + timeline, as a <div data-chart="..."> the runtime script
// fills in client-side from the embedded JSON -- keeps this function's own
// output to plain, inspectable HTML and the drawing code to one shared place.
function renderCharts(node) {
  if (!node.charts) return '<p class="hint">Nothing is scheduled yet.</p>';
  var id = sectionId(node.id);
  var html = '<div class="echarts" data-chart="' + escAttr(id) + '">';
  if (node.charts.lanes.length) {
    html += '<h3 class="efirst">Timeline</h3><div class="echartbox"><div class="etimeline" id="' + id + '-tl"></div></div>';
  }
  html += '<h3' + (node.charts.lanes.length ? "" : ' class="efirst"') + '>Burndown</h3>';
  html += '<div class="echartbox"><div id="' + id + '-burn"></div></div>';
  html += '<p class="hint">' + node.charts.total + " tasks total.</p>";
  html += "</div>";
  return html;
}

// Every linked quest gets its own full, flat section (not literally nested
// HTML, even though the link graph that produced it is a tree), so headings
// use one fixed level throughout rather than growing with link depth.
function renderSection(node) {
  var html = '<section class="esection" id="' + sectionId(node.id) + '">';
  html += "<h2>" + escHtml(node.name) + (node.status === "complete" ? ' <span class="chip questcomplete">Complete</span>' : "") + "</h2>";
  html += '<p class="hint">' + escHtml(node.meta) + (node.estimate ? " " + escHtml(node.estimate) : "") + "</p>";
  html += '<div class="esplit">';
  html += '<div class="emain">';
  html += '<h3 class="efirst">Tasks</h3>';
  html += renderTasks(node);
  html += "<h3>Notes</h3>";
  html += '<p class="enotes">' + (node.notes ? escHtml(node.notes).replace(/\n/g, "<br>") : "No notes.") + "</p>";
  html += "<h3>Linked quests</h3>";
  html += renderLinks(node);
  html += "</div>";
  html += '<div class="easide">' + renderCharts(node) + "</div>";
  html += "</div></section>";
  return html;
}

var EXPORT_CSS = "\
:root { --bg:#F2F4F1; --surface:#FFFFFF; --ink:#1A2733; --muted:#566772; --line:#D3DAD5; --planned:#2F5D8A; --burn:#C62F2F; --scope:#FFAC1C; --est:#B9CCE0; --chip-idle:#E7ECE8; --chip-work:#F6E3C4; --chip-done:#CFE6D5; --chip-new:#D3E3F6; --chip-ink:#1A2733; --late:#A8261C; --late-bg:#F8DDD9; }\
@media (prefers-color-scheme: dark) { :root { --bg:#131A20; --surface:#1B252D; --ink:#E6ECEF; --muted:#9AABB5; --line:#2C3843; --planned:#86B4E0; --burn:#E5534B; --scope:#FFAC1C; --est:#34506B; --chip-idle:#26323B; --chip-work:#4A3B22; --chip-done:#21402C; --chip-new:#2A4560; --chip-ink:#E6ECEF; --late:#F2A29B; --late-bg:#4A2723; } }\
* { box-sizing: border-box; }\
body { margin: 0; padding: 24px; background: var(--bg); color: var(--ink); font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; line-height: 1.4; }\
.ewrap { max-width: 1100px; margin: 0 auto; }\
.ebrand { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }\
.ebrand svg { width: 28px; height: 28px; flex: none; }\
.ebrand span { font-family: 'Spectral', Georgia, 'Times New Roman', serif; font-weight: 600; font-size: 1.1rem; }\
.eletterhead { display: flex; gap: 32px; flex-wrap: wrap; margin-bottom: 18px; color: var(--muted); font-size: .9rem; line-height: 1.5; }\
.ecol { min-width: 180px; }\
.ecol a { color: var(--planned); text-decoration: none; }\
.ecol a:hover { text-decoration: underline; }\
.echead { color: var(--ink); font-weight: 600; font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }\
.econtactname { color: var(--ink); font-weight: 600; }\
.econtactaddr { white-space: pre-line; }\
h1, h2, h3, h4, h5 { font-weight: 700; }\
.ehint { color: var(--muted); }\
.etoc { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; margin: 18px 0; }\
.etoc ul { margin: 4px 0 4px 18px; padding: 0; }\
.etoc a { color: var(--planned); }\
.esection { border-top: 1px solid var(--line); padding-top: 22px; margin-top: 22px; }\
.esplit { display: grid; grid-template-columns: 1fr; gap: 20px; }\
@media (min-width: 900px) { .esplit { grid-template-columns: 1.1fr 1fr; align-items: start; } }\
.efirst { margin-top: 0; }\
.hint { color: var(--muted); font-size: .92rem; }\
.chip { display: inline-block; padding: 2px 10px; border-radius: 999px; background: var(--chip-idle); color: var(--chip-ink); font-size: .8rem; font-weight: 600; }\
.chip[data-v='Not started'] { background: var(--chip-new); }\
.chip[data-v='In progress'] { background: var(--chip-work); }\
.chip[data-v='Completed'] { background: var(--chip-done); }\
.chip.questcomplete { background: var(--chip-done); }\
.chip.ereadonly { background: var(--muted); color: var(--surface); vertical-align: middle; font-size: .7rem; margin-left: 8px; }\
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--late-bg); color: var(--late); font-size: .8rem; font-weight: 600; }\
.etasklist, .list { list-style: none; margin: 8px 0; padding: 0; }\
.etask { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; background: var(--surface); }\
.etask.done { opacity: .7; }\
.el1 { font-size: .85rem; color: var(--muted); }\
.el2 { font-weight: 600; margin: 2px 0; }\
.el3 { display: flex; gap: 10px; align-items: center; font-size: .85rem; color: var(--muted); }\
.esteps { list-style: none; margin: 8px 0 0; padding: 0 0 0 4px; font-size: .9rem; }\
.esteps li { padding: 2px 0; }\
.esteps li.done { color: var(--muted); text-decoration: line-through; }\
.enotes { white-space: pre-line; }\
.edone { color: var(--muted); font-size: .9rem; margin: 6px 0 0; }\
.list a, .etoc a, .list { color: inherit; }\
.list li { padding: 4px 0; }\
.list a { color: var(--planned); }\
.echartbox { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin-top: 8px; position: relative; }\
svg.echart { display: block; width: 100%; height: auto; }\
.echart .grid { stroke: var(--line); stroke-width: 1; }\
.echart .axis { fill: var(--muted); font-size: 11px; }\
.echart .planned { fill: none; stroke: var(--planned); stroke-width: 2.5; stroke-dasharray: 7 5; }\
.echart .actual { fill: none; stroke: var(--burn); stroke-width: 3; }\
.echart .scope { fill: none; stroke: var(--scope); stroke-width: 2; }\
.echart .dot { fill: var(--burn); stroke: var(--surface); stroke-width: 2; }\
.echart .hit { fill: transparent; cursor: pointer; }\
.echart .guide { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; pointer-events: none; }\
.echart .mark { fill: var(--burn); }\
.echarttip { position: absolute; z-index: 3; max-width: 280px; padding: 8px 10px; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 4px 14px rgba(0,0,0,.18); font-size: .85rem; line-height: 1.35; white-space: pre-line; pointer-events: none; }\
.echarttip[hidden] { display: none; }\
.etimeline .emonths { position: relative; height: 20px; border-bottom: 1px solid var(--line); font-size: .72rem; color: var(--muted); }\
.etimeline .elane { margin-top: 10px; }\
.etimeline .elname { font-size: .85rem; font-weight: 600; }\
.etimeline .elname span { font-weight: 400; color: var(--muted); margin-left: 6px; }\
.etimeline .etrack { position: relative; height: 20px; margin-top: 4px; background: var(--chip-idle); border-radius: 4px; }\
.etimeline .ebar { position: absolute; top: 2px; bottom: 2px; min-width: 6px; border-radius: 4px; background: var(--planned); }\
.etimeline .ebar.new { background: var(--chip-new); }\
.etimeline .ebar.work { background: var(--chip-work); }\
.etimeline .ebar.done { background: var(--chip-done); }\
.etimeline .ems { position: absolute; top: 2px; width: 12px; height: 12px; background: var(--burn); transform: translateX(-6px) rotate(45deg); border-radius: 2px; }\
.efoot { margin-top: 30px; padding-top: 14px; border-top: 1px solid var(--line); color: var(--muted); font-size: .85rem; }\
";

// Reimplements renderBurn()'s and timelineNode()'s drawing and tooltip
// interaction against the embedded, precomputed snapshot -- see the design
// brief on why this is a second, standalone implementation rather than an
// import of chart.js (which reads live state directly).
var RUNTIME_JS = "\
(function(){\
function svgEl(t,a){var e=document.createElementNS('http://www.w3.org/2000/svg',t);for(var k in a)e.setAttribute(k,a[k]);return e;}\
function drawBurn(host,cfg){\
var cps=cfg.points,n=cps.length,pl=cps.map(function(p){return p.planned;}),acts=cps.map(function(p){return p.actual;});\
var ymax=Math.max(cfg.total,1);acts.forEach(function(a){if(a!==null&&a>ymax)ymax=a;});\
var tick=Math.max(1,Math.ceil(ymax/8));\
var W=960,H=320,L=40,R=18,T=16,B=44;\
var svg=svgEl('svg',{'class':'echart',viewBox:'0 0 '+W+' '+H,role:'group',tabindex:'0','aria-label':'Burndown chart. Use the left and right arrow keys to move between points.'});\
function x(i){return L+(W-L-R)*i/(n-1);}\
function y(v){return T+(H-T-B)*(1-v/ymax);}\
for(var v=0;v<=ymax;v+=tick){svg.appendChild(svgEl('line',{'class':'grid',x1:L,x2:W-R,y1:y(v),y2:y(v)}));var tx=svgEl('text',{'class':'axis',x:L-10,y:y(v)+4,'text-anchor':'end'});tx.textContent=String(v);svg.appendChild(tx);}\
var every=Math.max(1,Math.ceil(n/Math.max(2,Math.floor((W-L-R)/70))));\
cps.forEach(function(p,i){if(i%every===0||i===n-1){var tx=svgEl('text',{'class':'axis',x:x(i),y:H-16,'text-anchor':'middle'});tx.textContent=p.date;svg.appendChild(tx);}});\
svg.appendChild(svgEl('polyline',{'class':'planned',points:pl.map(function(p,i){return x(i)+','+y(p);}).join(' ')}));\
var seg=[];function flush(){if(seg.length>1)svg.appendChild(svgEl('polyline',{'class':'actual',points:seg.join(' ')}));seg=[];}\
acts.forEach(function(a,i){if(a===null){flush();return;}seg.push(x(i)+','+y(a));});flush();\
acts.forEach(function(a,i){if(a!==null)svg.appendChild(svgEl('circle',{'class':'dot',cx:x(i),cy:y(a),r:5.5}));});\
var guide=svgEl('line',{'class':'guide',x1:0,x2:0,y1:T,y2:H-B});guide.style.display='none';svg.appendChild(guide);\
var stops=[];\
cps.forEach(function(p,i){\
var x0=i===0?L:(x(i-1)+x(i))/2,x1=i===n-1?W-R:(x(i)+x(i+1))/2;\
var hit=svgEl('rect',{'class':'hit',x:x0,y:T,width:Math.max(1,x1-x0),height:H-B-T});svg.appendChild(hit);\
var ys=[y(p.planned)];if(p.actual!==null)ys.push(y(p.actual));\
stops.push({x:x(i),y:Math.min.apply(null,ys),text:p.tip,el:hit,i:i});\
});\
var tip=document.createElement('div');tip.className='echarttip';tip.setAttribute('role','status');tip.setAttribute('aria-live','polite');tip.hidden=true;\
host.appendChild(svg);host.appendChild(tip);\
var cur=-1,pinned=false;\
function hide(){cur=-1;tip.hidden=true;guide.style.display='none';}\
function show(k){cur=k;var s=stops[k];tip.textContent=s.text;tip.hidden=false;guide.setAttribute('x1',s.x);guide.setAttribute('x2',s.x);guide.style.display='';\
var r=svg.getBoundingClientRect(),hr=host.getBoundingClientRect(),sc=r.width/W;\
var px=(r.left-hr.left)+s.x*sc,py=(r.top-hr.top)+s.y*sc,w=tip.offsetWidth,h=tip.offsetHeight;\
tip.style.left=Math.max(0,Math.min(px-w/2,hr.width-w))+'px';tip.style.top=(py-h-12<0?py+14:py-h-12)+'px';}\
function startStop(){var best=0;stops.forEach(function(s,k){if(acts[s.i]!==null)best=k;});return best;}\
stops.forEach(function(s,k){\
s.el.addEventListener('mouseenter',function(){show(k);});\
s.el.addEventListener('mouseleave',function(){if(!pinned)hide();});\
s.el.addEventListener('click',function(){pinned=true;show(k);});\
});\
svg.addEventListener('focus',function(){pinned=true;if(cur<0)show(startStop());});\
svg.addEventListener('blur',function(){pinned=false;hide();});\
svg.addEventListener('pointerdown',function(){svg.classList.add('nofocusring');});\
svg.addEventListener('keydown',function(e){\
svg.classList.remove('nofocusring');var nk=cur;\
if(e.key==='ArrowRight')nk=cur<0?0:Math.min(stops.length-1,cur+1);\
else if(e.key==='ArrowLeft')nk=cur<0?stops.length-1:Math.max(0,cur-1);\
else if(e.key==='Home')nk=0;\
else if(e.key==='End')nk=stops.length-1;\
else if(e.key==='Escape'){if(cur>=0){e.preventDefault();e.stopPropagation();pinned=false;hide();}return;}\
else return;\
e.preventDefault();pinned=true;show(nk);\
});\
}\
function drawTimeline(host,charts){\
if(!charts.lanes.length)return;\
var wrap=document.createElement('div');wrap.className='etimeline';\
charts.lanes.forEach(function(ln){\
var lane=document.createElement('div');lane.className='elane';\
var nm=document.createElement('div');nm.className='elname';nm.textContent=ln.name;\
var sp=document.createElement('span');sp.textContent=ln.dates;nm.appendChild(sp);lane.appendChild(nm);\
var tr=document.createElement('div');tr.className='etrack';\
var bar=document.createElement('div');bar.className='ebar '+ln.status;bar.style.left=ln.left+'%';bar.style.width=ln.width+'%';tr.appendChild(bar);\
lane.appendChild(tr);wrap.appendChild(lane);\
});\
host.appendChild(wrap);\
}\
document.querySelectorAll('[data-chart]').forEach(function(host){\
var id=host.getAttribute('data-chart');\
var charts=(window.__sqExport.charts||{})[id];\
if(!charts)return;\
var tlHost=document.getElementById(id+'-tl');if(tlHost)drawTimeline(tlHost,charts);\
var burnHost=document.getElementById(id+'-burn');if(burnHost)drawBurn(burnHost,charts);\
});\
})();\
";

// Produces the complete file as a string. `snapshot` is buildExportSnapshot()'s
// output. No DOM, no live state, no imports beyond what's already above --
// everything the output needs is baked into this one string.
// The real icon's own path data (assets/sidequest-icon.svg, via index.html's
// #sqLogo symbol), not invented geometry. Uses the export's own CSS tokens so
// it follows light/dark mode the same way the live app's sidebar logo does.
var EXPORT_BRAND = '<div class="ebrand"><svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><defs><clipPath id="eLogoClip"><rect width="512" height="512" rx="112"/></clipPath></defs><rect width="512" height="512" rx="112" fill="var(--est)"/><g clip-path="url(#eLogoClip)"><path d="M115.88-30.43l30.33,154.2" fill="none" stroke="var(--planned)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/><path d="M102.47,177.65l-23.25,4.57c-36.81,7.24-51.6,29.27-44.36,66.08l28.7,145.94" fill="none" stroke="var(--planned)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/><path d="M207.09,157.08l52.31-10.29c34.87-6.86,55.74,7.15,62.6,42.02l9.64,49.01" fill="none" stroke="var(--planned)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/><path d="M295.51,299.68l-23.25,4.57c-25.19,4.95-35.3,20.02-30.35,45.21l19.38,98.53" fill="none" stroke="var(--planned)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/><path d="M388.51,281.39l29.06-5.72c32.94-6.48,52.64,6.75,59.12,39.69l4,20.34" fill="none" stroke="var(--planned)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/><circle cx="154.78" cy="167.37" r="53.31" fill="var(--surface)" stroke="var(--planned)" stroke-width="16"/><circle cx="342.01" cy="290.53" r="47.39" fill="var(--surface)" stroke="var(--planned)" stroke-width="16"/><rect x="31.22" y="387.08" width="77.01" height="77.01" rx="8" ry="8" transform="translate(-80.82 21.45) rotate(-11.13)" fill="var(--planned)"/><rect x="227.98" y="435.92" width="77.01" height="77.01" rx="8" ry="8" transform="translate(-86.54 60.34) rotate(-11.13)" fill="var(--planned)"/><rect x="432.89" y="334.59" width="118.48" height="118.48" rx="9" ry="9" transform="translate(-109.15 582.92) rotate(-56.13)" fill="var(--burn)"/></g></svg><span>Sidequest</span></div>\n';

function addrLine(v) { return '<div class="econtactaddr">' + escHtml(v).replace(/\n/g, "<br>") + "</div>"; }
function plainLine(v) { return "<div>" + escHtml(v) + "</div>"; }
function linkLine(href, text) { return '<div><a href="' + escAttr(href) + '">' + escHtml(text) + "</a></div>"; }
function emailLine(v) { return linkLine("mailto:" + v, v); }
// A typed phone number is kept as-is for display; the tel: link strips
// everything but digits and a leading "+", since letters/punctuation in a
// href would make some phones refuse to dial it.
function phoneLine(v) { return linkLine("tel:" + v.replace(/[^\d+]/g, ""), v); }
// A typed website is kept as-is for display; a scheme is added to the link
// only if the user didn't already type one, since "example.com" alone is a
// relative link, not the page it looks like.
function websiteLine(v) { return linkLine(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : "https://" + v, v); }

// One letterhead column: a heading ("Prepared by"/"Prepared for"), a bold
// name line, then whatever else was filled in. Returns "" if fields is null.
// `nameKey` is the field that leads the column in bold (the user's own
// company for "Prepared by", the Quest Giver's organization for "Prepared
// for" -- both sides lead with the organization, not the person).
// `secondKey` is the contact person, shown plain right after it.
function renderLetterColumn(heading, fields, nameKey, secondKey) {
  if (!fields) return "";
  var lines = [];
  if (fields[nameKey]) lines.push('<div class="econtactname">' + escHtml(fields[nameKey]) + "</div>");
  if (fields[secondKey]) lines.push(plainLine(fields[secondKey]));
  if (fields.address) lines.push(addrLine(fields.address));
  if (fields.phone) lines.push(phoneLine(fields.phone));
  if (fields.email) lines.push(emailLine(fields.email));
  if (fields.website) lines.push(websiteLine(fields.website));
  return '<div class="ecol"><div class="echead">' + heading + "</div>" + lines.join("") + "</div>";
}

// "Prepared by" is the user's own Settings contact info; "Prepared for" is
// the quest's own Quest Giver info. Either side can be empty on its own:
// with no Quest Giver info, "Prepared for" is simply left out; with no user
// info at all, "Prepared for" takes the left (only) position instead of
// sitting stranded on the right.
function renderLetterhead(contact, client) {
  var by = renderLetterColumn("Prepared by", contact, "company", "name");
  var forWhom = renderLetterColumn("Prepared for", client, "org", "poc");
  if (!by && !forWhom) return "";
  return '<div class="eletterhead">' + (by || forWhom) + (by ? forWhom : "") + "</div>\n";
}

export function renderExportDocument(snapshot) {
  var p = snapshot.root;
  var toc = snapshot.sections.length > 1 ? '<nav class="etoc"><strong>Contents</strong><ul>' + renderTocEntry(snapshot.root) + "</ul></nav>" : "";
  var sections = snapshot.sections.map(renderSection).join("");
  var chartsById = {};
  snapshot.sections.forEach(function (n) { if (n.charts) chartsById[sectionId(n.id)] = n.charts; });
  var title = escHtml(p.name) + " (exported from Sidequest)";
  var html = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>" + title + "</title>\n<style>" + EXPORT_CSS + "</style>\n</head>\n<body>\n<div class=\"ewrap\">\n";
  html += EXPORT_BRAND;
  html += renderLetterhead(snapshot.contact, snapshot.client);
  html += "<h1>" + escHtml(p.name) + " <span class=\"chip ereadonly\">Read only</span></h1>\n<p class=\"ehint\">Exported from Sidequest on " + escHtml(snapshot.exportedAt) + ".</p>\n";
  html += toc + sections;
  html += "<p class=\"efoot\">Exported from Sidequest on " + escHtml(snapshot.exportedAt) + ".</p>\n";
  // Escaping "</" stops a task name or note containing a literal "</script>"
  // from closing the tag early and corrupting the rest of the file.
  var chartsJson = JSON.stringify({ charts: chartsById }).replace(/<\//g, "<\\/");
  html += "</div>\n<script>window.__sqExport=" + chartsJson + ";</script>\n<script>" + RUNTIME_JS + "</script>\n</body>\n</html>\n";
  return html;
}

// Safe-ish filename: the quest's name, lowercased and slugged, plus today's
// date in plain ISO (the design brief left the date format open; ISO sorts
// correctly in a file listing regardless of the user's own display setting).
export function exportFileName(p) {
  var slug = p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "quest";
  return slug + "-" + iso(TODAY) + ".html";
}
