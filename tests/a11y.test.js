// Real-browser accessibility scan (axe-core via Playwright). Separate from the jsdom suite, which has no layout engine; run it with `npm run test:a11y`.
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

// Pages reachable from a fresh load through the nav tabs in the sample data: a list page, a quest's page, the vault, and settings.
const PAGES = [
  { name: "Today", tab: "today" },
  { name: "Quests", tab: "projects" },
  { name: "Tasks", tab: "schedule" },
  { name: "Timeline", tab: "timeline" },
  { name: "Workshop", tab: "workshop" },
  { name: "Vault", tab: "vault" },
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
  await page.goto("http://localhost:" + port + "/app/index.html");
  await page.waitForTimeout(300);
  const dismiss = page.locator("#welcomeDismiss");
  if (await dismiss.count()) await dismiss.click();

  for (const p of PAGES) {
    await page.click('.tab[data-view="' + p.tab + '"]');
    await page.waitForTimeout(150);
    const results = await new AxeBuilder({ page }).include("#view").analyze();
    ok(results.violations.length === 0, p.name + " page has no axe violations" + (results.violations.length ? ":\n     " + results.violations.map(v => v.id + " (" + v.nodes.length + ")").join(", ") : ""));
  }

  // One quest's page (a distinct template from the plain list pages above)
  await page.click('.tab[data-view="quest:pApp"]');
  await page.waitForTimeout(150);
  const projResults = await new AxeBuilder({ page }).include("#view").analyze();
  ok(projResults.violations.length === 0, "a quest's page has no axe violations" + (projResults.violations.length ? ":\n     " + projResults.violations.map(v => v.id + " (" + v.nodes.length + ")").join(", ") : ""));

  // A candidate's page (its own branch: no Quest links, Promote/Vault actions)
  await page.click('.tab[data-view="projects"]');
  await page.waitForTimeout(150);
  await page.click('#view button:has-text("Sample Browser Extension")');
  await page.waitForTimeout(150);
  const candResults = await new AxeBuilder({ page }).include("#view").analyze();
  ok(candResults.violations.length === 0, "a candidate's page has no axe violations" + (candResults.violations.length ? ":\n     " + candResults.violations.map(v => v.id + " (" + v.nodes.length + ")").join(", ") : ""));

  // Landing site pages (static; the script-built nav toggle and splash need no fixture)
  for (const f of fs.readdirSync(ROOT).filter((n) => n.endsWith(".html")).sort()) {
    await page.goto("http://localhost:" + port + "/" + f);
    await page.waitForTimeout(300);
    const r = await new AxeBuilder({ page }).analyze();
    ok(r.violations.length === 0, f + " (landing) has no axe violations" + (r.violations.length ? ":\n     " + r.violations.map(v => v.id + " (" + v.nodes.length + ")").join(", ") : ""));
  }

  await browser.close();
  server.close();
}

main().then(() => {
  console.log(fails ? ("\n" + fails + " FAILED") : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
});
