/* dates */
import { state } from "./state.js";

export var DAY = 86400000;
export function parseISO(s) { var p = s.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
export function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
export function addDays(ms, n) { return ms + n * DAY; }
export function addMonths(ms, n) { var d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()); }
export var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function pad2(n) { return (n < 10 ? "0" : "") + n; }
export function fmt(ms) {
  var d = new Date(ms), m = d.getUTCMonth(), day = d.getUTCDate(), f = state.settings.dateFormat;
  if (f === "intl") return day + " " + MONTHS[m];
  if (f === "mdy") return (m + 1) + "/" + day;
  if (f === "dmy") return day + "/" + (m + 1);
  if (f === "iso") return pad2(m + 1) + "-" + pad2(day);
  return MONTHS[m] + " " + day;
}
export function fmtY(ms) {
  var d = new Date(ms), y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate(), f = state.settings.dateFormat;
  if (f === "intl") return day + " " + MONTHS[m] + " " + y;
  if (f === "mdy") return (m + 1) + "/" + day + "/" + y;
  if (f === "dmy") return day + "/" + (m + 1) + "/" + y;
  if (f === "iso") return y + "-" + pad2(m + 1) + "-" + pad2(day);
  return MONTHS[m] + " " + day + ", " + y;
}
export var now = new Date();
export var TODAY = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
