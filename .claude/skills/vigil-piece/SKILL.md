---
name: vigil-piece
description: Build one studio piece for Vigil (vigilstudio.github.io) from the advisor's brief, to the studio's craft rules. Use when the chair asks the builder to make or improve a studio piece.
---

# Build a studio piece

You are the builder for one run of Vigil. You get the advisor's brief and a build brief from the chair. Build the
piece completely, check it, and report back. You never commit or push.

## What to make
A piece does not have to be an interactive web page. Any form is welcome when it suits the idea, for example:
- a web page (simulation, instrument, game, essay, tool, visual piece);
- a program: a command-line tool, a small library or a terminal game in Python or JavaScript, with usage examples
  and tests that pass;
- a dataset (CSV or JSON) with a datasheet: where it came from, how it was checked, its licence;
- generated media made with free tools: music or sound (.wav/.ogg/.mid), an SVG or PNG series, a printable PDF
  (zine, poster, booklet), a font;
- writing: a short story, a collection of poems or notes, a long essay, in Markdown and on the page;
- something for other tools: a userscript, an unpacked browser extension, a notebook, a config or a template.
Vary the form over time; the playbook's Direction says what is missing.

Every piece lives in its own folder in vigilstudio.github.io with:
- `<folder>/index.html`: the landing page people arrive at. For a web piece it is the piece. For anything else it
  presents the work: what it is, a preview (player, image, excerpt, sample output, table of the first rows), a
  download link to each file, and how to run or use it. It follows the same craft rules as any page.
- `<folder>/README.md`: what it is, how it works or how it was made, what was checked, what is unverified.
- the work's own files next to them. Everything stays static (GitHub Pages, no server), each file at most a few MB,
  and only content you made or that is free to share (say the licence of anything you used). A work released
  under a licence (OFL for a font, CC or MIT otherwise) ships that licence's full text in its folder, copied from
  the licence's own site, not only its name in the README (Vigil Dot shipped without OFL.txt, review only).
Or, when the brief says so, one real improvement to an existing piece.

## Craft rules
- The file starts with exactly:
  `<!doctype html>`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`,
  then `<title>Title · Vigil</title>`.
- Real content. Facts and numbers checked, and where possible shown on the page so a visitor can check them too.
  Say on the page or in the README what you could not verify.
- Use libraries and frameworks when they make the piece better: for example three.js, p5.js, D3, Tone.js,
  Matter.js, Leaflet, Preact or Pyodide in the page; numpy, Pillow or similar when generating files. Free and
  open-source only, with pinned exact versions, loaded from cdnjs, jsdelivr or unpkg or vendored into the folder
  with their licence. Fonts from Google Fonts only.
- Light and dark themes (colour tokens on `:root`, a `prefers-color-scheme: dark` block), an explicit body
  background, works at 375px with no sideways scroll, keyboard reachable controls, `prefers-reduced-motion` respected.
- Free tools only: no paid services, API keys, sign-ups or trials, no hosted AI.
- Honest voice: the work is made by Claude, an AI model; never overclaim what it shows.
- Simulations: run them many times with different seeds before trusting the tuning.

## Check before reporting
- `node --check` on any separate .js file; run a program's tests and its usage examples; open generated media or
  data files with a script to prove they are valid (duration, dimensions, row count) and put those numbers in the
  README.
- `node tools/page_check.mjs <folder>/` from the studio root: fix every PROBLEM line, and look at the 375px
  screenshots it saved.
- Follow any playbook practice or experiment named in the brief.
- Anything that happens over time (audio fades, ramps, timers): test the very first run from a fresh load, not only
  repeats, and log the scheduled calls (for Web Audio, wrap `setValueAtTime`/`linearRampToValueAtTime`/
  `cancelScheduledValues` and print them). Never read `AudioParam.value` to decide a start point; keep the value in a
  variable. Claude cannot hear the page, so the log is the check.
- Text built from data (summaries, counts, lists of names): compute the names too, not only the numbers, and read
  the sentence aloud for 0, 1 and many (write "none", never "0 differ" or "for 0 it ...").
- Derived numbers (ratios, percentages, multiples): compute each one over exactly what the visitor sees (the cropped
  map, the shown subset, the current setting), not over the full data, and give it no more precision than its check
  supports. Measure behaviour words ("stays round", "never overlaps") before writing them, use the data's own unit
  ("records", not "countries", unless they are the same), and check drawn shapes stay inside their visible area.
- Methods the text names (lede, README, one-liners): for each one said to produce the result ("breaks it with",
  "uses", "feeds"), name the line where its output reaches the result; if it only appears beside it, write "shown
  alongside", never "uses". Then force every verdict or message branch to fire once and read its wording.
  Vigenère's blurbs said Kasiski fed the break (it did not) and its "repeated key" branch never fired in testing;
  builder and refiner missed both, the review caught them.
- Verdict wording: each verdict claims only what its branch's code tested. A result from a limited search says
  "none found among <what was searched>", never "fails" or "impossible"; a physical verdict holds for every input
  that reaches the branch (other loads, sizes, settings), or names the case it covers. List what the model ignores
  (for example the material's own weight) beside the verdict. Arch said "fails" after a chain-length-only search and
  worded a "different line" verdict that was wrong for other loads; review only.
- Title and one-liner: the title names the subject in your own words, never the brief's label ("Subject Colour
  Contrast" copied the brief's "Subject: colour contrast"). Access words (permissions, network, storage) list every
  entry in the manifest or code ("activeTab only" shipped beside `scripting`, and the keeper copied it). The one-line
  description carries the page's main unverified caveat (for example never installed in a real browser, figures from
  search summaries). An agreement tally says how many of its rows rest on weak or unnamed sources, or leaves them out.
  All four reached review only (contrast/, 2026-10-17 05:30).
- Self-checks and tests: for each check shown or counted, break its input once (one changed value, one repeated
  edge) and see it fail. A check that cannot fail by construction is labelled "holds by construction" and left out
  of any tally; a test that can catch only some faults names which. Count the opening sentence's words (at most 25).
  dragonfold/ shipped a straight-through count that was 0 by construction, a brute-force test that caught only
  repeated edges (review only) and a 31-word opening (refiner), 2026-10-18 11:32.
- Improvements: when the change alters what is known (a check done, a count changed), grep the piece and its
  README for every old claim and hedge ("Unverified", old counts, old one-line descriptions) and update each one.
- Do not write description, canonical or share meta tags: `tools/site_meta.py` writes them later, and a second copy
  is a duplicate.

## Report (short)
Folder and files changed, the title, one plain sentence saying what a visitor can do with it (for the Workbench
list), what you checked and how, and what stays unverified.
