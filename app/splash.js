// Splash overlay atop the already-rendered app, gated by showSplash. Fixed,
// hand-composed artwork (the icon's own 5 branches, not procedural).
// Sequence: blur -> branches draw -> blur -> the "Sidequest" title (shown from
// first paint via static HTML) wipes into the affirmation -> fade out.
import { $, playSfx } from "./dom.js";

var SVG_NS = "http://www.w3.org/2000/svg";

// Short, plain, low-pressure phrases. Each must fit in two lines in the
// splash box (--q in css/styles.css, in em); longer ones are commented out
// below, confirmed by measuring real line counts at mobile width.
export var AFFIRMATIONS = [
  "Even the smallest step carrieth thee onward.",
  "Strive for progress, not perfection.",
  "One task; then the next.",
  "Better a deed completed.",
  "Do not thy chase a perfect deed.",
  "Keep thy momentum; let not thy stride falter.",
  "Do and it shall compound ere long.",
  "Thou needst not finish; only take the first step.",
  "Ever onward.",
  "Deeds before doubts.",
  "Begin now; the rest shall reveal itself in time.",
  "Delay not; see the deed done.",
  "Move, and motivation shall follow.",
  "Take but the next step; thou needst no more.",
  "Thou art made to bring things to completion.",
  "Fewer words; more deeds.",
  "Let distraction be vanquished.",
  "Set thine eyes upon the prize.",
  "Let nothing break thy focus.",
  "Claim this hour as thine own.",
  "Let thy aim be true.",
  "Make no room for excuses.",
  "Enter now the realm of deep work.",
  "Strengthen thy momentum.",
  "Consistency is thy hidden strength.",
  "Strike it from the list and be done with it.",
  "Thou art a tireless finisher.",
  "Steady labor bringeth forth mighty results.",
  "Count every victory, however small.",
  "Choose the path of productivity this day.",
  "Discipline shall carry thee.",
  "Thou holdest the reins; steer thy course.",
  "Let obstacles be but bends upon thy road.",
  "Thou hast all that thou needest.",
  "Stand firm when the pressure riseth.",
  "Make thy decision, and bring it to pass.",
  "Do it now; why tarry?",
  "Sunder what bars thee from the deed.",
  "Let excuses perish; let execution prevail.",
  "Let inertia end here and now.",
  "Rise and take thy place.",
  "Make thy move.",
  "Show thyself to the work.",
  "Let the work know thee.",
  "Seize the day and command its course.",
  "Let thy drive be thy fuel.",
  "Conquer the list, task by task.",
  "Naught shall bar thy way.",
  "Let thy work be relentless.",
  "Set the pace; let the rest follow.",
  "Take the victory whilst it is yet within reach.",
  "Do much; speak little.",
  "Bring forth results, and leave excuses behind.",
  "Let efficiency be thy standard.",
  "Deliver what thou hast promised.",
  "Deliver it in due time.",
  "Deeds shall conquer hesitation.",
  "Lay low thy tasks, one by one.",
  "Make the path clear, then walk it swiftly.",
  "Hold fast to the work.",
  "Let thy labor be quiet.",
  "Let thy results thunderous.",
  "Give doubt no seat at thy table.",
  "Press onward; thou art not yet beaten.",
  "The road lieth open before thee.",
  "Finish what thy hands have begun.",
  "Stay the course, though the road be long.",
  "Seek the deed that mattereth.",
  "Keep thy mind clear.",
  "Keep thy purpose fixed",
  "May thy course be ready to change.",
  "Thou shalt learn to love the problem.",
  "Make peace with uncertainty.",
  "Uncertainty is oft the road to discovery.",
  "Deliver, learn, refine, and ride forth again.",
  "Thou knowest thy craft, and thou wieldest it well.",
  "Be ever a student.",
  "Seek what thou dost not yet know.",
  "Bend with the wind.",
  "Welcome the changing tide",
  "Welcome counsel.",
  "Let good feedback sharpen thy blade.",
  "Set thy tasks in their rightful order.",
  "Create something worthy of being made.",
  "Thy vision is clear; trust the road before thee.",
  "Thou hast more resource than thou thinkest.",
  "Still thy mind, and focus thy sight.",
  "Be patient in the waiting.",
  "Be steadfast in the doing.",
  "Mark thy victories; thou hast earned them.",
  "Let not the clock become thy master.",
  "Make bold the path of innovation.",
  "Choose thy course, then stand by it.",
  "Kindle the fire in those around thee.",
  "Be still of mind and steady of hand.",
  "Let thy deeds teach others how it is done.",
  "Build bridges.",
  "Let thy work be a beacon to others.",
  "Great works are seldom wrought alone.",
  "The hour hath come.",
  "Deliver what thou hast made.",
  "Use what thou hast learned.",
  "Wisdom unused is wisdom wasted.",
  "Find the danger ere it findeth thee.",
  "Let truth be thy banner.",
  "Let transparency be thy shield.",
  "Try boldly; learn from what followeth.",
  "Thou art the deed that awaiteth doing.",
  "Seek the loop.",
  "Act, observe, learn, and act again.",
  "Change thy course when the road demandeth it.",
  "Change may yet show thee a better road."
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
  fadeOutDur: 500,
  // Where the splash sound starts, relative to the text-wipe (textAt):
  // negative fires it that many ms before the wipe begins (to cover the
  // small real-world lag between calling play() and sound actually
  // starting), positive fires it after, 0 fires it exactly at the wipe.
  // Change this one number to move the sound without touching anything else.
  soundOffset: -10
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
// showSplash is off or the element isn't present. When `audio` is true, the
// affirmation's text-wipe sound is scheduled a few ms ahead of the wipe
// itself, for the small real-world lag between calling play() and sound
// actually starting -- best effort only: a browser that has not yet seen any
// interaction on this page blocks it outright, with no retry, since a sound
// played later than the wipe it's meant to accompany would be worse than none.
export function playSplash(showSplash, done, audio) {
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
  // Disabled: browsers block Audio.play() here outside a real click/tap/keydown handler.
  // if (audio) timers.push(setTimeout(function () { playSfx("assets/sfx/quest.mp3"); }, Math.max(0, textAt + TIMING.soundOffset)));
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
