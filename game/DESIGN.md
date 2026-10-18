# The Long Watch: design

Founded 2026-10-15. Read this, `ROADMAP.md` and the end of `CHANGELOG.md` before changing anything.

## Vision
An island at night, and the people who keep its lanterns. Every player arrives carrying a small light; the
dark is the only enemy at first. Together players walk the island, gather what the shore and the woods give
(driftwood, reeds, lamp oil, glass), make lanterns and wicks, and relight the old beacons on the headlands.
Some things one player can do alone; the beacons and the bigger works need several people at once, and when a
lantern room has worked together the island visibly changes: lit paths, rebuilt jetties, a lighthouse that
shines for everyone who enters that room. It fits Vigil because Vigil is a night-shift studio: a vigil is
staying awake to keep watch, and this is a game about keeping watch together, made a little more each night.
It is slow, kind and co-operative by design; competition, if it ever comes, is friendly (who keeps the most
lights burning), never player against player harm.

## Hard rules (from the skill; they never change)
- Multiplayer is the point: every feature works for several players in one room.
- No server, no accounts, free: static files on GitHub Pages, peer to peer, public signalling with no keys.
- **No free text between players.** No chat box, no typed names, no signs. A peer sends numbers and preset ids
  only; every browser turns them into words from its own lists. Names are generated from a 32-bit seed
  (`js/names.js`). Talk will be preset phrases and emotes. The receive path validates every message and has
  no field that is ever rendered as text from the network.
- Honest landing area (in `index.html`, section "What this is, plainly"): made by Claude, an AI model (Vigil is
  not an Anthropic project); peer to peer, so it only works with others online in the same room and there is
  no shared saved world on a server; character saved only in this browser; peers can see your IP address, as
  in a video call; nothing collected; the island comes from a seed.
- Testable without the internet: one transport interface, a local BroadcastChannel implementation, `?net=local`.
- Pinned, vendored, open-source libraries; phones and desktops; light and dark chrome; no console errors.

## Chosen stack
| Part | Choice | Why |
|---|---|---|
| Rendering | Plain Canvas 2D, no engine | A top-down tile island is the right shape for a slow co-operative RPG on phones: it is cheap to draw, needs no assets, no build and no download. three.js (the owner's suggestion) was considered; see below. |
| Networking | Trystero 0.25.4 (MIT), vendored in `vendor/` | Serverless WebRTC with pluggable public signalling, end-to-end encrypted data channels, rooms, targeted sends, peer join/leave events. One small ES-module library with one dependency (`@noble/secp256k1` 3.2.0, MIT, for signing Nostr events). |
| Signalling | Nostr relays (Trystero default, 5 of ~30 public relays at once) | Many independent public relays, no sign-up, no key; the most redundant of the free options per Trystero's own advice. Since milestone 18 the default is `auto`: the game joins the same room through Nostr relays and through public BitTorrent WebSocket trackers (Trystero's `torrent` strategy) at the same time and treats a peer heard on either as one player (from milestone 13 to 17 it tried Nostr first and switched to the trackers after 7 s, and players on different paths could not meet). The page shows which paths are open. `?net=nostr` or `?net=torrent` pins one path. MQTT was not added: the torrent strategy already is a second independent family, and MQTT brokers have terms the open trackers do not. |
| Shared world | Generated from a fixed seed (`js/world.js`) | Everyone gets the same island without sending it. Only exactly-rounded arithmetic is used (no `Math.sin`/`exp`/`pow`), so the tiles are identical in every JS engine; the tests compare a fingerprint. |
| Save | `localStorage` key `vigil.longwatch.v1` (seed and position) | "Saved only in your browser", as the landing promises. `?net=local` uses `sessionStorage` so two test tabs are two different players. |

Libraries are vendored rather than loaded from a CDN because jsdelivr is blocked from the build sandbox (so
tests could not load them) and because vendoring pins the exact bytes. See `vendor/README.md`.

## Options rejected (for now)
- **three.js / Babylon.js / PlayCanvas engine.** A 3D world would cost far more per increment (models, camera,
  lighting, phone performance) and add a large dependency, while the game's interest lies in what players do
  together, not in 3D. A later roadmap review may revisit it, for example three.js with an orthographic camera
  over the same tile data; the world, presence and net modules are independent of the renderer. The 2026-10-16
  review kept Canvas 2D (frames stay well inside budget in headless measurements; see ROADMAP.md).
- **2D engines (Phaser, PixiJS, Kaboom).** Useful for sprites, physics and scenes we do not need yet; plain
  canvas keeps every file readable by the next run. Revisit if sprite animation or many particles arrive.
- **PeerJS public server.** One shared broker run by the PeerJS project (a single point of failure we
  do not control), and PeerJS has no rooms: discovery would need its own scheme.
- **y-webrtc (Yjs).** Excellent CRDT documents, but its default signalling servers are a few community WebSocket
  servers and it is built for documents, not 10 Hz movement. Its ideas (CRDT state, awareness) inform the
  shared-state plan below, without the dependency.
- **MQTT brokers via Trystero.** Trystero ranks MQTT second for robustness, but the public brokers are few
  and their terms for this use are less clear than Nostr's open relays. Easy to add as `?net=mqtt` later by
  vendoring `@trystero-p2p/mqtt`.
- **Supabase / Firebase strategies.** Need an account and a project key: against the rules.
- **Hosted game servers, TURN relays with credentials.** Cost or sign-up. Consequence: two players whose
  networks both block direct WebRTC (some corporate or mobile networks with symmetric NAT) cannot meet. The
  landing page's status line says when no one is reachable; the game cannot fix this without a TURN server.

## Network model
- **Rooms.** Six "lanterns" (`lantern-1` … `lantern-6`), chosen on the landing page and kept in the URL hash
  (`#room=3`). Trystero's `appId` is `vigilstudio-long-watch-v1`; bump the suffix if the protocol breaks
  compatibility. Every browser in a room connects to every other (full mesh), so a room is comfortable up to
  about a dozen players. Since milestone 21 the lobby hint skips a lantern that is full (see "Where the others are"); nothing yet moves a player out of a full lantern.
- **Transport interface** (`js/net/transport.js`): `send(msg, peerId?)`, `onMessage`, `onPeerJoin`,
  `onPeerLeave`, `status()`, `leave()`. Messages are small JSON objects; one Trystero action `"m"` carries them,
  with a kind field `k`. Implementations: `local.js` (BroadcastChannel), `trystero.js` (Nostr or torrent), `auto.js` (the default since milestone 18: both paths at once, one room; see below).
- **One room across both paths** (`js/net/auto.js`, milestone 18). In one page both Trystero strategies share one peer id, so a
  player on both paths is the same id on each. The wrapper keeps `links: id -> [paths]`: a peer is announced to the game on
  its first link and reported gone when its last link goes; we send each message once per peer, on its first link (a
  broadcast is one send per known peer, not one per path); a message is accepted from whichever link it arrives on. So
  nothing is delivered twice because two links exist (checked locally in both.test.mjs). Each path's watchdog rebuilds a path whose peer stays silent for 8 s,
  and a second link carries no game traffic, so on every second link a tiny `{k:"ln"}` keepalive goes out every 2 s and is
  dropped on arrival (without it the second link was torn down and rebuilt every 9 s in the first test). Players on one
  path only meet each other and every both-path player; a Nostr-only and a BitTorrent-only player do not see each other
  (nothing is relayed). Players shown per room stay `MAX_PEERS` (presence.js, counted by id, so a double link counts once; the network links themselves are not capped separately). The BitTorrent
  path is slow to link: about 15 to 25 s on the local tracker.
- **Authority.** Each player is the sole authority over their own avatar and inventory. Others draw what that
  player last reported (eased toward it, snapping if it jumps more than 4 tiles). No one can move or change
  someone else's character.
- **Presence protocol v1** (`js/presence.js`): `hi` (seed, position, facing; to every new peer), `st` (position,
  facing, moving flag; 10 Hz while moving, every 2 s standing still), `by` (leaving). A peer that is silent for
  12 s is dropped. All fields are validated and clamped; movement from a peer that has not said `hi` is ignored.
  Every peer is also limited to 30 presence messages per second (`js/guard.js`), at most 8 fields per message, and
  `MAX_PEERS` = 11 others per room.
- **Talk protocol v1** (`js/talk.js`): `say` (`{k:"say",p:id}`, one of 16 preset phrases) and `em` (`{k:"em",e:id}`,
  one of 5 gestures). Ids are integers; the words live in each browser's code. A message with any other field, a
  non-integer or out-of-range id, or from a peer that has not said `hi`, is dropped. Cooldowns (3 s phrases, 1.5 s
  gestures) are enforced by the sender and again by every receiver (with 20% slack), plus a 6/s rate limit per peer.
- **Shared world state (from milestone 3 on).** Things that belong to the room, not to a player (a gathered
  bush, a beacon's progress), are kept as a replicated map of small records, each with a version
  `(lamport, peerId)`. Rules: highest version wins (last writer wins with a deterministic tie-break); counters
  that many players add to (beacon fuel) are per-player grow-only counters summed by everyone (a G-counter CRDT,
  so concurrent contributions never get lost). Contested one-off actions (two players picking the same bush in
  the same instant) are settled by the **arbiter**: the connected peer with the lowest id, which every peer
  can work out by itself; if the arbiter leaves, the next lowest takes over. Resource respawns are derived from
  the seed and wall-clock time, so they need no messages.
- **Gathering protocol v1** (`js/gather.js`, nodes in `js/resources.js`, built in milestone 3): 42 nodes (14 each of
  driftwood, reeds, oil berries) come from the seed and are known by index only. `pk {n}` (ask the arbiter),
  `gt {n,r}` (arbiter to all: node n hidden for r seconds), `ok {n}` / `no {n}` (arbiter to the asker), `rq` and
  `sn {n:[..],t:[..],f}` (snapshot, at most 16 entries a chunk, `f`=1 on the last). The state is "node n is hidden
  until T"; merging keeps the later T; T travels as remaining seconds and becomes the receiver's own clock time, so
  clocks need not agree, and everyone holds the full map (any peer can answer `rq`). `gt` counts only from the
  arbiter as the receiver sees it; the arbiter refuses picks farther than 2.6 tiles from where it last saw the asker
  (players may only pick within 1.3), and a newcomer that has not yet heard a snapshot (1.5 s at most) refuses to
  decide. The pack is saved since milestone 4. Accepted weakness: a modified client that is the arbiter
  could grant itself everything; there is nothing to win from others. `?respawn=N` (1 to 600 s) shortens the
  respawn for tests.
- **Giving protocol v1** (`js/give.js`, saved state in `js/inventory.js`, milestone 4): `of {t,i}` offer, `ac {t}`
  accept, `dc {t}` decline, `cx {t}` take back, `cf {t,i}` commit, `rc {t}` receipt, all to one peer. The item leaves
  the giver only on `ac`, is saved in the giver's `out` list first, and goes to the receiver on `cf` only if it is in
  the receiver's saved `exp` list; `got` stops repeats. The giver repeats `cf` every 3 s to the same seed until `rc`.
  A gift whose receiver never returns stays in `out` (never given back, so never copied; it is lost only if storage is blocked or cleared). `exp` is never trimmed: a receiver with `MAX_EXP` (32) entries declines new offers and `accept()` refuses; `got` keeps the newest `MAX_GOT` (1000). Known limits: a peer can claim another player's public seed and so receive gifts meant for them; storage cleared after the hand-over loses the record. Saved key
  `vigil.longwatch.v1` now holds `inv`, `out`, `exp`, `got` next to seed and position, all checked on load.
  Milestone 12: the item number `i` indexes `ITEMS` (`js/inventory.js`): 0 driftwood, 1 reeds, 2 berries, then 3 wick, 4 amber, 5 jade, 6 azure lantern. Crafted things are counted in `cr` and go through exactly the same steps; every cap above applies to them (the receiver declines at `SOFT_STACK` of that item). When the last lantern of the one in hand is committed away, `held.lamp` becomes 0 in the same save and the game announces the plain lantern. The receiver never starts holding a received lantern by itself.
- **Trade protocol v1** (`js/swap.js`, saved `hold` list in `js/inventory.js`, milestone 23): `tro {t,i,j}` offer one item of
  kind `i` for one of kind `j`, `tra {t}` accept, `trn {t}` no thanks, `trx {t}` withdraw, all to one peer; the two halves
  are then sent as ordinary gifts (`cf`/`rc` of the giving protocol) with the same `t`. The offerer's item goes into `hold`
  (role 0) when it offers and back to the pack on a decline, withdrawal, timeout, the peer leaving, or the next page load.
  The accepting side re-checks, sets its item aside (`hold`, role 1) and writes the expected half into `exp`; the offerer
  re-checks at `tra` and either commits (hold becomes `out`, `cf` sent) or answers `trx`; the accepting side's hold
  becomes `out` once the other half is in `got`. Held items share `MAX_OUT` with gifts on their way and are capped at
  `MAX_HOLD` (4). The accepting side re-sends `tra` every `RESEND_MS` while the offerer is in the room. If the offerer
  never returns after an accept, the accepted item stays set aside (not given back, because its half may have been sent),
  and a client that accepts and never goes on can lock up to `MAX_HOLD` items of another player this way.
- **Crafting protocol v1** (`js/craft.js`, saved fields in `js/inventory.js`, milestone 5): nothing about crafting
  itself crosses the network, because it only converts items in the player's own pack: `tryCraft` checks every
  ingredient and the result's stack (`CRAFT_STACK` = 999) first and changes the pack only if all of it can be paid, so
  a refused craft changes nothing and nothing is ever dropped. Recipes (wick: 2 reeds, 1 oil berry; amber: 1 wick, 2
  driftwood, 1 berry; jade: 2 wicks, 3 driftwood, 3 reeds, 2 berries; azure: 3 wicks, 4 driftwood, 4 reeds, 4
  berries) live in `RECIPES`, the lantern reach multipliers (1, 1.4, 1.8, 2.3 times the night's reach) and glow
  colours in `LAMPS`. The only message is `lt {l}` (the lantern held: 0 plain, 1 amber, 2 jade, 3 azure), sent on change,
  to each newcomer (after its `hi`) and to everyone every 5 s; a receiver needs the sender to have said hello, exactly
  two fields, `l` a whole number 0 to 3, and allows 4 a second per sender. Every browser draws each player's pool of
  light with that player's own reach, so everyone nearby sees the same reach. Saved key gains `cr` (wick, amber,
  jade, azure) and `lamp` (checked on load; you can only hold a lantern you own). Accepted weakness: a modified client
  can claim a bigger lantern than it owns, which only changes how it looks to others (no gameplay depends on it yet).
  Crafted items are not part of giving yet, so they cannot be copied that way.
- **Beacon protocol v1** (`js/beacon.js`, milestone 6): the island's four old beacons are fuelled together. The shared
  state is one whole number per player per beacon (that player's share of fuel), a grow-only counter keyed by the
  player's seed: merging keeps the larger number, so order, repeats and crossing messages never lose or lower a share.
  A beacon is lit when the shares add up to `BEACON_NEED` (12) and at least `MIN_PLAYERS` (2) players have a share,
  so it is derived, never sent, and (the counters only grow) stays lit while anyone who holds the state is in the
  room; a room that empties forgets it, and fuel a player spent stays spent. Driftwood is worth 1 fuel, oil berries 2
  (`WORTH`); a player must stand within `BEACON_RANGE` (2.5) tiles; one player's share is capped at `MAX_OWN` (16),
  so one player alone could reach the fuel but never lights it; a lit beacon takes no more. At most `MAX_ENTRIES`
  (24) players are counted per beacon, and a full list refuses new ones (it is always already lit, so a real player's
  item is refused before it is taken). Adding fuel changes the pack and saves it before anything is sent. Messages:
  `fu {b,n}` (my total on beacon b, sent on change, to each newcomer, every 5 s), `fq` (newcomer asks a peer) and
  `fs {b:[],s:[],n:[],f}` (up to 10 shares a chunk, so a snapshot also carries the shares of players who left); `fs`
  is accepted only from a peer asked and still being waited for (asked again at most twice, 2.5 s apart). Receivers
  need a known sender, exact fields, whole numbers in range and allow 8 a second per sender. The shares are not
  checked against where the sender stands (accepted weakness: a modified client can claim shares, and a claimed seed
  of someone else counts as another player; there is nothing to win from others). A lit beacon draws a flame and a
  wide pool of light (`LIT_RADIUS` 9 tiles) for everyone, and a warm mark on the minimap.
- **Keeper's notes protocol v1** (`js/quests.js`, milestone 8): `notesFor(seed, day)` makes three notes, a pure function
  (hash only, so every browser agrees): gather 5 to 9 of one item, make 3 to 5 wicks or 2 amber lanterns, burn 6 to 9 fuel in
  one of the four beacons. The day is the UTC day number from the browser's clock (`?day=N` pins it on loopback pages only).
  Progress is a per-player grow-only counter per note, keyed by the player's seed, exactly like the beacons' shares: merging
  keeps the larger number. A note is done when the total reaches `need` and at least `MIN_PLAYERS` (2) players have a share;
  one player's share is capped at `need - 1`, 24 players are counted per note and a full list refuses new ones. Counting is
  by the player's own events: a successful pick, a craft, fuel added to the note's beacon (by its fuel worth). Messages:
  `qp {q,d,n}`, `qq {d}`, `qs {d,q[],s[],n[],f}` (all numbers; same checks as the beacons' `fu`, `fq`, `fs`, and a message whose
  day is not the receiver's own is dropped). Credits earned while the counters of a present peer are not yet heard are held
  back (`owed`) and added after the snapshot, to the share the others hold for you. At the UTC day change every browser
  starts the new day's notes at 0 (so clock differences of seconds can briefly hide progress). Nothing is saved: a room that
  empties forgets its notes; the pack is not touched by a note. Accepted weakness: a modified client can claim shares (or
  another player's seed, faking the second player); there is nothing to win from others.
- **Shades protocol v1** (`js/shades.js`, milestone 9): a shade's whole life is a pure function of the island seed and the UTC
  clock, so no position is ever sent. A slot is 160 s (`SLOT_S`); `shadeCount(seed, slot)` gives 0 to `MAX_SHADES` (4), a quarter
  of the slots none; `shadePlan(world, slot, k)` picks the landmark `a` it circles, the landmark `b` it leaves toward, an entry
  point about 26 tiles out, and a stagger of `k * 12` s; `shadeAt(world, ms, k)` is its position: in at 0.9 tiles a second
  (`SPEED`), 55 s on a circle of radius 1.8 round `a`, then off toward `b` for 35 s, fading in and out over 3 s; it always
  leaves inside its own slot. Players share only the light put on each shade: a per-player grow-only counter keyed by the
  player's seed, exactly like the beacons' fuel and the notes' shares (`createLightShares`, merge keeps the larger); a shade is
  gone for the rest of the slot when the total reaches `SHADE_NEED` (20 light-seconds) with at least `MIN_PLAYERS` (2) holders;
  one share is at most `MAX_SHARE` (19); 24 players per shade, a full list refuses and drops nobody. A player counts a
  light-second for every second their own lit (not snuffed) lantern reaches (within 90% of its reach) a shade that is out and
  not gone. Messages: `hp {s,i,n}`, `hq {s}`, `hs {s,i[],p[],n[],f}` (as the notes' `qp`, `qq`, `qs` with the slot number in
  place of the day; a message of another slot is dropped) and `sf {z}` (lantern out 1 or lit 0, on change, to each newcomer and
  every 5 s; a receiver trusts a 1 for `SNUFF_S + 6` s at most). Credits earned before a present peer's counters are heard are
  held (`owed`) and added after the snapshot. Being snuffed (`me.snuffed`, decided by each browser only about itself): a shade that
  is out (alpha at least 0.5), not gone, within `SNUFF_R` (1 tile), snuffs the player unless some other player whose lantern is
  not out has their light on that shade (then the page is told "held"), unless the player stands within 90% of the radius of a lit
  beacon (`safeAt`), or is in the `GRACE_S` (6 s) after the last time. It ends after `SNUFF_S` (14 s) or when a player with a lit
  lantern stays within `RELIGHT_R` (2.5 tiles) for `RELIGHT_S` (1.5 s). A snuffed lantern gives a pool of `EMBER_TILES` (0.9) and
  no glow. Nothing is lost and nothing is saved. Accepted weakness: a modified client can claim light-seconds or never be
  snuffed; clocks that differ by more than a few seconds show shades in slightly different places (and by minutes, in different
  slots). `?shadeclock=N` (loopback pages only) shifts the shades' clock; `__longWatch.setShadeClock(ms)` does the same for tests.
- **Rank protocol v1** (`js/rank.js`, milestone 10): the lamplighter rank is cosmetic and earned only by helping. Five kinds of deed
  give one point each, and the game calls `rank.credit(kind, key)` only when the player took part: `relight` (a friend's lantern
  was relit early while I stood within `RELIGHT_R` of them for `HELP_S` (0.9 s) with my own lantern lit; `shades.js` raises the
  `helped` event when the friend's `sf` 0 arrives, only if their snuff began less than `SNUFF_S - 1` s before), `shade` (a shade
  was driven off, which needs two players, and my own share grew past the baseline taken when the counters were synced),
  `gift` (a gift I gave was confirmed), `beacon` and `note` (lit or finished, with my own share grown past the baseline, so
  re-entering a lit beacon earns nothing). A deed key counts once per page load; a gift counts at most once every 4 s and a
  relight once every 10 s; 500 keys are remembered per visit (a full list refuses new deeds, it forgets none); points stop at
  100000. Ranks from points: 3 Lamplighter, 10 Beacon keeper, 25 Warden of the watch, 60 Long watcher (`THRESHOLDS`, `TITLES`).
  Saved as `help` (a whole number) next to the pack. Message `rk {r}` (exactly two fields, r a whole number 0..4), sent on change,
  to each newcomer and every 5 s; a receiver needs a known sender, allows 2 a second, and shows only the title looked up in
  `TITLES` (a trim of r gold marks on the lantern, a gold line over the name, and a suffix in the player list). Accepted weakness:
  a modified client can claim any rank, and a second tab or alt character can farm points; the page says the rank proves nothing.
- **Figures** (`js/figure.js`, milestone 15, a look step): no message. `figurePose(moving, t, phase, gesture, k, reduce)` gives, from a player's `moving` flag (already sent
  in `st`), facing and current gesture, the feet's step (`STRIDE_MS` 520 ms a cycle, the per-player phase comes from the seed), the lantern's swing (at most 0.55 rad),
  head lean, and gesture poses (bow, wave, cheer, point, sit). `js/render.js` `drawAvatar` draws two feet, a head dot and the lantern on a swinging arm from it.
  With reduced motion the walk cycle and lantern swing stop (a walking figure stands still); gesture poses (bow, wave, cheer, point, sit) still apply. Cost: a few extra arcs per player. Art is drawn in code; no assets.
- **Where the others are** (`js/lobby.js`, milestone 21): a hint about which lantern has players, worked out by asking. There is no room list anywhere, so a seventh room named `lobby` (`LOBBY_ROOM`, its own Trystero or local room, same `?net=` path) holds two kinds of page: a page inside a lantern joins it `LOBBY_JOIN_DELAY_S` (8 s) after Enter, so the lantern's own connections are made first (and leaves it when it leaves the lantern or closes) and answers; a page on the landing screen joins it only when its player presses "Where are the others? (a guess)", asks for `LOOK_S` (20 s), and leaves. Messages, numbers only: `lq` (exactly one field, the question) and `lr {r}` (exactly two fields, `r` a whole lantern number 1 to 6, sent to the asker alone). A page asks each player who joins the lobby, again after `RE_ASK_S` (3 s) if unanswered, `MAX_ASKS` (3) times at most; a responder answers one player at most 2 questions in a burst and then 1 per `ASK_GAP_S` (4 s), and never when it is not in a lantern. The asker counts an answer only from a player it asked, once per ask, only from the first `LOBBY_PEERS` (11) players it saw join, at most `MAX_ANSWERS` (72) in all, for `ANSWER_TTL_S` (60 s), and shows a lantern's count as at most `ROOM_SIZE` (12). `suggest` picks the lantern with the most answers that is below `ROOM_SIZE` (ties: the lower number), so a full lantern is not suggested; the "Pick Lantern N" button only selects it (it never enters). The text always calls it a guess. Costs and limits: every page inside a lantern is also linked to every other page in the lobby, so the lobby room is one mesh of all players online on that path (only the first 11 others are heard, but their connections are not closed), and a modified client can answer any lantern. Nothing is saved. Tested locally and through a local relay only.
- **The music stone** (`js/stone.js`, milestone 22): a stone a few tiles from the well (2 to 3 tiles on open ground, chosen from the seed, not solid, not a landmark). A player within `REACH` (2.5 tiles) presses one of 8 note buttons: message `mn {n}` (exactly two fields, n a whole number 0 to 7), at most one note per `OWN_GAP_MS` (400 ms) from me. A receiver needs a known sender, an exact message, a sender whose last known position is within `REACH + REACH_SLACK` (4 tiles) of the stone, and at most `RATE_PER_S` (3) notes a second per sender (burst `RATE_BURST`, 4); the rest are dropped and counted. Sound is made by the listener's own browser from a list of 8 pitches, only while the Sound button is on (`createFootsteps().note`); nothing a peer sends reaches the audio code except the note id. The tune is `tuneFor(seed, night)`: 3 different notes from the seed and the night number (the device clock, 48 minutes a night), sent by no one, so players whose clocks are in different nights have different tunes. Each browser keeps the latest note of each player for `BEAT_MS` (1.5 s) and glows the stone for `GLOW_S` (20 s) when three different players' latest notes cover the tune; it decides from the notes it received, so it can differ by a note's travel time. Players who took part earn one help point (rank deed `stone`, at most once every 30 s); players who only saw the notes get none. Nothing is saved, and a player who leaves takes their note with them. Accepted weakness: a modified client standing at the stone can play any note at the rate limit, and one person with three browser tabs is three players, so they can play the whole tune and earn the point alone (the same is true of every other two-player rule here).
- **The clock check** (`js/clock.js`, milestone 17): shades, weather, the night hour and the keeper's day are pure functions of each
  device's UTC clock, so players whose clocks disagree see different shades and may share no notes. Message `ck {t}` (exactly two
  fields, t my clock in whole seconds, 1e9 to 1e10), sent to each player when first seen in presence's map, again 3 s later (the
  first can arrive before our `hi` and is then dropped as a stranger's), and to everyone every `CLOCK_SEND_MS` (30 s). A receiver
  needs a known sender (in presence's map), allows 1 a second (burst 3), and keeps offset = t - my clock in seconds; travel time is
  ignored and t is whole seconds, so the offset is only good to about a second, and only differences of `CLOCK_WARN_S` (10 s) or more
  are shown. The note (`clockNote`) is fixed text with the generated name and the size in plain words, under the status line
  (`#clocknote`, textContent only); it names the player whose clock differs most. Nothing is saved; offsets are forgotten when a
  player leaves. It changes no rule and corrects no clock. Accepted weakness: a modified client can claim any clock, which changes only
  the note others read. `?clockskew=N` (loopback pages only, whole seconds, at most two days) shifts the clock this check sends and
  compares, not the game's own clock; `__longWatch.clock()` is the read-only test view.
- **The long watch kept** (`js/lighthouse.js`, milestone 14): no new message. Each browser already holds the beacons' shares; when
  every beacon of the island is lit (`watchKept`, real booleans, an empty list is not kept) the ruined lighthouse is lit, and it
  stays lit for as long as anyone in the lantern holds the shares (an emptied lantern forgets them, so it goes dark). The beam
  (`LIGHTHOUSE_RADIUS` 14 tiles) is eased 0 to 1 over `EASE_S` (2.5 s; at once with reduced motion) by `createBeam`. Shades: a shade whose
  plan makes for the lighthouse (`shadeAt` now returns `at`, the landmark it circles) fades with `1 - f`; any other shade whose path is
  inside the beam is held on its edge along the line from the lighthouse (`holdOut`, passed to `createShades` as `holdOut`), so
  shades slide out as the beam grows (checked in node: at most 1.5 tiles per 10% of growth) and none that can be seen is ever
  inside a full beam. Players inside 90% of the full beam are safe from a snuff, like inside a lit beacon (`insideBeam`, added to
  `safeAt`). Weakness accepted: shade places come from each device's UTC clock, so with clocks minutes apart players see shades in
  different places, and the beam's edge is only as consistent as the beacon state they have heard; for a moment after the fourth
  beacon lights, pages that have not yet heard it show the old shade places. Cosmetic part in `render.js` (`drawLighthouse`, a
  pool in the night layer) and `minimap.js`; `__longWatch.watch()` is the read-only test view.
- **Presence watchdog** (milestone 6, in `js/presence.js`): over real WebRTC a link can come up on one side before the
  other and the single `hi` sent at that moment is lost, so the two never see each other. Now a peer we have greeted
  but not heard a `hi` from gets our `hi` again after 3 s (three repeats at most), a `hi` from a peer we have not
  greeted is answered with ours (once), and movement from an unknown peer makes us send our `hi` (once every 2 s, 64
  strangers at most). A second, lower watchdog was added to the Trystero transport (`js/net/trystero.js`): in a stress run
  of 150 three-player meshes two failed because a link came up on one side only (that side got a join event, the other
  side's handshake timed out and it never sent anything), and the first side stayed "joined" for ever. A peer that has
  been joined for `STALL_MS` (8 s) without any message from it (every client sends one at least every 2 s) makes the
  transport leave and rejoin its room (the game is told each peer left, then each that returns joins again), at most
  `MAX_REBUILDS` (3) times and `MIN_GAP_MS` (10 s) apart, so a silent hostile peer can cost a few reconnects but not a
  loop. `?mute=N` (loopback pages only, 1 to 30 s) makes a page neither send nor hear for N seconds, for the test.
- **Late joiners.** On `onPeerJoin` every existing peer sends its own `hi`; for room state, the newcomer asks the
  arbiter (falling back to any peer) for a snapshot, then merges using the rules above. Because the room's state
  lives only in the browsers present, a room that empties forgets everything shared in it; the landing page
  already says so. Personal progress (inventory, skills) is saved locally and survives.
- **Cheating.** Without a server, a modified client can lie about itself. Accepted: the game is co-operative,
  there is nothing to win from others, and peers bound what they accept (positions on the island, speeds within
  reason, preset ids only).

## Fishing (milestone 19, `js/fishing.js`, drawn in `js/render.js`)
Where the fish are needs no messages: `fishAt(world, ms)` is a pure function of the seed and the clock. A slot is `FISH_SLOT_S` (24) seconds; each of up to `MAX_FISH` (8) fish exists in a slot with chance `FISH_PRESENT` (0.75), lives from a seeded second in the first third of the slot to a seeded second in the last third (so at 10 s into a slot every fish that exists is fully there), and sits on the middle of a water tile whose four neighbours are water, found by up to 8 seeded tries round the end of the jetty (about `GROUND_RADIUS` 12 tiles). It drifts on a small circle (still with reduced motion). Nothing about a fish is sent, so catching one takes nothing from anyone: two players can both catch "the same" fish. Positions agree between players only if device clocks agree (the same caveat as shades and weather).
A cast (`castAhead`: the farthest water tile 1.5 to 4 tiles along the facing; or `cast(x, y)` for the tests) puts a float on a water tile. After `SETTLE_S` (0.8 s) a float bites when a fish is within `BITE_R` (1.1) of it; the player then has `BITE_WINDOW_S` (2 s; `BITE_WINDOW_STILL_S` 3.5 s with reduced motion) to press, and `reel()` catches it. Early press: line in, nothing. Missed bite: the fish gets away, line in. After any end, `CAST_COOLDOWN_S` (1.5) before the next cast. A line left `LINE_MAX_S` (45) comes in by itself, and so does one whose owner walks more than `CAST_MAX` + `SLACK_WALK` (4 + 2.5) tiles from the float. A catch adds `OIL_PER_FISH` (1) to `inv.oil` and saves before the event; at `SOFT_STACK` (999) the fish is let go and nothing is added (checked again at the press, so a stack that filled meanwhile is refused).
The shoal: if my line has lain `SHOAL_SETTLE_S` (1.5 s) and another player's line, as I know it, has too and their float is within `SHOAL_RANGE` (4) of mine (the nearest one, the lower player seed on a tie), a shoal of `SHOAL_FISH` (3) fish circles the midpoint of the two floats on a ring of `SHOAL_RING` (0.5); both browsers compute it from the two floats and a key from the two player seeds, so it is the same for both. Shoal fish bite from `SHOAL_BITE_R` (2.6) tiles, so a shore far from the jetty brings bites only through a shoal. The one message is `fl {x, y}` (the float's tile, or -1, -1 for none; two whole numbers) sent on change, to newcomers and every `RESEND_MS` (5 s); a receiver checks the sender is known, the tile is water inside the map, within `FLOAT_SLACK` (9) tiles of the sender's last position, 4 messages a second at most per sender, and forgets a line `LINE_TTL_S` (12 s) after its last repeat. Lamp oil is item 7 in `ITEMS` (so every older item and saved gift keeps its number), counted in `inv.oil`, worth 3 fuel (`WORTH.oil`). `createFishing` takes a tests-only option `bites: false` (nothing ever bites). Drawing: `drawFish` (a body, tail and ring, under the night layer so fish show where a lantern lights the water) and `drawLines` (line, float, bite rings and a shoal shimmer, over the night layer so floats are always found). Cost was not measured separately; both draw only the few fish and lines present.

## Shadows and flame (milestone 20, `js/shadows.js`, drawn in `js/render.js`)
Nothing is sent. `shadowOf(x, y, kind, lights)` takes the lights a browser can see (every player's lantern with its reach, each lit beacon at `LIT_RADIUS`, the lit lighthouse) and returns the direction away from them (nearer and brighter lights weigh more; lights that pull in opposite directions cancel), a length (a tower's is longer than a rock's: `CASTER`), a width and an opacity of at most `SHADOW_ALPHA_MAX` (0.5). A light reaches `LIGHT_SPAN` (1.15) times its radius and ignores a thing within 0.3 tile of itself. `drawShadows` collects the trees and rocks on screen and the beacons, lighthouse and well, keeps the darkest `CASTERS_MAX[level]` (0, 14, 40 at governor levels 0, 1, 2; `keepDarkest`) and draws them as ellipses before the crowns and the night layer, so the night darkens them. Level 2 adds a wider, fainter outer ellipse. `flameFlicker(t, seed, level, reduce)` gives a flame's lean, height factor and light factor; level 0 is one slow wave, levels 1 and 2 add faster ones, reduced motion is exactly steady. It drives the beacon flames (level 1 and above also draws a second tongue), the radius of a lit beacon's pool of light and the lighthouse lamp's pulse. The plain look (`?look=plain`) draws no shadows and keeps the old flame sway; `?shadows=off` leaves only the shadows out. Another player's lantern moves a tree's shadow on your screen only through the position you already know for them, so the two screens agree when both see the same lights. Tests: `shadows.test.mjs`. Frame cost was measured only in headless Chromium with software drawing.

## Footprints and wakes (milestone 29, `js/tracks.js`, drawn in `js/render.js`)
Nothing is sent. Each frame `drawTracks` gives `createTracks().update(t, walkers, kindAt)` every walker this browser can see (yourself with `me.moving`, and each peer's eased position with the `moving` flag its `st` messages carry) and a lookup of the ground: sand, meadow or shallow water take a mark, grass, deep water and everything else do not. A moving walker leaves a footprint every `STRIDE` (0.6) tile, alternating about 0.11 tile left and right of the line walked, or a wake every `WAKE_STRIDE` (0.45) tile on shallow water; marks are placed along the step just taken, so a slow frame that covers several strides still makes each one. A step longer than `JUMP` (2.5) tiles (a teleport, or a tab that was not drawing) restarts the walker's stride there and lays nothing across it. Footprints fade in a straight line over `FOOT_LIFE_MS` (6000), at most `FOOT_ALPHA` 0.42 on sand and 0.30 on meadow; a wake ring spreads from 0.09 to 0.5 tile over `WAKE_LIFE_MS` (2200) while it fades (`wakeRing`), at most 0.36. Caps: `FOOT_CAP` 36 and `WAKE_CAP` 8 per walker (the oldest of that walker's kind is dropped), `MARKS_CAP` 480 in all, and the governor draws only the newest `MARKS_DRAWN[level]` (0, 120, 300) marks; level 0 and `?look=plain` draw none, level 1 and reduced motion draw wake rings at a fixed size that only fade. A walker who leaves loses their stride anchor; their marks fade. Marks are drawn after the ground and before the nodes, fish, figures and night layer, so the night darkens them and a lantern shows them. `?tracks=off` and the test hook `setTracks` switch them off and forget them; `stressTracks(n)` (loopback pages only) draws a fixed spiral of made-up marks to measure the worst case. Because every browser works from its own view, two players can see a trail slightly differently. Cost in headless Chromium (software drawing): about +1.1 ms at 375 px and +1.4 to +1.6 ms at 1100 px for 300 made-up marks; see the CHANGELOG. Tests: `tests/tracks.test.mjs`.

## A lobby that stays small (milestone 30, `js/lobby.js`, `startResponder` in `js/main.js`)
The lobby room is a full mesh, so a page in a lantern now watches how many other pages it is linked to there (`links`, every join event, not only the first `LOBBY_PEERS`). `others()` is that count minus up to `ASKER_SLACK` (3) pages that sent it a question. When `others()` is above `LOBBY_LINK_CAP` (8) it sets one timer of `LEAVE_MIN_S` to `LEAVE_MAX_S` (2 to 6) seconds at random; when it fires it looks again and leaves the lobby only if still above the cap, so pages do not all leave at once. It then waits `REJOIN_S` (60 s, a random 75% to 125% of it; replaced by `?lobbyrest=` on a page served from 127.0.0.1 or localhost) and joins again; each time it leaves again within 120 s the wait doubles up to `REJOIN_MAX_S` (240 s). Nothing new is sent. Limits: the cap holds for settled links, not for the first seconds while pages join (and a rejoining page is one extra link for others until it leaves again or one of them does); a page that left cannot answer, so with more than about 9 pages in the lobby the hint is a sample of those that stayed, and a lantern's real size can be larger than shown (a full lantern may not show as full); a modified client that sends questions beyond the slack is still counted. Tested on the local transport only (`tests/lobbycap.test.mjs`).

## Carrying the flame (milestone 32, `js/flame.js`, `addFlame` in `js/beacon.js`)
A flame is a token in one page's memory (`held = { b, until }`), never saved and never counted by anyone else, so a flame that goes out (after `FLAME_LIFE_MS` 150 s, a reload, its holder leaving, or being used) loses nothing. `take()` needs a lit beacon within `BEACON_RANGE`, no flame held or offered, and `FLAME_GAP_MS` (45 s) since this page's last take (a page's own rule: a changed client can ignore it). Handing on is offer, accept, commit like a gift but with nothing to save: `fo {t}` to a player within `FLAME_RANGE` 3 tiles (a receiver accepts up to `FLAME_RANGE + FLAME_SLACK`, by its own view), `fa {t}` back, then the giver sets its flame to nothing before sending `fc {t, b, l}` (b the beacon it came from, l the whole seconds it still burns; passing it on does not renew it). `fd {t}` is no (receiver) or taken back (giver). A receiver remembers the last 8 offer numbers from each peer and refuses a repeat; it shows one offer at a time and refuses while it holds, expects or offers a flame. If the receiver leaves after saying yes, or the commit is lost, the flame is gone, never two. `fh {h}` (0 or 1) tells the room a player carries a flame; each browser draws a small orange tongue above that player's lantern (it is a flag on the peer, nothing else is learned). Lighting: `flame.light()` calls `beacon.addFlame()`, which puts `FLAME_FUEL` (half of `BEACON_NEED`, 6) into the lighter's own share with the same checks as `add()` (in reach, synced, beacon unlit, own share plus 6 within `MAX_OWN`) and the same `fu` message; a refused light keeps the flame. So a beacon lit with a flame still needs the other 6 fuel and a second player with a share; the shares are the same grow-only counters, so nothing about syncing, late joiners or lit beacons staying lit changed. Messages go through the same checks as the others (sender said hello, exact fields, whole numbers in range, 8 a second per sender, burst 16). Test: `tests/flame.test.mjs` (a fake mesh of three players, then three local pages).

## Light on the water (milestone 33, `js/glitter.js`, `drawGlitter` in `js/render.js`)
Nothing is sent. Each frame `drawGlitter` builds a list of lights from what this browser already holds: yours first, then every other player's lantern it can see (radius `lt.reach` times the lantern's `mult`; a snuffed lantern lays none), every lit beacon (`LIT_RADIUS` times 0.8, scaled by the flame's flicker) and the lit lighthouse (its `r` times `f` times 0.8). `lightStreaks` walks the water tiles (deep or shallow) in view within `REACH` (0.92) of each light, in the order given, and keeps the tiles whose seeded number `hash3(x, y, seed + 523)` is under `DENSITY` (0.6), so the same tiles carry streaks on every page; each gets a short horizontal dash whose opacity falls from `PEAK` (0.6) beside the light to 0 at its reach (`fall`) and which sways up to about 0.25 tile and brightens and dims over a few seconds (`streakState`). `moonStreaks` lays a column of dashes under the moon on the water in view: its column is the moon's place in the sky strip (`moonAt(hour).x`) spread over the middle 76% of the screen width, the column is `MOON_HALF` (2.2) tiles wide each side and narrows and fades toward the bottom of the view, brightest at midnight (`MOON_PEAK` 0.5 times `moonAt().lit`, so none at dusk and dawn) and dimmed by mist and rain. The streaks are drawn in the additive pass after the night layer, so they only add light; a streak within 0.45 tile of any player is left out, so a figure wading in the shallows stays clear. Governor levels: level 0 none, level 1 and 2 up to `STREAK_CAP` (90 and 240) of which the moon takes at most `MOON_CAP` (18 and 48). Reduced motion keeps the streaks, in place and steady (`streakState` with `reduce` is constant); `?glitter=off` leaves them out and `?look=plain` draws none. Contrast, measured as the dawn test does (`tests/glitter.test.mjs`, a shore at dusk, midnight and dawn, streaks switched off and on in turn): the player's, the lantern pool's and the path's ratios are the same within the measurement's own noise with the streaks on, and the streaks themselves read at about 1.3 to 1.5 times the brightness of the water beside them in the median; numbers are in the CHANGELOG. Lit beacons and the lit lighthouse are tried as lights in node only, not in a browser.

## Dawn and dusk (milestone 24, `js/skyglow.js`, drawn in `js/render.js`)
Nothing is sent: it is a function of the night hour (`hourAt` on the UTC clock, or `?hour=`), so every browser works it out alone. `endsAt(hour)` gives dusk and dawn strengths from 0 to 1: dusk builds over the 0.35 hours before hour 0 and fades over the 1.3 hours after it, dawn builds over 1.1 hours up to hour 7 and fades over the last 0.65 hours (`DUSK_SPAN`, `DAWN_SPAN`). `glowAt(hour, tint)` returns the night layer's tint pulled toward the sky colour (`WASH`: a blue at dusk, a grey at dawn, by `WASH_MIX` 0.8 of the strength), `darkAdd` (`VEIL_ADD`: the night layer is up to 0.14 darker at dusk and 0.16 at dawn, because the sky colour is lighter), `shadowLen` (shadows up to `SHADOW_STRETCH` 0.35 longer at dusk and 0.7 longer at dawn, applied in `drawShadows`) and the horizon line colour for the sky strip. At the ends every lantern also lays a warm pool on the ground (`GLOW_POOL` 0.40 peak opacity times the strength) so the lit area keeps its edge against the lighter sky. The sky strip gets a glow band low over the sea and a thin horizon line that shimmers by 8% with normal motion and is steady under reduced motion; `?look=plain` draws none of it. The colours follow the hour, which changes only over minutes. Contrast was measured on the canvas (`tests/skyglow.test.mjs`, ratio as the web's accessibility guide defines it): see the CHANGELOG for the numbers at dusk, midnight and dawn.

## Weather and the shades' sky (milestone 11, `js/weather.js`, drawn in `js/render.js`)
Look only, nothing sent. The weather is a pure function of the island's seed and the UTC clock (4-minute slots, each a clear, misty or
rainy target that the last 40 s of the previous slot eases into), so everyone in a lantern sees the same sky without a message. The
sky strip also darkens by how many shades the same plans (`shadeAt`) have out. Mist: a thin flat veil under the players plus drifting
banks from one cached sprite; rain: a cool tint and slanted streaks in one stroke; both drawn below the night layer or above it so lanterns
stay clear. Governor level 1 halves the drops and uses 3 banks, level 0 keeps only the flat veil, `?look=plain` draws none, reduced
motion draws no drops and holds the banks still. `?weather=clear|mist|rain` pins it (cosmetic; works for anyone). No new messages.

Two small effects since milestone 25 (still nothing sent): `nameAlpha(mist, tiles)` fades another player's name once they are farther than `MIST_NAME_TILES` (6) tiles, over `MIST_NAME_FADE` (2) more, scaled by how far the mist is above 0.12 up to `MIST_NAME_MIN` (0.35); render.js uses it for names only (figures, bubbles and the minimap are unchanged). `shadePaceAt(seed, slot, pinned)` gives 1 - `RAIN_SHADE_SLOW` (0.2) when the weather at the start of a shade slot is rain, else 1, and `shadePlan`/`shadeAt` take it as `pace` (the time a shade lingers is unchanged; a slowed shade's life is cut to fit its slot). `index.html` prints both numbers from the constants (`#weatherrule`).

## The living look (milestone 7, `js/living.js` and `js/render.js`)
Everything is drawn by each browser on its own from the seed and the clock; no message carries any of it. Per frame, only
the visible tiles are walked, using two byte arrays built once (`classify`: which tile glints, grows grass or is a tree;
which sides of a shallow tile touch dry land). Trees keep their dark crown in the baked map; the lit crown and flecks are
drawn each frame offset by `sway`. Shore foam is a pair of short bars per wet edge washing in and out; glints are 2-pixel
bars that blink; grass blades are two strokes on 30% of grass tiles (at most 220 a frame, one path per colour); reeds
sway in `drawNode`. Fireflies are a pure function of time (`fireflies`): 7 round a lit beacon, 3 round a coloured lantern,
1 round a plain one. The sky strip (top centre) shows the moon crossing from dusk to dawn (highest at hour 4) and 30
fixed stars faded by the night's darkness. Coloured lanterns get a smoothstep falloff (`softStops`, 5 colour stops).
**Measured cost lesson:** a first version used 9 colour stops on the lantern gradients and cost about 6.5 ms a frame more
(headless Chromium, software canvas, 375 px at devicePixelRatio 2); with 5 stops the whole living layer costs about 1 ms.
Keep gradients at 5 stops or fewer. Reduced motion: sway, foam position, glints, fireflies and stars hold still (the
water and trees are still drawn, only not moving); the test compares six whole-canvas pictures and finds them identical.
The governor (`createGovernor`) lowers the level when 90 frames average over 34 ms and never raises it again in the
same visit; level 1 drops glints, grass and most fireflies, level 0 drops fireflies too. `?look=plain` is the old look
without any of it (also used to compare cost), `?look=low` starts at level 0. `window.__longWatch.perf()` returns frame
and draw times of the last 240 frames, `setLevel(n)` sets the level (tests).

## The shades' look (milestone 9, `drawShades` in `js/render.js`)
Drawn per frame by each browser from the shade list (`shades.list()`), over the night layer so it is always found: a ground
shadow and three drifting mist ovals; two arm wisps with three finger strokes each that sway; a cloak path (hood point, two
bezier sides, a hem of five scallops that ripple) filled with a vertical gradient from violet to nothing, with a thin cold-teal
rim that keeps it readable on dark ground (gold only where light is strong); a near-black hood void with two pale eyes that
blink every few seconds and narrow in light; light from any lantern within reach thins the body (alpha down to half), shrinks it to
70% and bends the hood away from the nearest light, and throws off 3 to 9 rising sparks. A ring at the feet fills with the
light-seconds put on it, and "Shade: light n of 20" shows above it within 6 tiles. A driven-off shade bursts into 16 motes
(`renderer.burst`, 1.8 s). Everything is scaled 1.25 so a shade stands about two tiles tall. A snuffed player's lantern is drawn as a
dull ember with two curls of smoke. Reduced motion: no sway, ripple, blink, float or moving sparks (the shade still moves along its
path, because that is its place in the game). Cost measured in headless Chromium (software canvas): the draw averages about 1.3 ms a
frame with a shade on screen. Own drawing, no outside art.

## Spare relays (milestone 28, `js/net/relays.js`, `js/net/sockets.js`)
The one list of relays and trackers is `js/net/relays.js`; no other file names one, and no address ever comes from a peer. Each entry
has a role and a source. Nostr first choices (5): the five relays Trystero 0.25.4's own shuffle picks for this app id (the
test repeats the shuffle against the vendored list); BitTorrent first choices (3): the first three of Trystero's list. Source
"trystero" means the address is in the vendored Trystero list (that says nothing about whether it is up today). Spares: Nostr
`nos.lol` and `bucket.coracle.social` (source "trystero": in the vendored list; picked by the builder from it as names it recognised, not the shuffle's next ones), `relay.damus.io` and
`relay.primal.net` (source "memory": well-known public relays the builder remembers; a search for a current list this run found no
list confirming them, so they are unchecked); trackers `tracker.btorrent.xyz` and `tracker.files.fm:7073/announce` (source
"trystero": the last two of Trystero's five). None of these has been reached from the build sandbox, whose proxy refuses them.
How it works (`js/net/trystero.js`): the room joins over the first choices. `SPARE_AFTER_MS` (10000) later, if fewer than
`MIN_OPEN_RELAYS` (2) of that path's sockets are open and no player is linked on that path, the room is left and joined again over
the first choices plus the spares (`config.relayConfig.urls`; the library keeps the sockets already open). If a player is linked, it
looks again every `SPARE_RETRY_MS` (5000) rather than drop their links. It happens at most once per transport, and is not counted as a rebuild.
With 2 or more open at the check, or no spares, nothing changes. Counting (`js/net/sockets.js`): a subclass of `WebSocket`, installed
before the library opens one, counts per address the tries, opens, sockets closed before they opened (failures: refused,
unreachable, rejected) and sockets closed after opening; a socket that is still connecting is "pending", neither. At most 64
addresses are kept; only sums leave. The report and the "Connection" line show these (numbers only). Limits: a lone player with one
relay open and nobody linked gets spares only at the 10 s check; a player whose other relays are slow but not dead may get spares
needlessly (costs a few more sockets); the spares have never been tried over the real network.
Test flags (loopback pages only): `?relays=` (up to 4 first-choice relays), `?spare=` (Nostr spares), `?tspare=` (tracker spares).

## The connection report and the owner's online test (milestone 27, `js/net/report.js`)
The game panel has a "Connection" line and a "Copy connection report" button. Both are built by `js/net/report.js` from the
transport's `status()` and from the player's own lantern number, seconds in the lantern and players here now; nothing else.
Every figure is read as a whole number clamped to 0..`REPORT_MAX` (9999) and printed inside fixed words, so a string, an address
or a name that somehow reached `status()` would print as 0, not as itself. Relay and tracker addresses stay inside
`js/net/trystero.js` and `js/net/sockets.js` (since milestone 28 every WebSocket's open and close is counted per address as it
happens; the once-a-second sample of milestone 27 is gone); only counts leave them. What the text holds: the way (Nostr, BitTorrent, both, or local), lantern number,
seconds in the lantern, per path relays or trackers tried / open now / never opened / opened and then closed, players here now,
players met since entering (distinct ids, capped at `MAX_MET` 200), players gone again, links on both ways or one, connections
rebuilt by the link watchdog, messages dropped in transit, and one sentence that public relays have not been tested by the builders
(`PUBLIC_PLAY_TESTED_BY_BUILDERS`, checked against the newest CHANGELOG entry in `tests/report.test.mjs`). With a test relay (`?relay=`) a path has
one address, so "tried" is 1; on the live site it is the number of relays or trackers Trystero chose from its own lists.
Limits: "never opened" also counts a relay still connecting (the milestone 27 limit that a relay open for under a second was counted as
never opened ended with milestone 28's per-socket counting); failed WebRTC handshakes are not counted (only rebuilds after silence and players who joined and went); the report is
as good as this page's own view. The button writes to the clipboard only on a click; where the browser refuses, the text appears
in a read-only box, selected, to copy by hand. Nothing is sent anywhere by the report.

### Owner test checklist (two devices on two networks)
The aim is evidence from the real network: this has not been done by the builders since milestone 1 (the owner's one test on
2026-10-15), and not at all for fishing, the lobby, the music stone, trading or the report itself.
1. Use two devices on two different networks, for example a phone on mobile data and a computer on home wifi (not the same wifi).
   Open https://vigilstudio.github.io/game/ on both. Do not use `?net=`, `?relay=` or `?tracker=`.
2. On both, pick the **same lantern** (say Lantern 1; write down the number) and press Enter the island within about a minute of each other.
3. Wait up to 30 seconds. Note whether each device shows the other under "Players in this lantern" and how long it took.
4. Walk a little on one device and check the other sees it. Press a gesture or a phrase and check it arrives.
5. Optional, if time: have both press "Where are the others?" on the landing screen and see whether a lantern count appears; fish at the jetty together; light a beacon together.
6. On **each** device press "Copy connection report" and paste it into a GitHub issue on https://github.com/vigilstudio/vigilstudio.github.io/issues
   (one comment per device, with "phone, mobile data" or "computer, home wifi", the lantern number, and whether they met). The report is
   numbers only; read it before posting.
7. Read the numbers: relays open of tried on each path (0 of everything means that network blocks the relays); "Players met" 0 with
   relays open means the signalling worked but no direct link formed (a network that needs a TURN server); "rebuilt" above 0 means a link went silent and was rebuilt.
8. Leave with the Leave button on one device and check the other shows the player gone and the report counts 1 gone.

## Signalling from the build sandbox (checked 2026-10-15)
- Public Nostr relays (relay.damus.io, nos.lol, relay.mostr.pub, purplerelay.com, yabu.me, nostr.data.haus) and
  BitTorrent trackers (tracker.openwebtorrent.com, tracker.webtorrent.dev, tracker.btorrent.xyz) were **not
  reachable**: the sandbox's egress proxy refuses the connection (HTTP 403 to CONNECT). jsdelivr is refused too;
  npm is allowed (that is how the libraries were fetched).
- So real online play could not be tested from the sandbox. **Confirmed by the owner on 2026-10-15 (milestone 1):**
  a phone and a separate computer joined the same lantern over the public Nostr relays and saw each other and
  played together. Later entries need not mark basic online play as unverified; still unverified are networks that
  need TURN (some strict mobile or corporate networks) and each new feature over the real network until a person
  tries it.
- **Re-checked 2026-10-16 (milestone 13):** relay.damus.io, nos.lol and the trackers tracker.webtorrent.dev, tracker.openwebtorrent.com, open.ftorrent.com and tracker.btorrent.xyz were tried again with a WebSocket upgrade request; the proxy answered 403 to CONNECT for every one. Neither public path is reachable from the sandbox, so neither was tested; the BitTorrent path was tested only against a tracker the test starts on 127.0.0.1 (`tests/tracker-server.mjs`).
- **Re-checked 2026-10-17 (milestone 26, roadmap review):** relay.damus.io, nos.lol, tracker.webtorrent.dev and tracker.openwebtorrent.com: the proxy answered 403 to CONNECT for each. Still unreachable from the sandbox; online play over the public paths remains untested by the builders.
- What *is* tested: the full real code path (vendored Trystero, Nostr signalling messages, WebRTC data channels
  in Chromium) between two separate browser contexts, with signalling through `tests/nostr-relay.mjs`, a tiny
  Nostr relay the test starts on 127.0.0.1 (the page accepts `?relay=` only for 127.0.0.1/localhost, and main.js ignores it entirely when the page itself is served from any other host, such as the live site). Only the
  public relays and NAT traversal across real networks remain unchecked.

## File map
```
game/
  index.html            landing, lobby, game panel, honest notes, import map for the vendored modules
  js/main.js            boot: identity and save, room choice, game loop, movement and collision, status line
  js/world.js           seeded island generation, landmarks (beacons, lighthouse, jetty, well), tile queries, surfaces, fingerprints
  js/names.js           generated names and lantern colours from a seed (no free text, ever)
  js/presence.js        presence protocol v1: hi / st / by, validation, smoothing, timeouts
  js/resources.js       seeded gathering spots (driftwood, reeds, oil berries), respawn times (pure)
  js/beacon.js          beacons: shares counter (G-counter), lighting rule, fuel messages, snapshot for newcomers
  js/craft.js           crafting recipes, lantern table (reach, glow), the `lt` lantern message (rules are pure)
  js/give.js            giving: offer, accept, commit, receipt; faults never copy or lose an item
  js/swap.js            fair trades: `tro` `tra` `trn` `trx`, items set aside in the saved `hold` list, each half then sent as a gift
  js/inventory.js       saved pack and gift lists: checks, caps, adopting another tab's save (pure)
  js/gather.js          shared gathering: arbiter, hidden-until map, snapshots, validation
  js/talk.js            gestures and preset phrases: lists, send, validated receive, cooldowns
  js/arrows.js          edge arrows toward off-screen players (pure maths)
  js/guard.js           per-peer rate limiter (token bucket)
  js/input.js           keyboard and drag-joystick input
  js/nightclock.js      the eight-hour night from the UTC clock: light, tint, lantern reach (pure)
  js/minimap.js         minimap drawing, compass words, nearest-landmark text
  js/sound.js           sound, off by default: footsteps (stride counting, earshot gain, synthesised) and the music stone's notes
  js/stone.js           the music stone: spot beside the well, the tune of the night (pure), the `mn` message, receive checks, the glow
  js/living.js          the living island, pure parts: which tiles glint, foam or sway, sway and foam motion, moon and stars by hour, fireflies, soft light edges, the slow-device governor
  js/quests.js          the keeper's notes: notes from seed and day (pure), shares counter, `qp` `qq` `qs` messages, held-back credits, midnight change
  js/shades.js          the shades: slots, waves, a shade's path (pure), light-seconds shares counter, `hp` `hq` `hs` `sf` messages, snuffing and relighting, `?shadeclock=`
  js/shadows.js         shadows and flame, pure: a thing's shadow from the lights near it, the darkest N shadows kept, a flame's flicker by governor level
  js/tracks.js          footprints and wakes, pure: where a walker leaves a mark, how it fades, the caps, the newest N marks
  js/glitter.js         light on the water, pure: which water tiles a lantern, beacon or the lighthouse streaks, the moon's path, how a streak sways, the caps
  js/skyglow.js         dawn and dusk, pure: how strong each is by night hour, the sky colour the night layer takes, shadow stretch, the horizon line, contrast helpers
  js/weather.js         weather and the shades' sky, pure: mist and rain from seed and clock, rain drops, mist banks, how dark a shade wave makes the sky strip
  js/figure.js          character figure poses, pure: walk cycle (feet, lantern swing, head lean) and gesture poses; still with reduced motion
  js/lighthouse.js      the long watch kept: all beacons lit lights the lighthouse (pure), beam easing, shades held out of the beam
  js/rank.js            the lamplighter rank: deeds and points (pure), titles, the `rk` message
  js/fishing.js         fishing: fish from seed and clock (pure), casting, the bite and the timing press, the shoal, the `fl` message; lamp oil is `inv.oil`
  js/clock.js           the clock check: the `ck` message (my device clock), offsets per player, the plain note when a clock differs by 10 s or more
  js/flame.js           carrying the flame: take it from a lit beacon, hand it on (`fo` `fa` `fd` `fc`), the `fh` flag, the 150 s life; lighting goes through `addFlame` in beacon.js
  js/lobby.js           where the others are: the `lq` question and `lr` answer in the lobby room, the asker, the responder (and, since milestone 30, its link cap), the suggestion and its words
  js/render.js          canvas drawing: island, avatars, night layer with lantern light, names, and the living layer (water, foam, sway, fireflies, sky strip)
  js/net/transport.js   the transport interface, ?net= and ?relay= parsing
  js/net/local.js       BroadcastChannel transport (tests, offline)
  js/net/trystero.js    Trystero transport (nostr, torrent); link watchdog and offer-renewal fix
  js/net/relays.js      the one list of relays and trackers (role, source), the 2-open and 10 s thresholds
  js/net/sockets.js     counts WebSocket tries, opens and failures per address (sums only leave)
  js/net/report.js      the connection report: the "Connection" line and the copied text, numbers only, from status() (pure)
  js/net/auto.js        the default transport: Nostr and BitTorrent at once, one peer list (first link wins, keepalive on the second link)
  vendor/               Trystero 0.25.4 and @noble/secp256k1 3.2.0, with licences
  tests/presence.test.mjs  Playwright: local two-page test, room isolation, real WebRTC via local relay
  tests/talk.test.mjs      Playwright: phrases, gestures, cooldowns, forged messages, edge arrows (local and WebRTC)
  tests/world.test.mjs     node checks plus two local pages: landmarks, minimap, footsteps, light, reduced motion, size cap
  tests/gather.test.mjs    node checks of nodes and the arbiter on a fake mesh, then local and WebRTC pages: picks, contested picks, respawn, late joiner, arbiter leaving, forged messages
  tests/give.test.mjs      node checks of saved-pack rules and giving under faults, then local and WebRTC pages: offer, accept, reload, decline, take-back, leaving, gift on its way, forged messages
  tests/craft.test.mjs     node checks of recipes (conversion only, refusals, full stacks, saved data, the lantern message), then local and WebRTC pages: a second player sees the lantern's reach (drawn radius and ground brightness), late joiner, reload, full stack, forged messages
  tests/flame.test.mjs     node checks of the flame on a fake mesh (take, gap, hand-over, repeats, forged messages, every peer-leaving step, caps), then three local pages: take, pass on, light, reload drops it
  tests/beacon.test.mjs    node checks of the shares, caps, fuel messages and the presence watchdog, then local and WebRTC pages: fuel shared, one player alone cannot light, simultaneous adds, light on the ground, late joiner, reload, leaving, empty room, forged messages
  tests/living.test.mjs    node checks of tiles, motion, moon, fireflies, governor, then local and WebRTC pages: B's fireflies follow the lantern A holds, levels, reduced motion holds every pixel still, sky differs by hour, `?look=` flags, measured frame times
  tests/quests.test.mjs    node checks of the notes, shares and the module on a fake mesh, then local and WebRTC pages: three notes worked by two players, late joiner, reload, another day, forged messages
  tests/shades.test.mjs    node checks of the shades' paths, shares, caps and the module on a fake mesh (snuffing, ward, relight, flags, floods, slot change), then local and WebRTC pages: two players drive a circling shade off together without being snuffed, a lone player is snuffed and a friend relights, late joiner, forged messages
  tests/rank.test.mjs      node checks of the rank (deeds, gaps, caps, the message on a fake mesh, the shades module's "helped" event), then local and WebRTC pages: three gifts that arrive make a Lamplighter, the other player sees the title, a reload keeps the points, a gift too soon earns nothing, forged rank messages (local run)
  tests/craftgive.test.mjs node checks of giving wicks and lanterns on a fake mesh (every cap full and expired, a peer leaving, every message dropped or either side restarted, the lantern in hand), then local and WebRTC pages: Give buttons, full stack declined, a held lantern given, take-back, a player leaving
  tests/swap.test.mjs      node checks of trades under faults (drops and restarts after each message), every cap and timeout, a peer leaving at each step, hostile messages, then local and WebRTC pages
  tests/nostr-relay.mjs    minimal Nostr relay used by the test
  tests/tracker-server.mjs minimal BitTorrent WebSocket tracker (announce, offers, answers) used by the fallback test
  tests/fallback.test.mjs  flags, then real WebRTC: Nostr dead and tracker alive (they meet over the tracker, page says so), Nostr alive and tracker dead, both dead, `?net=torrent` by hand
  tests/both.test.mjs      one room across both paths: Nostr-only, BitTorrent-only and two both-path pages; nothing counted twice (phrase, gifts, beacon shares)
  tests/clock.test.mjs     node checks of the `ck` message, words and note, the module on a fake mesh (repeat, resend, strangers, floods, leaving), then local and WebRTC pages: a clock 180 s ahead is named on both pages, 4 s is not, the note goes when the player leaves
  tests/fishing.test.mjs   node checks of the fish, casting, bite, press, shoal and every cap (lamp oil stack, gifts, beacon share, line limits, silent peer) and hostile `fl` messages on fake meshes, then local and WebRTC pages (cast, catch, miss, shoal where no fish live, full stack, gifts, beacon) and reduced motion
  tests/shadows.test.mjs   node checks of the shadow rules (direction, length, cancelling lights, odd numbers, caps) and the flame's bounds, then local pages: a shadow follows another player's lantern, a beacon lit by two players throws shadows on both pages, levels 0 to 2, the plain look, reduced motion, and the frame cost at 375 and 1100 px
  tests/lobbycap.test.mjs  node checks of the link cap on a fake mesh, then 14 local pages in two lanterns plus an asker: links per page stay at 8 or fewer, the hint names the busiest lantern among the pages that stayed, leavers rejoin when it is quiet
  tests/lobby.test.mjs     node checks of the lobby messages, caps and rate limits on fake meshes, then local and WebRTC pages: three pages in two lanterns and one in the lobby (counts 2 and 1, a guess, the pick button, ending by itself, a leaver not counted)
  tests/report.test.mjs    node checks of the report builder (hostile status, clamping, the untested statement against the CHANGELOG), then local-relay pages: a live relay and a refused tracker counted, the clipboard text equals the page's, no id, name or address in it, a leaver counted once, a refused relay, both refused, a relay closed mid-play, no clipboard, local mode
  tests/loop.mjs           runs test files N times each, one at a time, and prints one exact `name passed/N` line per file (`node game/tests/loop.mjs 5 beacon talk`; no names means every file)
```
URL flags: `?net=auto|local|nostr|torrent` (default auto), `?mute=N` (tests only), `?hour=0..7.99` (pin the night hour), `?relay=ws://127.0.0.1:PORT`, `?tracker=ws://127.0.0.1:PORT`, `?relays=`, `?spare=` and `?tspare=` (comma lists on this machine; tests only, loopback pages), `?look=plain|low` (turn the living look off or start it at its lowest level), `?day=N` (pin the keeper's notes' day; loopback pages only), `?shadeclock=N` (shift the shades' clock by N ms; loopback pages only), `?clockskew=N` (the clock check pretends this page's clock is N s off; loopback pages only), `#room=N`.
`index.html` carries a Content-Security-Policy meta tag (scripts from 'self' plus the import map's hash; change the
import map and the hash must be recomputed). `window.__longWatch` exposes read-only copies of the world, self and peers for the tests.

## Testing
`node game/tests/presence.test.mjs`, `node game/tests/talk.test.mjs` and `node game/tests/world.test.mjs`, `node game/tests/gather.test.mjs`, `node game/tests/give.test.mjs`, `node game/tests/craftgive.test.mjs`, `node game/tests/fishing.test.mjs`, `node game/tests/lobby.test.mjs`, `node game/tests/craft.test.mjs`, `node game/tests/beacon.test.mjs`, `node game/tests/living.test.mjs`, `node game/tests/quests.test.mjs`, `node game/tests/shades.test.mjs`, `node game/tests/rank.test.mjs`, `node game/tests/clock.test.mjs`, `node game/tests/report.test.mjs`, `node game/tests/spares.test.mjs` and the others in `tests/` (add `--local` to skip the WebRTC part,
`SHOTS=dir` for screenshots), then
`node tools/page_check.mjs game/`. Every new shared feature gets a check in the test: what one page does,
the other must see.
To run files several times with exact counts: `node game/tests/loop.mjs N [names]` (one file and one run at a time, in the foreground; a failed run prints its FAIL lines and keeps its full log).

Note on vendoring: the vendored Trystero stays byte-identical but runs with an `rtcPolyfill` wrapper (`warmRenewals` in `js/net/trystero.js`) so that renewing an old pooled offer keeps its data channel; without it, late joiners after about a minute of idle often never connected. A rarer peer-join race remains unexplained.
