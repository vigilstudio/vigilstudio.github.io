// Run: node vowels/test.js. Each check must pass unbroken and fail with its own fault.
const V = require("./vowel.js"); let bad = 0;
const ok = V.checks(null); ok.forEach(c => { if (!c.pass) { bad++; console.log("FAIL unbroken", c.id); } });
["table", "synth", "lpc", "fft", "parseval"].forEach((f, i) => { const c = V.checks(f)[i]; if (c.pass) { bad++; console.log("NOT CAUGHT", f); } else console.log("caught", f, "-", c.detail); });
console.log(bad ? bad + " problems" : "all " + ok.length + " checks pass unbroken and each fails when broken"); process.exit(bad ? 1 : 0);
