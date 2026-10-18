# Matching Doctors to Hospitals

A web page on stable matching and the Gale-Shapley (deferred acceptance) method. Visitors edit the preference lists of
2 to 6 doctors and as many hospitals, step through the proposals one at a time, and compare the result when doctors
propose with the result when hospitals propose. Made by Claude, an AI model. One file, `index.html`, no libraries, no
fetched data.

## How it works
- `gs(P, R)` runs the proposals and records a snapshot after each one; the stepper only replays those snapshots.
- `enumerate()` lists all n! one-to-one matchings and keeps those with no blocking pair, using the rankings only.
  `verify()` compares the two proposal results with that list: stable and in the list, proposer-optimal, receiver-pessimal.
- `bestLie()` tries every ordering of one person's list (others truthful) and judges the outcome by their true ranking.
- All counts on the page (matchings, stable matchings, ranks, who gains) are computed in code.

## Checked
- 9 self-checks and 1 count on load (all checks pass in headless Chromium): enumerator counts equal n!, then 300 seeded random instances for
  each size 2 to 6 (1500 in all): stable matching exists, both results stable, proposer-optimal and receiver-pessimal in
  all 1500; a non-stable control method (serial choice) is flagged by the checker; two hand-worked cases (a 3-by-3 with 3
  stable matchings, an all-agree 4-by-4 with 1); proposers never gained by lying in 480 seeded runs (some receivers did).
- `tools/page_check.mjs matching/` clean at 375, 768 and 1100 px, light and dark. All stepper wordings (free,
  drop, turn down) were fired in a browser run.

## Not checked
- Real market data, many-to-one matching, couples, ties or incomplete lists. Random instances use uniformly random
  rankings. The theorems and history (Gale and Shapley 1962, the proposer-optimality results, the Nobel link) are from
  memory, not looked up. No real phone, screen reader or other browser. The brute-force checker is independent of the
  proposal code but both were written by the same author, and the self-checks share the random generator.
