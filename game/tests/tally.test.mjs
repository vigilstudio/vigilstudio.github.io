#!/usr/bin/env node
// Milestone 35 tests for The Long Watch: the dawn tally, together.
//
//   node game/tests/tally.test.mjs
//
// Part 0 (node, the tally module alone, a fake clock): a page that was there when the night began starts complete, one that
// came later is partial; a skipped slot makes it partial; a new night starts a clean record; a shade is written down once,
// a shade of another night, a bad slot or a bad number is refused, a night's list holds exactly 72 pairs; the words say "partial" and
// "at least"; no message is read or sent by the module.
// Part 1 (node, the real beacon, notes and shades modules on a fake mesh): two pages that were there from the start agree on
// beacons burning, the lighthouse, notes done and shades driven off; a late joiner hears the beacons and notes (they agree) but not the
// shade driven off two slots before it came, and its tally is labelled partial; shades are pinned (their clock stands still).
// Part 2 (four pages, local transport): shades pinned to quiet slots, the night hour pinned to dawn. Two pages that watched the
// night agree on the same numbers and words after a beacon is lit together; a page that came in after the night began shows
// the same beacon and note numbers under a partial label; a page at an earlier hour shows no tally.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld, T, isBlocked } from "../js/world.js";
import { createShades, shadeCount, shadePlan, SLOT_MS, MAX_SHADES, SHADE_NEED } from "../js/shades.js";
import { createBeacons, BEACON_RANGE } from "../js/beacon.js";
import { createQuests, notesFor } from "../js/quests.js";
import { watchKept } from "../js/lighthouse.js";
import { createTally, tallyText, nightOf, nightStart, NIGHT_MS, DAWN_HOUR, SLOTS_PER_NIGHT, MAX_BANISHED } from "../js/tally.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const STORE = "vigil.longwatch.v1";
const world = generateWorld();
const beaconList = world.landmarks.filter(l => l.kind === "beacon");
const FIRST = (n) => nightStart(n) / SLOT_MS;                 // first shade slot of night n

// ---- 0. the module alone ----
console.log("# the tally module, with a fake clock");
{
  ok(NIGHT_MS === 48 * 60 * 1000 && SLOTS_PER_NIGHT === 18 && MAX_BANISHED === 72 && DAWN_HOUR === 7, "a night is 48 minutes, 18 shade slots, at most 72 shades; the tally shows from hour 7");
  ok(nightOf(nightStart(40)) === 40 && nightOf(nightStart(40) - 1) === 39 && NIGHT_MS * 30 === 86400000, "a night starts on its own boundary, and 30 nights make a UTC day (so a night never spans a keeper's day change)");
  const N = 12345, c = { ms: nightStart(N) - 5000 };
  const view = (t, o = {}) => t.view({ lit: [true, false, false, false], kept: false, notes: [true, false, false], synced: true, ...o });
  const early = createTally({ clock: () => c.ms });
  c.ms = nightStart(N) + 60000;
  const late = createTally({ clock: () => c.ms });
  early.watch(); late.watch();
  ok(!view(early).partial && view(early).night === N, "a page that was there before the night began has a complete tally");
  ok(view(late).partial && view(late).why === "late", "a page that came in after the night began is partial, and says why");
  ok(view(early).beaconsLit === 1 && view(early).beaconsTotal === 4 && view(early).notesDone === 1 && view(early).notesTotal === 3 && view(early).lighthouse === false, "beacons and notes are counted from the state it is given");
  ok(view(early, { kept: true }).lighthouse === true && view(early, { kept: "yes" }).lighthouse === false, "the lighthouse is lit only for a real true");
  ok(view(early, { synced: false }).partial && view(early, { synced: false }).why === "sync" && !view(early, { synced: true }).partial, "a page that has not heard the others' counts yet is partial");
  // shades
  const s0 = FIRST(N) + 3;
  ok(early.banished(s0, 1) === true && early.banished(s0, 1) === false && view(early).shades === 1, "a shade driven off is written down once");
  ok(early.banished(s0, 2) && early.banished(s0 + 1, 1) && view(early).shades === 3, "other shades and other slots add to it");
  for (const [slot, k] of [[s0, 4], [s0, -1], [s0, 1.5], [s0, "1"], [s0, NaN], [1.5, 0], [NaN, 0], ["9", 0], [FIRST(N) - 1, 0], [FIRST(N + 1), 0], [null, 0], [s0, null]]) {
    ok(early.banished(slot, k) === false, `a shade ${JSON.stringify([slot, k])} is refused (bad number, or another night)`);
  }
  ok(view(early).shades === 3, "and none of those changed the count");
  // the night's list holds every (slot, shade) pair of a night and no more
  {
    const f = createTally({ clock: () => c.ms }); f.watch();
    let added = 0;
    for (let s = FIRST(N); s < FIRST(N) + SLOTS_PER_NIGHT; s++) for (let k = 0; k < MAX_SHADES; k++) if (f.banished(s, k)) added++;
    ok(added === MAX_BANISHED && view(f).shades === MAX_BANISHED, `every slot of a night with every shade fills the list exactly (${added} of ${MAX_BANISHED}) and no pair of any other night gets in`);
    ok(f.banished(FIRST(N), 0) === false && view(f).shades === MAX_BANISHED, "a shade written down again is refused when the night's list is full");
  }
  // a stretch the page did not see
  {
    const s = createTally({ clock: () => c.ms }); s.watch();
    c.ms += 100000; s.watch(); c.ms += 100000; s.watch();
    ok(!view(s).partial || view(s).why === "late", "slot by slot with no gap, the tally is not made partial by a gap");
    const g = createTally({ clock: () => c.ms }); const was = c.ms; // came in the middle of the night: partial already; use a page from the start
    c.ms = nightStart(N + 1) - 1000; const h = createTally({ clock: () => c.ms }); h.watch();
    c.ms = nightStart(N + 1) + 2000; h.watch(); // the new night begins; seen from its first slot
    ok(!view(h).partial && view(h).night === N + 1, "a page that was there when the next night began has a complete tally of it");
    c.ms = nightStart(N + 1) + 3 * SLOT_MS + 1000; h.watch(); // a tab that stood still for three slots
    ok(view(h).partial && view(h).why === "late", "a page that did not draw for a whole slot or more is partial (it may have missed a shade)");
    c.ms = was; void g;
  }
  // night roll
  {
    c.ms = nightStart(N + 5) - 1000; const r = createTally({ clock: () => c.ms }); r.watch();
    c.ms = nightStart(N + 5) + 1000; r.watch();
    r.banished(FIRST(N + 5) + 2, 0);
    ok(view(r).shades === 1 && view(r).night === N + 5, "a shade of this night is counted");
    c.ms = nightStart(N + 6) + 1000; r.watch();
    ok(view(r).shades === 0 && view(r).night === N + 6 && !view(r).partial, "a new night starts from nothing, complete");
    ok(r.banished(FIRST(N + 5) + 2, 0) === false && view(r).shades === 0, "a shade of the night before is refused");
  }
  // words
  {
    const full = tallyText({ night: 1, beaconsLit: 2, beaconsTotal: 4, lighthouse: false, shades: 3, notesDone: 1, notesTotal: 3, partial: false, why: "" });
    ok(full.title === "The dawn tally" && full.lines.join("|") === "Beacons burning at dawn: 2 of 4.|The lighthouse: dark.|Shades driven off tonight: 3.|Keeper's notes done today: 1 of 3." && /same numbers/.test(full.note) && !/artial/.test(full.note), `the words for a full tally: "${full.lines.join(" ")}"`);
    const lt = tallyText({ night: 1, beaconsLit: 4, beaconsTotal: 4, lighthouse: true, shades: 0, notesDone: 0, notesTotal: 3, partial: true, why: "late" });
    ok(/partial/.test(lt.title) && /^Shades driven off tonight: at least 0\.$/.test(lt.lines[2]) && /^Beacons burning at dawn: 4 of 4\.$/.test(lt.lines[0]) && lt.lines[1] === "The lighthouse: lit." && /^Partial tally: you came in after/.test(lt.note), `a late page's words say partial and "at least": "${lt.lines[2]}"`);
    const st = tallyText({ night: 1, beaconsLit: 1, beaconsTotal: 4, lighthouse: false, shades: 0, notesDone: 0, notesTotal: 3, partial: true, why: "sync" });
    ok(/^Beacons burning at dawn: at least 1 of 4\.$/.test(st.lines[0]) && /^Keeper's notes done today: at least 0 of 3\.$/.test(st.lines[3]) && /still hearing/.test(st.note), "a page still hearing the others says every number is at least");
  }
  const src = await readFile(path.join(here, "..", "js", "tally.js"), "utf8");
  ok(!/onMessage|\.send\(|net\./.test(src.replace(/^\/\/.*$/gm, "")), "the tally module reads and sends no message (its code has no net calls)");
}

// ---- 1. the real modules on a fake mesh ----
console.log("\n# two pages agree and a late joiner is partial (real beacons, notes and shades on a fake mesh)");
{
  // A night whose second slot holds a shade; the clock is ours, a stalled clock inside a slot keeps a shade still.
  let N = 20000; while (!shadeCount(world.seed, FIRST(N) + 1)) N++;
  const S1 = FIRST(N) + 1, plan = shadePlan(world, S1, 0);
  const clock = { ms: nightStart(N) - 1000, perf: 5000 };
  const DAY = 20000;
  const mesh = new Map();
  const mkNode = (id, seed) => {
    const handlers = [], joins = [];
    const net = { selfId: id, send: (msg, to) => { for (const [k, n] of mesh) if (k !== id && (!to || to === k)) for (const h of n.handlers) h(JSON.parse(JSON.stringify(msg)), id); }, onMessage: h => handlers.push(h), onPeerJoin: h => joins.push(h), onPeerLeave: () => {} };
    const me = { id, seed, x: 0, y: 0, lamp: 0, snuffed: false }, peers = new Map(), inv = { driftwood: 40, reeds: 0, berries: 0, oil: 0 };
    const node = { id, seed, net, me, peers, inv, handlers, joins, events: [] };
    const now = () => clock.perf, ck = () => clock.ms;
    node.tally = createTally({ clock: ck });
    node.beacon = createBeacons(net, me, peers, inv, beaconList, { now, persist() {} });
    node.quests = createQuests(net, world, me, peers, { now, clock: ck, day: DAY, beacons: beaconList.length });
    node.shades = createShades(net, world, me, peers, { now, clock: ck, reachFor: () => 3.2, onEvent: (t, k) => { if (t === "banished") node.tally.banished(node.shades.slot, k); } });
    mesh.set(id, node);
    return node;
  };
  const connect = (node) => { for (const o of mesh.values()) if (o !== node) { o.peers.set(node.id, node.me); node.peers.set(o.id, o.me); o.joins.forEach(h => h(node.id)); node.joins.forEach(h => h(o.id)); } };
  const fake = (nodes, id, seed) => { for (const n of nodes) n.peers.set(id, { id, seed, x: 99, y: 99, lamp: 0, snuffed: false }); };
  const tickAll = (dt = 0.1) => { clock.perf += dt * 1000; for (const n of mesh.values()) { n.tally.watch(); n.beacon.tick(); n.quests.tick(); n.shades.tick(dt); } };
  const run = (secs, dt = 0.1) => { for (let i = 0; i < Math.round(secs / dt); i++) tickAll(dt); };
  const inputOf = (n) => ({ lit: beaconList.map((_, b) => n.beacon.shares.lit(b)), kept: watchKept(beaconList.map((_, b) => n.beacon.shares.lit(b))), notes: n.quests.notes.map((_, q) => n.quests.shares.done(q)), synced: n.beacon.synced() && n.quests.synced() });
  const viewOf = (n) => n.tally.view(inputOf(n));
  const strip = (v) => { const { partial, why, ...rest } = v; return JSON.stringify(rest); };

  const A = mkNode("A", 1001), B = mkNode("B", 2002);
  connect(A); connect(B);
  fake([A, B], "F1", 3003); fake([A, B], "F2", 4004);
  run(3);
  ok(viewOf(A).partial === true && viewOf(A).night === N - 1, "before the night begins both pages are in the night before, which they joined in the middle of, so partial");
  // step into night N slot by slot
  const stepTo = (slot, u) => { while (Math.floor(clock.ms / SLOT_MS) < slot) { clock.ms = (Math.floor(clock.ms / SLOT_MS) + 1) * SLOT_MS + 100; run(0.1); } clock.ms = slot * SLOT_MS + Math.round(u * 1000); run(0.1); };
  clock.ms = nightStart(N) + 100; run(9);
  ok(!viewOf(A).partial && !viewOf(B).partial && viewOf(A).night === N && viewOf(B).night === N, "when the night begins both pages, which were there, have a complete tally of it");
  // one shade is driven off in slot S1, by A and B standing in its light
  stepTo(S1, plan.t1 + 10);
  const sh = A.shades.list().find(x => x.k === 0);
  ok(!!sh && sh.phase === "linger", "slot " + (S1 - FIRST(N)) + " of the night holds a shade circling its landmark");
  A.me.x = sh.x + 2; A.me.y = sh.y; B.me.x = sh.x; B.me.y = sh.y + 2; A.me.lamp = 0; B.me.lamp = 0;
  run(30);
  ok(A.shades.shares.done(0) && B.shades.shares.done(0), "A and B drove it off together");
  ok(viewOf(A).shades === 1 && viewOf(B).shades === 1, "both pages wrote down one shade driven off");
  // two pages light beacon 0 together: A adds 8 driftwood, B adds 4
  const bl = beaconList[0];
  A.me.x = bl.x + 1; A.me.y = bl.y; B.me.x = bl.x; B.me.y = bl.y + 1;
  run(2);
  let added = 0; for (let i = 0; i < 8; i++) if (A.beacon.add("driftwood").ok) added++; for (let i = 0; i < 4; i++) if (B.beacon.add("driftwood").ok) added++;
  run(1);
  ok(added === 12 && A.beacon.shares.lit(0) && B.beacon.shares.lit(0), "A and B lit beacon 0 together (12 fuel, two players)");
  // a keeper's note: F1 and F2 (two other players) finish note 0, as both pages hear
  const notes = notesFor(world.seed, DAY, beaconList.length), need = notes[0].need;
  for (const n of [A, B]) { n.handlers.forEach(h => { h({ k: "qp", q: 0, d: DAY, n: need - 1 }, "F1"); h({ k: "qp", q: 0, d: DAY, n: 1 }, "F2"); }); }
  run(1);
  ok(A.quests.shares.done(0) && B.quests.shares.done(0), `note 0 (needs ${need}) is done on both pages`);
  const va = viewOf(A), vb = viewOf(B);
  ok(JSON.stringify(va) === JSON.stringify(vb), `A and B agree on every number: ${JSON.stringify(va)}`);
  ok(va.beaconsLit === 1 && va.shades === 1 && va.notesDone === 1 && va.lighthouse === false && !va.partial, "the tally is 1 of 4 beacons, no lighthouse, 1 shade, 1 note, complete");
  ok(JSON.stringify(tallyText(va)) === JSON.stringify(tallyText(vb)), "and they show the same words");
  // all four beacons: the lighthouse is lit in both views
  for (let b = 1; b < beaconList.length; b++) {
    A.me.x = beaconList[b].x + 1; A.me.y = beaconList[b].y; B.me.x = beaconList[b].x; B.me.y = beaconList[b].y + 1; run(1.5);
    for (let i = 0; i < 8; i++) A.beacon.add("driftwood"); for (let i = 0; i < 4; i++) B.beacon.add("driftwood"); run(1);
  }
  ok(viewOf(A).beaconsLit === 4 && viewOf(A).lighthouse === true && JSON.stringify(viewOf(A)) === JSON.stringify(viewOf(B)), "with all four beacons lit both pages show the lighthouse lit, and still agree");
  // later in the night, a third page joins
  for (let s = S1 + 1; s <= FIRST(N) + 5; s++) stepTo(s, 30);
  const C = mkNode("C", 5005);
  connect(C);
  run(6);
  ok(C.beacon.synced() && C.quests.synced(), "the late joiner has heard the others' counts");
  const vc = viewOf(C), va2 = viewOf(A);
  ok(vc.partial && vc.why === "late" && !va2.partial, "its tally is labelled partial; A's is not");
  ok(vc.beaconsLit === 4 && vc.lighthouse === true && vc.notesDone === 1 && vc.beaconsLit === va2.beaconsLit && vc.notesDone === va2.notesDone, "it hears the beacons and the note: those numbers agree with A's");
  ok(vc.shades === 0 && va2.shades === 1, "but not the shade driven off three slots before it came (0 against A's 1)");
  const tc = tallyText(vc);
  ok(/partial/.test(tc.title) && /^Shades driven off tonight: at least 0\.$/.test(tc.lines[2]) && /Partial tally/.test(tc.note), `and its words say so: "${tc.title}", "${tc.lines[2]}"`);
  // a shade driven off after C came: all three count it
  stepTo(FIRST(N) + 6, 1);
  let q = FIRST(N) + 6; while (!shadeCount(world.seed, q) && q < FIRST(N) + SLOTS_PER_NIGHT - 1) { q++; stepTo(q, 1); }
  if (shadeCount(world.seed, q)) {
    const p2 = shadePlan(world, q, 0); stepTo(q, p2.t1 + 10);
    const s2 = A.shades.list().find(x => x.k === 0);
    if (s2 && s2.phase === "linger") {
      A.me.x = s2.x + 2; A.me.y = s2.y; B.me.x = s2.x; B.me.y = s2.y + 2; C.me.x = 5; C.me.y = 5; run(30);
      ok(viewOf(A).shades === 2 && viewOf(B).shades === 2 && viewOf(C).shades === 1, "a second shade driven off after C came is counted by all three (A 2, B 2, C 1: C still partial for the first)");
    } else ok(false, "the second shade was found out and circling");
  } else ok(false, "found a later slot with a shade");
  void SHADE_NEED;
}

// ---- 2. pages ----
console.log("\n# four pages, shades pinned quiet, the hour pinned to dawn");
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
  // Pin the shades: a night boundary with a quiet slot (no shades) on each side and the next one, so nothing is driven off or comes near.
  // Then, in the next slot, exactly one shade (circling a landmark with open ground round it) that two pages drive off.
  const ring = (cx, cy, r) => { const out = []; for (let i = 0; i < 24; i++) { const an = i * Math.PI / 12, x = cx + Math.cos(an) * r, y = cy + Math.sin(an) * r; if (land(x, y)) out.push({ x, y }); } return out; };
  const usable = (s) => { if (shadeCount(world.seed, s) !== 1) return false; const p = shadePlan(world, s, 0); return ring(p.a.x, p.a.y, 1.3).length >= 6 && ring(p.a.x, p.a.y, 1.8).length >= 18; };
  let QN = nightOf(Date.UTC(2027, 0, 1)); const quietAt = (s) => shadeCount(world.seed, s) === 0;
  while (!(quietAt(FIRST(QN) - 1) && quietAt(FIRST(QN)) && usable(FIRST(QN) + 1))) QN++;
  const aim = (pages, ms) => Promise.all(pages.map(p => p.evaluate((o) => window.__longWatch.setShadeClock(o), ms - Date.now())));
  const urlFor = (hour, ms) => `${base}?net=local&hour=${hour}&weather=clear&day=20001&shadeclock=${ms - Date.now()}#room=5`;
  const t0 = nightStart(QN) - 60000;
  const [A, B, D] = [await mk(), await mk(), await mk()];
  await seedPack(A, urlFor(7, t0), { inv: { driftwood: 40, reeds: 0, berries: 0 } }); await seedPack(B, urlFor(7, t0), { inv: { driftwood: 40, reeds: 0, berries: 0 } }); await seedPack(D, urlFor(3, t0), {});
  for (const p of [A, B, D]) await p.click("#enter");
  ok((await Promise.all([A, B, D].map(p => waitFor(p, () => window.__longWatch.peers().length === 2, null, 12000)))).every(Boolean), "three pages see each other");
  ok((await Promise.all([A, B].map(p => waitFor(p, () => { const w = window.__longWatch; return w.beacon().synced && w.quests().synced; }, null, 10000)))).every(Boolean), "A and B have heard the room's counts");
  // both pages' clock: 1.5 s before the night begins, so they are there when it starts
  await aim([A, B, D], nightStart(QN) - 1500);
  ok(await waitFor(A, (n) => window.__longWatch.tally().view.night === n, QN, 8000) && await waitFor(B, (n) => window.__longWatch.tally().view.night === n, QN, 8000), `A and B are in night ${QN}, shades quiet (clock ${Math.round((nightStart(QN) - Date.now()) / 1000)} s from now)`);
  const tA0 = await lw(A, "tally");
  ok(tA0.panel && tA0.shown, "at hour 7 the dawn tally is shown on A");
  ok(!(await lw(D, "tally")).shown && !(await lw(D, "tally")).panel, "D, at hour 3, shows no tally");
  // light beacon 0 together
  const p0 = pair(beaconList[0]);
  ok(!!p0 && await teleportSynced(A, [B, D], p0[0].x, p0[0].y) && await teleportSynced(B, [A, D], p0[1].x, p0[1].y), "A and B stand at beacon 0");
  const add = (p, n) => p.evaluate((n) => { let k = 0; for (let i = 0; i < n; i++) if (window.__longWatch.addFuel("driftwood")?.ok) k++; return k; }, n);
  ok(await add(A, 8) === 8 && await add(B, 4) === 4, "A adds 8 driftwood and B 4");
  ok((await Promise.all([A, B].map(p => waitFor(p, () => window.__longWatch.tally().view.beaconsLit === 1, null, 8000)))).every(Boolean), "both pages show 1 beacon burning");
  const [ta, tb] = [await lw(A, "tally"), await lw(B, "tally")];
  ok(JSON.stringify(ta.view) === JSON.stringify(tb.view), `A and B agree on every number: ${JSON.stringify(ta.view)}`);
  ok(JSON.stringify(ta.lines) === JSON.stringify(tb.lines) && ta.title === tb.title && ta.note === tb.note && ta.lines.length === 4, `and show the same words: "${ta.lines.join(" ")}"`);
  ok(!ta.view.partial && ta.title === "The dawn tally" && ta.view.shades === 0 && ta.view.beaconsTotal === 4 && ta.view.notesTotal === 3 && ta.view.lighthouse === false, "complete, 0 shades (pinned quiet), 4 beacons on the island, 3 notes, the lighthouse dark");
  // a late joiner: its clock reads the same time, a little after the night began
  const C = await mk();
  const nowMs = await A.evaluate(() => window.__longWatch.shadeNow());
  await seedPack(C, urlFor(7, nowMs), {});
  await C.click("#enter");
  ok(await waitFor(C, () => window.__longWatch.peers().length === 3, null, 12000), "C joins and sees the other three");
  ok(await waitFor(C, () => { const w = window.__longWatch; return w.beacon().synced && w.quests().synced && w.tally().view.beaconsLit === 1; }, null, 12000), "C hears the room's counts, with the beacon lit");
  const tc = await lw(C, "tally");
  ok(tc.view.partial && tc.view.why === "late" && /partial/.test(tc.title) && /^Shades driven off tonight: at least 0\.$/.test(tc.lines[2]), `C's tally is labelled partial: "${tc.title}", "${tc.lines[2]}"`);
  ok(tc.view.beaconsLit === ta.view.beaconsLit && tc.view.notesDone === ta.view.notesDone && tc.view.lighthouse === ta.view.lighthouse && tc.view.night === ta.view.night, "its beacon, lighthouse and note numbers are the same as A's");
  ok(/Partial tally/.test(tc.note) && !/Partial/.test(ta.note), "its note says why; A's does not");
  ok((await lw(A, "tally")).view.partial === false, "A's own tally is still complete");
  // A page alone in another lantern has nobody to hear from: for its first second and a half it says it is still hearing the others' counts, then not.
  const E = await mk();
  await seedPack(E, urlFor(7, nowMs).replace("#room=5", "#room=6"), {});
  await E.click("#enter");
  ok(await waitFor(E, () => window.__longWatch.tally().view?.why === "sync", null, 1200), "a page that has only just come in says it is still hearing the others' counts (partial, sync)");
  ok(await waitFor(E, () => { const v = window.__longWatch.tally().view; return v && v.why !== "sync"; }, null, 6000) && (await lw(E, "tally")).view.why === "late", "and a moment later says only that it came in late");
  await E.close();
  // Now the slot with one shade: both clocks step into it (one slot on, so no page missed a slot) and A and B drive it off together.
  const SS = FIRST(QN) + 1, plan = shadePlan(world, SS, 0);
  const pa = ring(plan.a.x, plan.a.y, 1.3)[0], pb = ring(plan.a.x, plan.a.y, 1.3).filter(p => Math.hypot(p.x - pa.x, p.y - pa.y) > 0.9 && Math.hypot(p.x - pa.x, p.y - pa.y) < 2).sort((p, q) => Math.hypot(p.x - pa.x, p.y - pa.y) - Math.hypot(q.x - pa.x, q.y - pa.y))[0];
  ok(!!pb, "there is open ground beside the shade's landmark");
  const stillInSlot = await lw(A, "shadeNow");
  ok(stillInSlot < SS * SLOT_MS, `the pages are still in the quiet slot before it (${Math.round((SS * SLOT_MS - stillInSlot) / 1000)} s left)`);
  await aim([A, B, C, D], SS * SLOT_MS + Math.round((plan.t1 - 14) * 1000));
  ok((await Promise.all([A, B, C, D].map(p => waitFor(p, (s) => window.__longWatch.shades().slot === s, SS, 5000)))).every(Boolean), "all four pages are in the slot with one shade");
  ok(await teleportSynced(A, [B, C, D], pa.x, pa.y) && await teleportSynced(B, [A, C, D], pb.x, pb.y), "A and B stand by the landmark");
  ok(await waitFor(A, () => window.__longWatch.shades().list.some(s => s.phase === "linger"), null, 25000), "the shade arrives and circles");
  ok((await Promise.all([A, B, C, D].map(p => waitFor(p, () => { const x = window.__longWatch.shades().list.find(q => q.k === 0); return x && x.gone; }, null, 50000)))).every(Boolean), "all four pages see it driven off");
  ok((await Promise.all([A, B, C, D].map(p => waitFor(p, () => window.__longWatch.tally().view.shades === 1, null, 5000)))).every(Boolean), "and all four write down 1 shade driven off tonight");
  const [ta2, tb2, tc2, td2] = [await lw(A, "tally"), await lw(B, "tally"), await lw(C, "tally"), await lw(D, "tally")];
  ok(JSON.stringify(ta2.view) === JSON.stringify(tb2.view) && ta2.lines.join() === tb2.lines.join() && /Shades driven off tonight: 1\./.test(ta2.lines[2]) && ta2.view.beaconsLit === 1 && !ta2.view.partial, `A and B still agree, now with the shade: "${ta2.lines.join(" ")}"`);
  ok(tc2.view.shades === 1 && tc2.view.partial && /^Shades driven off tonight: at least 1\.$/.test(tc2.lines[2]) && td2.view.shades === 1 && !td2.shown, "C was there for it: it counts 1 and stays partial (\"at least 1\"); D, at hour 3, counts it and shows nothing");
  await shootIf(A);
  ok(errors.length === 0, `no console errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
  await ctx.close();
}
async function shootIf(page) {
  if (!process.env.SHOTS) return;
  const { mkdir } = await import("node:fs/promises");
  await mkdir(process.env.SHOTS, { recursive: true });
  const keep = page.viewportSize();
  for (const [w, h] of [[375, 760], [1100, 800]]) { await page.setViewportSize({ width: w, height: h }); await sleep(400); await page.locator("#tally").screenshot({ path: path.join(process.env.SHOTS, `tally-${w}.png`) }); }
  await page.setViewportSize(keep);
}
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
