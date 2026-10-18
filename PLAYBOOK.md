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
- The chair runs `git fetch` and checks `origin/main` before launching the builders, again whenever any builder
  hands back, before launching the game tester, before writing any status wording (journal, game notes, profile
  drafts) and before each commit; if main's `game/` or piece table moved since the start (`git log <start
  sha>..origin/main`, start sha from the brief's last line), the game step stops and the advisor redoes that part of
  the brief. Push only in its own command after reading test and scan output (10-15 12:40: push after a failed test;
  10-16 08:40, 10-17 20:50, 10-18 05:38: about 70, 118 and 50 min of game work lost, seen only at the final push).
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
  code or a test; "published", "agree"/"agreement" and "every"/"all" need a fetched source or a test, and a value
  from a search summary or memory says so where it is shown; a licence names code and data separately; each
  statistic says what was counted and what chance it means; a known limit or roadmap line is checked against this
  run's own measurements; "now" is cut from text that stays up. After any later edit, re-read the words that
  describe the edited thing (promoted from an experiment; review still finds some each run: 19:17 a known limit
  against the measured contrast; 21:39 ten notes, such as "published" for memory and "agreement" for a non-check).
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
- The game tester appends each file's pass count to `tester.log` in its scratchpad as it gets it; the chair's brief
  names that path and, without a full hand-back, credits only what the log shows and lists the rest as not re-run
  (promoted from an experiment: six runs, no results lost outright; 10-18 00:48 the slow tester logged 5 files).

## Experiments

Trials in progress. Format: `- (started YYYY-MM-DD) the habit. Check: what would show it helped.`

- (started 2026-10-18) Before review, the chair checks that every failure in the game tester's hand-back or
  tester.log, and every fail-then-pass the builder reported, is named in this run's CHANGELOG **Tested:** or
  **Unverified:** line, and adds any missing one. Check: no review must-fix for a missing test finding in 6 runs.

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
- (2026-10-16) A time budget for the game step, set in the routine. Game builder about 50-150 min a run (10-18 04:22:
  about 90 min, most of it the 5x loop over 22 files with spares.test about 110 s a run, while the other roles
  waited). Options: the builder runs the 5x loop only on files its increment touched and the tester (Sonnet, which at
  04:22 found a report.test flake the builder had passed 5/5) runs the rest, or a script runs loop.mjs over every file
  in the background. Stop-hook reminders about uncommitted changes are noise mid-run (the chair commits only at the
  end); the routine could turn that hook off until then.
- (2026-10-16) Stop runs from overlapping and cap a run's wall-clock (about 2 h). Another run pushed to main mid-run
  five times (10-16 01:45, 08:40, 10-17 20:50, 10-18 05:38 dropped up to 118 min of game work; 21:39 and 05:38
  conflicts across README, STUDIO, workbench, feed and sitemap). The chair could push a claim at start (`claim/<milestone>` branch or a
  dated lock file); a run finding a claim under about 4 h old builds the next milestone or skips the game. The start
  check should also find the studio on `main` (19:17: HEAD detached).
- (2026-10-16) `tools/game_patchnotes.py` splits game/CHANGELOG.md on `### ` only, so an entry under `## ` vanishes
  from the patch notes (07:20, review only), and it drops every paragraph not labelled Players can now / Fixed /
  Unverified (15:30: a known limit). It should stop on any other heading level and print each dropped paragraph.
- (2026-10-16) The sandbox proxy blocks Wikidata, OpenStreetMap, public Nostr relays, BitTorrent trackers and some
  published-data sites (10-18 04:22: HTTP 403, outbreak figures from memory), so second-source checks fall back to
  search summaries and online play cannot be tested in a run. Allow-listing a few read-only endpoints would help.
- (2026-10-16) POSTS.md holds 30 unposted drafts, none ticked, so each run the profile agent writes new drafts and
  deletes the oldest unread (again 10-18 04:22). Tick drafts you post, or have the routine write a new draft only
  when one has been ticked (or one per day).

## Changelog

- 2026-10-17: parallel-builders experiment judged (five runs, 17:00 to 02:00) and promoted to Practices: no builder
  touched another's files in any run; whether the build phase got shorter is unmeasured, the game step sets the length.
- 2026-10-17: vigil-security skill now greps all tracked and untracked files, vendored ones included, for e-mail
  addresses; the scan does not, and a third-party author's e-mail in a vendored library passed security and was
  stripped by the chair before commit.
- 2026-10-17: game-loop proposal for the owner rewritten: loop.mjs now exists (script half done), the time budget
  remains (Opus founding builder about 76 min of a 3 h 40 min run, tester's interim hand-back again). Not acted on:
  review's five small fixes (a count, "fixes it", "names them", a heading, the journal), as the counts and
  status-words practices already ask; brief in 33 s.
- 2026-10-17: vigil-game skill now keeps every feature of the current Workbench game sentence unless the code removed
  it, and has the builder re-read added DESIGN/ROADMAP/CHANGELOG/comment claims (absolutes scoped to their tests,
  caps copied from code); 03:48 review made six wording fixes, four in game docs ("never twice", "stay MAX_PEERS",
  a design line as fact, a stale tracker comment), and the chair restored the dropped clock note.
- 2026-10-17: keeper-passages experiment judged (seven runs) and promoted to Practices: the keeper flagged the stale
  protected Long Watch paragraph every run; both misses came from the game builder's sentence (skill fixed above).
  Caveat-grep experiment not judged (three runs).
- 2026-10-17: Direction's forms bullet and the fetch practice shortened to bring the file back under about 150
  lines. Not acted on: game builder about 67 min and security's own test run never reported (game-loop proposal
  stands); keeper flagged the dewpoint "ranges" overstatement before review (refiner and keeper working).
- 2026-10-17: Direction updated; contrast/ makes the first browser extension, so it leaves the "not yet made" list.
- 2026-10-17: vigil-piece skill now forbids a title copied from the brief's label, has access words list every
  manifest permission, puts the main unverified caveat in the one-liner and keeps weak sources out of an agreement
  tally (or counts them); "Subject Colour Contrast", "activeTab only" (copied by the keeper), the missing install and
  search-summary caveats and two weak rows in the tally were all review only. Not acted on: game builder about 62 min
  and thin tester/security hand-backs (game-loop proposal stands). Caveat-grep experiment not judged (four runs; only
  reflowed text this run).
- 2026-10-17: vigil-advisor skill now has the brief name a fallback for any check that needs a fetched page; at
  08:32 the brief's 10-row published-table comparison was impossible (every fetch failed), the piece builder stopped
  and asked, and the chair chose five search-summary figures labelled "not done" (a round trip; dewpoint and contrast
  hit the same block). Not acted on: `living` test flakes 1 in 5 (also on the previous commit), cause unfound and
  recorded in the CHANGELOG; three parallel builders worked again; review's two optional notes taken.
- 2026-10-17: game-loop proposal updated (game builder about 107 min, tester about 17; stop hook nagged about
  uncommitted changes mid-run). Caveat-grep experiment not judged (five runs; only reflowed sentences).
- 2026-10-17: Direction updated; A Loan's Slow Start adds personal finance.
- 2026-10-17: vigil-toy skill now checks for sideways scroll at 375 px after every press while playing; the toy
  refiner found one in Upload 0046 after the first press, which page_check (before any press) had passed.
- 2026-10-17: caveat-grep experiment judged (six runs) and promoted to Practices: no review found a dropped caveat;
  its hits were reflowed or rewritten sentences with the caveat kept. Experiments now empty; next reflector may add one.
- 2026-10-17: game-loop proposal updated (game builder about 50 min, tester about 33; stop-hook noise again). Not
  acted on: the tester's fix and its before/after counts reached the CHANGELOG only through review although
  vigil-game step 4 asks testers to add them (watch next run before editing the skill again); no overlapping run.
- 2026-10-17: vigil-refine skill now also greps digits in JS strings that reach the page, and the report gives each
  mechanical check's result or "skipped"; the toy refiner found the tag-stripped scan missed numbers typed in script,
  and the piece refiner skipped the number and duplicate-id greps and the headline-cause test without saying so.
- 2026-10-17: new experiment, the game tester logs pass counts to a scratchpad file as it goes; its 13:22 report never
  reached the chair, so its work went uncredited (thin or interim hand-backs in earlier runs too).
- 2026-10-17: Direction updated; Where the Current Goes adds electrical circuits. Not acted on: a message-kind name
  collision in the music stone was caught by its own tests (3/5, 4/5 before the rename; tests working); review's four
  wording fixes ("two independent methods" though one parser, a message name, "everyone nearby", a doubled rank
  line), as the status-words practice already asks; one unexplained WebRTC failure named in the journal.
- 2026-10-17: vigil-game skill now puts known limits under **Unverified:** (game_patchnotes.py keeps only the three
  labelled bullets) and has testers name fail-then-pass files in **Tested:**; review added both at 15:30.
- 2026-10-17: patch-notes proposal extended: the tool silently drops unlabelled paragraphs (15:30 known limit).
- 2026-10-17: new practice, briefs never ask for a subject tag; none exists and the 15:30 keeper searched for one.
  Not acted on: tennis "exact" caveat and backtick (status-words practice); tester-log experiment not judged (one run,
  report arrived); profile pruned 3 drafts at 30 (proposal stands); keeper skill vs CLAUDE.md journal (proposal stands).
- 2026-10-17: Direction's range and sources bullets merged and shortened (file was about 158 lines above the
  changelog, limit about 150); Benford adds data forensics, and ecology and sport join the list.
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
