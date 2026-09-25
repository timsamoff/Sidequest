// Splash screen: a real overlay atop the already-rendered app (see app.js's
// boot sequence -- the app renders immediately either way; this is purely
// decorative, on every load, gated by state.settings.showSplash). Branching-
// path artwork echoes the app icon's visual language (rounded elbow joints,
// small square task-endpoints, one accent-colored milestone diamond), always
// anchored at the top-left corner and identical every load (confirmed
// 2026-09-25 -- a fixed, hand-composed layout, not procedural/randomized,
// since a random generator's layout quality was inconsistent and the user
// wants the same animation every time anyway). Exactly the icon's own 5
// branches. Sequence: backdrop blurs immediately -> branches draw in ->
// artwork blurs -> affirmation text fades in -> whole overlay fades out to
// reveal the app. See DESIGN.md's splash-screen section.
import { $ } from "./dom.js";

var SVG_NS = "http://www.w3.org/2000/svg";

// Short, plain, low-pressure phrases -- matches this app's existing voice
// (see CLAUDE.md's writing-style guidance), not corporate-motivational or
// cutesy. User plans to add more; keep this list easy to extend.
export var AFFIRMATIONS = [
  "Small steps still count.",
  "Progress, not perfection.",
  "One task at a time.",
  "Done is better than perfect.",
  "Keep the momentum.",
  "A little today adds up.",
  "You don't have to finish, just start.",
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
  "Build momentum every minute.",
  "Consistency is your superpower.",
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
  "Stay with it."
];

function svgEl(tag, attrs) {
  var e = document.createElementNS(SVG_NS, tag);
  if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  return e;
}

// The real icon's own path/shape data, VERBATIM (assets/sidequest-icon.svg /
// index.html's #sqLogo) -- confirmed 2026-09-25: exactly the icon's 5
// branches, no invented extra branch, every node/end-square/milestone at the
// exact coordinates and rotation the icon itself uses, so a line's endpoint
// and its node/marker always coincide exactly. The root line intentionally
// starts off-canvas (negative y), matching the icon's own confirmed-
// intentional top crop.
//
// Each path's real endpoint (in absolute SVG user-space coordinates) is
// given explicitly alongside its `d`, since the icon's own path data uses
// relative commands (l/c) and computing the true endpoint by hand from those
// is exactly the kind of arithmetic that produced the earlier
// endpoint-doesn't-match-the-node bug -- these values were taken directly
// from the icon's own absolute-coordinate node/rect positions, not
// recomputed.
function buildTree() {
  // Each path embeds the one node/marker it actually terminates at, so
  // "this line finished drawing" and "show this node" are never coupled by
  // fragile parallel-array position (confirmed 2026-09-25: an earlier
  // index-based pairing showed the wrong node at the wrong line's finish).
  // `parent` is the index of the path whose node this line grows out of
  // (null for the root), so each line starts only once that node is showing.
  // `len` values are Chromium's getTotalLength() of the icon's own paths.
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
      // Right_Path_2 -> Milestone (rotated diamond), grows from Node_2. Center
      // is the icon's real one (its rect's transform applied), not the line's
      // endpoint: the diamond sits further along the line's own axis so its
      // top corner meets the line, which ends hidden just inside it.
      { d: "M388.51,281.39 l29.06,-5.72 c32.94,-6.48 52.64,6.75 59.12,39.69 l4,20.34", len: 132.1, parent: 2, node: { kind: "diamond", x: 492.12, y: 393.79, size: 118.48, rotate: -56.13 } }
    ]
  };
}

// Same shapes/colors as the real icon: circles white-fill with a dark-blue
// ring (Node_1/Node_2), solid dark-blue rounded squares (End_1/End_2), one
// solid red rounded square rotated into a diamond (Milestone) -- each
// rotated exactly the icon's own amount so a corner sits flush against its
// line's real angle, same as the source artwork.
function buildNodeShape(n) {
  if (n.kind === "circle") {
    return svgEl("circle", { cx: n.x, cy: n.y, r: n.r, fill: "var(--surface)", stroke: "var(--planned)", "stroke-width": "16" });
  }
  var half = n.size / 2;
  var color = n.kind === "diamond" ? "var(--burn)" : "var(--planned)";
  return svgEl("rect", { x: n.x - half, y: n.y - half, width: n.size, height: n.size, rx: n.kind === "diamond" ? 9 : 8, fill: color, transform: "rotate(" + n.rotate + " " + n.x + " " + n.y + ")" });
}

// Renders each path and its own terminal node as a matched pair, returning
// the pairs in draw order -- playSplash uses this directly, so "line i's
// timer" and "node i's timer" are always the same i, never a separate lookup
// that can drift out of sync.
function renderTree(root, tree) {
  var linesGroup = root.querySelector("#splashLines");
  var nodesGroup = root.querySelector("#splashNodes");
  linesGroup.innerHTML = "";
  nodesGroup.innerHTML = "";

  return tree.paths.map(function (p) {
    // stroke-dasharray/stroke-dashoffset are set as real attributes in this
    // SAME element-creation call, using the pre-measured p.len -- never left
    // to a CSS custom-property fallback for even one synchronous step.
    // Confirmed 2026-09-25: a path previously existed in the live DOM for a
    // brief window with no --len set yet (getTotalLength() itself forces a
    // layout, and the following line that set --len ran after), during which
    // CSS's own var(--len, 400) fallback governed the dash pattern -- for a
    // path whose real length isn't ~400, that rendered as a fragmented,
    // disconnected line, briefly visible before snapping to the correct
    // undrawn state once --len was actually set.
    var len = p.len.toFixed(1);
    var path = svgEl("path", { d: p.d, "stroke-dasharray": len, "stroke-dashoffset": len });
    linesGroup.appendChild(path);

    var node = buildNodeShape(p.node);
    nodesGroup.appendChild(node);
    return { path: path, node: node, len: p.len, parent: p.parent };
  });
}

// The tree grows outward node by node: each line starts once its parent node
// has faded in, and every line draws at the same speed, so of two siblings
// the shorter one finishes (and shows its node) first -- Node_2 before End_1,
// Milestone before End_2. Blur/text/fade-out are measured from the moment
// the last line finishes, so changing DRAW_SPEED can't desync them.
var DRAW_SPEED = 0.4;  // SVG user units per ms
var NODE_PAUSE = 150;  // ms from a node starting to fade in until its child lines start
var TIMING = {
  drawStart: 20,
  blurDelay: 20,    // after the last line finishes
  textDelay: 500,   // after blur starts
  holdDur: 2150,    // text fully visible before fade-out starts
  fadeOutDur: 500
};

// Per-pair start/end times (ms from play), resolved parent-first. Paths are
// listed parent-before-child in buildTree, so one forward pass suffices.
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
  // The splash markup ships visible-with-backdrop-already-blurred in plain
  // HTML (no `hidden` attribute, `backdropBlurred` class present from the
  // first paint) specifically so the blur is in effect before ANY JS runs --
  // confirmed 2026-09-25: an earlier version relied on this function to
  // reveal/blur it, which left a real, visible window (app rendered sharp,
  // THEN the splash appeared moments later) since this runs after the app's
  // own renderAll(). If the setting is off, this is the one path that must
  // hide it immediately, before it can paint at all.
  if (!root || !showSplash) { if (root) root.hidden = true; if (done) done(); return; }

  var tree = buildTree();
  var pairs = renderTree(root, tree); // [{path, node}], in draw order -- each node is its own path's real terminus

  var textEl = $("splashText");
  textEl.textContent = AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)];

  // Force a real layout/paint of the freshly-inserted paths' initial (full-
  // length, undrawn) stroke-dashoffset state before any "drawn" class is
  // added, so the browser has committed a genuine "before" frame for the
  // transition to animate from -- without this, the browser can batch the
  // insert and the first class-add into one frame, which can render as a
  // flash of the wrong state before snapping to the real animated sequence.
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
    // This node is THIS path's own terminus -- it only appears once this
    // exact line has actually finished drawing (confirmed 2026-09-25).
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
