#!/usr/bin/env node
// Milestone 20 tests for The Long Watch: shadows and flame (a look step). Trees, rocks and landmarks throw a soft shadow
// away from the lights near them (every player's lantern, lit beacons, the lit lighthouse); flames flicker. Everything is
// drawn by each browser alone from the lights it can see, so nothing is sent: the multiplayer checks are that a shadow
// follows another player's lantern (seen on a page whose own light does not reach the tree), that a beacon the players
// light together throws shadows on both pages, and that the governor, the plain look and reduced motion draw the right amount.
//
//   node game/tests/shadows.test.mjs            node checks, then pages on the local transport
//   SHOTS=/some/dir node ...                    also save screenshots (shadows off and on; 375 and 1100 px)
//   CHROME=/path/to/headless_shell              use this browser binary
// The frame cost is measured in headless Chromium (software drawing, no phone) and printed; it is a rough guide only.
// Online play over the public relays is not tested here (nothing about shadows is sent).
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld, T, isBlocked } from "../js/world.js";
import { SLOT_MS, shadeCount } from "../js/shades.js";
import { BEACON_NEED, BEACON_RANGE } from "../js/beacon.js";
import { CASTERS_MAX, CASTER, SHADOW_ALPHA_MAX, LIGHT_SPAN, shadowOf, keepDarkest, flameFlicker } from "../js/shadows.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const shots = process.env.SHOTS;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const STORE = "vigil.longwatch.v1";

console.log("# shadows and flame, in node");
const world = generateWorld(), SEED = world.seed;
{
  ok(CASTERS_MAX.length === 3 && CASTERS_MAX[0] === 0 && CASTERS_MAX[1] === 14 && CASTERS_MAX[2] === 40, "the governor allows 0, 14 and 40 shadows at levels 0, 1 and 2");
  const L = (x, y, r = 3.2, f = 1) => ({ x, y, r, f });
  ok(shadowOf(10, 10, "tree", []) === null, "no light, no shadow");
  const s1 = shadowOf(10, 10, "tree", [L(8, 10)]);
  ok(s1 && s1.dx > 0.999 && Math.abs(s1.dy) < 1e-9 && s1.len > 0.3 && s1.len < CASTER.tree.h * 1.3 && s1.alpha > 0.05 && s1.alpha <= SHADOW_ALPHA_MAX, `a lantern 2 tiles to the west throws the tree's shadow east (length ${s1 && s1.len.toFixed(2)} tiles, opacity ${s1 && s1.alpha.toFixed(2)})`);
  const s2 = shadowOf(10, 10, "tree", [L(10, 12)]);
  ok(s2 && s2.dy < -0.999 && Math.abs(s2.dx) < 1e-9, "a lantern to the south throws it north (away from the light)");
  ok(shadowOf(10, 10, "tree", [L(10 - 3.2 * LIGHT_SPAN - 0.01, 10)]) === null && shadowOf(10, 10, "tree", [L(10 - 3.2 * LIGHT_SPAN + 0.3, 10)]) !== null, "a light reaches out to 1.15 times its radius and no further");
  ok(shadowOf(10, 10, "tree", [L(10.1, 10)]) === null, "a light standing on the thing itself does not shadow it");
  ok(shadowOf(10, 10, "tree", [L(8, 10), L(12, 10)]) === null, "two equal lights on opposite sides cancel: no shadow with no clear direction");
  const s3 = shadowOf(10, 10, "tree", [L(8, 10), L(12, 10, 3.2, 0.5)]);
  ok(s3 && s3.dx > 0.99, "unequal lights on opposite sides: the shadow falls away from the stronger one");
  const near = shadowOf(10, 10, "tree", [L(9, 10)]), far = shadowOf(10, 10, "tree", [L(7, 10)]);
  ok(near.alpha > far.alpha && near.len < far.len, `a nearer light gives a darker, shorter shadow (${near.alpha.toFixed(2)} and ${near.len.toFixed(2)} against ${far.alpha.toFixed(2)} and ${far.len.toFixed(2)})`);
  const bright = shadowOf(10, 10, "tree", [L(8, 10, 3.2, 1.05)]), dim = shadowOf(10, 10, "tree", [L(8, 10, 3.2, 0.95)]);
  ok(bright.alpha > dim.alpha, "a flame that flares gives a slightly darker shadow than one that dips");
  ok(shadowOf(10, 10, "lighthouse", [L(8, 10)]).len > 2 * shadowOf(10, 10, "rock", [L(8, 10)]).len, "a tower throws a longer shadow than a rock");
  ok(shadowOf(10, 10, "boat", [L(8, 10)]) === null && shadowOf(10, 10, "tree", [L(NaN, 10), L(8, 10, NaN), L(8, 10, 3.2, NaN)]) === null, "an unknown kind, or a light with an odd number, throws nothing");
  let bad = 0, n = 0, seen = 0;
  for (let i = 0; i < 6000; i++) {
    const lights = [], k = i % 4;
    for (let j = 0; j < k; j++) lights.push(L(5 + Math.sin(i * 7.1 + j) * 5, 5 + Math.cos(i * 3.3 + j * 2) * 5, 0.5 + (i % 11), 0.4 + (i % 7) / 5));
    const sh = shadowOf(5 + (i % 13) * 0.17, 5 + (i % 5) * 0.31, ["tree", "rock", "beacon", "lighthouse", "well"][i % 5], lights);
    n++;
    if (!sh) continue;
    seen++;
    const m = Math.hypot(sh.dx, sh.dy);
    if (![sh.dx, sh.dy, sh.len, sh.wid, sh.alpha].every(Number.isFinite) || Math.abs(m - 1) > 1e-9 || sh.alpha < 0 || sh.alpha > SHADOW_ALPHA_MAX || sh.len <= 0 || sh.len > 3.6) bad++;
  }
  ok(bad === 0 && seen > 500, `over ${n} odd scenes (${seen} with a shadow) every shadow is finite, a unit direction, no darker than ${SHADOW_ALPHA_MAX} and no longer than 3.6 tiles`);
  const list = Array.from({ length: 60 }, (_, i) => ({ x: i, y: 0, alpha: ((i * 37) % 60) / 100 })), copy = JSON.stringify(list);
  const kept = keepDarkest(list, 14);
  ok(kept.length === 14 && JSON.stringify(list) === copy && kept.every(a => a.alpha >= 0.46) && keepDarkest(list, 0).length === 0 && keepDarkest(list, 100) === list && JSON.stringify(keepDarkest(list, 14)) === JSON.stringify(kept), "keepDarkest keeps the 14 darkest in a stable order and leaves the list alone");
  // flames
  const calm0 = flameFlicker(123456, 3, 2, true);
  ok(calm0.wob === 0 && calm0.h === 1 && calm0.glow === 1 && flameFlicker(999, 3, 0, true).glow === 1, "reduced motion: a steady flame (no lean, factors exactly 1)");
  const range = (level, seed) => { const lo = [9, 9, 9], hi = [-9, -9, -9]; let fin = true; for (let t = 0; t < 40000; t += 7) { const f = flameFlicker(t, seed, level, false); [f.wob, f.h, f.glow].forEach((v, i) => { if (!Number.isFinite(v)) fin = false; lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); }); } return { lo, hi, fin }; };
  const r2 = range(2, 1), r1 = range(1, 2), r0 = range(0, 3);
  ok(r2.fin && r2.lo[0] >= -0.5001 && r2.hi[0] <= 0.5001 && r2.lo[1] >= 0.85 && r2.hi[1] <= 1.15 && r2.lo[2] >= 0.94 && r2.hi[2] <= 1.06, `a flame at level 2 stays inside its bounds (lean ${r2.lo[0].toFixed(2)} to ${r2.hi[0].toFixed(2)}, height ${r2.lo[1].toFixed(2)} to ${r2.hi[1].toFixed(2)}, light ${r2.lo[2].toFixed(3)} to ${r2.hi[2].toFixed(3)})`);
  ok(r2.hi[0] - r2.lo[0] > 0.6 && r1.hi[0] - r1.lo[0] > 0.6 && r0.hi[0] - r0.lo[0] <= 0.71 && r0.hi[1] - r0.lo[1] < 0.11 && r0.hi[2] - r0.lo[2] < 0.05, "it really flickers (lean moves by more than 0.6 at levels 1 and 2) and level 0 is a single slow, small wave");
  let diff = 0; for (let t = 0; t < 5000; t += 50) if (Math.abs(flameFlicker(t, 1, 2, false).wob - flameFlicker(t, 2, 2, false).wob) > 0.05) diff++;
  ok(diff > 40, "neighbouring flames are out of step");
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
// a clock inside a slot with no shades (a snuffed lantern would change the lights)
let quiet = 5; while (shadeCount(SEED, quiet) !== 0 || shadeCount(SEED, quiet + 1) !== 0) quiet++;
const calm = `&shadeclock=${quiet * SLOT_MS + 5000 - Date.now()}`;
const beaconList = world.landmarks.filter(l => l.kind === "beacon");
const free = (x, y) => !isBlocked(world, x, y) && [T.SAND, T.GRASS, T.MEADOW].includes(world.tiles[Math.floor(y) * world.w + Math.floor(x)]);
const castersAround = (l) => { let n = 0; for (let y = 0; y < world.h; y++) for (let x = 0; x < world.w; x++) { const t = world.tiles[y * world.w + x]; if ((t === T.TREE || t === T.ROCK) && Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y) < 9) n++; } return n; };
const forest = beaconList.map((l, i) => ({ i, n: castersAround(l) })).sort((a, b) => b.n - a.n)[0].i; // the beacon with the most trees and rocks in its pool
const spots = (l) => { const out = []; for (let r = 1.1; r <= 2.2 && out.length < 3; r += 0.3) for (let a = 0; a < 6.28 && out.length < 3; a += 0.5) { const x = l.x + Math.cos(a) * r, y = l.y + Math.sin(a) * r; if (free(x, y) && Math.hypot(x - l.x, y - l.y) <= BEACON_RANGE - 0.2) out.push({ x, y }); } return out; };
const dir = (a, b) => { const d = Math.hypot(a.x - b.x, a.y - b.y) || 1; return { x: (a.x - b.x) / d, y: (a.y - b.y) / d }; };

try {
  console.log("\n# a shadow follows another player's lantern");
  // a tree with open ground 2 tiles to its west (A) and 7 tiles to its west (B)
  let pick = null;
  for (let y = 4; y < world.h - 4 && !pick; y++) for (let x = 12; x < world.w - 4 && !pick; x++) {
    if (world.tiles[y * world.w + x] !== T.TREE) continue;
    const a = { x: x + 0.5 - 2, y: y + 0.78 }, b = { x: x + 0.5 - 7, y: y + 0.78 };
    if (free(a.x, a.y) && free(b.x, b.y) && free(a.x, a.y + 1) && free(a.x - 1, a.y)) pick = { x: x + 0.5, y: y + 0.78, a, b };
  }
  ok(!!pick, "the island has a tree with open ground two and seven tiles west of it");
  const A = await mk(), B = await mk({}, A.context());
  await enter(A, `?net=local&hour=3&weather=clear${calm}`, "sh1"); await enter(B, `?net=local&hour=3&weather=clear${calm}`, "sh1");
  ok(await waitFor(A, () => window.__longWatch.peers().length === 1, null, 8000) && await waitFor(B, () => window.__longWatch.peers().length === 1, null, 8000), "two players share a room");
  ok(await teleportSynced(B, [A], pick.b.x, pick.b.y) && await teleportSynced(A, [B], pick.a.x, pick.a.y), "A stands 2 tiles and B 7 tiles west of the tree");
  const find = (st) => st.shadowList.find(s => Math.abs(s.x - pick.x) < 0.01 && Math.abs(s.y - pick.y) < 0.01);
  ok(await waitFor(B, ([x, y]) => window.__longWatch.perf().shadowList.some(s => Math.abs(s.x - x) < 0.01 && Math.abs(s.y - y) < 0.01), [pick.x, pick.y], 5000), "B's page draws a shadow for the tree although B's own lantern is 7 tiles away (it is A's light)");
  const [pa, pb] = [await perf(A), await perf(B)];
  const sa = find(pa), sb = find(pb);
  ok(sa && sb && sa.dx > 0.99 && sb.dx > 0.99 && Math.abs(sa.dy) < 0.05 && Math.abs(sb.dy) < 0.05, `both pages throw it east, away from A's lantern (${sa && sa.dx.toFixed(2)}, ${sb && sb.dx.toFixed(2)})`);
  ok(sa && sb && Math.abs(sa.len - sb.len) < 0.05 && Math.abs(sa.alpha - sb.alpha) < 0.02, "and agree on its length and darkness (B's own lantern does not reach it)");
  ok(await A.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [world.spawn.x, world.spawn.y]) && Math.hypot(world.spawn.x - pick.x, world.spawn.y - pick.y) > 12, "A walks to the spawn, far from the tree");
  ok(await waitFor(B, ([x, y]) => !window.__longWatch.perf().shadowList.some(s => Math.abs(s.x - x) < 0.01 && Math.abs(s.y - y) < 0.01), [pick.x, pick.y], 6000), "when A walks away the tree's shadow is gone from B's page");

  console.log("\n# the governor, the plain look and the off switch");
  await teleportSynced(A, [B], pick.a.x, pick.a.y);
  await sleep(300);
  ok((await perf(A)).shadows >= 1 && (await perf(A)).level === 2, "at level 2 the tree's shadow is drawn on A");
  await A.evaluate(() => window.__longWatch.setLevel(0)); await sleep(300);
  ok((await perf(A)).shadows === 0, "level 0 draws no shadows");
  await A.evaluate(() => window.__longWatch.setLevel(1)); await sleep(300);
  ok((await perf(A)).shadows >= 1, "level 1 still draws the shadows that are there");
  await A.evaluate(() => { window.__longWatch.setLevel(2); window.__longWatch.setShadows(false); }); await sleep(300);
  ok((await perf(A)).shadows === 0, "the test switch turns every shadow off");
  const P = await mk(), O = await mk();
  await enter(P, `?net=local&hour=3&weather=clear&look=plain${calm}`, "sh2"); await P.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [pick.a.x, pick.a.y]); await sleep(300);
  ok((await perf(P)).shadows === 0 && (await perf(P)).flame === null, "the plain look draws no shadows and no flame flicker");
  await enter(O, `?net=local&hour=3&weather=clear&shadows=off${calm}`, "sh3"); await O.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [pick.a.x, pick.a.y]); await sleep(300);
  ok((await perf(O)).shadows === 0, "?shadows=off draws none");

  // ---- a beacon the players light together ----
  const lit = async (reduce) => {
    const label = reduce ? "reduced motion" : "normal motion", room = reduce ? "sh5" : "sh4";
    console.log(`\n# a lit beacon in the trees, ${label}`);
    const ctx = await browser.newContext({ viewport: { width: 700, height: 700 }, ...(reduce ? { reducedMotion: "reduce" } : {}) });
    const [X, Y] = [await mk({}, ctx), await mk({}, ctx)];
    const url = `${base}?net=local&hour=3&weather=clear${calm}#room=${room}`;
    await seedPack(X, url, { inv: { driftwood: 45, reeds: 3, berries: 4 } }); await seedPack(Y, url, { inv: { driftwood: 45, reeds: 0, berries: 2 } });
    await X.click("#enter"); await Y.click("#enter");
    ok(await waitFor(X, () => window.__longWatch.peers().length === 1, null, 8000) && await waitFor(Y, () => window.__longWatch.peers().length === 1, null, 8000) && await waitFor(X, () => window.__longWatch.beacon() && window.__longWatch.beacon().synced, null, 6000) && await waitFor(Y, () => window.__longWatch.beacon() && window.__longWatch.beacon().synced, null, 6000), `${label}: two players meet and hear each other's beacon counts`);
    const bl = beaconList[forest], sp = spots(bl);
    ok(sp.length >= 2 && await teleportSynced(X, [Y], sp[0].x, sp[0].y) && await teleportSynced(Y, [X], sp[1].x, sp[1].y), `${label}: both stand beside the beacon with the most trees (${castersAround(bl)} trees and rocks within 9 tiles)`);
    const before = await perf(X);
    for (let i = 0; i < BEACON_NEED / 2; i++) await Promise.all([X, Y].map(p => p.evaluate(() => window.__longWatch.addFuel("driftwood"))));
    ok(await waitFor(X, (b) => window.__longWatch.beacon().lit[b], forest, 6000) && await waitFor(Y, (b) => window.__longWatch.beacon().lit[b], forest, 6000), `${label}: the beacon is lit on both pages`);
    await sleep(600);
    const [pX, pY] = [await perf(X), await perf(Y)];
    ok(pX.shadows > before.shadows && pX.shadows >= 15 && pX.shadows <= CASTERS_MAX[2] && pY.shadows >= 15 && pY.shadows <= CASTERS_MAX[2], `${label}: the lit beacon's pool puts shadows on both pages (${before.shadows} before, ${pX.shadows} and ${pY.shadows} after, at most ${CASTERS_MAX[2]})`);
    const me = await X.evaluate(() => { const s = window.__longWatch.self(); return { x: s.x, y: s.y }; }), you = await Y.evaluate(() => { const s = window.__longWatch.self(); return { x: s.x, y: s.y }; });
    const outer = pX.shadowList.filter(s => (s.kind === "tree" || s.kind === "rock") && Math.hypot(s.x - bl.x, s.y - bl.y) > 5 && Math.hypot(s.x - me.x, s.y - me.y) > 5 && Math.hypot(s.x - you.x, s.y - you.y) > 5);
    ok(outer.length >= 5 && outer.every(s => { const d = dir(s, bl); return s.dx * d.x + s.dy * d.y > 0.9; }), `${label}: the ${outer.length} trees and rocks more than 5 tiles from the beacon and both lanterns all throw their shadows straight away from the beacon`);
    const f0 = await perf(X);
    ok(f0.flame && Number.isFinite(f0.flame.wob), `${label}: the lit beacon's flame is drawn with a flicker state`);
    const samples = []; for (let i = 0; i < 14; i++) { samples.push((await perf(X)).flame); await sleep(61); }
    const wobs = new Set(samples.map(s => s.wob.toFixed(3))), lo = Math.min(...samples.map(s => s.wob)), hi = Math.max(...samples.map(s => s.wob));
    if (reduce) ok(samples.every(s => s.wob === 0 && s.h === 1 && s.glow === 1), `${label}: the flame is steady (lean 0, factors 1 in all 14 samples)`);
    else ok(wobs.size >= 6 && hi - lo > 0.2 && samples.every(s => s.h > 0.84 && s.h < 1.16 && s.glow > 0.94 && s.glow < 1.06), `${label}: the flame flickers (${wobs.size} different leans in 14 samples, range ${(hi - lo).toFixed(2)}) and stays in bounds`);
    ok((await perf(X)).shadows >= 15, `${label}: shadows are still drawn`);
    const sum = async (pg) => pg.evaluate(() => { const c = document.getElementById("view"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7; return s; });
    if (reduce) {
      // Milestone 31: three pictures against a fixed 0.3%; now six pictures, each compared with the median, and the largest
      // difference is printed (to within the fireflies and the sky).
      const sums = []; for (let i = 0; i < 6; i++) { sums.push(await sum(X)); await sleep(500); }
      const med = [...sums].sort((a, b) => a - b)[3], worst = Math.max(...sums.map(v => Math.abs(v - med) / med));
      ok(worst < 0.003, `${label}: the picture, shadows and flame included, does not move (largest difference of 6 pictures from the middle one ${(worst * 100).toFixed(3)}%, limit 0.3%)`);
    }
    return { X, Y, ctx };
  };
  const calmScene = await lit(true);
  await calmScene.ctx.close();
  const scene = await lit(false);
  const { X } = scene;

  console.log("\n# governor levels at the lit beacon");
  await X.evaluate(() => window.__longWatch.setLevel(1)); await sleep(400);
  const l1 = (await perf(X)).shadows;
  ok(l1 >= 1 && l1 <= CASTERS_MAX[1], `level 1 draws at most ${CASTERS_MAX[1]} shadows (${l1})`);
  await X.evaluate(() => window.__longWatch.setLevel(0)); await sleep(400);
  const f00 = []; for (let i = 0; i < 14; i++) { f00.push((await perf(X)).flame); await sleep(61); }
  ok((await perf(X)).shadows === 0 && Math.max(...f00.map(s => s.wob)) - Math.min(...f00.map(s => s.wob)) < 0.71, "level 0 draws no shadows and the flame only sways slowly");
  await X.evaluate(() => window.__longWatch.setLevel(2)); await sleep(400);

  // ---- what the player sees, and what it costs ----
  console.log("\n# screenshots and frame cost at 375 and 1100 px (headless Chromium, software drawing: a rough guide, not a phone)");
  async function measure(page, label, w, h) {
    await page.setViewportSize({ width: w, height: h }); await sleep(400);
    const f0 = (await perf(page)).frames;
    await waitFor(page, (n) => window.__longWatch.perf().frames > n + 260, f0, 30000);
    const st = await perf(page);
    console.log(`     ${label.padEnd(26)} ${String(w).padStart(4)} px: draw ${st.drawMean.toFixed(2)} ms mean, ${st.drawP95.toFixed(2)} ms p95, frames every ${st.frameMean.toFixed(1)} ms (${st.fps.toFixed(0)} fps), ${st.shadows} shadows`);
    return st;
  }
  const keep = X.viewportSize();
  if (shots) { await X.evaluate(() => window.__longWatch.setShadows(false)); await sleep(300); await shoot(X, "shadows-before"); await X.evaluate(() => window.__longWatch.setShadows(true)); await sleep(300); await shoot(X, "shadows-after"); }
  for (const [w, h] of [[375, 760], [1100, 800]]) {
    await X.evaluate(() => { window.__longWatch.setLevel(2); window.__longWatch.setShadows(false); });
    const off = await measure(X, "level 2, shadows off", w, h);
    await X.evaluate(() => window.__longWatch.setShadows(true));
    const on = await measure(X, "level 2, shadows on", w, h);
    await X.evaluate(() => window.__longWatch.setLevel(1));
    await measure(X, "level 1, shadows on", w, h);
    await X.evaluate(() => window.__longWatch.setLevel(2));
    ok(on.shadows >= 15 && off.shadows === 0 && Number.isFinite(on.drawMean - off.drawMean), `at ${w} px the shadows add ${(on.drawMean - off.drawMean).toFixed(2)} ms to the mean draw time (${off.drawMean.toFixed(2)} to ${on.drawMean.toFixed(2)} ms) with ${on.shadows} shadows`);
    ok(on.drawMean - off.drawMean < 4 && on.drawMean < 14, `at ${w} px the shadows stay cheap: under 4 ms added and under 14 ms drawn in all (a frame at 60 fps is 16.7 ms)`);
  }
  await X.setViewportSize(keep);
  await scene.ctx.close();
} finally {
  ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
  await browser.close(); server.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
