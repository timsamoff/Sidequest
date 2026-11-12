/* Errands and the hand */
import { fmtY, parseISO } from "./dates.js";
import { closeModal, formDialog, openModal } from "./dialogs.js";
import { editInline, el, focusKey, helpLink, notify, on, pencilButton, playSfx, prepareSfx, scheduleSfx, setFocusKey, uid, setMsg, warmSfx } from "./dom.js";
import { removeNow } from "./lifecycle.js";
import { chosen, deckJobs, handJobs, isJobLate, openJobs, rerollPick } from "./model.js";
import { changed, isISO, state } from "./state.js";
import { withHelp } from "./views.js";

export function renderJobs(root) {
  var bar = el("div", { "class": "jobbar" });
  var txt = el("input", { type: "text", id: "job-new", maxlength: "200", placeholder: "New errand", "aria-label": "New errand", autocomplete: "off", style: "flex:1 1 220px" });
  var dueWrap = el("div", { "class": "jobdue" });
  dueWrap.appendChild(el("label", { "for": "job-new-due" }, "Due date"));
  var due = el("input", { type: "date", id: "job-new-due" });
  dueWrap.appendChild(due);
  var msg = el("p", { "class": "msg", role: "alert" });
  function add() {
    var v = txt.value.trim();
    if (!v) { setMsg(msg, "Enter an errand to add it.", "error"); txt.focus(); return; }
    state.jobs.push({ id: uid(), text: v.slice(0, 200), done: false, due: isISO(due.value) ? due.value : "" });
    setFocusKey("job-new"); changed(); notify("“" + v.slice(0, 200) + "” added to Errands.");
  }
  txt.setAttribute("data-focus", "job-new");
  on(txt, "keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); add(); } });
  bar.appendChild(txt); bar.appendChild(dueWrap);
  bar.appendChild(on(el("button", { type: "button", "class": "small", title: "Add this errand" }, "Add errand"), "click", add));
  root.appendChild(bar); root.appendChild(msg);
  stopFlip();
  var open = openJobs(), done = state.jobs.filter(function (j) { return j.done; });
  var hand = handJobs(), deck = deckJobs();
  if (open.length) handSection(root, hand, open);
  var ul = el("ul", { "class": "list jobs", style: "margin-top:12px" });
  if (!open.length) ul.appendChild(el("li", { "class": "hint" }, "No errands yet. Add one with the Add errand button."));
  deck.forEach(function (j) { ul.appendChild(jobRow(j)); });
  if (deck.length || !open.length) root.appendChild(ul);
  if (done.length) {
    root.appendChild(el("h2", null, "Completed"));
    var dl = el("ul", { "class": "list jobs" });
    done.forEach(function (j) { dl.appendChild(jobRow(j)); });
    root.appendChild(dl);
  }
}

export var CALENDAR = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>';

export function jobRow(j, opts) {
  var li = el("li", { "class": (j.done ? "done" : "") + (opts && opts.card ? " handcard" : "") }), row = el("div", { "class": "jobrow" });
  var lab = el("label", { "class": "jobmain" });
  var cb = el("input", { type: "checkbox", "aria-label": (j.done ? "Restore errand: " : "Complete errand: ") + j.text }); cb.checked = j.done;
  on(cb, "change", function () { j.done = cb.checked; changed(); });
  var text = el("span", { "class": "jobtext" }, j.text);
  lab.appendChild(cb); lab.appendChild(text); row.appendChild(lab);
  var badges = el("div", { "class": "jobbadges" });
  if (isJobLate(j)) badges.appendChild(el("span", { "class": "badge" }, "Overdue"));
  var dueBtn = el("button", { type: "button", "class": "chip datechip" + (j.due ? "" : " nodue"), title: j.due ? "Change the due date" : "Add a due date" });
  var dueIcon = el("span", { "class": "dateicon", "aria-hidden": "true" }); dueIcon.innerHTML = CALENDAR;
  dueBtn.appendChild(dueIcon); dueBtn.appendChild(document.createTextNode(j.due ? "Due " + fmtY(parseISO(j.due)) : "No due date"));
  on(dueBtn, "click", function () {
    formDialog("Errand due date", [{ key: "due", label: "Due date", type: "date", value: j.due }], "Save", function (v) {
      j.due = isISO(v.due) ? v.due : ""; changed();
      return { msg: j.due ? j.text + " is due " + fmtY(parseISO(j.due)) + "." : "Due date cleared." };
    }, j.text, j.due ? { label: "Clear", title: "Remove the due date", onClick: function () { j.due = ""; changed(); notify("Due date cleared."); } } : null);
  });
  badges.appendChild(dueBtn);
  row.appendChild(badges);
  if (j.done) {
    var del = el("button", { type: "button", "class": "small danger jobend del", title: "Delete this errand permanently" }, "Delete forever");
    row.appendChild(on(del, "click", function () { removeNow(j, "jobs", "Errand"); }));
  } else {
    var pen = pencilButton("Rename this errand", "Rename this errand"); pen.classList.add("jobend", "pen");
    on(pen, "click", function () {
      pen.hidden = true;
      editInline(text, {
        label: "Errand", max: 200, value: function () { return j.text; },
        onSave: function (v) { j.text = v.slice(0, 200); changed(); },
        onEmpty: function () { notify("An errand needs text.", null, "problem"); },
        onDone: function () { pen.hidden = false; }
      });
    });
    row.appendChild(pen);
  }
  li.appendChild(row);
  return li;
}

/* errands hand: up to three errands kept at the top of the page */
export var HAND = {
  label: "Your hand", edit: "Manage hand", empty: "Empty hand", done: "Done", up: "Up", down: "Down",
  reroll: "Reroll", roll: "Roll", pick: "Choose", discard: "Discard", deck: "Errands deck",
  none: "Nothing in your hand. Choose up to three errands to keep here.",
  editorTitle: "Manage your hand", editorHint: "Choose up to three errands and organize them. Discard to remove from your hand.",
  rerolled: "Hand rerolled.", rolled: "Hand rolled.", emptied: "Hand emptied.", needTwo: "Reroll needs at least two open errands.", needOne: "Roll needs at least one open errand."
};

export var HAND_MAX = 3, FLIP_GAP = 140, REROLL_SFX = "../assets/sfx/reroll.mp3";

export function refocus(sels) {
  for (var i = 0; i < sels.length; i++) { var f = document.querySelector(sels[i]); if (f && !f.disabled) { f.focus(); return; } }
}

export function handChoose(id) {
  if (state.hand.indexOf(id) >= 0 || state.hand.length >= HAND_MAX) return;
  state.hand = state.hand.concat([id]); changed();
}

export function handDiscard(id) { state.hand = state.hand.filter(function (x) { return x !== id; }); changed(); }

export function handMove(id, dir) {
  var h = state.hand.slice(), i = h.indexOf(id), k = i + dir;
  if (i < 0 || k < 0 || k >= h.length) return;
  h[i] = h[k]; h[k] = id; state.hand = h; changed();
}

export function emptyHand() {
  var prev = state.hand.slice();
  state.hand = []; changed(); closeModal();
  notify(HAND.emptied, function () { state.hand = prev; changed(); });
  refocus(['[data-focus="hand-edit"]']);
}

export function reduceMotion() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
}

export var flip = { anims: [], ghosts: [], stops: [] };

export function stopFlip() {
  flip.anims.forEach(function (a) { try { a.cancel(); } catch (e) { /* already gone */ } });
  flip.ghosts.forEach(function (g) { if (g.parentNode) g.parentNode.removeChild(g); });
  flip.stops.forEach(function (stop) { stop(); });
  flip = { anims: [], ghosts: [], stops: [] };
}

// Puts a new hand in place, flipping the cards over (and playing the landing sound) when animation is on. Reroll and its Undo both use it.
export function swapHand(ids, focusKey) {
  stopFlip();
  var animate = state.settings.animatedReroll && !reduceMotion();
  // The old cards are copied first because changed() rebuilds the page; the copies turn away while the new cards turn in.
  var old = animate ? Array.prototype.map.call(document.querySelectorAll("#view .handlist > li"), function (li) { return li.cloneNode(true); }) : [];
  state.hand = ids;
  if (focusKey) setFocusKey(focusKey);
  changed();
  var cards = document.querySelectorAll("#view .handlist > li");
  if (!cards.length) return;
  if (!animate || typeof cards[0].animate !== "function") { if (state.settings.audio) playSfx(REROLL_SFX, 0.25); return; }
  var ul = cards[0].parentNode, persp = "perspective(900px) ";
  // Sounds go on the audio clock in the same tick the animations start, so each lands with its card.
  var stopAll = state.settings.audio ? scheduleSfx(REROLL_SFX, 0.25, Array.prototype.map.call(cards, function (c, i) { return i * FLIP_GAP + 200 + 340; })) : null;
  if (stopAll) flip.stops.push(stopAll);
  Array.prototype.forEach.call(cards, function (card, i) {
    var delay = i * FLIP_GAP, ghost = old[i];
    var land = state.settings.audio && !stopAll ? prepareSfx(REROLL_SFX, 0.25) : null;
    if (ghost) {
      ghost.classList.add("handghost"); ghost.setAttribute("aria-hidden", "true"); ghost.setAttribute("inert", "");
      Array.prototype.forEach.call(ghost.querySelectorAll("[data-focus]"), function (n) { n.removeAttribute("data-focus"); });
      ghost.style.top = card.offsetTop + "px";
      ul.appendChild(ghost); flip.ghosts.push(ghost);
      var out = ghost.animate([{ transform: persp + "rotateX(0deg)" }, { transform: persp + "rotateX(90deg)" }], { duration: 200, delay: delay, easing: "ease-in", fill: "both" });
      out.onfinish = function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); };
      flip.anims.push(out);
    }
    var into = card.animate([
      { transform: persp + "rotateX(-90deg)", offset: 0 },
      { transform: persp + "rotateX(0deg) translateY(-6px) scale(1.03)", offset: 0.65 },
      { transform: "none", offset: 1 }
    ], { duration: 340, delay: delay + 200, easing: "ease-out", fill: "both" });
    into.onfinish = function () { if (land) land(); into.cancel(); };
    flip.anims.push(into);
  });
}

export function rerollHand() {
  var open = openJobs(), prev = state.hand.slice();
  if (open.length < (prev.length ? 2 : 1)) return;
  swapHand(rerollPick(open, prev), "hand-reroll");
  notify(prev.length ? HAND.rerolled : HAND.rolled, function () { swapHand(prev); });
}

export function handSection(root, hand, open) {
  if (state.settings.audio) warmSfx(REROLL_SFX);
  var head = el("div", { "class": "handhead" });
  head.appendChild(el("h2", { "class": "handlabel" }, HAND.label));
  var btns = el("div", { "class": "handbtns" });
  var hand0 = hand.length > 0;
  var eb = el("button", { type: "button", "class": "small", "data-focus": "hand-edit" }, HAND.edit);
  on(eb, "click", openHandEditor); btns.appendChild(eb);
  var grp = el("span", { "class": "rerollgroup" });
  var rr = el("button", { type: "button", "class": "small", "data-focus": "hand-reroll" }, hand0 ? HAND.reroll : HAND.roll);
  if (open.length < (hand0 ? 2 : 1)) { rr.disabled = true; rr.title = hand0 ? HAND.needTwo : HAND.needOne; } else on(rr, "click", rerollHand);
  grp.appendChild(rr); grp.appendChild(helpLink("reroll", "Reroll and Roll")); btns.appendChild(grp);
  head.appendChild(btns); root.appendChild(head);
  if (!hand0) root.appendChild(el("p", { "class": "hint handnone" }, HAND.none));
  else {
    var cl = el("ul", { "class": "handlist" });
    hand.forEach(function (j) { cl.appendChild(jobRow(j, { card: true })); });
    root.appendChild(cl);
  }
  root.appendChild(withHelp(el("h2", { "class": "handlabel decklabel" }, HAND.deck), "errands-deck", "Errands deck"));
}

// One row of a hand dialog: the errand, its date, and whatever buttons the dialog gives it.
export function handDialogRow(j, chosen) {
  var li = el("li", { "class": chosen ? "chosen" : "" }), main = el("div", { "class": "hpmain" });
  main.appendChild(el("span", { "class": "hptext" }, j.text));
  var sub = el("span", { "class": "hpsub" });
  if (isJobLate(j)) sub.appendChild(el("span", { "class": "badge" }, "Overdue"));
  sub.appendChild(document.createTextNode(j.due ? "Due " + fmtY(parseISO(j.due)) : "No due date"));
  main.appendChild(sub); li.appendChild(main);
  return li;
}

export function handDialogBtn(label, aria, j, key, fn, off) {
  var b = el("button", { type: "button", "class": "small", "data-focus": key + j.id, "aria-label": aria + ": " + j.text }, label);
  if (off) b.disabled = true; else on(b, "click", fn);
  return b;
}

// One dialog for the whole hand: the cards in it (reorder or discard) with the rest of the open errands below (choose).
export function openHandEditor() {
  openModal(HAND.editorTitle, function (body) {
    body.appendChild(el("p", { "class": "first hint" }, HAND.editorHint));
    var list = el("ul", { "class": "handpick" }), foot = el("div", { "class": "handfoot" }), count = el("span", { "class": "hint handcount" });
    var doneBtn = el("button", { type: "button", "class": "primary" }, HAND.done);
    var clear = on(el("button", { type: "button" }, HAND.empty), "click", emptyHand);
    var paint = function (focusSels) {
      list.innerHTML = "";
      var hand = handJobs(), full = hand.length >= HAND_MAX;
      hand.forEach(function (j, i) {
        var li = handDialogRow(j, true), bt = el("div", { "class": "hpbtns" });
        bt.appendChild(handDialogBtn(HAND.up, "Move up in hand", j, "ed-up-", function () { handMove(j.id, -1); paint(['[data-focus="ed-up-' + j.id + '"]', '[data-focus="ed-down-' + j.id + '"]']); }, i === 0));
        bt.appendChild(handDialogBtn(HAND.down, "Move down in hand", j, "ed-down-", function () { handMove(j.id, 1); paint(['[data-focus="ed-down-' + j.id + '"]', '[data-focus="ed-up-' + j.id + '"]']); }, i === hand.length - 1));
        bt.appendChild(handDialogBtn(HAND.discard, "Discard from hand", j, "ed-discard-", function () {
          handDiscard(j.id);
          paint(['[data-focus="pick-' + j.id + '"]', '[data-focus="ed-discard-' + (state.hand[0] || "") + '"]']);
        }));
        li.appendChild(bt); list.appendChild(li);
      });
      deckJobs().forEach(function (j) {
        var li = handDialogRow(j, false);
        li.appendChild(handDialogBtn(HAND.pick, "Choose for hand", j, "pick-", function () {
          handChoose(j.id);
          paint(['[data-focus="ed-discard-' + j.id + '"]']);
        }, full));
        list.appendChild(li);
      });
      clear.hidden = !hand.length;
      count.textContent = hand.length + " of " + HAND_MAX + " in hand";
      if (focusSels) refocus(focusSels.map(function (q) { return "#modalBody " + q; }).concat(["#modalBody .primary"]));
    };
    paint();
    body.appendChild(list);
    on(doneBtn, "click", function () { closeModal(); refocus(['[data-focus="hand-edit"]']); });
    var acts = el("div", { "class": "handacts" });
    acts.appendChild(doneBtn); acts.appendChild(clear);
    foot.appendChild(acts); foot.appendChild(count); body.appendChild(foot);
  }, { noClose: true });
}
