/* Options: Start fresh, brandmark, install, and the page itself */
import { applyTheme, go, renderChrome } from "./app.js";
import { TODAY, fmtY, iso } from "./dates.js";
import { closeModal, openModal } from "./dialogs.js";
import { el, helpLink, isHosted, isStandalone, notify, on, playSfx, setMsg } from "./dom.js";
import { backupControls, backupPanel } from "./files.js";
import { importPanel } from "./imports.js";
import { WORDS, wd } from "./model.js";
import { collapsibleSection } from "./quest-page.js";
import { APP_NAME, APP_VERSION, changed, defaults, save, setState, state, ui } from "./state.js";
import { withHelp } from "./views.js";

/* settings */
export function blankState() {
  var d = defaults();
  d.tasks = []; d.decisions = []; d.quests = []; d.workshop = []; d.jobs = []; d.hand = []; d.pins = []; d.hist = {};
  d.start = iso(TODAY); d.days = state.days; d.settings = state.settings;
  return d;
}

export function startFreshDialog() {
  openModal("Start fresh", function (body) {
    body.appendChild(el("p", { "class": "first" }, "Start fresh erases everything stored in " + (isHosted() ? "your account" : "this browser") + ". This cannot be undone."));
    body.appendChild(el("p", { "class": "hint" }, "Save a backup first if you think you’ll want anything back."));
    var msg = el("p", { "class": "msg", role: "status", "aria-live": "polite" });
    backupControls(body, msg); body.appendChild(msg);
    body.appendChild(el("h3", null, "Start with"));
    var choices = [["empty", "A blank slate"], ["original", "The sample quests"]], picked = "empty";
    choices.forEach(function (c) {
      var lab = el("label", { "class": "radiorow" }); var rb = el("input", { type: "radio", name: "fresh", value: c[0] }); rb.checked = c[0] === picked;
      on(rb, "change", function () { picked = c[0]; });
      lab.appendChild(rb); lab.appendChild(el("span", null, c[1])); body.appendChild(lab);
    });
    var ack = el("label", { "class": "radiorow" }); var cb = el("input", { type: "checkbox", id: "freshAck" });
    ack.appendChild(cb); ack.appendChild(el("span", null, "I understand that this will erase everything.")); body.appendChild(ack);
    var acts = el("div", { "class": "actions" });
    var go1 = el("button", { type: "button", "class": "dangerfill", id: "freshGo", title: "Erase everything and start over" }, "Erase everything"); go1.disabled = true;
    on(cb, "change", function () { go1.disabled = !cb.checked; });
    on(go1, "click", function () {
      var keep = state.settings; keep.hideWelcome = false;
      keep.since = iso(TODAY); keep.lastBackup = ""; // new data, so the backup reminder clock starts over
      if (picked === "original") { setState(defaults()); state.settings = keep; } else { setState(blankState()); }
      ui.sel = null; ui.detail = false; ui.vaultFilter = "all"; applyTheme(); save(); closeModal(); go("today"); notify("Started fresh.");
      if (state.settings.audio) playSfx("../assets/sfx/startFresh.mp3");
    });
    acts.appendChild(on(el("button", { type: "button", title: "Cancel" }, "Cancel"), "click", closeModal)); acts.appendChild(go1); body.appendChild(acts);
  });
}

export var BRANDMARK_MAX_DIM = 320;

// 150 KB is about 200 KB once encoded, which fits one db document with room to spare.
export var BRANDMARK_MAX_BYTES = 150 * 1024;

// Reads a chosen image file, rejecting it outright (no cropping or resizing)
// if it's too large in bytes or in either pixel dimension.
export function readBrandmarkFile(file, msg, onDone) {
  if (file.size > BRANDMARK_MAX_BYTES) { setMsg(msg, "File is larger than " + Math.round(BRANDMARK_MAX_BYTES / 1024) + " KB.", "error"); return; }
  var r = new FileReader();
  r.onerror = function () { setMsg(msg, "The file couldn’t be read.", "error"); };
  r.onload = function () {
    var img = new Image();
    img.onerror = function () { setMsg(msg, "That file isn’t a usable image.", "error"); };
    img.onload = function () {
      if (img.naturalWidth > BRANDMARK_MAX_DIM || img.naturalHeight > BRANDMARK_MAX_DIM) {
        setMsg(msg, "That image is " + img.naturalWidth + "×" + img.naturalHeight + " pixels. Each side must be " + BRANDMARK_MAX_DIM + " pixels or less.", "error");
        return;
      }
      state.settings.brandmark = String(r.result); save(); setMsg(msg, "", ""); onDone();
    };
    img.src = String(r.result);
  };
  r.readAsDataURL(file);
}

export function brandmarkField() {
  var w = el("div", { "class": "field" });
  var msg = el("p", { "class": "msg schedulesmsg", role: "alert" });
  var preview = el("div", { "class": "brandmarkpreview" });
  var limits = el("p", { "class": "hint", style: "margin-top:0" }, "Must be " + BRANDMARK_MAX_DIM + "×" + BRANDMARK_MAX_DIM + " pixels or smaller, and up to " + Math.round(BRANDMARK_MAX_BYTES / 1024) + " KB.");
  function renderPreview() {
    preview.innerHTML = "";
    if (state.settings.brandmark) {
      // The company name if there is one, else the user's name, else a plain label.
      var who = state.settings.contact;
      preview.appendChild(el("img", { src: state.settings.brandmark, alt: who.company || who.name || "Brandmark" }));
      preview.appendChild(on(el("button", { type: "button", "class": "small danger", title: "Remove the brandmark" }, "Remove"), "click", function () {
        state.settings.brandmark = ""; save(); renderPreview();
      }));
    } else {
      var file = el("input", { type: "file", id: "set-brandmark", accept: "image/*", hidden: "hidden", "aria-label": "Choose a brandmark image" });
      on(file, "change", function () {
        var f = file.files && file.files[0]; if (!f) return;
        readBrandmarkFile(f, msg, renderPreview); file.value = "";
      });
      preview.appendChild(on(el("button", { type: "button", "class": "small", title: "Add brandmark" }, "Add brandmark"), "click", function () { file.click(); }));
      preview.appendChild(file);
    }
    limits.hidden = !!state.settings.brandmark;
  }
  renderPreview();
  w.appendChild(preview); w.appendChild(limits); w.appendChild(msg);
  return w;
}

// Set by app.js's beforeinstallprompt listener; null once installed or triggered.
export var deferredInstallPrompt = null;

export function setDeferredInstallPrompt(e) { deferredInstallPrompt = e; }

// True once an install finishes while this browser tab stays open.
export var installedThisSession = false;

export function setInstalledThisSession(v) { installedThisSession = v; }

// Resolves true when this browser reports an installed copy (Chromium only); any other answer or error is false.
export function detectInstalledApp() {
  try {
    if (typeof navigator === "undefined" || typeof navigator.getInstalledRelatedApps !== "function") return Promise.resolve(false);
    return navigator.getInstalledRelatedApps().then(function (apps) { return apps.some(function (a) { return a.platform === "webapp"; }); }, function () { return false; });
  } catch (e) { return Promise.resolve(false); }
}

// Browser checks for install tips only; install status itself never depends on them.
export function userAgentText() { return typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : ""; }

// iPadOS reports a Mac user agent, so a Mac with a touch screen counts as an iPad.
export function isIosDevice() {
  var ua = userAgentText();
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isSafariOnMac() {
  var ua = userAgentText();
  return !isIosDevice() && /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|CriOS|FxiOS/.test(ua);
}

export function isFirefoxOnDesktop() { var ua = userAgentText(); return /Firefox\//.test(ua) && !/Android|Mobile|Tablet/.test(ua); }

export function triggerInstall() {
  if (!deferredInstallPrompt) return;
  var p = deferredInstallPrompt;
  deferredInstallPrompt = null;
  p.prompt();
  renderChrome();
}

export function renderSettings(page) {
  // Side panel comes FIRST in DOM order so it stacks above the main settings
  // on a phone -- the opposite of .questsplit, where the charts column trails.
  var split = el("div", { "class": "setsplit" });
  var side = el("aside", { "class": "setside" });
  var root = el("div", { "class": "setmain" });
  split.appendChild(side); split.appendChild(root); page.appendChild(split);
  side.appendChild(withHelp(el("h2", { "class": "first" }, "Adventurer"), "adventurer", "Adventurer"));
  var contactBox = el("div");
  var cg = el("div", { "class": "setgrid" });
  function cfield(key, id, label, type, full) {
    var w = el("div", { "class": "field" + (full ? " full" : "") }); w.appendChild(el("label", { "for": id }, label));
    var inp = el("input", { type: type || "text", id: id });
    inp.value = state.settings.contact[key];
    on(inp, "input", function () { state.settings.contact[key] = inp.value.slice(0, 200); save(true); });
    w.appendChild(inp); cg.appendChild(w);
  }
  cfield("company", "set-contact-company", "Organization");
  cfield("name", "set-contact-name", "Name");
  cfield("phone", "set-contact-phone", "Phone", "tel");
  cfield("email", "set-contact-email", "Email", "email");
  cfield("website", "set-contact-website", "Website", "url", true);
  contactBox.appendChild(cg);
  var aw = el("div", { "class": "field" }); aw.appendChild(el("label", { "for": "set-contact-address" }, "Address"));
  var addr = el("textarea", { id: "set-contact-address", rows: 3 }); addr.value = state.settings.contact.address;
  on(addr, "input", function () { state.settings.contact.address = addr.value.slice(0, 500); save(true); });
  aw.appendChild(addr); contactBox.appendChild(aw);
  contactBox.appendChild(brandmarkField());
  side.appendChild(collapsibleSection("contact", function () { var c = state.settings.contact; return [c.company, c.name].filter(Boolean).join(" · "); }, contactBox, "Add your contact details"));

  var msg = el("p", { "class": "msg schedulesmsg", role: "status", "aria-live": "polite" });
  root.appendChild(el("h2", { "class": "setmain-head" }, "Schedule defaults"));
  var scheduleBox = el("div", { "class": "box", style: "margin-top:10px" });
  var grid = el("div", { "class": "setgrid hinted" });
  function fieldOf(id, label, input, hint, term) { var w = el("div", { "class": "field" }), lab = el("label", { "for": id }, label); if (term) { var lr = el("div", { "class": "labelrow" }); lr.appendChild(lab); lr.appendChild(helpLink(term[0], term[1])); w.appendChild(lr); } else w.appendChild(lab); w.appendChild(input); if (hint) { input.setAttribute("aria-describedby", id + "-hint"); w.appendChild(el("p", { "class": "hint", id: id + "-hint" }, hint)); } grid.appendChild(w); }
  var da = el("input", { type: "number", id: "set-days", min: "1", max: "30", step: "1", inputmode: "numeric" }); da.value = state.days;
  on(da, "change", function () { var v = parseInt(da.value, 10); if (isNaN(v) || v < 1 || v > 30) { da.value = state.days; setMsg(msg, wd() + " length must be from 1 to 30 days.", "error"); return; } state.days = v; changed(); notify(wd() + " length saved."); });
  fieldOf("set-days", "Default days per " + wd().toLowerCase(), da);
  var bwSel = el("select", { id: "set-word", "class": "plain" });
  Object.keys(WORDS).forEach(function (k) { var op = el("option", { value: k }, k); if (k === wd()) op.selected = true; bwSel.appendChild(op); });
  on(bwSel, "change", function () { state.settings.blockWord = bwSel.value; changed(); });
  fieldOf("set-word", "Name for each stretch of work", bwSel, undefined, ["stretch-of-work", "Stretch of work"]);
  var dustSel = el("select", { id: "set-dust", "class": "plain" });
  [[0, "Never"], [7, "7 days"], [14, "14 days"], [30, "30 days"], [60, "60 days"]].forEach(function (o) { var op = el("option", { value: String(o[0]) }, o[1]); if (o[0] === state.settings.dustDays) op.selected = true; dustSel.appendChild(op); });
  on(dustSel, "change", function () { state.settings.dustDays = parseInt(dustSel.value, 10); changed(); });
  var wipSel = el("select", { id: "set-wip", "class": "plain" });
  [[0, "No limit"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]].forEach(function (o) { var op = el("option", { value: String(o[0]) }, o[1]); if (o[0] === state.settings.wipLimit) op.selected = true; wipSel.appendChild(op); });
  on(wipSel, "change", function () { state.settings.wipLimit = parseInt(wipSel.value, 10); changed(); });
  fieldOf("set-wip", "Warn when active quests exceed", wipSel);
  fieldOf("set-dust", "Quests begin gathering dust after", dustSel);
  scheduleBox.appendChild(grid); scheduleBox.appendChild(msg); root.appendChild(scheduleBox);

  root.appendChild(el("h2", null, "Appearance and formats"));
  var appearanceBox = el("div", { "class": "box", style: "margin-top:10px" });
  var ag = el("div", { "class": "setgrid hinted" });
  var fw = el("div", { "class": "field" }); fw.appendChild(el("label", { "for": "set-datefmt" }, "Date format"));
  var df = el("select", { id: "set-datefmt", "class": "plain" });
  var sample = Date.UTC(2026, 8, 21);
  ["us", "intl", "mdy", "dmy", "iso"].forEach(function (k) {
    var keep = state.settings.dateFormat; state.settings.dateFormat = k;
    var op = el("option", { value: k }, fmtY(sample)); state.settings.dateFormat = keep;
    if (k === keep) op.selected = true; df.appendChild(op);
  });
  on(df, "change", function () { state.settings.dateFormat = df.value; changed(); });
  fw.appendChild(df); ag.appendChild(fw);
  var tw = el("div", { "class": "field" }); tw.appendChild(el("label", { "for": "set-theme" }, "Theme"));
  var th = el("select", { id: "set-theme", "class": "plain" });
  [["auto", "Match this device"], ["light", "Light"], ["dark", "Dark"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if (o[0] === state.settings.theme) op.selected = true; th.appendChild(op); });
  on(th, "change", function () { state.settings.theme = th.value; applyTheme(); save(); });
  tw.appendChild(th);
  var ag2 = el("div", { "class": "setgrid", style: "margin-top:10px" });
  var cw = el("div", { "class": "field" }); cw.appendChild(el("label", { "for": "set-coin" }, "Coin format"));
  var cs = el("select", { id: "set-coin", "class": "plain" });
  [["us", "1,234.56"], ["eu", "1.234,56"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if (o[0] === state.settings.coinFormat) op.selected = true; cs.appendChild(op); });
  on(cs, "change", function () { state.settings.coinFormat = cs.value; changed(); });
  cw.appendChild(cs); ag.appendChild(cw);
  appearanceBox.appendChild(ag);
  var sw = el("div", { "class": "field" }); sw.appendChild(el("label", { "for": "set-splash" }, "Splash screen on open"));
  var ss = el("select", { id: "set-splash", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.showSplash) op.selected = true; ss.appendChild(op); });
  on(ss, "change", function () { state.settings.showSplash = ss.value === "on"; save(); });
  sw.appendChild(ss);
  var abw = el("div", { "class": "field" }); abw.appendChild(el("label", { "for": "set-animated-burndown" }, "Animated burndown"));
  var abs = el("select", { id: "set-animated-burndown", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.animatedBurndown) op.selected = true; abs.appendChild(op); });
  on(abs, "change", function () { state.settings.animatedBurndown = abs.value === "on"; save(); });
  abw.appendChild(abs);
  var arw = el("div", { "class": "field" }); arw.appendChild(el("label", { "for": "set-animated-reroll" }, "Animated reroll"));
  var ars = el("select", { id: "set-animated-reroll", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.animatedReroll) op.selected = true; ars.appendChild(op); });
  on(ars, "change", function () { state.settings.animatedReroll = ars.value === "on"; save(); });
  arw.appendChild(ars);
  var fxw = el("div", { "class": "field" }); fxw.appendChild(el("label", { "for": "set-completion-fx" }, "Completion effects"));
  var fxs = el("select", { id: "set-completion-fx", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.completionFx) op.selected = true; fxs.appendChild(op); });
  on(fxs, "change", function () { state.settings.completionFx = fxs.value === "on"; save(); });
  fxw.appendChild(fxs);
  var aw2 = el("div", { "class": "field" }); aw2.appendChild(el("label", { "for": "set-audio" }, "Sound effects"));
  var as = el("select", { id: "set-audio", "class": "plain" });
  [["on", "On"], ["off", "Off"]].forEach(function (o) { var op = el("option", { value: o[0] }, o[1]); if ((o[0] === "on") === state.settings.audio) op.selected = true; as.appendChild(op); });
  on(as, "change", function () { state.settings.audio = as.value === "on"; save(); });
  aw2.appendChild(as);
  // Order on screen: Date format, Coin format, Splash screen on open, Theme, Animated burndown, Animated reroll, Completion effects, Sound effects.
  [sw, tw, abw, arw, fxw, aw2].forEach(function (w) { ag2.appendChild(w); });
  appearanceBox.appendChild(ag2);
  root.appendChild(appearanceBox);

  root.appendChild(el("h2", null, "Vault"));
  var vaultBox = el("div", { "class": "box", style: "margin-top:10px" });
  var pg = el("div", { "class": "setgrid" });
  var pw = el("div", { "class": "field" }); pw.appendChild(el("label", { "for": "set-purge" }, "Auto-delete vaulted items after"));
  var ps = el("select", { id: "set-purge", "class": "plain" });
  [[0, "Never"], [7, "7 days"], [30, "30 days"], [60, "60 days"], [90, "90 days"]].forEach(function (o) { var op = el("option", { value: String(o[0]) }, o[1]); if (o[0] === state.settings.vaultPurgeDays) op.selected = true; ps.appendChild(op); });
  on(ps, "change", function () { state.settings.vaultPurgeDays = parseInt(ps.value, 10); changed(); });
  pw.appendChild(ps); pg.appendChild(pw);
  vaultBox.appendChild(pg);
  if (state.settings.vaultPurgeDays) vaultBox.appendChild(el("p", { "class": "hint" }, "Checked each time Sidequest opens. An item older than this, counted from when it was vaulted, is deleted permanently with no further warning."));
  root.appendChild(vaultBox);

  if (!isHosted()) {
    root.appendChild(el("h2", null, "Install Sidequest"));
    var standalone = isStandalone();
    function uninstallLine() {
      var p = el("p", { "class": "hint" });
      if (standalone) {
        p.appendChild(document.createTextNode("To uninstall Sidequest, open the title bar menu and select "));
      } else {
        p.appendChild(document.createTextNode("To uninstall Sidequest, open the app, open the title bar menu, and select "));
      }
      p.appendChild(el("strong", null, "Uninstall Sidequest..."));
      p.appendChild(document.createTextNode("."));
      return p;
    }
    var installBox = el("div", { "class": "box", style: "margin-top:10px" });
    if (standalone) {
      installBox.appendChild(uninstallLine());
    } else if (installedThisSession) {
      installBox.appendChild(el("p", { "class": "hint first" }, "Sidequest is installed. Open it from your apps or desktop."));
      installBox.appendChild(uninstallLine());
    } else if (deferredInstallPrompt) {
      installBox.appendChild(el("p", { "class": "hint first", style: "margin-bottom:12px" }, "Install Sidequest as an app on your computer or mobile device. PWA installation is not supported by all browsers or devices."));
      installBox.appendChild(on(el("button", { type: "button", id: "installBtn" }, "Install Sidequest"), "click", triggerInstall));
    } else if (isIosDevice()) {
      // These devices have no Install button, so they get their own steps.
      var iosNote = el("p", { "class": "hint first" });
      iosNote.appendChild(document.createTextNode("On iPhone or iPad, tap "));
      iosNote.appendChild(el("strong", null, "Share"));
      iosNote.appendChild(document.createTextNode(", then "));
      iosNote.appendChild(el("strong", null, "Add to Home Screen"));
      iosNote.appendChild(document.createTextNode("."));
      installBox.appendChild(iosNote);
      installBox.appendChild(el("p", { "class": "hint" }, "The installed app may keep its own saved data, separate from the browser. To bring your quests over, save a backup in the browser and restore it in the installed app."));
    } else {
      var installNote = el("p", { "class": "hint first" }, "Sidequest can’t verify whether it’s installed in this browser. If it isn’t installed, check your browser’s menu for an option such as Install, Add to Dock, or Add to Home Screen. Available options vary by browser.");
      installBox.appendChild(installNote);
      var browserTips = [];
      if (isSafariOnMac()) {
        var safariTip = el("p", { "class": "hint" });
        safariTip.appendChild(document.createTextNode("In Safari, choose "));
        safariTip.appendChild(el("strong", null, "File"));
        safariTip.appendChild(document.createTextNode(" > "));
        safariTip.appendChild(el("strong", null, "Add to Dock"));
        safariTip.appendChild(document.createTextNode("."));
        browserTips.push(safariTip);
      } else if (isFirefoxOnDesktop()) {
        var ffTip = el("p", { "class": "hint" });
        ffTip.appendChild(document.createTextNode("Firefox does not install web apps by itself. The "));
        ffTip.appendChild(el("a", { href: "https://pwasforfirefox.filips.si/", target: "_blank", rel: "noopener" }, "Progressive Web Apps for Firefox"));
        ffTip.appendChild(document.createTextNode(" extension adds that. It also needs a small companion program, and the extension walks you through installing it."));
        browserTips.push(ffTip);
      }
      browserTips.forEach(function (tip) { installBox.appendChild(tip); });
      // Uninstall steps only appear once an install is confirmed, so unknown status never implies one.
      detectInstalledApp().then(function (yes) {
        if (!yes) return;
        installNote.textContent = "Sidequest is installed. Open it from your apps or desktop.";
        browserTips.forEach(function (tip) { tip.remove(); });
        installBox.appendChild(uninstallLine());
      });
    }
    root.appendChild(installBox);
  }

  root.appendChild(el("h2", null, "Import"));
  var importBox = el("div", { "class": "box", style: "margin-top:10px" });
  importBox.appendChild(el("p", { "class": "hint", style: "margin-bottom:12px" }, "Import tasks from Trello (JSON) or Todoist (CSV) into a new quest."));
  importPanel(importBox);
  root.appendChild(importBox);

  root.appendChild(el("h2", null, "Backup and restore"));
  var backupBox = el("div", { "class": "box", style: "margin-top:10px" });
  backupPanel(backupBox);
  root.appendChild(backupBox);

  root.appendChild(el("h2", { id: "startFreshHeading", "class": "scrollhead", tabindex: "-1" }, "Start fresh"));
  var box = el("div", { "class": "dangerbox" });
  box.appendChild(el("p", { "class": "hint first" }, "Erase all Sidequest data stored in " + (isHosted() ? "your account" : "this browser") + " and start again (options are retained). You will receive a warning and have a chance to save a backup first."));
  box.appendChild(on(el("button", { type: "button", "class": "danger", style: "margin-top:12px", id: "startFresh", title: "Erase everything and start over" }, "Start fresh…"), "click", startFreshDialog));
  root.appendChild(box);

  root.appendChild(el("h2", null, "About"));
  var ab = el("div", { "class": "box about" });
  ab.appendChild(el("p", { style: "font-weight:600", "class": "first" }, APP_NAME));
  ab.appendChild(el("p", { "class": "hint" }, "Version " + APP_VERSION));
  var sp = el("p", { "class": "hint" });
  var supportLink = el("a", { href: "https://www.paypal.com/paypalme/timsamoff", target: "_blank", rel: "noopener", "class": "textbtn", style: "display:inline-flex;align-items:center;gap:6px" });
  supportLink.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="2" x2="6" y2="4"></line><line x1="10" y1="2" x2="10" y2="4"></line><line x1="14" y1="2" x2="14" y2="4"></line></svg>';
  supportLink.appendChild(document.createTextNode("Support Sidequest"));
  sp.appendChild(supportLink); ab.appendChild(sp);
  var cp = el("p", { "class": "hint" }); cp.appendChild(document.createTextNode("© "));
  cp.appendChild(el("a", { href: "https://samoff.com", target: "_blank", rel: "noopener", "class": "textbtn" }, "Tim Samoff")); ab.appendChild(cp);
  root.appendChild(ab);
}
