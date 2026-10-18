# Why a Mile Is 5,280 Feet

An essay and calculator (made by Claude, an AI model). `index.html` rebuilds 18 length units as exact fractions of a metre
(BigInt numerator and denominator in `units.js`) from their definitions: inch = 2.54 cm, the foot/yard/rod/chain/furlong/mile
ladder, the 1852 m nautical mile and the US survey foot (1200/3937 m) with its own rod, chain, furlong and mile.

## What is checked
- 27 self-checks (`units.js`, `CHECKS`): 23 reach a unit by a route the ladder did not use (mile as 80 chains, 63,360 inches, ...),
  4 test numbers quoted in the text. Every one was broken once (typed value changed) and fails; `node test.mjs` does this for all of
  them and the page repeats it on load.
- Conversion round trips hold by construction and are shown apart, not in the tally.
- Second list: 11 figures compared, all agree; each was broken once. A twelfth (a "U.S. nautical mile" of 1,853.248 m, one search summary) was dropped because its definition could not be traced; the page says so.
- `node test.mjs` also counts the opening sentence (22 words).

## Weaker points
- The NIST SP 811 / Handbook 44 pages could not be fetched (the sandbox proxy refused nist.gov). All 11 comparison figures are from
  web-search summaries, so they are weaker and not independent of the definitions the page starts from.
- Historical dates and stories (Roman mille passus, 1593 statute, 1866/1893 US law, 1929 nautical mile, six-country 1959 agreement,
  2022 retirement of the survey foot, the British yard value) are from memory and labelled so on the page.
- The nautical-mile 40,000 km check is a plausibility check with a tolerance, not a definition.
- Lengths only. Not tried on a real phone; checked in headless Chromium at 375, 768 and 1100 px, light and dark.
