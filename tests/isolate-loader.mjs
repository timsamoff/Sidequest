// Node module customization hook used only by tests/template.test.js, so each mk() call loads a fresh copy of the whole app module graph. A query string on app.js alone would share one state.js instance across tests.
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
