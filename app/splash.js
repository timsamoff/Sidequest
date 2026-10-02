// Splash overlay atop the already-rendered app, gated by showSplash. Fixed,
// hand-composed artwork (the icon's own 5 branches, not procedural).
// Sequence: blur -> branches draw -> blur -> the "Sidequest" title (shown from
// first paint via static HTML) wipes into the affirmation -> fade out.
import { $ } from "./dom.js";

var SVG_NS = "http://www.w3.org/2000/svg";

// Short, plain, low-pressure phrases. Each must fit on one line in the splash
// box (--q in css/styles.css, in em); longer ones are commented out below.
export var AFFIRMATIONS = [
  "Small steps still count.",
  "Progress, not perfection.",
  "One task at a time.",
  "Done is better than perfect.",
  "Keep the momentum.",
  "A little today adds up.",
  // "You don’t have to finish, just start.",
  "Forward is forward.",
  "Action over overthinking.",
  "Start now, figure it out later.",
  "Execute without delay.",
  "Motion creates motivation.",
  "Just do the next small step.",
  "Built to finish things.",
  "Less talking, more doing.",
  "Distractions lose, you win.",
  "Eyes on the prize.",
  "Your focus is unbreakable.",
  "Own this hour.",
  "Laser precision, zero excuses.",
  "Deep work mode activated.",
  // "Build momentum every minute.",
  // "Consistency is your superpower.",
  "Tick it off the list.",
  "You are a finishing machine.",
  "Sustained effort yields results.",
  "Every small win counts.",
  "Choose productivity today.",
  "Discipline beats motivation.",
  "You are in total control.",
  "Obstacles are just detours.",
  "You have everything you need.",
  "Thrive under pressure.",
  "Decide to make it happen.",
  "Do it now.",
  "Break the friction.",
  "Execution over excuses.",
  "Inertia ends today.",
  "Step up.",
  "Make the move.",
  "Show up for the work.",
  "Run the day.",
  "Fueled by pure drive.",
  "Dominate the checklist.",
  "Nothing holds you back.",
  "Unstoppable work ethic.",
  "Set the pace.",
  "Claim the win early.",
  "Massive action, minimal noise.",
  "Produce results, not excuses.",
  "Efficiency is the standard.",
  "Deliver on time.",
  "Output beats hesitation.",
  "Crush the tasks.",
  "Streamline and succeed.",
  "Lock in.",
  "Silent work, loud results.",
  "No room for doubt.",
  "Push through it.",
  "The path is clear.",
  "Finish what you started.",
  "Stay with it.",
  "Prioritize impact over activity.",
  "Clear, focused, and adaptable.",
  "Fall in love with the problem.",
  "Embrace ambiguity.",
  "Ship, learn, iterate, repeat.",
  "You are skilled and effective.",
  "Continuously seek to learn.",
  // "Be adaptable and open to change.",
  "Embrace feedback.",
  "Prioritize tasks effectively.",
  "Create value.",
  "You have clear vision.",
  "You are resourceful.",
  "Focus.",
  "Be patient and persistent.",
  "Celebrate your successes.",
  "Don’t let time manage you.",
  "Drive innovation.",
  "Be decisive and assertive.",
  "Inspire.",
  "Calm and composed.",
  "Lead by example.",
  "Foster collaboration.",
  "Time to deliver.",
  "Leverage insights.",
  "Smash potential risks.",
  "Uphold transparency.",
  "Be open to experimentation.",
  "You are the actionable item.",
  "Look for feedback loops."
];

function svgEl(tag, attrs) {
  var e = document.createElementNS(SVG_NS, tag);
  if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  return e;
}

// Verbatim from assets/sidequest-icon.svg -- the icon's real 5 branches, exact
// coordinates. Endpoints are given explicitly (not computed from the
// relative path commands) since that's what caused a real endpoint-mismatch
// bug before.
function buildTree() {
  // Each path embeds its own terminal node, so line and node stay paired.
  // `parent` is the index this line grows from (null for the root).
  // `len` is Chromium's getTotalLength() of the icon's own paths.
  return {
    paths: [
      // Top_Path -> Node_1 (circle)
      { d: "M115.88,-30.43 l30.33,154.2", len: 157.2, parent: null, node: { kind: "circle", x: 154.78, y: 167.37, r: 53.31 } },
      // Left_Path_1 -> End_1 (rotated square), grows from Node_1
      { d: "M102.47,177.65 l-23.25,4.57 c-36.81,7.24 -51.6,29.27 -44.36,66.08 l28.7,145.94", len: 263.8, parent: 0, node: { kind: "square", x: 63.56, y: 394.24, size: 77.01, rotate: -11.13 } },
      // Right_Path_1 -> Node_2 (circle), grows from Node_1
      { d: "M207.09,157.08 l52.31,-10.29 c34.87,-6.86 55.74,7.15 62.6,42.02 l9.64,49.01", len: 189.8, parent: 0, node: { kind: "circle", x: 342.01, y: 290.53, r: 47.39 } },
      // Left_Path_2 -> End_2 (rotated square), grows from Node_2
      { d: "M295.51,299.68 l-23.25,4.57 c-25.19,4.95 -35.3,20.02 -30.35,45.21 l19.38,98.53", len: 186.6, parent: 2, node: { kind: "square", x: 261.29, y: 448.0, size: 77.01, rotate: -11.13 } },
      // Right_Path_2 -> Milestone. Center is the icon's real one, past the line's endpoint.
      { d: "M388.51,281.39 l29.06,-5.72 c32.94,-6.48 52.64,6.75 59.12,39.69 l4,20.34", len: 132.1, parent: 2, node: { kind: "diamond", x: 492.12, y: 393.79, size: 118.48, rotate: -56.13 } }
    ]
  };
}

// Same shapes/colors as the real icon, rotated to match its own angles.
function buildNodeShape(n) {
  if (n.kind === "circle") {
    return svgEl("circle", { cx: n.x, cy: n.y, r: n.r, fill: "var(--surface)", stroke: "var(--planned)", "stroke-width": "16" });
  }
  var half = n.size / 2;
  var color = n.kind === "diamond" ? "var(--burn)" : "var(--planned)";
  return svgEl("rect", { x: n.x - half, y: n.y - half, width: n.size, height: n.size, rx: n.kind === "diamond" ? 9 : 8, fill: color, transform: "rotate(" + n.rotate + " " + n.x + " " + n.y + ")" });
}

// Returns {path, node} pairs in draw order, so line i and node i always match.
function renderTree(root, tree) {
  var linesGroup = root.querySelector("#splashLines");
  var nodesGroup = root.querySelector("#splashNodes");
  linesGroup.innerHTML = "";
  nodesGroup.innerHTML = "";

  return tree.paths.map(function (p) {
    // Set as real attributes at creation, not a CSS var fallback -- avoids a
    // real flash-of-wrong-dash-pattern bug seen before.
    var len = p.len.toFixed(1);
    var path = svgEl("path", { d: p.d, "stroke-dasharray": len, "stroke-dashoffset": len });
    linesGroup.appendChild(path);

    var node = buildNodeShape(p.node);
    nodesGroup.appendChild(node);
    return { path: path, node: node, len: p.len, parent: p.parent };
  });
}

// Grows outward node by node; timing below is relative to the last line finishing.
var DRAW_SPEED = 0.4;  // SVG user units per ms
var NODE_PAUSE = 150;  // ms from a node starting to fade in until its child lines start
var TIMING = {
  drawStart: 20,
  blurDelay: 20,    // after the last line finishes
  textDelay: 500,   // after blur starts
  holdDur: 2150,    // text fully visible before fade-out starts
  fadeOutDur: 500
};

// Per-pair start/end times, resolved parent-first (buildTree lists parent before child).
function schedule(pairs) {
  var drawEnd = 0;
  pairs.forEach(function (pair) {
    pair.start = pair.parent === null ? TIMING.drawStart : pairs[pair.parent].end + NODE_PAUSE;
    pair.dur = Math.round(pair.len / DRAW_SPEED);
    pair.end = pair.start + pair.dur;
    drawEnd = Math.max(drawEnd, pair.end);
  });
  return drawEnd;
}

// Plays the splash sequence, then removes/hides the overlay and calls done()
// (if given) once the fade-out finishes. No-op (calls done() immediately) if
// showSplash is off or the element isn't present.
export function playSplash(showSplash, done) {
  var root = $("splash");
  // Markup ships pre-blurred in plain HTML, before any JS runs -- avoids a
  // real flash-of-sharp-app bug. If the setting's off, hide it now instead.
  if (!root || !showSplash) { if (root) root.hidden = true; if (done) done(); return; }

  var tree = buildTree();
  var pairs = renderTree(root, tree); // [{path, node}], in draw order -- each node is its own path's real terminus

  var textEl = $("splashText");
  textEl.textContent = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];

  // Forces a layout so the "undrawn" state paints before "drawn" is added.
  // eslint-disable-next-line no-unused-expressions
  root.offsetHeight;

  var drawEnd = schedule(pairs);
  var artBlurAt = drawEnd + TIMING.blurDelay;
  var textAt = artBlurAt + TIMING.textDelay;
  var fadeOutAt = textAt + TIMING.holdDur;

  var timers = [];
  pairs.forEach(function (pair) {
    pair.path.style.transitionDuration = pair.dur + "ms";
    timers.push(setTimeout(function () { pair.path.classList.add("drawn"); }, pair.start));
    // This node is this path's own terminus.
    timers.push(setTimeout(function () { pair.node.classList.add("shown"); }, pair.end));
  });
  timers.push(setTimeout(function () { root.classList.add("artBlurred"); }, artBlurAt));
  timers.push(setTimeout(function () { root.classList.add("textIn"); }, textAt));
  timers.push(setTimeout(function () {
    root.classList.add("fading");
    setTimeout(function () {
      root.hidden = true;
      root.classList.remove("backdropBlurred", "artBlurred", "textIn", "fading");
      pairs.forEach(function (pair) { pair.path.classList.remove("drawn"); pair.path.style.transitionDuration = ""; pair.node.classList.remove("shown"); });
      if (done) done();
    }, TIMING.fadeOutDur);
  }, fadeOutAt));

  return function cancel() { timers.forEach(clearTimeout); root.hidden = true; };
}
