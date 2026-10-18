#!/usr/bin/env node
// Milestone 33 tests for The Long Watch: light on the water (a look step). Lanterns, lit beacons and the lit lighthouse lay
// short wavering streaks on the water near them, and the moon lays a path of glints on the sea under its place in the sky
// strip. Each browser works them out alone from the lights it already holds, so nothing is sent: the multiplayer checks are
// that a page draws streaks round ANOTHER player's lantern (and none round its own, which stands far from water), that a
// player wading in the shallows is not covered, and that players, the lantern's pool and paths keep their contrast with
// the streaks on, measured as the dawn test does (tests/skyglow.test.mjs), at dusk, midnight and dawn.
//
//   node game/tests/glitter.test.mjs            node checks, then pages on the local transport
//   NODE_ONLY=1 node ...                        the node checks alone
//   SHOTS=/some/dir node ...                    also save screenshots (streaks off and on; 375 and 1100 px)
//   CHROME=/path/to/headless_shell              use this browser binary
// Lit beacons and the lit lighthouse are checked as lights in node only (lighting one in a browser takes two players and
// a long fuel run, which tests/beacon.test.mjs and tests/watch.test.mjs already cover). Frame cost is measured in headless
// Chromium (software drawing, no phone) and printed; it is a rough guide only. Online play over the public relays is not
// tested here (nothing about the light on the water is sent).
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld, T, hash3, tileAt } from "../js/world.js";
import { SLOT_MS, shadeCount } from "../js/shades.js";
import { moonAt } from "../js/living.js";
import { STREAK_CAP, MOON_CAP, DENSITY, REACH, PEAK, MOON_PEAK, MOON_HALF, WARM, MOON_RGB, streakState, fall, lightStreaks, moonStreaks } from "../js/glitter.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const shots = process.env.SHOTS;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log("# light on the water, in node");
const world = generateWorld();
const isWater = (x, y) => { const k = tileAt(world, x, y); return k === T.DEEP || k === T.SHALLOW; };
const hN = (x, y) => hash3(x, y, world.seed + 523);
const land = (x, y) => [T.SAND, T.GRASS, T.MEADOW].includes(world.tiles[y * world.w + x]);
function waterNear(x, y, r) { let n = 0, near = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const tx = Math.floor(x) + dx, ty = Math.floor(y) + dy, d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y); if (isWater(tx, ty)) { if (d < r) n++; if (d < 1.5) near++; } } return { n, near }; }
// the best shore (most water in reach) that has an inland spot beside it: no water within 3 tiles of the spot (a lantern's pool at
// dusk and dawn reaches 2.9), 6 to 9 tiles to the side of the shore and within 3 tiles of its row, so that the shore and its
// lantern's pool are on a page's screen when it stands inland (the screen is about 12 tiles high at 700 px)
const { shore, inland } = (() => {
  const cands = [];
  for (let y = 8; y < world.h - 8; y++) for (let x = 8; x < world.w - 8; x++) {
    if (!land(x, y)) continue;
    const { n, near } = waterNear(x + 0.5, y + 0.5, 2.6);
    if (near !== 0 || n < 5) continue;
    let wide = 0; for (let dy = -11; dy <= 11; dy++) for (let dx = -11; dx <= 11; dx++) if (isWater(x + dx, y + dy)) wide++;
    cands.push({ x: x + 0.5, y: y + 0.5, n, wide });
  }
  cands.sort((a, b) => b.n - a.n || b.wide - a.wide);
  for (const sh of cands) {
    for (let ax = 6; ax <= 9; ax++) for (const sgn of [-1, 1]) for (let dy = 0; dy <= 3; dy++) for (const sy of [1, -1]) {
      const x = Math.floor(sh.x) + sgn * ax, y = Math.floor(sh.y) + sy * dy;
      if (x < 8 || y < 8 || x > world.w - 8 || y > world.h - 8 || !land(x, y)) continue;
      let w = 0; for (let ddy = -3; ddy <= 3; ddy++) for (let ddx = -3; ddx <= 3; ddx++) if (isWater(x + ddx, y + ddy)) w++;
      if (w === 0) return { shore: sh, inland: { x: x + 0.5, y: y + 0.5 } };
    }
  }
  return { shore: cands[0] || null, inland: null };
})();
{
  ok(!!shore && !!inland, `the island has a shore to stand on (${shore && shore.n} water tiles within 2.6 tiles, none within 1.5) and an inland spot beside it`);
  ok(STREAK_CAP.length === 3 && STREAK_CAP[0] === 0 && STREAK_CAP[1] === 90 && STREAK_CAP[2] === 240 && MOON_CAP[0] === 0 && MOON_CAP[2] <= STREAK_CAP[2] && MOON_CAP[1] <= STREAK_CAP[1] && PEAK <= 0.6 && MOON_PEAK <= 0.5, "the governor allows 0, 90 and 240 streaks at levels 0, 1 and 2 (the moon's share is smaller), and no streak is brighter than a glint (0.6 of full)");
  const a0 = streakState(0, 0.3, true), a1 = streakState(5000, 0.3, true), b0 = streakState(0, 0.3, false), b1 = streakState(900, 0.3, false);
  ok(JSON.stringify(a0) === JSON.stringify(a1) && a0.dx === 0, "under reduced motion a streak is the same at every time, and does not sway");
  ok(b0.dx !== b1.dx && b0.a !== b1.a, "otherwise it sways and brightens and dims");
  let sw = 0, aMin = 9, aMax = 0; for (let t = 0; t < 60000; t += 37) for (const h of [0, 0.2, 0.5, 0.9]) { const s = streakState(t, h, false); sw = Math.max(sw, Math.abs(s.dx)); aMin = Math.min(aMin, s.a); aMax = Math.max(aMax, s.a); }
  ok(sw < 0.25 && aMin >= 0.4 && aMax <= 1.0001, `a streak sways at most ${sw.toFixed(2)} tile and stays between ${aMin.toFixed(2)} and ${aMax.toFixed(2)} of its brightness`);
  ok(fall(0, 3) === 1 && fall(3 * REACH, 3) === 0 && fall(5, 3) === 0 && fall(1, 3) > fall(2, 3) && fall(1.5 * REACH, 3) > 0.8 && fall(-1, 3) === 0 && fall(1, 0) === 0 && fall(NaN, 3) === 0, "light is full beside a lamp, falls smoothly and is gone at its reach");

  const view = { x0: 0, y0: 0, x1: world.w - 1, y1: world.h - 1 };
  const L = { x: shore.x, y: shore.y, r: 2.9, f: 1 };
  const one = lightStreaks([L], isWater, hN, view, 1234, false, 240);
  ok(one.length >= 3 && one.every(s => isWater(Math.floor(s.x), Math.floor(s.y))), `a lantern at the shore lays ${one.length} streaks, every one on water`);
  ok(one.every(s => Math.hypot(s.x - L.x, s.y - L.y) <= L.r * REACH + 0.3) && one.every(s => s.a > 0 && s.a <= PEAK && s.w > 0.2 && s.w < 1.6), "all lie within the lantern's reach, none brighter than the peak");
  const tilesOf = (list) => new Set(list.map(s => `${Math.floor(s.x)},${Math.floor(s.y)}`)); // sway is under 0.25 tile, so near the same tile
  const later = lightStreaks([L], isWater, hN, view, 98765, false, 240), still = [lightStreaks([L], isWater, hN, view, 10, true, 240), lightStreaks([L], isWater, hN, view, 77777, true, 240)];
  ok(later.length === one.length && JSON.stringify(still[0]) === JSON.stringify(still[1]), "the same water tiles carry streaks at any time (the seed picks them, so every player sees the same tiles); under reduced motion even the pictures agree");
  const near = lightStreaks([{ ...L, x: L.x + 0.01 }], isWater, hN, view, 1234, false, 240);
  ok(near.length >= 1 && Math.abs(near.length - one.length) <= 2, "a lantern a hair's breadth away lights the same water");
  ok(lightStreaks([{ ...L, f: 0 }], isWater, hN, view, 1, false, 240).length === 0 && lightStreaks([L], isWater, hN, view, 1, false, 0).length === 0, "a light that is out, or a cap of 0 (governor level 0), gives no streaks");
  ok(lightStreaks([L], () => false, hN, view, 1, false, 240).length === 0 && lightStreaks([{ x: 5, y: 5, r: 3, f: 1 }], isWater, hN, view, 1, false, 240).every(s => isWater(Math.floor(s.x), Math.floor(s.y))), "none on land");
  const bright = (list) => Math.max(0, ...list.map(s => s.a));
  const wide = lightStreaks([{ x: shore.x, y: shore.y, r: 9, f: 1 }, { x: shore.x + 3, y: shore.y, r: 9, f: 1 }], isWater, hN, view, 1, false, 12);
  ok(wide.length === 12, "the cap is kept however many lights and water tiles there are (12 of 12 asked)");
  const first = lightStreaks([{ x: shore.x, y: shore.y, r: 9, f: 1 }, { x: shore.x + 9, y: shore.y, r: 9, f: 1 }], isWater, hN, view, 1, false, 12);
  ok(first.every(s => Math.hypot(s.x - shore.x, s.y - shore.y) < 9 * REACH + 0.3), "when the cap is reached the first light (the player's own) keeps its streaks");
  ok(bright(one) <= PEAK && bright(lightStreaks([{ ...L, f: 0.3 }], isWater, hN, view, 1, false, 240)) < bright(lightStreaks([{ ...L, f: 1 }], isWater, hN, view, 1, false, 240)), "a weaker flame (a flickering beacon) lays dimmer streaks");
  ok(lightStreaks([{ x: NaN, y: 3, r: 3, f: 1 }, { x: 3, y: Infinity, r: 3, f: 1 }, null, { x: 3, y: 3, r: -1, f: 1 }, { x: shore.x, y: shore.y, r: 2.9, f: NaN }], isWater, hN, view, 1, false, 240).length > 0, "lights with odd numbers are skipped without breaking the others");
  ok(lightStreaks("x", isWater, hN, view, 1, false, 9).length === 0, "something that is not a list of lights gives nothing");
  const bcn = lightStreaks([{ x: shore.x, y: shore.y, r: 9 * 0.8, f: 1.1 }], isWater, hN, view, 1, false, 240), lh = lightStreaks([{ x: shore.x, y: shore.y, r: 14 * 0.8 * 0.5, f: 0.5 }], isWater, hN, view, 1, false, 240);
  ok(bcn.length >= 3 * one.length && lh.length > 0 && bcn.every(s => s.a <= PEAK), `a lit beacon (radius 9) and a half-lit lighthouse lay streaks too (${bcn.length}, ${lh.length}), more for the wider light`);
  const coloured = lightStreaks([{ ...L, rgb: [90, 230, 165] }], isWater, hN, view, 1, false, 5);
  ok(coloured.every(s => s.rgb[1] === 230) && one.every(s => s.rgb === WARM), "a coloured lantern's streaks take its colour; a plain one's are warm");

  const cx = shore.x, v2 = { x0: Math.floor(cx) - 12, x1: Math.floor(cx) + 12, y0: Math.floor(shore.y) - 12, y1: Math.floor(shore.y) + 12 };
  const lowMoon = moonStreaks(0, cx, isWater, hN, v2, 1, false, 48), hiMoon = moonStreaks(3.5, cx, isWater, hN, v2, 1, false, 48);
  ok(moonAt(0).lit === 0 && lowMoon.length === 0, "a moon on the horizon (dusk, dawn) lays no path");
  ok(hiMoon.length >= 3 && hiMoon.every(s => s.rgb === MOON_RGB && s.a > 0 && s.a <= MOON_PEAK && Math.abs(s.x - cx) <= MOON_HALF + 0.4), `a high moon lays ${hiMoon.length} streaks in a column no wider than ${2 * MOON_HALF} tiles, all in moon colour`);
  ok(hiMoon.every(s => isWater(Math.floor(s.x), Math.floor(s.y))), "and all on water");
  ok(moonStreaks(3.5, cx, isWater, hN, v2, 1, false, 48, 1).reduce((p, s) => p + s.a, 0) < hiMoon.reduce((p, s) => p + s.a, 0) * 0.5, "mist and rain dim it");
  ok(moonStreaks(3.5, cx, isWater, hN, v2, 1, false, 5).length <= 5 && moonStreaks(3.5, cx, isWater, hN, v2, 1, false, 0).length === 0 && moonStreaks(3.5, NaN, isWater, hN, v2, 1, false, 9).length === 0, "the moon's share obeys its cap, and an odd column gives nothing");
  const inner = hiMoon.filter(s => Math.abs(s.x - cx) < 0.7 * MOON_HALF), outer = hiMoon.filter(s => Math.abs(s.x - cx) > 0.7 * MOON_HALF);
  const mean = (l) => l.reduce((p, s) => p + s.a, 0) / Math.max(1, l.length);
  ok(inner.length === 0 || outer.length === 0 || mean(inner) > mean(outer), "the path is brightest down its middle");
}
if (process.env.NODE_ONLY) { console.log(failures ? `\n${failures} check(s) FAILED` : "\nall node checks passed"); process.exit(failures ? 1 : 0); } // NODE_ONLY=1: the node checks alone (used to try each check against a broken module)

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


// ---- browser ----
let quiet = 5; while (shadeCount(world.seed, quiet) !== 0 || shadeCount(world.seed, quiet + 1) !== 0) quiet++;
const calm = `&shadeclock=${quiet * SLOT_MS + 5000 - Date.now()}`;
const q = (h, extra = "") => `?net=local&hour=${h}&weather=clear${calm}${extra}`;
const mk = async (ctxOpts = {}, ctx = null) => { const c = ctx || await browser.newContext({ viewport: { width: 700, height: 700 }, ...ctxOpts }); const p = await c.newPage(); watch(p, "page"); return p; };
async function enter(page, query, room) { await page.goto(`${base}${query}#room=${room}`); await page.click("#enter"); await waitFor(page, () => window.__longWatch.self().playing, null, 5000); await sleep(400); }
// A page that was in the background draws slowly and its governor may have stepped down; the tests that are not about the
// governor put it back to full and wait for a fresh picture before reading.
const gl = async (page, keepLevel = false) => { await page.bringToFront(); if (!keepLevel) await page.evaluate(() => window.__longWatch.setLevel(2)); await sleep(200); return page.evaluate(() => window.__longWatch.perf().glitter); };
async function teleportSynced(page, others, x, y) {
  if (!await page.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [x, y])) return false;
  for (const o of others) if (!await waitFor(o, ([x, y]) => window.__longWatch.peers().some(p => Math.hypot(p.x - x, p.y - y) < 0.05), [x, y], 6000)) return false;
  return true;
}
async function shoot(page, name) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  const keep = page.viewportSize();
  for (const [w, h] of [[375, 760], [1100, 800]]) { await page.setViewportSize({ width: w, height: h }); await sleep(500); await page.locator(".stage").screenshot({ path: path.join(shots, `${name}-${w}.png`) }); }
  await page.setViewportSize(keep); await sleep(200);
}
// Read the canvas: the pixels at the middle of each streak the page drew, against the water just above and below it
async function streakPixels(page) {
  return page.evaluate(() => {
    const c = document.getElementById("view"), g = c.getContext("2d"), W = c.width, H = c.height, d = g.getImageData(0, 0, W, H).data;
    const tile = (c.clientWidth < 520 ? 30 : 36) * (c.width / c.clientWidth), me = window.__longWatch.self(), st = window.__longWatch.perf().glitter;
    const px = (x, y) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return null; const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const lum = (r, g, b) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => (lum(...a) + 0.05) / (lum(...b) + 0.05); // above 1 where the streak is the brighter
    const out = [];
    for (const s of st.list) {
      const x = W / 2 + (s.x - me.x) * tile, y = H / 2 + (s.y - me.y) * tile;
      const mid = px(x, y), up = px(x, y - 0.3 * tile), dn = px(x, y + 0.3 * tile);
      if (mid && up && dn) out.push(ratio(mid, [(up[0] + dn[0]) / 2, (up[1] + dn[1]) / 2, (up[2] + dn[2]) / 2]));
    }
    out.sort((a, b) => a - b);
    return { n: out.length, median: out.length ? out[Math.floor(out.length / 2)] : 0, max: out.length ? out[out.length - 1] : 0 };
  });
}
async function measure(page) {
  return page.evaluate(() => {
    const c = document.getElementById("view"), g = c.getContext("2d"), W = c.width, H = c.height;
    const d = g.getImageData(0, 0, W, H).data, cx = W / 2, cy = H / 2;
    const px = (x, y) => { const i = (Math.round(y) * W + Math.round(x)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const lum = (r, g, b) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const ratio = (a, b) => { const la = lum(...a), lb = lum(...b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    const mean = (pts) => { const s = [0, 0, 0]; for (const p of pts) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return s.map(v => v / pts.length); };
    const tile = (c.clientWidth < 520 ? 30 : 36) * (c.width / c.clientWidth);
    const ring = (r0, r1, n = 48) => { const out = []; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; for (const r of [r0, (r0 + r1) / 2, r1]) { const x = cx + Math.cos(a) * r * tile, y = cy + Math.sin(a) * r * tile; if (x > 0 && y > 0 && x < W && y < H) out.push(px(x, y)); } } return out; };
    const lights = window.__longWatch.lights(), mine = lights.find(l => l.id === "me");
    // the player: the pixel in the avatar's box that differs most from the ground just around it
    const ground = mean(ring(0.85, 1.15)), box = [];
    for (let y = cy - 0.45 * tile; y <= cy + 0.3 * tile; y += 1) for (let x = cx - 0.3 * tile; x <= cx + 0.3 * tile; x += 1) box.push(px(x, y));
    const player = box.map(p => ({ p, r: ratio(p, ground) })).sort((a, b) => b.r - a.r)[0];
    // the lantern's pool against the dark just outside it
    const inside = mean(ring(1.4, mine.tiles * 0.55)), outside = mean(ring(mine.tiles + 1.2, mine.tiles + 2.2));
    // the path: the ground the player walks on, inside the pool, against the ground beyond the light (sand or grass is the path)
    // the bluest/greyest thing in the picture is the ground itself, so also report how far the dark layer's colour moved
    return { player: player.r, playerPx: player.p, ground, inside, outside, lantern: ratio(inside, outside), path: ratio(mean(ring(1.4, 2.2)), outside), tilePx: tile, lum: lum(...outside) };
  });
}

try {
  console.log("\n# two players: A stands inland, B at the shore; A sees the light on the water round B's lantern and none round its own");
  const A = await mk(), B = await mk({}, A.context());
  await enter(A, q(0), "gl1"); await enter(B, q(0), "gl1");
  ok(await waitFor(A, () => window.__longWatch.peers().length === 1, null, 8000) && await waitFor(B, () => window.__longWatch.peers().length === 1, null, 8000), "two players share a room");
  ok(await teleportSynced(A, [B], inland.x, inland.y) && await teleportSynced(B, [A], shore.x, shore.y), `A stands inland (${inland.x},${inland.y}) and B at the shore (${shore.x},${shore.y})`);
  await sleep(500);
  const ga = await gl(A), gb = await gl(B);
  const reachB = (await B.evaluate(() => window.__longWatch.lights())).find(l => l.id === "me").tiles;
  ok(ga.on && ga.shown > 0, `A draws ${ga.shown} streaks on water it can see`);
  const nearB = ga.list.filter(s => Math.hypot(s.x - shore.x, s.y - shore.y) < reachB * REACH + 0.3), nearA = ga.list.filter(s => Math.hypot(s.x - inland.x, s.y - inland.y) < 3.5);
  ok(nearB.length >= 3 && nearB.length === ga.shown, `all ${ga.shown} of them lie round B's lantern (${nearB.length} within ${(reachB * REACH).toFixed(1)} tiles of B)`);
  ok(nearA.length === 0, "and none round A's own lantern, which has no water near it");
  ok(gb.shown === ga.shown, `B, who stands at that lantern, draws the same number (${gb.shown})`);
  const keyOf = (l) => new Set(l.map(s => `${Math.floor(s.x)},${Math.floor(s.y)}`));
  const ka = keyOf(ga.list), kb = keyOf(gb.list);
  ok([...ka].every(k => kb.has(k)) && ka.size === kb.size, "on both pages the streaks lie on the same water tiles");
  ok((await A.evaluate(() => window.__longWatch.hud())).dropped === 0, "nothing was dropped or sent for it (no message kind exists for the light on the water)");
  // B leaves: A's streaks go
  await B.close(); await sleep(400);
  const gone = await waitFor(A, () => window.__longWatch.peers().length === 0, null, 15000);
  const after = await gl(A);
  ok(gone && after.shown === 0, `when B leaves, A draws no streaks there (${after.shown})`);
  await A.context().close();

  console.log("\n# a player wading in the shallows is not covered");
  {
    let wade = null;
    for (let y = 8; y < world.h - 8 && !wade; y++) for (let x = 8; x < world.w - 8 && !wade; x++) if (world.tiles[y * world.w + x] === T.SHALLOW && waterNear(x + 0.5, y + 0.5, 2.6).n >= 8) wade = { x: x + 0.5, y: y + 0.5 };
    const W1 = await mk(); await enter(W1, q(0), "glw");
    const moved = wade && await W1.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [wade.x, wade.y]);
    await sleep(500);
    const w = await gl(W1);
    ok(moved && w.shown > 0 && w.list.every(s => Math.abs(s.x - wade.x) >= 0.45 || Math.abs(s.y - wade.y) >= 0.45), `standing in the shallows at ${wade && wade.x},${wade && wade.y}, ${w.shown} streaks are drawn and none lies on the player`);
    await W1.context().close();
  }

  console.log("\n# the moon's path");
  const M = await mk(); await enter(M, q(3, ""), "glm");
  await M.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [shore.x, shore.y]); await sleep(500);
  const mid = await gl(M);
  ok(mid.moon > 0 && mid.shown >= mid.moon, `at midnight the moon lays ${mid.moon} glints on the sea in view (${mid.shown} streaks in all)`);
  const moonOnly = async (hour) => { // the moon's streaks are the ones in moon colour
    const P = await mk(); await enter(P, q(hour), "glm" + hour); await P.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [shore.x, shore.y]); await sleep(500);
    const r = await P.evaluate(() => { const st = window.__longWatch.perf().glitter, c = document.getElementById("view"); return { list: st.list.filter(s => s.rgb[0] === 214 && s.rgb[1] === 226), W: c.width, cw: c.clientWidth, moon: st.moon }; });
    await P.context().close(); return r;
  };
  const e1 = await moonOnly(1.5), e2 = await moonOnly(5.5), e0 = await moonOnly(0);
  const mx = (r) => r.list.reduce((p, s) => p + s.x, 0) / Math.max(1, r.list.length);
  ok(e0.list.length === 0, "with the moon on the horizon (dusk) there is no path");
  ok(e1.list.length > 0 && e2.list.length > 0 && mx(e2) - mx(e1) > 3, `the path follows the moon: mean column ${mx(e1).toFixed(1)} at hour 1.5 and ${mx(e2).toFixed(1)} at hour 5.5, the way the moon crosses the sky strip`);
  {
    const p = moonAt(3), c = await M.evaluate(() => { const c = document.getElementById("view"), dpr = c.width / c.clientWidth, tile = (c.clientWidth < 520 ? 30 : 36) * dpr; return { W: c.width, tile, dpr }; });
    const want = shore.x - c.W / 2 / c.tile + c.W * (0.12 + 0.76 * p.x) / c.tile;
    const list = (await M.evaluate(() => window.__longWatch.perf().glitter.list)).filter(s => s.rgb[0] === 214 && s.rgb[1] === 226);
    ok(list.length > 0 && list.every(s => Math.abs(s.x - want) <= MOON_HALF + 0.4), `at midnight the path lies under the moon's place in the sky strip (column ${want.toFixed(1)}, every glint within ${MOON_HALF + 0.4} tiles of it)`);
  }
  await M.context().close();

  console.log("\n# reduced motion keeps the light on the water still; normal motion lets it waver");
  {
    const rctx = await browser.newContext({ viewport: { width: 700, height: 700 }, reducedMotion: "reduce" });
    const R = await mk({}, rctx); await enter(R, q(3), "glr"); await R.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [shore.x, shore.y]); await sleep(500);
    const rs = []; for (let i = 0; i < 6; i++) { rs.push(JSON.stringify((await gl(R)).list)); await sleep(430); }
    const n = (await gl(R));
    ok(n.shown > 0 && rs.every(v => v === rs[0]), `with reduced motion ${n.shown} streaks (the moon's included) are exactly the same in 6 pictures over 2.6 s`);
    const N = await mk(); await enter(N, q(3), "gln"); await N.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [shore.x, shore.y]); await sleep(500);
    const ns = new Set(), ts = new Set(); for (let i = 0; i < 12; i++) { const l = (await gl(N)); ns.add(JSON.stringify(l.list)); ts.add(l.list.map(s => `${Math.floor(s.x)},${Math.floor(s.y)}`).join(";")); await sleep(310); }
    const sets = [...ts].map(x => new Set(x.split(";"))), uni = new Set([...ts].flatMap(x => x.split(";"))), small = Math.min(...sets.map(x => x.size));
    ok(ns.size >= 6 && uni.size <= small * 1.3, `with normal motion the streaks waver (${ns.size} different pictures in 12) but stay on the same water tiles (${uni.size} tiles in all, ${small} in the smallest picture: only the faintest edge ones come and go)`);
    await rctx.close();
  }

  console.log("\n# the governor and the switches");
  {
    const G = await mk(); await enter(G, q(3), "glg"); await G.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [shore.x, shore.y]); await sleep(400);
    const counts = [];
    for (const lv of [2, 1, 0]) { await G.evaluate((l) => window.__longWatch.setLevel(l), lv); await sleep(350); counts[lv] = (await gl(G, true)).shown; }
    ok(counts[2] > 0 && counts[2] <= STREAK_CAP[2] && counts[1] > 0 && counts[1] <= STREAK_CAP[1] && counts[0] === 0, `level 2 draws ${counts[2]} (at most ${STREAK_CAP[2]}), level 1 ${counts[1]} (at most ${STREAK_CAP[1]}), level 0 none`);
    await G.evaluate(() => window.__longWatch.setLevel(2)); await sleep(300);
    await G.evaluate(() => window.__longWatch.setGlitter(false)); await sleep(300);
    ok((await gl(G)).shown === 0 && !(await gl(G)).on, "switched off, nothing is drawn");
    await G.context().close();
    const off = await mk(); await enter(off, q(3, "&glitter=off"), "glo"); await off.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [shore.x, shore.y]); await sleep(400);
    ok(!(await gl(off)).on && (await gl(off)).shown === 0, "?glitter=off draws none");
    const pl = await mk(); await enter(pl, q(3, "&look=plain"), "glp"); await pl.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [shore.x, shore.y]); await sleep(400);
    ok((await gl(pl)).shown === 0, "the plain look draws none");
    await off.context().close(); await pl.context().close();
  }

  console.log("\n# players, the lantern's pool and paths keep their contrast with the light on the water (as the dawn test measures them)");
  const med = (reads, k) => reads.map(r => r[k]).sort((a, b) => a - b)[Math.floor(reads.length / 2)];
  const low = (reads, k) => Math.min(...reads.map(r => r[k])); // the player's contrast is read at its lowest: a firefly passing the avatar lifts single readings by up to 2 (the same with the streaks off)
  const settle = async (P) => { const reads = []; for (let i = 0; i < 7; i++) { reads.push(await measure(P)); await sleep(130); } return reads.slice(-5); };
  const cont = {};
  for (const [name, h] of [["dusk", 0], ["midnight", 3], ["dawn", 7]]) {
    const P = await mk(); await enter(P, q(h), "glc" + h);
    await P.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [shore.x, shore.y]); await sleep(600);
    const off = [], on = [];
    for (let round = 0; round < 3; round++) { // switch the streaks off and on in turn, so a firefly passing the player moves both sides alike
      await P.evaluate(() => window.__longWatch.setGlitter(false)); await sleep(250); off.push(...await settle(P));
      if (round === 0) await shoot(P, `glitter-${name}-off`);
      await P.evaluate(() => window.__longWatch.setGlitter(true)); await sleep(250); on.push(...await settle(P));
    }
    const sp = await streakPixels(P), st = await gl(P);
    await shoot(P, `glitter-${name}-on`);
    const spreadOf = (r, k) => Math.max(...r.map(x => x[k])) - Math.min(...r.map(x => x[k]));
    cont[name] = { off: { player: low(off, "player"), lantern: med(off, "lantern"), path: med(off, "path") }, on: { player: low(on, "player"), lantern: med(on, "lantern"), path: med(on, "path") }, sp, shown: st.shown, nearest: Math.min(99, ...st.list.map(q => Math.hypot(q.x - shore.x, q.y - shore.y))), ps: [spreadOf(off, "player"), spreadOf(on, "player")] };
    const c = cont[name];
    console.log(`     ${name.padEnd(9)} hour ${h}: player ${c.off.player.toFixed(2)} -> ${c.on.player.toFixed(2)}:1, lantern pool ${c.off.lantern.toFixed(2)} -> ${c.on.lantern.toFixed(2)}:1, path ${c.off.path.toFixed(2)} -> ${c.on.path.toFixed(2)}:1 (streaks off -> on); player readings spread ${cont[name].ps[0].toFixed(2)} off and ${cont[name].ps[1].toFixed(2)} on over ${off.length} each; ${st.shown} streaks, median streak over the water beside it ${sp.median.toFixed(2)}:1 (brightest ${sp.max.toFixed(2)}:1, ${sp.n} read)`);
    await P.context().close();
  }
  for (const n of ["dusk", "midnight", "dawn"]) {
    const c = cont[n];
    ok(c.shown > 0, `${n}: the shore shows streaks (${c.shown})`);
    ok(c.on.player >= 2 && c.on.player >= c.off.player * 0.75, `${n}: the player stands out by ${c.on.player.toFixed(2)}:1 at the lowest of 15 readings with the streaks (${c.off.player.toFixed(2)}:1 without; at least 2:1 and no less than 75% of it, because the lowest reading itself moves by about a fifth between runs with nothing changed; single readings are lifted by up to ${Math.max(...c.ps).toFixed(1)})`);
    ok(c.nearest >= 1.4, `${n}: no streak lies closer than 1.4 tiles to the player (nearest ${c.nearest.toFixed(2)}; the ring the contrast is read on is 1.15 tiles out)`);
    ok(c.on.lantern >= c.off.lantern * 0.95, `${n}: the lantern's pool against the dark beyond it is ${c.on.lantern.toFixed(2)}:1 with the streaks (${c.off.lantern.toFixed(2)}:1 without; no less than 95% of it)`);
    ok(c.on.path >= c.off.path * 0.95, `${n}: the path in the light against the ground in the dark is ${c.on.path.toFixed(2)}:1 with the streaks (${c.off.path.toFixed(2)}:1 without; no less than 95% of it)`);
    ok(c.sp.n >= 3 && c.sp.median >= 1.15, `${n}: the streaks themselves can be seen: the median streak is ${c.sp.median.toFixed(2)}:1 brighter than the water beside it (at least 1.15:1)`);
  }

  console.log("\n# frame cost (headless Chromium without a GPU: a rough guide only)");
  {
    const F = await mk(); await enter(F, q(3), "glf"); await F.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [shore.x, shore.y]); await sleep(500);
    const meanDraw = async () => { await sleep(1500); return F.evaluate(() => { const s = window.__longWatch.perf(); return { draw: s.drawMean, p95: s.drawP95 }; }); };
    const on = [], off = [];
    for (let i = 0; i < 3; i++) { await F.evaluate(() => window.__longWatch.setGlitter(true)); on.push(await meanDraw()); await F.evaluate(() => window.__longWatch.setGlitter(false)); off.push(await meanDraw()); }
    const m = (l, k) => l.reduce((p, s) => p + s[k], 0) / l.length;
    console.log(`     draw time per frame at a shore: ${m(on, "draw").toFixed(2)} ms with the streaks (p95 ${m(on, "p95").toFixed(2)}), ${m(off, "draw").toFixed(2)} ms without (p95 ${m(off, "p95").toFixed(2)})`);
    ok(m(on, "draw") - m(off, "draw") < 4, `the streaks add ${(m(on, "draw") - m(off, "draw")).toFixed(2)} ms to a frame's drawing here (limit 4 ms)`);
    await F.context().close();
  }
} finally {
  ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
  await browser.close(); server.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
