#!/usr/bin/env node
// Milestone 11 tests for The Long Watch: weather (mist and rain) and the shades' sky. Both are pure functions of the
// seed and the UTC clock, drawn by each browser alone, so nothing is sent. The multiplayer checks are therefore that
// two pages agree on the weather and on the darkness of the sky without a message, that the shade wave the sky shows is
// the wave on the ground, and that reduced motion, the plain look and the lowest level draw the right amount.
//
//   node game/tests/weather.test.mjs            node checks, then two pages on the local transport
//   SHOTS=/some/dir node ...                    also save screenshots (clear, mist, rain, a shade wave; 375 and 1100 px)
//   CHROME=/path/to/headless_shell              use this browser binary
// Online play over the public relays is not tested here.
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateWorld, isBlocked } from "../js/world.js";
import { shadeCount, shadeAt, shadePlan, SLOT_MS, SLOT_S, SPEED } from "../js/shades.js";
import { weatherAt, slotWeather, pickWeather, shadeSkyAt, skyAt, rainDrops, mistBanks, WEATHER_SLOT_MS, BLEND_MS, RAIN_DROPS, MIST_BLOBS, nameAlpha, shadePaceAt, MIST_NAME_TILES, MIST_NAME_FADE, MIST_NAME_MIN, RAIN_SHADE_SLOW } from "../js/weather.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const shots = process.env.SHOTS;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log("# weather and the shades' sky, in node");
const world = generateWorld(), SEED = world.seed;
{
  const kinds = { clear: 0, mist: 0, rain: 0 };
  for (let s = 0; s < 4000; s++) { const w = slotWeather(SEED, s); kinds[w.rain > 0 ? "rain" : w.mist > 0 ? "mist" : "clear"]++; }
  ok(kinds.clear > 1500 && kinds.mist > 900 && kinds.rain > 800, `weather varies: of 4000 slots ${kinds.clear} clear, ${kinds.mist} misty, ${kinds.rain} rainy`);
  const a = JSON.stringify(weatherAt(SEED, 1.7e12)), b = JSON.stringify(weatherAt(SEED, 1.7e12));
  ok(a === b && JSON.stringify(weatherAt(SEED + 1, 1.7e12)) !== a, "the weather is a pure function of seed and clock");
  let bad = 0, jump = 0, prev = weatherAt(SEED, 1.7e12);
  for (let ms = 1.7e12; ms < 1.7e12 + 30 * WEATHER_SLOT_MS; ms += 1000) {
    const w = weatherAt(SEED, ms);
    if (!(w.mist >= 0 && w.mist <= 1 && w.rain >= 0 && w.rain <= 1) || !Number.isFinite(w.mist + w.rain)) bad++;
    jump = Math.max(jump, Math.abs(w.mist - prev.mist), Math.abs(w.rain - prev.rain)); prev = w;
  }
  ok(bad === 0, "mist and rain always stay between 0 and 1");
  ok(jump < 0.08, `the weather eases from one slot to the next: the biggest change in one second is ${jump.toFixed(3)} (the blend lasts ${BLEND_MS / 1000} s)`);
  ok(weatherAt(SEED, -5e11).kind !== undefined && weatherAt(SEED, 0).slot === 0, "odd clocks (before 1970) still give a weather");
  ok(pickWeather("?weather=rain").kind === "rain" && pickWeather("?weather=mist").rain === 0 && pickWeather("?weather=clear").mist === 0 && pickWeather("?weather=storm") === null && pickWeather("") === null && pickWeather("?weather=") === null, "?weather= takes clear, mist or rain and ignores anything else");
  const d = rainDrops(72, 12345, 1, false);
  ok(d.length === 72 && d.every(q => q.x >= 0 && q.x < 1 && q.y >= 0 && q.y < 1) && JSON.stringify(d) === JSON.stringify(rainDrops(72, 12345, 1, false)), "72 drops, all inside the screen, the same for the same moment");
  ok(JSON.stringify(rainDrops(72, 99999, 1, false)) !== JSON.stringify(d), "the drops fall as time goes");
  ok(rainDrops(72, 1, 1, true).length === 0 && rainDrops(72, 1, 0, false).length === 0 && rainDrops(0, 1, 1, false).length === 0, "no drops under reduced motion, with no rain, or at the lowest level");
  ok(rainDrops(72, 1, 0.5, false).length === 36, "light rain draws half the drops");
  ok(RAIN_DROPS[0] === 0 && RAIN_DROPS[2] > RAIN_DROPS[1] && MIST_BLOBS[0] === 0 && MIST_BLOBS[2] > MIST_BLOBS[1], "the governor's levels draw fewer drops and banks, and none at the lowest level");
  const m0 = JSON.stringify(mistBanks(5, 0, true)), m1 = JSON.stringify(mistBanks(5, 500000, true)), m2 = JSON.stringify(mistBanks(5, 500000, false));
  ok(m0 === m1 && m2 !== m0 && mistBanks(5, 1e7, false).every(q => q.x >= 0 && q.x < 1), "the mist banks stand still under reduced motion and drift (and wrap) otherwise");
  // shade sky
  let quiet = 5; while (shadeCount(SEED, quiet) !== 0) quiet++;
  ok(shadeSkyAt(world, quiet * SLOT_MS + 30000).dark === 0 && shadeSkyAt(world, quiet * SLOT_MS + 30000).out === 0, "a quiet slot leaves the sky untouched");
  let busy = 5; while (shadeCount(SEED, busy) < 3) busy++;
  let peak = 0, peakOut = 0, early = 1;
  for (let u = 0; u < 160; u += 1) { const s = shadeSkyAt(world, busy * SLOT_MS + u * 1000); peak = Math.max(peak, s.dark); peakOut = Math.max(peakOut, s.out); if (u === 0) early = s.dark; }
  ok(peak > 0.5 && peak <= 1 && peakOut >= 3 && early < 0.2, `a wave of ${shadeCount(SEED, busy)} shades darkens the sky (peak ${peak.toFixed(2)} with ${peakOut} out), from nothing at the start of the slot`);

  // milestone 25: names fade in mist, shades slow in rain (both from the same weather)
  ok(MIST_NAME_TILES === 6 && RAIN_SHADE_SLOW === 0.2, `the two numbers are ${MIST_NAME_TILES} tiles and ${RAIN_SHADE_SLOW * 100}% slower`);
  ok(nameAlpha(0.8, 3) === 1 && nameAlpha(0.8, MIST_NAME_TILES) === 1 && nameAlpha(0.8, MIST_NAME_TILES + MIST_NAME_FADE) === 0 && nameAlpha(0.8, 40) === 0, "in mist a name inside the range stays solid and fades to nothing past it");
  ok(nameAlpha(0, 40) === 1 && nameAlpha(0.1, 40) === 1 && nameAlpha(MIST_NAME_MIN, 40) === 0, "in clear weather names never fade");
  { let mono = true, prevA = 1; for (let d = 0; d < 20; d += 0.25) { const a = nameAlpha(0.6, d); if (a > prevA + 1e-12 || a < 0 || a > 1) mono = false; prevA = a; } ok(mono, "a name only gets fainter with distance, between 0 and 1"); }
  ok(nameAlpha(NaN, 3) === 1 && nameAlpha(0.8, NaN) === 1, "odd numbers leave the name solid");
  ok(shadePaceAt(SEED, 5, { kind: "rain" }) === 0.8 && shadePaceAt(SEED, 5, { kind: "mist" }) === 1 && shadePaceAt(SEED, 5, { kind: "clear" }) === 1, "pinned rain slows shades by a fifth; mist and clear do not");
  { let n = 0, same = 0, rainy = 0; for (let sl = 0; sl < 3000; sl++) { const a = shadePaceAt(SEED, sl), b = shadePaceAt(SEED, sl); n++; if (a === b) same++; if (a < 1) rainy++; } ok(same === n && rainy > 200 && rainy < 1500, `the pace of a slot is a pure function of seed and slot (${rainy} of ${n} slots are rainy at their start)`); }
  { let busy2 = 5; while (shadeCount(SEED, busy2) < 1) busy2++;
    const k0 = 0, slow = shadePlan(world, busy2, k0, 0.8), fast = shadePlan(world, busy2, k0);
    ok(Math.abs(slow.t1 * 0.8 - fast.t1) < 1e-9 && slow.speed === SPEED * 0.8 && fast.speed === SPEED, "in rain a shade takes a quarter longer to arrive (a fifth less speed)");
    let ok2 = true, maxStep = 0, leaveRatio = 0;
    for (let sl = 5; sl < 400; sl++) for (let k = 0; k < shadeCount(SEED, sl); k++) {
      const pl = shadePlan(world, sl, k, 0.8); if (pl.delay + pl.life > SLOT_S) ok2 = false;
      let prev = null; for (let u = pl.delay; u < pl.delay + pl.life; u += 0.5) { const sh = shadeAt(world, sl * SLOT_MS + u * 1000, k, 0.8); if (!sh) continue; if (prev && sh.phase !== "linger" && prev.phase === sh.phase) maxStep = Math.max(maxStep, Math.hypot(sh.x - prev.x, sh.y - prev.y) / 0.5); prev = sh; }
    }
    ok(ok2, "a slowed shade always leaves inside its own slot");
    ok(maxStep <= SPEED * 0.8 + 1e-6, `in rain no shade travels faster than ${(SPEED * 0.8).toFixed(2)} tiles a second while approaching or leaving (fastest seen ${maxStep.toFixed(3)})`);
    const dry = shadeAt(world, busy2 * SLOT_MS + (fast.delay + fast.t1 + 60) * 1000, k0), wet = shadeAt(world, busy2 * SLOT_MS + (slow.delay + slow.t1 + 60) * 1000, k0, 0.8);
    ok(dry && wet && dry.phase === "leave" && wet.phase === "leave" && Math.abs(Math.hypot(wet.x - slow.ex, wet.y - slow.ey) - 0.8 * Math.hypot(dry.x - fast.ex, dry.y - fast.ey)) < 1e-6, "60 s after arriving, a leaving shade in rain has gone four fifths as far from its circle as a dry one");
  }
  let rainySlot = 5; while (shadeCount(SEED, rainySlot) < 3) rainySlot++;
  { const a = shadeSkyAt(world, rainySlot * SLOT_MS + 40000, { kind: "rain" }), b = shadeSkyAt(world, rainySlot * SLOT_MS + 40000, { kind: "clear" }); ok(a.dark >= 0 && a.dark <= 1 && Number.isFinite(b.dark), "the shades' sky takes the pinned weather and stays in range"); }
  const sk = skyAt(world, busy * SLOT_MS + 60000, { mist: 0.2, rain: 0.1, kind: "rain" });
  ok(sk.kind === "rain" && sk.mist === 0.2 && sk.shades === shadeSkyAt(world, busy * SLOT_MS + 60000).dark && skyAt(world, 1e12).kind !== undefined, "the sky joins the weather (pinned or from the clock) and the shades' darkness");
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
const mk = async (opts = {}, ctx = null) => { const c = ctx || await browser.newContext({ viewport: { width: 700, height: 700 }, ...opts }); const p = await c.newPage(); watch(p, "page"); return p; };
async function enter(page, query, room) { await page.goto(`${base}${query}#room=${room}`); await page.click("#enter"); await waitFor(page, () => window.__longWatch.self().playing, null, 5000); await sleep(500); }

try {
  console.log("\n# pinned weather draws what it says, in the browser");
  // Rooms are reached through a fresh local relay each page set; every page uses the local transport.
  const clock = (slot, into) => `&shadeclock=${slot * SLOT_MS + into * 1000 - Date.now()}`;
  let quiet = 5; while (shadeCount(SEED, quiet) !== 0 || shadeCount(SEED, quiet + 1) !== 0) quiet++; // the clock sits in a slot with no shades
  const calm = clock(quiet, 5);
  const A = await mk(), B = await mk({}, A.context()); // one browser context, so the local transport joins them
  await enter(A, `?net=local&hour=3&weather=rain${calm}`, "wx1"); await enter(B, `?net=local&hour=3&weather=rain${calm}`, "wx1");
  ok(await waitFor(A, () => window.__longWatch.peers().length === 1, null, 8000) && await waitFor(B, () => window.__longWatch.peers().length === 1, null, 8000), "two players share a room");
  const [pa, pb] = [await perf(A), await perf(B)];
  ok(pa.drops === 58 && pb.drops === 58 && pa.mistBanks === 5 && pb.mistBanks === 5, `both pages draw the rain (${pa.drops} drops) and the mist (${pa.mistBanks} banks)`);
  const [sa, sb] = [await A.evaluate(() => window.__longWatch.sky()), await B.evaluate(() => window.__longWatch.sky())];
  ok(JSON.stringify(sa) === JSON.stringify(sb) && sa.kind === "rain" && sa.shades === 0, "both pages agree on the sky");
  await shoot(A, "weather-rain");
  // unpinned: both pages work out the same weather from the clock alone, and nothing is sent for it
  const U1 = await mk(), U2 = await mk({}, U1.context());
  await enter(U1, `?net=local&hour=3${calm}`, "wx2"); await enter(U2, `?net=local&hour=3${calm}`, "wx2");
  const [u1, u2] = [await U1.evaluate(() => window.__longWatch.sky()), await U2.evaluate(() => window.__longWatch.sky())];
  const want = weatherAt(SEED, Date.now() - 0 + (quiet * SLOT_MS + 5000 - Date.now()));
  ok(u1.kind === u2.kind && Math.abs(u1.mist - u2.mist) < 0.01 && Math.abs(u1.rain - u2.rain) < 0.01 && Math.abs(u1.mist - want.mist) < 0.02, `unpinned, two pages get the same weather from the clock (${u1.kind}) and match the rules`);
  const stats = (await U1.evaluate(() => window.__longWatch.hud()));
  ok(stats.dropped === 0, "nothing was dropped or sent for the weather");

  console.log("\n# mist");
  const M = await mk();
  await enter(M, `?net=local&hour=3&weather=mist${calm}`, "wx3");
  const pm = await perf(M);
  ok(pm.drops === 0 && pm.mistBanks === 5, `mist alone: banks drift (${pm.mistBanks}), no rain drops (${pm.drops})`);
  await shoot(M, "weather-mist");
  const C = await mk();
  await enter(C, `?net=local&hour=3&weather=clear${calm}`, "wx4");
  const pc = await perf(C);
  ok(pc.drops === 0 && pc.mistBanks === 0, "clear weather draws neither");

  console.log("\n# governor, plain look, reduced motion");
  await M.evaluate(() => window.__longWatch.setLevel(1)); await sleep(300);
  await A.evaluate(() => window.__longWatch.setLevel(1)); await sleep(300);
  ok((await perf(A)).drops === 29 && (await perf(A)).mistBanks === 3, "level 1 draws half the drops (29 of the 58) and 3 banks");
  await A.evaluate(() => window.__longWatch.setLevel(0)); await sleep(300);
  const p0 = await perf(A);
  ok(p0.drops === 0 && p0.mistBanks === 0, "level 0 draws only the thin flat veil: no drops, no banks");
  const P = await mk();
  await enter(P, `?net=local&hour=3&weather=rain&look=plain${calm}`, "wx5");
  const pp = await perf(P);
  ok(pp.drops === 0 && pp.mistBanks === 0, "the plain look draws no weather");
  const R = await mk({ reducedMotion: "reduce" });
  await enter(R, `?net=local&hour=3&weather=rain${calm}`, "wx6");
  const pr = await perf(R);
  ok(pr.drops === 0 && pr.mistBanks === 5, "reduced motion: no falling drops, the mist stays but stands still");
  const sum = async (pg) => pg.evaluate(() => { const c = document.getElementById("view"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7; return s; });
  const s1 = await sum(R); await sleep(700); const s2 = await sum(R); await sleep(700); const s3 = await sum(R);
  ok(s1 === s2 && s2 === s3 || (Math.abs(s1 - s2) / s1 < 0.002 && Math.abs(s2 - s3) / s2 < 0.002), "reduced motion: the picture does not move (to within the fireflies and the lantern's own light)");
  ok(await R.evaluate(() => { const l = window.__longWatch.light(); return l.reach > 0; }) && (await perf(R)).fps !== undefined, "the lantern keeps its reach in the rain");

  console.log("\n# the shades' sky");
  let busy = 5; while (shadeCount(SEED, busy) < 3 || shadeCount(SEED, busy - 1) !== 0) busy++;
  const S = await mk();
  const nearPeak = (() => { // the moment of this slot with the most shades out
    let best = 0, at = 0; for (let u = 0; u < 160; u += 2) { const d = shadeSkyAt(world, busy * SLOT_MS + u * 1000).dark; if (d > best) { best = d; at = u; } } return { best, at };
  })();
  await enter(S, `?net=local&hour=3&weather=clear${clock(busy - 1, 150)}`, "wx7");
  const before = await S.evaluate(() => window.__longWatch.sky());
  ok(before.shades === 0 && before.shadesOut === 0, "before the wave the sky is untouched");
  const S2 = await mk();
  await enter(S2, `?net=local&hour=3&weather=clear${clock(busy, nearPeak.at)}`, "wx8");
  const during = await S2.evaluate(() => window.__longWatch.sky());
  ok(Math.abs(during.shades - nearPeak.best) < 0.05 && during.shades > 0.5, `during the wave the sky darkens (${during.shades.toFixed(2)}, the rules say ${nearPeak.best.toFixed(2)}) with ${during.shadesOut} shades out`);
  const onGround = await S2.evaluate(() => window.__longWatch.shades() ? window.__longWatch.shades().list.filter(s => s.alpha > 0.2).length : -1);
  ok(onGround >= 1, "the shades on the ground are the shades the sky shows");
  await shoot(S2, "weather-shades");
  const sky0 = await S.evaluate(() => { const c = document.getElementById("view"), dpr = c.width / c.clientWidth, d = c.getContext("2d").getImageData(Math.round(c.width / 2 - 60 * dpr), Math.round(14 * dpr), Math.round(120 * dpr), Math.round(20 * dpr)).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4); });
  const sky1 = await S2.evaluate(() => { const c = document.getElementById("view"), dpr = c.width / c.clientWidth, d = c.getContext("2d").getImageData(Math.round(c.width / 2 - 60 * dpr), Math.round(14 * dpr), Math.round(120 * dpr), Math.round(20 * dpr)).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4); });
  ok(sky1 < sky0 * 0.9, `the sky strip is darker during the wave (mean brightness ${sky1.toFixed(1)} against ${sky0.toFixed(1)})`);

  console.log("\n# milestone 25: names in mist, shades in rain, on two pages");
  { // two good spots, 3 tiles and about 11 tiles from a first one
    const walk = (x, y) => !isBlocked(world, x, y) && !isBlocked(world, x + 0.5, y) && !isBlocked(world, x, y + 0.5);
    let o = null; for (let x = 40; x < 90 && !o; x++) for (let y = 40; y < 90 && !o; y++) if (walk(x + 0.5, y + 0.5) && walk(x + 3.5, y + 0.5) && walk(x + 11.5, y + 0.5)) o = { x: x + 0.5, y: y + 0.5 };
    ok(!!o, "found open ground for the distance test");
    const place = async (pg, x, y) => pg.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [x, y]);
    const names = async (pg) => (await perf(pg)).names;
    const room = async (weather, id) => { const a = await mk(), b = await mk({}, a.context()); await enter(a, `?net=local&hour=3&weather=${weather}${calm}`, id); await enter(b, `?net=local&hour=3&weather=${weather}${calm}`, id); await waitFor(a, () => window.__longWatch.peers().length === 1, null, 8000); await waitFor(b, () => window.__longWatch.peers().length === 1, null, 8000); return [a, b]; };
    const where = async (a, b, ax, bx) => { await place(a, ax, o.y); await place(b, bx, o.y); await sleep(1500); };
    const alphaOf = async (pg, ox) => { for (let i = 0; i < 40; i++) { const n = await names(pg); if (n.length === 1 && Math.abs(n[0].x - ox) < 0.2) return n[0].alpha; await sleep(100); } const n = await names(pg); return n.length ? n[0].alpha : null; };
    const [a, b] = await room("mist", "wx9");
    await where(a, b, o.x, o.x + 3);
    const [near1, near2] = [await alphaOf(a, o.x + 3), await alphaOf(b, o.x)];
    ok(near1 === 1 && near2 === 1, `in mist, a player 3 tiles away keeps a solid name on both pages (${near1}, ${near2})`);
    await where(a, b, o.x, o.x + 11);
    const [far1, far2] = [await alphaOf(a, o.x + 11), await alphaOf(b, o.x)];
    ok(far1 === 0 && far2 === 0, `in mist, two players 11 tiles apart (more than ${MIST_NAME_TILES}) each lose the other's name, the same on both pages (${far1}, ${far2})`);
    const pl = [await a.evaluate(() => window.__longWatch.peers()), await b.evaluate(() => window.__longWatch.peers())];
    ok(pl[0].length === 1 && pl[1].length === 1 && Math.abs(pl[0][0].x - (o.x + 11)) < 0.3, "the far player is still known and still on the minimap's list (only the name is gone)");
    ok(await a.evaluate(() => { const c = document.getElementById("minimap"); return !!c && c.width > 0; }), "the minimap is still drawn");
    await shoot(a, "weather-mist-names");
    await where(a, b, o.x, o.x + 7);
    const mid = await alphaOf(a, o.x + 7);
    ok(mid > 0.3 && mid < 0.7, `partway (7 tiles, ${MIST_NAME_TILES} + half of ${MIST_NAME_FADE}) the name is about half faded (${mid})`);
    const [c, d] = await room("clear", "wx10"); await where(c, d, o.x, o.x + 11);
    ok(await alphaOf(c, o.x + 11) === 1 && await alphaOf(d, o.x) === 1, "in clear weather a name 11 tiles away stays solid");
    const [e, f] = await room("rain", "wx11"); await where(e, f, o.x, o.x + 11);
    ok(await alphaOf(e, o.x + 11) === 0, "rain brings mist, so far names fade in rain too");
    const txt = await a.evaluate(() => document.getElementById("weatherrule").textContent);
    ok(txt.includes(`${MIST_NAME_TILES} tiles`) && txt.includes(`${Math.round(RAIN_SHADE_SLOW * 100)}% slower`), `the page states both numbers from the constants: "${txt.slice(0, 120)}..."`);
  }
  { // rain: both browsers draw the shades where the rules put them at the slower pace, and a dry page at the usual pace
    let sl = 5; while (shadeCount(SEED, sl) < 2 || shadeCount(SEED, sl - 1) !== 0) sl++;
    const at = Math.ceil(shadePlan(world, sl, 0).delay + shadePlan(world, sl, 0, 0.8).t1 + 20); // whole seconds: ?shadeclock= takes a whole number of ms
    const mkp = async (weather, id) => { const a = await mk(), b = await mk({}, a.context()); const q = `?net=local&hour=3&weather=${weather}${clock(sl, at)}`; await enter(a, q, id); await enter(b, q, id); return [a, b]; };
    const grab = (pg) => pg.evaluate(() => { const w = window.__longWatch; return { now: w.shadeNow(), list: w.shades().list.map(s => ({ k: s.k, x: s.x, y: s.y })) }; });
    const [ra, rb] = await mkp("rain", "wx12"), [da] = await mkp("clear", "wx13");
    const [ga, gb, gd] = [await grab(ra), await grab(rb), await grab(da)];
    const near = (g, pace) => g.list.length > 0 && g.list.every(s => { const w = shadeAt(world, g.now, s.k, pace); return w && Math.hypot(w.x - s.x, w.y - s.y) < 0.6; });
    ok(ga.list.length >= 1 && gb.list.length === ga.list.length, `in rain both pages show the same ${ga.list.length} shades (${gb.list.length} on the second; clock ${((ga.now - sl * SLOT_MS) / 1000).toFixed(1)} s into slot ${sl}, ${shadeCount(SEED, sl)} due)`);
    ok(near(ga, 0.8) && near(gb, 0.8), "in rain both pages draw each shade where the rules put it at four fifths of the usual pace");
    ok(near(gd, 1) && !near(gd, 0.8), "with clear weather the same moment shows the shades at the usual pace");
    // compare the two shades at one and the same moment (the dry page's clock was read a little later than the rainy one's)
    const dryAt = shadeAt(world, ga.now, ga.list[0].k, 1), d2 = dryAt ? Math.hypot(ga.list[0].x - dryAt.x, ga.list[0].y - dryAt.y) : 0;
    ok(d2 > 1, `so the rainy shade has not come as far (${d2.toFixed(1)} tiles behind the dry one at the same moment, 20 s after arriving; the pages' clocks read ${((gd.now - ga.now) / 1000).toFixed(1)} s apart)`);
  }
} finally {
  ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`);
  await browser.close(); server.close();
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
