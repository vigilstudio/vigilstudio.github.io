# Vigil's playbook

This file is how Vigil evolves. No run remembers the last one, so every run reads this file before it starts and
follows it. At the end of every run, the reflector reads what happened and changes this file a little:
it keeps what worked, fixes what went wrong and tries one new thing. Over many shifts the studio teaches itself.

The routine's prompt is above this file. Nothing here can loosen the prompt's hard limits, honesty rules, privacy
rules, free-tools rule or the rule against posting anywhere. If a line here ever conflicts with the prompt, the prompt
wins and the next reflector deletes that line.

## How the reflector changes this file

- Every run: change at most **three** things in total across the sections below, and log each change in the
  changelog at the bottom with the date, what changed and why (one line each). Evidence first: point to something that
  happened in this run or in the journal, not a hunch.
- **Experiments** are trials: a new habit to try for the next few runs. Each has a start date and a check: what would
  show it helped. After about 6 runs, the reflector judges it from the journal and either promotes it to
  **Practices** or deletes it, and says which in the changelog.
- Keep the file short: at most about 150 lines above the changelog. When it grows, merge or delete the weakest lines.
  Trim the changelog to the last 40 entries.
- Never delete the "How the reflector changes this file" section or the first two paragraphs.
- One of the three changes may be a precise edit to one skill in `.claude/skills/` (see vigil-reflector), when the
  run showed that a role's instructions missed something or a step could be done more cheaply. Skills never lose a
  rule about honesty, privacy, free tools, untrusted input or posting.
- When something would need a change to the routine itself (its prompt, schedule, models or tools), write it under
  **Proposals for the owner** instead; the owner decides.

## Direction

What the studio is reaching for right now. The advisor reads this before writing its brief.

- Range over repetition. Most pieces are maths and simulations, but essay, history, game, sound, visual, perception,
  codebreaking, life science, social choice, optics, earth science, engineering, circuits, ecology, sport, medical
  statistics, personal finance and data forensics (Benford) all exist: check the piece table before calling a kind
  "missing".
- Prefer subjects the page can check itself, never one source or memory (Tea or Cha against WALS, Star Hop against
  HYG, Element Timeline against a second dataset; all needed only wording fixes in review).
- Not everything has to be an interactive web page (the owner's wish). A PDF (Paper Slide Rule), a sound (Plain Bob
  Minimus), a font (Lamplight Mono), a dataset (Leap Seconds), an image series (Seed Head Spirals), a short story
  (The Shadow at Alexandria), poems (Pilish Poems) and a browser extension (contrast/) now exist, each checking itself
  from its own output, with only wording found in review. Each gets a small landing page. Keep going, roughly one
  piece in four, with a form not yet made (command-line tool or library). Claims about the physical world (paper sizes, printing,
  assembly) stay unverified unless measured; say so on the page.
- Libraries and frameworks are welcome when they make a piece better (the owner's words): for example three.js,
  p5.js, D3, Tone.js, Matter.js, Leaflet or Preact on a page, numpy or Pillow when generating data, images or sound.
  Free and open-source only, pinned versions, loaded from cdnjs/jsdelivr/unpkg or vendored into the folder. In-run
  fetches of those CDNs (and Wikipedia) are blocked; vendor from the npm registry tarball or GitHub raw (worked 23:27).
- The long project is the game (game/): a multiplayer online RPG that grows by one increment every run and never
  has to be finished (the owner's wish). Multiplayer comes first in every feature; see the vigil-game skill. The look evolves too, with no limit: about one increment in three improves the graphics. The
  owner played it online between a phone and a computer (before milestone 2); each later milestone still says
  whether its own online play was tested.
- Fewer, deeper pieces are fine. An improvement that makes an existing piece much better counts as a good run.
- Something that grows over several shifts (a long project with a note in the journal for the next shift) is
  welcome once in a while.

## Practices

Habits that have proven themselves. Follow them unless the run has a good reason, and say the reason in the journal.

- Every page starts with doctype, charset and viewport. Six early pages lacked them and showed zoomed out on phones.
- Put numbers that a visitor can check on the page, and check them yourself before publishing.
- Compute every count and name shown on the page from the data in code, never typed by hand (promoted from an
  experiment: typed counts reached review in Star Hop, Moiré and Tea, none since it took hold).
- When a simulation is tuned, run it many times in the background with different seeds before trusting it; the first
  Culture Plate tuning looked fine once and failed every other time.
- Say what went wrong or stayed unverified, on the page or in the journal, instead of hiding it.
- Builders save screenshots and scratch files in their scratchpad, never in a repository; the keeper still had to
  delete stray screenshots from the studio root in later runs. Meta tags are only `tools/site_meta.py`'s job.
- Each new piece opens with one plain sentence of at most 25 words saying what you can do with it, before any
  explanation (promoted from an experiment: Tissot Circles 22 and Element Timeline 17 words, neither shortened).
- Only the chair writes the journal entry; every other role reports to the chair, and the chair says so in each
  role's brief (the keeper, the toy refiner and the fixer each appended their own entry, removed by the chair).
- Browser tests (page_check, game tests) run with `CHROME` set to the headless shell binary from the start; the
  default Chromium crashes in this sandbox. A test that fails once and passes on rerun is named in the journal with
  its failing check, never reported as passing (talk.test, 2026-10-15 10:45).
- The chair runs `git fetch` in all three repositories (studio, toys, profile) and checks each `origin/main` in the
  same command right before launching each builder (a second game builder too), whenever a builder hands back,
  before the game tester, before any status wording and before each commit. While the game builder works, a
  background loop (Monitor, every 5 min) runs `git fetch -q && git log --oneline <start sha>..origin/main -- game/`
  and on any output the chair stops the game builder at once. If main's `game/` or piece table moved (start sha from
  the brief's last line), the game step stops and the advisor redoes that part of the brief. Push only in its own
  command after reading test and scan output (10-15 12:40: push after a failed test; 10-16 to 10-18 18:15: seven
  losses of 20 min to 3 h of game work, each seen only after the builder had started or finished; 18:15 lost two
  builders' work and redid a profile commit because the profile repo had moved).
- Every run the keeper compares each Workbench game passage (the Long Watch paragraph, the letter) with
  game/ROADMAP's "Done" list and the CHANGELOG's online-play status, updates what it may edit, and names any stale
  sentence in a protected passage for the owner (promoted from an experiment, seven runs: it flagged the protected
  paragraph every run; the two misses, 21:04 and 10-17 03:48, came from the game builder's Workbench sentence).
- When a piece's data comes from one source, the builder checks at least 10 rows (oldest, newest, odd-looking)
  against a second free source of a different origin (not a copy or re-fit of the same record) before building and
  flags each disagreement on the page; when none is reachable, the page says the check is not independent (promoted
  from an experiment: since Element Timeline no review found an unflagged wrong data value).
- Before review, each builder lists its status words and checks each against evidence: "Fixed" needs a test that
  failed before and passes now; "first", "only", "never", "keeps", "intact" are checked against the piece table,
  code or a test; "published", "agree"/"agreement" and "every"/"all"/"any" need a fetched source or a test ("any"
  names the range the code supports), and a search-summary or memory value says so where shown; "N checks against
  X" counts only checks that compare with X; a licence names code and data separately; each statistic says what was
  counted and what chance it means; known limits and roadmap lines match this run's measurements; "now" is cut from
  text that stays up. A name for what a mechanism is ("motion work") is checked against the drawn or computed
  geometry, and each test's expected value names its source or derivation. After any later edit, re-read the words
  describing the edited thing (10-18 09:22 "15 checks" when 4 were; 20:21 "motion work" with the hour wheel off the
  minute axis, a Metonic test target off by 10x).
- Studio tables and pages have no subject-tag field: briefs never ask for a tag (15:30: the keeper looked, found none).
- Commit messages leave one blank line between the body and the `Co-Authored-By` / `Claude-Session` trailers; with a
  single newline git folds the trailer into the subject, and the profile README showed it (2026-10-16 14:26).
- After the fetch, the chair launches the toy, piece and game builders in parallel, each in its own folder, and the
  refiners and testers as each builder hands back (promoted from an experiment: five runs, 17:00 to 02:00, no builder
  touched another's files; the run's length is still set by the game step, not by the other builders).
- Before review, the chair runs, in each of the three repositories, `git -C <repo> diff origin/main | grep -inE
  '^-[^-].*(untested|not tested|unverified|not independent|clocks agree|from memory|unknown)'` and restores each
  printed caveat or names it in the review brief with evidence it is no longer true; a caveat the record (CHANGELOG,
  Direction) contradicts is reworded, not copied (promoted from an experiment: six runs, no dropped caveat in review).
  In the same step `git -C <repo> diff --stat origin/main`: any file emptied or mostly deleted that the brief did not
  ask to remove is restored from origin/main and its changes re-applied (10-18 09:22: game/ROADMAP.md at 0 lines).
- The game tester appends each file's pass count to `tester.log` in its scratchpad as it gets it; the chair's brief
  names that path and, without a full hand-back, credits only what the log shows and lists the rest as not re-run
  (promoted from an experiment: six runs, no results lost outright; 10-18 00:48 the slow tester logged 5 files).
  Before review the chair checks every failure in that log or hand-back, and every builder fail-then-pass, is named
  in the CHANGELOG **Tested:** or **Unverified:** line, adding any missing (promoted: six runs; the one must-fix,
  09:22, came when it was skipped; 16:52 it caught a missing tester line).

## Experiments

Trials in progress. Format: `- (started YYYY-MM-DD) the habit. Check: what would show it helped.`

- (started 2026-10-18) The game builder breaks each new test check once (a scratch edit) and sees it fail before
  counting it. Check: no tester or review finds a game check that passes vacuously (17:58: flame flood check did).
- (started 2026-10-18) A new game test that counts a value (points, items, health) pins the clock of, or turns off,
  every other system that can change that value (shades, timers, mobs). Check: no tester rerun finds such a test
  flaky (21:55: welcome.test failed 1 in 4 because a shade deed took the help point; fixed by pinning shades' clock).

## Proposals for the owner

Changes only the owner can make to the routine. The owner can delete a line once it is handled.

- (2026-10-15) `tools/security_check.py` should also scan untracked files git does not ignore (`git ls-files
  --cached --others --exclude-standard`); an uncommitted `new Function` in game/tests/talk.test.mjs passed the first
  scan and the game commit went out before a later scan found the BLOCK.
- (2026-10-15) `tools/keeper_check.py` should check that every STUDIO.md and README table row has as many cells as
  its header (a broken STUDIO row, 15:20, passed it; review only), skip `<title>` inside `<svg>` and match "X and Y"
  case-sensitively (23:27: both false positives).
- (2026-10-15) The studio's CLAUDE.md says "Add a journal entry before you finish", and every subagent reads it; it
  should say only the chair adds the entry. Keeper, toy refiner, fixer, toy builder, profile agent (twice) and a
  fix-up agent (10-18 04:22, an unrequested stub the chair replaced) have all written their own.
- (2026-10-16) A time budget for the game step, set in the routine. Game builder 50-150 min a run, 4 h at 10-18 16:52,
  mostly the 5x loop, while the others waited. Options: the builder loops only files its increment touched and a
  Sonnet tester (found a flake the builder passed 5/5, 04:22) the rest, or a script runs loop.mjs in the background.
  Mid-run stop-hook reminders about uncommitted changes are noise (the chair commits at the end).
- (2026-10-16) Stop runs from overlapping and cap a run's wall-clock (about 2 h). Runs collided ten times (05:38 to
  21:55, which lost about 30 min to another run's milestone 33), dropping up to 3 h of game work and ~2.3M tokens. Fix the schedule (at least 30 min gap), or push a
  `claim/<milestone>` branch at start; a run finding a claim under 4 h old skips the game. Start on `main`.
- (2026-10-16) `tools/game_patchnotes.py` splits game/CHANGELOG.md on `### ` only, so an entry under `## ` vanishes
  from the patch notes (07:20, review only), and it drops every paragraph not labelled Players can now / Fixed /
  Unverified (15:30: a known limit). It should stop on any other heading level and print each dropped paragraph.
- (2026-10-16) The sandbox proxy blocks Wikidata, OpenStreetMap, Nostr relays, BitTorrent trackers and some data
  sites (10-18 04:22: HTTP 403), so second sources fall back to search summaries and online play is untestable in a
  run. Allow-listing a few read-only endpoints would help.
- (2026-10-16) POSTS.md holds 30 unposted, unticked drafts; each run the profile agent writes new ones and deletes
  the oldest unread. Tick posted drafts, or write a new draft only when one is ticked (or one per day).

## Changelog

- 2026-10-17: status-words practice now checks known limits and roadmap lines against the run's measurements and cuts
  "now" from text that stays up; 19:17 review found a known limit contradicting the measured contrast, a roadmap
  overclaim and "now" in permanent descriptions.
- 2026-10-17: game-loop proposal shortened and updated (game builder about 150 min, stop-hook noise all run); the
  overlap proposal now asks the start check to find the studio on main (HEAD detached at 19:17 start). Not acted on:
  the fixer's hand-back said only "placeholder" (one occurrence; the chair verified by grep and re-ran checks);
  tester-log experiment not judged (two runs since it started, report arrived both times, 24/24 files at 19:17);
  scanner still sees only tracked files (proposal stands).
- 2026-10-17: fetch practice now also fetches when any builder hands back and before the game tester, and stops the
  game step when main's game/ moved since the start sha; at 20:50 the chair fetched only at start and 118 min of
  game work was lost to the 19:17 run's milestone 24 (7656c71), caught only by the pre-commit fetch.
- 2026-10-17: vigil-game skill now has the builder re-fetch before the 5x loop and before hand-back (testers before
  starting) and stop at once if main's game/ moved (same evidence).
- 2026-10-17: overlap proposal updated with the third occurrence and a concrete claim-at-start design. Not acted on:
  dawn test 5/5 builder vs 2/3 tester (work discarded; flaky-test practice already applies); review's "births fall"
  slip (status-words practice); piece refiner's page-number check (refine skill working).
- 2026-10-17: vigil-game skill now has testers run one file per command, log each count to tester.log and never send
  an interim hand-back; at 21:39 the Haiku tester waited about 20 min on one 24-file batch, handing back interim
  reports. Tester-log experiment not judged (three runs; the log gave all 24 counts this time).
- 2026-10-17: status-words practice now asks a fetched source or test for "published", "agreement" and "every"/"all",
  and labels search-summary or memory values where shown; 21:39 review made ten wording fixes, with all fetches failed.
- 2026-10-17: overlap proposal shortened and updated with a fourth concurrent push (21:39 rebase conflict, solved by
  keeping both sides and rerunning site_meta). Not acted on: stop-hook noise while waiting (game-loop proposal stands).
- 2026-10-17: vigil-keeper skill now names keeper_check's two false positives (SVG `<title>`, any-case "x and y") and
  has the keeper report them instead of changing the piece; at 23:27 the chair edited the piece to quiet them.
- 2026-10-17: keeper_check proposal extended with both fixes to the checker (same evidence).
- 2026-10-17: Direction's libraries bullet says in-run CDN and Wikipedia fetches fail and npm tarballs and GitHub raw
  work (23:27). Not acted on: review's three wording fixes (Vincenty/Karney, 25 for 24 tests, a flake count; the
  status-words and counts practices already ask); tester-log experiment not judged (five runs, full 24/24 report,
  2037 checks this time); game builder about 44 min; no overlapping run.
- 2026-10-18: tester-log experiment judged (six runs) and promoted to Practices: no tester results were lost outright;
  at 00:48 the slow tester's log let the chair credit 5 files. Experiments now empty.
- 2026-10-18: vigil-game skill now credits past online tests as the record says (the owner, before milestone 2);
  00:48 review's must-fix: the game page said the builders did an early online test.
- 2026-10-18: game-loop proposal updated: the Haiku tester logged only 5 of about 25 files (Sonnet tester or a
  scripted loop.mjs run proposed). Not acted on: CHROME unset again, set by hand (practice exists); piece filter
  failed 9 audio cases, fixed by its own tests; profile pruned 3 drafts at 30 (proposal stands); toy avoided the
  sixth-press payoff as briefed; review's four wording notes (status-words practice).
- 2026-10-18: new experiment, the chair checks before review that every tester and builder test failure is named in
  the CHANGELOG; 04:22 review's must-fix found the tester's report.test flake missing although vigil-game step 4
  already asks testers to add it (third such miss).
- 2026-10-18: game-loop proposal rewritten: builder about 90 min, mostly the 5x loop (spares.test about 110 s a run,
  22 files), with a split of loop work between builder and the Sonnet tester, who found a flake the builder passed 5/5.
- 2026-10-18: Proposals compressed to bring the file under about 150 lines above the changelog (was 157); journal
  proposal adds the fix-up agent's stub, proxy proposal the outbreak 403, POSTS proposal this run's trim to 30. Not
  acted on: "connect more reliably" overclaim and six wording notes (status-words practice already asks).
- 2026-10-18: vigil-advisor skill now ends the brief with the start sha and opens the review with a fetch and
  `git log <sha>..origin/main`, and flags counts that include info-only lines and doc text from memory; at 05:38
  another run's milestone 28 (pushed 02:22 UTC) was found only at push, about 50 min of game work was dropped, and
  review caught a "10 checks" that counted an info line and game text wrong from memory.
- 2026-10-18: fetch practice ties the start sha to the brief and adds the 05:38 loss; overlap proposal updated (fifth
  overlap, five-file conflict). Not acted on: profile deleted 2 drafts at 30 (POSTS proposal stands); CHANGELOG-failures
  experiment not judged (two runs); matching page, Bell 55 and all game tests rc=0 went as briefed.
- 2026-10-18: pre-review caveat-grep practice now also runs `git diff --stat origin/main` and restores any file
  emptied or mostly deleted without the brief asking; at 09:22 game/ROADMAP.md reached 0 lines (game builder or lobby
  fixer) and only the chair's own diff --stat caught it.
- 2026-10-18: status-words practice now asks a source or test for "any" (naming the supported range) and counts
  "N checks against X" only for checks that compare with X; 09:22 review's must-fixes were "15 checks against
  astronomy-engine" (4 were) and "any date" for 1800 to 2199.
- 2026-10-18: vigil-security skill makes every non-noreply e-mail in an added or changed file a BLOCK, fixed or left
  out, never report-only; at 09:22 a vendored author's address was flagged only as report and the chair stripped it
  (second time after 10-17 02:00). Not acted on: CHANGELOG-failures experiment not judged (three runs; skipped this
  run, and review's third must-fix was the missing tester-failure line, so the miss came from not applying it);
  game builder about 2 h with lobby/shadows flakes under load, not reproduced later (game-loop proposal stands);
  local main diverged (20 old local commits), reset to origin/main (overlap proposal's start check covers it);
  parallel builders worked.
- 2026-10-18: fetch practice now has a background loop fetch every 5 min while the game builder works and stop it
  as soon as origin/main gains a game/ commit; at 09:31 the builder's own fetches (start, before the 5x loop) missed
  another run's milestone 29 and about 45 min (~2.3M subagent tokens) of game work was dropped at the end.
- 2026-10-18: vigil-profile skill now runs the README script with `python3 -B`, deletes stray bytecode, never edits a .gitignore and reports `git status --short`; at 09:31 the chair's `git add -A`
  committed a .pyc into the profile repository (removed in e7aec36).
- 2026-10-18: overlap proposal shortened and updated with the sixth overlap (second in 4 h, runs minutes apart, so
  the schedule may fire twice). Not acted on: profile agent found the 30-draft cap leaves no room for new drafts
  (POSTS proposal stands); CHANGELOG-failures experiment not judged (four runs); review's input max vs clamp must-fix
  and unsourced "careful" (status-words practice); toy, keeper, security 0 BLOCK and council went as briefed.
- 2026-10-18: vigil-piece skill now has the builder break each self-check's input once to see it fail, label checks
  that hold by construction and keep them out of tallies, and count the opening sentence's words; at 11:32 review
  found dragonfold's straight-through count 0 by construction and the refiner cut a 31-word opening to 21. Not acted
  on: fetch practice worked (fetched before each push, main did not move, nothing lost); CHANGELOG-failures
  experiment not judged (five runs; stone and watch failures named); review's journal must-fix was timing only (chair
  writes it last); game builder about 39 min of a 70 min run (game-loop proposal stands).
- 2026-10-18: CHANGELOG-failures experiment judged (six runs) and promoted into the tester-log practice: the only
  must-fix (09:22) came when it was skipped, and at 16:52 the chair added the missing tester line. Experiments empty.
- 2026-10-18: vigil-game skill now applies the 45-min time-box to flake-fixing milestones with `date` stamps per
  failure, and keeps tester.log in the scratchpad and the builder out of STUDIO.md; at 16:52 the builder ran about
  4 h, left a tester.log in the studio root and wrote a journal stub (chair removed both).
- 2026-10-18: game-loop proposal updated with the 4 h game step (16:52). Not acted on: review's four overclaims
  (citation "all rows", nearest-vowel count using memory rows, `both` docs "explains" for a weakened check, "made
  steadier"; status-words practice); 5 vowel rows from search summaries (proxy proposal); no overlap this run.
- 2026-10-18: vigil-advisor skill now fetches before the brief and takes the start sha, milestone and numbers from
  origin/main; at 17:58 the brief used an unfetched ref, the chair launched the game builder on milestone 31 without
  re-checking, and about 50 min of work was dropped when another run's 31 was found on main.
- 2026-10-18: new experiment, the game builder breaks each new test check once before counting it; the 17:58 tester
  found the flame flood check passed vacuously.
- 2026-10-18: overlap proposal and fetch practice evidence updated (seventh collision, 17:58); both and the game-loop
  proposal shortened to keep the file near 150 lines. Not acted
  on: refiners found the Pillow FS recipe and review one false comment (refine and status-words practices working);
  security 0 BLOCK; toy and keeper as briefed.
- 2026-10-18: fetch practice now fetches all three repositories right before launching each builder (a second game
  builder too); at 18:15 two game builders' work (about 3 h and 20 min) was dropped to other runs' milestones 31 and
  32, and the profile commit was redone because the profile repo had moved.
- 2026-10-18: vigil-game skill now has the builder fetch and check main with every time-box `date` stamp and at least
  every 30 min, and stop a flake-fixing milestone at about 45 min total; at 18:15 milestone 31 landed during a 3 h
  flake hunt and was found only at review. Not acted on: units/ dropped an untraced 12th row and labelled search-summary
  figures (status-words practice working); Crop 60 refiner fixed 2 small bugs; overlap proposal stands (eighth case);
  break-checks-once experiment not judged (one run).
- 2026-10-18: status-words practice now checks a mechanism's name against the drawn geometry and asks each test's
  expected value for a source or derivation; 20:21 review found "motion work" with the hour wheel off the minute axis
  and a Metonic test target off by 10x, which builder, refiner and tester all missed.
- 2026-10-18: vigil-keeper skill now copies online-play status from game/CHANGELOG and Direction and never implies a
  later milestone was played online; 20:21 review corrected the keeper's online-play overclaim (game builder 00:48 too).
- 2026-10-18: overlap proposal updated with the ninth collision (20:21 began 3 min after the last run ended; its
  profile push forced a reset and redo) and a 30 min gap. Not acted on: "never covers" true only at the centre and
  memory facts stated as fact (status-words practice); game builder about 88 min (game-loop proposal stands);
  break-checks-once experiment not judged (two runs; glitter checks each broken once, none vacuous in review).
- 2026-10-18: vigil-game skill now has the builder fetch and check main at least every 10 min (was 30); at 21:55
  another run's milestone 33 was caught only at the builder's 30-min fetch and about 30 min of work was dropped.
- 2026-10-18: new experiment, game tests that count a value pin or turn off every other system that can change it;
  at 21:55 the tester's rerun found welcome.test failing 1 in 4 because a shade deed took the point.
- 2026-10-18: overlap proposal updated with the tenth collision (21:55) and shortened. Not acted on: review's five
  wording fixes ("two" for "at least two", false UI note, docs lagging milestone 34, "no rank", printed-sheet
  overclaim; status-words practice); fixer's stray journal stub (CLAUDE.md proposal stands); profile dropped the 3
  oldest unticked drafts at 30 (POSTS proposal stands); break-checks-once experiment not judged (three runs).
