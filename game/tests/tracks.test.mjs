#!/usr/bin/env node
// Milestone 29 tests for The Long Watch: footprints and wakes (a look step). A walker leaves a footprint every 0.6 tile on
// sand and meadow and a ring on shallow water; they fade in 6 s and 2.2 s. Each browser works them out alone from the
// positions it already holds, so nothing is sent: the multiplayer checks are that a page shows the marks of another
// player's walk (and of its own), that two walkers' marks do not mix, that a player who leaves stops adding marks, and
// that reduced motion, the governor and the plain look draw the right amount.
//
//   node game/tests/tracks.test.mjs            node checks, then pages on the local transport
//   SHOTS=/some/dir node ...                    also save screenshots (marks off and on; 375 and 1100 px)
//   CHROME=/path/to/headless_shell              use this browser binary
// The frame cost is measured in headless Chromium (software drawing, no phone) and printed; it is a rough guide only.
// Online play over the public relays is not tested here (nothing about footprints is sent).
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld, T, isBlocked, tileAt } from "../js/world.js";
import { SLOT_MS, shadeCount } from "../js/shades.js";
import { STRIDE, FOOT_LIFE_MS, WAKE_LIFE_MS, WAKE_STRIDE, FOOT_CAP, WAKE_CAP, MARKS_CAP, MARKS_DRAWN, JUMP, FOOT_ALPHA, WAKE_ALPHA, groundOf, footAlpha, wakeRing, createTracks } from "../js/tracks.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const shots = process.env.SHOTS;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log("# footprints and wakes, in node");
const world = generateWorld();
{
  const kind = (x, y) => ({ [T.SAND]: "sand", [T.MEADOW]: "meadow", [T.SHALLOW]: "wake" })[tileAt(world, x, y)] || null;
  const flat = (k) => () => k;
  ok(MARKS_DRAWN.length === 3 && MARKS_DRAWN[0] === 0 && MARKS_DRAWN[1] === 120 && MARKS_DRAWN[2] === 300 && MARKS_DRAWN[2] <= MARKS_CAP, "the governor allows 0, 120 and 300 marks at levels 0, 1 and 2, never more than the 480 kept");
  ok(groundOf(flat("sand"), 0, 0) === "sand" && groundOf(flat("meadow"), 0, 0) === "meadow" && groundOf(flat("wake"), 0, 0) === "wake" && groundOf(flat("grass"), 0, 0) === null && groundOf(flat(null), 0, 0) === null && groundOf(flat("__proto__"), 0, 0) === null, "sand, meadow and shallow water take a mark; grass, deep water and anything else do not");
  ok(footAlpha(0, "sand") === FOOT_ALPHA.sand && footAlpha(FOOT_LIFE_MS / 2, "sand") < FOOT_ALPHA.sand * 0.51 && footAlpha(FOOT_LIFE_MS / 2, "sand") > FOOT_ALPHA.sand * 0.49 && footAlpha(FOOT_LIFE_MS, "sand") === 0 && footAlpha(-5, "sand") === 0 && footAlpha(NaN, "sand") === 0 && footAlpha(100, "grass") === 0, "a footprint fades in a straight line to nothing at 6 s; a bad age or ground gives 0");
  ok(footAlpha(0, "sand") > footAlpha(0, "meadow"), "a footprint on sand is stronger than on meadow");
  const w0 = wakeRing(0, false), w1 = wakeRing(WAKE_LIFE_MS / 2, false), w2 = wakeRing(WAKE_LIFE_MS - 1, false);
  ok(w0.a === WAKE_ALPHA && w0.r < w1.r && w1.r < w2.r && w2.r <= 0.5 + 1e-9 && w0.a > w1.a && w1.a > w2.a && wakeRing(WAKE_LIFE_MS, false).a === 0 && wakeRing(NaN, false).a === 0, `a wake ring spreads from ${w0.r.toFixed(2)} to ${w2.r.toFixed(2)} tile while it fades`);
  const s0 = wakeRing(0, true), s1 = wakeRing(WAKE_LIFE_MS * 0.8, true);
  ok(s0.r === s1.r && s0.r > 0 && s0.a > s1.a, "a still wake (reduced motion) keeps its size and only fades");

  const walk = (tr, id, x0, y0, dx, dy, steps, t0, dt, kindAt, moving = true) => { let t = t0; for (let i = 0; i <= steps; i++) { tr.update(t, [{ id, x: x0 + dx * i, y: y0 + dy * i, moving }], kindAt); t += dt; } return t; };
  {
    const tr = createTracks();
    walk(tr, "a", 10, 10, 0.07, 0, 143, 0, 17, flat("sand")); // 10 tiles at 4.1 tiles a second
    const m = tr.list();
    const gaps = m.slice(1).map((q, i) => Math.hypot(q.x - m[i].x, q.y - m[i].y));
    ok(m.length >= 15 && m.length <= 17 && m.every(q => q.ground === "sand" && q.o === "a"), `10 tiles walked on sand make ${m.length} footprints (a stride is ${STRIDE} tile)`);
    ok(gaps.every(g => g > 0.45 && g < 0.85) && m.every((q, i) => i === 0 || q.side !== m[i - 1].side), "footprints are about a stride apart and alternate left and right");
    ok(m.every(q => Math.abs(q.ang) < 1e-9 && Math.abs(q.y - 10) > 0.05 && Math.abs(q.y - 10) < 0.2), "walking east, each print points east and lies a little to one side of the line walked");
    tr.update(100000, [{ id: "a", x: 20, y: 10, moving: false }], flat("sand"));
    ok(tr.size() === 0, "after 6 s every footprint has faded away and been dropped");
  }
  {
    const tr = createTracks();
    walk(tr, "a", 10, 10, 0, 0, 120, 0, 17, flat("sand"), false);
    ok(tr.size() === 0, "standing still leaves nothing");
    walk(tr, "a", 10, 10, 0.07, 0, 40, 0, 17, flat("grass")); walk(tr, "a", 10, 10, 0.07, 0, 40, 0, 17, flat(null));
    ok(tr.size() === 0, "walking on grass or in deep water leaves nothing");
    walk(tr, "a", 10, 10, 0.07, 0, 40, 0, 17, flat("sand"), false);
    ok(tr.size() === 0, "moving positions with the moving flag off leave nothing");
  }
  {
    const tr = createTracks();
    tr.update(0, [{ id: "a", x: 10, y: 10, moving: true }], flat("sand"));
    tr.update(17, [{ id: "a", x: 10 + JUMP + 0.5, y: 10, moving: true }], flat("sand"));
    ok(tr.size() === 0, `a jump of more than ${JUMP} tiles (a teleport, a tab that was asleep) lays no trail across it`);
    tr.update(34, [{ id: "a", x: 10 + JUMP + 0.5 + 0.7, y: 10, moving: true }], flat("sand"));
    ok(tr.size() === 1, "and walking on after the jump makes marks again from the new place");
  }
  {
    const tr = createTracks();
    const t = walk(tr, "a", 10, 10, 0.07, 0, 143, 0, 17, flat("wake"));
    const m = tr.list();
    ok(m.length >= 4 && m.length <= WAKE_CAP && m.every(q => q.ground === "wake"), `walking through shallow water leaves wakes, at most ${WAKE_CAP} at a time (${m.length}), and they fade in ${WAKE_LIFE_MS} ms`);
    tr.update(t + WAKE_LIFE_MS + 5, [{ id: "a", x: 30, y: 10, moving: false }], flat("wake"));
    ok(tr.size() === 0, "a wake is gone after 2.2 s");
  }
  {
    const tr = createTracks();
    walk(tr, "a", 1, 1, 0.07, 0, 3000, 0, 1, flat("sand"));      // a very long walk in a short time: every cap is reached at once
    ok(tr.list().filter(q => q.o === "a").length <= FOOT_CAP, `one walker keeps at most ${FOOT_CAP} footprints however far they walk`);
    const tr2 = createTracks();
    let t = 0; const ids = Array.from({ length: 30 }, (_, i) => "p" + i);
    for (let i = 0; i < 400; i++, t += 17) tr2.update(t, ids.map((id, j) => ({ id, x: 5 + i * 0.08 + j * 0.001, y: 5 + j, moving: true })), flat("sand"));
    ok(tr2.size() <= MARKS_CAP && tr2.size() >= MARKS_CAP - 1, `30 walkers cannot hold more than ${MARKS_CAP} marks in all (${tr2.size()})`);
    ok(tr2.list(120).length === 120 && tr2.list(0).length === 0 && tr2.list(120)[119] === tr2.list()[tr2.size() - 1], "list(max) gives the newest marks");
    const own = ids.map(id => tr2.list().filter(q => q.o === id).length);
    ok(Math.max(...own) <= FOOT_CAP, `and none of them more than ${FOOT_CAP} (most: ${Math.max(...own)})`);
  }
  {
    const tr = createTracks();
    tr.update(0, [{ id: "a", x: 10, y: 10, moving: true }, { id: "b", x: 10, y: 20, moving: true }], flat("sand"));
    for (let i = 1; i <= 30; i++) tr.update(i * 17, [{ id: "a", x: 10 + i * 0.07, y: 10, moving: true }, { id: "b", x: 10 + i * 0.07, y: 20, moving: true }], flat("sand"));
    const a = tr.list().filter(q => q.o === "a"), b = tr.list().filter(q => q.o === "b");
    ok(a.length > 0 && b.length > 0 && a.every(q => Math.abs(q.y - 10) < 0.3) && b.every(q => Math.abs(q.y - 20) < 0.3), "two walkers' marks stay on their own paths");
    for (let i = 31; i <= 60; i++) tr.update(i * 17, [{ id: "a", x: 10 + i * 0.07, y: 10, moving: true }], flat("sand")); // b has left
    const b2 = tr.list().filter(q => q.o === "b").length;
    for (let i = 61; i <= 120; i++) tr.update(i * 17, [{ id: "a", x: 10 + i * 0.07, y: 10, moving: true }], flat("sand"));
    ok(b2 === b.length && tr.list().filter(q => q.o === "b").length === b2, "a player who has left adds no more marks (the old ones only fade)");
    tr.update(1e6, [], flat("sand")); ok(tr.size() === 0, "with nobody left and time gone by there is nothing at all");
  }
  {
    const tr = createTracks();
    tr.update(0, [{ id: "a", x: NaN, y: 3, moving: true }, { id: "b", x: Infinity, y: 3, moving: true }, { id: "c", x: 3, y: 3, moving: true }], flat("sand"));
    tr.update(17, [{ id: "a", x: 4, y: NaN, moving: true }, { id: "c", x: 3.7, y: 3, moving: true }], flat("sand"));
    ok(tr.list().every(q => [q.x, q.y, q.ang].every(Number.isFinite)), "a position that is not a number makes no mark and breaks nothing");
    let bad = 0; const r = createTracks();
    for (let i = 0; i < 5000; i++) { r.update(i * 17, [{ id: "w" + (i % 7), x: 20 + Math.sin(i * 0.3) * 8 + (i % 53 === 0 ? 30 : 0), y: 20 + Math.cos(i * 0.21) * 8, moving: i % 11 !== 0 }], (x, y) => kind(x, y)); if (r.size() > MARKS_CAP || !r.list().every(q => [q.x, q.y, q.ang].every(Number.isFinite))) bad++; }
    ok(bad === 0, "over 5000 odd steps (jumps, stops, a real island's sand, meadow and water) the marks stay finite and under the cap");
  }
}

// ---- browser harness ----
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
  page.on("console", m => { if (m.type() === "error" && !/WebSocket connection to 'wss:/.test(m.text()) && !/User-Initiated Abort, reason=Close called/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
}
async function waitFor(page, fn, arg, timeout = 10000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 50 }); return true; } catch { return false; }
}
const perf = (p) => p.evaluate(() => window.__longWatch.perf());
async function shoot(page, name) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  const keep = page.viewportSize();
  for (const [w, h] of [[375, 760], [1100, 800]]) { await page.setViewportSize({ width: w, height: h }); await sleep(500); await page.locator(".stage").screenshot({ path: path.join(shots, `${name}-${w}.png`) }); }
  await page.setViewportSize(keep); await sleep(200);
}
const mk = async (ctxOpts = {}, ctx = null) => { const c = ctx || await browser.newContext({ viewport: { width: 700, height: 700 }, ...ctxOpts }); const p = await c.newPage(); watch(p, "page"); return p; };
async function enter(page, query, room) { await page.goto(`${base}${query}#room=${room}`); await page.click("#enter"); await waitFor(page, () => window.__longWatch.self().playing, null, 5000); await sleep(500); }
async function seedPack(page, url, patch) {
  await page.goto(url);
  await page.evaluate(([K, patch]) => { const st = location.search.includes("net=local") ? sessionStorage : localStorage; const s = JSON.parse(st.getItem(K)); Object.assign(s, patch); st.setItem(K, JSON.stringify(s)); }, [STORE, patch]);
  await page.reload();
}
async function teleportSynced(page, others, x, y) {
  if (!await page.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [x, y])) return false;
  for (const o of others) if (!await waitFor(o, ([x, y]) => window.__longWatch.peers().some(p => Math.hypot(p.x - x, p.y - y) < 0.05), [x, y], 6000)) return false;
  return true;
}
// a clock inside a slot with no shades (shades would snuff lanterns and change nothing here, but keep the scene quiet)
let quiet = 5; while (shadeCount(world.seed, quiet) !== 0 || shadeCount(world.seed, quiet + 1) !== 0) quiet++;
const calm = `&shadeclock=${quiet * SLOT_MS + 5000 - Date.now()}`;
const groundName = (x, y) => ({ [T.SAND]: "sand", [T.MEADOW]: "meadow", [T.SHALLOW]: "wake", [T.GRASS]: "grass" })[tileAt(world, x, y)] || "other";
// a horizontal run of `n` tiles all of one of the given grounds, with a free tile after it too
function findStrip(grounds, n) {
  for (let y = 3; y < world.h - 3; y++) for (let x = 3; x < world.w - n - 4; x++) {
    let good = true;
    for (let i = -1; i <= n + 1 && good; i++) if (!grounds.includes(groundName(x + i + 0.5, y + 0.5)) || isBlocked(world, x + i + 0.5, y + 0.5)) good = false;
    if (good) return { x: x + 0.5, y: y + 0.5, n };
  }
  return null;
}
const sandStrip = findStrip(["sand", "meadow"], 7), waterStrip = findStrip(["wake"], 7);
const roomOf = (id) => `#room=${id}`;
const marksOf = async (page, who) => (await perf(page)).tracks.list.filter(m => m.o === who);
const myId = (page) => page.evaluate(() => window.__longWatch.self().id);
const diag = async (what, pages) => { const out = {}; for (const [k, pg] of Object.entries(pages)) out[k] = await pg.evaluate(() => { const p = window.__longWatch.perf(); return { frames: p.frames, marks: p.tracks.marks, drawn: p.tracks.drawn, wakes: p.tracks.wakes, peers: window.__longWatch.peers().map(q => [Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100]), me: [Math.round(window.__longWatch.self().x * 100) / 100, Math.round(window.__longWatch.self().y * 100) / 100], vis: document.visibilityState, raf: performance.now() | 0 }; }); console.log(`     diagnostics (${what}):`, JSON.stringify(out)); };
// Keys are sent to the page with dispatchEvent, not with Playwright's keyboard: the keyboard gives the page focus, and Chromium then
// stops the drawing of the other page for a second (seen: the watcher's frame counter frozen for a whole walk, so it drew no
// footprints for it; with real key presses 4 runs in 10 hit it). The game reads the same keydown and keyup events either way.
const keyDown = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, bubbles: true })), code);
const keyUp = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, bubbles: true })), code);
// Walk `walker` with `key` for `ms` while sampling the other page every 40 ms: the most footprints and wakes it showed of `who`
// at one time, and for how long its frame counter stood still (a page that is not drawing cannot make marks). Headless Chromium
// sometimes stops drawing the page that is not being driven for about a second (the trace printed on a failure shows the frame
// counter standing still while the walk goes on, and the page's script still answering): when that happens the walk is done again
// from the start (`reset`), up to 3 times, and the number of attempts is part of what is printed.
async function watchedWalk(walker, observer, who, key, ms, reset) {
  let r;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const trace = []; let on = true;
    const sampler = (async () => { while (on) { trace.push(await observer.evaluate((w) => { const p = window.__longWatch.perf(); return [performance.now() | 0, p.frames, p.tracks.list.filter(m => m.o === w && m.ground !== "wake").length, p.tracks.list.filter(m => m.o === w && m.ground === "wake").length]; }, who)); await sleep(40); } })();
    await hold(walker, key, ms); await sleep(300); on = false; await sampler;
    let stall = 0; for (let i = 1; i < trace.length; i++) if (trace[i][1] === trace[i - 1][1]) stall += trace[i][0] - trace[i - 1][0];
    r = { feet: Math.max(...trace.map(x => x[2])), wakes: Math.max(...trace.map(x => x[3])), stall, attempt, trace };
    if (stall < 300 || !reset) break;
    console.log(`     the watching page's drawing stood still for ${stall} ms during a walk (attempt ${attempt}); walking it again`);
    await waitFor(observer, (w) => !window.__longWatch.perf().tracks.list.some(m => m.o === w), who, 9000);
    await reset();
  }
  return r;
}
const hold = async (page, key, ms) => { await keyDown(page, key); await sleep(ms); await keyUp(page, key); };

try {
  ok(!!sandStrip && !!waterStrip, `the island has a 7-tile run of sand or meadow and a 7-tile run of shallow water (${sandStrip && sandStrip.x},${sandStrip && sandStrip.y} and ${waterStrip && waterStrip.x},${waterStrip && waterStrip.y})`);
  console.log("\n# a walk across sand is seen by the other player");
  const A = await mk(), B = await mk({}, A.context());
  const q = `?net=local&hour=3&weather=clear${calm}`;
  await enter(A, q, "tk1"); await enter(B, q, "tk1");
  ok(await waitFor(A, () => window.__longWatch.peers().length === 1, null, 8000) && await waitFor(B, () => window.__longWatch.peers().length === 1, null, 8000), "two players share a room");
  const idA = await myId(A), idB = await myId(B);
  ok(await teleportSynced(B, [A], sandStrip.x - 0.5, sandStrip.y) && await teleportSynced(A, [B], sandStrip.x - 0.5, sandStrip.y), "A and B stand side by side at the start of the sand");
  await sleep(300);
  ok((await marksOf(A, idB)).length === 0 && (await marksOf(B, "me")).length === 0, "before anyone walks there are no marks");
  const wB = await watchedWalk(B, A, idB, "ArrowRight", 1100, () => teleportSynced(B, [A], sandStrip.x - 0.5, sandStrip.y));
  if (wB.feet < 4) console.log("     trace of A's page [ms, frames, B's footprints, B's wakes]:", JSON.stringify(wB.trace));
  const seenOnA = await marksOf(A, idB), ownOnB = await marksOf(B, "me");
  if (seenOnA.length < 4 || ownOnB.length < 4) await diag("walk on sand", { A, B });
  ok(wB.feet >= 4 && seenOnA.every(m => m.ground === "sand" || m.ground === "meadow"), `A's page showed up to ${wB.feet} footprints at once from B's walk and ${seenOnA.length} are left (B walked about 4.6 tiles; A's drawing stood still for ${wB.stall} ms of it, attempt ${wB.attempt})`);
  ok(ownOnB.length >= 4 && Math.abs(ownOnB.length - seenOnA.length) <= 3, `and B's own page has ${ownOnB.length} (the two pages agree to within a few, positions arrive ten times a second and are eased)`);
  ok(seenOnA.every(m => Math.abs(m.y - sandStrip.y) < 0.4 && m.x >= sandStrip.x - 0.8 && m.x <= sandStrip.x + 5.5) && seenOnA.every(m => ["sand", "meadow"].includes(groundName(m.x, m.y))), "the footprints lie along the line B walked, on sand or meadow tiles");
  ok((await marksOf(A, "me")).length === 0 && (await marksOf(B, idA)).length === 0, "A, who stood still the whole time, left no marks on either page");
  const sorted = seenOnA.slice().sort((a, b) => a.x - b.x);
  ok(sorted.slice(1).every((m, i) => m.x - sorted[i].x < 1.3), "no gap in the trail larger than a stride or two (the trail is joined up)");
  // A walks back on the same strip: both trails show on B's page, apart
  const wA = await watchedWalk(A, B, idA, "ArrowRight", 900, () => teleportSynced(A, [B], sandStrip.x - 0.5, sandStrip.y));
  ok(wA.feet >= 3 && (await marksOf(B, "me")).length >= 3, `A's walk shows on B's page too (up to ${wA.feet} footprints at once; B's drawing stood still for ${wA.stall} ms) while B's own trail is still there`);
  console.log("\n# the marks fade");
  ok(await waitFor(A, (id) => !window.__longWatch.perf().tracks.list.some(m => m.o === id), idB, FOOT_LIFE_MS + 5000), "when B has stood still for 6 s the trail is gone from A's page");
  const bGone = await waitFor(B, () => window.__longWatch.perf().tracks.list.length === 0, null, 5000);
  if (!bGone) await diag("B's marks did not fade", { A, B });
  ok(bGone, "and from B's own page");

  console.log("\n# a leaver adds no more");
  await teleportSynced(B, [A], sandStrip.x - 0.5, sandStrip.y);
  await keyDown(B, "ArrowRight"); await sleep(500);
  await B.close(); // B leaves while still holding the key
  await sleep(3500);
  const afterLeave = (await perf(A)).tracks.list.filter(m => m.o === idB).length;
  await sleep(1200);
  ok(await waitFor(A, () => window.__longWatch.peers().length === 0, null, 12000), "A sees B gone");
  const later = (await perf(A)).tracks.list.filter(m => m.o === idB).length;
  ok(later <= afterLeave, `B's trail only fades after B has left (${afterLeave}, then ${later})`);
  await A.context().close(); // pages left open all draw at once and slow the rest of the test, so each section closes its own

  console.log("\n# a wake in shallow water");
  const C = await mk(), D = await mk({}, C.context());
  await enter(C, q, "tk2"); await enter(D, q, "tk2");
  ok(await waitFor(C, () => window.__longWatch.peers().length === 1, null, 8000), "two players share a second room");
  const idD = await myId(D);
  ok(await teleportSynced(D, [C], waterStrip.x - 0.5, waterStrip.y) && await teleportSynced(C, [D], waterStrip.x - 0.5, waterStrip.y), "both stand at the start of the shallows");
  const wD = await watchedWalk(D, C, idD, "ArrowRight", 1300, () => teleportSynced(D, [C], waterStrip.x - 0.5, waterStrip.y));
  if (wD.wakes < 2) console.log("     trace of C's page [ms, frames, D's footprints, D's wakes]:", JSON.stringify(wD.trace));
  const wk = await marksOf(C, idD);
  ok(wD.wakes >= 2 && wD.wakes <= WAKE_CAP && wD.feet === 0 && wk.every(m => m.ground === "wake" && groundName(m.x, m.y) === "wake"), `D's walk through the shallows showed up to ${wD.wakes} wakes at once on C's page (at most ${WAKE_CAP} kept), no footprints, all on shallow tiles`);
  ok(wk.every(m => m.age >= 0 && m.age < WAKE_LIFE_MS + 400), "and none of them is older than the wake's life");
  ok(await waitFor(C, (id) => !window.__longWatch.perf().tracks.list.some(m => m.o === id), idD, 5000), "a wake is gone from the other page within a few seconds");

  console.log("\n# the governor, the plain look and the off switch");
  await teleportSynced(D, [C], sandStrip.x - 0.5, sandStrip.y); await teleportSynced(C, [D], sandStrip.x - 0.5, sandStrip.y);
  await keyDown(D, "ArrowRight"); await sleep(1000);
  ok((await perf(C)).tracks.drawn >= 3 && (await perf(C)).level === 2, "at level 2 D's footprints are drawn on C");
  await C.evaluate(() => window.__longWatch.setLevel(0)); await sleep(300);
  ok((await perf(C)).tracks.drawn === 0, "level 0 draws no marks");
  await C.evaluate(() => window.__longWatch.setLevel(1)); await sleep(300);
  ok((await perf(C)).tracks.drawn >= 1, "level 1 still draws them");
  await C.evaluate(() => { window.__longWatch.setLevel(2); window.__longWatch.setTracks(false); }); await sleep(300);
  ok((await perf(C)).tracks.drawn === 0 && (await perf(C)).tracks.marks === 0, "the test switch turns every mark off (and forgets the old ones)");
  await C.evaluate(() => window.__longWatch.setTracks(true));
  await keyUp(D, "ArrowRight");
  const P = await mk(), O = await mk();
  await enter(P, `?net=local&hour=3&weather=clear&look=plain${calm}`, "tk3"); await P.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [sandStrip.x - 0.5, sandStrip.y]);
  await hold(P, "ArrowRight", 900);
  ok((await perf(P)).tracks.marks === 0 && (await perf(P)).tracks.on === false, "the plain look makes no marks");
  await P.context().close();
  await enter(O, `?net=local&hour=3&weather=clear&tracks=off${calm}`, "tk4"); await O.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [sandStrip.x - 0.5, sandStrip.y]);
  await hold(O, "ArrowRight", 900);
  ok((await perf(O)).tracks.marks === 0 && (await perf(O)).tracks.on === false, "?tracks=off makes none");
  ok(await O.evaluate(() => window.__longWatch.stressTracks(10)) === true, "the made-up crowd of marks (tests only) is allowed on a page served from this machine");
  await O.context().close();

  console.log("\n# reduced motion keeps footprints and holds the rings still");
  const rctx = await browser.newContext({ viewport: { width: 700, height: 700 }, reducedMotion: "reduce" });
  const R1 = await mk({}, rctx), R2 = await mk({}, rctx);
  await enter(R1, q, "tk5"); await enter(R2, q, "tk5");
  ok(await waitFor(R1, () => window.__longWatch.peers().length === 1, null, 8000), "two players with reduced motion share a room");
  const idR2 = await myId(R2);
  await teleportSynced(R2, [R1], sandStrip.x - 0.5, sandStrip.y); await teleportSynced(R1, [R2], sandStrip.x - 0.5, sandStrip.y);
  const wR = await watchedWalk(R2, R1, idR2, "ArrowRight", 1000, () => teleportSynced(R2, [R1], sandStrip.x - 0.5, sandStrip.y));
  if (wR.feet < 4) console.log("     trace of R1's page [ms, frames, footprints, wakes]:", JSON.stringify(wR.trace));
  const rmOn = await R1.evaluate(() => window.__longWatch.hud().reducedMotion), rm = { length: wR.feet };
  ok(rm.length >= 4 && rmOn, `footprints are still made and drawn (up to ${wR.feet} at once on R1, reduced motion ${rmOn})`);
  await teleportSynced(R2, [R1], waterStrip.x - 0.5, waterStrip.y); await teleportSynced(R1, [R2], waterStrip.x - 0.5, waterStrip.y);
  const wR2 = await watchedWalk(R2, R1, idR2, "ArrowRight", 1000, () => teleportSynced(R2, [R1], waterStrip.x - 0.5, waterStrip.y));
  if (wR2.wakes < 2) console.log("     trace of R1's page [ms, frames, footprints, wakes]:", JSON.stringify(wR2.trace));
  ok(wR2.wakes >= 2, "and wakes are still drawn (as small rings that only fade; the ring sizes are checked in the node part)");
  await rctx.close();

  console.log("\n# screenshots and frame cost at 375 and 1100 px (headless Chromium, software drawing: a rough guide, not a phone)");
  async function measure(page, label, w, h) {
    await page.setViewportSize({ width: w, height: h }); await sleep(400);
    const f0 = (await perf(page)).frames;
    await waitFor(page, (n) => window.__longWatch.perf().frames > n + 260, f0, 30000);
    const st = await perf(page);
    console.log(`     ${label.padEnd(34)} ${String(w).padStart(4)} px: draw ${st.drawMean.toFixed(2)} ms mean, ${st.drawP95.toFixed(2)} ms p95, frames every ${st.frameMean.toFixed(1)} ms (${st.fps.toFixed(0)} fps), ${st.tracks.drawn} marks`);
    return st;
  }
  const keep = C.viewportSize();
  await teleportSynced(C, [D], sandStrip.x + 3, sandStrip.y);
  await C.evaluate(() => window.__longWatch.setTracks(false)); await C.evaluate(() => window.__longWatch.stressTracks(0));
  if (shots) { await sleep(300); await shoot(C, "tracks-before"); }
  await C.evaluate(() => { window.__longWatch.setTracks(true); window.__longWatch.stressTracks(300); }); await sleep(300);
  if (shots) await shoot(C, "tracks-after");
  for (const [w, h] of [[375, 760], [1100, 800]]) {
    await C.evaluate(() => { window.__longWatch.setLevel(2); window.__longWatch.setTracks(false); window.__longWatch.stressTracks(0); });
    const off = await measure(C, "level 2, marks off", w, h);
    await C.evaluate(() => { window.__longWatch.setTracks(true); window.__longWatch.stressTracks(0); });
    // real marks: C walks while measuring is not steady, so the real case is D's trail plus C's own: both keep walking
    const real = await measure(C, "level 2, marks on (nobody walking)", w, h);
    await C.evaluate(() => window.__longWatch.stressTracks(300));
    const on = await measure(C, "level 2, 300 made-up marks", w, h);
    await C.evaluate(() => window.__longWatch.setLevel(1));
    await measure(C, "level 1, up to 120 made-up marks", w, h);
    await C.evaluate(() => { window.__longWatch.setLevel(2); window.__longWatch.stressTracks(0); });
    ok(on.tracks.drawn === 300 && off.tracks.drawn === 0 && Number.isFinite(on.drawMean - off.drawMean), `at ${w} px 300 marks add ${(on.drawMean - off.drawMean).toFixed(2)} ms to the mean draw time (${off.drawMean.toFixed(2)} to ${on.drawMean.toFixed(2)} ms; nobody walking: ${real.drawMean.toFixed(2)} ms)`);
    ok(on.drawMean - off.drawMean < 4 && on.drawMean < 14, `at ${w} px the marks stay cheap: under 4 ms added and under 14 ms drawn in all (a frame at 60 fps is 16.7 ms)`);
  }
  await C.setViewportSize(keep);
} finally {
  ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
  await browser.close(); server.close();
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
  process.exitCode = failures ? 1 : 0;
}
