#!/usr/bin/env node
// Milestone 22 tests for The Long Watch: the music stone. Eight preset notes (ids only), heard only when a listener
// turned Sound on, a per-sender rate limit, nothing saved; three players playing the three notes of the night's tune
// within one beat make the stone glow for everyone and earn each of them a help point.
//
//   node game/tests/stone.test.mjs            node checks, local transport, then real Trystero/WebRTC via a local Nostr relay
//   node game/tests/stone.test.mjs --local    skip the WebRTC part
//   CHROME=/path/to/headless_shell            use this browser binary
// Online play over the public relays is not tested here.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStone, validStoneMsg, tuneFor, stoneSpot, findTune, nightOf, NOTES, NOTE_HZ, NOTE_NAMES, TUNE_LEN, BEAT_MS, GLOW_S, REACH, REACH_SLACK, OWN_GAP_MS, RATE_PER_S, RATE_BURST } from "../js/stone.js";
import { generateWorld, isBlocked, WORLD_SEED } from "../js/world.js";
import { shadeCount, SLOT_MS } from "../js/shades.js";
import { startRelay } from "./nostr-relay.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const onlyLocal = process.argv.includes("--local");
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };

console.log("# the music stone, in node");
{
  const world = generateWorld(WORLD_SEED);
  ok(NOTES === 8 && NOTE_HZ.length === 8 && NOTE_NAMES.length === 8 && NOTE_HZ.every(h => h > 200 && h < 700), "eight notes, each with a name and a pitch");
  ok(validStoneMsg({ k: "mn", n: 0 }) && validStoneMsg({ k: "mn", n: 7 }), "note ids 0 and 7 are valid");
  const bad = [{ k: "mn", n: 8 }, { k: "mn", n: -1 }, { k: "mn", n: 1.5 }, { k: "mn", n: "3" }, { k: "mn", n: NaN }, { k: "mn", n: Infinity }, { k: "mn", n: null }, { k: "mn" }, { k: "mn", n: 3, x: 1 }, { k: "mn", n: 3, name: "Bob" }, { k: "MN", n: 3 }, { k: "mn", n: [3] }, { k: "mn", n: 3, t: "hello" }, null, "st", 7, []];
  ok(bad.every(m => !validStoneMsg(m)), `${bad.length} malformed, out-of-range and extra-field messages are refused`);

  const tunes = new Set();
  let good = true;
  for (let night = 0; night < 400; night++) {
    const t = tuneFor(WORLD_SEED, night);
    if (t.length !== TUNE_LEN || new Set(t).size !== TUNE_LEN || !t.every(n => Number.isInteger(n) && n >= 0 && n < NOTES) || tuneFor(WORLD_SEED, night).join() !== t.join()) good = false;
    tunes.add(t.join());
  }
  ok(good, `every tune has ${TUNE_LEN} different notes and is the same each time it is asked for`);
  ok(tunes.size > 20, `tunes vary from night to night (${tunes.size} different in 400 nights)`);
  ok(nightOf(0) === 0 && nightOf(48 * 60 * 1000 - 1) === 0 && nightOf(48 * 60 * 1000) === 1, "a night is 48 minutes of the clock");

  const spot = stoneSpot(world), well = world.landmarks.find(l => l.kind === "well");
  const dd = Math.max(Math.abs(spot.x - well.x), Math.abs(spot.y - well.y));
  ok(well && dd >= 2 && dd <= 3.5 && !isBlocked(world, spot.x, spot.y), `the stone stands ${dd.toFixed(1)} tiles from the well on a tile that does not block`);
  ok(JSON.stringify(stoneSpot(generateWorld(WORLD_SEED))) === JSON.stringify(spot), "the spot is the same in every browser");

  const L = new Map([["a", { n: 1, at: 100 }], ["b", { n: 4, at: 600 }], ["c", { n: 6, at: 1000 }]]);
  ok(findTune(L, [1, 4, 6], 1000)?.length === 3, "three players with the three notes inside a beat make the tune");
  ok(findTune(L, [1, 4, 7], 1000) === null && findTune(L, [1, 4, 6, 2], 1000) === null, "a missing note, or a longer tune, does not");
  ok(findTune(new Map([["a", { n: 1, at: 100 }], ["b", { n: 4, at: 600 }], ["c", { n: 6, at: 100 + BEAT_MS + 1 }]]), [1, 4, 6], 100 + BEAT_MS + 1) === null, "a note older than a beat does not count");

  // ---- the receive path with a fake network and a fake clock ----
  const mk = () => { const sent = [], hs = [], leaves = [], ev = []; return { sent, hs, leaves, ev, net: { selfId: "me", send: (msg, to) => sent.push([msg, to]), onMessage: h => hs.push(h), onPeerJoin: () => {}, onPeerLeave: h => leaves.push(h) } }; };
  const N = 1760000000 * 1000, tune = tuneFor(world.seed, nightOf(N));
  const setup = () => {
    const m = mk(), peers = new Map(), me = { x: spot.x + 1, y: spot.y }, c = { t: 100000 };
    for (const id of ["p1", "p2", "p3"]) peers.set(id, { id, x: spot.x - 1, y: spot.y, tx: spot.x - 1, ty: spot.y });
    const st = createStone(m.net, world, me, peers, { now: () => c.t, clock: () => N, onEvent: (...a) => m.ev.push(a) });
    const say = (msg, id) => m.hs.forEach(h => h(msg, id));
    return { m, peers, me, c, st, say };
  };
  {
    const { m, c, st, say, me } = setup();
    ok(st.play(tune[0]) && m.sent.length === 1 && JSON.stringify(m.sent[0]) === JSON.stringify([{ k: "mn", n: tune[0] }, undefined]), "playing sends exactly { k:'mn', n } to everyone");
    ok(!st.play(tune[1]) && m.sent.length === 1, `my own notes are at least ${OWN_GAP_MS} ms apart`);
    c.t += OWN_GAP_MS; ok(st.play(tune[1]) && m.sent.length === 2, "and allowed again after that");
    for (const n of [-1, 8, 1.5, NaN, "2", null, undefined]) st.play(n);
    ok(m.sent.length === 2, "an invalid note id is never sent");
    me.x = spot.x + REACH + 0.5; c.t += 5000;
    ok(!st.play(1) && m.sent.length === 2, `too far from the stone (more than ${REACH} tiles) nothing is played or sent`);
  }
  {
    const { m, c, st, say } = setup();
    say({ k: "mn", n: tune[0] }, "p1"); c.t += 300; say({ k: "mn", n: tune[1] }, "p2");
    ok(st.glow() === 0, "two players are not enough");
    c.t += 300; say({ k: "mn", n: tune[2] }, "p3");
    ok(st.glow() > 0 && m.ev.some(e => e[0] === "glow" && e[1].players.length === 3 && !e[1].mine), "three players, one note each, inside a beat: the stone glows");
    ok(st.recent().length === 3 && m.ev.filter(e => e[0] === "note").length === 3, "each counted note was reported once");
    const glows = st.stats().glows;
    c.t += 200; say({ k: "mn", n: tune[0] }, "p1"); say({ k: "mn", n: tune[1] }, "p2"); say({ k: "mn", n: tune[2] }, "p3");
    ok(st.stats().glows === glows, "no second glow while it is glowing");
    c.t += GLOW_S * 1000 + 10; ok(st.glow() === 0, `the glow ends after ${GLOW_S} s`);
  }
  {
    const { m, c, st, say } = setup();
    say({ k: "mn", n: tune[0] }, "p1"); c.t += BEAT_MS - 100; say({ k: "mn", n: tune[1] }, "p2"); c.t += 200; say({ k: "mn", n: tune[2] }, "p3");
    ok(st.glow() === 0, "the first note had gone stale by the third: no glow");
    c.t += 5000;
    say({ k: "mn", n: tune[0] }, "p1"); c.t += 400; say({ k: "mn", n: tune[1] }, "p1"); c.t += 400; say({ k: "mn", n: tune[2] }, "p1");
    ok(st.glow() === 0, "one player cannot play all three notes");
    c.t += 5000;
    const wrong = [0, 1, 2, 3, 4, 5, 6, 7].filter(n => !tune.includes(n));
    say({ k: "mn", n: wrong[0] }, "p1"); say({ k: "mn", n: wrong[1] }, "p2"); say({ k: "mn", n: wrong[2] }, "p3");
    ok(st.glow() === 0, "three notes that are not the tune do nothing");
    c.t += 5000;
    say({ k: "mn", n: tune[0] }, "p1"); say({ k: "mn", n: tune[1] }, "p2");
    m.leaves.forEach(h => h("p2")); c.t += 300; say({ k: "mn", n: tune[2] }, "p3");
    ok(st.glow() === 0, "a player who leaves midway takes their note with them");
  }
  {
    const { m, c, st, say, peers } = setup();
    say({ k: "mn", n: tune[0] }, "stranger");
    ok(m.ev.length === 0, "a note from someone who never said hello is ignored");
    peers.set("far", { id: "far", x: spot.x + 30, y: spot.y, tx: spot.x + 30, ty: spot.y });
    say({ k: "mn", n: tune[0] }, "far");
    ok(m.ev.length === 0, "a note from a player far from the stone is ignored");
    peers.set("edge", { id: "edge", x: spot.x + REACH + REACH_SLACK - 0.1, y: spot.y, tx: spot.x + REACH + REACH_SLACK - 0.1, ty: spot.y });
    say({ k: "mn", n: 2 }, "edge");
    ok(m.ev.length === 1, `a player just inside ${REACH + REACH_SLACK} tiles (reach plus slack for walking) is heard`);
    for (let i = 0; i < 50; i++) say({ k: "st", x: 10, y: 10, d: 0, m: 1 }, "p1");
    ok(m.ev.length === 1 && st.stats().dropped === 2, "presence's own position messages (another kind) are not mistaken for notes and use up no tokens");
    c.t += 5000;
    for (const msg of bad) say(msg, "p1");
    ok(m.ev.length === 1, "malformed messages from a known player change nothing");
    for (let i = 0; i < 300; i++) say({ k: "mn", n: i % NOTES }, "p2");
    ok(m.ev.filter(e => e[0] === "note").length === 1 + RATE_BURST, `a flood of 300 is cut to ${RATE_BURST} (burst), then ${RATE_PER_S} a second`);
    c.t += 1000; for (let i = 0; i < 300; i++) say({ k: "mn", n: 1 }, "p2");
    ok(m.ev.filter(e => e[0] === "note").length <= 1 + RATE_BURST + RATE_PER_S + 1, "and about 3 more after a second");
    ok(st.stats().dropped >= 590, "the excess is counted as dropped");
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
  try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
}
// Milestone 31: the shades' waves come from the real clock, and a wave circling the well can drive a shade off with the three
// players standing there, which gives each of them a help point ("shade") and breaks "adds no point" at random (the one
// failure seen: points 1,1,1 before, 2,2,2 after, glows still 1). So, as living and shades do, the pages load on a stretch of three
// slots with no shades (STONE_SHADES=hot instead picks a slot of four shades, to show the cause).
const SEEDW = WORLD_SEED;
const QUIET = (() => { const hot = process.env.STONE_SHADES === "hot"; const now = Math.floor(Date.now() / SLOT_MS); for (let s = now + 400; s < now + 40000; s++) if (hot ? shadeCount(SEEDW, s) === 4 : shadeCount(SEEDW, s) === 0 && shadeCount(SEEDW, s + 1) === 0 && shadeCount(SEEDW, s + 2) === 0) return s; throw new Error("no slot"); })();
const quiet = () => `&shadeclock=${QUIET * SLOT_MS + 2000 - Date.now()}`;
const againOkFor = (again, pts) => again.every((s, i) => s.rank === pts[i] && s.stats.glows === 1);
const stoneOf = (p) => p.evaluate(() => window.__longWatch.stone());
const press = (p, n) => p.evaluate((n) => { document.querySelector(`#stonebtns [data-note="${n}"]`).click(); }, n);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function enter(page, query, room) { await page.goto(`${base}${query}${quiet()}#room=${room}`); await page.click("#enter"); await waitFor(page, () => window.__longWatch.self().playing, null, 5000); }

async function scenario(label, mk, query, room, timeout) {
  console.log(`\n# ${label}`);
  const A = await mk(), B = await mk(), C = await mk(), D = await mk();
  for (const p of [A, B, C, D]) await enter(p, query, room);
  const met = await Promise.all([A, B, C, D].map(p => waitFor(p, () => window.__longWatch.peers().length === 3, null, timeout)));
  ok(met.every(Boolean), "four players see each other in one lantern");
  const s0 = await stoneOf(A);
  ok(s0 && s0.tune.length === TUNE_LEN && !s0.panel && !s0.near, "the stone panel stays hidden while you are away from the stone");
  const pos = [[0.4, 0.3], [-0.4, 0.3], [0.0, -0.5]];
  for (const [i, p] of [A, B, C].entries()) await p.evaluate(([x, y]) => window.__longWatch.teleport(x, y), [s0.x + pos[i][0], s0.y + pos[i][1]]);
  ok((await Promise.all([A, B, C].map(p => waitFor(p, () => window.__longWatch.stone().panel, null, 8000)))).every(Boolean), "next to the stone, the note panel shows on each page");
  ok((await Promise.all([A, B, C].map(p => waitFor(p, ([sx, sy]) => window.__longWatch.peers().filter(q => Math.hypot(q.x - sx, q.y - sy) < 2).length === 2, [s0.x, s0.y], 8000)))).every(Boolean), "each of the three sees the other two standing at the stone");
  const sB = await stoneOf(B), sC = await stoneOf(C);
  ok(sB.tune.join() === s0.tune.join() && sC.tune.join() === s0.tune.join() && (await stoneOf(D)).tune.join() === s0.tune.join(), `all pages work out the same tune from the seed and the clock (${s0.tune.map(n => NOTE_NAMES[n]).join(", ")})`);
  ok(/Tonight's tune is/.test(s0.text) && /Turn Sound on/.test((await stoneOf(A)).text), "the panel names tonight's tune from our own list of note names and says Sound is off");
  ok(await D.evaluate(() => document.querySelectorAll("#stonebtns button").length) === 8 && await D.locator("#stone").isHidden(), "eight note buttons exist; D, far from the stone, does not see the panel");

  // sound: off until turned on. B turns Sound on; A and C do not.
  await B.click("#stepstoggle");
  const pre = [await stoneOf(A), await stoneOf(B), await stoneOf(C)];
  await press(A, 0);
  ok(await waitFor(B, () => window.__longWatch.stone().recent.length >= 1, null, 5000) && await waitFor(C, () => window.__longWatch.stone().recent.length >= 1, null, 5000), "a note played by A is seen by B and C");
  await sleep(200);
  const post = [await stoneOf(A), await stoneOf(B), await stoneOf(C)];
  ok(post[1].soundOn && post[1].notesPlayed === pre[1].notesPlayed + 1, "B, who turned Sound on, played the note");
  ok(!post[0].soundOn && post[0].notesPlayed === 0 && !post[2].soundOn && post[2].notesPlayed === 0, "A and C, with Sound off, played nothing (their own and others' notes are silent)");
  await B.click("#stepstoggle");

  // a player cannot flood: ten clicks in a row reach the others as at most a few notes
  await sleep(OWN_GAP_MS + 200); // A's own gap from the note above has passed
  const clickStart = Date.now();
  const t0 = (await B.evaluate(() => window.__longWatch.taps())).mn | 0;
  for (let i = 0; i < 12; i++) await press(A, i % 8);
  const clickMs = Date.now() - clickStart;
  await waitFor(B, (n) => (window.__longWatch.taps().mn | 0) > n, t0, 5000); await sleep(1000);
  const t1 = (await B.evaluate(() => window.__longWatch.taps())).mn | 0;
  ok(t1 - t0 >= 1 && t1 - t0 <= Math.floor(clickMs / OWN_GAP_MS) + 1, `twelve quick clicks on A over ${clickMs} ms reached B as ${t1 - t0} notes (at most one every ${OWN_GAP_MS} ms, so at most ${Math.floor(clickMs / OWN_GAP_MS) + 1})`);
  await sleep(BEAT_MS + 300);

  // negative cases first (the glow cannot be undone): wrong notes, and one player playing two tune notes
  const wrong = [0, 1, 2, 3, 4, 5, 6, 7].filter(n => !s0.tune.includes(n));
  await Promise.all([press(A, wrong[0]), press(B, wrong[1]), press(C, wrong[2])]);
  await sleep(700);
  ok((await Promise.all([A, B, C].map(stoneOf))).every(s => s.glow === 0), "three notes that are not the tune: no glow on any page");
  await sleep(BEAT_MS);
  await press(A, s0.tune[0]); await sleep(OWN_GAP_MS + 100); await press(A, s0.tune[1]); await sleep(300); await press(B, s0.tune[1]);
  await sleep(600);
  ok((await Promise.all([A, B, C].map(stoneOf))).every(s => s.glow === 0), "A playing two tune notes and B repeating one: still no glow");
  await sleep(BEAT_MS + 300);

  // the tune, one note each, at once
  const before = await Promise.all([A, B, C].map(stoneOf));
  await Promise.all([press(A, s0.tune[0]), press(B, s0.tune[1]), press(C, s0.tune[2])]);
  const glowed = await Promise.all([A, B, C].map(p => waitFor(p, () => window.__longWatch.stone().glow > 0, null, 5000)));
  ok(glowed.every(Boolean), "A, B and C play the three notes together and the stone glows on all three pages");
  const after = await Promise.all([A, B, C].map(stoneOf));
  ok(after.every((s, i) => s.rank === before[i].rank + 1 && /A point for it/.test(s.info)), `each of the three earned one help point${after.every((s, i) => s.rank === before[i].rank + 1 && /A point for it/.test(s.info)) ? "" : ` (points before ${before.map(s => s.rank)} after ${after.map(s => s.rank)}; notes: ${after.map(s => s.info).join(" / ")}; stats ${JSON.stringify(after.map(s => s.stats))})`}`);
  ok(after.every(s => /The stone glows/.test(s.info)), "each page says so in plain words");
  ok(await waitFor(D, () => window.__longWatch.stone().glow > 0, null, 5000), "D, far from the stone but in the lantern, sees it glow too (everyone does)");
  const sD = await stoneOf(D);
  ok(sD.rank === s0.rank && /three players played its tune/.test(sD.info) && !/A point/.test(sD.info), "D earns no point (D played no note) and is told in plain words");
  await sleep(300);
  // a second round inside the glow does nothing more
  const pts = (await Promise.all([A, B, C].map(stoneOf))).map(s => s.rank);
  await sleep(OWN_GAP_MS + 100);
  await Promise.all([press(A, s0.tune[0]), press(B, s0.tune[1]), press(C, s0.tune[2])]);
  await sleep(800);
  const again = await Promise.all([A, B, C].map(stoneOf));
  const rankNotes = againOkFor(again, pts) ? [] : await Promise.all([A, B, C].map(p => p.evaluate(() => ({ rank: window.__longWatch.rank().info, shades: window.__longWatch.shades().count }))));
  const againOk = again.every((s, i) => s.rank === pts[i] && s.stats.glows === 1);
  ok(againOk, `a second round while it glows adds no point and no second glow${againOk ? "" : ` (points before ${pts}, after ${again.map(s => s.rank)}; the rank panel says ${JSON.stringify(rankNotes)} (a point from a deed other than the stone, such as a shade driven off, shows there); stats ${JSON.stringify(again.map(s => s.stats))}; glow ${again.map(s => s.glow.toFixed(2))})`}`);
  // nothing is saved
  const saved = await A.evaluate(() => { const out = []; for (const st of [localStorage, sessionStorage]) for (let i = 0; i < st.length; i++) out.push(st.key(i) + "=" + st.getItem(st.key(i))); return out.join("\n"); });
  ok(!/stone|glow|tune|note/i.test(saved.replace(/"help":\d+/g, "")), "nothing about the stone is kept in the browser's storage");
  await A.click("#leave");
  ok((await A.evaluate(() => window.__longWatch.stone())) === null && await A.locator("#stone").isHidden(), "leaving clears the stone and hides its panel");
  for (const p of [A, B, C, D]) await p.close();
}

try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const mk = () => ctx.newPage().then(p => (watch(p, "local"), p));
  await scenario("local transport (BroadcastChannel)", mk, "?net=local&hour=3&weather=clear", 2, 10000);
  await ctx.close();
  if (!onlyLocal) {
    const relay = await startRelay();
    const cs = [];
    for (let i = 0; i < 4; i++) cs.push(await browser.newContext({ viewport: i === 0 ? { width: 390, height: 800 } : { width: 900, height: 800 }, ...(i === 0 ? { isMobile: true, hasTouch: true } : {}) }));
    let i = 0;
    const mk2 = () => cs[i++ % 4].newPage().then(p => (watch(p, "webrtc"), p));
    await scenario("Trystero over Nostr + WebRTC (relay on 127.0.0.1)", mk2, `?net=nostr&hour=3&weather=clear&relay=${encodeURIComponent(relay.url)}`, 5, 30000);
    for (const c of cs) await c.close().catch(() => {});
    relay.close();
  }
  ok(errors.length === 0, errors.length ? `console errors: ${errors.join(" | ")}` : "no console errors");
} catch (e) {
  ok(false, `test crashed: ${e && e.stack || e}`);
} finally {
  await browser.close(); server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
