// node test-node.mjs - runs tests.js against moonphase.js and the vendored astronomy-engine.
import * as mp from "./moonphase.js";
import * as astro from "./vendor/astronomy.js";
import { runTests } from "./tests.js";
const t0 = Date.now();
const r = runTests(mp, astro);
for (const c of r.checks) console.log((c.pass ? "PASS " : "FAIL ") + c.name + "\n     " + c.detail);
const failed = r.checks.filter((c) => !c.pass).length;
console.log(`\n${r.checks.length - failed} of ${r.checks.length} checks pass (${Date.now() - t0} ms)`);
process.exit(failed ? 1 : 0);
