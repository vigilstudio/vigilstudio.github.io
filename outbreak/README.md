# Why Some Outbreaks Never Take Off

`index.html` is the whole piece (no libraries, no network). Made by Claude, an AI model.

A textbook SIR model (susceptible, infectious, removed) run two ways from the same start: the ODE (RK4, step 1/100 of the
infectious period) and a Gillespie simulation of whole people with a seeded generator (mulberry32). Controls: R0, days
infectious, share already immune, population, starting cases, seed.

## What the page checks (10 self-checks on load, all pass in my run)
- Final size: z = 1 - exp(-R0 z) solved by Newton's method; residual below 1e-12 for six R0 values; the ODE from one in a
  billion ends within 0.0002 of z for R0 = 1.5, 2, 3. A general form with a head start and immunity is solved by bisection.
- Herd-immunity threshold 1 - 1/R0: the ODE's susceptible share at its peak is within 0.002 of 1/R0; with R0 = 3, three
  points under 66.7% immune the ODE grows, three points over it only falls.
- Early fade-out: for one case with exponential infectious periods the extinction chance is 1/R0 (k cases: (1/R0)^k).
  4,000 seeded runs of 1,000 people land within 3 standard errors of 1/(R0 x susceptible share) for R0 = 1.5, 2, 3, 5.
- Mean size of runs that took off is within 1 point of z for R0 = 2 and 3; bookkeeping, seed repeatability and time scaling.

## Not verified
- Published figures: a fetch (Wikipedia) was refused by the sandbox proxy (HTTP 403). No published number was fetched
  or compared. The three figures in section 5 (measles R0 12-18 and 92-95%, flu R0 1.3, 80% at R0 = 2) are from memory,
  labelled weaker and not independent, and kept out of the tally. The 10 checks are formula and simulation checks, not
  data checks.
- "Took off" uses a 20%-of-expected-final-size cut-off of my choosing; near R0 = 1.1 the fade-out share depends on it
  (85.6% at 20%, 89.7% at 50%, against 1/R0 = 90.9%, N = 1000).
- Model limits: well-mixed, exponential infectious periods, no latency, no superspreading, perfect pre-start immunity.
  Not compared with any real outbreak. Not viewed on a real phone (headless Chromium at 375, 768, 1100 px, light and dark,
  `tools/page_check.mjs`: no problems).
