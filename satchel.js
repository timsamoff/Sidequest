// Enhancements only. Every page reads and navigates fine without this file.
(function () {
  var root = document.documentElement;

  /* Theme toggle: Auto, Light, Dark. */
  var KEY = "sidequest-landing-theme";
  var ORDER = ["auto", "light", "dark"];
  var ICON = {
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>',
    light: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor"/></svg>'
  };

  function readTheme() {
    try { var v = window.localStorage.getItem(KEY); return ORDER.indexOf(v) > -1 ? v : "auto"; } catch (e) { return "auto"; }
  }
  function applyTheme(mode) {
    if (mode === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", mode);
  }
  var themeBtn = document.getElementById("themeToggle");
  if (themeBtn) {
    var mode = readTheme();
    var showTheme = function () {
      var next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
      themeBtn.innerHTML = ICON[mode];
      themeBtn.setAttribute("aria-label", "Theme: " + mode + ". Switch to " + next + ".");
    };
    showTheme();
    themeBtn.hidden = false;
    themeBtn.addEventListener("click", function () {
      mode = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
      applyTheme(mode);
      try { window.localStorage.setItem(KEY, mode); } catch (e) { /* storage blocked */ }
      showTheme();
    });
  }

  /* Clasp: opens and closes the lining at every width. Escape closes it and returns focus to the button. */
  var menuBtn = document.getElementById("menuBtn");
  var nav = document.getElementById("mainNav");
  if (menuBtn && nav) {
    var list = nav.querySelector("ul");
    var sizeNav = function () { if (list) nav.style.setProperty("--navh", list.offsetHeight + "px"); };
    window.addEventListener("resize", function () { if (nav.classList.contains("open")) sizeNav(); });
    var setMenu = function (open) {
      if (open) sizeNav();
      nav.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    };
    menuBtn.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
    /* Peek: the strap makes the same small lift as a press every 5 seconds while the menu is closed. It starts after the Welcome splash (or 15 seconds in), and 1.5 seconds after load on pages with no splash. */
    var peek = function () {
      if (nav.classList.contains("open") || menuBtn.matches(":focus-visible")) return;
      if (window.matchMedia("(hover: hover)").matches && menuBtn.matches(":hover")) return;
      menuBtn.classList.add("peek");
    };
    menuBtn.addEventListener("animationend", function () { menuBtn.classList.remove("peek"); });
    var startPeeking = function () {
      if (startPeeking.done) return;
      startPeeking.done = true;
      window.setTimeout(peek, 1000);
      window.setInterval(peek, 5000);
    };
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (document.getElementById("splash")) {
        document.addEventListener("splashdone", startPeeking);
        window.setTimeout(startPeeking, 15000);
      } else window.setTimeout(startPeeking, 1500);
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) { setMenu(false); menuBtn.focus(); }
    });
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("open") && !nav.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    });
  }

  /* Prompt copy buttons. */
  Array.prototype.forEach.call(document.querySelectorAll("[data-copy]"), function (b) {
    var target = document.getElementById(b.getAttribute("data-copy"));
    var status = b.parentNode.querySelector(".copystatus");
    if (!target || !navigator.clipboard) return;
    b.hidden = false;
    b.addEventListener("click", function () {
      navigator.clipboard.writeText(target.textContent).then(function () {
        status.textContent = "Copied.";
      }, function () {
        status.textContent = "Couldn’t copy. Select the text and copy it by hand.";
      });
    });
  });

  /* Scroll lerp: a mouse wheel eases toward its target instead of jumping. Keyboard, touch, trackpads,
     the scrollbar, and in-page links keep their native behavior, and reduced motion turns it off. */
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  var target = window.scrollY, current = target, raf = 0, driving = false, lastT = 0;
  // The share of the remaining distance covered in one 60 fps frame. Slower frames cover more, so the speed holds.
  var EASE = 0.12, FRAME = 1000 / 60;

  var lastY = target;

  function maxScroll() { return Math.max(0, root.scrollHeight - window.innerHeight); }
  function release() {
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    driving = false; lastT = 0;
    target = current = window.scrollY;
  }
  function step(now) {
    // Something else moved the page (a key, a link, the scrollbar): hand control back.
    if (Math.abs(window.scrollY - lastY) > 2) { release(); return; }
    var diff = target - current;
    if (Math.abs(diff) < 1) {
      current = target;
      window.scrollTo({ top: current, behavior: "instant" });
      raf = 0; driving = false; lastT = 0;
      return;
    }
    var dt = lastT ? Math.min(now - lastT, 100) : FRAME;
    lastT = now;
    current += diff * (1 - Math.pow(1 - EASE, dt / FRAME));
    window.scrollTo({ top: current, behavior: "instant" });
    lastY = window.scrollY;
    raf = window.requestAnimationFrame(step);
  }
  window.addEventListener("scroll", function () {
    if (!driving) { target = current = window.scrollY; }
  }, { passive: true });
  ["keydown", "pointerdown", "touchstart", "click"].forEach(function (type) {
    document.addEventListener(type, function () { if (driving) release(); }, { passive: true, capture: true });
  });
  window.addEventListener("wheel", function (e) {
    if (reduce.matches || e.ctrlKey || e.defaultPrevented) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    var dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= window.innerHeight;
    if (Math.abs(dy) < 40) return;
    e.preventDefault();
    if (!driving) { target = current = lastY = window.scrollY; }
    target = Math.max(0, Math.min(maxScroll(), target + dy));
    driving = true;
    if (!raf) raf = window.requestAnimationFrame(step);
  }, { passive: false });
})();

/* Screenshots load lazily and are inked in as they scroll into view.
   Without JavaScript or with reduced motion the image just shows. */
(function () {
  var still = !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Smooth random noise on a grid, three octaves, values 0 to 1.
  var noiseField = function (w, h) {
    var out = new Float32Array(w * h), amp = 1, total = 0;
    for (var o = 0; o < 3; o++) {
      var cell = 28 / (1 << o), gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2, g = [];
      for (var i = 0; i < gw * gh; i++) g.push(Math.random());
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        var a = g[iy * gw + ix], b2 = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
        out[y * w + x] += amp * ((a + (b2 - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty);
      }
      total += amp; amp *= 0.5;
    }
    for (var n = 0; n < out.length; n++) out[n] /= total;
    return out;
  };
  // The real image sits under a small canvas that draws a parchment cover with an ink-shaped hole.
  // Only the small canvas is redrawn, at 30 fps, and the browser scales it up.
  var inkIn = function (box) {
    var r = box.getBoundingClientRect();
    var lw = Math.ceil(r.width / 4), lh = Math.ceil(r.height / 4);
    var cv = document.createElement("canvas");
    cv.className = "inkcanvas"; cv.width = lw; cv.height = lh; cv.setAttribute("aria-hidden", "true");
    var ctx = cv.getContext("2d"), data = ctx.createImageData(lw, lh), px = data.data, noise = noiseField(lw, lh);
    var seeds = [], diag = Math.sqrt(lw * lw + lh * lh);
    for (var i = 0; i < 3; i++) seeds.push({ x: lw * (0.2 + 0.6 * Math.random()), y: lh * (0.2 + 0.6 * Math.random()), delay: 0.18 * i * Math.random() });
    // The ink is a darker shade of the hero icon's border color, --parch-edge. The cover matches the box.
    var edge = /^#([0-9a-f]{6})$/i.exec(window.getComputedStyle(document.documentElement).getPropertyValue("--parch-edge").trim());
    var ink = edge ? [0, 2, 4].map(function (n) { return Math.round(parseInt(edge[1].substr(n, 2), 16) * 0.45); }) : [0, 0, 0];
    var probe = document.createElement("canvas"); probe.width = probe.height = 1;
    var pctx = probe.getContext("2d"); pctx.fillStyle = window.getComputedStyle(box).backgroundColor; pctx.fillRect(0, 0, 1, 1);
    var cover = pctx.getImageData(0, 0, 1, 1).data;
    var start = null, last = -99, DURATION = 2300;
    box.appendChild(cv);
    box.classList.add("inking");
    var frame = function (now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / DURATION, 1);
      if (t < 1 && now - last < 33) { window.requestAnimationFrame(frame); return; }
      last = now;
      var e = 1 - Math.pow(1 - t, 1.7), thr = -0.12 + e * 1.1;
      for (var y = 0; y < lh; y++) for (var x = 0; x < lw; x++) {
        var k = y * lw + x, dmin = 9;
        for (var s = 0; s < 3; s++) {
          var dx = x - seeds[s].x, dy = y - seeds[s].y, dd = Math.sqrt(dx * dx + dy * dy) / diag + seeds[s].delay;
          if (dd < dmin) dmin = dd;
        }
        var f = dmin * 1.15 + (noise[k] - 0.5) * 0.7, a = Math.max(0, Math.min(1, (thr - f) / 0.07));
        var band = Math.max(0, 1 - Math.abs(thr - f - 0.058) / 0.042) * (1 - t * 0.45);
        var ia = Math.min(1, band * 1.5) * a * 0.84, ca = (1 - a) * (1 - ia), alpha = ia + ca, o = k * 4;
        px[o] = alpha ? (ink[0] * ia + cover[0] * ca) / alpha : 0;
        px[o + 1] = alpha ? (ink[1] * ia + cover[1] * ca) / alpha : 0;
        px[o + 2] = alpha ? (ink[2] * ia + cover[2] * ca) / alpha : 0;
        px[o + 3] = alpha * 255;
      }
      ctx.putImageData(data, 0, 0);
      if (t < 1) window.requestAnimationFrame(frame);
      else { box.classList.add("inked", "shown"); cv.remove(); }
    };
    window.requestAnimationFrame(frame);
  };
  Array.prototype.forEach.call(document.querySelectorAll(".shotbox"), function (box) {
    var img = box.querySelector("img");
    var ready = !!(img.complete && img.naturalWidth), seen = false, ran = false;
    var go = function () {
      if (still) { if (ready) box.classList.add("shown"); return; }
      if (!seen || !ready || ran) return;
      ran = true;
      // Decoded first, so the ink never uncovers an image that has not been drawn yet.
      var begin = function () { inkIn(box); };
      if (img.decode) img.decode().then(begin, begin); else begin();
    };
    if (!ready) img.addEventListener("load", function () { ready = true; go(); });
    if (still) { go(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      seen = true;
      go();
    }, { threshold: 0.2 });
    io.observe(box);
  });
})();

/* Pinned cards: each card's edge and shadows are drawn once on a canvas behind it. The live filter in
   leather.css, which this replaces, was re-run on every frame of anything that moved over the cards. */
(function () {
  var PAD = 40, BLUR = 2, backs = [];
  if (!document.createElement("canvas").getContext) return;
  // The card's outline: a rectangle with the curled corner cut away, the same path as the mask in leather.css.
  function trace(c, w, h, bbox) {
    var k = bbox / 120, ox = w - bbox, oy = h - bbox;
    function X(x) { return ox + (x + 20) * k; }
    function Y(y) { return oy + (y + 20) * k; }
    c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(X(100), Y(-18));
    c.quadraticCurveTo(X(100), Y(0), X(87.27), Y(12.73));
    c.quadraticCurveTo(X(46.46), Y(46.46), X(12.73), Y(87.27));
    c.quadraticCurveTo(X(0), Y(100), X(-18), Y(100));
    c.lineTo(0, h); c.closePath();
  }
  function draw(b) {
    var r = b.card.getBoundingClientRect(), w = r.width, h = r.height;
    if (!w || !h) return;
    var cs = window.getComputedStyle(b.card), bbox = parseFloat(cs.getPropertyValue("--bbox")) || 74;
    var edge = cs.getPropertyValue("--pin-edge").trim() || "tan", dpr = window.devicePixelRatio || 1;
    var cw = Math.ceil((w + 2 * PAD) * dpr), ch = Math.ceil((h + 2 * PAD) * dpr), cv = b.canvas;
    cv.width = cw; cv.height = ch; cv.style.width = cw / dpr + "px"; cv.style.height = ch / dpr + "px";
    // The card grown by one pixel on every side, in the edge color.
    var shape = document.createElement("canvas"); shape.width = cw; shape.height = ch;
    var sc = shape.getContext("2d");
    sc.fillStyle = edge;
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
      sc.setTransform(dpr, 0, 0, dpr, (PAD + dx) * dpr, (PAD + dy) * dpr);
      trace(sc, w, h, bbox); sc.fill();
    }
    // The soft shadow, then the tight one, each cast by that shape.
    var ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, cw, ch);
    ctx.shadowColor = "rgba(0, 0, 0, .18)"; ctx.shadowBlur = 12 * BLUR * dpr; ctx.shadowOffsetY = 8 * dpr; ctx.drawImage(shape, 0, 0);
    ctx.shadowColor = "rgba(0, 0, 0, .22)"; ctx.shadowBlur = 1.5 * BLUR * dpr; ctx.shadowOffsetY = 2 * dpr; ctx.drawImage(shape, 0, 0);
  }
  function drawAll() { backs.forEach(draw); }
  var watch = "ResizeObserver" in window ? new ResizeObserver(function (entries) {
    entries.forEach(function (en) { backs.forEach(function (b) { if (b.card === en.target) draw(b); }); });
  }) : null;

  var grids = document.querySelectorAll(".grid");
  Array.prototype.forEach.call(grids, function (grid) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll(":scope > .posting"));
    if (!cards.length) return;
    // Each card moves into a wrapper that takes its place in the grid and carries its offsets.
    cards = cards.map(function (card) {
      var wrap = document.createElement("div"), cv = document.createElement("canvas"), b = { card: card, canvas: cv };
      wrap.className = "pinned"; wrap.style.cssText = card.style.cssText;
      cv.className = "pinback"; cv.setAttribute("aria-hidden", "true");
      grid.insertBefore(wrap, card); wrap.appendChild(cv); wrap.appendChild(card);
      backs.push(b); draw(b);
      if (watch) watch.observe(card);
      return wrap;
    });
    grid.classList.add("baked");
    if (cards.length < 2) return;
    function layout() {
      var tops = {}, shared = false;
      Array.prototype.forEach.call(cards, function (c) {
        if (tops[c.offsetTop]) shared = true;
        tops[c.offsetTop] = true;
      });
      grid.setAttribute("data-rows", shared ? "side" : "stacked");
    }
    layout();
    window.addEventListener("resize", layout);
  });
  // The edge color follows the theme, and without ResizeObserver a resize is the only cue to redraw.
  if (!watch) window.addEventListener("resize", drawAll);
  if ("MutationObserver" in window) new MutationObserver(drawAll).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  var dark = window.matchMedia("(prefers-color-scheme: dark)");
  if (dark.addEventListener) dark.addEventListener("change", drawAll);
})();
