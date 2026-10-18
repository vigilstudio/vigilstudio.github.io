#!/usr/bin/env node
// Milestone 24 tests for The Long Watch: dawn and dusk (a look step). At the two ends of the night the whole map takes the
// sky's colour (a cool blue at dusk, a grey at dawn with longer shadows) and the sky strip's horizon line glows. It is a
// function of the night hour, which every browser reads from the same clock, so nothing is sent: the multiplayer checks
// are that two pages agree on it, that a shadow cast by a tree for another player's lantern is longer at dawn on both
// pages, that reduced motion holds the horizon still, and that players, lanterns and paths stay easy to see at both ends.
//
//   node game/tests/skyglow.test.mjs            node checks, then two pages on the local transport
//   SHOTS=/some/dir node ...                    also save screenshots (dusk, midnight, dawn; 375 and 1100 px)
//   CHROME=/path/to/headless_shell              use this browser binary
// Online play over the public relays is not tested here (nothing about dawn and dusk is sent).
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld, T, isBlocked } from "../js/world.js";
import { SLOT_MS, shadeCount } from "../js/shades.js";
import { HOURS, lightFor } from "../js/nightclock.js";
import { shadowOf } from "../js/shadows.js";
import { endsAt, glowAt, contrast, luminance, WASH, WASH_MIX, SHADOW_STRETCH, HORIZON } from "../js/skyglow.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const shots = process.env.SHOTS;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log("# dawn and dusk, in node");
const world = generateWorld();
{
  const e0 = endsAt(0), e7 = endsAt(7), e3 = endsAt(3.5);
  ok(e0.dusk === 1 && e0.dawn === 0 && e7.dawn === 1 && e7.dusk === 0, "dusk is full at hour 0 and dawn is full at hour 7, and each is absent at the other's hour");
  ok(e3.dusk === 0 && e3.dawn === 0 && glowAt(3.5, [3, 6, 18]).kind === "night" && glowAt(3.5, [3, 6, 18]).amount === 0, "in the middle of the night there is no dawn or dusk glow");
  let bad = 0, jump = 0, prev = null, ends = 0;
  for (let h = -9; h < 17; h += 0.01) {
    const g = glowAt(h, lightFor(h).tint);
    if (![g.amount, g.shadowLen, ...g.tint, ...g.horizon].every(Number.isFinite) || g.amount < 0 || g.amount > 1 || g.shadowLen < 1 || g.tint.some(v => v < 0 || v > 255)) bad++;
    if (g.amount > 0.5) ends++;
    if (prev) jump = Math.max(jump, Math.abs(g.amount - prev.amount), Math.abs(g.tint[2] - prev.tint[2]) / 255);
    prev = g;
  }
  ok(bad === 0 && ends > 50, "for every hour (also before 0 and past 8) the amounts and colours are finite and in range");
  ok(jump < 0.05, `the glow eases with the hour: the biggest change in 0.01 hour (3.6 s of the clock) is ${jump.toFixed(4)} (also across the turn from dawn to dusk)`);
  ok(Math.abs(endsAt(0.3).dusk - endsAt(8.3).dusk) < 1e-9 && Math.abs(endsAt(7.2).dawn - endsAt(-0.8).dawn) < 1e-9, "the hour wraps: 8.3 is 0.3 and -0.8 is 7.2");
  ok(endsAt(1.4).dusk === 0 && endsAt(5.8).dawn === 0 && endsAt(5.8).dusk === 0 && endsAt(7.7).dawn === 0, "dusk is gone by hour 1.4 and dawn does not start before hour 5.9 and is over by 7.65");
  const du = glowAt(0, lightFor(0).tint), da = glowAt(7, lightFor(7).tint);
  ok(du.tint[2] > du.tint[0] + 40 && du.tint[2] > du.tint[1] + 20, `at dusk the map's tint is a cool blue (${du.tint.join(",")})`);
  ok(Math.abs(da.tint[0] - da.tint[2]) < 40 && da.tint[0] > 70, `at dawn the tint is a grey (${da.tint.join(",")})`);
  ok(da.shadowLen > du.shadowLen && du.shadowLen > 1 && Math.abs(da.shadowLen - (1 + SHADOW_STRETCH.dawn)) < 1e-9, `shadows are longest at dawn (x${da.shadowLen.toFixed(2)}), longer at dusk (x${du.shadowLen.toFixed(2)}) and unchanged at night`);
  ok(da.horizon[3] > glowAt(3.5, [3, 6, 18]).horizon[3] + 0.4 && du.horizon[3] > 0.8, "the horizon line is bright at both ends and faint in the middle of the night");
  ok(JSON.stringify(glowAt(NaN, null)) === JSON.stringify(glowAt(3, [3, 6, 18])) && glowAt(Infinity, [1, 2]).kind === "night", "odd inputs fall back to the plain night");
  ok(WASH_MIX > 0 && WASH_MIX <= 1 && Object.keys(HORIZON).length === 3, "the constants are in range");
  ok(Math.abs(contrast([0, 0, 0], [255, 255, 255]) - 21) < 1e-9 && Math.abs(luminance(255, 255, 255) - 1) < 1e-9 && contrast([9, 9, 9], [9, 9, 9]) === 1, "the contrast ratio follows the web's definition (black on white is 21)");
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

// a clock inside a slot with no shades (a snuffed lantern would change the lights)
let quiet = 5; while (shadeCount(world.seed, quiet) !== 0 || shadeCount(world.seed, quiet + 1) !== 0) quiet++;
const calm = `&shadeclock=${quiet * SLOT_MS + 5000 - Date.now()}`;
const free = (x, y) => !isBlocked(world, x, y) && [T.SAND, T.GRASS, T.MEADOW].includes(world.tiles[Math.floor(y) * world.w + Math.floor(x)]);
// an open spot of ground with land all round (radius 4 tiles), where the lantern's pool and the ring beyond are all ground
const openSpot = (() => {
  const land = (x, y) => [T.SAND, T.GRASS, T.MEADOW].includes(world.tiles[y * world.w + x]);
  let best = null;
  for (let y = 6; y < world.h - 6; y++) for (let x = 6; x < world.w - 6; x++) {
    let n = 0, all = true;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { if (land(x + dx, y + dy)) n++; else if (Math.hypot(dx, dy) < 5) all = false; }
    if (all && (!best || n > best.n)) best = { x: x + 0.5, y: y + 0.5, n };
  }
  return best;
})();

// Read the canvas: the pixel colours that matter, as numbers (a page looks at itself; nothing is sent).
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
async function horizonRow(page) {
  return page.evaluate(() => {
    const c = document.getElementById("view"), g = c.getContext("2d"), dpr = c.width / c.clientWidth, bw = Math.min(150 * dpr, c.width * 0.36), x = c.width / 2, hor = Math.round(8 * dpr + 40 * dpr * 0.82);
    const d = g.getImageData(Math.round(x - bw * 0.3), hor, Math.round(bw * 0.6), 1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s;
  });
}
const mk = async (ctxOpts = {}, ctx = null) => { const c = ctx || await browser.newContext({ viewport: { width: 700, height: 700 }, ...ctxOpts }); const p = await c.newPage(); watch(p, "page"); return p; };
async function enter(page, query, room) { await page.goto(`${base}${query}#room=${room}`); await page.click("#enter"); await waitFor(page, () => window.__longWatch.self().playing, null, 5000); await sleep(500); }
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

try {
  ok(!!openSpot, `the island has an open spot of ground (${openSpot && openSpot.n} land tiles within 5) for the contrast checks`);
  const HOURS_SHOWN = [["dusk", 0], ["midnight", 3], ["dawn", 7]];
  console.log("\n# two players see the same glow, and nothing is sent for it");
  const A = await mk(), B = await mk({}, A.context());
  const q = (h) => `?net=local&hour=${h}&weather=clear${calm}`;
  await enter(A, q(0), "sg1"); await enter(B, q(0), "sg1");
  ok(await waitFor(A, () => window.__longWatch.peers().length === 1, null, 8000) && await waitFor(B, () => window.__longWatch.peers().length === 1, null, 8000), "two players share a room at dusk");
  await teleportSynced(A, [B], openSpot.x, openSpot.y); await teleportSynced(B, [A], openSpot.x + 1.5, openSpot.y); await sleep(500);
  const [ga, gb] = [(await A.evaluate(() => window.__longWatch.perf())).glow, (await B.evaluate(() => window.__longWatch.perf())).glow];
  ok(ga && gb && JSON.stringify(ga) === JSON.stringify(gb) && ga.kind === "dusk" && ga.amount === 1, `both pages draw the same dusk glow (${ga && ga.kind}, ${ga && ga.amount}, tint ${ga && ga.tint})`);
  const hud = await A.evaluate(() => window.__longWatch.hud());
  ok(hud.dropped === 0, "nothing was dropped or sent for it (no message kind exists for the glow)");
  ok(await A.evaluate((e) => JSON.stringify(window.__longWatch.light()) !== "" && Math.abs(window.__longWatch.light().hour - 0) < 1e-9, null), "the hour is pinned by ?hour= for this test");
  const pl = await mk(); await enter(pl, q(0) + "&look=plain", "sg2");
  ok((await pl.evaluate(() => window.__longWatch.perf())).glow === null, "the plain look draws no glow");
  await pl.close();

  console.log("\n# contrast of the player, the lantern and the path at both ends of the night (and midnight for comparison)");
  const res = {};
  for (const [name, h] of HOURS_SHOWN) {
    const P = await mk(); await enter(P, q(h), "sgc" + h);
    await teleportSynced(P, [], openSpot.x, openSpot.y); await sleep(700);
    // wait until the frame is settled (the camera and the fireflies move): read until two readings in a row agree on the path
    // ratio within 0.02 (at most 10 readings), then take the median of the last five
    const reads = []; let settled = false;
    for (let i = 0; i < 10 && !(settled && reads.length >= 5); i++) {
      reads.push(await measure(P)); await sleep(150);
      if (reads.length >= 2 && Math.abs(reads[reads.length - 1].path - reads[reads.length - 2].path) < 0.02) settled = true;
    }
    const last5 = reads.slice(-5), mid = last5[Math.floor(last5.length / 2)];
    const med = (k) => last5.map(r => r[k]).sort((a, b) => a - b)[Math.floor(last5.length / 2)];
    const spread = Math.max(...last5.map(r => r.path)) - Math.min(...last5.map(r => r.path));
    res[name] = { player: med("player"), lantern: med("lantern"), path: med("path"), outside: mid.outside.map(Math.round), inside: mid.inside.map(Math.round), spread, nReads: reads.length, glow: (await P.evaluate(() => window.__longWatch.perf())).glow };
    console.log(`     ${name.padEnd(9)} hour ${h}: player ${res[name].player.toFixed(2)}:1, lantern pool against the dark ${res[name].lantern.toFixed(2)}:1, path ${res[name].path.toFixed(2)}:1, dark beyond the light rgb(${res[name].outside}), tint ${res[name].glow.tint}; ${reads.length} readings, path spread ${spread.toFixed(3)}`);
    await shoot(P, `skyglow-${name}`);
    await P.context().close();
  }
  for (const n of ["dusk", "dawn"]) {
    const r = res[n], m = res.midnight;
    ok(r.player >= 3, `${n}: the player stands out from the ground round them by ${r.player.toFixed(2)}:1 (at least 3:1)`);
    ok(r.lantern >= 1.5 && r.lantern >= m.lantern * 0.95, `${n}: the lantern's pool against the dark beyond it is ${r.lantern.toFixed(2)}:1 (at least 1.5:1 and no less than midnight's ${m.lantern.toFixed(2)}:1)`);
    ok(r.path >= 1.4 && r.path >= m.path * 0.9, `${n}: the path (ground the player walks) in the light against the ground in the dark is ${r.path.toFixed(2)}:1 (at least 1.4:1, margin ${(r.path - 1.4).toFixed(3)}; within a tenth of midnight's ${m.path.toFixed(2)}:1; readings spread ${r.spread.toFixed(3)})`);
  }
  ok(res.dusk.glow.kind === "dusk" && res.dawn.glow.kind === "dawn" && res.midnight.glow.kind === "night", "the three pages drew dusk, dawn and plain night");
  ok(res.dusk.outside[2] > res.dusk.outside[0] + 10 && Math.abs(res.dawn.outside[0] - res.dawn.outside[2]) < 25 && res.dawn.outside[0] > res.midnight.outside[0] + 10, `the dark beyond the light is bluer at dusk (rgb ${res.dusk.outside}) and a lighter grey at dawn (${res.dawn.outside}) than at midnight (${res.midnight.outside})`);

  console.log("\n# shadows are longer at dawn, on both pages");
  let pick = null;
  for (let y = 4; y < world.h - 4 && !pick; y++) for (let x = 12; x < world.w - 4 && !pick; x++) {
    if (world.tiles[y * world.w + x] !== T.TREE) continue;
    const a = { x: x + 0.5 - 2, y: y + 0.78 }, b = { x: x + 0.5 - 7, y: y + 0.78 };
    if (free(a.x, a.y) && free(b.x, b.y) && free(a.x, a.y + 1) && free(a.x - 1, a.y)) pick = { x: x + 0.5, y: y + 0.78, a, b };
  }
  ok(!!pick, "the island has a tree with open ground two and seven tiles west of it");
  const lens = {};
  for (const [name, h] of HOURS_SHOWN) {
    const X = await mk(), Y = await mk({}, X.context());
    await enter(X, q(h), "sgs" + h); await enter(Y, q(h), "sgs" + h);
    await waitFor(X, () => window.__longWatch.peers().length === 1, null, 8000); await waitFor(Y, () => window.__longWatch.peers().length === 1, null, 8000);
    await teleportSynced(Y, [X], pick.b.x, pick.b.y); await teleportSynced(X, [Y], pick.a.x, pick.a.y); await sleep(500);
    const find = (st) => st.shadowList.find(s => Math.abs(s.x - pick.x) < 0.01 && Math.abs(s.y - pick.y) < 0.01);
    await waitFor(Y, ([x, y]) => window.__longWatch.perf().shadowList.some(s => Math.abs(s.x - x) < 0.01 && Math.abs(s.y - y) < 0.01), [pick.x, pick.y], 5000);
    const sx = find(await X.evaluate(() => window.__longWatch.perf())), sy = find(await Y.evaluate(() => window.__longWatch.perf()));
    lens[name] = { x: sx && sx.len, y: sy && sy.len };
    await X.context().close();
  }
  console.log(`     the tree's shadow length: dusk ${lens.dusk.x && lens.dusk.x.toFixed(2)}, midnight ${lens.midnight.x && lens.midnight.x.toFixed(2)}, dawn ${lens.dawn.x && lens.dawn.x.toFixed(2)} tiles`);
  const want = (h) => { const lt = lightFor(h), g = glowAt(h, lt.tint); return shadowOf(pick.x, pick.y, "tree", [{ x: pick.a.x, y: pick.a.y, r: lt.reach, f: 1 }]).len * g.shadowLen; };
  ok(lens.dawn.x && lens.dusk.x && lens.midnight.x && Math.abs(lens.dawn.x - want(7)) < 0.03 && Math.abs(lens.dusk.x - want(0)) < 0.03 && Math.abs(lens.midnight.x - want(3)) < 0.03, `the shadow is stretched as the rules say (dusk ${lens.dusk.x.toFixed(2)} for ${want(0).toFixed(2)}, midnight ${lens.midnight.x.toFixed(2)} for ${want(3).toFixed(2)}, dawn ${lens.dawn.x.toFixed(2)} for ${want(7).toFixed(2)} tiles); the same lantern light would give ${(shadowOf(pick.x, pick.y, "tree", [{ x: pick.a.x, y: pick.a.y, r: lightFor(7).reach, f: 1 }]).len).toFixed(2)} at dawn without it`);
  ok(["dusk", "midnight", "dawn"].every(n => Math.abs(lens[n].x - lens[n].y) < 0.05), "and both pages draw it at the same length (B's own lantern does not reach the tree)");

  console.log("\n# reduced motion keeps the horizon still");
  const rctx = await browser.newContext({ viewport: { width: 700, height: 700 }, reducedMotion: "reduce" });
  const R = await mk({}, rctx); await enter(R, q(7), "sgr");
  const rs = []; for (let i = 0; i < 6; i++) { rs.push(await horizonRow(R)); await sleep(430); }
  ok(rs[0] > 0 && rs.every(v => v === rs[0]), `with reduced motion the horizon line is the same in 6 pictures over 2.6 s (${rs[0]})`);
  const g1 = (await R.evaluate(() => window.__longWatch.perf())).glow;
  ok(g1 && g1.kind === "dawn" && g1.amount === 1, "and it is still dawn there");
  const N = await mk(); await enter(N, q(7), "sgn");
  const ns = new Set(); for (let i = 0; i < 12; i++) { ns.add(await horizonRow(N)); await sleep(310); }
  ok(ns.size >= 2, `with normal motion the horizon line gently shimmers (${ns.size} different pictures in 12 over 3.7 s)`);
  await rctx.close();
  await A.context().close();
} finally {
  ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
  await browser.close(); server.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
