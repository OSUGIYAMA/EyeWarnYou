// Kanmon server: API on /api, and (in production) the built web app.
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import fs from "node:fs";
import path from "node:path";
import { app as api } from "./app.ts";
import { store } from "./store.ts";
import { runSync } from "../ingest/sync.ts";
import { landscape } from "./landscape.ts";

const PORT = Number(process.env.PORT ?? 8787);
const WEB_DIR = path.resolve(import.meta.dirname, "../../dist/web");

const started = Date.now();
store.load();
console.log(`Loaded regulatory data in ${Date.now() - started} ms — ${store.data.ccl.eccns.length} ECCNs, ${store.data.screening.entries.length.toLocaleString()} screening entries, ${store.sections.size} regulation sections`);
if (!store.data.screening.entries.some((e) => e.list === "EL")) {
  if (process.env.KANMON_OFFLINE) console.warn("⚠ US screening lists are not downloaded (offline mode) — run `npm run sync` when online.");
  else {
    console.log("Downloading the US Consolidated Screening List in the background (first run)…");
    runSync(["screening"])
      .then(() => {
        store.load();
        console.log(`Screening lists ready — ${store.data.screening.entries.length.toLocaleString()} entries.`);
      })
      .catch((e) => console.warn(`⚠ Could not download screening lists: ${(e as Error).message}. Use Settings → Data to retry.`));
  }
}

// Warm the cross-list analytics in the background.
landscape(store.data, store.loadedAt);

const root = new Hono();

// Optional shared password for deployments beyond localhost.
if (process.env.KANMON_PASSWORD) root.use("*", basicAuth({ username: process.env.KANMON_USER ?? "kanmon", password: process.env.KANMON_PASSWORD }));

root.route("/", api);

if (fs.existsSync(WEB_DIR)) {
  root.use("/*", serveStatic({ root: path.relative(process.cwd(), WEB_DIR) }));
  root.get("*", (c) => c.html(fs.readFileSync(path.join(WEB_DIR, "index.html"), "utf8")));
}

serve({ fetch: root.fetch, port: PORT, hostname: process.env.HOST ?? "127.0.0.1" }, (info) => {
  console.log(`Kanmon is running at http://${info.address === "::1" ? "localhost" : info.address}:${info.port}`);
});
