---
name: vigil-game
description: Grow Vigil's multiplayer online RPG in game/, one increment per run, forever. Founding mode (no game/DESIGN.md yet, or a roadmap review is due) researches the stack and writes the design; normal mode builds the next roadmap item and proves multiplayer still works.
---

# The game

The owner asked for a multiplayer online RPG, built piece by piece and evolving without end. It lives in
`game/` in vigilstudio.github.io and is played at https://vigilstudio.github.io/game/. You never commit or push.

## Hard rules (these never change, whatever the roadmap says)
- **Multiplayer is the point.** Every feature is designed for several players in the same world. A change that only
  works for one player is not done.
- **No server, no accounts, free.** GitHub Pages serves static files only. Players connect peer to peer (WebRTC or
  similar) through free public signalling that needs no sign-up and no API key. No paid or hosted backends, no
  databases, no keys in the code.
- **No free text between players.** Players never see anything another player typed: no chat box, no custom names,
  no signs or notes. Talk is preset phrases and emotes; display names are generated (for example "Grey Heron 41").
  This keeps a public game run by an AI safe for strangers. Never add a feature that breaks this.
- **Honest about what it is.** The landing area says plainly: made by Claude, an AI model (Vigil is not an Anthropic
  project); peer to peer, so it works when other players are online in the same room and there is no shared saved
  world on a server; your character is saved only in your own browser; like a video call, peer to peer connections
  let other players' browsers see your network address, and so do the signalling relays and connection (STUN)
  servers it uses; the game itself collects nothing (never write "nothing is collected" without that qualifier).
  The world is generated from a seed, so everyone sees the same world. It also says plainly whether online play over
  the real relays has been tested, and every limit it states (players per room, range) comes from a constant in code.
  Any past online test is credited as the record says (the owner, between a phone and a computer, before milestone
  2), never to the builders or a run (2026-10-18 00:48: the page said the builders did it, review must-fix).
- **Secure against other players.** Every message from a peer is hostile until validated: known kind, expected
  fields, numbers finite and clamped, no free strings. Cap message size, peers per room and messages per second per
  peer; drop the excess. Never build HTML from peer data, never navigate, fetch, import or open anything a peer named.
  game/index.html keeps a Content-Security-Policy meta tag (scripts from 'self', no unsafe-eval, object-src 'none').
  The vigil-security skill checks all of this every run.
- **Testable without the internet.** Networking goes through one transport interface with two implementations:
  the real peer-to-peer one, and a local one (BroadcastChannel between pages of the same browser) used by the tests.
  Pick it with a URL flag such as `?net=local`.
- Static files only, free and open-source libraries with pinned versions (cdnjs, jsdelivr, unpkg, esm.sh, or
  vendored with their licence). Works on phones (touch controls) and desktops (keyboard), light and dark page
  chrome, no console errors. Performance matters: aim for smooth play on an ordinary phone.

## The look evolves too (the owner's wish)
There is no limit on the graphics. The game's look should grow over time as much as its gameplay: better tiles and
terrain, lighting and shadows, animation (walking, water, foliage, lantern flicker), particles and weather, a sky
and a day-night turn, character art, effects for gestures and actions, sound if it fits. A big step is allowed too:
a move to WebGL, three.js or 3D, a new art direction, when a roadmap review decides it serves the game.
- **Keep the roadmap mixed.** ROADMAP.md always holds visual items next to gameplay items, roughly one in three
  increments being mainly about the look. If it has none, the next run adds some.
- **One step at a time.** Each visual increment is a clear improvement that still works on an ordinary phone (aim
  for 60 fps, never below 30) and keeps the night-island mood readable: players, lanterns and paths always easy to
  see, enough contrast, `prefers-reduced-motion` turns big motion down.
- **Own or free art only.** Draw it in code (procedural, canvas, shaders, SVG), make it with free tools, or use assets
  with a free licence (CC0 or similar) whose source and licence are written in DESIGN.md. Never copy art from another
  game. Keep downloads small; the game should still start quickly on mobile data.
- **Show it.** Save before-and-after screenshots at 375px and 1100px in the tests' output, look at them, and say in the
  patch note what players will see differently.

## Founding mode
Use it when `game/DESIGN.md` does not exist, or when CHANGELOG.md shows 10 increments since the last roadmap review.
1. Research (web search is allowed; some sites may be blocked in the sandbox, note what failed). Compare options for:
   rendering (three.js is the owner's suggestion; choose something else if it serves the game better, for example a
   2D engine, Babylon.js or PlayCanvas's open-source engine), peer-to-peer networking with free no-sign-up signalling
   (for example Trystero over Nostr, BitTorrent trackers or MQTT; PeerJS's public server; y-webrtc), and how shared
   state is kept consistent between peers (authority, conflict rules, late joiners).
2. Write `game/DESIGN.md`: the vision in a paragraph (setting, what players do together, why it fits Vigil and the
   night shift), the chosen stack and why, the options rejected and why, the network model, the safety rules above,
   and **whether the real signalling was reachable from the sandbox** (try it once and write the result), so later
   runs know whether online play can be tested or must be marked unverified.
3. Write `game/ROADMAP.md`: milestones in order, each small enough for one run, the next one marked. Milestone 0 is
   presence only: two players in the same room see each other move. Later milestones grow the RPG: a world to
   explore, gathering, crafting, quests, combat or co-operation, trading, progression, places that change when many
   players work together. Leave room for the game to surprise you.
4. Build milestone 0 if time allows. A roadmap review rewrites ROADMAP.md from what was learned and notes it in
   CHANGELOG.md; it does not throw away working features.

## Normal mode (every other run)
1. First run `git -C <absolute path to vigilstudio.github.io> fetch` and read `game/ROADMAP.md` and
   `game/CHANGELOG.md` as they are on `origin/main`; if the
   next item has already landed there, build the next unmarked one on top of main, never a second copy (2026-10-16
   01:45: another run pushed crafting and beacons while this one built crafting, and all its game work was dropped).
   The studio is a git repository even when your session says the working directory is not one; never skip this
   step for that reason, and if the fetch truly fails, say so in your report (13:10 run: "not a repo", fetch skipped).
   Then read `game/DESIGN.md`, `game/ROADMAP.md` and the last entries of `game/CHANGELOG.md`. Note the
   `origin/main` sha; fetch again before the 5x loop and before handing back (testers: before starting), and if
   `git log <that sha>..origin/main -- game/` prints anything, stop and report it to the chair at once instead of
   finishing (2026-10-17 20:50: another run pushed its milestone 24 mid-step; 118 min of builder work was dropped).
2. Build the next roadmap item completely, as one coherent increment. Keep the code organised in modules so later
   runs can find their way (a short map of the files lives in DESIGN.md).
3. Tests: `game/tests/` holds a Playwright script that opens two pages in one browser context with `?net=local`,
   joins both to the same room and checks they see each other (and, from then on, whatever the new feature shares
   between players). Add a test for the new feature, run all tests, and run
   `node <studio>/tools/page_check.mjs game/`. Fix everything that fails. Run each test file 5 times in a row
   (background loop) and report the pass count per file ("world 5/5"); one green run is not a pass. Any failure in
   those runs is a bug until its cause is found in the code or the log: never call it a network or WebRTC flake
   without evidence (presence failed 1 in 5, was dismissed as flake, and was a real bug stranding about 1% of
   spawns). Nor call a failing test "stale" before running `git log -S '<function or flag it uses>' -- game/` to
   see whether a commit removed what it tests (2026-10-16 03:15: beacon 0/5, guessed stale; commit 2fc04d5 had
   silently dropped the transport watchdog). Run the 5x loop once, after the code is final, one file at a time, with no stress harness, build or
   other browser running alongside; a failure seen only under extra load is named as such, then re-checked alone
   (2026-10-16: loops overlapped stress runs, failures came from load, and the game step took about 2 h 40 min).
   Report the loop's own count lines, never output cut by `tail`. Every test file runs at least once in every run,
   roadmap reviews included; when time is short, cut the repeats (5x to 1x) before cutting a file, and list any file
   not run as "not run" in the report and CHANGELOG (2026-10-16 11:20: the builder skipped 5 files for time and
   reported none of them; the tester found beacon 0/3). Hand the report back once, as soon as the work is done, and
   only with a count for every file; never send an interim hand-back. Testers run one file per command, never one
   batch command for all files, and append each count to the `tester.log` the chair's brief names as it arrives
   (2026-10-17 21:39: a 24-file batch at about 50 s a file kept the Haiku tester waiting about 20 min, sending
   interim hand-backs). Builders and testers alike run each file's loop as one foreground command with a
   timeout of at most 10 minutes, never under `nohup` or `&` or as a detached script whose end they cannot see, and
   never poll or sleep between checks (2026-10-16 22:52: the Haiku tester started a nohup script, handed back
   incomplete twice and ended with no report; the chair had to read the logs). Time-box a failure you cannot explain: after about
   45 minutes, stop, keep the failing check and its counts in the ROADMAP and report it to the chair as unexplained,
   instead of chasing it longer (2026-10-16 01:45: one gather/craft handshake race took about 3 h and stayed
   unexplained). This holds when the milestone itself is fixing flakes: run `date +%H:%M` when you start on each
   failure and again before each new attempt, and name each failure's minutes in the report (2026-10-18 16:52: a
   "steadier tests" milestone took about 4 h with no time-box kept). With every such `date` stamp, and at least
   every 30 minutes of any milestone, also run the step-1 fetch and `git log <that sha>..origin/main -- game/`, and
   stop as step 1 says on any output; on a flake-fixing milestone, at about 45 minutes in total, stop fixing, run
   every file once and hand back with the unexplained ones named (2026-10-18 18:15: another run's
   milestone 31 landed while this builder spent about 3 h on flakes, and was found only at review). Write tester.log and every other scratch file
   in your scratchpad, never in a repository, and never write STUDIO.md or a journal entry: only the chair does
   (16:52: a tester.log in the studio root and a journal stub, both removed by the chair). A check that
   reads pixels or positions of anything drawn moving or eased (dots, sprites, camera) searches a small window or
   waits until it settles, never one exact pixel (world.test read one minimap pixel at the reported position while
   the dot is drawn eased, failed about 3 runs in 10 and passed the tester's single run). When a feature holds or
   moves something a player owns (items, gifts, progress), list every cap, queue and timeout it uses and test each
   one when full or expired, including a peer leaving midway: a full list refuses new entries, it never drops an old
   one. In a multi-step exchange (offer, accept, commit), re-check every cap at each step and test a cap that fills
   between steps (milestone 12: a stack filled between offer and accept was not refused at accept; tester only). Write "never lost" or any other absolute promise only when a test covers every one of those paths (milestone
   4: a capped expected-gifts list silently dropped its oldest entry and the page said "never lost", review only).
4. Update ROADMAP.md (mark the item done, choose and mark the next), the milestone number and summary in
   `game/README.md` (it still said "milestone 5" after milestone 6), and add a CHANGELOG.md entry headed
   `### YYYY-MM-DD · <short version title>`. Its bullets **Players can now:**, **Also fixed:** (if any) and
   **Unverified:** become the public patch notes, so write them for players: plain words, what they can do and see,
   no file names, protocols or test details. A known limit players could meet goes in **Unverified:**; the tool keeps
   only those three bullets, so any other paragraph never reaches the patch notes (2026-10-17 15:30: the
   set-aside limit, review only). Put technical detail in separate bullets such as **Network:** and
   **Tested:**, which stay in the changelog only. When the increment rewrites a file, `git diff` it against the
   previous version and name every removed behaviour, flag or hook in the CHANGELOG (or put it back); DESIGN and
   patch notes claim only what `grep` finds in the code now (2fc04d5 dropped the watchdog and `?mute=` unannounced,
   and DESIGN and the patch notes still claimed it, review only). A restore or fix with nothing for players still
   gets its own CHANGELOG entry. Past CHANGELOG entries are a record: change one only to correct a false statement,
   keep every caveat in it, and read the whole paragraph around any line you insert into DESIGN or another .md file
   (2026-10-16 17:00: a v0.14 note lost "if their device clocks agree", and a DESIGN line landed mid-sentence; review
   only; 19:32: the same caveat was dropped again). Before handing back, run
   `git -C <studio path> diff origin/main -- game/CHANGELOG.md | grep '^-[^-]'`: it must print nothing, or each
   printed line is named in the report with the false statement it corrects. Write the **Tested:** line last, from
   the final run's own counts, and rewrite it after any later fix (19:32: review found a stale test line). When a feature's status changes (missing, back, removed), `grep -rn` its name
   across game/*.md and game/index.html and fix every hit before reporting (2026-10-16 04:38: the watchdog restore
   had no CHANGELOG entry and a stale paragraph stayed on game/index.html; review and tester only).
   A tester (or anyone after the builder's hand-back) who changes a test or code, or finds a new problem, adds it to
   this run's CHANGELOG entry (**Changed code:**, **Unverified:**, **Tested:**) before handing back, including in
   **Tested:** every file that failed once and passed on rerun, with its failing check (2026-10-16 21:04: the
   world.test fix and a 0.9 s stall; 2026-10-17 15:30: the `both` and `living` flakes; all review only).
5. Run `python3 tools/game_patchnotes.py` (from the studio root). It rebuilds the "Patch notes" panel on
   game/index.html, one collapsible version per changelog entry, newest open. Never edit that panel by hand.
   Keep the page layout: patch notes above the game info; "What this is, plainly" hidden until someone clicks
   "About this game" (id="about", shown with CSS :target); the one-line network-address notice in the lobby stays.

## Report (at most 8 lines)
Mode, what players can now do, files changed, test results, whether online play was tested, the next roadmap item,
and one plain sentence for the Workbench line describing the game as it is now (no change notes such as "restored"
or "now has" in it; those go in the CHANGELOG; 2026-10-16 04:38 review). The sentence ends with the online-play
status as the CHANGELOG states it (for example "online play over public relays untested"); 21:04 review found the
summary line had lost it. Start from the Workbench's current game sentence and keep every feature it names unless the
code removed it (10-17 03:48: the clock note was dropped and the chair restored it). Before handing back, re-read every
claim you added to DESIGN, ROADMAP, the CHANGELOG and code comments: an absolute ("never", "once", "every") names what
showed it ("in local tests"); a cap or number is copied from the code constant it names, and a design line describes
the code, not the intent (03:48 review: "never twice" with no scope, "stay MAX_PEERS" for an uncapped `links` map,
a design line stated as fact, a tracker comment that no longer matched the code).
