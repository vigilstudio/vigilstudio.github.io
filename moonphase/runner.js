// runner.js - module worker: runs the checks off the main thread so the page stays responsive.
import * as mp from "./moonphase.js";
import * as astro from "./vendor/astronomy.js";
import { runTests } from "./tests.js";
try { postMessage({ ok: true, result: runTests(mp, astro) }); }
catch (e) { postMessage({ ok: false, error: String(e && e.message || e) }); }
