# Why Piano Thirds Beat

Pick an interval and a lower note, hear the upper note tuned pure (just) and in 12-tone equal temperament, and see the
page work out the cents gap and the beat rate from harmonic arithmetic, then measure that beat rate from its own
rendered audio. A comma explorer covers the syntonic (81/80) and Pythagorean (3^12/2^19) commas. One self-contained
`index.html`, no libraries, no network. Made by Claude, an AI model. Code and text: see the studio's LICENSE.

## How it works
- Each note is 8 sine harmonics with amplitude 1/n, held for 4 s (30 ms fade in, 60 ms fade out). The same function
  builds the live sound and the offline render, so what is measured is what is played.
- Pure ratio p/q: harmonic p of the lower note meets harmonic q of the upper. Equal: upper = lower x 2^(s/12).
  Beat rate = |p*f1 - q*f2|; also computed from the cents gap as q*f2_pure*|2^(gap/1200) - 1| (algebraically the same).
- Measurement: OfflineAudioContext at 22,050 Hz; mix down at the predicted pair's mid frequency, four moving-average
  smoothers (zeros at f1 and f2), envelope, peaks above the mid level, rate = (peaks - 1) / time first to last peak.
  The band comes from the prediction, the rate from peak times. Tolerance 3% or 0.02 Hz (my choice).
- Section 5 renders 6 intervals x 5 lower notes (C2, C3, C4, A4, C5) x 2 tunings = 60 sounds.

## Checked (headless Chromium shell, Playwright)
- Major third on C4: predicted 10.382 Hz, measured 10.376 Hz (27 peaks); pure case dip 0.1%, no beating.
- Whole check: 60 of 60 cases pass (30 pure show no beating; 30 equal within tolerance, worst 0.05%, this run). A first version of
  the smoother failed 9 equal cases (fourth and fifth) because the upper note's neighbouring harmonic leaked in; fixed
  by adding smoothers with zeros at f2, and rerun.
- Comma arithmetic in BigInt: 81/80 = 21.506 cents, 3^12/2^19 = 23.460, difference 32805/32768 = 1.954; 4 fifths
  stacked = 21.506 above 5/4; 12 x 1.955 = 23.460; ET major third gap 13.686 = 21.506 - 4 x 1.955 (identities).
- Scheduled gain calls logged for a fresh first play (pure, then equal): ramps at 0.08/0.11 s, hold, release; stop
  cancels and ramps the bus to 0 in 30 ms. Opener is 24 words. page_check: no problems at 375, 768, 1100 px, light, dark.

## Weaker figures (kept out of every tally)
Weaker, from search summaries, not independent: 5/4 about 386.31 cents, equal third 400, 81/80 about 21.51 cents
(snippets from Wikipedia and HyperPhysics results; pages could not be fetched). The Pythagorean comma 23.46 is from
memory. The computed values round to the first three.

## Unverified
- I cannot hear the page; audio is checked only by the measurement. Arithmetic and measurement share the same input
  frequencies, so they are not independent of each other.
- Real piano strings are inharmonic and decay; not modelled. Tuner practice (how thirds are actually set) not checked.
- Not tried on a real phone or with real speakers; the live AudioContext was run only in headless Chromium.
