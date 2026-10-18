#!/usr/bin/env node
// Milestone 19 tests for The Long Watch: the jetty's fishing and lamp oil.
//
//   node game/tests/fishing.test.mjs            node checks, local transport, then real Trystero/WebRTC via a local Nostr relay
//   node game/tests/fishing.test.mjs --local    skip the WebRTC part
//   SHOTS=dir node ...                          also save screenshots (a bite, a shoal; 375 and 1100 px)
//   CHROME=/path/to/headless_shell              use this browser binary
//
// Part 0 (node): the fish are a pure function of the seed and the clock; casting, the bite, the timing press, the early press,
// the missed bite, the reduced-motion window, the shoal (two floats close together, for both, nowhere else), and every cap
// when full or expired: the lamp oil stack (full at the press, filled between the bite and the press), the cast cooldown, the
// line's time limit, a walk away from the float, a shoal that lapses when a peer goes silent or leaves; then the same oil through
// the gift machinery (receiver stack full, filled between offer and accept, receiver's expected list full and filled between
// steps, giver's on-its-way list full, giver's oil gone between offer and accept) and the beacon (3 fuel, one player's share cap of
// 16 with mixed items, a lit beacon, missing oil). Forged "fl" messages change nothing.
// Then pages: the F key and the buttons, a catch on a natural fish, an early press and a missed bite, a shoal that brings fish
// where there are none for both players, a full stack that lets the fish go, the same fish for two players, lamp oil given and
// burned in a beacon, reduced motion, and that nothing but the float's tile is sent about fishing.
// "Online play" here means a local relay on this machine, not the public relays.
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRelay } from "./nostr-relay.mjs";
import { generateWorld, T, isBlocked, tileAt } from "../js/world.js";
import * as F from "../js/fishing.js";
import { createFishing, fishAt, shoalFish, biteFish, castTarget, pairKey, groundCentre, jettyOf, slotOfMs, FISH_SLOT_S, GROUND_RADIUS, BITE_WINDOW_S, BITE_WINDOW_STILL_S, SHOAL_RANGE, SHOAL_SETTLE_S, SHOAL_FISH, LINE_MAX_S, LINE_TTL_S, CAST_COOLDOWN_S, CAST_MAX, MAX_FISH, SLACK_WALK } from "../js/fishing.js";
import { cleanSave, adoptSave, ITEMS, SOFT_STACK, MAX_OUT, MAX_EXP, FISHED } from "../js/inventory.js";
import { createGive, OFFER_MS } from "../js/give.js";
import { createShares, canAdd, createBeacons, WORTH, MAX_OWN, BEACON_NEED } from "../js/beacon.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const onlyLocal = process.argv.includes("--local");
const shots = process.env.SHOTS;
const STORE = "vigil.longwatch.v1";

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const world = generateWorld();
const jetty = jettyOf(world), gc = groundCentre(world);
const PLANK = { x: jetty.x + 0.5, y: jetty.y }; // the outer plank's middle (the jetty runs east from the shore here)
const OIL = ITEMS.indexOf("oil");

// ---- helpers shared by node and pages ----
const isWaterAt = (x, y) => { const t = tileAt(world, x, y); return t === T.SHALLOW || t === T.DEEP; };
// A slot number far from anything else, and a time in it at which every fish that exists is fully there (every fish lives 8 s to 16 s of its slot).
const slotMs = (s, u = 10) => s * FISH_SLOT_S * 1000 + u * 1000;
// A natural fish near the jetty's middle: { ms, fish } with its place a few tiles from where a player stands on the planks.
function findJettyFish(from = 40000, dMin = 1.8, dMax = 3.8, skip = 0) {
  let n = 0;
  for (let s = from; s < from + 400; s++) {
    const ms = slotMs(s);
    const near = fishAt(world, ms).filter(f => { const d = Math.hypot(f.bx - PLANK.x, f.by - PLANK.y); return d >= dMin && d <= dMax && f.alpha === 1; });
    // the float must also be the only thing the bite can come from: no other fish within the bite radius of this one
    for (const f of near) { if (fishAt(world, ms).filter(g => Math.hypot(g.x - f.bx, g.y - f.by) <= F.BITE_R).length >= 1 && n++ >= skip) return { ms, fish: f, slot: s }; }
  }
  return null;
}
// Shore spots far from the jetty with water three and four tiles out: nothing natural lives there, so only a shoal can bite.
const FAR = (() => {
  const out = [];
  for (let y = 3; y < 125; y++) for (let x = 3; x < 125; x++) {
    const t = tileAt(world, x, y);
    if (!(t === T.SAND || t === T.GRASS || t === T.MEADOW) || isBlocked(world, x + 0.5, y + 0.5) || Math.hypot(x - gc.x, y - gc.y) < GROUND_RADIUS + 14) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if ([2, 3, 4].every(d => isWaterAt(x + dx * d, y + dy * d))) out.push({ x: x + 0.5, y: y + 0.5, dx, dy, ang: Math.atan2(dy, dx) });
  }
  return out;
})();

console.log("# the fish, in node");
{
  ok(!!jetty && !!gc, `the island has a jetty at (${jetty.x}, ${jetty.y}); the fishing ground is round its outer end (${gc.x}, ${gc.y})`);
  const a = fishAt(world, 1.7e12 + 12345), b = fishAt(world, 1.7e12 + 12345);
  ok(JSON.stringify(a) === JSON.stringify(b), "the same clock gives exactly the same fish (a pure function of the seed and the time)");
  let total = 0, slots = 0, outside = 0, dry = 0, badAlpha = 0, maxAt = 0; const idsBySlot = [];
  for (let s = 40000; s < 40200; s++) {
    for (const u of [0.5, 4, 10, 15, 20, 23.5]) {
      const f = fishAt(world, slotMs(s, u));
      maxAt = Math.max(maxAt, f.length);
      for (const q of f) {
        if (Math.hypot(q.x - gc.x, q.y - gc.y) > GROUND_RADIUS + 1.5) outside++;
        if (!isWaterAt(q.x, q.y) || !isWaterAt(q.bx, q.by)) dry++;
        if (!(q.alpha >= 0 && q.alpha <= 1) || !Number.isFinite(q.x + q.y)) badAlpha++;
      }
    }
    const mid = fishAt(world, slotMs(s, 10)); total += mid.length; slots++; idsBySlot.push(mid.map(q => `${q.id}@${q.bx},${q.by}`).join());
  }
  ok(outside === 0 && dry === 0 && badAlpha === 0, "over 200 slots at six times each, every fish is over water within about GROUND_RADIUS of the jetty's end, with an alpha from 0 to 1");
  ok(total / slots > 2 && maxAt <= MAX_FISH, `about ${(total / slots).toFixed(1)} fish at mid-slot on average, never more than MAX_FISH (${MAX_FISH}; most seen ${maxAt})`);
  ok(new Set(idsBySlot).size > 150, "the fish differ from slot to slot (they come and go)");
  const early = fishAt(world, slotMs(40001, 0.2)), mid = fishAt(world, slotMs(40001, 10)), late = fishAt(world, slotMs(40001, 23.9));
  ok(mid.length > 0 && early.length <= mid.length && late.length <= mid.length && mid.every(q => q.alpha === 1), "fish fade in after the slot starts and out before it ends; at mid-slot every fish that exists is fully there");
  ok(mid.some(q => Math.hypot(q.x - q.bx, q.y - q.by) > 0.05) && fishAt(world, slotMs(40001, 10), true).every(q => q.x === q.bx && q.y === q.by), "fish drift round their place, and with reduced motion (still) they stay on it");
  ok(fishAt(world, NaN).length === 0 && fishAt(world, Infinity).length === 0 && fishAt({ ...world, landmarks: [] }, slotMs(40001)).length === 0, "a bad clock, or an island without a jetty, gives no fish and no error");
  ok(pairKey(5, 99) === pairKey(99, 5) && pairKey(5, 99) !== pairKey(5, 100), "a pair's key is the same whichever way round");
  const s1 = shoalFish(world, 1e12, 30.5, 40.5, pairKey(5, 99)), s2 = shoalFish(world, 1e12, 30.5, 40.5, pairKey(99, 5));
  ok(JSON.stringify(s1) === JSON.stringify(s2) && s1.length === SHOAL_FISH && s1.every(q => Math.abs(Math.hypot(q.x - 30.5, q.y - 40.5) - F.SHOAL_RING) < 1e-9 && q.shoal), "a shoal is the same for both players of the pair: SHOAL_FISH fish on a ring round the middle");
  ok(shoalFish(world, 1e12, 30.5, 40.5, 7, true).every((q, i, arr) => q.x === shoalFish(world, 2e12, 30.5, 40.5, 7, true)[i].x), "with reduced motion the shoal does not turn");
  const t0 = { x: 3.5, y: 3.5, alpha: 1, shoal: false };
  ok(biteFish([t0], 3.5 + F.BITE_R - 0.01, 3.5) && !biteFish([t0], 3.5 + F.BITE_R + 0.01, 3.5) && biteFish([{ ...t0, shoal: true }], 3.5 + F.SHOAL_BITE_R - 0.01, 3.5) && !biteFish([{ ...t0, shoal: true }], 3.5 + F.SHOAL_BITE_R + 0.01, 3.5) && !biteFish([{ ...t0, alpha: 0.3 }], 3.5, 3.5), "a natural fish bites within BITE_R, a shoal fish within SHOAL_BITE_R, a fish still fading in does not");
  const east = castTarget(world, PLANK.x, PLANK.y, 0);
  ok(east && isWaterAt(east.x, east.y) && Math.hypot(east.x - PLANK.x, east.y - PLANK.y) <= CAST_MAX + 0.01, `a cast from the planks facing out goes to the farthest water within ${CAST_MAX} tiles (${east && east.x}, ${east && east.y})`);
  ok(castTarget(world, 64.5, 64.5, 0) === null || isWaterAt(...Object.values(castTarget(world, 64.5, 64.5, 0))), "a cast away from water finds none (or water)");
  ok(castTarget(world, NaN, 5, 0) === null && castTarget(world, 5, 5, NaN) === null && castTarget(world, 1e9, 1e9, 1) === null, "odd numbers give no cast target");
}

// ---- lamp oil in the pack ----
console.log("\n# lamp oil: the pack and the numbers, in node");
{
  const IDX = Object.fromEntries(ITEMS.map((k, i) => [k, i]));
  ok(IDX.driftwood === 0 && IDX.reeds === 1 && IDX.berries === 2 && IDX.wick === 3 && IDX.amber === 4 && IDX.jade === 5 && IDX.azure === 6 && IDX.oil === 7 && ITEMS.length === 8, "lamp oil is item 7, after the crafted things; every older item keeps its number");
  ok(cleanSave({}).inv.oil === 0 && cleanSave({ inv: { oil: 12 } }).inv.oil === 12 && cleanSave({ inv: { oil: -1 } }).inv.oil === 0 && cleanSave({ inv: { oil: 1.5 } }).inv.oil === 0 && cleanSave({ inv: { oil: 1e9 } }).inv.oil === 0 && cleanSave({ inv: { oil: "9" } }).inv.oil === 0, "an old save has no oil; a saved count is read back; negative, fractional, huge and text counts are dropped");
  ok(cleanSave({ out: [{ t: 1, i: 7, s: 5 }, { t: 2, i: 8, s: 5 }], exp: [{ t: 3, i: 7, s: 6 }] }).out.length === 1 && cleanSave({ exp: [{ t: 3, i: 7, s: 6 }] }).exp.length === 1, "a saved gift of lamp oil is read back; kind numbers past 7 are dropped");
  const live = { driftwood: 1, reeds: 1, berries: 1, oil: 0 }, led = { out: [], exp: [], got: [] };
  adoptSave(live, led, { inv: { driftwood: 2, oil: 5 } });
  ok(live.oil === 5 && live.driftwood === 2, "another tab's newer save brings its lamp oil too");
  ok(WORTH.oil === 3 && WORTH.driftwood === 1 && WORTH.berries === 2, "lamp oil is worth 3 fuel (driftwood 1, oil berries 2)");
}

// ---- a fake mesh for fishing ----
const T0 = { perf: 5000, wall: 1.7e12 };
function mesh() {
  const w = { players: new Map(), perf: T0.perf, wall: T0.wall, errors: [] };
  w.add = (id, seed, x, y, opts = {}) => {
    const hs = [], leaves = [], joins = [];
    const p = { id, seed, me: { x, y, d: 0, seed, snuffed: false }, peers: new Map(), inv: { driftwood: 0, reeds: 0, berries: 0, oil: opts.oil || 0 }, events: [], saves: [], hs, leaves, joins, cut: false, alive: true };
    p.net = {
      selfId: id, onMessage: h => hs.push(h), onPeerLeave: h => leaves.push(h), onPeerJoin: h => joins.push(h),
      send(msg, to) { const m = JSON.parse(JSON.stringify(msg)); (p.sent ||= []).push(m); if (p.cut) return; for (const [oid, o] of w.players) if (oid !== id && o.alive && (!to || to === oid)) o.hs.forEach(h => h(JSON.parse(JSON.stringify(m)), id)); },
    };
    p.fishing = createFishing(p.net, world, p.me, p.peers, { now: () => w.perf, clock: () => w.wall, still: () => !!opts.still, bites: !opts.noBites, inv: p.inv, persist: () => p.saves.push(p.inv.oil), onEvent: (t, x) => p.events.push(t) });
    w.players.set(id, p);
    return p;
  };
  w.link = (...ps) => { for (const a of ps) for (const b of ps) if (a !== b && !a.peers.has(b.id)) a.peers.set(b.id, { id: b.id, seed: b.seed, tx: b.me.x, ty: b.me.y, x: b.me.x, y: b.me.y }); };
  w.unlink = (p) => { p.alive = false; w.players.delete(p.id); for (const o of w.players.values()) if (o.peers.delete(p.id)) o.leaves.forEach(h => h(p.id)); };
  w.advance = (ms) => { for (let t = 0; t < ms; t += 50) { w.perf += 50; w.wall += 50; for (const p of w.players.values()) if (p.alive) p.fishing.tick(); } };
  return w;
}
// Advance until a condition holds (or max ms), in the mesh's 50 ms steps. Returns whether it held.
const until = (w, cond, max = 6000) => { for (let t = 0; t < max; t += 50) { if (cond()) return true; w.advance(50); } return cond(); };
const lastOf = (p) => p.events[p.events.length - 1];

console.log("\n# casting, the bite and the timing press, in node");
{
  const hit = findJettyFish();
  ok(!!hit, `found a natural fish to fish for (slot ${hit && hit.slot}, ${hit && Math.hypot(hit.fish.bx - PLANK.x, hit.fish.by - PLANK.y).toFixed(1)} tiles from the planks)`);
  const fx = hit.fish.bx, fy = hit.fish.by;
  const w = mesh(); w.wall = hit.ms;
  const A = w.add("a", 1001, PLANK.x, PLANK.y);
  ok(A.fishing.cast(PLANK.x + 0.2, PLANK.y).why === "far", "a cast too near is refused");
  ok(A.fishing.cast(3.5, 3.5).why === "far" || A.fishing.cast(3.5, 3.5).why === "land", "a cast far away is refused");
  const landTile = (() => { for (let y = 30; y < 100; y++) for (let x = 30; x < 100; x++) if (tileAt(world, x, y) === T.GRASS && Math.hypot(x + 0.5 - 60, y + 0.5 - 60) < 1) return [x + 0.5, y + 0.5]; return [60.5, 60.5]; })();
  A.me.x = landTile[0]; A.me.y = landTile[1];
  ok(A.fishing.cast(landTile[0] + 2, landTile[1]).why === "land", "a cast onto land is refused");
  A.me.x = PLANK.x; A.me.y = PLANK.y;
  ok(A.fishing.cast(fx, fy).ok && A.fishing.line && A.fishing.line.phase === "wait", "a cast onto water puts the line out, waiting");
  ok(A.fishing.cast(fx, fy).why === "out", "a second cast while a line is out is refused");
  w.advance(400);
  ok(A.fishing.line.phase === "wait", "a float has to lie for a moment before anything bites");
  const early = A.fishing.reel();
  ok(early.ok && !early.caught && A.inv.oil === 0 && !A.fishing.line && lastOf(A) === "early", "pressing before a bite only brings the line in: nothing caught, no oil");
  ok(A.fishing.cast(fx, fy).why === "cooldown", `casting again at once is refused (cooldown ${CAST_COOLDOWN_S} s)`);
  w.advance(CAST_COOLDOWN_S * 1000 + 100); w.wall = hit.ms;
  ok(A.fishing.cast(fx, fy).ok, "after the cooldown a cast works again");
  until(w, () => A.fishing.line.phase === "bite");
  ok(A.fishing.line && A.fishing.line.phase === "bite", "a natural fish beside the float bites");
  const got = A.fishing.reel();
  ok(got.ok && got.caught && A.inv.oil === 1 && !A.fishing.line && lastOf(A) === "caught", "pressing during the bite catches it: one lamp oil, line in");
  ok(A.saves.length === 1 && A.saves[0] === 1, "the catch was saved at once (persist saw the new count before anything else)");
  ok(biteFish(fishAt(world, w.wall), fx, fy) !== null, "the fish is still there afterwards (nothing about fish is shared or taken): a second player at the same float would bite too");
  // missed bite
  w.advance(CAST_COOLDOWN_S * 1000 + 100);
  w.wall = hit.ms; A.fishing.cast(fx, fy);
  ok(until(w, () => A.fishing.line.phase === "bite"), "a second fish bites");
  w.advance(BITE_WINDOW_S * 1000 - 200);
  ok(A.fishing.line && A.fishing.line.phase === "bite", `still biting 0.2 s before the ${BITE_WINDOW_S} s window ends`);
  w.advance(400);
  ok(!A.fishing.line && lastOf(A) === "escaped" && A.inv.oil === 1, "left alone past the bite window the fish gets away: line in, nothing caught");
  ok(A.fishing.reel().why === "noline", "pressing with no line out does nothing");
  // the window with reduced motion
  const w2 = mesh(); w2.wall = hit.ms;
  const S = w2.add("s", 1002, PLANK.x, PLANK.y, { still: true });
  S.fishing.cast(fx, fy);
  ok(until(w2, () => S.fishing.line.phase === "bite"), "reduced motion: the fish bites too");
  w2.advance(BITE_WINDOW_S * 1000 + 600);
  ok(S.fishing.line && S.fishing.line.phase === "bite", `reduced motion: the bite is still on ${BITE_WINDOW_S + 0.6} s after it began (the window is ${BITE_WINDOW_STILL_S} s)`);
  w2.advance((BITE_WINDOW_STILL_S - BITE_WINDOW_S - 0.6) * 1000 + 300);
  ok(!S.fishing.line && lastOf(S) === "escaped", "reduced motion: and it ends after BITE_WINDOW_STILL_S");
  // the time limit and walking away: far spot, nothing bites
  const spot = FAR[0];
  const w3 = mesh(); w3.wall = hit.ms;
  const L = w3.add("l", 1003, spot.x, spot.y);
  ok(L.fishing.cast(spot.x + spot.dx * 3, spot.y + spot.dy * 3).ok, "a cast at a far shore works");
  w3.advance((LINE_MAX_S - 2) * 1000);
  ok(L.fishing.line && L.fishing.line.phase === "wait" && !L.events.includes("bite"), `alone where no fish live, ${LINE_MAX_S - 2} s of waiting brings no bite`);
  w3.advance(3000);
  ok(!L.fishing.line && lastOf(L) === "timeout", `a line left out ${LINE_MAX_S} s is reeled in by itself`);
  w3.advance(2000);
  L.fishing.cast(spot.x + spot.dx * 3, spot.y + spot.dy * 3);
  L.me.x -= spot.dx * (CAST_MAX + SLACK_WALK - 3 - 0.2); L.me.y -= spot.dy * (CAST_MAX + SLACK_WALK - 3 - 0.2); w3.advance(200);
  ok(L.fishing.line, "walking back to the limit keeps the line");
  L.me.x -= spot.dx * 1.5; L.me.y -= spot.dy * 1.5; w3.advance(200);
  ok(!L.fishing.line && lastOf(L) === "slack", "walking farther than the cast plus the slack brings the line in");
}

console.log("\n# the lamp oil stack, when full, in node");
{
  const hit = findJettyFish(), fx = hit.fish.bx, fy = hit.fish.by;
  const w = mesh(); w.wall = hit.ms;
  const A = w.add("a", 1001, PLANK.x, PLANK.y, { oil: SOFT_STACK });
  A.fishing.cast(fx, fy); until(w, () => A.fishing.line.phase === "bite");
  ok(A.fishing.line.phase === "bite", "a fish bites a player whose stack is full");
  const r = A.fishing.reel();
  ok(r.ok && !r.caught && r.why === "full" && A.inv.oil === SOFT_STACK && A.saves.length === 0 && !A.fishing.line && lastOf(A) === "full", `a full stack (${SOFT_STACK}) lets the fish go: nothing added, nothing dropped, line in`);
  A.inv.oil = SOFT_STACK - 1; w.advance(2000); w.wall = hit.ms;
  A.fishing.cast(fx, fy); until(w, () => A.fishing.line.phase === "bite");
  A.inv.oil = SOFT_STACK; // filled between the bite and the press (a gift arrived)
  const r2 = A.fishing.reel();
  ok(!r2.caught && A.inv.oil === SOFT_STACK && lastOf(A) === "full", "a stack that filled between the bite and the press is refused at the press");
  A.inv.oil = SOFT_STACK - 1; w.advance(2000); w.wall = hit.ms;
  A.fishing.cast(fx, fy); until(w, () => A.fishing.line.phase === "bite");
  ok(A.fishing.reel().caught && A.inv.oil === SOFT_STACK, "one below the limit still takes the catch, up to exactly the limit");
}

console.log("\n# the shoal, in node");
{
  const spot = FAR[0], ang = spot.ang;
  const f3 = [spot.x + spot.dx * 3, spot.y + spot.dy * 3], f4 = [spot.x + spot.dx * 4, spot.y + spot.dy * 4];
  ok(Math.hypot(spot.x - gc.x, spot.y - gc.y) > GROUND_RADIUS + 14 && Array.from({ length: 300 }, (_, i) => fishAt(world, slotMs(40000 + i, 10 + (i % 5))).filter(q => Math.hypot(q.x - f3[0], q.y - f3[1]) <= F.SHOAL_BITE_R + 1).length).every(n => n === 0), `the test shore (${spot.x}, ${spot.y}) is far from the jetty, and no natural fish comes within reach of its floats in 300 slots`);
  const w = mesh(); w.wall = slotMs(40100);
  const A = w.add("a", 5001, spot.x, spot.y), B = w.add("b", 5002, spot.x, spot.y);
  w.link(A, B);
  A.fishing.cast(...f3);
  w.advance(3000);
  ok(!A.fishing.shoal() && A.fishing.line.phase === "wait", "one player alone at a far shore: no shoal, no bite");
  B.fishing.cast(...f4);
  w.advance(200);
  ok(A.peers.get("b").line && A.peers.get("b").line.x === f4[0] && B.peers.get("a").line && B.peers.get("a").line.x === f3[0], "each player learns the other's float tile");
  ok(!A.fishing.shoal() && !B.fishing.shoal(), `two floats ${Math.hypot(f3[0] - f4[0], f3[1] - f4[1])} tile apart do not make a shoal at once (lines must have lain ${SHOAL_SETTLE_S} s)`);
  w.advance(1500);
  const sa = A.fishing.shoal(), sb = B.fishing.shoal();
  ok(sa && sb && Math.abs(sa.x - sb.x) < 1e-9 && Math.abs(sa.y - sb.y) < 1e-9 && sa.key === sb.key && sa.id === "b" && sb.id === "a", "then both players have the same shoal, round the middle of the two floats");
  const va = A.fishing.view(), vb = B.fishing.view();
  const shA = va.fish.filter(q => q.shoal), shB = vb.fish.filter(q => q.shoal);
  ok(shA.length === SHOAL_FISH && JSON.stringify(shA) === JSON.stringify(shB) && !va.fish.some(q => !q.shoal && Math.hypot(q.x - f3[0], q.y - f3[1]) < 8), "and both see the same SHOAL_FISH fish (same positions) where there are no natural fish");
  w.advance(1500);
  ok(A.fishing.line && A.fishing.line.phase === "bite" && B.fishing.line && B.fishing.line.phase === "bite" && A.fishing.line.fish >= 100, "the shoal brings a bite to both");
  ok(A.fishing.reel().caught && A.inv.oil === 1 && lastOf(A) === "caught", "A reels in a lamp oil");
  ok(B.fishing.line && B.fishing.reel().caught && B.inv.oil === 1, "and B can still reel in its own: the shoal's fish was not used up by A (nothing is shared about fish)");
  // too far apart: another far shore, floats more than SHOAL_RANGE from A's
  w.advance(2000);
  const spot2 = FAR.find(q => { const g = [q.x + q.dx * 3, q.y + q.dy * 3], d = Math.hypot(g[0] - f3[0], g[1] - f3[1]); return d > SHOAL_RANGE + 1 && d < 12; });
  A.fishing.cast(...f3);
  if (spot2) {
    const g2 = [spot2.x + spot2.dx * 3, spot2.y + spot2.dy * 3];
    B.me.x = spot2.x; B.me.y = spot2.y; const pb = A.peers.get("b"); pb.tx = spot2.x; pb.ty = spot2.y;
    ok(B.fishing.cast(...g2).ok, "B casts at a second shore");
    w.advance(4000);
    ok(Math.hypot(g2[0] - f3[0], g2[1] - f3[1]) > SHOAL_RANGE && A.peers.get("b").line && !A.fishing.shoal() && !B.fishing.shoal() && A.fishing.line.phase === "wait" && B.fishing.line.phase === "wait", `floats ${Math.hypot(g2[0] - f3[0], g2[1] - f3[1]).toFixed(1)} tiles apart (more than SHOAL_RANGE ${SHOAL_RANGE}) make no shoal and no bite, though each knows the other's line`);
    B.fishing.reel(); B.me.x = spot.x; B.me.y = spot.y; pb.tx = spot.x; pb.ty = spot.y;
  } else ok(false, "no second far shore to test floats farther apart than SHOAL_RANGE");
  A.fishing.reel(); w.advance(2000);
  A.fishing.cast(...f3); B.fishing.cast(...f4); w.advance(2500);
  ok(!!A.fishing.shoal(), "(the pair is a shoal again at 1 tile)");
  // The lapse, the return, the leaving and three players, with bites switched off so the lines stay out while the rules are checked.
  {
    const w4 = mesh(); w4.wall = slotMs(40100);
    const A = w4.add("a", 5001, spot.x, spot.y, { noBites: true }), B = w4.add("b", 5002, spot.x, spot.y, { noBites: true });
    w4.link(A, B); A.fishing.cast(...f3); B.fishing.cast(...f4); w4.advance(2500);
    ok(!!A.fishing.shoal() && !!B.fishing.shoal(), "(a shoal, with bites off)");
    B.cut = true;
    const heard = A.peers.get("b").line.seen;
    until(w4, () => (w4.perf - heard) / 1000 >= LINE_TTL_S - 1, 20000);
    ok(!!A.fishing.shoal(), "a quiet peer's line still counts just inside LINE_TTL_S of the last time it was heard");
    w4.advance(2200);
    ok(!A.fishing.shoal() && A.peers.get("b").line === null, `a peer that stops repeating its line loses the shoal after ${LINE_TTL_S} s (a silent or lying peer cannot keep it)`);
    B.cut = false; w4.advance(5000 + SHOAL_SETTLE_S * 1000 + 200);
    ok(!!A.fishing.shoal(), "it comes back when B repeats its line (and it has lain SHOAL_SETTLE_S again)");
    B.fishing.leave(); w4.advance(100);
    ok(!A.fishing.shoal() && A.peers.get("b").line === null, "when B reels in or leaves the room, the shoal goes at once");
    const C = w4.add("c", 5003, spot.x, spot.y, { noBites: true }); w4.link(A, B, C);
    B.fishing.cast(...f4); C.fishing.cast(...f3); A.joins.forEach(h => h("c")); w4.advance(2500);
    ok(A.fishing.shoal() && A.fishing.shoal().id === "c" && C.fishing.shoal().id === "a" && B.fishing.shoal().id === "a", "with three players each pairs with the nearest float (A and C share a tile; B is a tile from both, and the lower seed wins the tie)");
    w4.unlink(C); w4.advance(100);
    ok(A.fishing.shoal() && A.fishing.shoal().id === "b", "when the partner leaves the room, the next nearest fisher is the partner");
  }
  // reduced motion on one side: the shoal fish do not turn there, the bite still comes
  const w2 = mesh(); w2.wall = slotMs(40100);
  const P = w2.add("p", 6001, spot.x, spot.y, { still: true }), Q = w2.add("q", 6002, spot.x, spot.y);
  w2.link(P, Q); P.fishing.cast(...f3); Q.fishing.cast(...f4); w2.advance(6000);
  ok(P.events.includes("bite") && Q.events.includes("bite"), "a player with reduced motion and one without both get the bite from the shoal");
}

console.log("\n# hostile 'fl' messages, in node");
{
  const spot = FAR[0];
  const w = mesh(); w.wall = slotMs(40100);
  const A = w.add("a", 7001, spot.x, spot.y), B = w.add("b", 7002, spot.x, spot.y); w.link(A, B);
  const say = (m, from = "b") => { A.hs.forEach(h => h(m, from)); w.advance(250); };
  const landT = (() => { for (let y = 50; y < 80; y++) for (let x = 50; x < 80; x++) if (tileAt(world, x, y) === T.GRASS) return [x, y]; return [60, 60]; })();
  const farWater = (() => { for (let r = 10; r < 30; r++) for (let a = 0; a < 6.28; a += 0.1) { const x = Math.floor(spot.x + Math.cos(a) * r), y = Math.floor(spot.y + Math.sin(a) * r); if (x > 3 && y > 3 && x < 124 && y < 124 && isWaterAt(x, y)) return [x, y]; } return null; })();
  const x = Math.floor(spot.x + spot.dx * 3), y = Math.floor(spot.y + spot.dy * 3);
  const none = () => A.peers.get("b").line === undefined || A.peers.get("b").line === null;
  for (const m of [{ k: "fl", x, y, z: 1 }, { k: "fl", x }, { k: "fl", x: 1.5, y }, { k: "fl", x: "5", y }, { k: "fl", x: NaN, y }, { k: "fl", x: -1, y: 5 }, { k: "fl", x: 5, y: -1 }, { k: "fl", x: 0, y: 0 }, { k: "fl", x: 500, y: 500 }, { k: "fl", x: landT[0], y: landT[1] }, { k: "fl", x: null, y: null }, { k: "fl", x: 1, y: 1 }]) say(m);
  ok(none(), "wrong field counts, non-whole numbers, text, NaN, a half -1, the corner, out of the map, a land tile and a tile outside the cast area are all dropped");
  say({ k: "fl", x, y }, "stranger");
  ok(!A.peers.has("stranger"), "a message from someone who never said hello is ignored");
  say({ k: "fl", x: farWater[0], y: farWater[1] });
  ok(!!farWater && Math.hypot(farWater[0] + 0.5 - spot.x, farWater[1] + 0.5 - spot.y) > F.FLOAT_SLACK && none(), `a water tile ${farWater && Math.hypot(farWater[0] + 0.5 - spot.x, farWater[1] + 0.5 - spot.y).toFixed(0)} tiles from where the sender stands is dropped (FLOAT_SLACK ${F.FLOAT_SLACK})`);
  say({ k: "fl", x, y });
  ok(A.peers.get("b").line && A.peers.get("b").line.x === x + 0.5, "a good line is taken");
  say({ k: "fl", x: -1, y: -1 });
  ok(none(), "x = y = -1 means no line");
  A.peers.get("b").line = null;
  for (let i = 0; i < 400; i++) { A.hs.forEach(h => h({ k: "fl", x: x, y: y + (i % 2 ? 0 : 0) }, "b")); }
  ok(A.peers.get("b").line && A.peers.get("b").line.x === x + 0.5, "(a flood of 400 identical lines leaves one line, no error)");
  A.hs.forEach(h => h({ k: "fl", x: -1, y: -1 }, "b")); w.advance(1500); A.hs.forEach(h => h({ k: "fl", x: -1, y: -1 }, "b"));
  ok(none(), "(and the end-of-line message still works after the flood once the limit has refilled)");
  say({ k: "fl", x, y }); w.advance(10);
  const before = JSON.stringify(A.inv);
  ok(JSON.stringify(A.inv) === before && !A.fishing.line, "nothing a peer sends changes my pack or puts a line out for me");
  const sent = (A.sent || []).filter(m => m.k !== "fl");
  ok(sent.length === 0 && (A.sent || []).every(m => Object.keys(m).length === 3 && Number.isInteger(m.x) && Number.isInteger(m.y)), "the only thing a fisher sends is { k:'fl', x, y }: two whole numbers");
}

console.log("\n# lamp oil given away, caps full and expired, in node");
{
  const clock = { t: 0 };
  function pair(opts = {}) {
    const players = new Map(), G = { id: "g", seed: 111 }, R = { id: "r", seed: 222 };
    for (const p of [G, R]) {
      Object.assign(p, { hs: [], leaves: [], me: { x: 5, y: 5 }, peers: new Map(), inv: { driftwood: 0, reeds: 0, berries: 0, oil: 0 }, cr: { wick: 0, amber: 0, jade: 0, azure: 0 }, held: { lamp: 0 }, ledger: { out: [], exp: [], got: [] }, events: [], saves: 0 });
      p.net = { selfId: p.id, onMessage: h => p.hs.push(h), onPeerLeave: h => p.leaves.push(h), onPeerJoin() {}, drop: 0, send(msg, to) { const q = players.get(p.id === "g" ? "r" : "g"); if (q && q.alive && (!to || to === q.id)) { if (p.net.dropKind === msg.k) return; const m = JSON.parse(JSON.stringify(msg)); q.hs.forEach(h => h(m, p.id)); } } };
      p.alive = true; players.set(p.id, p);
    }
    G.peers.set("r", { id: "r", seed: 222, tx: 6, ty: 5 }); R.peers.set("g", { id: "g", seed: 111, tx: 6, ty: 5 });
    for (const p of [G, R]) p.give = createGive(p.net, p.me, p.peers, p.inv, p.ledger, { now: () => clock.t, persist: () => p.saves++, onEvent: (t) => p.events.push(t), rand: () => 4242, cr: p.cr, held: p.held });
    return { G, R };
  }
  let { G, R } = pair(); G.inv.oil = 1;
  ok(G.give.offer(OIL) && R.give.incoming && R.give.incoming.i === OIL, "an offer of lamp oil reaches the receiver");
  ok(R.give.accept() && G.inv.oil === 0 && R.inv.oil === 1 && G.ledger.out.length === 0 && R.ledger.got.length === 1 && R.ledger.exp.length === 0, "accepted: the oil moves once, the receipt clears the giver's list");
  ({ G, R } = pair()); G.inv.oil = 1; R.inv.oil = SOFT_STACK;
  ok(G.give.offer(OIL) && !R.give.incoming && G.give.outgoing === null && G.inv.oil === 1 && R.inv.oil === SOFT_STACK && G.events.includes("declined"), `a receiver holding ${SOFT_STACK} lamp oil declines at the offer: the giver keeps it`);
  ({ G, R } = pair()); G.inv.oil = 1; R.inv.oil = SOFT_STACK - 1;
  G.give.offer(OIL); R.inv.oil = SOFT_STACK;
  ok(!R.give.accept() && G.inv.oil === 1 && R.inv.oil === SOFT_STACK && R.ledger.exp.length === 0 && G.events.includes("declined"), "a stack that filled between the offer and the accept is refused at the accept: nothing moves");
  ({ G, R } = pair()); G.inv.oil = 1; R.inv.oil = SOFT_STACK - 1;
  G.give.offer(OIL); R.give.accept();
  ok(G.inv.oil === 0 && R.inv.oil === SOFT_STACK, "one below the limit is taken, up to exactly the limit");
  ({ G, R } = pair()); G.inv.oil = 1;
  for (let i = 0; i < MAX_EXP; i++) R.ledger.exp.push({ t: 900 + i, i: 0, s: 999 });
  G.give.offer(OIL);
  ok(!R.give.incoming && G.inv.oil === 1 && R.ledger.exp.length === MAX_EXP && G.events.includes("declined"), `a receiver whose expected-gifts list is full (${MAX_EXP}) declines at the offer; the list is not touched`);
  ({ G, R } = pair()); G.inv.oil = 1;
  G.give.offer(OIL);
  for (let i = 0; i < MAX_EXP; i++) R.ledger.exp.push({ t: 900 + i, i: 0, s: 999 });
  ok(!R.give.accept() && G.inv.oil === 1 && R.ledger.exp.length === MAX_EXP, "an expected list that filled between the offer and the accept refuses at the accept; no old entry is dropped");
  ({ G, R } = pair()); G.inv.oil = 1;
  for (let i = 0; i < MAX_OUT; i++) G.ledger.out.push({ t: 800 + i, i: 0, s: 555 });
  ok(!G.give.offer(OIL) && G.inv.oil === 1 && G.ledger.out.length === MAX_OUT, `a giver whose on-its-way list is full (${MAX_OUT}) cannot offer; nothing is dropped`);
  ({ G, R } = pair()); G.inv.oil = 1;
  G.give.offer(OIL);
  for (let i = 0; i < MAX_OUT; i++) G.ledger.out.push({ t: 800 + i, i: 0, s: 555 });
  R.give.accept();
  ok(G.inv.oil === 1 && G.ledger.out.length === MAX_OUT && R.inv.oil === 0 && R.ledger.exp.length === 0 && G.events.includes("cancelled"), "an on-its-way list that filled between the offer and the accept cancels at the commit: the oil stays, and the receiver's expected entry is taken back");
  ({ G, R } = pair()); G.inv.oil = 1;
  G.give.offer(OIL); G.inv.oil = 0;
  R.give.accept();
  ok(G.inv.oil === 0 && R.inv.oil === 0 && R.ledger.exp.length === 0 && G.ledger.out.length === 0, "oil spent between the offer and the accept: nothing is invented, nothing is left waiting");
  ({ G, R } = pair()); G.inv.oil = 1;
  G.give.offer(OIL); clock.t += OFFER_MS + 1;
  ok(!R.give.accept() && G.inv.oil === 1 && R.inv.oil === 0, "an offer nobody answered for OFFER_MS has expired: a late accept moves nothing");
  clock.t += 10;
  ({ G, R } = pair()); G.inv.oil = 1;
  G.give.offer(OIL); R.leaves.forEach(h => h("g")); G.leaves.forEach(h => h("r"));
  ok(G.inv.oil === 1 && G.give.outgoing === null && G.events.includes("lost"), "the receiver leaving at the offer ends it: the oil stays with the giver");
  ({ G, R } = pair()); G.inv.oil = 1;
  G.give.offer(OIL); G.net.dropKind = "cf"; R.give.accept();
  ok(G.inv.oil === 0 && G.ledger.out.length === 1 && R.inv.oil === 0 && R.ledger.exp.length === 1, "the commit message lost: the oil is in exactly one place (the giver's on-its-way list)");
  G.net.dropKind = null; clock.t += 4000; G.give.tick();
  ok(R.inv.oil === 1 && G.ledger.out.length === 0 && R.ledger.exp.length === 0, "and it arrives once when the giver repeats it");
  ({ G, R } = pair()); G.inv.oil = 1;
  R.hs.forEach(h => h({ k: "of", t: 77, i: 8 }, "g"));
  ok(!R.give.incoming, "an offer of item 8 (no such item) is dropped");
}

console.log("\n# lamp oil burned in a beacon, caps full, in node");
{
  const beacons = [{ x: 10, y: 10 }];
  const clock = { t: 0 };
  function setup(oil, wood = 0) {
    const inv = { driftwood: wood, reeds: 0, berries: 0, oil }, me = { x: 10, y: 10, seed: 41 }, peers = new Map(), sent = [], ev = [], saves = [];
    const net = { selfId: "me", onMessage() {}, onPeerLeave() {}, onPeerJoin() {}, send(m) { sent.push(m); } };
    const b = createBeacons(net, me, peers, inv, beacons, { now: () => clock.t, onEvent: (t, bb, r) => ev.push([t, r && r.why]), persist: () => saves.push(inv.oil) });
    return { inv, b, sent, ev, saves };
  }
  let s = setup(10);
  ok(s.b.add("oil").ok && s.inv.oil === 9 && s.b.shares.own(0, 41) === 3 && s.sent[0].n === 3 && s.saves.length === 1, "one lamp oil is 3 fuel: the pack goes down by one, the share up by 3, saved, sent");
  for (let i = 0; i < 4; i++) s.b.add("oil");
  ok(s.b.shares.own(0, 41) === 15 && s.inv.oil === 5, "five lamp oil make a share of 15");
  const before = JSON.stringify(s.inv);
  const r = s.b.add("oil");
  ok(!r.ok && r.why === "full" && JSON.stringify(s.inv) === before && s.b.shares.own(0, 41) === 15, `a sixth is refused as "full": 15 + 3 is over one player's share (${MAX_OWN}); nothing used`);
  ok(s.b.add("driftwood").why === "missing" && !canAdd(s.b.shares, 0, 41, { oil: 1, driftwood: 1 }, "driftwood").why, "(no driftwood in this pack, so missing; with some, one more fuel fits)");
  s = setup(10, 5);
  for (let i = 0; i < 5; i++) s.b.add("oil");
  ok(s.b.add("driftwood").ok && s.b.shares.own(0, 41) === 16 && !s.b.add("driftwood").ok && s.b.add("driftwood").why === "full", "mixed items reach exactly the cap of 16 (5 oil + 1 driftwood) and not above");
  s = setup(10, 5);
  s.b.add("oil"); s.b.add("oil"); s.b.add("oil"); s.b.add("oil");
  ok(s.b.shares.own(0, 41) === 12 && s.b.add("oil").ok && s.b.shares.own(0, 41) === 15, "12 + 3 = 15 is allowed");
  s = setup(10); s.b.shares.merge(0, 777, 12); s.b.shares.merge(0, 778, 1);
  ok(s.b.shares.lit(0) && !s.b.add("oil").ok && s.ev[s.ev.length - 1][1] === "lit" && s.inv.oil === 10, "a lit beacon refuses lamp oil and nothing is used");
  s = setup(0);
  ok(s.b.add("oil").why === "missing" && s.inv.oil === 0, "with no lamp oil the press is refused");
  // two players: 4 oil (12 fuel) from one is not lit alone; one more from another lights it
  s = setup(4);
  for (let i = 0; i < 4; i++) s.b.add("oil");
  ok(s.b.shares.fuel(0) === 12 && !s.b.shares.lit(0), "12 fuel of lamp oil from one player does not light a beacon (two players are needed)");
  s.b.shares.merge(0, 778, 3);
  ok(s.b.shares.lit(0), "a second player's share lights it");
  const sh = createShares(1);
  ok(canAdd(sh, 0, 1, { oil: 1 }, "oil").ok && canAdd(sh, 0, 1, { oil: 0 }, "oil").why === "missing" && canAdd(sh, 0, 1, {}, "oil").why === "missing", "canAdd knows lamp oil");
}

// ---- browser harness ----
const require = createRequire(import.meta.url);
let pw;
for (const id of ["playwright", "/opt/node-tools/node_modules/playwright", "playwright-core"]) { try { pw = require(id); break; } catch { /* next */ } }
if (!pw) { console.error("playwright not found"); process.exit(2); }
async function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const b = "/opt/pw-browsers";
  if (!existsSync(b)) return undefined;
  for (const d of (await readdir(b)).filter(d => d.startsWith("chromium")).sort().reverse())
    for (const rel of ["chrome-linux/chrome", "chrome-linux64/chrome"]) { const p = path.join(b, d, rel); if (existsSync(p)) return p; }
  return undefined;
}
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/favicon.ico") { res.writeHead(204).end(); return; }
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try { const body = await readFile(file); res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" }).end(body); }
  catch { res.writeHead(404).end("not found"); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/game/`;
const executablePath = await findChrome();
const browser = await pw.chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const errors = [];
function watch(page, label) {
  page.on("pageerror", e => errors.push(`${label}: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/WebSocket connection to 'wss:/.test(m.text()) && !/User-Initiated Abort, reason=Close called/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
}
async function waitFor(page, fn, arg, timeout = 10000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 50 }); return true; } catch { return false; }
}
const fw = (p) => p.evaluate(() => window.__longWatch.fish());
async function seedPack(page, url, patch) {
  await page.goto(url);
  await page.evaluate(([K, patch]) => { const st = location.search.includes("net=local") ? sessionStorage : localStorage; const s = JSON.parse(st.getItem(K)); Object.assign(s, patch); st.setItem(K, JSON.stringify(s)); }, [STORE, patch]);
  await page.reload();
}
async function enterSeeded(page, url, patch) { await seedPack(page, url, patch); await page.click("#enter"); await waitFor(page, () => window.__longWatch.self().playing, null, 8000); }
const pin = (pages, ms) => Promise.all(pages.map(p => p.evaluate((t) => window.__longWatch.setShadeClock(Math.round(t - Date.now())), ms)));
async function shoot(page, name) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  const keep = page.viewportSize();
  for (const [w, h] of [[375, 760], [1100, 800]]) { await page.setViewportSize({ width: w, height: h }); await sleep(500); await page.locator(".stage").screenshot({ path: path.join(shots, `${name}-${w}.png`) }); }
  await page.setViewportSize(keep); await sleep(200);
}
async function teleportSynced(page, others, x, y) {
  if (!await page.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [x, y])) return false;
  for (const o of others) if (!await waitFor(o, ([x, y]) => window.__longWatch.peers().some(p => Math.hypot(p.x - x, p.y - y) < 0.05), [x, y], 6000)) return false;
  return true;
}
const beaconList = world.landmarks.filter(l => l.kind === "beacon");
const standNear = (l) => { for (let r = 1.1; r <= 2.2; r += 0.3) for (let a = 0; a < 6.28; a += 0.5) { const x = l.x + Math.cos(a) * r, y = l.y + Math.sin(a) * r, t = tileAt(world, x, y); if ((t === T.SAND || t === T.GRASS || t === T.MEADOW) && !isBlocked(world, x, y)) return { x, y }; } return null; };
const KNOWN_KINDS = new Set(["hi", "st", "by", "say", "em", "pk", "gt", "ok", "no", "rq", "sn", "of", "ac", "dc", "cx", "cf", "rc", "lt", "fu", "fq", "fs", "qp", "qq", "qs", "sf", "hp", "hq", "hs", "rk", "ck", "ln", "fl", "fh", "fo", "fa", "fd", "fc"]);

async function scenario(label, mk, query, room, timeout) {
  console.log(`\n# ${label}`);
  const url = `${base}${query}#room=${room}`;
  const A = await mk(), B = await mk();
  const spot = FAR[0];
  const hit = findJettyFish(41000);
  const fx = hit.fish.bx, fy = hit.fish.by;
  await enterSeeded(A, url, {});
  await enterSeeded(B, url, { inv: { driftwood: 0, reeds: 0, berries: 0, oil: 998 } });
  const met = await waitFor(A, () => window.__longWatch.peers().length === 1, null, timeout) && await waitFor(B, () => window.__longWatch.peers().length === 1, null, timeout);
  ok(met, "two players share a lantern");
  if (!met) return;
  const idA = await A.evaluate(() => window.__longWatch.self().id), idB = await B.evaluate(() => window.__longWatch.self().id);
  const f0 = await fw(A);
  ok(f0.panel && f0.oil === 0 && /Cast line/.test(f0.btn) && /Lamp oil 0/.test(await A.textContent("#pack")), "the Fishing panel shows once inside, with a Cast button and the pack counting lamp oil 0");
  ok(await B.evaluate(() => window.__longWatch.fish().oil) === 998, "B starts with 998 lamp oil from its saved pack");

  // 1. the F key and facing: cast from the planks, then reel in too early
  ok(await teleportSynced(A, [B], PLANK.x, PLANK.y), "A stands on the jetty");
  await A.evaluate(() => window.__longWatch.face(0));
  await A.keyboard.press("KeyF");
  ok(await waitFor(A, () => window.__longWatch.fish().line !== null, null, 3000), "F casts a line out in the direction A faces");
  const l1 = (await fw(A)).line;
  ok(l1 && isWaterAt(l1.x, l1.y) && Math.hypot(l1.x - PLANK.x, l1.y - PLANK.y) <= CAST_MAX + 0.01 && await waitFor(A, () => /Reel in/.test(window.__longWatch.fish().btn), null, 2000), "the float is on water within reach and the button now says Reel in");
  ok(await waitFor(B, ([id, x]) => { const p = window.__longWatch.fish().peerLines.find(q => q.id === id); return p && p.line && p.line.x === x; }, [idA, l1.x], 4000), "B learns where A's float is (and sees A's line drawn)");
  await A.keyboard.press("KeyF");
  ok(await waitFor(A, () => window.__longWatch.fish().line === null, null, 2000) && /before any bite/.test((await fw(A)).info) && (await fw(A)).oil === 0, "F again before a bite brings the line in: nothing caught");
  ok(await waitFor(B, (id) => { const p = window.__longWatch.fish().peerLines.find(q => q.id === id); return p && p.line === null; }, idA, 4000), "and B sees the line go");
  await sleep(1700);

  // 2. a natural fish at the same clock for both, then a catch
  await pin([A, B], hit.ms);
  const [fa, fb] = [await fw(A), await fw(B)];
  ok(fa.fish.length > 0 && fa.fish.length === fb.fish.length && fa.fish.every((q, i) => q.id === fb.fish[i].id && Math.hypot(q.x - fb.fish[i].x, q.y - fb.fish[i].y) < 0.25), `with the same clock both pages draw the same ${fa.fish.length} fish in the same places (nothing was sent about them)`);
  const cast1 = await A.evaluate(([x, y]) => window.__longWatch.castAt(x, y), [fx, fy]);
  ok(cast1 && cast1.ok, "A casts at a natural fish near the jetty");
  ok(await waitFor(A, () => window.__longWatch.fish().line && window.__longWatch.fish().line.phase === "bite", null, 3000), "the fish bites after the float has settled");
  ok(/biting/.test((await fw(A)).state) && /Reel in now/.test((await fw(A)).btn), "the panel says a fish is biting and the button says Reel in now");
  await shoot(A, "fishing-bite");
  await A.keyboard.press("KeyF");
  ok(await waitFor(A, () => window.__longWatch.fish().oil === 1, null, 3000), "pressing F during the bite catches it: one lamp oil");
  const fc = await fw(A);
  ok(fc.line === null && /caught a fish/.test(fc.info) && /Lamp oil 1/.test(await A.textContent("#pack")) && await A.evaluate(([k]) => JSON.parse((location.search.includes("net=local") ? sessionStorage : localStorage).getItem(k)).inv.oil, [STORE]) === 1, "the page says so, the pack shows lamp oil 1 and it is saved in this browser");
  await sleep(1700);

  // 3. a missed bite
  await pin([A, B], hit.ms);
  await A.evaluate(([x, y]) => window.__longWatch.castAt(x, y), [fx, fy]);
  ok(await waitFor(A, () => window.__longWatch.fish().line && window.__longWatch.fish().line.phase === "bite", null, 3000), "a fish bites again");
  ok(await waitFor(A, () => window.__longWatch.fish().line === null, null, (BITE_WINDOW_S + 2) * 1000) && /got away/.test((await fw(A)).info) && (await fw(A)).oil === 1, "left alone, the fish gets away within the window: nothing caught, still 1 lamp oil");
  await sleep(1700);

  // 4. a shoal where there are no fish, for both
  const f3 = [spot.x + spot.dx * 3, spot.y + spot.dy * 3], f4 = [spot.x + spot.dx * 4, spot.y + spot.dy * 4];
  ok(await teleportSynced(A, [B], spot.x, spot.y) && await teleportSynced(B, [A], spot.x, spot.y), "A and B stand together on a far shore (no natural fish live there)");
  await pin([A, B], slotMs(41500));
  await A.evaluate(([x, y]) => window.__longWatch.castAt(x, y), f3);
  await sleep(3200);
  const alone = await fw(A);
  ok(alone.line && alone.line.phase === "wait" && alone.shoal === null && alone.fish.every(q => Math.hypot(q.x - f3[0], q.y - f3[1]) > 8), "A alone there for 3 s: no fish anywhere near, no shoal, no bite");
  await B.evaluate(([x, y]) => window.__longWatch.castAt(x, y), f4);
  ok(await waitFor(A, () => window.__longWatch.fish().shoal !== null, null, 6000) && await waitFor(B, () => window.__longWatch.fish().shoal !== null, null, 6000), "with B's float a tile from A's, a shoal appears on both pages");
  const [sa, sb] = [await fw(A), await fw(B)];
  ok(Math.abs(sa.shoal.x - sb.shoal.x) < 1e-6 && Math.abs(sa.shoal.y - sb.shoal.y) < 1e-6 && sa.fish.filter(q => q.shoal).length === SHOAL_FISH && sb.fish.filter(q => q.shoal).length === SHOAL_FISH && /shoal/.test(sa.state), `both see the same shoal of ${SHOAL_FISH} fish round the middle of the floats, and the panel says so`);
  await shoot(A, "fishing-shoal");
  ok(await waitFor(A, () => window.__longWatch.fish().line && window.__longWatch.fish().line.phase === "bite", null, 5000) && await waitFor(B, () => window.__longWatch.fish().line && window.__longWatch.fish().line.phase === "bite", null, 5000), "the shoal brings a bite to both");
  await A.keyboard.press("KeyF"); await B.keyboard.press("KeyF");
  ok(await waitFor(A, () => window.__longWatch.fish().oil === 2, null, 3000) && await waitFor(B, () => window.__longWatch.fish().oil === 999, null, 3000), "both reel in a lamp oil (A has 2 now, B 999)");
  ok(/shoal brought it/.test((await fw(A)).info), "the page says the shoal brought the fish");
  await sleep(1700);

  // 5. B is full: a natural fish bites, the press lets it go
  await pin([A, B], hit.ms);
  ok(await teleportSynced(A, [B], PLANK.x, PLANK.y) && await teleportSynced(B, [A], PLANK.x, PLANK.y), "A and B walk back to the jetty");
  await B.evaluate(([x, y]) => window.__longWatch.castAt(x, y), [fx, fy]);
  ok(await waitFor(B, () => window.__longWatch.fish().line && window.__longWatch.fish().line.phase === "bite", null, 3000), "a fish bites B");
  await B.keyboard.press("KeyF");
  ok(await waitFor(B, () => window.__longWatch.fish().line === null, null, 2000) && /stack is full/.test((await fw(B)).info) && (await fw(B)).oil === 999, "B's full stack (999) lets the fish go: nothing added, the page says why");
  // the same fish for two players at once
  await sleep(1700);
  await pin([A, B], hit.ms);
  await A.evaluate(([x, y]) => window.__longWatch.castAt(x, y), [fx, fy]);
  await B.evaluate(([x, y]) => window.__longWatch.castAt(x, y), [fx, fy]);
  ok(await waitFor(A, () => window.__longWatch.fish().line && window.__longWatch.fish().line.phase === "bite", null, 4000) && await waitFor(B, () => window.__longWatch.fish().line && window.__longWatch.fish().line.phase === "bite", null, 4000), "A and B both fish the very same spot and both get a bite (fish are not used up)");
  await A.keyboard.press("KeyF");
  ok(await waitFor(A, () => window.__longWatch.fish().oil === 3, null, 3000), "A reels it in: 3 lamp oil");
  await B.evaluate(() => window.__longWatch.reel());

  // 6. give lamp oil: B (full) cannot take it; B gives to A; A gives back to a B that has room
  await sleep(300);
  ok(await teleportSynced(B, [A], PLANK.x - 1, PLANK.y), "B stands next to A");
  ok(await waitFor(A, () => window.__longWatch.give().target !== null, null, 4000), "A can reach B to give");
  ok(await A.locator("#givebtns button").count() === 8 && /Give lamp oil/.test(await A.locator('#givebtns [data-kind="7"]').textContent()), "there is a Give lamp oil button (eight Give buttons now)");
  await A.evaluate(() => window.__longWatch.offer(7));
  ok(await waitFor(A, () => /did not take/.test(window.__longWatch.give().info), null, 4000) && (await fw(A)).oil === 3 && await B.evaluate(() => window.__longWatch.give().incoming) === null, "A offers lamp oil to B, who holds 999: B declines automatically and A keeps it");
  await B.evaluate(() => window.__longWatch.offer(7));
  ok(await waitFor(A, () => window.__longWatch.give().incoming !== null, null, 4000), "B offers one lamp oil to A");
  await A.evaluate(() => window.__longWatch.accept());
  ok(await waitFor(A, () => window.__longWatch.fish().oil === 4, null, 5000) && await waitFor(B, () => window.__longWatch.fish().oil === 998 && window.__longWatch.give().out.length === 0, null, 8000), "A accepts: A has 4, B 998, nothing left on its way (one lamp oil, moved once)");
  await A.evaluate(() => window.__longWatch.offer(7));
  await waitFor(B, () => window.__longWatch.give().incoming !== null, null, 4000);
  await B.evaluate(() => window.__longWatch.accept());
  ok(await waitFor(B, () => window.__longWatch.fish().oil === 999, null, 5000) && await waitFor(A, () => window.__longWatch.fish().oil === 3 && window.__longWatch.give().out.length === 0, null, 8000), "A gives one back: B is at 999 again, A at 3");

  // 7. burn lamp oil in a beacon: 3 fuel each, the cap of 16, lit with two players
  const st = [standNear(beaconList[0]), standNear(beaconList[0])];
  ok(st[0] && await teleportSynced(A, [B], st[0].x, st[0].y) && await teleportSynced(B, [A], st[1].x + 0.05, st[1].y), "A and B stand by the first beacon");
  ok(await waitFor(A, () => window.__longWatch.beacon() && window.__longWatch.beacon().synced && window.__longWatch.beacon().near === 0, null, 6000) && await waitFor(B, () => window.__longWatch.beacon() && window.__longWatch.beacon().synced, null, 6000), "both have the beacon's state");
  ok(await A.locator("#beaconbtns button").count() === 3 && /Add lamp oil \(3 fuel\)/.test(await A.locator('#beaconbtns [data-item="oil"]').textContent()), "the Beacon panel has an Add lamp oil (3 fuel) button");
  await A.click('#beaconbtns [data-item="oil"]');
  ok(await waitFor(A, () => window.__longWatch.beacon().fuel[0] === 3, null, 3000) && (await fw(A)).oil === 2 && /added lamp oil/.test(await A.textContent("#beaconinfo")), "the button burns one lamp oil: 3 fuel, the pack down by one");
  for (let i = 0; i < 2; i++) await A.evaluate(() => window.__longWatch.addFuel("oil"));
  ok((await A.evaluate(() => window.__longWatch.beacon())).own[0] === 9 && (await fw(A)).oil === 0, "A burns the rest: 9 fuel from A (3 lamp oil)");
  await A.evaluate(() => { window.__longWatch.addFuel("oil"); });
  ok((await A.evaluate(() => window.__longWatch.beacon())).own[0] === 9, "with no lamp oil left the press adds nothing");
  const rB1 = await B.evaluate(() => window.__longWatch.addFuel("oil"));
  ok(rB1 && rB1.ok, "B adds one lamp oil too");
  ok(await waitFor(A, () => window.__longWatch.beacon().lit[0] === true, null, 6000) && await waitFor(B, () => window.__longWatch.beacon().lit[0] === true, null, 6000), "9 fuel from A and 3 from B: with two players the beacon lights (12 needed) and shows lit on both");
  const oilLit = (await fw(B)).oil, rl = await B.evaluate(() => window.__longWatch.addFuel("oil"));
  ok(rl && !rl.ok && rl.why === "lit" && (await fw(B)).oil === oilLit && oilLit === 998, "a lit beacon refuses more lamp oil (and nothing is used)");
  // the share cap, alone at the second beacon: five lamp oil make 15, the sixth would make 18 and is refused
  const st2 = standNear(beaconList[1]);
  ok(await teleportSynced(B, [A], st2.x, st2.y) && await waitFor(B, () => window.__longWatch.beacon().near === 1 && window.__longWatch.beacon().synced, null, 6000), "B walks to the second beacon");
  const oil0 = (await fw(B)).oil, rr = [];
  for (let i = 0; i < 6; i++) rr.push(await B.evaluate(() => window.__longWatch.addFuel("oil")));
  const b2 = await B.evaluate(() => window.__longWatch.beacon());
  ok(rr.slice(0, 5).every(r => r && r.ok) && rr[5] && !rr[5].ok && rr[5].why === "full" && b2.own[1] === 15 && b2.fuel[1] === 15 && !b2.lit[1] && (await fw(B)).oil === oil0 - 5, `five lamp oil make a share of 15; the sixth is refused as full (one player's share is at most ${MAX_OWN}); nothing used, and one player alone does not light it`);
  ok(/as much as one player can/.test(await B.textContent("#beaconinfo")), "the page says one player has added as much as they can");
  const taps = await A.evaluate(() => window.__longWatch.taps());
  ok(Object.keys(taps).every(k => KNOWN_KINDS.has(k)) && (taps.fl || 0) > 0 && (taps.fl || 0) < 60, `fishing sent no new kind of message and few "fl" (${taps.fl}) for ${(await fw(A)).lines.length ? "a few" : "several"} casts and a few waits: nothing streams about the fish`);
  ok((await A.evaluate(() => window.__longWatch.hud())).dropped === 0, "nothing was dropped");
  // 8. a full round trip: B reels in its line at the shoal, A goes when B leaves
  ok(await teleportSynced(A, [B], spot.x, spot.y) && await teleportSynced(B, [A], spot.x, spot.y), "back on the far shore");
  await pin([A, B], slotMs(41700));
  await A.evaluate(([x, y]) => window.__longWatch.castAt(x, y), f3); await B.evaluate(([x, y]) => window.__longWatch.castAt(x, y), f4);
  ok(await waitFor(A, () => window.__longWatch.fish().shoal !== null, null, 6000), "a shoal again");
  await B.click("#leave");
  ok(await waitFor(A, () => window.__longWatch.fish().shoal === null && window.__longWatch.fish().peerLines.length === 0, null, 8000), "when B leaves the lantern, the shoal and B's line are gone for A at once");
  for (const p of [A, B]) await p.close().catch(() => {});
}

async function reduced(label, mk, query, room) {
  console.log(`\n# ${label}`);
  const hit = findJettyFish(42000);
  const url = `${base}${query}#room=${room}`;
  const R = await mk(), N = await mk();
  await enterSeeded(R, url, {}); await enterSeeded(N, url, {});
  await waitFor(R, () => window.__longWatch.peers().length === 1, null, 10000);
  ok(await R.evaluate(() => window.__longWatch.hud().reducedMotion) && !(await N.evaluate(() => window.__longWatch.hud().reducedMotion)), "one page asks for reduced motion, the other does not");
  await pin([R, N], hit.ms);
  await sleep(100);
  const r1 = await fw(R), n1 = await fw(N);
  await sleep(900);
  const r2 = await fw(R), n2 = await fw(N);
  const moved = (a, b) => a.fish.some((q, i) => b.fish[i] && Math.hypot(q.x - b.fish[i].x, q.y - b.fish[i].y) > 0.02);
  ok(r1.fish.length > 0 && r1.fish.length === r2.fish.length && !moved(r1, r2) && moved(n1, n2), "with reduced motion the fish stand still on their places; on the other page the same fish drift");
  ok(await teleportSynced(R, [N], PLANK.x, PLANK.y), "the reduced-motion player stands on the jetty");
  await R.evaluate(([x, y]) => window.__longWatch.castAt(x, y), [hit.fish.bx, hit.fish.by]);
  ok(await waitFor(R, () => window.__longWatch.fish().line && window.__longWatch.fish().line.phase === "bite", null, 3000), "a fish bites");
  ok(new RegExp(String(BITE_WINDOW_STILL_S)).test((await fw(R)).state), `the panel gives the longer window (${BITE_WINDOW_STILL_S} seconds)`);
  await sleep((BITE_WINDOW_S + 0.6) * 1000);
  const still = await fw(R);
  ok(still.line && still.line.phase === "bite", `still biting ${BITE_WINDOW_S + 0.6} s later (a normal page would have lost it)`);
  await R.keyboard.press("KeyF");
  ok(await waitFor(R, () => window.__longWatch.fish().oil === 1, null, 3000), "and the press still catches it");
  for (const p of [R, N]) await p.close().catch(() => {});
}

try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const mk = () => ctx.newPage().then(p => (watch(p, "local"), p));
  await scenario("local transport (BroadcastChannel)", mk, "?net=local&hour=3&weather=clear", "fish1", 10000);
  await ctx.close();
  {
    const rctx = await browser.newContext({ viewport: { width: 700, height: 700 } });
    let n = 0;
    const mk2 = async () => { const p = await rctx.newPage(); watch(p, "reduced"); if (n++ === 0) await p.emulateMedia({ reducedMotion: "reduce" }); return p; };
    await reduced("reduced motion and normal motion side by side (local transport)", mk2, "?net=local&hour=3&weather=clear", "fish2");
    await rctx.close();
  }
  if (!onlyLocal) {
    const relay = await startRelay();
    const cs = [await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }), await browser.newContext({ viewport: { width: 900, height: 800 } })];
    let i = 0;
    const mk2 = () => cs[i++ % 2].newPage().then(p => (watch(p, "webrtc"), p));
    await scenario("Trystero over Nostr + WebRTC (relay on 127.0.0.1)", mk2, `?net=nostr&hour=3&weather=clear&relay=${encodeURIComponent(relay.url)}`, "fish3", 30000);
    for (const c of cs) await c.close().catch(() => {});
    relay.close();
  }
  ok(errors.length === 0, errors.length ? `console errors: ${errors.join(" | ")}` : "no console errors");
} catch (e) {
  ok(false, `test crashed: ${e && e.stack || e}`);
} finally {
  await browser.close(); server.close();
}
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
