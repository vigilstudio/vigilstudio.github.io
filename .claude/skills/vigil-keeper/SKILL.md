---
name: vigil-keeper
description: Wire a new studio piece into the Workbench, README and STUDIO tables, and keep the Workbench (Vigil's front page) correct, complete and good-looking using the check scripts. Use every run, after the studio piece is built.
---

# Workbench keeper

Runs every run, even when no piece was made. Scripts do the checking; you do the small edits they point to.
You never commit or push. Work in the vigilstudio.github.io root.

## 1. Wire in this run's piece (if there is one)
The chair gives you: folder, title and one plain sentence. Take the time from the clock, never from memory:
`TZ=Europe/Bratislava date '+%-d %b · %H:%M'` (earlier runs wrote wrong local times and broke the order).
- `workbench/index.html`: add one `<li>` to the list `id="later"` directly above the line that starts with
  `<!-- LATER-VISITS`, in exactly the format of the items above it:
  `<li><a href="../<folder>/index.html">Title</a><span class="when">14 Oct · 12:00</span><span class="what">One sentence.</span></li>`
- `README.md`: add a row to the pieces table in the same format as the others:
  `| **Title** | one line | [\`<folder>/\`](<folder>/) |`
- `STUDIO.md`: add a row to the "What is here" table.
- The game (`game/`): wire it in once like a new piece the first time it exists; on later runs only update its
  one-line descriptions in the three places with the sentence the game builder gives, keeping its original date.
- Improved piece (not new): edit its existing lines in those three places in place. Each line must still say what
  the piece is and what a visitor does with it (for example "a game: hop between stars"), with the new fact added;
  never replace the description with only the change.

## 2. Check
- `python3 tools/keeper_check.py --fix`. It adds missing doctype/charset/viewport lines by itself; fix every other
  CHECK line by hand (a missing item, a duplicate, the wrong order, an old name or address such as penksTestAi,
  claude-studio, funStylePage or penkstestai.github.io). Never touch earlier journal entries.
- Two known checker false positives: `<title>` counts inline SVG `<title>` elements as page titles, and the
  placeholder check matches "x and y" in any case. Confirm by reading the line; if it is one of these, leave the
  piece unchanged and report it to the chair as a false positive (23:27: the piece was edited to satisfy the checker).
- `node tools/page_check.mjs workbench/`: no PROBLEM lines, and the count it prints matches keeper_check's number.
  Look at the 375px light and dark screenshots.
- `git status --short`: every new or changed file must belong to this run's piece or the files above. Delete stray
  screenshots or scratch files the builders left (for example `intro.png`, `step*.png` in the root) and name them in
  your report.
- Never write or edit a journal entry in STUDIO.md; the chair writes it.
- Masthead links: ../toys/, ../feed.xml, https://x.com/vigilstudio, https://github.com/vigilstudio, the avatar
  ../brand/avatar.svg.

## 3. Words (rarely)
You may update the short factual passages ("How the shifts work", the line under "Made on later shifts", the
signature date line) when the facts changed, in Vigil's voice and as few words as possible. Never rewrite the opening
paragraphs, "The first three" cards or "The question underneath"; put suggestions for those in your report for the
owner instead. The letter must keep saying plainly that Claude, an AI model by Anthropic, is behind Vigil and that
Vigil is not an Anthropic project.

Any sentence about online play copies the status recorded in game/CHANGELOG.md and PLAYBOOK Direction (the owner's
one test, before milestone 2; later milestones untested online unless their entry says otherwise). Never say or
imply that a later milestone was played online (20:21 review corrected the keeper's online-play sentence).

Do not make design changes to the front page. If something looks off, describe it in your report; the reflector
can turn it into an experiment or a proposal.

## Report (at most 8 lines)
What you wired in, the script results, what you fixed, anything left for the owner.
