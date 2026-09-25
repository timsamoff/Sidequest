// Real-browser accessibility scan (axe-core via Playwright), separate from
// template.test.js's jsdom suite -- jsdom has no layout engine, so contrast/
// focus/aria-in-context checks can't run there. Not part of `npm test` (needs
// a live server + a real browser, too slow for the everyday loop); run via
// `npm run test:a11y`. See sentinel-notes/TODO.md's `a11y-tooling` item.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");

const ROOT = path.join(__dirname, "..");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = req.url.split("?")[0];
      if (p === "/") p = "/index.html";
      const full = path.join(ROOT, p);
      fs.readFile(full, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(0, () => resolve(server));
  });
}

// Pages reachable straight from a fresh load, exercised via the nav tabs
// already present in the sample data -- covers every CORE/BOTTOM page kind
// (a plain list page, a project's own page, the archive, settings) without
// needing to fabricate state.
const PAGES = [
  { name: "Today", tab: "today" },
  { name: "Projects", tab: "projects" },
  { name: "Tasks", tab: "schedule" },
  { name: "Timeline", tab: "timeline" },
  { name: "Parking lot", tab: "parking" },
  { name: "Archive", tab: "archive" },
  { name: "Settings", tab: "settings" },
  { name: "Help", tab: "help" }
];

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

async function main() {
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("http://localhost:" + port + "/index.html");
  await page.waitForTimeout(300);
  const dismiss = page.locator("#welcomeDismiss");
  if (await dismiss.count()) await dismiss.click();

  for (const p of PAGES) {
    await page.click('.tab[data-view="' + p.tab + '"]');
    await page.waitForTimeout(150);
    const results = await new AxeBuilder({ page }).include("#view").analyze();
    ok(results.violations.length === 0, p.name + " page has no axe violations" + (results.violations.length ? ":\n     " + results.violations.map(v => v.id + " (" + v.nodes.length + ")").join(", ") : ""));
  }

  // One project's own page (a distinct template from the plain list pages above)
  await page.click('.tab[data-view="proj:pApp"]');
  await page.waitForTimeout(150);
  const projResults = await new AxeBuilder({ page }).include("#view").analyze();
  ok(projResults.violations.length === 0, "a project's own page has no axe violations" + (projResults.violations.length ? ":\n     " + projResults.violations.map(v => v.id + " (" + v.nodes.length + ")").join(", ") : ""));

  await browser.close();
  server.close();
}

main().then(() => {
  console.log(fails ? ("\n" + fails + " FAILED") : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
});
