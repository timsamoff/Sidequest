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
  var target = window.scrollY, current = target, raf = 0, driving = false;
  var EASE = 0.12;

  var lastY = target;

  function maxScroll() { return Math.max(0, root.scrollHeight - window.innerHeight); }
  function release() {
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
    driving = false;
    target = current = window.scrollY;
  }
  function step() {
    // Something else moved the page (a key, a link, the scrollbar): hand control back.
    if (Math.abs(window.scrollY - lastY) > 2) { release(); return; }
    var diff = target - current;
    if (Math.abs(diff) < 1) {
      current = target;
      window.scrollTo({ top: current, behavior: "instant" });
      raf = 0; driving = false;
      return;
    }
    current += diff * EASE;
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

/* Screenshots load lazily and are stitched in (or inked in, with ?shots=ink) as they scroll into view.
   Without JavaScript or with reduced motion the image just shows. */
(function () {
  var NS = "http://www.w3.org/2000/svg", count = 0;
  var ink = /[?&]shots=ink\b/.test(window.location.search);
  var still = !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var make = function (name, attrs) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  // A dashed thread and a masking stroke that is drawn along the same rounded rectangle.
  var addThread = function (box) {
    var r = box.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height), inset = 7, id = "stitchmask" + (++count);
    var geom = { x: inset, y: inset, width: w - 2 * inset, height: h - 2 * inset, rx: 5 };
    var svg = make("svg", { "class": "stitch", "aria-hidden": "true", focusable: "false", width: w, height: h, viewBox: "0 0 " + w + " " + h });
    var mask = make("mask", { id: id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: w, height: h });
    mask.appendChild(make("rect", Object.assign({ "class": "sweep", pathLength: 1 }, geom)));
    var defs = make("defs", {});
    defs.appendChild(mask);
    svg.appendChild(defs);
    svg.appendChild(make("rect", Object.assign({ "class": "thread", mask: "url(#" + id + ")" }, geom)));
    box.appendChild(svg);
  };
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
  // Ink spreads from a few drops across the frame with a ragged, darker wet edge, then the real image takes over.
  var inkIn = function (box, img, done) {
    var r = box.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.round(r.width * dpr), H = Math.round(r.height * dpr), lw = Math.ceil(r.width / 4), lh = Math.ceil(r.height / 4);
    var cv = document.createElement("canvas");
    cv.className = "inkcanvas"; cv.width = W; cv.height = H; cv.setAttribute("aria-hidden", "true");
    box.appendChild(cv);
    var ctx = cv.getContext("2d");
    var maskCv = document.createElement("canvas"), edgeCv = document.createElement("canvas"), tintCv = document.createElement("canvas");
    maskCv.width = edgeCv.width = lw; maskCv.height = edgeCv.height = lh; tintCv.width = lw; tintCv.height = lh;
    var mctx = maskCv.getContext("2d"), ectx = edgeCv.getContext("2d"), tctx = tintCv.getContext("2d");
    var mimg = mctx.createImageData(lw, lh), eimg = ectx.createImageData(lw, lh), noise = noiseField(lw, lh);
    var seeds = [], diag = Math.sqrt(lw * lw + lh * lh);
    for (var i = 0; i < 3; i++) seeds.push({ x: lw * (0.2 + 0.6 * Math.random()), y: lh * (0.2 + 0.6 * Math.random()), delay: 0.18 * i * Math.random() });
    var inkColor = window.getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "black";
    var start = null, DURATION = 2300;
    var frame = function (now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / DURATION, 1), e = 1 - Math.pow(1 - t, 1.7), thr = -0.12 + e * 1.1;
      var md = mimg.data, ed = eimg.data;
      for (var y = 0; y < lh; y++) for (var x = 0; x < lw; x++) {
        var k = y * lw + x, dmin = 9;
        for (var s = 0; s < 3; s++) {
          var dx = x - seeds[s].x, dy = y - seeds[s].y, dd = Math.sqrt(dx * dx + dy * dy) / diag + seeds[s].delay;
          if (dd < dmin) dmin = dd;
        }
        var f = dmin * 1.15 + (noise[k] - 0.5) * 0.7, a = Math.max(0, Math.min(1, (thr - f) / 0.07));
        var band = Math.max(0, 1 - Math.abs(thr - f - 0.015) / 0.045) * (1 - t * 0.6);
        md[k * 4 + 3] = a * 255;
        ed[k * 4 + 3] = band * a * 215;
      }
      mctx.putImageData(mimg, 0, 0); ectx.putImageData(eimg, 0, 0);
      tctx.globalCompositeOperation = "source-over"; tctx.clearRect(0, 0, lw, lh);
      tctx.fillStyle = inkColor; tctx.fillRect(0, 0, lw, lh);
      tctx.globalCompositeOperation = "destination-in"; tctx.drawImage(edgeCv, 0, 0);
      ctx.globalCompositeOperation = "source-over"; ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, 0, 0, W, H);
      ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(maskCv, 0, 0, W, H);
      ctx.globalCompositeOperation = "source-atop"; ctx.drawImage(tintCv, 0, 0, W, H);
      if (t < 1) window.requestAnimationFrame(frame);
      else { box.classList.add("inked", "shown"); window.requestAnimationFrame(function () { cv.remove(); done(); }); }
    };
    window.requestAnimationFrame(frame);
  };
  Array.prototype.forEach.call(document.querySelectorAll(".shotbox"), function (box) {
    var img = box.querySelector("img");
    var ready = !!(img.complete && img.naturalWidth), drawn = still, started = false;
    var reveal = function () { if (ready && drawn) box.classList.add("shown"); };
    var go = function () { if (ink && started && ready && !still && !box.inkRan) { box.inkRan = true; inkIn(box, img, function () {}); } };
    if (!ready) img.addEventListener("load", function () { ready = true; if (ink) go(); else reveal(); });
    if (still) { reveal(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      started = true;
      if (ink) { go(); return; }
      addThread(box);
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { box.classList.add("stitching"); });
      });
      window.setTimeout(function () { drawn = true; reveal(); }, 1300);
    }, { threshold: 0.2 });
    io.observe(box);
  });
})();

/* Pinned cards sit a little off true. The offsets are fixed in each card's style attribute; this only tells the CSS whether cards sit side by side or stacked. */
(function () {
  var grids = document.querySelectorAll(".grid");
  Array.prototype.forEach.call(grids, function (grid) {
    var cards = grid.querySelectorAll(":scope > .posting");
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
})();
