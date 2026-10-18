# The Long Watch: roadmap

One milestone per run, in order. Each must work for several players at once and get a check in
`tests/presence.test.mjs` (or a sibling test). Mark the next one with **NEXT**. A roadmap review is due after
10 increments since the last one (last: 2026-10-17, milestone 26, after milestone 25; milestone 37 is the next one); it may rewrite everything below "done", never the
working features.

## Done
- **0. Presence.** Seeded island, generated names, six lantern rooms, walk with keys or a drag joystick, see
  everyone in the same room move, leave and timeout handling, local and real (Trystero/Nostr) transports.
  (2026-10-15)
- **1. Gestures and preset phrases.** Five gestures (wave, bow, point, cheer, sit) and 16 preset phrases, sent as
  integer ids only (unknown ids dropped), bubbles with a fading timer, cooldowns enforced on both sides, edge arrows
  to off-screen players, per-peer rate limit, peer cap, Content-Security-Policy. (2026-10-15)

- **2. The island worth walking.** Seven landmarks from the seed (four old beacons, a ruined lighthouse, a jetty, a
  well), a minimap with every player, footsteps off by default (own and nearby players'), light that follows a shared
  eight-hour night, reduced-motion respected, a byte-size cap on incoming messages. (2026-10-15)
- **3. Gathering, shared.** 42 seeded spots of driftwood, reeds and oil berries; picking one hides it for everyone
  in the lantern until its seeded respawn (90 to 150 s); the lowest-id player is the arbiter for contested picks;
  late joiners get a snapshot; a new arbiter takes over when the old one leaves. (2026-10-15)

- **4. Inventory and giving.** The pack is saved in the player's own browser (every change at once); hand one
  item to a player within 3 tiles by offer, accept, then a commit and a receipt; an item is never copied; when
  anyone leaves or a page closes it waits "on its way" until the two meet again. (2026-10-15, local relay
  only)

- **5. Crafting.** Wicks and amber, jade and azure lanterns made from gathered items (ingredients are used up, never
  copied; a full stack refuses the craft and drops nothing); the lantern you hold sets how far your light reaches and
  glows in its colour, and every nearby player sees that reach drawn around you; the held lantern is told to the room
  as one number and saved in your own browser. Crafted things can be given since milestone 12. (2026-10-15, local relay only)

- **6. Beacons.** Four old beacons fuelled together: driftwood and oil berries are burned, each player's share is
  counted in a grow-only counter, a beacon lights at 12 fuel from at least two players and then lights a wide area
  for everyone; one player's share is capped at 16. Also the presence watchdog (a lost first `hi` is repeated).
  (2026-10-15, local relay only)

- **7. The living island (a look step).** Glints on the water and shore foam that washes in and out, swaying tree
  crowns, grass blades and reeds, fireflies round every lantern (more round coloured ones) and round lit beacons, a
  small sky strip with the moon crossing from dusk to dawn and stars that come and go with the dark, softer edges on
  coloured lanterns' light, `prefers-reduced-motion` freezes all of it, and a governor turns the extras down on a slow
  device. Drawn by each browser alone, nothing new is sent. (2026-10-16; frame rates measured only in headless
  Chromium without a GPU, not on a phone)
- **8. The keeper's notes.** Three notes a day from the seed and the date (gather some of one thing, make wicks or amber
  lanterns, burn fuel in one named beacon), shared by everyone in a lantern: each player's share is a grow-only counter, a
  note is done at its number with at least two players, one player's share is capped at one less than the number; late
  joiners get a snapshot; progress is not saved and starts again at 0 when the lantern empties and at 00:00 UTC.
  (2026-10-16, local relay only)

- **10. The lamplighter rank.** Five kinds of help (relighting a friend early, driving off a shade together, a gift that
  arrives, lighting a beacon together, finishing a keeper's note together) give a point each, saved in your own browser; the
  rank (0 to 4) is told to the room as one number and shown as a gold line over the name, a list suffix and gold marks on
  the lantern. Cosmetic only. (2026-10-16, local relay only)

- **9. The shades.** Waves of 0 to 4 slow hooded creatures (a pure function of the seed and the UTC clock, so nothing about
  where they are is sent) circle landmarks and snuff a lantern for 14 s; light-seconds put on a shade are a grow-only
  counter per player, a shade is driven off at 20 from at least 2 players (one alone adds at most 19), a friend's lit
  lantern on a shade holds it back, a friend nearby relights you, a lit beacon is safe ground. Drawn with a real figure
  (hood, eyes, arms, swaying hem, sparks where light burns it, a ring that fills). (2026-10-16, local relay only)

- **10 (as planned). Progression, small and shared.** Done 2026-10-16, local relay only. A "lamplighter" rank earned only by helping others: relighting a friend's
  snuffed lantern, light on a shade that is then driven off together, a gift that arrives, fuel in a beacon that lights
  with others, a keeper's note finished together. Counted and saved in your own browser; your rank (a small number)
  is told to the room and drawn as a trim on your lantern and a title beside the generated name (no text crosses the
  network, receivers clamp the number). Cosmetic only: a modified client can claim any rank, and the page says so.
- **11. Weather and the shades' sky (a look step).** Done 2026-10-16. Drifting mist and light rain from the seed and the clock (4-minute
  weather slots: about 45% clear, 30% misty, 25% rainy, easing over 40 s), a sky strip that clouds over in mist and rain and
  darkens under a violet-black cloud while a wave of shades is out; cheap on phones (cached mist sprite, one batched stroke
  for the rain, fewer at governor level 1, only a flat veil at level 0), still under reduced motion (no falling drops, mist
  stands still). Nothing is sent. `?weather=clear|mist|rain` pins it for tests. Frame cost measured only in headless Chromium.
- **12. Giving crafted things.** Done 2026-10-16, local relay only. Wicks and lanterns go through the same offer, accept, commit and receipt as
  gathered items (item numbers 3 to 6 added to the saved lists, so old saves read as before). Giving away the last lantern of the one in hand puts the
  plain lantern back. Every cap tested full and expired (receiver stack, receiver expected list, giver on-its-way list, 20 s offer, late accept,
  pack emptied between offer and accept), a peer leaving at each step, and each message dropped or either side restarted (`craftgive.test.mjs`).
- **13. A second way to find each other.** Done 2026-10-16, local servers only. Default path `auto`: Nostr first, BitTorrent trackers (Trystero's torrent strategy) if no relay opens in 7 s; the page shows which path connected; players meet only others on the same path. Tested against a Nostr relay and a tracker on 127.0.0.1; neither public path is reachable from the sandbox (HTTP 403 from the proxy), so public-relay and public-tracker play is untested. Was: When the Nostr relays cannot be reached, try a second free signalling path
    with no sign-up (BitTorrent trackers or MQTT through Trystero), say on the page which one connected, and test the
    fallback locally; record whether the public ones were reachable.
- **14. The long watch kept.** Done 2026-10-16, local relay only. When all four beacons in a lantern are lit at once, the ruined lighthouse lights for
    everyone there (a pool of light 14 tiles wide, two slow beams, a lamp at the top, a mark on the minimap) until the lantern empties. It is worked out by each browser from the
    beacon state it already holds; nothing new is sent. Shades keep out of the beam: one making for the lighthouse fades away as the beam grows, one passing through is held at its
    edge, and nobody inside the beam can be snuffed. Tested in `watch.test.mjs`; the rule holds if players' device clocks agree (shades are placed by the clock).
- **15. People (a look step).** Done 2026-10-16, local relay only. Figures have two feet that step in turn, a head that leans, and a lantern on a swinging arm; bow, wave, cheer, point and sit have their own poses. Drawn by each browser from the walking flag and gesture it already holds; nothing is sent. Reduced motion stops the walk cycle and lantern swing; gesture poses still apply. Waving raises a hand (as before); cheering lifts the head. Tested in `figure.test.mjs`.
- **16. Roadmap review.** Done 2026-10-16: this file rewritten from the CHANGELOG (see "Roadmap reviews"); a test loop runner
  (`tests/loop.mjs`) added for the builders' and testers' counts.
- **17. The clock check.** Done 2026-10-16, local relay only. Each browser tells the lantern its device clock (one number, `ck`)
  and shows a plain note naming the player whose clock differs most from its own by 10 s or more (`CLOCK_WARN_S`), because shades,
  weather, the night hour and the keeper's day all assume clocks agree. It corrects nothing; it only says so. Tested in `clock.test.mjs`.
- **18. One room across both paths.** Done 2026-10-17, local relay and tracker only. The default `auto` joins the lantern through the Nostr
  relays and the BitTorrent trackers at once; a peer heard on both counts once (the first link wins and is the one sent on, the
  second is kept in case the first drops and carries a small keepalive); the page says which paths are open. A Nostr-only and a
  BitTorrent-only player still do not see each other (nothing is relayed); both see every player on both. Tested in
  `both.test.mjs` with three pages (and a fourth) against a relay and a tracker on 127.0.0.1; public relays and trackers are
  unreachable from the sandbox, so online play stays untested.
- **19. The jetty's fishing.** Done 2026-10-17, local relay only. Cast from the jetty or any shore (F), press again when a fish bites (2 s, 3.5 s with reduced motion). Fish are a pure function of the seed and the clock
  (up to `MAX_FISH` 8 present at once round the jetty's end, a slot is `FISH_SLOT_S` 24 s); nothing about them is sent, so none is taken from anyone else. The only new message is `fl`, the tile of a player's float. Two players whose floats are at most
  `SHOAL_RANGE` 4 tiles apart draw a shoal of `SHOAL_FISH` 3 in for both (worked out by each browser from the two floats; fish of the shoal bite from `SHOAL_BITE_R` 2.6 tiles, so a shore with no fish gets bites only from a shoal). A catch is one lamp oil (item 7, saved in the pack,
  3 fuel in a beacon, can be given). Caps tested full: the lamp oil stack (999: the fish is let go, also when it filled between bite and press), the gift machinery for lamp oil (receiver stack, receiver expected list, giver on-its-way list, each also when it fills between offer and accept), a beacon share
  (5 oil make 15, the sixth is refused at the cap of 16; mixed items reach exactly 16), a lit beacon, a line's 45 s limit, a walk away from the float, a shoal that lapses after 12 s of silence. Tested in `fishing.test.mjs`; the fish positions agree between players only if their device clocks agree.

- **20. Shadows and flame (a look step).** Done 2026-10-17, nothing sent, so local tests cover all of it. Trees, rocks and the well, the beacons and the lighthouse throw a soft shadow away from the lights near them: every player's lantern (so another player's light moves a shadow on your screen too), lit beacons and the lit lighthouse (`js/shadows.js`: `shadowOf`, `keepDarkest`, `flameFlicker`; drawn by `drawShadows` in `js/render.js` under the crowns and the night layer). A light counts out to `LIGHT_SPAN` 1.15 times its radius; a shadow is at most `SHADOW_ALPHA_MAX` 0.5 dark. The governor allows `CASTERS_MAX` 0, 14 and 40 shadows at levels 0, 1 and 2 (level 2 adds a soft outer edge). Beacon flames, the glow of a lit beacon and the lighthouse lamp flicker; under reduced motion shadows are still drawn and flames burn steady. Measured in headless Chromium with software drawing (not a phone): the shadows add about 0.2 to 0.5 ms to a frame at 375 and at 1100 px with 40 shadows on screen (the CHANGELOG has the runs). `?shadows=off` leaves them out; `?look=plain` has none. Tested in `shadows.test.mjs`.

- **21. Where the others are.** Done 2026-10-17, local relay only. A seventh room, `lobby`: pages inside a lantern join it and answer a newcomer's question with their lantern number (`lr {r}`, numbers only); a page on the landing screen asks for 20 s only when its player presses the button, then shows how many answered per lantern, suggests the busiest lantern that is not full and calls it a guess. Caps and rate limits in `js/lobby.js`, tested in `lobby.test.mjs` (three pages in two lanterns and a fourth in the lobby, on the local transport and through a local relay). Public relays untested. Costs: pages in lanterns are also linked to each other in the lobby (a mesh of everyone online on the path; only 11 others are heard).

- **22. The music stone.** Done 2026-10-17, local relay only. A stone 2 to 3 tiles from the well plays one of 8 preset notes (`mn {n}`, a whole number 0 to 7, nothing else), heard only by players who turned Sound on (the old Footsteps button is now "Sound"); 3 notes a second per sender (burst 4) and one every 400 ms from yourself; a note counts only from a known player near the stone. When three different players each play a different note of the night's tune (3 notes from the seed and the night number, so it assumes device clocks agree) within 1.5 s, the stone glows for 20 s on every page that received those notes and each of the three earns one help point (rank deed `stone`, at most one every 30 s). Nothing is recorded or saved. Test: `tests/stone.test.mjs`.
- **23. Fair trades.** Done 2026-10-17, local relay only. One item for one item with a player within 3 tiles: a Trade panel, four new messages (`tro {t,i,j}` offer, `tra {t}` accept, `trn {t}` no thanks, `trx {t}` withdraw), and each half then travels as an ordinary gift (`cf`/`rc`, same number) so nothing is copied or counted twice. The offerer's item is set aside at once (saved `hold` list, `MAX_HOLD` 4, sharing the `MAX_OUT` 20 cap with gifts on their way) and goes back on a decline, withdrawal, timeout, the other player leaving or a page load; the accepting side re-checks stack, lists and caps at accept, the offerer re-checks at the commit and may still back out, and the accepting side keeps its item set aside until the offerer's half arrives. Limit: if the offerer never returns after an accept, that one item stays set aside (up to 4 can be locked by a modified client). Tested in `tests/swap.test.mjs`: 48 faults at the first eight messages, every cap full and filled between steps, a peer leaving at each step, floods.
- **24. Dawn and dusk (a look step).** Done 2026-10-17, nothing sent, so the network is unchanged; real phones untested. At hour 0 (dusk) and hour 7 (dawn) the whole map takes the sky's colour: the night layer's tint moves toward a cool blue at dusk and a grey at dawn (`WASH_MIX` 0.8 at full strength), the layer is up to 0.14 and 0.16 darker (`VEIL_ADD`), shadows are 0.35 longer at dusk and 0.7 longer at dawn (`SHADOW_STRETCH`), every lantern lays a warm pool on the ground (`GLOW_POOL` 0.40) so the lit area keeps its edge, and the sky strip has a glow band and a thin horizon line. `js/skyglow.js` (pure), drawn in `js/render.js`; `?look=plain` has none; reduced motion holds the horizon steady. Contrast measured on the canvas at dusk, midnight and dawn in `skyglow.test.mjs` (numbers in the CHANGELOG). Frame rates measured only in headless Chromium without a GPU.
- **25. Weather that matters a little.** Done 2026-10-17, nothing sent. In mist (names begin to fade above `mist` 0.12 and are fully faded from `MIST_NAME_MIN` 0.35 up, which includes rain) the name of a player farther than `MIST_NAME_TILES` (6) tiles fades out over `MIST_NAME_FADE` (2) more tiles, as strongly as the mist is thick; they stay drawn and on the minimap. In rain at the start of a shade slot (160 s) that slot's shades travel `RAIN_SHADE_SLOW` (0.2) slower, so a fifth less speed; one pace per slot, decided by `shadePaceAt(seed, slot)`, every browser whose clock agrees gives the same pace. The page prints both numbers from the constants. Known limits: a slowed shade's life is cut to fit its slot (it fades out a few seconds earlier than a dry one would); the weather and the slot clock are each browser's own, so players whose clocks differ may disagree about a shade's pace (the same caveat as the shades); the shades' own test and the watch test now pin `?weather=clear`. Real phones untested.

- **26. Roadmap review.** Done 2026-10-17: this file rewritten below "Done" from the CHANGELOG of milestones 16 to 25 (see
  "Roadmap reviews"); the dawn and dusk test run 15 times in a row (15/15); `tests/both.test.mjs` now prints both pages' links and
  link history when its link checks fail (it failed once this run, cause not found). Nothing players see changed.

- **27. A connection report.** Done 2026-10-17, local relay and tracker only. A "Connection" line and a "Copy connection report" button in the game panel, numbers only (`js/net/report.js`): per path relays or trackers tried, open now, never opened and opened-then-closed; players met, gone, linked on one or both ways; connections rebuilt; and the sentence that public relays are untested by the builders (`PUBLIC_PLAY_TESTED_BY_BUILDERS`, checked against the CHANGELOG by `tests/report.test.mjs`). No relay address, id or name reaches it. Where the browser refuses the clipboard the text is shown selected in a box. The owner test checklist is in DESIGN.md. Limits: failed WebRTC handshakes are not counted (rebuilds after silence are); a relay open for less than `SAMPLE_MS` 1000 is counted as never opened.
- **28. Spare relays.** Done 2026-10-18, local relays and trackers only; public relays untested (the sandbox cannot reach them). One list in `js/net/relays.js` (5 Nostr first choices equal to Trystero's own pick for this app id, 3 tracker first choices, 4 Nostr and 2 tracker spares; each entry names its source: the vendored Trystero list, or the builder's memory for `relay.damus.io` and `relay.primal.net`). Every socket's opens, failures (closed before opening) and closes after opening are counted (`js/net/sockets.js`) and shown in the report. When fewer than 2 sockets of a path are open 10 s after joining and no player is linked on that path, the spares are added (the room is joined again over the longer list; with a player linked it looks again every 5 s instead). Tested in `tests/spares.test.mjs` against a refused port, a server that never answers, one that opens and closes, and live test relays and trackers.
- **29. Footprints and wakes.** Done 2026-10-18, a look step (`js/tracks.js`). Every walker leaves fading footprints on sand and meadow and a spreading wake in shallow water, drawn by each browser from positions it already has; nothing is sent. Marks are capped per walker and in all; reduced motion keeps footprints and stops the wakes spreading; `?tracks=off` leaves them out. Details and frame cost in the CHANGELOG. Public-relay online play untested.

## Roadmap reviews
- **2026-10-16 (after milestone 9, 10 increments since the founding).** What the CHANGELOG taught: (1) every shared
  feature reused one pattern that has held up: positions and timings as pure functions of the seed and the UTC clock
  (nothing sent), and player contributions as grow-only counters per player seed with a cap below "done" and a
  two-player minimum; new items should reuse it before inventing another. (2) Canvas 2D is not the limit yet (5.5 ms a
  frame with the living look, shades 1 to 3 ms, headless and software-rendered), so no move to three.js or WebGL now;
  revisit when a look step cannot be done in 2D or a phone measurement says otherwise. (3) Connections cost the most
  time: half-open WebRTC links, the 57 s offer renewal and late joiners took several runs; online play over the public
  relays has never been reachable from the sandbox, so a second free signalling path is now on the list. (4) Each run's
  5-times test loop over ten files takes most of an hour; keep increments small. (5) Players can help one another in
  many ways now (gifts, beacons, notes, shades, relighting) but nothing remembers it: that is the next step.
  Rooms stay at 12 players (`MAX_PEERS` 11 others); no evidence yet that more are needed.
- **2026-10-16 (milestone 16, after milestone 15; six increments since the last review, held at 16 as the last plan
  said).** What the CHANGELOG of milestones 10 to 15 taught:
  (1) The pattern from the last review held again and grew: weather, the lighthouse and the figures send nothing at all
  (each browser works them out from state it already has), and the rank reuses one clamped number. But four features now
  carry the same caveat, "if their device clocks agree" (weather, shades, the lighthouse's beam edge; the keeper's day
  too). That caveat was written into every patch note and once dropped twice; the cheapest honest answer is to measure
  it in the game, so the clock check came first (milestone 17).
  (2) Testing is the cost that grows: 16 files, about 12 minutes for one pass of all of them (measured this run), so
  the 5-times loop was cut to once in four of the last six runs. Two failures in those runs were the tests' own timing
  (a background tab painting late in `talk`; the fallback test reading its first status text once before the page had
  painted it, seen this run), not game bugs. A loop runner with exact counts now exists (`tests/loop.mjs`); new tests
  should wait for a condition instead of reading once.
  (3) Online play over the public relays and trackers is still untested from the sandbox (HTTP 403 again this run for
  relay.damus.io, nos.lol and tracker.webtorrent.dev); only the owner's single test on an early version covers it. The
  fallback (milestone 13) splits players between two paths that cannot meet; that is the largest multiplayer gap left
  that code can close.
  (4) Most of the game needs two players at once (beacons, notes, shades, gifts, the rank). With few players online, a
  lone visitor finds little to do together and nobody to meet; items that bring players into the same lantern, and
  something worth doing while waiting, now come before more two-player rules.
  (5) Look steps (7, 11, 15) kept to one in three and stayed cheap in Canvas 2D; still no phone measurement, so the next
  look steps stay in 2D and each says what it costs.
  Rooms stay at 12 players (`MAX_PEERS` 11 others).
- **2026-10-17 (milestone 26, after milestone 25; nine increments since the last review, held at 26 as the last plan
  said).** What the CHANGELOG of milestones 16 to 25 taught:
  (1) The "worked out from the seed and the clock, nothing sent" pattern carried most of this stretch: shadows (20), dawn
  and dusk (24) and the weather's effects (25) send nothing, fishing sends one float tile (19) and the stone one note
  number (22). The clock check (17) measures the caveat they share; it does not remove it, and fish, the stone's tune and
  a rainy shade's pace joined the list of things players see differently when clocks differ.
  (2) Multiplayer reach is now the largest open problem. One room across both paths (18) and the lobby (21) each added
  links: a page in a lantern can now hold a link per peer per path plus a lobby link to everyone online on that path, and
  the cost on a real phone and with many players online is unknown. Online play over the public relays and trackers is
  still untested from the sandbox (this run: HTTP 403 on CONNECT again for relay.damus.io, nos.lol,
  tracker.webtorrent.dev and tracker.openwebtorrent.com); the only real-network evidence is the owner's test on
  milestone 1. Code cannot make the sandbox reach a relay, but it can make a real player's or the owner's visit produce
  evidence (numbers only) and can survive dead relays, so the plan starts there (27, 28).
  (3) Tests: 24 files, about 18 minutes for one pass (the runs' own times added up, this run). Flakes seen in this stretch: `both` (once in a
  tester run at milestone 23, once in 11 runs this run, at the two link checks), `living` (the sky strip, 8/10 on old code
  at milestone 20), `stone` (one second-round check, 1 in about 24), `craft` (a reload with the lobby joined at once, fixed by
  `LOBBY_JOIN_DELAY_S`). The dawn test that failed (2 of 3 for one tester, 3 of 4 for the chair, 2026-10-17 20:50) belonged
  to a milestone 24 that was never merged; the dawn and dusk test that is on main passed 15 of 15 this run, but its dawn
  path check sits close to its floor (1.43 to 1.47 against 1.40), so a slower or different renderer could cross it.
  Milestone 31 spends one run on these.
  (4) Two runs lost their whole game step to another run pushing the same milestone (2026-10-16 01:45, 2026-10-17 20:50).
  Keep increments small and fetch before building and before handing back.
  (5) Look steps (20, 24) stayed cheap in Canvas 2D (shadows 0.2 to 0.5 ms a frame, headless); still no phone measurement,
  so look steps stay in 2D and each says what it costs. Three of the next ten are look steps (29, 33, 36).
  (6) Lone visitors now have fishing, the lobby hint and the stone, but most rewards still need two players; the next
  gameplay items add things to do together that also help a newcomer find the others (32, 34, 35).
  Rooms stay at 12 players (`MAX_PEERS` 11 others).

## Later (in rough order, each one run)
27. **Done (see above).** Was: A connection report (network). A "Connection" line in the game panel, numbers only, from what the page
    already holds: for each path, how many relays or trackers are open of how many tried (hosts from the code's own list,
    never from a peer), how many players were met, how many links failed to open or were rebuilt; and a button that copies
    the same numbers as plain text to the player's own clipboard (no peer data in it except counts) so the owner or a
    player can paste it into a GitHub issue after a real online test. Add a short owner test checklist to DESIGN.md (two
    devices on two networks, which lantern, what to copy). Test on local relays: the counts match what the test did, a
    refused relay is counted as refused, nothing from a peer reaches the copied text. The page says plainly whether online
    play over public relays has been tested, from the CHANGELOG.
28. **Done (see above).** Was: Spare relays (network).
29. **Done (see above).** Was: Footprints and wakes (a look step). Players leave fading footprints on sand and meadow and a small wake in
    shallow water, drawn by each browser from positions it already receives (others' too), so a group's path across the
    island can be read for a few seconds. Nothing sent; a cap on marks per player and on screen; reduced motion keeps
    footprints but no rippling; measure the frame cost at 375 and 1100 px.
30. **Done (see above).** Was: A lobby that does not grow without end (network). Done 2026-10-18, local transport only. A page in a lantern that is linked to more than `LOBBY_LINK_CAP` (8) other lobby pages leaves the lobby room after a random 2 to 6 s (looking again first) and rejoins after `REJOIN_S` (60 s, doubling to `REJOIN_MAX_S` 240 s while it is still crowded); up to `ASKER_SLACK` (3) pages that sent a question are not counted. Once the lobby is over the cap the hint counts only the pages that stayed, so it is a sample. The cap is on settled links, not the first seconds of a join. Test: `tests/lobbycap.test.mjs` (14 pages plus an asker; not run over WebRTC).
31. **Done (see above).** Was: Steadier tests (test health, nothing for players). Done 2026-10-18. Only test files changed. `both`: the "link dropped" flake was the game's own stall watchdog rebuilding a path after a new link was announced late on the other side; the check now counts watchdog rebuilds on all pages (not matched to the leave) and still fails for a leave with no rebuild at all, for more than 2 rebuilds or for a link that does not come back. `living`: the sky-strip check's fixed 1% limit sat within the noise (0.8% for the best of 25 pairs); it is now a fifth of the gap between hours (about 24%). `skyglow`: the dawn path check reads until settled, takes the median of five and prints its margin (0.05 to 0.066 over the 1.40 floor, readings within 0.002). `watch`: the fixed 500 ms wait became a wait until the shade is gone. `stone`: pinned to a quiet stretch of the shades' clock and prints the rank panel on failure; cause not shown. `shadows`, `lobby`, `lobbycap`: diagnostics only. Every file 5 of 5 on the final code except `lobbycap` (4 of 5 once, then 16 of 16 after diagnostics were added); see the CHANGELOG.
32. **Done (see above).** Was: Carrying the flame (together). Done 2026-10-18, local transport only. A player beside a lit beacon takes a flame (`js/flame.js`), carries it up to `FLAME_LIFE_MS` (150 s), hands it to a player within 3 tiles (offer, accept, commit; the giver lets go before it sends the commit; a repeated offer number is refused), and lights an unlit beacon with it: the flame puts `FLAME_FUEL` (6, half of `BEACON_NEED`) into the lighter's own share, so the other half and a second player are still needed. A holder who leaves or reloads loses the flame; nothing else is lost. Test: `tests/flame.test.mjs` (fake mesh and three local pages; not run over WebRTC).
33. **NEXT: Light on the water (a look step).** Lanterns, lit beacons and the lit lighthouse lay wavering streaks on nearby
    water, and the moon lays a path on the sea in the sky strip's direction; still under reduced motion; governor levels
    cut it on slow devices; contrast of players and paths measured as in the dawn test.
34. **Welcome a newcomer (together).** A player with no help points yet sees a soft marker toward the nearest player
    with a rank in the same lantern (from the rank number already told to the room); when the two stand together for a
    few seconds, the ranked player earns a help point (deed `welcome`, a gap so it cannot be farmed quickly). Nothing typed;
    test with three pages, a reload, a modified rank.
35. **The dawn tally (together).** At dawn every page in a lantern shows the same short tally of the night: beacons lit,
    whether the lighthouse was lit, shades driven off, keeper's notes done and stone glows, worked out from the shared state
    each browser already holds (shares are grow-only, so pages that heard the same messages agree; the page says so). Nothing
    saved on a server; a test checks two pages agree and a late joiner's tally is labelled partial.
36. **Cloaks and idle life (a look step).** Figures get a cloak in their lantern colour and the rank's gold trim, a
    breath and a glance when standing still, and the lantern's flame inside the figure's hand; still under reduced
    motion; screenshots at 375 and 1100 px; cost measured.
37. **Roadmap review.** Read the CHANGELOG of 27 to 36, rewrite this file from what was learned.

## Known problems
- **`shadows.test.mjs` and `lobby.test.mjs` flakes (open, milestone 29).** The tester saw shadows 0/3 (3 reduced-motion and flicker checks) and lobby 0/2 ("the finished answer is still shown") in a loaded sandbox; the builder saw shadows 1/4 once, and the tester found shadows 0/2 on untouched code too. A later recheck passed lobby 3/3 (plus 3/3 and 2/2 under load) and shadows 1/1. Cause of either not found. Close each section's pages in the tests (milestone 31). Milestone 31: 5 of 5 for each of `shadows` and `lobby` before and after the changes, so the flakes did not come back and their cause is still not found; `shadows` now measures its reduced-motion picture over six pictures and prints the difference (0.000% in all 5 runs), `lobby` prints its state when "the finished answer is still shown" fails. The pages are still not closed per section.
- **`lobbycap.test.mjs` (open, milestone 31).** Failed once in 21 runs (the first 5-run loop, 4 of 5): the asker counted 8 of the 9 players who stayed (counts [0,0,0,5,3,0,0], stayers [0,0,0,5,4,0,0]) and a page changed its lobby state during the asker's visit. Not reproduced in 16 later runs; diagnostics for the second check were added afterwards, so the cause is not found.
- **Online play over public relays and trackers is untested from the sandbox** (HTTP 403 on CONNECT every run, last
  2026-10-17 at milestone 26). Only the owner's test on milestone 1 covers the real network. Milestones 27 and 28 address
  it from the code side (28: spare relays, also untested over the real network); a real test still needs a person on two devices.
- **`both.test.mjs` link checks (open).** Failed once in this run's single pass (milestone 26): 3 s after Z saw W linked on
  both paths, "Z: W is linked twice and counted once" failed (Z's own counts were right: one double link, two single;
  so W's view of Z had probably lost a path) and later "no link on Z was dropped and rebuilt" counted 2 leaves on Z. The
  next 10 runs passed (two loops of 5/5, the second after the diagnostics were added). The tester also saw `both` fail once at milestone 23. The test now prints both pages' links
  and link history when these checks fail; the cause is not found. Milestone 31 looks at it. Milestone 31 (cause found in part): in the two runs logged in full, a page's stall watchdog (`STALL_MS` 8 s) rebuilt a path because a new link showed on one side up to about 9 s before the other side announced it, so every link on that path left and came back, also those of players who were fine; in the two runs logged in full no ICE "disconnected" state and no page starved of time. The check accepts a leave only when a watchdog rebuild (at most 2 in all) explains it and the links come back; 3 of the 5 final runs saw a rebuild, so this happens often on new links. Why the other side announces late is not known, and `STALL_MS` was not changed (a game change).
- **Dawn test.** The dawn test that failed for a tester (2 of 3) and the chair (3 of 4) on 2026-10-17 belonged to a milestone 24
  that was never merged. The `skyglow.test.mjs` on main passed 15 of 15 this run (milestone 26) and 5 of 5 for its
  builder; its dawn path check reads 1.43 to 1.47 against a floor of 1.40, a thin margin (milestone 31). Milestone 31: now median of five after settling; margin printed, 0.05 to 0.066 over 1.40 in the final 5 runs, readings within 0.002; the floor itself is unchanged.
- **Open problem (not reproduced since):** on 2026-10-16 the game tester ran beacon.test.mjs 0 of 3, failing the WebRTC check
  "the two pages find each other although one was deaf for 12 s". The next run (2026-10-16, milestone 10) looked first and ran
  the same file 6 times on the same code: it passed every time (the watchdog check took 13.3 to 13.4 s of its 40 s). Every
  beacon run recorded in the CHANGELOG since then passed (5/5 at milestones 17, 19, 20 and 24; once in other runs; 1/1 at
  milestone 26). The cause of the tester's 0 of 3 is not found; the check stays, and any new failure should be logged with
  `__longWatch.linkHistory()` and the machine's load.
- `stone.test.mjs` "a second round while it glows adds no point and no second glow" failed once in about 24 runs (milestone
  22, WebRTC part); the check now prints the points and counts; cause not found. Milestone 31: the stone credit cannot give a second point within 30 s (`GAPS_MS.stone`), so the extra point came from another deed (a shade driven off is the likeliest, since the test did not pin the shades' clock); the test now pins a quiet stretch and prints the rank panel on failure. A slot of four shades did not reproduce it (3 of 3 passed), so the cause is not shown. 5 of 5 and 8 of 8 passed.
- `living.test.mjs` "the sky strip at one hour looks the same each time": 8/10 on the code before milestone 20, 10/10 on
  milestone 20's code; it reads a strip that holds twinkling stars and glints. Passed 1/1 at milestone 26. Milestone 31: 12 of 12 passed, but the closest pair differed by up to 0.81% against the 1% limit; the limit is now a fifth of the gap between hours (24%).
- `shades.test.mjs` "neither player was ever snuffed": fixed in the test at milestone 16 (pages load on a quiet stretch of the
  shades' clock); `shades` and `watch` pin `?weather=clear` since milestone 25 because rain slows the shades.
- Earlier, WebRTC handshakes: `gather` "a third player joins and sees both others" (about 3 of 27 runs before milestone 6)
  traced to half-open links and answered by the presence and link watchdogs (180 clean meshes, encouraging, not proof); `give`
  "when both are back, the reeds arrive" failed 3 times in about 100 WebRTC runs before link history existed; a real network
  that needs TURN is untested.
- The first frames after Sound is turned on stalled about 0.9 s in headless Chromium while the sound is set up (milestone
  14); not checked on slow devices. No sound has been heard by anyone checking the game.
- Trades: if a player accepts a trade and the offerer never returns, the accepted item stays set aside (up to `MAX_HOLD` 4
  can be locked this way by a modified client); giving it back could copy an item, so it stays.

## Ideas parked (no order)
Shades that follow a lone lantern slowly; a shade that can only be driven off by a lit beacon at the end of a long night;
seasonal islands (a new seed each month, the old ones kept as "past islands"; saves and gift records must carry over);
when a lantern is full, suggest the next one (DESIGN's network model); a TURN-free way to tell players their network
pair cannot connect (partly milestone 27); a move to WebGL when a look step cannot be done in 2D or a phone measurement
says so; MQTT as a third signalling path. Taken into the plan from this list in earlier reviews: fishing (19), the music
stone (22), weather that changes the game (25), trading (23). Done from this list: the world-changing event when every
beacon is lit (milestone 14).
