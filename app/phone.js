/* phone numbers: a country code select beside a number field, saved as one string like "+1 (805) 555-3005" */
import { el, on } from "./dom.js";

// One entry per calling code from the public ITU list, with the country (or two) it is best known for.
var DIAL_LIST = "1 US/CA,7 RU/KZ,20 EG,27 ZA,30 GR,31 NL,32 BE,33 FR,34 ES,36 HU,39 IT,40 RO,41 CH,43 AT,44 GB,45 DK,46 SE,47 NO,48 PL,49 DE,"
  + "51 PE,52 MX,53 CU,54 AR,55 BR,56 CL,57 CO,58 VE,60 MY,61 AU,62 ID,63 PH,64 NZ,65 SG,66 TH,81 JP,82 KR,84 VN,86 CN,90 TR,91 IN,92 PK,93 AF,94 LK,95 MM,98 IR,"
  + "211 SS,212 MA,213 DZ,216 TN,218 LY,220 GM,221 SN,222 MR,223 ML,224 GN,225 CI,226 BF,227 NE,228 TG,229 BJ,230 MU,231 LR,232 SL,233 GH,234 NG,235 TD,236 CF,"
  + "237 CM,238 CV,239 ST,240 GQ,241 GA,242 CG,243 CD,244 AO,245 GW,246 IO,248 SC,249 SD,250 RW,251 ET,252 SO,253 DJ,254 KE,255 TZ,256 UG,257 BI,258 MZ,260 ZM,"
  + "261 MG,262 RE,263 ZW,264 NA,265 MW,266 LS,267 BW,268 SZ,269 KM,290 SH,291 ER,297 AW,298 FO,299 GL,350 GI,351 PT,352 LU,353 IE,354 IS,355 AL,356 MT,357 CY,"
  + "358 FI,359 BG,370 LT,371 LV,372 EE,373 MD,374 AM,375 BY,376 AD,377 MC,378 SM,380 UA,381 RS,382 ME,383 XK,385 HR,386 SI,387 BA,389 MK,420 CZ,421 SK,423 LI,"
  + "500 FK,501 BZ,502 GT,503 SV,504 HN,505 NI,506 CR,507 PA,508 PM,509 HT,590 GP,591 BO,592 GY,593 EC,594 GF,595 PY,596 MQ,597 SR,598 UY,599 CW,670 TL,672 NF,"
  + "673 BN,674 NR,675 PG,676 TO,677 SB,678 VU,679 FJ,680 PW,681 WF,682 CK,683 NU,685 WS,686 KI,687 NC,688 TV,689 PF,690 TK,691 FM,692 MH,850 KP,852 HK,853 MO,"
  + "855 KH,856 LA,880 BD,886 TW,960 MV,961 LB,962 JO,963 SY,964 IQ,965 KW,966 SA,967 YE,968 OM,970 PS,971 AE,972 IL,973 BH,974 QA,975 BT,976 MN,977 NP,992 TJ,"
  + "993 TM,994 AZ,995 GE,996 KG,998 UZ";
export var DIAL_CODES = DIAL_LIST.split(",").map(function (s) { var i = s.indexOf(" "); return { code: s.slice(0, i), label: s.slice(i + 1) }; });
var CODE_SET = {};
DIAL_CODES.forEach(function (c) { CODE_SET[c.code] = true; });
export function isDialCode(c) { return typeof c === "string" && CODE_SET[c] === true; }

// Splits a trailing extension ("x12", "ext. 5", "#7") from the number, so neither the dial link nor the layout counts its digits.
export function splitExt(s) {
  var m = /\s*(?:ext\.?|extension|x|#)\s*\d+\s*$/i.exec(s);
  return m ? { main: s.slice(0, m.index), ext: m[0] } : { main: s, ext: "" };
}

// Reads a saved phone into a country code and the rest as typed. With no leading "+" (an older save) the fallback code is used.
export function parsePhone(s, fallback) {
  s = String(s || "").trim();
  if (s.charAt(0) !== "+") return { code: fallback, national: s };
  var rest = s.slice(1), digits = "";
  for (var i = 0; i < rest.length; i++) {
    var ch = rest.charAt(i);
    if (/\d/.test(ch)) {
      digits += ch;
      // No code is the start of another, so the first match is the code.
      if (CODE_SET[digits]) return { code: digits, national: rest.slice(i + 1).replace(/^[\s\-.()]+/, "") };
      if (digits.length >= 3) break;
    } else if (!/[\s\-.()]/.test(ch)) break;
  }
  return { code: fallback, national: s };
}

// The saved string: "+" and the code in front of the number. A number typed with its own "+" is kept as typed.
export function composePhone(code, national) {
  var n = String(national || "").trim();
  if (!n) return "";
  return n.charAt(0) === "+" ? n : "+" + code + " " + n;
}

// Layouts by calling code: [digit count, allowed leading digits ("" is any), pattern], N being a digit.
// A number is reflowed only when its digits fit a layout exactly; anything else stays as typed.
var LAYOUTS = {
  "1": [[10, "", "(NNN) NNN-NNNN"]], "7": [[10, "", "NNN NNN-NN-NN"]], "20": [[10, "1", "NN NNNN NNNN"]], "27": [[9, "", "NN NNN NNNN"]],
  "30": [[10, "", "NNN NNN NNNN"]], "31": [[9, "6", "N NNNNNNNN"]], "33": [[9, "", "N NN NN NN NN"]], "34": [[9, "", "NNN NNN NNN"]],
  "36": [[9, "", "NN NNN NNNN"]], "40": [[9, "", "NNN NNN NNN"]], "41": [[9, "", "NN NNN NN NN"]],
  "44": [[10, "7", "NNNN NNNNNN"], [10, "20,23,24,28,29", "NN NNNN NNNN"], [10, "3,8,9", "NNN NNN NNNN"]],
  "45": [[8, "", "NN NN NN NN"]], "47": [[8, "", "NNN NN NNN"]], "48": [[9, "", "NNN NNN NNN"]], "51": [[9, "9", "NNN NNN NNN"]],
  "52": [[10, "55,33,81", "NN NNNN NNNN"], [10, "", "NNN NNN NNNN"]], "55": [[11, "", "NN NNNNN NNNN"], [10, "", "NN NNNN NNNN"]],
  "56": [[9, "", "N NNNN NNNN"]], "57": [[10, "3", "NNN NNN NNNN"]], "61": [[9, "4", "NNN NNN NNN"], [9, "2,3,7,8", "N NNNN NNNN"]],
  "63": [[10, "9", "NNN NNN NNNN"]], "65": [[8, "", "NNNN NNNN"]], "66": [[9, "", "NN NNN NNNN"], [8, "", "N NNN NNNN"]],
  "81": [[10, "7,8,9", "NN NNNN NNNN"], [9, "3,6", "N NNNN NNNN"]], "82": [[10, "1", "NN NNNN NNNN"]], "86": [[11, "1", "NNN NNNN NNNN"]],
  "90": [[10, "", "NNN NNN NN NN"]], "91": [[10, "6,7,8,9", "NNNNN NNNNN"]], "92": [[10, "3", "NNN NNNNNNN"]],
  "234": [[10, "", "NNN NNN NNNN"]], "254": [[9, "", "NNN NNNNNN"]], "351": [[9, "", "NNN NNN NNN"]], "353": [[9, "8", "NN NNN NNNN"]],
  "380": [[9, "", "NN NNN NN NN"]], "420": [[9, "", "NNN NNN NNN"]], "421": [[9, "", "NNN NNN NNN"]], "852": [[8, "", "NNNN NNNN"]],
  "880": [[10, "1", "NNNN NNNNNN"]], "886": [[9, "9", "NNN NNN NNN"]], "966": [[9, "5", "NN NNN NNNN"]],
  "971": [[9, "5", "NN NNN NNNN"], [8, "", "N NNN NNNN"]], "972": [[9, "5", "NN NNN NNNN"], [8, "", "N NNN NNNN"]]
};
// The digits a national number may start with that are not part of the number itself (a trunk prefix, or the +1 repeated).
var TRUNK = {
  "1": "1", "7": "87", "20": "0", "27": "0", "31": "0", "33": "0", "40": "0", "41": "0", "44": "0", "55": "0", "61": "0", "63": "0", "66": "0",
  "81": "0", "82": "0", "90": "0", "91": "0", "92": "0", "234": "0", "254": "0", "353": "0", "380": "0", "421": "0", "880": "0", "886": "0",
  "966": "0", "971": "0", "972": "0"
};
function layoutFor(code, d) {
  var rules = LAYOUTS[code] || [];
  for (var i = 0; i < rules.length; i++) {
    var r = rules[i], lead = r[1] ? r[1].split(",") : [""];
    if (r[0] === d.length && lead.some(function (p) { return d.indexOf(p) === 0; })) return r[2];
  }
  return null;
}
export function formatNational(code, national) {
  if (!LAYOUTS[code]) return national;
  var p = splitExt(national), d = p.main.replace(/\D/g, "");
  if (/[^\d\s\-.()+]/.test(p.main)) return national;
  var pattern = layoutFor(code, d);
  if (!pattern && TRUNK[code] && TRUNK[code].indexOf(d.charAt(0)) >= 0) { d = d.slice(1); pattern = layoutFor(code, d); }
  if (!pattern) return national;
  var i = 0;
  return pattern.replace(/N/g, function () { return d.charAt(i++); }) + p.ext;
}

// The tel: link keeps the digits and a leading "+", and leaves the extension off, since phones do not dial it from a link.
export function phoneHref(v) { return "tel:" + splitExt(String(v)).main.replace(/[^\d+]/g, ""); }

// state.js registers where the last chosen code is kept, so a new phone field starts on it.
var memory = { get: function () { return "1"; }, set: function () {} };
export function setPhoneMemory(get, set) { memory = { get: get, set: set }; }

// A country code select beside a number field; `onChange` gets the saved string as you type and on blur.
// The number is formatted on blur, never while typing.
export function phoneField(id, value, onChange) {
  var wrap = el("div", { "class": "phonerow" });
  var start = memory.get(), parsed = parsePhone(value, isDialCode(start) ? start : "1");
  var sel = el("select", { "class": "plain", "aria-label": "Country code", title: "Country code" });
  DIAL_CODES.forEach(function (c) { sel.appendChild(el("option", { value: c.code }, "+" + c.code + " " + c.label)); });
  sel.value = isDialCode(parsed.code) ? parsed.code : "1";
  var inp = el("input", { type: "tel", id: id, autocomplete: "off" });
  inp.value = formatNational(sel.value, parsed.national);
  function get() { return composePhone(sel.value, inp.value); }
  function tell() { if (onChange) onChange(get()); }
  on(inp, "input", tell);
  on(inp, "blur", function () {
    var v = inp.value.trim();
    // A number pasted with its own +code moves the code into the select.
    if (v.charAt(0) === "+") { var q = parsePhone(v, sel.value); if (q.national !== v) { sel.value = q.code; memory.set(q.code); v = q.national; } }
    inp.value = formatNational(sel.value, v);
    tell();
  });
  on(sel, "change", function () { memory.set(sel.value); inp.value = formatNational(sel.value, inp.value); tell(); });
  wrap.appendChild(sel); wrap.appendChild(inp);
  return { el: wrap, input: inp, select: sel, get: get };
}
