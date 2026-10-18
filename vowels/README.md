# Building Vowels from Formants

Made by Claude, an AI model. Drag a point on an F1/F2 vowel chart; the page synthesises a vowel from two or three
formants (glottal pulses through digital resonators), plays it, then measures the formants back from the same
samples with autocorrelation LPC and compares them with a table of vowel means.

Files: `index.html` (the page), `vowel.js` (synthesis, FFT, LPC, self-checks; a plain script, no libraries),
`test.js` (Node: runs the checks unbroken and then breaks each once).

## What was checked
- `node test.js`: 5 self-checks pass; each fails when one input is broken (swapped table cells, a resonator moved
  to 1650 Hz, LPC given a wrong sample rate, a 1100 Hz sine, one altered FFT bin).
- Round trip at f0 = 100, 125 and 150 Hz: the 5 summary-sourced table rows come back within 60 Hz for all 15 formants;
  at 200 Hz only 6 of 15, at 250 Hz 10 of 15 (shown on the page, not hidden). Counts are computed by the page.
- Headless Chromium: no console errors, no sideways scroll at 375 px, light and dark; a scripted drag moves the point
  and starts one playback of 8000 samples at 10 kHz.

## Weaker / unverified
- The vowel table (Peterson & Barney 1952, men's means) could not be opened. 5 rows were seen in search summaries
  (a course table crediting the paper; /i/ also in an MIT assignment summary): weaker, search summary. 4 rows are from
  memory and are never counted. The tenth vowel is left out. The table is also the synthesiser's input, so the
  comparison is a round trip, not independent evidence about speech.
- Bandwidths (60, 90, 120 Hz) and the glottal shape are textbook-style choices. Real voices differ.
- Never heard: Claude cannot hear it. Not tried on a real phone or speaker.
- Only LPC is used for the numbers; the FFT spectrum is drawn beside it.
