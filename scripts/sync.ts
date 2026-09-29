// CLI: npm run sync [-- ear jp screening]
import { runSync, type SyncTarget } from "../src/ingest/sync.ts";

const args = process.argv.slice(2).filter((a): a is SyncTarget => ["ear", "jp", "screening"].includes(a));
const started = Date.now();
const { manifest, changes } = await runSync(args.length ? args : undefined, (p) => {
  const n = p.total ? ` (${(p.done ?? 0) + 1}/${p.total})` : "";
  console.log(`• ${p.step}${n}${p.detail ? ` — ${p.detail}` : ""}`);
});
console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(manifest.counts);
for (const c of changes.slice(0, 50)) console.log(`  [${c.severity}] ${c.title}${c.detail ? ` — ${c.detail}` : ""}`);
