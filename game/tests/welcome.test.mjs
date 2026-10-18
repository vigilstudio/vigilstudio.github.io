#!/usr/bin/env node
// Milestone 34 tests for The Long Watch: welcoming a newcomer, together.
//
//   node game/tests/welcome.test.mjs
//
// Part 0 (node, real rank and welcome modules, a fake clock): the marker goes only to a player with no help points and
// points at the nearest player who has a rank (rank 0, odd and forged values are not ranked); a ranked player beside a
// player with no rank earns the point only after WELCOME_S seconds in a row, not before, not from farther than WELCOME_R,
// not when the wait is broken, once per newcomer, with the 30 s gap between newcomers, not from a ranked player, not
// when a stalled tick tries to jump the wait, a peer leaving midway, and a full list of timed newcomers refuses new ones.
// Part 1 (three pages, local transport): a newcomer is shown a ring toward the ranked player; stood far away no point;
// a forged rank claim makes the newcomer look ranked and earns nothing; standing together earns the ranked player one
// point (the newcomer none); staying longer or a second newcomer within the gap earns no more; the point survives a reload.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld, T, isBlocked } from "../js/world.js";
import { shadeCount, SLOT_MS } from "../js/shades.js";
import { BEACON_RANGE } from "../js/beacon.js";
import { createRank, GAPS_MS } from "../js/rank.js";
import { createWelcome, nearestRanked, WELCOME_R, WELCOME_S, STEP_MAX_S, MAX_TRACK } from "../js/welcome.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const STORE = "vigil.longwatch.v1";
const world = generateWorld();
const beaconList = world.landmarks.filter(l => l.kind === "beacon");

// ---- 0. node ----
console.log("# the welcome rules, with a fake clock");
{
  const clock = { t: 100000 };
  const mk = (points) => {
    const me = { x: 10, y: 10 }, peers = new Map();
    const rank = createRank(points, { now: () => clock.t });
    const events = [];
    const w = createWelcome(me, peers, rank, { now: () => clock.t, onEvent: (e) => events.push(e) });
    const add = (id, seed, rk, x, y) => peers.set(id, { id, seed, rank: rk, tx: x, ty: y, x, y });
    const run = (sec) => { let last = null; for (let i = 0; i < sec * 10; i++) { clock.t += 100; last = w.tick(); } return last; };
    return { me, peers, rank, w, add, run, events };
  };
  ok(WELCOME_R === 3 && WELCOME_S === 4 && GAPS_MS.welcome === 30000 && STEP_MAX_S === 0.25, "three tiles, four seconds, a 30 s gap");
  // marker
  {
    const me = { x: 0, y: 0 };
    const list = [{ id: "far", rank: 2, tx: 20, ty: 0 }, { id: "near", rank: 1, tx: 5, ty: 0 }, { id: "new", rank: 0, tx: 1, ty: 0 }, { id: "bad", rank: 9, tx: 0.5, ty: 0 }, { id: "frac", rank: 1.5, tx: 0.5, ty: 0 }, { id: "txt", rank: "3", tx: 0.5, ty: 0 }, { id: "nan", rank: 1, tx: NaN, ty: NaN }];
    const n = nearestRanked(me, list);
    ok(n && n.id === "near" && Math.abs(n.dist - 5) < 1e-9 && !n.near, "the marker is the nearest player with a whole-number rank of 1 or more; rank 0, text and fractions do not count");
    ok(nearestRanked(me, [{ id: "a", rank: 1, tx: 2, ty: 1 }]).near === true && nearestRanked(me, [{ id: "a", rank: 1, tx: 3.01, ty: 0 }]).near === false, "near means within WELCOME_R tiles");
    ok(nearestRanked(me, []) === null && nearestRanked(me, [{ id: "z", rank: 0, tx: 1, ty: 1 }]) === null, "no marker when no one has a rank");
  }
  {
    const t = mk(0); t.add("r", 5, 1, 12, 10);
    ok(t.run(1).mark && t.run(1).mark.id === "r", "a player with no help points is shown the marker");
    const u = mk(1); u.add("r", 5, 1, 12, 10);
    ok(u.run(1).mark === null, "a player with a help point is not");
  }
  // the welcome itself
  {
    const t = mk(3); t.add("n", 77, 0, 12, 10);
    t.run(WELCOME_S - 0.5);
    ok(t.rank.points === 3, "not before the wait is over");
    t.run(1);
    ok(t.rank.points === 4 && t.events.length === 1, "after the wait the ranked player earns one point and is told once");
    t.run(10);
    ok(t.rank.points === 4, "staying longer earns no more from the same newcomer");
    { const v = t.run(1); ok(v.helping === false && t.w.timed() === 0, "after the welcome the credited newcomer is not helped or timed again, so the note state is empty"); }
    t.add("n2", 88, 0, 11, 10); t.run(WELCOME_S + 2);
    ok(t.rank.points === 4, "a second newcomer within the gap earns nothing");
    t.run(GAPS_MS.welcome / 1000);
    ok(t.rank.points === 5, "after the gap the second newcomer counts");
    t.run(60); ok(t.rank.points === 5, "and neither counts twice");
  }
  {
    const t = mk(3); t.add("n", 77, 0, 14, 10);
    t.run(WELCOME_S + 3); ok(t.rank.points === 3, "from farther than WELCOME_R nothing");
    t.peers.get("n").tx = 12.9; t.run(WELCOME_S + 1); ok(t.rank.points === 4, "just inside WELCOME_R counts");
  }
  {
    const t = mk(3); t.add("n", 77, 0, 12, 10);
    t.run(3); t.peers.get("n").tx = 30; t.run(1); t.peers.get("n").tx = 12; t.run(3);
    ok(t.rank.points === 3 && t.w.timed() === 1, "stepping away breaks the wait; it starts again");
    t.run(2); ok(t.rank.points === 4, "and finishes four seconds after coming back");
  }
  {
    const t = mk(3); t.add("n", 77, 0, 12, 10);
    t.run(2); t.peers.delete("n"); t.run(1); t.add("n", 77, 0, 12, 10);
    t.run(2); ok(t.w.timed() === 1 && t.rank.points === 3, "a newcomer who leaves midway starts the wait again on return");
  }
  {
    const t = mk(0); t.add("n", 77, 0, 12, 10);
    t.run(20); ok(t.rank.points === 0, "a player with no rank earns nothing from standing beside another");
    const b = mk(3); b.add("o", 78, 1, 12, 10); b.run(20); ok(b.rank.points === 3, "nor does a ranked player from a ranked one");
    const c = mk(3); c.add("f", 79, 1, 12, 10); c.run(20); c.peers.get("f").rank = 0; c.run(2); ok(c.rank.points === 3, "a forged rank claim breaks the wait (the wait counts only while the other shows no rank)");
  }
  {
    const t = mk(3); t.add("n", 77, 0, 12, 10);
    clock.t += 60000; t.w.tick(); clock.t += 60000; t.w.tick();
    ok(t.rank.points === 3, `a stalled page jumping a minute adds at most ${STEP_MAX_S} s a tick`);
  }
  {
    const t = mk(3);
    for (let i = 0; i < MAX_TRACK + 10; i++) t.add("p" + i, 1000 + i, 0, 12, 10);
    t.run(2);
    ok(t.w.timed() === MAX_TRACK, `at most ${MAX_TRACK} newcomers are timed at once`);
    const bad = mk(3); bad.add("q", 1.5, 0, 12, 10); bad.add("r", "9", 0, 12, 10); bad.add("s", undefined, 0, 12, 10); bad.run(10);
    ok(bad.rank.points === 3 && bad.w.timed() === 0, "a player without a whole-number seed earns nothing");
  }
}

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
  // Pin the shades: the pages run on a shade clock inside three quiet slots in a row (no shades at all, 8 minutes), clear weather.
  let QUIET = 5000; while (shadeCount(world.seed, QUIET) || shadeCount(world.seed, QUIET + 1) || shadeCount(world.seed, QUIET + 2)) QUIET++;
  const url = `${base}?net=local&hour=3&weather=clear&shadeclock=${QUIET * SLOT_MS + 2000 - Date.now()}#room=4`;
  const [A, B, C] = [await mk(), await mk(), await mk()];
  await seedPack(A, url, { help: 3 }); await seedPack(B, url, { help: 0 }); await seedPack(C, url, { help: 0 });
  for (const p of [A, B, C]) await p.click("#enter");
  ok((await Promise.all([A, B, C].map(p => waitFor(p, () => window.__longWatch.peers().length === 2, null, 12000)))).every(Boolean), "each page sees the other two");
  const [idA, idB, idC] = await Promise.all([A, B, C].map(p => lw(p, "self").then(s => s.id)));
  ok(await waitFor(B, () => window.__longWatch.rank().peerRanks.some(p => p.rank === 1), null, 8000) && await waitFor(C, () => window.__longWatch.rank().peerRanks.some(p => p.rank === 1), null, 8000), "B and C are told A's rank");
  const p0 = pair(beaconList[0]), p1 = pair(beaconList[1]);
  ok(!!p0 && !!p1, "there is open ground beside two beacons");
  const W = (p) => lw(p, "welcome"), R = (p) => lw(p, "rank");
  // A at beacon 0; B and C far away at beacon 1 (more than 3 tiles).
  ok(await teleportSynced(A, [B, C], p0[0].x, p0[0].y) && await teleportSynced(B, [A, C], p1[0].x, p1[0].y) && await teleportSynced(C, [A, B], p1[1].x, p1[1].y), "A stands at beacon 0, B and C at beacon 1");
  ok(await waitFor(B, (id) => { const w = window.__longWatch.welcome(); return w.mark && w.mark.id === id && w.ring; }, idA, 5000), "B (no help points) is shown a ring toward A");
  const wb = await W(B);
  ok(wb.mark.dist > wb.radius && /gold ring/.test(wb.note), `the note tells B where to go (${wb.mark.dist.toFixed(1)} tiles away)`);
  const wa = await W(A);
  ok(wa.mark === null && !wa.helping && wa.note === "", "A, with help points, is shown no marker");
  await sleep((WELCOME_S + 1.5) * 1000);
  ok((await R(A)).points === 3, "far apart for longer than the wait: no point");
  // A forged rank claim: C says it is rank 1 to A while standing beside A.
  const E = await ctx.newPage();
  await E.goto(`${base}?net=local`);
  const post = (from, to, msgs) => E.evaluate(([room, from, to, msgs]) => { const ch = new BroadcastChannel(`vigil-long-watch:lantern-${room}`); for (const d of msgs) ch.postMessage({ k: "data", d, from, to }); ch.close(); }, [4, from, to, msgs]);
  ok(await teleportSynced(C, [A, B], p0[1].x, p0[1].y), "C walks up to A");
  await A.bringToFront(); // a page in the background draws about once a second, and the wait is counted per drawn frame
  let seenForged = 0;
  for (let i = 0; i < 16; i++) {
    await post(idC, idA, [{ k: "rk", r: 1 }]); await sleep(150);
    if (await A.evaluate((id) => window.__longWatch.rank().peerRanks.some(p => p.id === id && p.rank === 1), idC)) seenForged++;
    await sleep(450);
  }
  ok(seenForged >= 11, `A was told C's rank is 1 for ten seconds, as a modified client could (seen in ${seenForged} of 16 readings)`);
  ok((await R(A)).points === 3, "and A earned nothing: the claim made C look ranked, so there was no newcomer to welcome");
  ok(await teleportSynced(C, [A, B], p1[1].x, p1[1].y), "C walks away again");
  await E.close();
  // The real welcome: B comes to A.
  await A.bringToFront();
  ok(await teleportSynced(B, [A, C], p0[1].x, p0[1].y), "B comes to A");
  ok(await waitFor(A, () => window.__longWatch.welcome().helping, null, 4000), "A is told a player with no rank is beside them");
  ok(await waitFor(A, () => window.__longWatch.rank().points === 4, null, 15000), "after the wait A has 4 help points");
  const ra = await R(A);
  ok(/welcoming a newcomer/.test(ra.info), `A is told why: "${ra.info}"`);
  const rb = await R(B);
  ok(rb.points === 0, "B, the newcomer, earned nothing by being welcomed");
  ok((await W(B)).mark && (await W(B)).mark.near, "B's ring says A is near");
  await sleep(6000);
  ok((await R(A)).points === 4, "staying longer earns no more");
  // A second newcomer within the gap.
  ok(await teleportSynced(C, [A, B], p0[0].x + 0.3, p0[0].y) || await teleportSynced(C, [A, B], p0[1].x, p0[1].y), "C now comes to A");
  await sleep((WELCOME_S + 2) * 1000);
  ok((await R(A)).points === 4, `a second newcomer within ${GAPS_MS.welcome / 1000} s earns nothing`);
  // The saved point survives a reload.
  await A.reload(); await A.click("#enter");
  ok(await waitFor(A, () => window.__longWatch.peers().length === 2, null, 12000), "A reloads and rejoins");
  ok((await R(A)).points === 4 && (await R(A)).saved === 4, "A's four points were saved");
  ok((await R(B)).points === 0 && (await R(C)).points === 0, "B and C still have none");
  ok(errors.length === 0, `no console errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
