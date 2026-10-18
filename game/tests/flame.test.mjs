#!/usr/bin/env node
// Milestone 32 tests for The Long Watch: carrying the flame together.
//
//   node game/tests/flame.test.mjs
//
// Part 0 (node, a fake mesh of three players): a flame can be taken only beside a lit beacon, one at a time and not
// again within the gap; it is handed on by offer, accept and commit, and across the hand-over the room never holds
// more than one flame; a flame offered twice, a forged "commit", bad numbers and strangers change nothing; a peer leaving
// at each step; the flame goes out after FLAME_LIFE_MS; lighting an unlit beacon puts FLAME_FUEL into the lighter's share
// (the caps still hold, a refused light keeps the flame), and the beacon still needs a second player.
// Part 1 (three pages, local transport): the same with real buttons, the holder's spark shown to the others, a reload
// that drops the flame, and a beacon lit by a flame plus fuel from a second player.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld, T, isBlocked } from "../js/world.js";
import { createBeacons, BEACON_RANGE, BEACON_NEED, FLAME_FUEL, MAX_OWN } from "../js/beacon.js";
import { createFlame, FLAME_LIFE_MS, FLAME_GAP_MS, FLAME_OFFER_MS, FLAME_RANGE, FLAME_SLACK } from "../js/flame.js";
import { withinSizeCap } from "../js/net/transport.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const STORE = "vigil.longwatch.v1";
const world = generateWorld();
const beaconList = world.landmarks.filter(l => l.kind === "beacon");

// ---- 0. node ----
console.log("# the flame rules, on a fake mesh");
{
  ok(FLAME_FUEL === BEACON_NEED / 2 && FLAME_FUEL + FLAME_FUEL <= MAX_OWN, `a flame is worth ${FLAME_FUEL} fuel, half of ${BEACON_NEED}`);
  const ids = ["a", "b", "c"], seedOf = { a: 111, b: 222, c: 333 };
  const fakes = new Map(), t = { v: 2000 };
  for (const id of ids) {
    const f = { id, hs: [], joins: [], leaves: [], sent: [], queue: [], peers: new Map(), me: { id: "me", seed: seedOf[id], x: 5, y: 5 }, events: [] };
    f.net = {
      selfId: id, onMessage: h => f.hs.push(h), onPeerLeave: h => f.leaves.push(h), onPeerJoin: h => f.joins.push(h),
      send(msg, to) { f.sent.push([msg, to]); for (const [oid, o] of fakes) if (oid !== id && (!to || to === oid)) o.queue.push([JSON.parse(JSON.stringify(msg)), id]); },
    };
    fakes.set(id, f);
  }
  const pump = () => { let moved = true; while (moved) { moved = false; for (const f of fakes.values()) while (f.queue.length) { moved = true; const [m, from] = f.queue.shift(); f.hs.forEach(h => h(m, from)); } } };
  const place = (id, x, y) => { const f = fakes.get(id); f.me.x = x; f.me.y = y; for (const o of fakes.values()) if (o.id !== id) { const p = o.peers.get(id); if (p) { p.tx = x; p.ty = y; } } };
  for (const f of fakes.values()) for (const o of ids) if (o !== f.id) f.peers.set(o, { id: o, seed: seedOf[o], tx: 5, ty: 5 });
  const N = {};
  for (const id of ids) {
    const f = fakes.get(id), inv = { driftwood: 40, reeds: 0, berries: 40, oil: 40 }, bev = [];
    const b = createBeacons(f.net, f.me, f.peers, inv, beaconList, { now: () => t.v, persist() {}, onEvent: (...a) => bev.push(a) });
    const fl = createFlame(f.net, f.me, f.peers, b, beaconList.length, { now: () => t.v, onEvent: (type, d) => f.events.push([type, d]), rand: (() => { let n = 100 + ids.indexOf(id) * 1000; return () => ++n; })() });
    N[id] = { f, b, fl, inv, bev };
  }
  const heldCount = () => ids.filter(id => N[id].fl.held).length + 0;
  const tickAll = () => { for (const id of ids) { N[id].b.tick(); N[id].fl.tick(); } pump(); };
  tickAll(); t.v += 2000; tickAll();
  const at = (b, k = 0) => [beaconList[b].x + 1 + k * 0.4, beaconList[b].y];

  // A lone player: nothing to take beside an unlit beacon, or away from one.
  place("a", ...at(0)); place("b", ...at(0, 1)); place("c", 6, 6);
  let r = N.a.fl.take();
  ok(!r.ok && r.why === "unlit" && !N.a.fl.held && heldCount() === 0, "beside an unlit beacon there is no flame to take");
  place("a", 6, 6);
  r = N.a.fl.take(); ok(!r.ok && r.why === "far", "away from every beacon there is no flame to take");
  // Light beacon 0 with fuel: a 6 + b 6.
  place("a", ...at(0)); place("b", ...at(0, 1));
  for (let i = 0; i < 2; i++) { N.a.b.add("oil"); N.b.b.add("oil"); } pump();
  ok(N.a.b.lit(0) && N.b.b.lit(0) && N.c.b.lit(0), "beacon 0 is lit on all three pages (2 lamp oil each, 3 fuel apiece: 6 + 6 from two players)");

  // Take.
  const savedInv = JSON.stringify(N.a.inv);
  r = N.a.fl.take(); pump();
  ok(r.ok && r.b === 0 && N.a.fl.held && N.a.fl.held.b === 0 && JSON.stringify(N.a.inv) === savedInv, "beside the lit beacon a flame is taken; the pack does not change");
  ok(N.a.fl.held.left > FLAME_LIFE_MS - 1000 && N.a.fl.held.left <= FLAME_LIFE_MS, `it burns for ${FLAME_LIFE_MS / 1000} s`);
  ok(N.b.f.peers.get("a").flame === true && N.a.f.me.flame === true && N.c.f.peers.get("a").flame === true, "the others are told that a carries a flame (and nothing else about it)");
  const fh = N.a.f.sent.map(([x]) => x).filter(x => x.k === "fh");
  ok(fh.length >= 1 && fh.every(x => Object.keys(x).length === 2 && withinSizeCap(x)), "the message is two small fields");
  r = N.a.fl.take(); ok(!r.ok && r.why === "held" && heldCount() === 1, "a second flame cannot be taken while one is carried");
  // Let it burn out, and take another after the gap.
  t.v += FLAME_LIFE_MS + 10; tickAll();
  ok(heldCount() === 0 && !N.a.f.me.flame && N.b.f.peers.get("a").flame === false, "after the flame's life it has gone out for the holder, and the others see it go out");
  ok(N.a.f.events.some(e => e[0] === "out"), "the holder is told it went out");
  t.v += FLAME_GAP_MS + 10;
  r = N.a.fl.take(); ok(r.ok && N.a.fl.held, "a new flame can be taken once the gap since the last take has passed");
  place("c", ...at(0, 1));
  N.a.fl.offer(); pump(); N.c.fl.accept(); pump();
  ok(!N.a.fl.held && N.c.fl.held, "(a hands it to c)");
  r = N.a.fl.take(); ok(!r.ok && r.why === "gap", `a page that took a flame less than ${FLAME_GAP_MS / 1000} s ago cannot take another, even after handing the first on`);
  t.v += FLAME_GAP_MS + 10; tickAll();
  r = N.a.fl.take(); ok(r.ok, "after the gap it can");
  t.v += FLAME_LIFE_MS + 10; tickAll(); t.v += FLAME_GAP_MS + 10; tickAll();
  ok(heldCount() === 0, "(every flame has burned out)");
  place("a", ...at(0)); place("b", 7, 7); place("c", 7, 7);
  N.a.fl.take(); pump();
  ok(heldCount() === 1 && N.a.fl.held, "a clean start: only a carries a flame");

  // Hand-over: offer, accept, commit. The room never holds two.
  place("a", 20, 20); place("b", 40, 40); place("c", 21.5, 20);
  ok(N.a.fl.target() && N.a.fl.target().id === "c", "the nearest player in reach (3 tiles) is c");
  let maxHeld = 0; const track = () => { maxHeld = Math.max(maxHeld, heldCount()); };
  N.a.f.sent.length = 0;
  ok(N.a.fl.offer(), "a offers the flame to c"); track();
  const fo = N.a.f.sent.map(([x]) => x).filter(x => x.k === "fo");
  ok(fo.length === 1 && Object.keys(fo[0]).length === 2 && Number.isInteger(fo[0].t), "the offer is two numbers (k and an offer number)");
  ok(!N.a.fl.offer(), "a second offer while one is waiting is refused");
  const lightWhile = N.a.fl.light(); ok(!lightWhile.ok && lightWhile.why === "offering" && N.a.fl.held, "while the offer is open the flame cannot also be used");
  pump(); track();
  ok(N.c.fl.incoming && N.c.fl.incoming.from === "a" && N.a.fl.held && !N.c.fl.held, "c is shown the offer; a still carries the flame");
  ok(N.c.fl.accept(), "c accepts");
  const q = fakes.get("a").queue.length; // a has the accept waiting
  ok(q === 1 && N.a.fl.held && !N.c.fl.held && N.c.fl.expecting, "between accept and commit the flame is only a's");
  pump(); track();
  ok(!N.a.fl.held && N.c.fl.held && N.c.fl.held.b === 0 && heldCount() === 1 && maxHeld <= 1, "after the commit c carries it, a does not, and the room never held two");
  ok(N.c.fl.held.left <= FLAME_LIFE_MS && N.c.fl.held.left > FLAME_LIFE_MS - 3000, "the flame keeps burning on its own clock: passing it on does not give it a new life");
  ok(N.c.f.me.flame && !N.a.f.me.flame && N.b.f.peers.get("c").flame === true && N.b.f.peers.get("a").flame === false, "the others see the spark move from a to c");
  // Offered twice (a replay of the same offer number), a forged commit, and a second "yes".
  const ft = fo[0].t;
  N.a.f.sent.length = 0;
  // a no longer holds: its offer() is refused.
  ok(!N.a.fl.offer(), "a cannot offer a flame it no longer has");
  place("a", 21, 20.5); place("c", 21.5, 20);
  const cHeld = JSON.stringify(N.c.fl.held);
  fakes.get("c").hs.forEach(h => h({ k: "fo", t: ft }, "a")); pump();
  ok(!N.c.fl.incoming && JSON.stringify(N.c.fl.held) === cHeld && N.c.f.sent.some(([x, to]) => x.k === "fd" && x.t === ft && to === "a"), "the same offer number again is refused (answered no), nothing new is shown");
  fakes.get("c").hs.forEach(h => h({ k: "fc", t: ft, b: 0, l: 100 }, "a"));
  ok(JSON.stringify(N.c.fl.held) === cHeld && heldCount() === 1, "a repeated commit adds nothing: still one flame in the room");
  fakes.get("b").hs.forEach(h => h({ k: "fc", t: 77, b: 0, l: 100 }, "a")); pump();
  ok(!N.b.fl.held && heldCount() === 1, "a commit nobody asked for makes no flame");
  // A forged "fa" cannot take a flame from a page that never offered.
  fakes.get("c").hs.forEach(h => h({ k: "fa", t: ft }, "b")); pump();
  ok(N.c.fl.held && heldCount() === 1, "a forged accept (no offer made, or from the wrong player) changes nothing");

  // Lighting an unlit beacon with the flame.
  place("c", ...at(1)); place("b", ...at(1, 1)); place("a", 90, 90);
  const own0 = N.c.b.shares.own(1, 333);
  let lr = N.c.fl.light(); pump();
  ok(lr.ok && lr.b === 1 && !N.c.fl.held && N.c.b.shares.own(1, 333) === own0 + FLAME_FUEL && N.b.b.shares.own(1, 333) === own0 + FLAME_FUEL, `lighting beacon 1 with the flame puts ${FLAME_FUEL} fuel in c's share, seen by the others; the flame is used up`);
  ok(N.b.b.shares.fuel(1) === FLAME_FUEL && N.b.b.shares.players(1) === 1 && !N.b.b.lit(1), "the beacon is not lit yet: half the fuel and one player");
  ok(!N.b.f.peers.get("c").flame && !N.c.f.me.flame, "the spark is gone from c for everyone");
  N.b.b.add("oil"); N.b.b.add("oil"); pump(); // +6 from a second player
  ok(N.b.b.lit(1) && N.c.b.lit(1) && N.a.b.lit(1), "a second player adding the other half lights it on all three pages (6 from the flame + 6 from fuel)");
  const lr2 = (N.c.fl.held, N.c.fl.light()); ok(!lr2.ok && lr2.why === "none", "with no flame there is nothing to light with");
  // A refused light keeps the flame: beacon already lit, and a full share.
  t.v += FLAME_GAP_MS + 10; place("a", ...at(0)); N.a.fl.take(); pump();
  place("a", ...at(1)); lr = N.a.fl.light();
  ok(!lr.ok && lr.why === "lit" && N.a.fl.held, "beside a lit beacon the flame is refused and kept");
  // full: a fresh unlit beacon 2 where a already added 12.
  place("a", ...at(2)); for (let i = 0; i < 4; i++) N.a.b.add("oil");
  ok(N.a.b.shares.own(2, 111) === 12, "(setup) a has put 12 fuel into beacon 2");
  lr = N.a.fl.light(); ok(!lr.ok && lr.why === "full" && N.a.fl.held && N.a.b.shares.own(2, 111) === 12, `a share of 12 plus a flame (${FLAME_FUEL}) would pass the ${MAX_OWN} limit: refused, nothing changes, the flame is kept`);
  place("a", ...at(3)); lr = N.a.fl.light(); pump();
  ok(lr.ok && N.a.b.shares.own(3, 111) === FLAME_FUEL && !N.a.b.lit(3), "on another beacon the same flame lights its half; one player alone does not light a beacon");
  N.a.b.add("oil"); N.a.b.add("oil"); pump();
  ok(N.a.b.shares.fuel(3) === 12 && N.a.b.shares.players(3) === 1 && !N.b.b.lit(3), "even 12 fuel from one player (flame and berries) does not light it: a second player is still needed");
  place("b", ...at(3, 1)); N.b.b.add("driftwood"); pump();
  ok(N.a.b.lit(3) && N.b.b.lit(3) && N.c.b.lit(3), "the second player's 1 fuel lights it");

  // Peers leaving, at each step.
  console.log("# peers leaving");
  t.v += FLAME_LIFE_MS + FLAME_GAP_MS + 10; tickAll();
  place("c", ...at(0)); place("a", 30, 30); place("b", 31, 30); N.c.fl.take(); pump();
  place("c", 30.5, 30.5);
  ok(heldCount() === 1 && N.c.fl.offer() && N.c.fl.outgoing, "c offers to the nearest player");
  fakes.get("c").leaves.forEach(h => h(N.c.fl.outgoing.to)); // the receiver leaves before answering
  ok(!N.c.fl.outgoing && N.c.fl.held && heldCount() === 1, "the receiver leaves before answering: the offer ends, c still carries the flame");
  tickAll();
  // Receiver leaves after accepting (the commit goes to nobody): flame goes out, never two.
  for (const o of ids) for (const f of fakes.values()) if (o !== f.id && !f.peers.has(o)) f.peers.set(o, { id: o, seed: seedOf[o], tx: 30, ty: 30 });
  place("c", 30, 30); place("a", 30.5, 30); place("b", 60, 60);
  fakes.get("c").queue.length = 0; fakes.get("a").queue.length = 0; fakes.get("b").queue.length = 0;
  N.c.fl.offer(); pump();
  ok(N.a.fl.incoming || N.b.fl.incoming, "(setup) the offer reached a");
  N.a.fl.accept();
  fakes.get("a").leaves.forEach(h => h("c")); // a never hears the commit of c, since it leaves the room
  pump();
  ok(heldCount() <= 1 && !N.c.fl.held, "the giver let go when the accept came; if the receiver left, the flame is gone and never copied");
  ok(!N.a.fl.expecting, "the receiver that lost the giver is not left waiting");
  // Giver leaves while the receiver waits for the commit.
  t.v += FLAME_GAP_MS + FLAME_LIFE_MS; tickAll();
  place("c", ...at(0)); N.c.fl.take(); pump(); place("c", 30, 30); place("a", 30.5, 30);
  N.c.fl.offer(); pump(); N.a.fl.accept();
  fakes.get("a").leaves.forEach(h => h("c")); fakes.get("a").queue.length = 0;
  ok(!N.a.fl.expecting && heldCount() === 1, "the giver leaving while the receiver waits ends the wait; the giver still has the flame until it is given");
  N.c.fl.cancel(); pump();
  // Offer timeout.
  t.v += FLAME_GAP_MS + FLAME_LIFE_MS; tickAll(); place("c", ...at(0)); N.c.fl.take(); pump(); place("c", 30, 30);
  N.c.fl.offer(); pump(); t.v += FLAME_OFFER_MS + 10; tickAll();
  ok(!N.c.fl.outgoing && !N.a.fl.incoming && N.c.fl.held, "an offer nobody answers ends after FLAME_OFFER_MS and the giver keeps the flame");
  ok(!N.a.fl.accept(), "a late accept does nothing");
  // Out of reach.
  place("c", 30, 30); place("a", 30 + FLAME_RANGE + 0.5, 30);
  ok(!N.c.fl.offer(), `farther than ${FLAME_RANGE} tiles an offer cannot be made`);
  place("a", 30 + FLAME_RANGE + FLAME_SLACK + 1, 30);
  fakes.get("a").hs.forEach(h => h({ k: "fo", t: 4242 }, "c"));
  ok(!N.a.fl.incoming && !fakes.get("a").sent.some(([x]) => x.k === "fd" && x.t === 4242), `an offer from farther than ${FLAME_RANGE + FLAME_SLACK} tiles (by the receiver's own view) is dropped`);
  // Decline.
  place("a", 31, 30); N.c.fl.offer(); pump(); N.a.fl.decline(); pump();
  ok(!N.c.fl.outgoing && N.c.fl.held && !N.a.fl.held, "a declined offer leaves the flame with the giver");
  // Take it back.
  N.c.fl.offer(); pump(); N.c.fl.cancel(); pump();
  ok(!N.a.fl.incoming && N.c.fl.held && !N.c.fl.outgoing, "taking the offer back clears it on both sides");
  // A holder cannot receive a second flame; a page waiting cannot take one.
  place("c", 30, 30); place("a", 30.5, 30);
  t.v += FLAME_GAP_MS + 10; place("a", ...at(0)); N.a.fl.take(); pump(); place("a", 30.5, 30);
  N.c.fl.offer(); pump();
  ok(!N.a.fl.incoming && !N.c.fl.outgoing && N.c.fl.held && N.a.fl.held && N.c.f.sent.length > 0, "a page that already carries a flame is not shown another offer (answered no), and the offerer keeps its own");
  ok(heldCount() === 2, "two flames in the room are two flames taken at two beacons, each by its own taker");

  // Hostile messages change nothing.
  console.log("# hostile messages");
  for (const id of ids) N[id].fl.tick();
  const snapshot = () => JSON.stringify(ids.map(id => [N[id].fl.held && N[id].fl.held.b, N[id].fl.incoming && N[id].fl.incoming.t, N[id].fl.outgoing && N[id].fl.outgoing.t, N[id].fl.expecting && N[id].fl.expecting.t, N[id].f.peers.get(id === "a" ? "b" : "a").flame]));
  const before = snapshot();
  const bad = [{ k: "fh", h: 2 }, { k: "fh", h: "1" }, { k: "fh", h: 1, x: 1 }, { k: "fh" }, { k: "fo", t: 0 }, { k: "fo", t: -5 }, { k: "fo", t: 1.5 }, { k: "fo", t: "7" }, { k: "fo", t: 5, extra: 1 }, { k: "fo" },
    { k: "fc", t: 5, b: 9, l: 5 }, { k: "fc", t: 5, b: -1, l: 5 }, { k: "fc", t: 5, b: 0, l: 0 }, { k: "fc", t: 5, b: 0, l: 99999 }, { k: "fc", t: 5, b: 0.5, l: 5 }, { k: "fc", t: 5, b: "0", l: 5 }, { k: "fc", t: 5, b: 0 }, { k: "fa", t: 5 }, { k: "fa" }, { k: "fd", t: 5 }, { k: "fd", t: [5] }, { k: "fo", t: {} }, { k: "fx", t: 5 }, null, 5, "fo", [], { k: ["fo"], t: 5 }];
  for (const m of bad) for (const id of ids) fakes.get(id).hs.forEach(h => h(m, id === "a" ? "b" : "a"));
  for (const id of ids) fakes.get(id).hs.forEach(h => { h({ k: "fh", h: 1 }, "stranger"); h({ k: "fo", t: 99 }, "stranger"); });
  ok(snapshot() === before && !N.a.fl.incoming && !N.b.fl.incoming && !N.c.fl.incoming, "bad numbers, extra fields, wrong kinds and strangers change nothing");
  // The rate limit: a flood from one peer is dropped after the burst.
  // b and a must stand in range, or every offer is dropped before the limit is even reached (the check would pass at 0).
  // The clock also moves on, so the bucket is full again after the hostile messages above (the bucket is drained by them).
  place("b", 30, 30); place("a", 30.5, 30); t.v += 10000;
  let flood = 0; const fb = fakes.get("b");
  for (let i = 0; i < 200; i++) fb.hs.forEach(h => h({ k: "fo", t: 1000 + i }, "a"));
  flood = fb.sent.filter(([x]) => x.k === "fd").length;
  ok(flood > 0 && flood <= 20, `a flood of 200 offers from one peer is answered ${flood} times, at most 20 (rate limit)`);
}

// ---- pages ----
console.log("\n# three pages, local transport");
const require = createRequire(import.meta.url);
let pw;
for (const id of ["playwright", "/opt/node-tools/node_modules/playwright", "playwright-core"]) { try { pw = require(id); break; } catch { /* next */ } }
if (!pw) { console.error("playwright not found"); process.exit(2); }
async function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = "/opt/pw-browsers";
  if (!existsSync(base)) return undefined;
  for (const d of (await readdir(base)).filter(d => d.startsWith("chromium")).sort().reverse())
    for (const rel of ["chrome-linux/chrome", "chrome-linux64/chrome"]) { const p = path.join(base, d, rel); if (existsSync(p)) return p; }
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
  page.on("console", m => { if (m.type() === "error") errors.push(`${label}: ${m.text()}`); });
}
async function waitFor(page, fn, arg, timeout = 10000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 50 }); return true; } catch { return false; }
}
const land = (x, y) => { const tl = world.tiles[Math.floor(y) * world.w + Math.floor(x)]; return (tl === T.SAND || tl === T.GRASS || tl === T.MEADOW) && !isBlocked(world, x, y); };
const spots = (l) => { const out = []; for (let r = 1.0; r <= 2.2; r += 0.3) for (let a = 0; a < 6.28; a += 0.45) { const x = l.x + Math.cos(a) * r, y = l.y + Math.sin(a) * r; if (land(x, y) && Math.hypot(x - l.x, y - l.y) <= BEACON_RANGE - 0.3) out.push({ x, y }); } return out; };
const pair = (l) => { const s = spots(l); let best = null; for (const p of s) for (const q of s) { const d = Math.hypot(p.x - q.x, p.y - q.y); if (d > 0.9 && d < 2.4 && (!best || d < best[2])) best = [p, q, d]; } return best; };
async function seedPack(page, url, patch) {
  await page.goto(url);
  await page.evaluate(([K, patch]) => { const s = JSON.parse(sessionStorage.getItem(K)); Object.assign(s, patch); sessionStorage.setItem(K, JSON.stringify(s)); }, [STORE, patch]);
  await page.reload();
}
const lw = (page, fn, ...a) => page.evaluate(([fn, a]) => window.__longWatch[fn](...a), [fn, a]);
async function teleportSynced(page, others, x, y) {
  if (!await lw(page, "teleport", x, y)) return false;
  for (const o of others) if (!await waitFor(o, ([x, y]) => window.__longWatch.peers().some(p => Math.hypot(p.x - x, p.y - y) < 0.05), [x, y], 6000)) return false;
  return true;
}
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const mk = () => ctx.newPage().then(p => (watch(p, "page"), p));
  const url = `${base}?net=local&hour=3#room=3`;
  const [A, B, C] = [await mk(), await mk(), await mk()];
  const pack = { inv: { driftwood: 20, reeds: 0, berries: 0, oil: 6 } };
  for (const p of [A, B, C]) await seedPack(p, url, pack);
  for (const p of [A, B, C]) await p.click("#enter");
  const seen = await Promise.all([A, B, C].map(p => waitFor(p, () => window.__longWatch.peers().length === 2, null, 12000)));
  ok(seen.every(Boolean), "each page sees the other two");
  const synced = await Promise.all([A, B, C].map(p => waitFor(p, () => window.__longWatch.beacon() && window.__longWatch.beacon().synced, null, 6000)));
  ok(synced.every(Boolean), "all three have heard the beacon state");
  const [idA, idB, idC] = await Promise.all([A, B, C].map(p => lw(p, "self").then(s => s.id)));
  const p0 = pair(beaconList[0]), p1 = pair(beaconList[1]);
  ok(!!p0 && !!p1, "there is open ground for two players within reach of beacons 0 and 1");
  const flameOf = (p) => lw(p, "flame");
  // Light beacon 0 with fuel by A and B.
  ok(await teleportSynced(A, [B, C], p0[0].x, p0[0].y) && await teleportSynced(B, [A, C], p0[1].x, p0[1].y), "A and B stand beside beacon 0");
  for (let i = 0; i < 2; i++) { await lw(A, "addFuel", "oil"); await lw(B, "addFuel", "oil"); }
  ok(await Promise.all([A, B, C].map(p => waitFor(p, () => window.__longWatch.beacon().lit[0], null, 6000))).then(r => r.every(Boolean)), "beacon 0 is lit on all three pages");
  // The Flame panel appears beside a lit beacon, with a Take button; far from one it is hidden.
  ok(await waitFor(A, () => window.__longWatch.flame().buttons.take, null, 4000), "beside a lit beacon A sees the Flame panel with a Take button");
  const fcHidden = await flameOf(C);
  ok(!fcHidden.panel && !fcHidden.held, "C, far from every beacon, sees no Flame panel");
  // A takes a flame with the real button.
  const packA = await lw(A, "give").then(g => JSON.stringify(g.inv));
  await A.click("#flametake");
  let fa = await flameOf(A);
  ok(fa.held && fa.held.b === 0 && fa.meFlag && /flame from the/.test(fa.state) && JSON.stringify((await lw(A, "give")).inv) === packA, "A takes a flame: it shows in the panel and nothing leaves A's pack");
  ok(await waitFor(B, (id) => window.__longWatch.flame().peerFlags.some(p => p.id === id && p.flame), idA, 4000) && await waitFor(C, (id) => window.__longWatch.flame().peerFlags.some(p => p.id === id && p.flame), idA, 4000), "B and C are told that A carries a flame");
  ok(!(await A.evaluate(() => document.getElementById("flametake").offsetParent !== null)), "the Take button is hidden while a flame is carried");
  // Hand it to C beside beacon 1.
  ok(await teleportSynced(A, [B, C], p1[0].x, p1[0].y) && await teleportSynced(C, [A, B], p1[1].x, p1[1].y), "A and C stand together beside beacon 1 (unlit)");
  ok(await waitFor(A, () => window.__longWatch.flame().buttons.give, null, 4000), "A's Pass-on button is available with C in reach");
  await A.click("#flamegive");
  ok(await waitFor(C, () => window.__longWatch.flame().buttons.yes, null, 4000), "C is shown the offer with a Take it button");
  fa = await flameOf(A);
  ok(fa.held && fa.outgoing, "until C says yes, A still carries the flame");
  await C.click("#flameyes");
  ok(await waitFor(C, () => window.__longWatch.flame().held, null, 4000) && await waitFor(A, () => !window.__longWatch.flame().held, null, 4000), "after C says yes, C carries the flame and A does not");
  const fc = await flameOf(C), fa2 = await flameOf(A);
  ok(fc.held.b === 0 && !fa2.held && !fa2.meFlag && fc.meFlag, "the flame came from beacon 0, and only C carries it");
  ok(await waitFor(B, (id) => window.__longWatch.flame().peerFlags.some(p => p.id === id && p.flame) && window.__longWatch.flame().peerFlags.some(p => p.flame === false), idC, 4000), "B sees the spark move to C");
  // C lights beacon 1 with the flame; B then adds the other half.
  ok(await waitFor(C, () => window.__longWatch.flame().buttons.light, null, 4000), "C beside the unlit beacon 1 can light it with the flame");
  await C.click("#flamelight");
  ok(await Promise.all([A, B, C].map(p => waitFor(p, ([f]) => { const s = window.__longWatch.beacon(); return s.fuel[1] === f && s.players[1] === 1 && !s.lit[1]; }, [FLAME_FUEL], 4000))).then(r => r.every(Boolean)), `beacon 1 holds ${FLAME_FUEL} fuel from one player, on all three pages, and is not lit`);
  ok(!(await flameOf(C)).held && !(await flameOf(C)).meFlag, "C's flame is used up");
  ok(await waitFor(B, (id) => window.__longWatch.flame().peerFlags.every(p => !p.flame), idC, 4000), "the spark is gone for B");
  ok(await teleportSynced(B, [A, C], p1[0].x + 0.3, p1[0].y) || await teleportSynced(B, [A, C], p1[1].x, p1[1].y), "B comes to beacon 1");
  await lw(B, "addFuel", "oil"); await lw(B, "addFuel", "oil");
  ok(await Promise.all([A, B, C].map(p => waitFor(p, () => window.__longWatch.beacon().lit[1], null, 5000))).then(r => r.every(Boolean)), "B's other half lights beacon 1 on all three pages (flame 6 + fuel 6, two players)");
  // A reload drops the flame.
  ok(await teleportSynced(B, [A, C], p0[1].x, p0[1].y), "B stands beside the lit beacon 0 again");
  await lw(B, "flameTake");
  ok((await flameOf(B)).held, "B takes a flame from beacon 0 (the gap is per page)");
  const shareBefore = (await lw(B, "beacon")).own;
  await B.reload();
  await B.click("#enter");
  ok(await waitFor(B, () => window.__longWatch.peers().length === 2, null, 12000) && await waitFor(B, () => window.__longWatch.beacon().synced, null, 6000), "B reloads and rejoins");
  await waitFor(B, (n) => window.__longWatch.beacon().own.reduce((a, b) => a + b, 0) === n, shareBefore.reduce((a, b) => a + b, 0), 4000);
  const fb = await flameOf(B);
  ok(fb && !fb.held && !fb.meFlag, "a reload drops the flame: it was never saved");
  ok(await waitFor(A, (id) => window.__longWatch.flame().peerFlags.every(p => !p.flame), idB, 4000), "and the others no longer see a spark on B");
  ok(JSON.stringify((await lw(B, "beacon")).own) === JSON.stringify(shareBefore), "B's fuel shares are unchanged by carrying and dropping a flame");
  ok(errors.length === 0, `no console errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
