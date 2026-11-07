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
    menuBtn.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); opened(); });
    /* Peek: on every page the strap makes the same small lift as a press, every 15 seconds, until the menu is opened on that page. It starts after the Welcome splash finishes (or 15 seconds in, if the splash never plays), and 1.5 seconds after load on pages with no splash. */
    var seen = false;
    var opened = function () { seen = true; };
    var peek = function () {
      if (seen || nav.classList.contains("open") || menuBtn.matches(":hover, :focus-visible")) return;
      menuBtn.classList.add("peek");
    };
    menuBtn.addEventListener("animationend", function () { menuBtn.classList.remove("peek"); });
    var startPeeking = function () {
      if (startPeeking.done) return;
      startPeeking.done = true;
      window.setTimeout(peek, 1000);
      window.setInterval(peek, 15000);
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
