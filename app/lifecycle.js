/* quest lifecycle: history, completion, promote and demote, the Vault's entries */
import { renderAll } from "./app.js";
import { playConfetti } from "./confetti.js";
import { TODAY, iso } from "./dates.js";
import { closeModal, confirmDialog, openModal } from "./dialogs.js";
import { el, notify, on, playSfx } from "./dom.js";
import { activeQuests, findQuest, isPinned, liveQuests, questRemainingUnits, questTasksAllDone, questTotalUnits, recordHist, remainingUnits, short, totalUnits } from "./model.js";
import { changed, removeLinksTo, removeQuestTasks, save, state } from "./state.js";
import { KIND_LABEL } from "./views.js";

// Records the main burndown's and each quest's task counts on every change
// (see recordHist() in model.js for how that history is kept and read back).
export function recordHistory() {
  if (totalUnits() > 0 || Object.keys(state.hist).length) recordHist(state.hist, totalUnits(), remainingUnits());
}

export function recordQuestHistory() {
  liveQuests().forEach(function (p) {
    if (p.status !== "active" && p.status !== "complete") return;
    var total = questTotalUnits(p);
    if (total > 0 || Object.keys(p.hist).length) recordHist(p.hist, total, questRemainingUnits(p));
  });
}

// Auto-completion only; runs on every changed(). Skips a quest Reopen just reactivated, so it does not refire.
export function sweepQuestCompletion() {
  activeQuests().forEach(function (p) {
    if (p.justReopened) { p.justReopened = false; return; }
    if (questTasksAllDone(p)) { p.status = "complete"; completionDialog(p); }
  });
}

// Shared vault path for the Vault button, Mark complete, and the auto-sweep.
export function vaultQuest(p) {
  removeToVault(p, "Quest", function () {
    state.tasks.forEach(function (t) { if (t.questId === p.id && !t.vault) t.vault = { at: iso(TODAY), why: "removed" }; });
  });
}

// Offers vaulting now or leaving it in Quests.
export function completionDialog(p) {
  // Unpinned directly (not unpinPage(), whose toast would compete with this
  // dialog), remembered via wasPinned so Reopen can restore it.
  var key = "quest:" + p.id;
  if (isPinned(key)) { p.wasPinned = true; state.pins = state.pins.filter(function (k) { return k !== key; }); changed(); }
  if (state.settings.audio) playSfx("../assets/sfx/complete.mp3");
  if (state.settings.completionFx) playConfetti();
  openModal("Quest complete", function (body) {
    body.appendChild(el("p", { "class": "first" }, "“" + p.name + "” is marked complete. Send it to the Vault now, or leave it in Quests."));
    var openTasks = questRemainingUnits(p);
    if (openTasks) body.appendChild(el("p", { "class": "hint" }, openTasks + (openTasks === 1 ? " open task is" : " open tasks are") + " no longer counted in the main burndown. Reopen the quest to count " + (openTasks === 1 ? "it" : "them") + " again."));
    var acts = el("div", { "class": "actions" });
    var leave = el("button", { type: "button", title: "Keep visible on Quests" }, "Leave in Quests");
    var vault = el("button", { type: "button", "class": "dangerfill", title: "Send to the Vault right now" }, "Vault now");
    on(leave, "click", closeModal);
    on(vault, "click", function () { closeModal(); vaultQuest(p); });
    acts.appendChild(leave); acts.appendChild(vault); body.appendChild(acts);
  });
}

// Promotes in place: the same record and id. Its links were kept while it was a Candidate.
export function overWip() { var n = state.settings.wipLimit; return !!n && activeQuests().length >= n; }

export function promoteToActive(id) {
  var p = findQuest(id);
  if (!p) return;
  var n = activeQuests().length;
  if (overWip() && p.status !== "active") {
    confirmDialog("Promote past your limit?", "You already have " + n + " active " + (n === 1 ? "quest" : "quests") + ". Promote it anyway?", "Promote anyway", function () { doPromote(p); });
    return;
  }
  doPromote(p);
}

export function doPromote(p) {
  p.status = "active";
  // Tasks added while it was a Candidate were part of the plan from the start, not scope added later.
  state.tasks.forEach(function (x) { if (x.questId === p.id) x.added = ""; });
  changed();
  if (state.settings.audio) playSfx("../assets/sfx/quest.mp3");
}

// Sends an active quest back to Candidates. Its links are kept, shown read-only, and live again on promotion.
export function demoteToCandidate(id) {
  var p = findQuest(id);
  if (!p) return;
  p.status = "candidate";
  changed();
  notify("Sent back to Candidates.");
}

// Only Quests and Ideas go to the Vault independently -- see removeNow() for the rest.
export function removeToVault(item, label, before) {
  if (before) before();
  item.vault = { at: iso(TODAY), why: "removed" };
  changed();
  notify(label + " moved to the Vault.", function () { item.vault = null; changed(); });
}

// Immediate delete with a short-lived Undo toast, no Vault entry.
export function removeNow(item, list, label) {
  var arr = state[list], idx = arr.indexOf(item);
  if (idx < 0) return;
  arr.splice(idx, 1); changed();
  notify(label + " removed.", function () { arr.splice(idx, 0, item); changed(); });
}

export function vaultEntries() {
  var out = [];
  state.quests.forEach(function (p) { if (p.vault) out.push({ kind: "quest", list: "quests", item: p, title: p.name }); });
  state.workshop.forEach(function (p) { if (p.vault) out.push({ kind: "idea", list: "workshop", item: p, title: p.text }); });
  return out.sort(function (a, b) { return a.item.vault.at < b.item.vault.at ? 1 : (a.item.vault.at > b.item.vault.at ? -1 : 0); });
}

export function dropEntry(e) {
  state[e.list] = state[e.list].filter(function (x) { return x !== e.item; });
  if (e.list === "quests") { removeLinksTo([e.item.id]); removeQuestTasks([e.item.id]); }
}

export function restoreEntry(e) {
  e.item.vault = null;
  // Reverses vaultQuest()'s task cascade, or the quest comes back empty.
  if (e.kind === "quest") {
    state.tasks.forEach(function (t) { if (t.questId === e.item.id && t.vault) t.vault = null; });
  }
  var where = e.kind === "idea" ? "the Workshop" : e.item.status === "candidate" ? "Candidate quests" : "the Quests page";
  changed(); notify(KIND_LABEL[e.kind] + " restored to " + where + ".");
}

export function deleteForever(e) {
  confirmDialog("Delete forever?", "“" + short(e.title, 80) + "” will be permanently deleted. This cannot be undone.", "Delete forever", function () {
    dropEntry(e); save(); renderAll(); notify("Deleted.");
  });
}

export function emptyVault() {
  var all = vaultEntries();
  confirmDialog("Empty the Vault?", all.length + (all.length === 1 ? " item" : " items") + " will be permanently deleted. This cannot be undone.", "Delete everything in the Vault", function () {
    all.forEach(dropEntry); save(); renderAll(); notify("Vault emptied.");
  });
}
