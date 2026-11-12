#!/usr/bin/env node
// Builds the single-file artifact from the same app/*.js and css/*.css sources: concatenation in dependency order plus a stripped storage layer, not a bundler. Only function/var declarations are used (hoisted), so order barely matters; see CLAUDE.md's Two distribution targets entry.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP_DIR = path.join(ROOT, "app");
const OUT_FILE = path.join(APP_DIR, "sidequest.html");
// Artifacts published before the build moved to app/ fetch this path for updates, so it is kept in step.
const LEGACY_FILE = path.join(ROOT, "Sidequest-App", "sidequest.html");

// A published artifact has no assets/ folder, so the favicon is rebuilt from index.html's #sqLogo symbol as a self-contained SVG data URI at build time, with the CSS variables replaced by light-theme hex values.
var FAVICON_TOKEN_VALUES = { "parch-fill": "#FCF1D6", "parch-edge": "#CEB782", "parch-ink": "#2F5D8A", "parch-white": "#FFFFFF", "parch-red": "#C62F2F" };

function buildFaviconDataUri(html) {
  var m = html.match(/<symbol id="sqLogo"[^>]*viewBox="([^"]+)">([\s\S]*?)<\/symbol>/);
  if (!m) throw new Error("build-artifact: could not find the #sqLogo <symbol> markup in index.html to build a favicon from.");
  var viewBox = m[1], inner = m[2];
  var resolved = inner.replace(/var\(--([\w-]+)\)/g, function (whole, name) {
    if (!(name in FAVICON_TOKEN_VALUES)) throw new Error("build-artifact: #sqLogo uses var(--" + name + "), which has no known favicon substitute -- add it to FAVICON_TOKEN_VALUES.");
    return FAVICON_TOKEN_VALUES[name];
  });
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + viewBox + '">' + resolved + "</svg>";
  return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}

// Dependency order, matching each file's imports; hoisting makes it mostly irrelevant for declarations, but top-level side effects (dialogs.js DOM wiring) must run after what they depend on.
const MODULE_ORDER = [
  "dates.js",
  "dom.js",
  "phone.js",
  "model.js",
  "state.js",
  "chart.js",
  "export.js",
  "search.js",
  "dialogs.js",
  "confetti.js",
  "tutorial.js",
  "lifecycle.js",
  "files.js",
  "imports.js",
  "help.js",
  "errands.js",
  "quest-page.js",
  "settings.js",
  "views.js",
  "splash.js",
  "app.js",
];

function stripModuleSyntax(source, filename) {
  // The bundle is one scope with every import removed, so an aliased import (`a as b`) would leave `b` undefined at runtime.
  (source.match(/^import\s*\{[\s\S]*?\}\s*from/gm) || []).forEach(function (imp) {
    if (/\sas\s/.test(imp)) throw new Error("build-artifact: aliased import in " + filename + ": " + imp.split(String.fromCharCode(10)).join(" ") + " -- import the real name; the single-file build cannot rename imports.");
  });
  // Drop every import statement, including multi-line destructuring lists.
  var withoutImports = source.replace(/^import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?\s*$/gm, "");

  var lines = withoutImports.split("\n");
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Strip a leading "export " from function and var declarations; the codebase exports only those at top level.
    var stripped = line.replace(/^export\s+(function|var)\s/, "$1 ");
    if (stripped !== line && !/^(function|var)\s/.test(stripped)) {
      throw new Error("build-artifact: unexpected export form in " + filename + " at line " + (i + 1) + ": " + line);
    }
    // Fail loudly on any import/export syntax that survived stripping, rather
    // than silently shipping a bundle with a syntax error in it.
    if (/^\s*(import\s|export\s)/.test(stripped)) {
      throw new Error("build-artifact: unstripped module syntax in " + filename + " at line " + (i + 1) + ": " + line);
    }
    out.push(stripped);
  }
  return out.join("\n");
}

// Sound effects are relative asset paths that do not resolve in a published artifact, so each reference becomes a variable and one var SFX_... declaration holds the base64 data URI, embedded once however many call sites use it.
var SFX_FILES = {
  "assets/sfx/quest.mp3": "SFX_QUEST", "assets/sfx/complete.mp3": "SFX_COMPLETE", "assets/sfx/completeTask.mp3": "SFX_COMPLETE_TASK",
  "assets/sfx/refresh.mp3": "SFX_REFRESH", "assets/sfx/restoreBackup.mp3": "SFX_RESTORE_BACKUP",
  "assets/sfx/startFresh.mp3": "SFX_START_FRESH", "assets/sfx/reroll.mp3": "SFX_REROLL"
};

function buildSfxDataUris() {
  var map = {};
  Object.keys(SFX_FILES).forEach(function (relPath) {
    // A clip that has not been supplied yet is skipped: playback stays silent instead of breaking the build.
    var file = path.join(ROOT, relPath);
    map[relPath] = fs.existsSync(file) ? "data:audio/mpeg;base64," + fs.readFileSync(file).toString("base64") : "";
  });
  return map;
}

function build() {
  var htmlPath = path.join(APP_DIR, "index.html");
  var html = fs.readFileSync(htmlPath, "utf8");

  var tokens = fs.readFileSync(path.join(ROOT, "css", "tokens.css"), "utf8");
  var styles = fs.readFileSync(path.join(ROOT, "css", "styles.css"), "utf8");
  var splashCss = fs.readFileSync(path.join(ROOT, "css", "splash.css"), "utf8");
  var leatherCss = fs.readFileSync(path.join(ROOT, "css", "leather.css"), "utf8");
  var leatherJpg = "data:image/jpeg;base64," + fs.readFileSync(path.join(ROOT, "assets", "header-800.jpg")).toString("base64");
  if (leatherCss.indexOf('url("../assets/header-800.jpg")') === -1) throw new Error("build-artifact: leather.css no longer references header-800.jpg, so the texture cannot be inlined.");
  leatherCss = leatherCss.split('url("../assets/header-800.jpg")').join('url("' + leatherJpg + '")');

  var scriptParts = [];
  MODULE_ORDER.forEach(function (name) {
    var full = path.join(APP_DIR, name);
    var src = fs.readFileSync(full, "utf8");
    scriptParts.push("// ---- " + name + " ----\n" + stripModuleSyntax(src, name));
  });
  var sfxDataUris = buildSfxDataUris();
  var sfxVarDecls = Object.keys(SFX_FILES).map(function (relPath) {
    return "var " + SFX_FILES[relPath] + " = " + JSON.stringify(sfxDataUris[relPath]) + ";";
  }).join("\n");
  var bundledScript = "(function () {\n\"use strict\";\n" + sfxVarDecls + "\n" + scriptParts.join("\n\n") + "\n})();\n";

  // Break up any literal </script sequence in the bundle, because it would close the outer script tag early and truncate the artifact; this is safe inside JS strings, the only place it appears.
  bundledScript = bundledScript.replace(/<\/script/gi, "<\\/script");

  Object.keys(SFX_FILES).forEach(function (relPath) {
    var literal = '"../' + relPath + '"';
    if (bundledScript.indexOf(literal) === -1) throw new Error("build-artifact: expected to find " + literal + " in the bundled script to inline as a sound effect, but it wasn't there -- check the reference hasn't changed.");
    bundledScript = bundledScript.split(literal).join(SFX_FILES[relPath]);
  });

  // Verify every app/*.js file was actually included -- a file added to app/
  // later but not added to MODULE_ORDER above must fail the build loudly,
  // not silently ship an incomplete bundle.
  var actualFiles = fs.readdirSync(APP_DIR).filter(function (f) { return f.endsWith(".js") && f !== "sw.js"; });
  var missing = actualFiles.filter(function (f) { return MODULE_ORDER.indexOf(f) === -1; });
  if (missing.length) {
    throw new Error("build-artifact: app/ contains file(s) not listed in MODULE_ORDER: " + missing.join(", ") + ". Add them to the build script before building.");
  }

  var faviconDataUri = buildFaviconDataUri(html);

  var out = html
    .replace(
      /<link rel="icon" type="image\/svg\+xml" href="\.\.\/assets\/sidequest-icon\.svg">\s*\n<link rel="icon" type="image\/png" sizes="32x32" href="\.\.\/assets\/favicon-32\.png">\s*\n<link rel="apple-touch-icon" href="\.\.\/assets\/apple-touch-icon\.png">\s*\n<link rel="manifest" href="manifest\.json">/,
      function () { return '<link rel="icon" type="image/svg+xml" href="' + faviconDataUri + '">'; }
    )
    .replace(
      /<link rel="stylesheet" href="\.\.\/css\/tokens\.css(?:\?v=[0-9.]+)?">\s*\n<link rel="stylesheet" href="\.\.\/css\/leather\.css(?:\?v=[0-9.]+)?">\s*\n<link rel="stylesheet" href="\.\.\/css\/styles\.css(?:\?v=[0-9.]+)?">\s*\n<link rel="stylesheet" href="\.\.\/css\/splash\.css(?:\?v=[0-9.]+)?">/,
      function () { return "<style>\n" + tokens + "\n" + leatherCss + "\n" + styles + "\n" + splashCss + "\n</style>"; }
    )
    .replace(
      /<script type="module" src="app\.js"><\/script>/,
      function () { return "<script>\n" + bundledScript + "</script>"; }
    );

  // A published artifact sits at a private URL, so the page's analytics snippet and its search and social metadata are dropped from the head.
  var headEnd = out.indexOf("</head>");
  var head = out.slice(0, headEnd)
    .replace(/<script async src="https:\/\/www\.googletagmanager\.com[^>]*><\/script>\s*<script>[^]*?<\/script>\s*/, "")
    .replace(/<meta (?:property="og:|name="twitter:|name="description")[^>]*>\s*/g, "")
    .replace(/<link rel="canonical"[^>]*>\s*/g, "");
  out = head + out.slice(headEnd);
  var outHead = out.slice(0, out.indexOf("</head>"));
  if (/googletagmanager|gtag\(|rel="canonical"|property="og:|name="twitter:|name="description"/.test(outHead)) throw new Error("build-artifact: analytics or search/social metadata survived in the head -- a published artifact must not carry it.");

  // Only flag a RELATIVE assets/ reference (href="assets/..." / src="assets/...")
  // -- the og:image meta tag's absolute https://samoff.com/sidequest/assets/...
  // URL is fine as-is and must not trip this check.
  if (/(href|src)="(?:\.\.\/)?assets\//.test(out)) throw new Error("build-artifact: a relative assets/ reference survived into the bundle -- these don't resolve on a published artifact with no adjacent asset folder.");
  if (/"(?:\.\.\/)?assets\/sfx\//.test(out)) throw new Error("build-artifact: a relative assets/sfx/ string literal survived into the bundle -- the sound-effect inlining above didn't replace it.");
  if (/rel="manifest"/.test(out)) throw new Error("build-artifact: a manifest <link> survived into the bundle -- a published artifact has no manifest.json alongside it.");
  if (bundledScript.search(/<\/script/i) !== -1) throw new Error("build-artifact: an unescaped </script> sequence survived in the bundled script -- it would close the tag early and truncate the rest of the file.");
  if (out.indexOf(faviconDataUri) === -1) throw new Error("build-artifact: favicon <link> tags not found/replaced -- check index.html's <head> hasn't changed shape.");
  if (/href="\.\.\/css\//.test(out)) throw new Error("build-artifact: a css <link> survived into the bundle -- the stylesheets must be inlined.");
  if (out.indexOf("<style>") === -1) throw new Error("build-artifact: css <link> tags not found/replaced -- check index.html's <head> hasn't changed shape.");
  if (out.indexOf(bundledScript) === -1) throw new Error("build-artifact: script tag not found/replaced -- check index.html's closing <body> hasn't changed shape.");

  fs.writeFileSync(OUT_FILE, out, "utf8");
  fs.mkdirSync(path.dirname(LEGACY_FILE), { recursive: true });
  fs.writeFileSync(LEGACY_FILE, out, "utf8");
  console.log("Built " + path.relative(ROOT, OUT_FILE) + " and " + path.relative(ROOT, LEGACY_FILE) + " (" + Buffer.byteLength(out, "utf8") + " bytes) from " + MODULE_ORDER.length + " app modules.");
}

build();
