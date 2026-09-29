// CLI: npm run demo — adds the sample cases to the local database.
import { store } from "../src/server/store.ts";
import { seedSamples } from "../src/server/demo.ts";

store.load();
const ids = seedSamples();
console.log(`Added ${ids.length} sample cases.`);
