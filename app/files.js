/* saving files, backup and restore */
import { applyTheme, renderAll, replaySplash } from "./app.js";
import { DAY, TODAY, fmtY, iso, parseISO } from "./dates.js";
import { closeModal, confirmDialog, openModal } from "./dialogs.js";
import { el, inClaude, isHosted, notify, on, playSfx } from "./dom.js";
import { normalize, save, setState, state, ui } from "./state.js";

/* backup */
// The Claude version saves through its own downloads capability. Elsewhere the
// browser's Save As dialog is used where it exists, and a plain download where not.
export var downloads = null;

export var downloadsReady = Promise.resolve(null);

try {
  if (inClaude()) {
    downloadsReady = window.claude.use("downloads").then(function (d) { downloads = d; return d; }).catch(function () { return null; });
  }
} catch (e) { /* unavailable */ }

export function isFramed() {
  try { return window.parent !== window.self; } catch (e) { return true; }
}

// Phones and tablets: a webview there swallows a scripted download without saying so, and
// nothing reports the difference, so the plain download can't be trusted on them.
export function isMobileDevice() {
  try {
    var ua = window.navigator.userAgent || "";
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
  } catch (e) { return false; }
}

export function cancelled(err) { return !!err && (err.code === "declined" || err.name === "AbortError"); }

// Shows the file's text with a Copy button, for a frame where nothing else can hand over a file.
export function manualSaveDialog(name, text, mime, onSaved, capability) {
  openModal("Save " + name, function (body) {
    var file = null;
    try { file = new window.File([text], name, { type: mime }); } catch (e) { file = null; }
    var canShare = !!(isMobileDevice() && file && window.navigator.share && window.navigator.canShare && window.navigator.canShare({ files: [file] }));
    var label = canShare || capability ? "Save file" : "Download file";
    body.appendChild(el("p", { "class": "hint first" }, "Choose " + label + " to save " + name + ". If nothing happens, open the copy option below."));
    var note = el("p", { "class": "hint" }, "");
    function copyInstead(why) { note.textContent = why + " Copy the text below instead."; }
    var main = on(el("button", { type: "button", "class": "primary" }, label), "click", function () {
      if (capability) {
        capability.save({ filename: name, data: text }).then(function () { closeModal(); if (onSaved) onSaved(); }, function (err) {
          if (cancelled(err)) note.textContent = "Save canceled.";
          else copyInstead("Saving isn’t available here.");
        });
        return;
      }
      if (canShare) {
        window.navigator.share({ files: [file] }).then(function () { closeModal(); if (onSaved) onSaved(); }, function (err) {
          if (!cancelled(err)) copyInstead("Saving isn’t available here.");
        });
        return;
      }
      try {
        var url = URL.createObjectURL(new Blob([text], { type: mime })), a = el("a", { href: url, download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        copyInstead("If nothing downloaded,");
      } catch (e) { copyInstead("Download isn’t available here."); }
    });
    var acts = el("div", { "class": "actions" }); acts.appendChild(main); body.appendChild(acts); body.appendChild(note);
    var more = el("details", { style: "margin-top:var(--space-16)" });
    more.appendChild(el("summary", null, "Didn’t work? Copy the text instead"));
    more.appendChild(el("p", { "class": "hint" }, "Copy the text, paste it into a new text file, and save it as " + name + "."));
    var box = el("textarea", { readonly: "readonly", rows: "8", "aria-label": name, style: "margin-top:var(--space-10)" });
    box.value = text; more.appendChild(box);
    var copyNote = el("p", { "class": "hint" }, "");
    var copyActs = el("div", { "class": "actions" });
    copyActs.appendChild(on(el("button", { type: "button" }, "Copy"), "click", function () {
      function done(ok) { copyNote.textContent = ok ? "Copied." : "Select the text and copy it."; }
      box.focus(); box.select();
      try {
        if (window.navigator.clipboard && window.navigator.clipboard.writeText) { window.navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); }); return; }
        done(document.execCommand("copy"));
      } catch (e) { done(false); }
    }));
    more.appendChild(copyActs); more.appendChild(copyNote); body.appendChild(more);
  });
}

// Hands the viewer a file. Resolves "saved", "downloaded" (unverifiable) or "manual" (nothing saved yet), and rejects on cancel or failure.
export function saveFile(name, text, mime, desc, ext, onSaved) {
  return downloadsReady.then(function (d) {
    if (d) { manualSaveDialog(name, text, mime, onSaved, d); return "manual"; }
    var unreliable = isFramed() || isMobileDevice();
    function fallback() {
      if (unreliable) { manualSaveDialog(name, text, mime, onSaved); return "manual"; }
      var blob = new Blob([text], { type: mime }), url = URL.createObjectURL(blob);
      var a = el("a", { href: url, download: name });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      return "downloaded";
    }
    if (typeof window.showSaveFilePicker === "function") {
      var accept = {}; accept[mime] = [ext];
      return window.showSaveFilePicker({ suggestedName: name, types: [{ description: desc, accept: accept }] })
        .then(function (h) { return h.createWritable(); })
        .then(function (w) { return w.write(text).then(function () { return w.close(); }); })
        .then(function () { return "saved"; }, function (err) {
          if (cancelled(err) || !unreliable) throw err;
          return fallback();
        });
    }
    return fallback();
  });
}

// The file records today as its own backup date, so restoring from it starts the reminder fresh.
export function backupJSON() {
  return JSON.stringify(Object.assign({}, state, { settings: Object.assign({}, state.settings, { lastBackup: iso(TODAY) }) }), null, 2);
}

export var BACKUP_REMIND_DAYS = 14;

// Whole days since the last backup, or since this browser started using Sidequest if there has been none.
export function daysSinceBackup() {
  return Math.max(0, Math.round((TODAY - parseISO(state.settings.lastBackup || state.settings.since)) / DAY));
}

// The Claude version keeps its data in its own db, so only the web app nags.
export function backupReminderDue() {
  return !isHosted() && daysSinceBackup() >= BACKUP_REMIND_DAYS;
}

export function lastBackupText() {
  var lb = state.settings.lastBackup;
  if (!lb) return "No backup saved yet.";
  var n = Math.max(0, Math.round((TODAY - parseISO(lb)) / DAY));
  return "Last backup: " + fmtY(parseISO(lb)) + " (" + (n === 0 ? "today" : n === 1 ? "yesterday" : n + " days ago") + ").";
}

export function saveBackupFile(msg, onDone) {
  var name = "sidequest-backup-" + iso(TODAY) + ".json", text = backupJSON();
  function saved(note) { state.settings.lastBackup = iso(TODAY); save(); msg.textContent = note; if (onDone) onDone(); }
  saveFile(name, text, "application/json", "Sidequest backup", ".json", function () { saved("Backup saved."); }).then(function (r) {
    if (r === "manual") msg.textContent = "Use Save or Copy in the box to save " + name + ". It is not counted as saved until you do.";
    else saved(r === "downloaded" ? "Backup downloaded." : "Backup saved.");
  }).catch(function (err) {
    msg.textContent = err && (err.code === "declined" || err.name === "AbortError") ? "Save canceled." : "The backup could not be saved.";
  });
}

export function restoreBackupFile(file, msg) {
  var r = new FileReader();
  r.onerror = function () { msg.textContent = "The file could not be read."; };
  r.onload = function () {
    var obj = null;
    try { obj = JSON.parse(String(r.result || "")); } catch (e) { obj = null; }
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.tasks)) { msg.textContent = "That is not a Sidequest backup file."; return; }
    msg.textContent = "";
    var next = normalize(obj), np = next.quests.length, nt = next.tasks.length;
    confirmDialog("Restore this backup?",
      "This backup holds " + np + (np === 1 ? " quest" : " quests") + " and " + nt + (nt === 1 ? " task" : " tasks") + ". Restoring replaces everything in Sidequest" + (isHosted() ? "" : " on this device") + ": all current quests, tasks, notes, history, and settings. You will have a few seconds to undo it.",
      "Restore backup", function () {
        if (state.settings.audio) playSfx("../assets/sfx/restoreBackup.mp3");
        var before = JSON.stringify(state);
        setState(next); ui.sel = null; ui.detail = false; applyTheme(); save(); renderAll();
        replaySplash();
        notify("Backup restored.", function () { setState(normalize(JSON.parse(before))); ui.sel = null; ui.detail = false; applyTheme(); save(); renderAll(); });
      });
  };
  r.readAsText(file);
}

// The Save backup button, alone (the Start fresh dialog uses it); returns its row of buttons.
export function backupControls(host, msg, onDone) {
  var acts = el("div", { "class": "actions" });
  acts.appendChild(on(el("button", { type: "button", "class": "primary", id: "saveFile", title: "Choose where to save a backup file" }, "Save backup"), "click", function () { saveBackupFile(msg, onDone); }));
  host.appendChild(acts);
  return acts;
}

// `hintHost`, if given, is where the leading description sentence goes instead
// of `root`, so a caller can keep it outside the card wrapping the rest.
export function backupPanel(root, hintHost) {
  (hintHost || root).appendChild(el("p", { "class": "hint" }, (isHosted() ? "Your data is saved in your account." : "Your data is saved in this browser on this device.") + " Create a backup from time to time and keep the file somewhere safe. You can restore your data from a backup at any time."));
  var msg = el("p", { "class": "msg schedulesmsg", role: "status", "aria-live": "polite" });
  var last = el("p", { "class": "hint" }, lastBackupText());
  var acts = backupControls(root, msg, function () { last.textContent = lastBackupText(); });
  var file = el("input", { type: "file", id: "restoreFile", accept: ".json,application/json", hidden: "hidden", "aria-label": "Choose a backup file to restore" });
  acts.appendChild(on(el("button", { type: "button", id: "restoreBtn", title: "Choose a backup file to restore" }, "Restore backup"), "click", function () { file.click(); }));
  on(file, "change", function () {
    var f = file.files && file.files[0]; if (!f) return;
    restoreBackupFile(f, msg); file.value = "";
  });
  root.appendChild(last); root.appendChild(file); root.appendChild(msg);
}
