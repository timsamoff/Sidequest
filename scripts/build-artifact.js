#!/usr/bin/env node
// Builds the single-file Claude Artifact version from the same app/*.js and
// css/*.css sources the web app uses. Not a general bundler: this project's
// module graph is small, closed, and dependency-free (no npm packages, only
// relative imports between app/*.js), so scope-safe concatenation in
// dependency order plus a stripped storage layer is enough -- see DESIGN.md's
// "Claude Artifact parity version" section for why a real bundler was
// deliberately not introduced.
//
// Every app/*.js file uses only `function`/`var` declarations (confirmed:
// zero arrow functions, zero top-level const/let), which are hoisted --
// concatenation order does not affect correctness for declarations. The one
// real ordering constraint is dialogs.js's top-level DOM wiring
// (on($("modalClose"), ...)), which needs dom.js's functions (hoisted, order-
// safe) AND real DOM elements from index.html to already exist -- satisfied
// by keeping the bundled <script> at the end of <body>, same as today.
//
// STORAGE SWAP: this script does not yet implement the db-backed adapter
// (see TODO.md's artifact-parity-storage-adapter item) -- state.js's
// load()/save() are concatenated as-is, unmodified, until that lands.
// Running this build today produces a single-file app that still calls
// window.localStorage, not window.claude.use("db"). That swap is the next
// piece of work, not yet done.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP_DIR = path.join(ROOT, "app");
const OUT_DIR = path.join(ROOT, "Claude-Sidequest");
const OUT_FILE = path.join(OUT_DIR, "index.html");

// Dependency order, hand-verified against each file's own `import` lines
// (see the comment above: hoisting makes exact order mostly irrelevant for
// declarations, but this order still matches the real dependency graph for
// clarity and so file-level top-level side effects, like dialogs.js's DOM
// wiring, run after everything they depend on).
const MODULE_ORDER = [
  "dates.js",
  "dom.js",
  "model.js",
  "state.js",
  "chart.js",
  "search.js",
  "dialogs.js",
  "views.js",
  "app.js",
];

function stripModuleSyntax(source, filename) {
  // Drop every import statement, single-line or multi-line (some destructuring
  // lists in this codebase, e.g. dialogs.js/views.js, span several lines).
  // Matches `import {` ... `} from "...";` non-greedily across newlines.
  var withoutImports = source.replace(/^import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?\s*$/gm, "");

  var lines = withoutImports.split("\n");
  var out = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Strip a leading "export " from function/var declarations, keep the rest
    // of the line as-is. This codebase only ever exports functions and vars
    // at the top level (confirmed: no `export default`, no `export {...}`
    // re-export lists, no `export class`).
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

function build() {
  var htmlPath = path.join(ROOT, "index.html");
  var html = fs.readFileSync(htmlPath, "utf8");

  var tokens = fs.readFileSync(path.join(ROOT, "css", "tokens.css"), "utf8");
  var styles = fs.readFileSync(path.join(ROOT, "css", "styles.css"), "utf8");

  var scriptParts = [];
  MODULE_ORDER.forEach(function (name) {
    var full = path.join(APP_DIR, name);
    var src = fs.readFileSync(full, "utf8");
    scriptParts.push("// ---- " + name + " ----\n" + stripModuleSyntax(src, name));
  });
  var bundledScript = "(function () {\n\"use strict\";\n" + scriptParts.join("\n\n") + "\n})();\n";

  // Verify every app/*.js file was actually included -- a file added to app/
  // later but not added to MODULE_ORDER above must fail the build loudly,
  // not silently ship an incomplete bundle.
  var actualFiles = fs.readdirSync(APP_DIR).filter(function (f) { return f.endsWith(".js"); });
  var missing = actualFiles.filter(function (f) { return MODULE_ORDER.indexOf(f) === -1; });
  if (missing.length) {
    throw new Error("build-artifact: app/ contains file(s) not listed in MODULE_ORDER: " + missing.join(", ") + ". Add them to the build script before building.");
  }

  var out = html
    .replace(
      /<link rel="stylesheet" href="css\/tokens\.css">\s*\n<link rel="stylesheet" href="css\/styles\.css">/,
      function () { return "<style>\n" + tokens + "\n" + styles + "\n</style>"; }
    )
    .replace(
      /<script type="module" src="app\/app\.js"><\/script>/,
      function () { return "<script>\n" + bundledScript + "</script>"; }
    );

  if (out.indexOf("<style>") === -1) throw new Error("build-artifact: css <link> tags not found/replaced -- check index.html's <head> hasn't changed shape.");
  if (out.indexOf(bundledScript) === -1) throw new Error("build-artifact: script tag not found/replaced -- check index.html's closing <body> hasn't changed shape.");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, out, "utf8");
  console.log("Built " + path.relative(ROOT, OUT_FILE) + " (" + Buffer.byteLength(out, "utf8") + " bytes) from " + MODULE_ORDER.length + " app modules.");
}

build();
