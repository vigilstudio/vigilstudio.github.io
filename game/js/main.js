// Boot and glue: identity, room choice, the game loop, and the small status panel.
import { figurePose } from "./figure.js";
import { generateWorld, spawnFor, isBlocked, tileAt, T, worldFingerprint } from "./world.js";
import { nameFor, colourFor, newSeed, isSeed } from "./names.js";
import { reportLine, reportText } from "./net/report.js";
import { createTransport, pickKind, pickTestRelay, pickTestTracker, pickTestMute } from "./net/transport.js";
import { createPresence } from "./presence.js";
import { createInput } from "./input.js";
import { createTalk, PHRASES, EMOTES } from "./talk.js";
import { createRenderer } from "./render.js";
import { createMinimap, describeNearest } from "./minimap.js";
import { skyAt, pickWeather, shadePaceAt, MIST_NAME_TILES, RAIN_SHADE_SLOW } from "./weather.js";
import { hourAt, lightFor, pickHour, HOURS } from "./nightclock.js";
import { createFootsteps, createStrideTracker, stepGain } from "./sound.js";
import { surfaceAt, landmarkFingerprint, BEACON_SIDES } from "./world.js";
import { generateNodes, nodeFingerprint, KINDS, KIND_NAMES } from "./resources.js";
import { createGather } from "./gather.js";
import { createGive, GIVE_RANGE } from "./give.js";
import { createSwap } from "./swap.js";
import { cleanSave, adoptSave, SOFT_STACK, CRAFTED, LAMP_KEYS, ITEMS } from "./inventory.js";
import { createBeacons, BEACON_NEED, BEACON_RANGE, LIT_RADIUS, MIN_PLAYERS, MAX_OWN, WORTH } from "./beacon.js";
import { createQuests, noteText, pickDay, shareCap, MIN_PLAYERS as NOTE_PLAYERS } from "./quests.js";
import { createShades, pickClockOffset, nextWaveIn, shadeCount, slotOf, SHADE_NEED, MIN_PLAYERS as SHADE_PLAYERS, EMBER_TILES, SNUFF_S, SAFE_FRACTION, MAX_SHARE as SHADE_CAP } from "./shades.js";
import { lighthouseOf, watchKept, holdOut, insideBeam, createBeam, LIGHTHOUSE_RADIUS } from "./lighthouse.js";
import { createRank, createRankNet, titleFor, pointsToNext, TITLES, THRESHOLDS } from "./rank.js";
import { createCraft, RECIPES, CRAFT_NAMES, ITEM_NAMES, LAMPS, recipeText, lampOf } from "./craft.js";
import { createFishing, CAST_MAX, SHOAL_RANGE, BITE_WINDOW_S, BITE_WINDOW_STILL_S, LINE_MAX_S, GROUND_RADIUS } from "./fishing.js";
import { createResponder, createAsker, suggest, lookText, LOBBY_ROOM, LOOK_S, LOBBY_JOIN_DELAY_S } from "./lobby.js";
import { createStone, NOTES, NOTE_NAMES, NOTE_HZ, TUNE_LEN, BEAT_MS, GLOW_S, REACH as STONE_REACH } from "./stone.js";
import { createClockCheck, clockNote, pickClockSkew, CLOCK_WARN_S } from "./clock.js";

const ROOMS = 6;
const SPEED = 4.2; // tiles per second
const RADIUS = 0.28; // tiles
const STORE = "vigil.longwatch.v1";

const $ = (id) => document.getElementById(id);
const world = generateWorld();
const netKind = pickKind(location.search);
const onLoopback = location.hostname === "127.0.0.1" || location.hostname === "localhost";
const testRelay = onLoopback ? pickTestRelay(location.search) : null; // ?relay= is ignored on the live site
const testTracker = onLoopback ? pickTestTracker(location.search) : null; // ?tracker= likewise (a BitTorrent tracker on this machine)
const testMute = onLoopback ? pickTestMute(location.search) : 0;     // so is ?mute=
const clockSkew = pickClockSkew(location.search, onLoopback);         // and ?clockskew= (seconds, for the clock check only)
let clockCheck = null;
const nodes = generateNodes(world);
const respawnPin = (() => { const v = Number(new URLSearchParams(location.search).get("respawn")); return Number.isInteger(v) && v >= 1 && v <= 600 ? v : 0; })(); // tests: shorter respawn

// ---- identity, saved only in this browser ----
// In local test mode each tab is its own character (sessionStorage), so two tabs can meet each other.
const store = () => (netKind === "local" ? sessionStorage : localStorage);
function loadSave() {
  try { const s = JSON.parse(store().getItem(STORE) || "null"); if (s && isSeed(s.seed)) return s; } catch { /* storage blocked */ }
  return { seed: newSeed() };
}
// The pack and the giving lists are saved with the character; every change to them is saved at once, not on a timer.
function save() {
  try { store().setItem(STORE, JSON.stringify({ seed: me.seed, x: me.x, y: me.y, inv, cr, lamp: held.lamp, help: rank.points, out: ledger.out, exp: ledger.exp, got: ledger.got, hold: ledger.hold })); } catch { /* storage blocked: the pack then lasts only while the page stays open */ }
}
const saved = loadSave();
const { inv, out, exp, got, hold, cr, lamp, help } = cleanSave(saved);
const rank = createRank(help, { onEvent: rankEvent, persist: () => save() });
const held = { lamp }; // the lantern in hand: 0 plain, 1 amber, 2 jade, 3 azure
const ledger = { out, exp, got, hold };
const start = (Number.isFinite(saved.x) && Number.isFinite(saved.y) && !isBlocked(world, saved.x, saved.y)) ? { x: saved.x, y: saved.y } : spawnFor(world, saved.seed);
const me = { id: "me", seed: saved.seed, name: nameFor(saved.seed), colour: colourFor(saved.seed), x: start.x, y: start.y, d: 0, moving: false, say: null, emote: null };
save();

// ---- room choice ----
function roomFromHash() {
  const m = /room=(\d+)/.exec(location.hash);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= ROOMS ? n : 1;
}
let roomNo = roomFromHash();
const roomButtons = $("rooms");
for (let i = 1; i <= ROOMS; i++) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "room"; b.textContent = `Lantern ${i}`; b.dataset.room = i;
  b.addEventListener("click", () => { roomNo = i; history.replaceState(null, "", `#room=${i}`); markRoom(); });
  roomButtons.append(b);
}
function markRoom() { for (const b of roomButtons.children) b.setAttribute("aria-pressed", String(Number(b.dataset.room) === roomNo)); }
markRoom();
$("you").textContent = me.name;
$("you").style.setProperty("--c", me.colour);
const PATH_NAME = { nostr: "Nostr relays", torrent: "BitTorrent trackers" };
const PATH_PAIR = "Nostr relays and BitTorrent trackers";
function paintPath(s) {
  let t;
  if (netKind === "local") t = "local test mode (tabs of this browser only)";
  else if (!s) t = netKind === "auto" ? `${PATH_PAIR} (both are used at once)` : PATH_NAME[netKind];
  else if (netKind !== "auto") t = `${PATH_NAME[netKind]}${s.relaysOpen ? " (connected)" : " (not reached)"}`;
  else if (s.open.length === 2) t = `${PATH_PAIR} (both connected)`;
  else if (s.open.length === 1) {
    const o = s.open[0], other = o === "nostr" ? "torrent" : "nostr";
    t = `${PATH_NAME[o]} (connected; ${s.paths[other] === "trying" ? `${PATH_NAME[other]} still being tried` : o === "torrent" ? "the Nostr relays could not be reached" : "the BitTorrent trackers could not be reached"})`;
  }
  else if (s.exhausted) t = "neither Nostr relays nor BitTorrent trackers could be reached";
  else t = `${PATH_PAIR} (trying)`;
  if ($("netkind").textContent !== t) $("netkind").textContent = t;
}
paintPath(null);

// ---- the game ----
const canvas = $("view");
const motionQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const reducedMotion = () => !!(motionQuery && motionQuery.matches);
const lookFlag = new URLSearchParams(location.search).get("look"); // "plain" or "low" (tests, slow devices); anything else = full
const renderer = createRenderer(canvas, world, { reducedMotion, look: lookFlag === "plain" || lookFlag === "low" ? lookFlag : "full", shadows: new URLSearchParams(location.search).get("shadows") !== "off" });
const minimap = createMinimap($("minimap"), world);
const steps = createFootsteps();
const strides = createStrideTracker();
const pinnedHour = pickHour(location.search);
const pinnedWeather = pickWeather(location.search); // ?weather=clear|mist|rain (tests, screenshots); otherwise from the seed and the clock
const lightNow = () => lightFor(pinnedHour ?? hourAt(Date.now()));
let lastHud = 0, lastMap = 0, mapOn = true;
const tapCounts = {};
let stone = null, fishing = null, fishView = null, rankNet = null, net = null, presence = null, talk = null, gather = null, give = null, swap = null, craft = null, beacon = null, quests = null, shades = null, playing = false, lastT = 0, lastSave = 0, joinedAt = 0;
const input = createInput(canvas, () => playing);

async function enter() {
  if (playing) return;
  $("enter").disabled = true;
  stopLook();
  try {
    net = await createTransport(netKind, `lantern-${roomNo}`, { relay: testRelay, tracker: testTracker, mute: testMute });
  } catch (e) {
    console.error(e);
    $("status").textContent = "Could not start networking in this browser.";
    $("enter").disabled = false;
    return;
  }
  if (onLoopback) { for (const k of Object.keys(tapCounts)) delete tapCounts[k]; net.onMessage((m) => { if (m && typeof m.k === "string" && m.k.length <= 8 && Object.keys(tapCounts).length < 40) tapCounts[m.k] = (tapCounts[m.k] | 0) + 1; }); } // tests only: how many messages of each kind reached the game
  presence = createPresence(net, world, me, updatePeers);
  talk = createTalk(net, me, presence.peers, (p, id) => { $("heard").textContent = `${p.name}: ${PHRASES[id]}`; });
  gather = createGather(net, world, me, presence.peers, nodes, { respawn: respawnPin, onEvent: gatherEvent, inv });
  give = createGive(net, me, presence.peers, inv, ledger, { onEvent: giveEvent, persist: save, cr, held, onLampDropped: () => { if (craft) craft.hold(0); }, busy: () => !!swap && swap.pending() });
  swap = createSwap(net, me, presence.peers, inv, ledger, { onEvent: swapEvent, persist: save, cr, held, onLampDropped: () => { if (craft) craft.hold(0); }, busy: () => !!give && !!(give.outgoing || give.incoming) });
  fishing = createFishing(net, world, me, presence.peers, { inv, persist: save, clock: shadeNow, still: reducedMotion, onEvent: fishEvent });
  craft = createCraft(net, me, presence.peers, inv, cr, held, { onEvent: craftEvent, persist: save });
  beacon = createBeacons(net, me, presence.peers, inv, beaconList, { onEvent: beaconEvent, persist: save });
  quests = createQuests(net, world, me, presence.peers, { onEvent: questEvent, beacons: beaconList.length, day: testDay });
  shades = createShades(net, world, me, presence.peers, { onEvent: shadeEvent, clock: shadeNow, paceFor: (slot) => shadePaceAt(world.seed, slot, pinnedWeather), reachFor: shadeReach, safeAt: shadeSafe, holdOut: shadeHold });
  rank.newVisit(); baseline.clear(); rankNet = createRankNet(net, me, presence.peers, rank); paintRank(true);
  clockCheck = createClockCheck(net, presence.peers, { clock: () => Date.now() + clockSkew * 1000 }); paintClock();
  stone = createStone(net, world, me, presence.peers, { clock: shadeNow, onEvent: stoneEvent }); $("stoneinfo").textContent = ""; paintStone(true);
  me.snuffed = false; $("shadeinfo").textContent = ""; lastShadeKey = ""; paintShades(true);
  me.say = null; me.emote = null; $("questinfo").textContent = "";
  paintQuests(true);
  paintBeacon(true); $("beaconinfo").textContent = ""; beam.reset(); wasKept = false; $("watchinfo").textContent = ""; paintWatch(true);
  $("fishinfo").textContent = ""; lastFishKey = ""; paintFish(null);
  paintPack(); paintCraft(); $("craftinfo").textContent = ""; paintGive(); $("gathered").textContent = ""; $("giveinfo").textContent = ""; $("tradeinfo").textContent = ""; lastTradeKey = ""; paintTrade();
  strides.clear(); lastHud = 0; setMap(true);
  playing = true; joinedAt = performance.now();
  document.body.classList.add("playing");
  $("roomname").textContent = `Lantern ${roomNo}`;
  renderer.resize();
  updatePeers();
  canvas.focus({ preventScroll: true });
  lastT = performance.now();
  requestAnimationFrame(frame);
  startResponder();
}

function leaveRoom() {
  if (!playing) return;
  stopResponder();
  if (swap) swap.cancel(); // an offer of mine that is still open: the item set aside goes back to the pack
  fishing.leave(); presence.leave(); net.leave();
  strides.clear(); setSteps(false); steps.close();
  playing = false; net = null; presence = null; talk = null; gather = null; give = null; swap = null; craft = null; beacon = null; quests = null; shades = null; rankNet = null; clockCheck = null; stone = null; renderer.setStone(null); fishing = null; fishView = null; paintFish(null); paintClock(); me.snuffed = false;
  paintShades(true); paintQuests(true); paintBeacon(true); setTalkOpen(false); $("heard").textContent = ""; paintGive(); paintTrade(); paintPack(); paintCraft();
  document.body.classList.remove("playing");
  $("connline").textContent = ""; $("copystate").textContent = ""; $("copyfallback").hidden = true;
  $("enter").disabled = false;
  $("enter").focus(); // the Leave button just hid; keep keyboard focus on something visible
  save();
}

function step(dt) {
  const v = input.read();
  me.moving = !!(v.x || v.y);
  if (!me.moving) return;
  me.d = Math.atan2(v.y, v.x);
  const slow = tileAt(world, me.x, me.y) === T.SHALLOW ? 0.55 : 1;
  const dx = v.x * SPEED * slow * dt, dy = v.y * SPEED * slow * dt;
  if (!hits(me.x + dx, me.y)) me.x += dx;
  if (!hits(me.x, me.y + dy)) me.y += dy;
}
function hits(x, y) {
  for (const [ox, oy] of [[-RADIUS, -RADIUS], [RADIUS, -RADIUS], [-RADIUS, RADIUS], [RADIUS, RADIUS]]) if (isBlocked(world, x + ox, y + oy)) return true;
  return false;
}

function frame(t) {
  if (!playing) return;
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  step(dt);
  presence.tick(t, dt);
  talk.tick(t);
  gather.tick();
  give.tick();
  swap.tick();
  craft.tick();
  fishing.tick();
  beacon.tick();
  quests.tick();
  beam.update(watchIsKept(), dt, reducedMotion());
  shades.tick(dt);
  rankNet.tick();
  renderer.setStone(stone ? { x: stone.spot.x, y: stone.spot.y, glow: stone.glow(), recent: stone.recent() } : null);
  watchBaselines();
  paintCooldowns(t);
  const light = lightNow();
  footsteps(light);
  const reach = gather.reach();
  const fires = fireList();
  renderer.draw(me, presence.peers, input.stick, t, light, gather.visible(), reach, fires, shades.list(), skyAt(world, shadeNow(), pinnedWeather), watchView(), fishView = fishing.view());
  paintFish(fishView);
  paintShades();
  paintRank();
  paintStone();
  paintBeacon();
  paintWatch();
  paintQuests();
  $("gather").disabled = !reach;
  paintGive();
  paintTrade();
  if (mapOn && t - lastMap > 100) { lastMap = t; minimap.draw(me, presence.peers.values(), fires, shades.list(), watchView(), stone ? { x: stone.spot.x, y: stone.spot.y, glow: stone.glow() } : null); }
  if (t - lastHud > 1000) { lastHud = t; paintHud(light); updateStatus(); if (clockCheck) clockCheck.tick(); paintClock(); }
  if (t - lastSave > 3000) { save(); lastSave = t; }
  requestAnimationFrame(frame);
}

// ---- footsteps: own steps, and steps of players walking within earshot ----
function footsteps(light) {
  const n = strides.advance("me", me.x, me.y, me.moving);
  for (let i = 0; i < n; i++) steps.step(surfaceAt(world, me.x, me.y), 1);
  for (const p of presence.peers.values()) {
    const k = strides.advance(p.id, p.x, p.y, p.moving);
    if (!k) continue;
    const g = stepGain(Math.hypot(p.x - me.x, p.y - me.y));
    for (let i = 0; i < k; i++) steps.step(surfaceAt(world, p.x, p.y), g * 0.7);
  }
}
// ---- gathering: E or the Gather button picks what is in reach; the room sees it vanish ----
function gatherEvent(type, kind) {
  if (type === "got") { if (quests) quests.credit("gather", kind); $("gathered").textContent = `You gathered ${KIND_NAMES[kind].toLowerCase()}.`; paintPack(); save(); }
  else $("gathered").textContent = `Someone was first to the ${KIND_NAMES[kind].toLowerCase()}.`;
}
function paintPack() {
  const away = ledger.out.length ? `. On its way to another player: ${ledger.out.map(e => `${ITEM_NAMES[ITEMS[e.i]]} for ${nameFor(e.s)}`).join(", ")}` : "";
  const made = CRAFTED.filter(k => cr[k] > 0).map(k => `${CRAFT_NAMES[k]} ${cr[k]}`);
  const aside = ledger.hold.length ? `. Set aside for a trade: ${ledger.hold.map(e => `${ITEM_NAMES[ITEMS[e.i]]} (${nameFor(e.s)})`).join(", ")}` : "";
  $("pack").textContent = "Pack (saved in this browser): " + KINDS.map(k => `${KIND_NAMES[k]} ${inv[k]}`).concat(made, [`Lamp oil ${inv.oil}`]).join(", ") + away + aside;
}
// ---- fishing: cast from the shore or the jetty, press Reel in when a fish bites; two players' floats close together draw a shoal ----
function fishEvent(type, extra) {
  const say = {
    cast: "You cast the line. Wait for a bite.",
    bite: "A fish is biting! Press Reel in now.",
    caught: `You caught a fish and pressed lamp oil from it. It burns as 3 fuel in a beacon.${extra && extra.shoal ? " The shoal brought it." : ""}`,
    early: "You reeled in before any bite. Nothing was caught.",
    escaped: "The fish got away. Cast again when you like.",
    full: `Your lamp oil stack is full (${SOFT_STACK}), so the fish was let go and nothing was added.`,
    timeout: `The line was out for ${LINE_MAX_S} seconds, so it was reeled in.`,
    slack: "You walked away from your float, so the line came in.",
    nowater: `There is no water in front of you within ${CAST_MAX} tiles. Face the water.`,
  }[type];
  if (say) $("fishinfo").textContent = say;
  if (type === "caught") { paintPack(); lastGiveKey = ""; save(); }
  lastFishKey = "";
}
function doFish() {
  if (!playing || !fishing) return;
  if (fishing.line) { fishing.reel(); return; }
  const r = fishing.castAhead();
  if (!r.ok && r.why === "cooldown") $("fishinfo").textContent = "Wait a moment before casting again.";
  else if (!r.ok && r.why !== "nowater") $("fishinfo").textContent = "That spot is not water within reach.";
}
let lastFishKey = "";
function paintFish(v) {
  const line = fishing ? fishing.line : null, sh = v && v.shoal ? fishing.shoal() : null;
  const other = sh && presence ? presence.peers.get(sh.id) : null;
  const key = [!!fishing, line ? line.phase : "", sh ? sh.id : "", inv.oil].join("|");
  if (key === lastFishKey) return;
  lastFishKey = key;
  $("fishing").hidden = !fishing;
  const btn = $("fishbtn");
  btn.textContent = !line ? "Cast line (F)" : line.phase === "bite" ? "Reel in now! (F)" : "Reel in (F)";
  btn.classList.toggle("primary", !!line && line.phase === "bite");
  $("fishstate").textContent = !fishing ? "" : !line
    ? `Face the water, up to ${CAST_MAX} tiles away, and cast. Fish come and go round the jetty (within about ${GROUND_RADIUS} tiles of its end). Lamp oil: ${inv.oil}.`
    : line.phase === "bite" ? `${line.fish >= 100 ? "A fish from the shoal is biting" : "A fish is biting"}. You have ${(reducedMotion() ? BITE_WINDOW_STILL_S : BITE_WINDOW_S)} seconds to reel in.`
    : sh && other ? `Line out. A shoal circles between your float and ${other.name}'s: fish bite from farther. Reel in on a bite.`
    : `Line out. Wait for a bite, then reel in. A second player fishing within ${SHOAL_RANGE} tiles of your float draws a shoal in for you both.`;
}
// ---- beacons: fuel an old beacon together; it lights when enough fuel is in and two or more players added some ----
const beaconList = world.landmarks.filter(l => l.kind === "beacon");
let helpNo = 0, giftNo = 0;
// The rank counts help only from this visit: what a share was when the lantern's state arrived is the baseline, and a
// beacon, note or shade counts for you only if your own share grew past it (so a reload into a lit beacon earns nothing).
const baseline = new Map();
function grew(key, own, synced) { if (!synced) return false; if (!baseline.has(key)) { baseline.set(key, own); return false; } return own > baseline.get(key); }
function watchBaselines() {
  if (beacon) beaconList.forEach((_, b) => grew("b" + b, beacon.shares.own(b, me.seed), beacon.synced()));
  if (quests) quests.notes.forEach((_, q) => grew(`q${quests.day}.${q}`, quests.shares.own(q, me.seed), quests.synced()));
  if (shades) for (let i = 0; i < 4; i++) grew(`s${shades.slot}.${i}`, shades.shares.own(i, me.seed), shades.synced());
}
// ---- the long watch kept: every beacon lit at once lights the ruined lighthouse (worked out from the beacon state; nothing is sent) ----
const lighthouse = lighthouseOf(world), beam = createBeam();
const watchIsKept = () => !!beacon && !!lighthouse && watchKept(beaconList.map((_, b) => beacon.shares.lit(b)));
const watchView = () => lighthouse && beam.f > 0 ? { x: lighthouse.x, y: lighthouse.y, f: beam.f, r: LIGHTHOUSE_RADIUS } : null;
let lastWatchKey = "", wasKept = false;
function paintWatch(force) {
  if (force) lastWatchKey = "";
  const kept = watchIsKept(), n = beacon ? beaconList.filter((_, b) => beacon.shares.lit(b)).length : 0;
  const key = !!beacon + "|" + kept + "|" + n;
  if (key === lastWatchKey) return;
  lastWatchKey = key;
  $("watch").hidden = !beacon || !lighthouse;
  $("watchstate").textContent = kept ? `The long watch is kept: all ${beaconList.length} beacons burn, so the ruined lighthouse is lit for everyone in this lantern (${LIGHTHOUSE_RADIUS} tiles of light). Shades keep out of its beam, and nobody inside it can be snuffed. It stays lit while anyone is here.`
    : `The long watch: ${n} of ${beaconList.length} beacons lit. Light all ${beaconList.length} at once and the ruined lighthouse lights for everyone in this lantern.`;
  if (kept && !wasKept) $("watchinfo").textContent = "All the beacons burn. The ruined lighthouse is lit!";
  wasKept = kept;
}
const FUEL_ITEMS = ["driftwood", "berries", "oil"];
const fireList = () => beaconList.map((l, b) => beacon ? { x: l.x, y: l.y, n: b, fuel: beacon.shares.fuel(b), frac: Math.min(1, beacon.shares.fuel(b) / BEACON_NEED), lit: beacon.shares.lit(b) } : { x: l.x, y: l.y, n: b, fuel: 0, frac: 0, lit: false });
const beaconBox = $("beaconbtns");
FUEL_ITEMS.forEach((k) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "ghost"; b.dataset.item = k; b.textContent = `Add ${ITEM_NAMES[k]} (${WORTH[k]} fuel)`;
  b.addEventListener("click", () => { if (beacon) beacon.add(k); canvas.focus({ preventScroll: true }); });
  beaconBox.append(b);
});
function beaconEvent(type, b, r) {
  let say = "";
  if (type === "added" && quests) quests.credit("fuel", null, b, WORTH[r.item]);
  if (type === "lit" && beacon && grew("b" + b, beacon.shares.own(b, me.seed), true)) rank.credit("beacon", String(b));
  if (type === "added") say = `You added ${ITEM_NAMES[r.item]} to the beacon. It is gone from your pack.`;
  else if (type === "lit") say = "A beacon is lit! It will burn while anyone is in this lantern.";
  else if (type === "refused") say = { far: `Stand within ${BEACON_RANGE} tiles of a beacon to add fuel.`, wait: "Still hearing from the others. Try again in a moment.", lit: "This beacon is already lit.", full: `You have added as much as one player can to this beacon (${MAX_OWN} fuel). Others have to add the rest.`, missing: `You have no ${ITEM_NAMES[r && r.item] || "such item"} to add.`, }[r && r.why] || "Nothing was added.";
  if (say) $("beaconinfo").textContent = say;
  if (type === "added") { paintPack(); lastGiveKey = ""; save(); }
  lastBeaconKey = "";
}
let lastBeaconKey = "";
function paintBeacon(force) {
  if (force) lastBeaconKey = "";
  const b = beacon ? beacon.near() : -1;
  const key = [!!beacon, b, b >= 0 ? beacon.shares.fuel(b) + "/" + beacon.shares.players(b) + "/" + beacon.shares.own(b, me.seed) : "", FUEL_ITEMS.map(k => inv[k]).join()].join("|");
  if (key === lastBeaconKey) return;
  lastBeaconKey = key;
  $("beacon").hidden = !beacon || b < 0;
  if (!beacon || b < 0) return;
  const f = beacon.shares.fuel(b), n = beacon.shares.players(b), lit = beacon.shares.lit(b);
  $("beaconstate").textContent = lit ? `This beacon is lit (${f} fuel from ${n} players).` : `Fuel ${f} of ${BEACON_NEED}, from ${n} player${n === 1 ? "" : "s"}. It lights when it has ${BEACON_NEED} and at least ${MIN_PLAYERS} players added some. You added ${beacon.shares.own(b, me.seed)} (at most ${MAX_OWN}).`;
  for (const btn of beaconBox.children) btn.disabled = lit || inv[btn.dataset.item] < 1;
}
// ---- the keeper's notes: three small quests a day (from the seed and the date), finished by the lantern together ----
const testDay = pickDay(location.search, onLoopback);
$("quests-min").textContent = NOTE_PLAYERS;
const beaconName = (b) => beaconList[b] ? BEACON_SIDES[beaconList[b].side] : "old";
let lastQuestKey = "";
function questLines() {
  if (!quests) return [];
  return quests.notes.map((note, q) => {
    const sh = quests.shares, done = sh.done(q), tot = sh.total(q), pl = sh.players(q), mine = sh.own(q, me.seed);
    const text = noteText(note, beaconName);
    return { q, done, line: done ? `Done: ${text}. ${tot} from ${pl} players.` : `${text}: ${Math.min(tot, note.need)} of ${note.need}, from ${pl} player${pl === 1 ? "" : "s"}. You added ${mine} (at most ${shareCap(note)}). It needs at least ${NOTE_PLAYERS} players.` };
  });
}
function questEvent(type, q) {
  if (type === "done" && grew(`q${quests.day}.${q}`, quests.shares.own(q, me.seed), true)) rank.credit("note", `${quests.day}.${q}`);
  if (type === "done") { const n = quests.notes[q]; $("questinfo").textContent = `The keeper's note is finished: ${noteText(n, beaconName)}. Well done, all of you.`; }
  else if (type === "newday") $("questinfo").textContent = "A new day: the keeper has written new notes.";
  lastQuestKey = "";
}
function paintQuests(force) {
  if (force) lastQuestKey = "";
  const lines = questLines();
  const key = quests ? quests.day + "|" + lines.map(l => l.line).join("|") : "";
  if (key === lastQuestKey) return;
  lastQuestKey = key;
  $("quests").hidden = !quests;
  const ul = $("questlist"); ul.textContent = "";
  for (const l of lines) { const li = document.createElement("li"); li.textContent = l.line; li.dataset.done = l.done ? "1" : "0"; ul.append(li); }
}
// ---- shades: slow night creatures that snuff lanterns; light drives them off, best by several players together ----
let shadeOffset = pickClockOffset(location.search, onLoopback);
const shadeNow = () => Date.now() + shadeOffset;
$("weatherrule").textContent = `Weather matters a little: in mist (rain brings mist too) the names of players farther than ${MIST_NAME_TILES} tiles fade, though they stay on the minimap; in rain the shades move ${Math.round(RAIN_SHADE_SLOW * 100)}% slower. Both come from the same weather your browser works out from the island and the clock; nothing is sent.`;
const shadeReach = (p) => (p.snuffed ? EMBER_TILES : lightNow().reach * lampOf(p.lamp).mult);
const shadeSafe = (x, y) => (!!beacon && beaconList.some((l, b) => beacon.shares.lit(b) && Math.hypot(l.x - x, l.y - y) <= LIT_RADIUS * SAFE_FRACTION)) || insideBeam(x, y, lighthouse, beam.f);
const shadeHold = (sh) => holdOut(sh, lighthouse, beam.f);
const compassWord = (dx, dy) => ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"][((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
let drivenOff = 0, snuffCount = 0, lastShadeKey = "";
const snuffLog = []; // the last few snuffs (slot, shade, where), for the tests' failure messages; numbers only, kept in this page
function shadeEvent(type, k, sh) {
  const say = {
    snuffed: `A shade snuffed your lantern. Stay near another player: their light can bring yours back, or it relights by itself in ${SNUFF_S} seconds. Nothing is lost.`,
    relit: "Your lantern is lit again. A shade cannot snuff it for a few seconds.",
    expired: "Your lantern is lit again. A shade cannot snuff it for a few seconds.",
    held: "A shade is held back by a friend's light. Stay together.",
    banished: "A shade is driven off by the light of you all. Well done.",
  }[type];
  if (type === "snuffed") {
    snuffCount++;
    const s = shades && shades.list().find(q => q.k === k);
    snuffLog.push({ slot: shades ? shades.slot : -1, k, u: s ? +s.u.toFixed(2) : null, phase: s ? s.phase : null, sx: s ? +s.x.toFixed(2) : null, sy: s ? +s.y.toFixed(2) : null, x: +me.x.toFixed(2), y: +me.y.toFixed(2), peers: presence ? presence.peers.size : 0 });
    if (snuffLog.length > 8) snuffLog.shift();
  }
  if (type === "helped") rank.credit("relight", `${k}.${++helpNo}`);
  if (type === "banished" && shades && grew(`s${shades.slot}.${k}`, shades.shares.own(k, me.seed), true)) rank.credit("shade", `${shades.slot}.${k}`);
  if (type === "banished") { drivenOff++; if (sh) renderer.burst(sh.x, sh.y, performance.now()); }
  if (say) $("shadeinfo").textContent = say;
  lastShadeKey = "";
}
function shadeLines() {
  if (!shades) return [];
  const ms = shadeNow(), out = [], list = shades.list().filter(s => !s.gone && s.alpha > 0.2);
  if (me.snuffed) out.push(`Your lantern is out (${Math.ceil(shades.snuffLeft())} s left). Another player's light nearby brings it back sooner.`);
  if (list.length) {
    list.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y));
    const n = list[0], d = Math.round(Math.hypot(n.x - me.x, n.y - me.y));
    out.push(`${list.length} shade${list.length === 1 ? " is" : "s are"} out on the island. The nearest is ${d} tiles ${compassWord(n.x - me.x, n.y - me.y)}: light ${Math.min(n.total, SHADE_NEED)} of ${SHADE_NEED} from ${n.players} player${n.players === 1 ? "" : "s"}${n.safe ? " (it cannot snuff anyone inside a lit beacon's light)" : ""}. A shade is driven off at ${SHADE_NEED} light-seconds from at least ${SHADE_PLAYERS} players; you add one for every second your lit lantern reaches it (at most ${SHADE_CAP}).`);
  } else {
    const w = nextWaveIn(world.seed, ms);
    out.push(w > 1 ? `No shades out right now. The next ones come in about ${Math.ceil(w / 10) * 10} seconds.` : "No shades out right now.");
  }
  if (drivenOff) out.push(`You have seen ${drivenOff} driven off since you came in.`);
  return out;
}
function paintShades(force) {
  if (force) lastShadeKey = "";
  const lines = shadeLines(), key = shades ? lines.join("|") : "";
  if (key === lastShadeKey) return;
  lastShadeKey = key;
  $("shades").hidden = !shades;
  $("shadestate").textContent = lines.join(" ");
}
// ---- rank: the lamplighter rank, earned only by helping others (see rank.js) ----
const DEED_WORDS = { relight: "relighting a friend's lantern", shade: "driving off a shade together", gift: "a gift that arrived", beacon: "lighting a beacon together", note: "finishing a keeper's note together", stone: "playing the music stone's tune together" };
function rankEvent(type, a, b) {
  if (type === "deed") $("rankinfo").textContent = `A point for ${DEED_WORDS[a]}.`;
  else if (type === "rank") $("rankinfo").textContent = `You are now a ${titleFor(a)}. Thank you for helping.`;
  lastRankKey = "";
}
let lastRankKey = "";
function paintRank(force) {
  if (force) lastRankKey = "";
  const peerKey = presence ? [...presence.peers.values()].map(p => p.id + ":" + (p.rank | 0)).join() : "";
  const key = [!!rankNet, rank.points, peerKey].join("|");
  if (key === lastRankKey) return;
  lastRankKey = key;
  $("rank").hidden = !rankNet;
  const r = rank.rank, next = pointsToNext(rank.points);
  $("rankstate").textContent = (r ? `Your rank: ${titleFor(r)}. ` : "You have no rank yet. ") + `Help points: ${rank.points}.` + (next ? ` ${next} more for the next rank.` : " That is the highest rank.");
  if (presence) updatePeers();
}
// ---- crafting: wicks and lanterns; ingredients are used up, and a full stack refuses ----
const craftBox = $("craftbtns"), holdBox = $("holdbtns");
CRAFTED.forEach((name) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "ghost"; b.dataset.recipe = name; b.textContent = `Make ${CRAFT_NAMES[name].toLowerCase()}`;
  b.title = `Uses ${recipeText(name)}`;
  b.addEventListener("click", () => { if (craft) craft.craft(name); canvas.focus({ preventScroll: true }); });
  craftBox.append(b);
});
LAMPS.forEach((l, n) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "ghost"; b.dataset.lamp = n; b.textContent = n ? `Hold ${l.name.toLowerCase()}` : "Hold plain lantern";
  b.addEventListener("click", () => { if (craft) craft.hold(n); canvas.focus({ preventScroll: true }); });
  holdBox.append(b);
});
$("recipes").textContent = CRAFTED.map(k => `${CRAFT_NAMES[k]}: ${recipeText(k)}`).join(". ") + ".";
function craftEvent(type, what, r, holding) {
  let say = "";
  if (type === "made" && quests) quests.credit("craft", what);
  if (type === "made") say = `You made one ${ITEM_NAMES[what]}. The ingredients are used up.` + (LAMP_KEYS.includes(what) && holding ? " You hold it now." : "");
  else if (type === "refused") say = r && r.why === "full" ? `Your ${ITEM_NAMES[what]} stack is full, so nothing was made and nothing was used.` : `Not enough ${r && r.item ? ITEM_NAMES[r.item] : "ingredients"} for a ${ITEM_NAMES[what]}. Nothing was used.`;
  else if (type === "hold") say = what ? `You now hold the ${LAMPS[what].name.toLowerCase()}. Everyone near you sees its light.` : "You hold the plain lantern again.";
  if (type === "made" || type === "hold") { paintPack(); lastGiveKey = ""; }
  if (say) $("craftinfo").textContent = say;
  paintCraft();
}
function paintCraft() {
  $("craft").hidden = !craft;
  for (const b of craftBox.children) b.disabled = !craft;
  for (const b of holdBox.children) {
    const n = Number(b.dataset.lamp), owned = n === 0 || cr[LAMP_KEYS[n - 1]] > 0;
    b.disabled = !craft || !owned; b.setAttribute("aria-pressed", String(held.lamp === n)); b.hidden = !owned;
  }
}
// ---- giving: offer to the nearest player, they accept, then the item moves ----
const giveBox = $("givebtns");
ITEMS.forEach((k, i) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "ghost"; b.dataset.kind = i; b.textContent = `Give ${ITEM_NAMES[k]}`;
  b.addEventListener("click", () => { if (give && give.offer(i)) paintGive(); canvas.focus({ preventScroll: true }); });
  giveBox.append(b);
});
const KIND_LOWER = (i) => ITEM_NAMES[ITEMS[i]];
const countOfItem = (i) => (CRAFTED.includes(ITEMS[i]) ? cr : inv)[ITEMS[i]];
function giveEvent(type, d) {
  const who = nameFor(d.seed), what = KIND_LOWER(d.kind);
  const say = {
    offering: `Offer sent to ${who}: one ${what}. Waiting for them to accept.`,
    offered: `${who} offers you one ${what}.`,
    accepted: `You accepted ${what} from ${who}. Waiting for it to arrive.`,
    sent: `You gave ${who} one ${what}; waiting for them to confirm it arrived.`,
    received: `You received one ${what} from ${who}.`,
    delivered: `${who} confirmed the ${what} arrived.`,
    declined: `${who} did not take the ${what}. It is still in your pack.`,
    cancelled: `The offer of ${what} ended. Nothing moved.`,
    expired: `The offer of ${what} timed out. Nothing moved.`,
    lost: `The offer of ${what} ended because ${who} left. Nothing moved.`,
  }[type];
  if (say) $("giveinfo").textContent = say;
  if (type === "delivered") rank.credit("gift", `${d.seed}.${++giftNo}`);
  if (type === "received" || type === "sent" || type === "delivered") { paintPack(); paintCraft(); }
  paintGive();
}
let lastGiveKey = "";
function paintGive() {
  const t = give ? give.target() : null, o = give ? give.outgoing : null, inc = give ? give.incoming : null;
  const key = [t ? t.id : "", o ? o.t : "", inc ? inc.t : "", ITEMS.map((_, i) => countOfItem(i)).join(), ledger.out.length, ledger.hold.length, !!give, !!swap && swap.pending()].join("|");
  if (key === lastGiveKey) return;
  lastGiveKey = key;
  $("give").hidden = !give;
  for (const b of giveBox.children) b.disabled = !give || !t || !!o || (!!swap && swap.pending()) || countOfItem(Number(b.dataset.kind)) < 1;
  $("givetarget").textContent = o ? `Offer to ${nameFor(o.seed)} is waiting for an answer.` : t ? `Nearest player in reach: ${t.name}.` : `No one within ${GIVE_RANGE} tiles to give to.`;
  $("givecancel").hidden = !o;
  $("offerbox").hidden = !inc;
  if (inc) $("offertext").textContent = `${nameFor(inc.seed)} offers you one ${KIND_LOWER(inc.i)}. Take it?`;
}
$("givecancel").addEventListener("click", () => { if (give) give.cancel(); paintGive(); });
$("offeryes").addEventListener("click", () => { if (give) give.accept(); paintGive(); canvas.focus({ preventScroll: true }); });
$("offerno").addEventListener("click", () => { if (give) give.decline(); paintGive(); canvas.focus({ preventScroll: true }); });
paintPack();

// ---- trading: one item for one item (swap.js). Offer, accept, then each half travels as a gift ----
const tradeGive = $("tradegive"), tradeWant = $("tradewant");
ITEMS.forEach((k, i) => { for (const sel of [tradeGive, tradeWant]) { const o = document.createElement("option"); o.value = i; o.textContent = ITEM_NAMES[k]; sel.append(o); } });
tradeWant.value = "1";
const TRADE_WHY = { stack: "their pack of that is full", list: "a waiting list is full", none: "they no longer have it", gone: "the item was gone", away: "they left" };
function swapEvent(type, d) {
  const gave = KIND_LOWER(d.i), want = d.j === undefined ? "" : KIND_LOWER(d.j), who = nameFor(d.seed);
  const say = {
    offering: `Trade offer sent to ${who}: your ${gave} for their ${want}. Your ${gave} is set aside until they answer.`,
    offered: `${who} offers you one ${gave} for one of your ${want}.`,
    accepted: `You accepted. Your ${want} is set aside until ${who}'s ${gave} arrives, then it goes to them.`,
    committed: `${who} accepted. Your ${gave} is on its way, and their ${want} will follow.`,
    paid: `${who}'s item arrived, so your ${KIND_LOWER(d.i)} is on its way to them.`,
    returned: `${who} withdrew the trade. Your ${KIND_LOWER(d.i)} is back in your pack.`,
    declined: `The trade was turned down. Nothing moved; your item is back in your pack.`,
    cancelled: `The trade ended. Nothing moved.`,
    expired: `The trade timed out. Nothing moved.`,
    lost: `The trade ended because ${who} left. Nothing moved.`,
    refused: `The trade did not go ahead (${TRADE_WHY[d.why] || "something changed"}). Nothing moved.`,
  }[type];
  if (say) $("tradeinfo").textContent = say;
  paintPack(); paintCraft(); lastGiveKey = ""; paintGive(); paintTrade();
}
let lastTradeKey = "";
function paintTrade() {
  const t = swap ? swap.target() : null, o = swap ? swap.outgoing : null, inc = swap ? swap.incoming : null;
  const gi = Number(tradeGive.value), wi = Number(tradeWant.value);
  const key = [t ? t.id : "", o ? o.t : "", inc ? inc.t : "", gi, wi, ITEMS.map((_, i) => countOfItem(i)).join(), ledger.out.length, ledger.hold.length, !!swap, !!give && !!(give.outgoing || give.incoming)].join("|");
  if (key === lastTradeKey) return;
  lastTradeKey = key;
  $("trade").hidden = !swap;
  $("tradego").disabled = !swap || !t || !!o || !!inc || gi === wi || countOfItem(gi) < 1 || (!!give && !!(give.outgoing || give.incoming));
  $("tradetarget").textContent = o ? `Offer to ${nameFor(o.seed)} is waiting for an answer.` : t ? `Nearest player in reach: ${t.name}.` : `No one within ${GIVE_RANGE} tiles to trade with.`;
  $("tradecancel").hidden = !o;
  $("tradebox").hidden = !inc;
  if (inc) $("tradetext").textContent = `${nameFor(inc.seed)} offers you one ${KIND_LOWER(inc.i)} for one of your ${KIND_LOWER(inc.j)}. Trade?`;
}
tradeGive.addEventListener("change", paintTrade); tradeWant.addEventListener("change", paintTrade);
$("tradego").addEventListener("click", () => { if (swap) swap.offer(Number(tradeGive.value), Number(tradeWant.value)); paintTrade(); canvas.focus({ preventScroll: true }); });
$("tradecancel").addEventListener("click", () => { if (swap) swap.cancel(); paintTrade(); });
$("tradeyes").addEventListener("click", () => { if (swap) swap.accept(); paintTrade(); canvas.focus({ preventScroll: true }); });
$("tradeno").addEventListener("click", () => { if (swap) swap.decline(); paintTrade(); canvas.focus({ preventScroll: true }); });
// Another tab of this browser may have saved a newer pack (same character): adopt it instead of overwriting it.
addEventListener("storage", (e) => {
  if (netKind === "local" || e.key !== STORE || !e.newValue) return;
  try { adoptSave(inv, ledger, JSON.parse(e.newValue), { cr, held }); me.lamp = held.lamp; paintPack(); paintCraft(); lastGiveKey = ""; } catch { /* ignore */ }
});
$("fishbtn").addEventListener("click", () => { doFish(); canvas.focus({ preventScroll: true }); });
addEventListener("keydown", (e) => {
  if (!playing || e.code !== "KeyF" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
  doFish();
});
function doGather() { if (playing) gather.pick(); }
$("gather").addEventListener("click", () => { doGather(); canvas.focus({ preventScroll: true }); });
addEventListener("keydown", (e) => {
  if (!playing || e.code !== "KeyE" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
  if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
  doGather();
});
function paintHud(light) {
  const near = describeNearest(world, me.x, me.y);
  const hour = `${light.name}, hour ${light.index + 1} of ${HOURS}`;
  $("where").textContent = `${hour}.` + (near ? ` Nearest landmark: ${near.name}, ${near.tiles} tiles ${near.dir}.` : "");
}
function setMap(on) {
  mapOn = on;
  $("minimap").hidden = !on;
  $("maptoggle").setAttribute("aria-pressed", String(on));
}
$("maptoggle").addEventListener("click", () => setMap(!mapOn));
function setSteps(on) {
  const state = steps.set(on);
  $("stepstoggle").setAttribute("aria-pressed", String(state));
  $("stepstoggle").textContent = steps.supported ? `Sound: ${state ? "on" : "off"}` : "Sound: not available here";
}
$("stepstoggle").addEventListener("click", () => setSteps(!steps.on));
if (!steps.supported) { $("stepstoggle").disabled = true; setSteps(false); }
addEventListener("keydown", (e) => {
  if (!playing || e.code !== "KeyM" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
  setMap(!mapOn);
});

// ---- the music stone: eight preset notes by the well; the tune of the night played by three players glows it ----
function stoneEvent(type, a, b) {
  if (type === "note") {
    const mine = a === "me", dist = Math.hypot(me.x - stone.spot.x, me.y - stone.spot.y);
    steps.note(NOTE_HZ[b], Math.max(0, Math.min(1, 1 - dist / 12)) * (mine ? 1 : 0.8)); // silent unless Sound is on
    lastStoneKey = "";
  } else if (type === "glow") {
    if (a.mine) {
      const got = rank.credit("stone", `${a.night}.${a.no}`);
      $("stoneinfo").textContent = got ? "The stone glows! Three of you played its tune together. A point for it." : "The stone glows! Three of you played its tune together.";
    } else $("stoneinfo").textContent = "The stone glows: three players played its tune together.";
    lastStoneKey = "";
  }
}
const stoneBtns = $("stonebtns");
for (let i = 0; i < NOTES; i++) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "tb"; b.textContent = NOTE_NAMES[i]; b.dataset.note = i;
  b.addEventListener("click", () => { if (stone) stone.play(i); });
  stoneBtns.append(b);
}
let lastStoneKey = "";
function paintStone(force) {
  if (force) lastStoneKey = "";
  const near = !!stone && stone.near(), glow = stone ? stone.glow() > 0 : false;
  const tune = stone ? stone.tune() : [];
  const key = [!!stone, near, glow, tune.join(), steps.on].join("|");
  if (key === lastStoneKey) return;
  lastStoneKey = key;
  $("stone").hidden = !near;
  $("stonestate").textContent = !stone ? "" : `Tonight's tune is ${tune.map(n => NOTE_NAMES[n]).join(", ")}. If ${TUNE_LEN} different players each play a different one of those notes within a beat (${BEAT_MS / 1000} seconds), the stone glows for ${GLOW_S} seconds for everyone here.${steps.on ? "" : " Turn Sound on to hear the notes."}`;
}
// ---- talk: gestures and preset phrases (buttons and the T key) ----
const GESTURE_NAMES = { wave: "Wave", bow: "Bow", point: "Point", cheer: "Cheer", sit: "Sit" };
function makeButtons(host, labels, kind, fn) {
  labels.forEach((label, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tb"; b.textContent = label; b.dataset.kind = kind; b.dataset.id = i;
    b.addEventListener("click", () => fn(i));
    host.append(b);
  });
}
makeButtons($("gestures"), EMOTES.map(e => GESTURE_NAMES[e]), "em", (i) => { if (talk) talk.emote(i); });
makeButtons($("phrases"), PHRASES, "say", (i) => { if (talk) talk.say(i); });
let lastCool = "";
function paintCooldowns(t) {
  const c = talk.cooldowns(t);
  const key = `${Math.round(c.say * 20)}/${Math.round(c.emote * 20)}`;
  if (key === lastCool) return;
  lastCool = key;
  for (const b of $("talkbox").querySelectorAll(".tb")) {
    const v = b.dataset.kind === "say" ? c.say : c.emote;
    b.style.setProperty("--cd", `${Math.round(v * 100)}%`);
    b.classList.toggle("cool", v > 0);
    b.setAttribute("aria-disabled", String(v > 0));
  }
}
function setTalkOpen(open) {
  $("talkbox").hidden = !open;
  $("talktoggle").setAttribute("aria-expanded", String(open));
}
$("talktoggle").addEventListener("click", () => setTalkOpen($("talkbox").hidden));
addEventListener("keydown", (e) => {
  if (!playing || e.code !== "KeyT" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
  const open = $("talkbox").hidden;
  setTalkOpen(open);
  if (open) $("talkbox").querySelector(".tb").focus(); else canvas.focus({ preventScroll: true });
});

function updatePeers() {
  if (!presence) return;
  const list = $("peers");
  list.replaceChildren();
  const add = (p, you) => {
    const li = document.createElement("li");
    li.style.setProperty("--c", p.colour);
    const title = titleFor(you ? rank.rank : p.rank);
    li.textContent = p.name + (title ? ` · ${title}` : "") + (you ? " (you)" : "");
    list.append(li);
  };
  add(me, true);
  for (const p of presence.peers.values()) add(p, false);
  updateStatus();
}

// The clock check (milestone 17): a plain note when another player's device clock differs from mine by CLOCK_WARN_S or
// more. The name is the generated one, rebuilt here from the seed; the note's words are fixed text in js/clock.js.
function paintClock() {
  const w = clockCheck && presence ? clockCheck.worst() : null;
  const p = w && presence.peers.get(w.id);
  const text = p ? clockNote(p.name, w.off) : "";
  const el = $("clocknote");
  if (el.textContent !== text) el.textContent = text;
  el.hidden = !text;
}

function updateStatus() {
  if (!net) return;
  const n = presence.peers.size;
  const s = net.status();
  let line;
  if (n > 0) line = n === 1 ? "1 other player is here with you." : `${n} other players are here with you.`;
  else if (net.kind === "local") line = "No one else yet. Open this page in another tab with the same room to meet yourself.";
  else if (s.relaysOpen === 0) line = performance.now() - joinedAt < 8000 ? "Connecting to the signalling relays…" : s.exhausted ? "Could not reach any signalling relay or tracker. Your network may block them; the island is still yours to walk." : "Could not reach any signalling relay yet. Your network may block them; the island is still yours to walk.";
  else line = `No one else in this lantern yet (listening on ${s.relaysOpen} ${s.relaysOpen === 1 ? "relay" : "relays"}, ${net.kind === "both" ? s.open.map(k => PATH_NAME[k]).join(" and ") : PATH_NAME[net.kind] || "relays"}). Others appear here when they enter the same lantern.${net.kind === "both" ? " A player who is on only one of the two ways meets you, but not a player who is only on the other." : " Players meet only others who connected the same way."}`;
  paintPath(s);
  $("status").textContent = line;
  const cl = reportLine(s, reportCtx());
  if ($("connline").textContent !== cl) $("connline").textContent = cl;
}
// The connection report (js/net/report.js): numbers only. Nothing a peer sent is passed in, only counts.
function reportCtx() { return { kind: net ? net.kind : "local", lantern: roomNo, seconds: Math.round((performance.now() - joinedAt) / 1000), playersNow: presence ? presence.peers.size : 0 }; }
let copyTimer = 0;
$("copyreport").addEventListener("click", async () => {
  if (!net) return;
  const text = reportText(net.status(), reportCtx());
  const say = (t) => { $("copystate").textContent = t; clearTimeout(copyTimer); copyTimer = setTimeout(() => { $("copystate").textContent = ""; }, 6000); };
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") throw new Error("no clipboard");
    await navigator.clipboard.writeText(text);
    $("copyfallback").hidden = true;
    say("Copied. Paste it where you report how the connection went.");
  } catch {
    const box = $("copyfallback");
    box.value = text; box.hidden = false; box.focus(); box.select();
    say("Your browser did not allow copying; the text is selected below, copy it by hand.");
  }
});

// ---- where the others are: a lobby room apart from the lanterns (js/lobby.js). A page inside a lantern answers a newcomer's
// question with its lantern number; a page on the landing screen asks for LOOK_S seconds, only when its player presses the button ----
let lobbyNet = null, lobbyResp = null, lookNet = null, look = null, lookTimer = 0, lookEnd = 0, lookCounts = null, lookState = "";
const lobbyOpts = () => ({ relay: testRelay, tracker: testTracker, mute: testMute });
// The lobby is joined LOBBY_JOIN_DELAY_S after entering, so the lantern's own connections are made first
// (milestone 21: joining both at once made the craft test's reconnect fail and log a WebRTC OperationError).
let lobbyJoin = 0;
function startResponder() {
  clearTimeout(lobbyJoin);
  lobbyJoin = setTimeout(async () => {
    if (!playing) return;
    try {
      const n = await createTransport(netKind, LOBBY_ROOM, lobbyOpts());
      if (!playing) { n.leave(); return; }
      lobbyNet = n; lobbyResp = createResponder(n, () => (playing ? roomNo : 0));
    } catch (e) { console.warn("lobby not joined", e); } // the game itself does not depend on it
  }, LOBBY_JOIN_DELAY_S * 1000);
}
function stopResponder() { clearTimeout(lobbyJoin); if (lobbyNet) { try { lobbyNet.leave(); } catch { /* already gone */ } } lobbyNet = null; lobbyResp = null; }
function paintLook() {
  const counts = lookCounts || new Array(7).fill(0), s = suggest(counts);
  $("lookstate").textContent = lookText(counts, lookState);
  const pick = $("lookpick");
  pick.hidden = !s || playing;
  if (s) { pick.textContent = `Pick Lantern ${s.room}`; pick.dataset.room = s.room; }
}
// lookGen: a start still waiting for its transport when stopLook runs (Enter pressed in the same tick) is cancelled,
// so it leaves its own transport and does not leave lookState stuck at "starting".
let lookGen = 0;
function stopLook() {
  lookGen++;
  clearInterval(lookTimer); lookTimer = 0;
  if (look) look.stop();
  if (lookNet) { try { lookNet.leave(); } catch { /* already gone */ } }
  lookNet = null;
  if (look && lookState === "looking") { lookState = "done"; lookCounts = look.counts(); paintLook(); }
  else if (lookState === "starting") { lookState = ""; $("lookstate").textContent = ""; }
  $("look").disabled = false;
}
async function startLook() {
  if (playing || lookNet || lookState === "starting") return;
  const gen = ++lookGen;
  lookState = "starting"; lookCounts = null; $("look").disabled = true;
  $("lookstate").textContent = "Asking around…";
  let n;
  try { n = await createTransport(netKind, LOBBY_ROOM, lobbyOpts()); }
  catch (e) { if (gen !== lookGen) return; console.warn("lobby not joined", e); lookState = ""; $("look").disabled = false; $("lookstate").textContent = "Could not ask: networking did not start in this browser."; return; }
  if (playing || gen !== lookGen) { try { n.leave(); } catch { /* already gone */ } return; }
  lookNet = n; look = createAsker(n); lookState = "looking"; lookEnd = performance.now() + LOOK_S * 1000;
  lookTimer = setInterval(() => {
    look.tick(); lookCounts = look.counts();
    if (performance.now() >= lookEnd) { stopLook(); return; }
    paintLook();
  }, 500);
  paintLook();
}
$("look").addEventListener("click", startLook);
$("lookpick").addEventListener("click", () => { const r = Number($("lookpick").dataset.room); if (r >= 1 && r <= ROOMS) { roomNo = r; history.replaceState(null, "", `#room=${r}`); markRoom(); } });

$("enter").addEventListener("click", enter);
$("leave").addEventListener("click", leaveRoom);
addEventListener("pagehide", () => { stopLook(); stopResponder(); if (playing) { presence.leave(); save(); } });
addEventListener("hashchange", () => { if (!playing) { roomNo = roomFromHash(); markRoom(); } });

// Read-only view for the tests (and the curious): plain copies, no handles into the game.
window.__longWatch = {
  netStatus: () => (net ? JSON.parse(JSON.stringify(net.status())) : null),
  world: () => ({ seed: world.seed, fingerprint: worldFingerprint(world), landmarks: landmarkFingerprint(world), landmarkList: world.landmarks.map(l => ({ kind: l.kind, x: l.x, y: l.y })) }),
  teleport: (x, y) => { if (Number.isFinite(x) && Number.isFinite(y) && !isBlocked(world, x, y)) { me.x = x; me.y = y; return true; } return false; }, // tests only: no network message can reach this
  light: () => lightNow(),
  sky: () => skyAt(world, shadeNow(), pinnedWeather),
  hud: () => ({ rebuilds: net ? net.status().rebuilds | 0 : 0, where: $("where").textContent, mapOn, minimapMarks: minimap.markCount(), stepsOn: steps.on, stepsPlayed: steps.played, stepsSupported: steps.supported, dropped: net ? net.status().dropped : 0, reducedMotion: reducedMotion() }),
  taps: () => ({ ...tapCounts }), // tests only (kept empty on the live site)
  lobby: () => ({ looking: lookState, counts: lookCounts ? [...lookCounts] : null, text: $("lookstate").textContent, pick: $("lookpick").hidden ? 0 : Number($("lookpick").dataset.room), answered: lobbyResp ? lobbyResp.answered() : 0, asked: look ? look.sent() : 0, heard: look ? look.heard() : 0, inLobby: !!lobbyNet }),
  peerLinks: () => (net && net.peerLinks ? net.peerLinks() : {}),
  linkHistory: () => net ? (net.status().history || []) : [],
  self: () => ({ id: net && net.selfId, name: me.name, seed: me.seed, x: me.x, y: me.y, playing, room: roomNo, net: net && net.kind }),
  peers: () => presence ? [...presence.peers.values()].map(p => ({ id: p.id, name: p.name, seed: p.seed, x: p.tx, y: p.ty, say: p.say ? p.say.id : null, emote: p.emote ? p.emote.id : null })) : [],
  nodes: () => nodes.map(n => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, respawn: n.respawn })),
  nodeFingerprint: () => nodeFingerprint(nodes),
  give: () => ({ inv: { ...inv }, cr: { ...cr }, lamp: held.lamp, out: ledger.out.map(e => ({ ...e })), exp: ledger.exp.map(e => ({ ...e })), got: ledger.got.map(e => ({ ...e })), outgoing: give ? give.outgoing : null, incoming: give ? give.incoming : null, target: give && give.target() ? give.target().id : null, info: $("giveinfo").textContent, softStack: SOFT_STACK }),
  beacon: () => beacon ? { fuel: beaconList.map((_, b) => beacon.shares.fuel(b)), players: beaconList.map((_, b) => beacon.shares.players(b)), lit: beaconList.map((_, b) => beacon.shares.lit(b)), own: beaconList.map((_, b) => beacon.shares.own(b, me.seed)), near: beacon.near(), synced: beacon.synced(), pending: beacon.pending(), inv: { ...inv }, info: $('beaconinfo').textContent, panel: !$('beacon').hidden, list: beaconList.map(l => ({ x: l.x, y: l.y })), fires: fireList() } : null,
  rank: () => ({ points: rank.points, rank: rank.rank, title: titleFor(rank.rank), seen: rank.seenCount(), panel: !$("rank").hidden, text: $("rankstate").textContent, info: $("rankinfo").textContent, peerRanks: presence ? [...presence.peers.values()].map(p => ({ id: p.id, rank: p.rank | 0 })) : [], saved: (() => { try { return JSON.parse(store().getItem(STORE) || "{}").help; } catch { return null; } })(), titles: TITLES.slice(), thresholds: THRESHOLDS.slice() }),
  quests: () => quests ? { day: quests.day, synced: quests.synced(), pending: quests.pending(), owed: quests.owed(), notes: quests.notes.map(n => ({ ...n })), text: quests.notes.map(n => noteText(n, beaconName)), total: quests.notes.map((_, q) => quests.shares.total(q)), players: quests.notes.map((_, q) => quests.shares.players(q)), own: quests.notes.map((_, q) => quests.shares.own(q, me.seed)), done: quests.notes.map((_, q) => quests.shares.done(q)), panel: !$("quests").hidden, lines: [...$("questlist").children].map(li => li.textContent), info: $("questinfo").textContent } : null,
  shades: () => shades ? { slot: shades.slot, synced: shades.synced(), pending: shades.pending(), owed: shades.owed(), count: shadeCount(world.seed, shades.slot), list: shades.list().map(s => ({ k: s.k, x: s.x, y: s.y, alpha: s.alpha, phase: s.phase, gone: s.gone, safe: s.safe, total: s.total, players: s.players, own: s.own })), snuffed: !!me.snuffed, snuffLeft: shades.snuffLeft(), peerSnuffed: presence ? [...presence.peers.values()].map(p => ({ id: p.id, snuffed: !!p.snuffed })) : [], panel: !$("shades").hidden, text: $("shadestate").textContent, info: $("shadeinfo").textContent, drivenOff } : null,
  pose: (id) => { const p = id === "me" || !presence ? me : presence.peers.get(id); return p ? figurePose(p.moving, performance.now(), (p.seed || 0) % 6.283, "", 0, reducedMotion()) : null; }, // tests only: the walk pose this browser would draw now
  shadeNow: () => shadeNow(),
  setShadeClock: (ms) => (onLoopback && Number.isInteger(ms) && Math.abs(ms) < 1e13 ? (shadeOffset = ms, true) : false), // tests only, and only on a page served from this machine
  snuffCount: () => snuffCount,
  stone: () => stone ? { x: stone.spot.x, y: stone.spot.y, near: stone.near(), tune: stone.tune(), glow: stone.glow(), recent: stone.recent(), stats: stone.stats(), panel: !$("stone").hidden, text: $("stonestate").textContent, info: $("stoneinfo").textContent, notesPlayed: steps.notesPlayed, soundOn: steps.on, reach: STONE_REACH, rank: rank.points } : null,
  clock: () => ({ skew: clockSkew, warnS: CLOCK_WARN_S, offsets: clockCheck ? clockCheck.offsets() : [], note: $("clocknote").hidden ? "" : $("clocknote").textContent }),
  snuffLog: () => snuffLog.map(e => ({ ...e })),
  watch: () => ({ kept: watchIsKept(), f: beam.f, view: watchView(), lighthouse: lighthouse ? { x: lighthouse.x, y: lighthouse.y } : null, radius: LIGHTHOUSE_RADIUS, panel: !$("watch").hidden, text: $("watchstate").textContent, info: $("watchinfo").textContent }),
  fish: () => { const fv = fishing ? fishing.view() : null; return fishing ? { line: fishing.line, shoal: (() => { const s = fishing.shoal(); return s ? { id: s.id, x: s.x, y: s.y } : null; })(), fish: fv.fish.map(f => ({ id: f.id, x: f.x, y: f.y, alpha: f.alpha, shoal: f.shoal })), lines: fv.lines.map(l => ({ ...l })), oil: inv.oil, info: $("fishinfo").textContent, state: $("fishstate").textContent, btn: $("fishbtn").textContent, panel: !$("fishing").hidden, peerLines: presence ? [...presence.peers.values()].map(p => ({ id: p.id, line: p.line ? { x: p.line.x, y: p.line.y } : null })) : [] } : null; },
  castAt: (x, y) => (fishing ? fishing.cast(x, y) : null), // tests only; the real cast goes through the button and F
  castAhead: () => (fishing ? fishing.castAhead() : null),
  reel: () => (fishing ? fishing.reel() : null),
  connection: () => ({ line: $("connline").textContent, text: net ? reportText(net.status(), reportCtx()) : "", copyState: $("copystate").textContent, fallback: $("copyfallback").hidden ? "" : $("copyfallback").value }),
  face: (d) => { if (Number.isFinite(d)) { me.d = d; return true; } return false; }, // tests only
  addFuel: (item) => beacon ? beacon.add(item) : null,
  craft: () => ({ inv: { ...inv }, cr: { ...cr }, lamp: held.lamp, info: $("craftinfo").textContent, peerLamps: presence ? [...presence.peers.values()].map(p => ({ id: p.id, lamp: p.lamp | 0 })) : [] }),
  makeItem: (name) => { if (!craft) return null; const r = craft.craft(name); return r; },
  holdLamp: (n) => !!craft && craft.hold(n),
  lights: () => renderer.lights(),
  perf: () => renderer.stats(),
  setLevel: (l) => renderer.setLevel(l),
  setShadows: (on) => renderer.setShadows(on), // tests only: switch the shadows on or off to measure and compare
  offer: (i) => !!give && give.offer(i),
  accept: () => !!give && give.accept(),
  decline: () => !!give && give.decline(),
  cancelOffer: () => !!give && give.cancel(),
  trade: () => ({ inv: { ...inv }, cr: { ...cr }, lamp: held.lamp, out: ledger.out.map(e => ({ ...e })), exp: ledger.exp.map(e => ({ ...e })), got: ledger.got.map(e => ({ ...e })), hold: ledger.hold.map(e => ({ ...e })), outgoing: swap ? swap.outgoing : null, incoming: swap ? swap.incoming : null, target: swap && swap.target() ? swap.target().id : null, info: $("tradeinfo").textContent, panel: !$("trade").hidden, go: !$("tradego").disabled, boxShown: !$("tradebox").hidden }),
  tradeOffer: (i, j) => !!swap && swap.offer(i, j),
  tradeAccept: () => !!swap && swap.accept(),
  tradeDecline: () => !!swap && swap.decline(),
  tradeCancel: () => !!swap && swap.cancel(),
  gather: () => gather ? { hidden: nodes.filter(n => gather.isHidden(n.id)).map(n => n.id), inv: { ...gather.inv }, synced: gather.synced, arbiter: gather.arbiterId(), isArbiter: gather.isArbiter(), reach: gather.reach()?.id ?? null } : null,
  pick: () => !!gather && !!gather.pick(),
  mine: () => ({ say: me.say ? me.say.id : null, emote: me.emote ? me.emote.id : null }),
  say: (i) => !!talk && talk.say(i),
  emote: (i) => !!talk && talk.emote(i),
  arrows: () => renderer.arrows(),
  phrases: PHRASES.length,
};
