// Splash overlay atop the already-rendered app, gated by showSplash. Fixed,
// hand-composed artwork (the icon's 5 branches): blur, branches draw, title wipes into an affirmation, fade out.
import { $, playSfx } from "./dom.js";

var SVG_NS = "http://www.w3.org/2000/svg";

// Short, plain, low-pressure phrases. Each must fit the splash box's fixed
// width (--q in css/styles.css); longer ones are commented out below.
export var AFFIRMATIONS = [
"Even the smallest step carrieth thee onward.",
"Strive for progress, not perfection.",
"One task; then the next.",
"Better done than contemplated.",
"Seek not perfection, lest thou never finish.",
"Keep thy momentum; let not thy stride falter.",
"Do the work, and let the results compound.",
"Thou needst not finish; only take the first step.",
"Ever onward.",
"Deeds before doubts.",
"Begin now; the rest shall reveal itself in time.",
"Delay not; the task hath not done itself.",
"Move, and motivation shall follow.",
"Take but the next step; thou needst no more.",
"Thou wert not born to leave tasks half-done.",
"Fewer words; more deeds.",
"Cast distraction from thy presence.",
"Set thine eyes upon the prize.",
"Let nothing break thy focus.",
"Claim this hour as thine own.",
"Let thy aim be true.",
"Excuses avail thee nothing.",
"Enter thy chamber of uninterrupted labor.",
"Strengthen thy\u00a0momentum.",
"Consistency is thy hidden strength.",
"Strike it from the list and be done with it.",
"Rest if thou must, but finish what thou started.",
"Steady labor bringeth forth mighty results.",
"Count every victory, however small.",
"Behold, another day of deeds.",
"Discipline shall carry thee.",
"Take the reins; choose thy course.",
"Let obstacles be but bends upon thy road.",
"Thou hast all that thou needest.",
"Stand firm when the pressure riseth.",
"Make thy decision, and bring it to pass.",
"Why dost thou tarry? The task awaiteth.",
"Remove the obstacle, or work around it.",
"Let excuses perish; let the work begin.",
"Let inertia end here and now.",
"Rise and take thy place.",
"Make thy move.",
"Present thyself before the task.",
"Let the work know thee.",
"Seize the day and command its course.",
"Let thy drive be thy fuel.",
"Conquer the list, task by task.",
"Naught shall bar thy way.",
"Be relentless in thy work, but remember to eat.",
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
"Let thy results speak loudly.",
"Give doubt no seat at thy table.",
"Press onward; thou art not yet beaten.",
"The road lieth open before thee.",
"Finish what thy hands have begun.",
"Stay the course, though the road be long.",
"Seek first the task that mattereth most.",
"Keep thy mind clear.",
"Keep thy purpose fixed.",
"Be steadfast in purpose, but flexible in thy plans.",
"Thou shalt learn to love the problem.",
"Make peace with uncertainty.",
"Uncertainty is oft the road to discovery.",
"Deliver, learn, refine, and ride forth again.",
"Thou knowest thy craft, and thou wieldest it well.",
"Be ever a student.",
"Seek what thou dost not yet know.",
"Bend with the wind.",
"Welcome the changing tide.",
"Accept counsel, even when thou likest it not.",
"Let good feedback sharpen thy blade.",
"Set thy tasks in their rightful order.",
"Create something worthy of being made.",
"Thy vision is clear; trust the road before thee.",
"Thou hast more tools than excuses.",
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
"Thou hast made the thing. Now release it.",
"Use what thou hast learned.",
"Wisdom unused is wisdom wasted.",
"Find the problem early, lest it find thee.",
"Let truth be thy banner.",
"Let transparency be thy shield.",
"Try boldly; learn from what followeth.",
"Seek the loop.",
"Act, observe, learn, and act again.",
"Change thy course when the road demandeth it.",
"Change may yet show thee a better road.",
"’Twixt thee and triumph standeth the task.",
"Thou art the path to triumph.",
"Naught bars thee from triumph.",
"Triumph awaiteth thy doing.",
"Thou alone commandest triumph.",
"Beware the idle hour.",
"Fortune favor’th the diligent.",
"Let no task linger.",
"Onward, though the road be crooked.",
"Small deeds yield great rewards.",
"Thy quest awaiteth thy courage.",
"Fret not over trifles.",
"Strike whilst the iron gloweth.",
"Take heed of thy priorities.",
"Let haste be thy servant.",
"A clear mind conquereth much.",
"Make ready, then make haste.",
"Beware the creeping backlog.",
"Thy next triumph awaiteth.",
"Leave no loose ends.",
"Do not chase every rabbit.",
"Let patience temper thy ambition.",
"Fortune smileth upon the prepared.",
"Choose wisely, then proceed.",
"Keep thy ledger in order.",
"Even dragons tire of waiting.",
"Make good use of this hour.",
"Beware the endless tinkering.",
"Let thy plans meet reality.",
"Enough planning; draw thy sword.",
"Thy hands know what to do.",
"Gather thy wits and begin.",
"Do not court distraction.",
"Let the lesser matters wait.",
"One victory begetteth another.",
"Mind thy pace, brave traveler.",
"Be bold, but not foolish.",
"Trust not the fickle morrow.",
"Thy doubts shall pass.",
"Keep thy promises to thyself.",
"Let not fear choose thy path.",
"Make room for better things.",
"All things in their season.",
"First things first, good traveler.",
"Finish the quest thou hast begun.",
"Beware the lure of busywork.",
"Thy tools are fit for purpose.",
"Let not perfection rob thee.",
"Take counsel from thy failures.",
"Every master was once a novice.",
"Test thy mettle against the task.",
"Let curiosity lead thee forth.",
"Question the wisdom of haste.",
"An open mind findeth new paths.",
"Be wary of easy answers.",
"Seek knowledge beyond thy borders.",
"Let thy craft be ever sharpened.",
"Make peace with the unknown.",
"Trust the lessons of experience.",
"Even failure hath its uses.",
"Adapt, lest thou be undone.",
"Change course without shame.",
"Let wisdom guide thy hand.",
"Keep thy wits about thee.",
"Beware the gilded distraction.",
"Not all that glitters is progress.",
"Spend thy efforts wisely.",
"Do not gild the lily.",
"Let good enough be enough.",
"Thy best is oft sufficient.",
"Rest, lest thy sword grow dull.",
"Even heroes need their supper.",
"Take breath before the next battle.",
"Do not weary thy spirit.",
"Tomorrow bringeth another quest.",
"Celebrate, for thou hast earned it.",
"Count thy blessings and thy spoils.",
"Keep thy victories close.",
"Let thy burdens be divided.",
"No adventurer need travel alone.",
"Good company lighteneth the load.",
"Share thy wisdom freely.",
"Trust, but verify the scroll.",
"Let deeds speak before words.",
"Honesty beareth its own reward.",
"Own thy errors without shame.",
"Be humble in thy triumph.",
"Give credit where it is due.",
"Let thy fellowship grow strong.",
"Beware the task unbounded.",
"Keep thy ambitions in check.",
"Slay the beast of delay.",
"Turn thy plans into deeds.",
"Beware the five-minute errand.",
"Let not the scroll grow endless.",
"Thy schedule is no mere suggestion.",
"Order bringeth peace to chaos.",
"Make haste, but keep thy wits.",
"Leave the dungeon better than found.",
"Claim thy spoils and ride forth.",
"Another quest awaiteth thee.",
"Well done, noble adventurer.",
"Now onward to greater things."
];

function svgEl(tag, attrs) {
  var e = document.createElementNS(SVG_NS, tag);
  if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
  return e;
}

// Verbatim from assets/sidequest-icon.svg. Endpoints are given explicitly
// (not computed from the relative path commands) to avoid an endpoint-mismatch bug.
function buildTree() {
  // Each path embeds its own terminal node; `parent` is the index it grows
  // from (null for the root), and `len` is Chromium's getTotalLength().
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
    return svgEl("circle", { cx: n.x, cy: n.y, r: n.r, fill: "var(--logo-surface)", stroke: "var(--logo-planned)", "stroke-width": "16" });
  }
  var half = n.size / 2;
  var color = n.kind === "diamond" ? "var(--logo-burn)" : "var(--logo-planned)";
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
  // Ms relative to the text-wipe when the splash sound starts (negative fires early, covering play()'s lag).
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

// Plays the splash, then hides the overlay and calls done(). No-op if showSplash is off; `pickIndex(count)` chooses the quote (possibly a promise, defaults to random), and `opts.hold` keeps the last frame instead of fading out (`opts.instant` jumps straight to it).
export function playSplash(showSplash, done, audio, pickIndex, opts) {
  var hold = !!(opts && opts.hold), instant = hold && !!opts.instant;
  var root = $("splash");
  // Markup ships pre-blurred in plain HTML, before any JS runs -- avoids a
  // real flash-of-sharp-app bug. If the setting's off, hide it now instead.
  if (!root || !showSplash) { if (root) root.hidden = true; if (done) done(); return; }
  // A replay starts from the hidden, class-stripped state the last run left behind.
  root.hidden = false; root.classList.add("backdropBlurred");

  var tree = buildTree();
  var pairs = renderTree(root, tree); // [{path, node}], in draw order -- each node is its own path's real terminus

  var textEl = $("splashText");
  var pick = typeof pickIndex === "function" ? pickIndex : function (n) { return Math.floor(Math.random() * n); };
  var picked = pick(AFFIRMATIONS.length);
  if (picked && typeof picked.then === "function") { textEl.textContent = ""; picked.then(function (i) { textEl.textContent = AFFIRMATIONS[i]; }); }
  else textEl.textContent = AFFIRMATIONS[picked];

  // Forces a layout so the "undrawn" state paints before "drawn" is added.
  // eslint-disable-next-line no-unused-expressions
  root.offsetHeight;

  if (instant) {
    pairs.forEach(function (pair) { pair.path.style.transitionDuration = "0ms"; pair.path.classList.add("drawn"); pair.node.classList.add("shown"); });
    root.classList.add("artBlurred", "textIn");
    if (done) done();
    return function cancel() {};
  }

  var drawEnd = schedule(pairs);
  var artBlurAt = drawEnd + TIMING.blurDelay;
  var textAt = artBlurAt + TIMING.textDelay;
  var fadeOutAt = textAt + TIMING.holdDur;

  var timers = [];
  pairs.forEach(function (pair) {
    pair.path.style.transitionDuration = pair.dur + "ms";
    timers.push(setTimeout(function () { pair.path.classList.add("drawn"); }, pair.start));
    // This node is this path's terminus.
    timers.push(setTimeout(function () { pair.node.classList.add("shown"); }, pair.end));
  });
  timers.push(setTimeout(function () { root.classList.add("artBlurred"); }, artBlurAt));
  // Disabled: browsers block Audio.play() here outside a real click/tap/keydown handler.
  // if (audio) timers.push(setTimeout(function () { playSfx("assets/sfx/quest.mp3"); }, Math.max(0, textAt + TIMING.soundOffset)));
  timers.push(setTimeout(function () { root.classList.add("textIn"); }, textAt));
  if (hold) timers.push(setTimeout(function () { if (done) done(); }, fadeOutAt));
  else timers.push(setTimeout(function () {
    root.classList.add("fading");
    setTimeout(function () {
      root.hidden = true;
      root.classList.remove("backdropBlurred", "artBlurred", "textIn", "fading");
      pairs.forEach(function (pair) { pair.path.classList.remove("drawn"); pair.path.style.transitionDuration = ""; pair.node.classList.remove("shown"); });
      if (done) done();
    }, TIMING.fadeOutDur);
  }, fadeOutAt));

  return function cancel() { timers.forEach(clearTimeout); if (!hold) root.hidden = true; };
}
