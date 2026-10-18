# Grey From Black and White Dots

A page that shows grey with only black and white pixels three ways (plain threshold, ordered Bayer 4 by 4, Floyd-Steinberg
error diffusion) on an image it draws itself: a ramp, a fading disc, four flat greys and the word GREY. No photos. Made by
Claude, an AI model.

## What the page measures
Both measures read the output pixels (0 or 255) against the grey original, in grey levels out of 255:
- mean tone kept per tile: for each square tile (4, 8 or 16 px), `|mean(output) - mean(grey)|`; the mean and the worst tile;
- error after a blur: Gaussian blur of both pictures (width 0.5 to 4 px, edges repeated), then the root-mean-square difference.

At the default setting (8 px tiles, blur 1.5 px): threshold 45.20 / 53.33, Bayer 2.30 / 5.80, Floyd-Steinberg
3.52 / 5.53 (tile error / blur error). Bayer is best on the mean tile error here; after a wider blur
(3 px) Floyd-Steinberg is ahead (check the page for the figure). The ranking depends on the test image and the two settings.

## Files
- `index.html`, `dither.js` (image, methods, measures; no DOM), `checks.js` (the seven self-checks), `test.js`
  (`node test.js`: runs the checks, then breaks the code once per check and expects that check to fail).
- `make_reference.py`: builds the same image with separate integer code, converts it with Pillow 12.3.0 `convert('1')`
  (Floyd-Steinberg) and `convert('1', dither=NONE)`, and writes `reference.js` (checksum and both bitmaps).
  Run with `/usr/bin/python3 make_reference.py` (needs Pillow).

## Checked
- `node --check` on all scripts; `node test.js`: all 7 checks agree on the real code, and each
  check fails when its input is broken once (changed pixel, threshold 129 and 160, a sixteenth moved between weights, right weight 8, one Bayer entry zeroed, a
  shifted tile error, a scaled blur error, a wrong tile count).
- The image matches Python's by weighted checksum (sha256 is in `reference.js`). The plain threshold matches Pillow's
  `dither=NONE` in all 12288 pixels.
- Bayer: for every grey 0 to 255, a flat 4 by 4 block has the white count the threshold ladder gives.
- Floyd-Steinberg equals Pillow's `convert('1')` in all 12288 pixels. Cause of the old 27% mismatch: Pillow works in
  integers (error in sixteenths, whole-level part truncated toward zero, sum clipped to 0..255) and whitens only above 128
  (`>`, not `>=`). Found by trying variants against Pillow's bitmap, not from its source; only the full combination gives 0.
- Floyd-Steinberg accounting, exact in sixteenths: grey total minus output total equals the tone dropped at the edges, by
  truncation and by clipping (gap 0); it fails if the weights do not add to 16.
- Hand-worked values: tile error of grey 100 against black is 100; black against white after blur is 255; threshold on the
  four flat patches is (32 + 96 + 95 + 31) / 4 = 63.5.
- `node tools/page_check.mjs dither/`: no problems at 375, 768 and 1100 px, light and dark.

## Unverified and flagged
- The weights 7/16, 3/16, 5/16, 1/16 and the Bayer matrix are from memory. The weights now agree with Pillow's output, not
  with a published source, and agreement with one library does not make it the one true algorithm; the Bayer check catches a repeated or missing entry, not two
  swapped entries.
- The Python script and the page have one author, and the Pillow bitmaps are stored, not run in the page. Bayer has no
  second source (Pillow has no ordered dither).
- One synthetic image; the results are not a statement about photographs. Not seen on a real phone.
