#!/usr/bin/env node
// Milestone 14 tests for The Long Watch: the long watch kept (all four beacons lit light the ruined lighthouse).
//
//   node game/tests/watch.test.mjs            node checks, local transport, then real Trystero/WebRTC via a local Nostr relay
//   node game/tests/watch.test.mjs --local    skip the WebRTC part
//
// Part 0 (node): the rule (every beacon lit, none missing), the beam easing, the pure shade rule over thousands of real
// shade paths (nothing ever inside the beam once it is full; a shade making for the lighthouse fades; no sudden jump as
// the beam grows), the "safe inside the beam" rule, and that the module sends nothing. Then pages: three of four beacons
// do not light it; the fourth does, on every page, a bystander near the lighthouse sees the ground lit, a shade circling
// the lighthouse fades and a shade passing near it stays out at the beam's edge, the same place on both pages; a late
// joiner (asking for reduced motion) sees it at once; when everyone has left a new player finds it dark.
// SHOTS=dir saves before and after screenshots at 375 and 1100 px wide.
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRelay } from "./nostr-relay.mjs";
import { generateWorld, T, isBlocked } from "../js/world.js";
import { BEACON_RANGE } from "../js/beacon.js";
import { LIGHTHOUSE_RADIUS, SAFE_FRACTION, EASE_S, lighthouseOf, watchKept, holdOut, insideBeam, createBeam } from "../js/lighthouse.js";
import { shadeAt, shadeCount, shadePlan, SLOT_MS, MAX_SHADES, SNUFF_R } from "../js/shades.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const onlyLocal = process.argv.includes("--local");

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const STORE = "vigil.longwatch.v1";
const HOUR = 3;
const world = generateWorld();
const beaconList = world.landmarks.filter(l => l.kind === "beacon");
const lh = lighthouseOf(world);

// ---- 0. node: the rules ----
console.log("# the long watch kept, in node");
let S1 = null, S2 = null; // scenario times for the pages
{
  ok(beaconList.length === 4 && !!lh, "the island has four beacons and a ruined lighthouse");
  ok(LIGHTHOUSE_RADIUS === 14 && SAFE_FRACTION === 0.9 && EASE_S > 0, "constants: 14 tiles of light, safe inside 90% of it");
  const t = true, f = false;
  ok(watchKept([t, t, t, t]) && !watchKept([t, t, t, f]) && !watchKept([f, f, f, f]) && !watchKept([]) && !watchKept(null) && !watchKept(undefined), "kept only when every beacon is lit; an empty list or nothing is not kept");
  ok(!watchKept([t, t, t, 1]) && !watchKept([t, t, t, "true"]) && !watchKept("tttt"), "only real booleans count");
  const b = createBeam();
  ok(b.f === 0, "the beam starts dark");
  b.update(true, EASE_S / 2, false); ok(Math.abs(b.f - 0.5) < 1e-9, "it grows over EASE_S seconds");
  b.update(true, 10, false); ok(b.f === 1, "and stops at 1");
  b.update(false, EASE_S / 2, false); ok(Math.abs(b.f - 0.5) < 1e-9, "it fades the same way");
  b.update(false, 10, false); ok(b.f === 0, "and stops at 0");
  b.update(true, 0.01, true); ok(b.f === 1, "with reduced motion it is full at once");
  b.update(false, 0.01, true); ok(b.f === 0, "and gone at once");
  b.update(true, 10, false); b.reset(); ok(b.f === 0, "reset puts it out");
  // holdOut
  const at = { x: lh.x + 5, y: lh.y };
  let h = holdOut({ x: lh.x + 3, y: lh.y }, lh, 0);
  ok(h.x === lh.x + 3 && h.fade === 1, "beam dark: a shade is left where it is");
  h = holdOut({ x: lh.x + 3, y: lh.y }, lh, 1);
  ok(Math.abs(h.x - (lh.x + 14)) < 1e-9 && Math.abs(h.y - lh.y) < 1e-9, "beam full: a shade 3 tiles from the lighthouse is held at 14 tiles on the same line");
  h = holdOut({ x: lh.x + 20, y: lh.y + 1 }, lh, 1);
  ok(h.x === lh.x + 20 && h.y === lh.y + 1, "a shade outside the beam is not moved");
  h = holdOut({ x: lh.x, y: lh.y }, lh, 1);
  ok(Number.isFinite(h.x) && Number.isFinite(h.y) && Math.abs(Math.hypot(h.x - lh.x, h.y - lh.y) - 14) < 1e-9, "a shade exactly on the lighthouse is still placed at the edge (no division by zero)");
  h = holdOut({ x: lh.x + 3, y: lh.y, at: lh }, lh, 0.4);
  ok(Math.abs(h.fade - 0.6) < 1e-9 && Math.abs(Math.hypot(h.x - lh.x, h.y - lh.y) - 5.6) < 1e-9, "a shade making for the lighthouse fades with the beam (fade 1 - f) and the edge is 14 * f");
  h = holdOut({ x: lh.x + 3, y: lh.y, at: { x: 1, y: 1 } }, lh, 1);
  ok(h.fade === 1, "a shade making for another landmark does not fade");
  ok(!Number.isNaN(holdOut({ x: lh.x + 1, y: lh.y }, lh, NaN).x) && holdOut({ x: lh.x + 1, y: lh.y }, lh, NaN).x === lh.x + 1 && holdOut({ x: lh.x + 1, y: lh.y }, lh, -3).x === lh.x + 1, "a bad f (NaN, negative) leaves shades alone");
  ok(holdOut({ x: lh.x + 1, y: lh.y }, lh, 9).x === lh.x + 14, "f above 1 counts as 1");
  ok(holdOut({ x: 1, y: 1 }, null, 1).x === 1, "no lighthouse: nothing happens");
  ok(insideBeam(lh.x + 12, lh.y, lh, 1) && !insideBeam(lh.x + 13, lh.y, lh, 1) && !insideBeam(lh.x + 2, lh.y, lh, 0.99) && !insideBeam(lh.x + 2, lh.y, null, 1), "safe inside 90% of the beam (12.6 tiles) only when it is full");

  // The real shade paths: 3000 slots, a sample every 4 s.
  let inside = 0, checked = 0, atLh = 0, faded = 0, maxJump = 0, edge = 0, passed = 0;
  for (let slot = 1000; slot < 4000; slot++) {
    const n = shadeCount(world.seed, slot);
    for (let k = 0; k < n; k++) {
      const p = shadePlan(world, slot, k), isLh = p.a === lh || (p.a.x === lh.x && p.a.y === lh.y);
      let prev = null;
      for (let u = 0; u <= p.life + p.delay; u += 4) {
        const sh = shadeAt(world, slot * SLOT_MS + u * 1000, k);
        if (!sh) continue;
        checked++;
        if (isLh) { atLh++; const h = holdOut(sh, lh, 1); if (h.fade === 0) faded++; }
        const h = holdOut(sh, lh, 1);
        if (Math.hypot(h.x - lh.x, h.y - lh.y) < 14 - 1e-9 && h.fade > 0) inside++;
        if (!isLh && Math.hypot(sh.x - lh.x, sh.y - lh.y) < 14) passed++;
        if (Math.abs(Math.hypot(h.x - lh.x, h.y - lh.y) - 14) < 1e-6) edge++;
        // no jump while the beam grows: positions at f and f + 0.1 differ by at most about a tile (shades near the very centre excepted)
        if (!isLh && Math.hypot(sh.x - lh.x, sh.y - lh.y) > 3) for (let ff = 0; ff < 1; ff += 0.1) { const a = holdOut(sh, lh, ff), c = holdOut(sh, lh, ff + 0.1); maxJump = Math.max(maxJump, Math.hypot(a.x - c.x, a.y - c.y)); }
      }
    }
  }
  console.log(`  ${checked} shade positions checked; ${atLh} of them making for the lighthouse; ${passed} of the others inside the beam's reach on their raw path; ${edge} held at the edge; largest step as the beam grows 0.1 at a time ${maxJump.toFixed(2)} tiles`);
  ok(checked > 5000 && atLh > 100 && passed > 100, "the sample covers shades making for the lighthouse and others passing through the beam's reach");
  ok(inside === 0, "with the beam full no shade that can be seen is ever inside it");
  ok(faded === atLh, "every shade making for the lighthouse is gone (faded to nothing) with the beam full");
  ok(edge > 0, "shades passing through the beam are held at its edge");
  ok(maxJump <= 1.5 + 1e-9, "no shade jumps more than 1.5 tiles as the beam grows 10% (it slides out)");
  // shade at the beam's edge cannot be nearer a person standing safe inside it than 1.4 tiles: safe radius 12.6, edge 14 > SNUFF_R
  ok(14 - 14 * SAFE_FRACTION > SNUFF_R, "a shade held at the edge is farther than the snuff distance from anyone inside the safe part of the beam");

  // Scenario times for the pages.
  for (let slot = 20000; slot < 90000 && (!S1 || !S2); slot++) {
    const n = shadeCount(world.seed, slot);
    for (let k = 0; k < n; k++) {
      const p = shadePlan(world, slot, k), isLh = p.a.x === lh.x && p.a.y === lh.y;
      if (isLh && !S1 && k === 0) S1 = { slot, k, ms: slot * SLOT_MS + (p.delay + p.t1 + 6) * 1000 };
      if (!isLh && !S2) {
        for (let u = p.delay + 3; u < p.life + p.delay - 25; u += 1) {
          const ms = slot * SLOT_MS + u * 1000, sh = shadeAt(world, ms, k);
          if (!sh || sh.alpha < 1) continue;
          const d = Math.hypot(sh.x - lh.x, sh.y - lh.y);
          // keep inside 12 tiles for the next 10 seconds so the check is not sensitive to timing
          let good = d < 12;
          for (let v = 0; good && v <= 10; v += 1) { const s2 = shadeAt(world, ms + v * 1000, k); if (!s2 || s2.alpha < 1 || Math.hypot(s2.x - lh.x, s2.y - lh.y) > 13.5) good = false; }
          if (good) { S2 = { slot, k, ms }; break; }
        }
      }
    }
  }
  ok(!!S1 && !!S2, `found a moment with a shade circling the lighthouse (slot ${S1 && S1.slot}) and one passing within 7 tiles of it (slot ${S2 && S2.slot})`);
  // The module sends nothing: no network call in its source.
  const src = await readFile(path.join(here, "..", "js", "lighthouse.js"), "utf8");
  ok(!/net\.|\.send\(|fetch\(|WebSocket|BroadcastChannel/.test(src), "lighthouse.js has no network call of any kind: nothing is sent for the long watch");
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
const shots = process.env.SHOTS;
const browser = await pw.chromium.launch({ ...(executablePath ? { executablePath } : {}), args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });

const errors = [];
function watch(page, label) {
  page.on("pageerror", e => errors.push(`${label}: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/WebSocket connection to 'wss:/.test(m.text()) && !/User-Initiated Abort, reason=Close called/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
}
async function waitFor(page, fn, arg, timeout = 10000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 50 }); return true; } catch { return false; }
}
const bc = (page) => page.evaluate(() => window.__longWatch.beacon());
const wv = (page) => page.evaluate(() => window.__longWatch.watch());
async function seedPack(page, url, patch) {
  await page.goto(url);
  await page.evaluate(([K, patch]) => { const st = location.search.includes("net=local") ? sessionStorage : localStorage; const s = JSON.parse(st.getItem(K)); Object.assign(s, patch); st.setItem(K, JSON.stringify(s)); }, [STORE, patch]);
  await page.reload();
}
const land = (x, y) => { const t = world.tiles[Math.floor(y) * world.w + Math.floor(x)]; return (t === T.SAND || t === T.GRASS || t === T.MEADOW) && !isBlocked(world, x, y); };
const stand = beaconList.map(l => {
  const out = [];
  for (let r = 1.1; r <= 2.2 && out.length < 3; r += 0.3) for (let a = 0; a < 6.28 && out.length < 3; a += 0.5) { const x = l.x + Math.cos(a) * r, y = l.y + Math.sin(a) * r; if (land(x, y) && Math.hypot(x - l.x, y - l.y) <= BEACON_RANGE - 0.2) out.push({ x, y }); }
  return out;
});
// Open ground 3 to 5 tiles from the lighthouse for the bystander, and the sample point 3.5 tiles south of the lighthouse
// (4.3 to 6.5 tiles from the bystander, so it is on the bystander's small screen and out of reach of its own lantern so the bystander's own lantern does not light it).
const sample = { x: lh.x, y: lh.y + 3.5 };
const bystander = (() => { for (let r = 3; r <= 5.5; r += 0.5) for (let a = 0; a < 6.28; a += 0.3) { const x = lh.x + Math.cos(a) * r, y = lh.y + Math.sin(a) * r; if (land(x, y) && Math.hypot(x - sample.x, y - sample.y) > 4.3 && Math.hypot(x - sample.x, y - sample.y) < 6.5) return { x, y }; } return null; })();
async function teleportSynced(page, others, x, y) {
  if (!await page.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [x, y])) return false;
  for (const o of others) if (!await waitFor(o, ([x, y]) => window.__longWatch.peers().some(p => Math.hypot(p.x - x, p.y - y) < 0.05), [x, y], 6000)) return false;
  return true;
}
const brightness = (page, wx, wy) => page.evaluate(([wx, wy]) => {
  const c = document.getElementById("view"), me = window.__longWatch.self(), dpr = c.width / c.clientWidth, tile = (c.clientWidth < 520 ? 30 : 36) * dpr;
  const sx = Math.round(c.width / 2 + (wx - me.x) * tile), sy = Math.round(c.height / 2 + (wy - me.y) * tile);
  const d = c.getContext("2d").getImageData(sx - 3, sy - 3, 7, 7).data; let s = 0;
  for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / 4);
}, [wx, wy]);
const settledBrightness = async (page, wx, wy) => { let last = -1; for (let i = 0; i < 40; i++) { const v = await brightness(page, wx, wy); if (Math.abs(v - last) < 0.5 && i > 2) return v; last = v; await sleep(80); } return last; };
async function shoot(page, name) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  const keep = page.viewportSize();
  for (const [w, h] of [[375, 760], [1100, 800]]) { await page.setViewportSize({ width: w, height: h }); await sleep(500); await page.locator(".stage").screenshot({ path: path.join(shots, `${name}-${w}.png`) }); }
  await page.setViewportSize(keep); await sleep(200);
}
const setClock = (page, ms) => page.evaluate((ms) => window.__longWatch.setShadeClock(Math.round(ms - Date.now())), ms);
const shadeView = (page, k) => page.evaluate((k) => { const s = window.__longWatch.shades().list.find(q => q.k === k); return s ? { x: s.x, y: s.y, alpha: s.alpha, safe: s.safe } : null; }, k);
const litCount = (pages, n, timeout = 6000) => Promise.all(pages.map(p => waitFor(p, (n) => { const s = window.__longWatch.beacon(); return s && s.lit.filter(Boolean).length === n; }, n, timeout))).then(r => r.every(Boolean));
async function lightBeacon(A, B, b) {
  const ok1 = await teleportSynced(A, [B], stand[b][0].x, stand[b][0].y) && await teleportSynced(B, [A], stand[b][1].x, stand[b][1].y);
  await Promise.all([A, B].map(p => p.evaluate(() => { for (let i = 0; i < 6; i++) window.__longWatch.addFuel("driftwood"); })));
  return ok1;
}

async function scenario(label, mk, query, room, opts = {}) {
  console.log(`\n# ${label}`);
  const url = `${base}${query}#room=${room}`;
  const [A, B, C] = [await mk(), await mk(), await mk()];
  await seedPack(A, url, { inv: { driftwood: 45, reeds: 0, berries: 0 } });
  await seedPack(B, url, { inv: { driftwood: 45, reeds: 0, berries: 0 } });
  await C.goto(url);
  await A.click("#enter"); await B.click("#enter"); await C.click("#enter");
  const all = [A, B, C];
  const seen = (await Promise.all(all.map(p => waitFor(p, () => window.__longWatch.peers().length === 2, null, opts.timeout)))).every(Boolean);
  ok(seen, "three pages see each other");
  if (!seen) return;
  ok((await Promise.all(all.map(p => waitFor(p, () => window.__longWatch.beacon() && window.__longWatch.beacon().synced, null, 8000)))).every(Boolean), "all three have heard the room's beacon state");
  ok(!!bystander && stand.every(s => s.length >= 2), "there is open ground near the lighthouse and within reach of every beacon");
  ok(await C.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [bystander.x, bystander.y]), "C, a bystander, stands near the ruined lighthouse");
  await sleep(600);

  // 1. Nothing lit: the panel counts, the lighthouse is dark.
  let w = await wv(C);
  ok(!w.kept && w.f === 0 && w.view === null && w.panel && /0 of 4 beacons lit/.test(w.text), "no beacon lit: the panel says 0 of 4, the lighthouse is dark");
  ok(Math.abs(w.lighthouse.x - lh.x) < 1e-9 && w.radius === LIGHTHOUSE_RADIUS, "the page knows the same lighthouse and reach as the node rules");
  await setClock(A, S1.ms); await setClock(B, S1.ms); await setClock(C, S1.ms);
  const okS1 = await waitFor(C, ([k, x, y]) => { const s = window.__longWatch.shades().list.find(q => q.k === k); return s && s.alpha >= 0.99 && Math.hypot(s.x - x, s.y - y) < 2.2; }, [S1.k, lh.x, lh.y], 4000);
  if (!okS1) console.log("  debug", JSON.stringify(await C.evaluate(() => ({ sh: window.__longWatch.shades(), now: window.__longWatch.shadeNow() }))), JSON.stringify(S1));
  ok(okS1, "a shade is circling the ruined lighthouse (before the watch is kept), fully visible");
  await shoot(C, `${opts.shot}-before`);
  await setClock(A, S2.ms); await setClock(B, S2.ms); await setClock(C, S2.ms);
  await sleep(300);
  const dimBefore = await settledBrightness(C, sample.x, sample.y);
  const sh0 = await shadeView(C, S2.k);
  ok(sh0 && Math.hypot(sh0.x - lh.x, sh0.y - lh.y) < 13.9 && sh0.alpha >= 0.99, `a second shade passes ${sh0 ? Math.hypot(sh0.x - lh.x, sh0.y - lh.y).toFixed(1) : "?"} tiles from the lighthouse (before the watch is kept)`);

  // 2. Three beacons lit: not kept.
  for (let b = 0; b < 3; b++) ok(await lightBeacon(A, B, b), `A and B light beacon ${b + 1}`);
  ok(await litCount(all, 3), "three beacons are lit on all three pages");
  await sleep(500);
  w = await wv(C);
  ok(!w.kept && w.f === 0 && /3 of 4 beacons lit/.test(w.text), "three of four: the watch is not kept, the lighthouse stays dark, the panel says 3 of 4");
  ok(Math.abs(await settledBrightness(C, sample.x, sample.y) - dimBefore) < 8, "and the ground by the lighthouse is as dark as before");

  // 3. The fourth: kept for everyone.
  ok(await lightBeacon(A, B, 3), "A and B light the fourth beacon");
  ok(await litCount(all, 4), "all four beacons are lit on all three pages");
  const keptAll = (await Promise.all(all.map(p => waitFor(p, () => window.__longWatch.watch().kept, null, 4000)))).every(Boolean);
  ok(keptAll, "every page works out that the long watch is kept (nothing was sent for it)");
  ok((await Promise.all(all.map(p => waitFor(p, () => window.__longWatch.watch().f >= 1, null, 6000)))).every(Boolean), "the beam on every page grows to full");
  w = await wv(C);
  ok(w.view && w.view.r === LIGHTHOUSE_RADIUS && /The long watch is kept/.test(w.text) && /ruined lighthouse is lit/.test(w.info), "the panel and the message say the ruined lighthouse is lit");
  ok(await C.evaluate(() => window.__longWatch.hud().minimapMarks) > 0, "the minimap still draws its marks");
  await setClock(A, S2.ms); await setClock(B, S2.ms); await setClock(C, S2.ms); await sleep(500);
  const lit = await settledBrightness(C, sample.x, sample.y);
  console.log(`  brightness of the ground 3.5 tiles south of the lighthouse, as C sees it: dark ${dimBefore.toFixed(1)}, lit ${lit.toFixed(1)}`);
  ok(lit > dimBefore + 25, "the lit lighthouse lights the ground around it on the bystander's screen");
  await shoot(C, `${opts.shot}-lit`);

  // 4. Shades keep out of the beam; both pages agree.
  const [a2, b2, c2] = await Promise.all(all.map(p => shadeView(p, S2.k)));
  const dist = (s) => Math.hypot(s.x - lh.x, s.y - lh.y);
  ok(a2 && b2 && c2 && [a2, b2, c2].every(s => dist(s) >= LIGHTHOUSE_RADIUS - 0.05), `the passing shade now stays out of the beam on every page (${[a2, b2, c2].map(s => s ? dist(s).toFixed(2) : "?").join(", ")} tiles from the lighthouse; the beam is ${LIGHTHOUSE_RADIUS})`);
  ok(a2 && b2 && c2 && Math.hypot(a2.x - b2.x, a2.y - b2.y) < 0.8 && Math.hypot(a2.x - c2.x, a2.y - c2.y) < 0.8, "and the pages put it in the same place");
  await setClock(A, S1.ms); await setClock(B, S1.ms); await setClock(C, S1.ms);
  // Milestone 31: the fade is eased, so a fixed 500 ms wait failed once in about ten runs with the alpha still on its way down.
  // Wait (up to 5 s) until every page shows the shade gone, then say how long it took.
  const tFade = Date.now();
  const faded = (await Promise.all(all.map(p => waitFor(p, (k) => { const s = window.__longWatch.shades().list.find(q => q.k === k); return !s || s.alpha < 0.05; }, S1.k, 5000)))).every(Boolean);
  const f1 = await Promise.all(all.map(p => shadeView(p, S1.k)));
  ok(faded && f1.every(s => !s || s.alpha < 0.05), `the shade that was circling the lighthouse has faded away on every page (${Date.now() - tFade} ms after the clock moved; alpha ${f1.map(s => s ? s.alpha.toFixed(3) : "gone").join(", ")})`);
  const near = await C.evaluate(([x, y]) => window.__longWatch.shades().list.filter(s => s.alpha > 0.3 && Math.hypot(s.x - x, s.y - y) < 14 - 0.05).length, [lh.x, lh.y]);
  ok(near === 0, "no shade that can be seen is inside the beam");
  ok(!(await C.evaluate(() => window.__longWatch.shades().snuffed)), "the bystander was never snuffed");

  // 5. A late joiner who asks for reduced motion sees it at once.
  const D = await mk();
  await D.emulateMedia({ reducedMotion: "reduce" });
  await D.goto(url); await D.click("#enter");
  ok(await waitFor(D, () => window.__longWatch.peers().length === 3, null, opts.timeout), "a fourth player joins and sees the others");
  ok(await waitFor(D, () => { const s = window.__longWatch.beacon(); return s && s.lit.every(Boolean); }, null, 10000), "the late joiner is told the room's beacons: all four lit");
  ok(await waitFor(D, () => { const w = window.__longWatch.watch(); return w.kept && w.f === 1; }, null, 3000), "and the lighthouse is lit for them at full size straight away (reduced motion: no slow growth)");

  // 6. Leaving: lit while anyone is there; dark in an emptied lantern.
  await A.click("#leave"); await B.click("#leave");
  await sleep(600);
  ok(await waitFor(C, () => window.__longWatch.peers().length === 1, null, 20000), "A and B have left; C and D remain");
  ok((await Promise.all([C, D].map(p => waitFor(p, () => window.__longWatch.watch().kept, null, 3000)))).every(Boolean), "the lighthouse is still lit for the two who stay");
  await C.click("#leave"); await D.click("#leave");
  await sleep(600);
  const E = await mk();
  await E.goto(url); await E.click("#enter");
  ok(await waitFor(E, () => window.__longWatch.beacon() && window.__longWatch.beacon().synced, null, 8000), "a new player enters the emptied lantern");
  w = await wv(E);
  ok(!w.kept && w.f === 0 && w.view === null && /0 of 4/.test(w.text), "the lantern forgot the fuel: the lighthouse is dark again");
  for (const p of [A, B, C, D, E]) await p.context().close().catch(() => {});
}

// ---- 1. local ----
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const mk = () => ctx.newPage().then(p => (watch(p, "local"), p));
  await scenario("local transport (BroadcastChannel)", mk, `?net=local&hour=${HOUR}&weather=clear`, 6, { shot: "watch-local" });
  await ctx.close();
}

// ---- 2. real WebRTC through a local Nostr relay ----
if (!onlyLocal) {
  const relay = await startRelay();
  const c = [await browser.newContext({ viewport: { width: 900, height: 800 } }), await browser.newContext({ viewport: { width: 1000, height: 800 } }), await browser.newContext({ viewport: { width: 800, height: 700 } })];
  let i = 0;
  const mk = () => c[i++ % 3].newPage().then(p => (watch(p, "webrtc"), p));
  await scenario("Trystero over Nostr + WebRTC (relay on 127.0.0.1)", mk, `?net=nostr&hour=${HOUR}&weather=clear&relay=${encodeURIComponent(relay.url)}`, 5, { timeout: 40000, shot: "watch-webrtc" });
  for (const x of c) await x.close().catch(() => {});
  relay.close();
}

ok(errors.length === 0, `no console errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
