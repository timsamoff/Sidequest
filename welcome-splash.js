// Plays the app's launch splash inline in the hero and leaves the quote showing (app/splash.js, css/splash.css).
import { AFFIRMATIONS, playSplash } from "./app/splash.js";

var quoteEl = document.getElementById("questQuote");
var panel = document.getElementById("splash");
var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The screen-reader copy of the quote follows whichever one the splash picks.
function pick(count) {
  var i = Math.floor(Math.random() * count);
  if (quoteEl) quoteEl.textContent = AFFIRMATIONS[i];
  return i;
}
function play() { playSplash(true, function () { document.dispatchEvent(new Event("splashdone")); }, false, pick, { hold: true, instant: reduce }); }

if (panel) {
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); play(); }
    }, { threshold: 0.5 });
    io.observe(panel);
  } else play();
}
