// One-shot full-page confetti burst for quest completion, gated by
// settings.completionFx. Builds its own canvas on demand and removes it once
// every particle finishes -- nothing persists in the DOM between bursts.
var TWO_PI = Math.PI * 2;
var HALF_PI = Math.PI * 0.5;
// Read from css/tokens.css rather than hardcoded here, so a palette change in
// one place covers both the UI and this effect.
function confettiColors() {
  var cs = window.getComputedStyle(document.documentElement);
  var names = ["--confetti-1", "--confetti-2", "--confetti-3", "--confetti-4", "--confetti-5", "--confetti-6"];
  var out = names.map(function (n) { return cs.getPropertyValue(n).trim(); }).filter(Boolean);
  return out.length ? out : [cs.getPropertyValue("--planned").trim() || "rgb(47,93,138)"];
}

function Particle(cx, cy, w, h, colors) {
  this.p0 = { x: cx, y: cy };
  this.p1 = { x: Math.random() * w, y: Math.random() * h * 0.6 };
  this.p2 = { x: Math.random() * w, y: Math.random() * h };
  this.p3 = { x: Math.random() * w, y: h + 40 };
  this.time = 0;
  this.duration = 1.6 + Math.random() * 1.1;
  this.color = colors[(Math.random() * colors.length) | 0];
  this.w = 7; this.h = 5;
  this.x = cx; this.y = cy; this.r = 0; this.sy = 1;
  this.complete = false;
}
function easeOutCubic(t, d) { t = t / d - 1; return t * t * t + 1; }
function cubeBezier(p0, c0, c1, p1, t) {
  var nt = 1 - t;
  return {
    x: nt * nt * nt * p0.x + 3 * nt * nt * t * c0.x + 3 * nt * t * t * c1.x + t * t * t * p1.x,
    y: nt * nt * nt * p0.y + 3 * nt * nt * t * c0.y + 3 * nt * t * t * c1.y + t * t * t * p1.y
  };
}
Particle.prototype.update = function (dt) {
  this.time = Math.min(this.duration, this.time + dt);
  var f = easeOutCubic(this.time, this.duration);
  var p = cubeBezier(this.p0, this.p1, this.p2, this.p3, f);
  var dx = p.x - this.x, dy = p.y - this.y;
  this.r = Math.atan2(dy, dx) + HALF_PI;
  this.sy = Math.sin(Math.PI * f * 10);
  this.x = p.x; this.y = p.y;
  this.complete = this.time === this.duration;
};
Particle.prototype.draw = function (ctx) {
  ctx.save();
  ctx.translate(this.x, this.y);
  ctx.rotate(this.r);
  ctx.scale(1, this.sy);
  ctx.fillStyle = this.color;
  ctx.fillRect(-this.w * 0.5, -this.h * 0.5, this.w, this.h);
  ctx.restore();
};

// A canvas-driven animation can't be shortened to "near zero" the way a CSS
// transition can -- honor reduced motion by not running it at all.
function reducedMotion() {
  try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch (e) { return false; }
}

export function playConfetti() {
  if (reducedMotion()) return;
  var canvas = document.createElement("canvas");
  canvas.className = "confettiFx";
  canvas.setAttribute("aria-hidden", "true");
  var ctx = canvas.getContext("2d");
  if (!ctx) return;
  document.body.appendChild(canvas);
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener("resize", resize);

  var colors = confettiColors();
  var particles = [];
  for (var i = 0; i < 150; i++) particles.push(new Particle(canvas.width * 0.5, canvas.height * 0.35, canvas.width, canvas.height, colors));

  var last = null;
  function frame(t) {
    if (last === null) last = t;
    var dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var done = true;
    particles.forEach(function (p) {
      p.update(dt);
      p.draw(ctx);
      if (!p.complete) done = false;
    });
    if (done) { window.removeEventListener("resize", resize); canvas.remove(); return; }
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
}
