// Landing-site parity: tavern/ pastes the same header, footer, and logo into every page and copies text from the README and tokens. This compares the copies; each function takes a read(path) callback so tests can feed it strings.

"use strict";
const common = require("./sentinel-common");

const RULE = "landing-parity";

function fail(file, message) {
  return common.violation(RULE, file, null, message);
}

function decode(html) {
  return html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function squash(text) {
  return text.replace(/\s+/g, " ").trim();
}

function pickBlock(source, re) {
  const m = source.match(re);
  return m ? m[0] : null;
}

// Header, footer, and logo symbol must match across pages; the header may differ only in which nav link carries aria-current.
function checkSharedBlocks(pages) {
  const violations = [];
  const blocks = [
    { name: "header", re: /<header class="band">[\s\S]*?<\/header>/, norm: (s) => s.replace(/ aria-current="page"/g, "") },
    { name: "footer", re: /<footer class="band footband">[\s\S]*?<\/footer>/, norm: (s) => s },
    { name: "logo symbol", re: /<symbol id="sqLogo"[\s\S]*?<\/symbol>/, norm: (s) => s },
  ];
  blocks.forEach(({ name, re, norm }) => {
    let baseline = null;
    let baselineFile = null;
    Object.keys(pages).forEach((file) => {
      const block = pickBlock(pages[file], re);
      if (block === null) { violations.push(fail(file, `The ${name} block is missing.`)); return; }
      const value = norm(block);
      if (baseline === null) { baseline = value; baselineFile = file; return; }
      if (value !== baseline) violations.push(fail(file, `The ${name} differs from ${baselineFile}. It is pasted into every page, so make the same change in all of them.`));
    });
  });
  Object.keys(pages).forEach((file) => {
    const name = file.split("/").pop();
    const current = pages[file].match(/<a href="([^"]+)" aria-current="page">/g) || [];
    if (current.length !== 1 || current[0].indexOf('href="' + name + '"') === -1) {
      violations.push(fail(file, `The nav must mark exactly this page (${name}) with aria-current="page".`));
    }
  });
  return violations;
}

function lightAndDarkWood(tokens) {
  const dark = [];
  const re = /--badge-attention:\s*(#[0-9A-Fa-f]{6});\s*--badge-attention-bg:\s*(#[0-9A-Fa-f]{6})/g;
  let m;
  while ((m = re.exec(tokens)) !== null) dark.push({ fg: m[1], bg: m[2] });
  // First block is light; the second is the prefers-color-scheme dark block.
  return dark.length >= 2 ? { light: dark[0].fg, dark: dark[1].bg } : null;
}

// The theme-color metas repeat the wood token values, since a meta tag cannot read a custom property.
function checkThemeColor(pages, tokens) {
  const wood = lightAndDarkWood(tokens || "");
  if (!wood) return [fail("css/tokens.css", "Could not read the light and dark --badge-attention values.")];
  const violations = [];
  Object.keys(pages).forEach((file) => {
    const light = pages[file].match(/<meta name="theme-color" content="(#[0-9A-Fa-f]{6})" media="\(prefers-color-scheme: light\)">/);
    const dark = pages[file].match(/<meta name="theme-color" content="(#[0-9A-Fa-f]{6})" media="\(prefers-color-scheme: dark\)">/);
    if (!light || !dark) { violations.push(fail(file, "The light and dark theme-color metas are missing.")); return; }
    if (light[1].toUpperCase() !== wood.light.toUpperCase()) violations.push(fail(file, `Light theme-color ${light[1]} no longer matches the wood token ${wood.light}.`));
    if (dark[1].toUpperCase() !== wood.dark.toUpperCase()) violations.push(fail(file, `Dark theme-color ${dark[1]} no longer matches the wood token ${wood.dark}.`));
  });
  return violations;
}

function readmeFence(readme, heading) {
  const at = readme.indexOf(heading);
  if (at === -1) return null;
  const open = readme.indexOf("```", at);
  if (open === -1) return null;
  const start = readme.indexOf("\n", open) + 1;
  const close = readme.indexOf("```", start);
  return close === -1 ? null : readme.slice(start, close);
}

// Both copyable prompts must equal the README's fenced prompts, ignoring whitespace and HTML escaping.
function checkPrompts(artifactPage, readme) {
  const violations = [];
  [{ id: "claudePrompt", heading: "### Claude" }, { id: "musePrompt", heading: "### Muse" }].forEach(({ id, heading }) => {
    const codeRe = new RegExp("<code id=\"" + id + "\"[^>]*>([^]*?)</code>");
    const m = (artifactPage || "").match(codeRe);
    const fence = readmeFence(readme || "", heading);
    if (!m) { violations.push(fail("tavern/artifact.html", `The #${id} block is missing.`)); return; }
    if (fence === null) { violations.push(fail("README.md", `No fenced prompt under "${heading}".`)); return; }
    if (squash(decode(m[1])) !== squash(fence)) violations.push(fail("tavern/artifact.html", `#${id} no longer matches the prompt under "${heading}" in README.md.`));
  });
  return violations;
}

function markedText(source, key) {
  const m = source.match(new RegExp("data-parity=\"" + key + "\"[^>]*>([^]*?)</(?:p|code|figure)>"));
  return m ? squash(decode(m[1].replace(/<[^>]+>/g, ""))) : null;
}

// The tagline and the license line are copies of README text.
function checkReadmeText(pages, readme) {
  const violations = [];
  const lines = readme.split("\n");
  const tagline = (lines.find((l) => { const t = l.trim(); return t && !t.startsWith("#") && !t.startsWith("<"); }) || "").trim();
  const licenseLine = lines.find((l) => /Licensed under/.test(l)) || "";
  const license = squash(licenseLine.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"));
  Object.keys(pages).forEach((file) => {
    const page = pages[file];
    const t = markedText(page, "tagline");
    if (t !== null && t !== tagline) violations.push(fail(file, `The tagline "${t}" no longer matches the README's opening line.`));
    const l = markedText(page, "license");
    if (l === null) violations.push(fail(file, "The license line (data-parity=\"license\") is missing."));
    else if (l !== license) violations.push(fail(file, `The license line "${l}" no longer matches the README's.`));
  });
  return violations;
}

function landingViolations(read, files) {
  const pages = {};
  files.forEach((f) => { const text = read(f); if (text !== null && text !== undefined) pages[f] = text; });
  if (!Object.keys(pages).length) return [];
  const readme = read("README.md") || "";
  return [].concat(
    checkSharedBlocks(pages),
    checkThemeColor(pages, read("css/tokens.css")),
    checkPrompts(pages["tavern/artifact.html"], readme),
    checkReadmeText(pages, readme)
  );
}

module.exports = { landingViolations, checkSharedBlocks, checkThemeColor, checkPrompts, checkReadmeText };
