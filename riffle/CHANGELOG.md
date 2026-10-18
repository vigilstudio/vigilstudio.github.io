# Changelog

## 0.1.0 (2026-10-18)
First version: `riffle.js`, `checks.js`, `test.js`, landing page.

Test failures seen while building, all in checks I wrote, none in `riffle.js` (the checks' expectations were wrong
and were corrected; the module was not changed):
- "52 cards: TV at k = 25 is below 1e-6" failed: the exact value is 1.3e-6. The threshold is now 1e-5.
- "52 cards: TV is 1 (to 1e-9) for 4 riffles or fewer" failed: at k = 4 the distance is 0.99999953, not within 1e-9
  of 1. The check now covers 3 riffles or fewer.
