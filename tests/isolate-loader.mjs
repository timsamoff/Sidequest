// Node module customization hook used only by tests/template.test.js.
//
// The app's module graph (app/app.js and everything it imports) is loaded fresh
// once per mk() call so each simulated "page load" gets its own independent
// `state`/`ui` (see template.test.js's comment on why). A bare per-entry-point
// query string (e.g. dynamic import("../app/app.js?t=1")) does NOT achieve this:
// app.js's own internal `import "./state.js"` has no query of its own, so every
// mk() call's app.js still resolves the SAME single state.js module instance --
// confirmed by direct testing (two different app.js?t=N loads shared one
// state.js instance, so mutations from an earlier test's dom leaked into a later
// test's dom's `state`).
//
// This hook rewrites every resolution of a file under the project's app/
// directory to carry the run's current tag as a query string, so the ENTIRE
// graph transitively reloads fresh, not just the entry point. The active tag is
// read from the URL query of whatever triggered resolution (propagated down from
// the dynamic import("../app/app.js?run=N") call in mk()), or from the
// process-wide fallback set via the exported setRunTag over MessageChannel --
// Node's module hooks run in a separate loader realm, so a plain shared JS
// variable would not be visible here; MessagePort is the supported channel for
// passing data from the main thread into the hooks thread.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP_DIR = pathToFileURL(path.join(process.cwd(), "app") + path.sep).href;

function currentTag(parentURL) {
  if (!parentURL) return null;
  try {
    const u = new URL(parentURL);
    return u.searchParams.get("run");
  } catch (e) {
    return null;
  }
}

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (!result.url.startsWith(APP_DIR)) return result;
  const tag = currentTag(context.parentURL) || new URL(context.parentURL || "file:///").searchParams.get("run");
  if (!tag) return result;
  const u = new URL(result.url);
  if (u.searchParams.get("run") === tag) return result;
  u.searchParams.set("run", tag);
  return { ...result, url: u.href };
}
