// export.js embeds a literal copy of the token palette; this fails when css/tokens.css changes a color the copy uses.
const fs = require("fs");
const path = require("path");

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8").replace(/\r\n/g, "\n");

// Custom properties declared in a block of CSS, as { "--name": "value" }; values are trimmed and upper-cased for hex colors.
function props(block) {
  const out = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+?)\s*;/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].replace(/\s+/g, " ").toUpperCase();
  return out;
}
// The text between the braces that open at `start` (index of "{"), counting nested braces.
function braceBody(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(start + 1, i);
  }
  return "";
}

const tokens = read("css/tokens.css");
const lightTokens = props(braceBody(tokens, tokens.indexOf(":root {")));
const darkAt = tokens.indexOf("@media (prefers-color-scheme: dark)");
const darkMedia = braceBody(tokens, tokens.indexOf("{", darkAt));
const darkTokens = props(braceBody(darkMedia, darkMedia.indexOf("{")));
const explicitDark = props(braceBody(tokens, tokens.indexOf(':root[data-theme="dark"]')));

const exp = read("app/export.js");
const cssAt = exp.indexOf('var EXPORT_CSS = "\\');
const cssEnd = exp.indexOf('";', cssAt);
const exportCss = exp.slice(cssAt, cssEnd);
const lightLine = exportCss.match(/^:root \{ (.*?) \}\\$/m);
const darkLine = exportCss.match(/^@media \(prefers-color-scheme: dark\) \{ :root \{ (.*?) \} \}\\$/m);
ok(!!lightLine && !!darkLine, "export.js still has a light :root palette line and a dark one to compare");

const exportLight = props(lightLine ? lightLine[1] + ";" : "");
const exportDark = props(darkLine ? darkLine[1] + ";" : "");
ok(Object.keys(exportLight).length > 20 && Object.keys(exportDark).length > 10, "the export palette copies were read (" + Object.keys(exportLight).length + " light, " + Object.keys(exportDark).length + " dark)");

const stale = (copy, source, label) => Object.keys(copy).filter((k) => source[k] !== copy[k])
  .map((k) => label + " " + k + ": export.js has " + copy[k] + ", tokens.css has " + (source[k] || "nothing"));
const lightStale = stale(exportLight, lightTokens, "light");
const darkStale = stale(exportDark, darkTokens, "dark");
ok(lightStale.length === 0, "every light color in export.js matches css/tokens.css" + (lightStale.length ? ": " + lightStale.join("; ") : ""));
ok(darkStale.length === 0, "every dark color in export.js matches css/tokens.css" + (darkStale.length ? ": " + darkStale.join("; ") : ""));

// Both dark blocks in tokens.css (the media query and the explicit theme) should agree on the colors the export copies.
const darkSplit = Object.keys(exportDark).filter((k) => explicitDark[k] !== darkTokens[k]);
ok(darkSplit.length === 0, "tokens.css dark blocks agree on the exported colors" + (darkSplit.length ? ": " + darkSplit.join(", ") : ""));

// Every color the export's rules use must be declared in its light palette, so a token added to a rule is not left undefined.
const used = new Set((exportCss.match(/var\((--[a-z0-9-]+)/g) || []).map((s) => s.slice(4)));
const undeclared = [...used].filter((k) => !(k in exportLight));
ok(undeclared.length === 0, "every var() the export uses is declared in its palette" + (undeclared.length ? ": " + undeclared.join(", ") : ""));
const darkOnly = Object.keys(exportDark).filter((k) => !(k in exportLight));
ok(darkOnly.length === 0, "the export's dark palette only overrides colors its light palette declares" + (darkOnly.length ? ": " + darkOnly.join(", ") : ""));

process.exit(fails ? 1 : 0);
