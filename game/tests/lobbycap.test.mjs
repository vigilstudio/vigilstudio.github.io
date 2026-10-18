#!/usr/bin/env node
// Milestone 30 tests for The Long Watch: a lobby that does not grow without end. Pages in lanterns leave the lobby room when
// they are linked to more than LOBBY_LINK_CAP others there and rejoin when it is quiet. Node checks on a fake mesh, then 14
// pages in two lanterns plus one asker on the local transport (BroadcastChannel). The WebRTC path is not run here.
//
//   node game/tests/lobbycap.test.mjs
//   CHROME=/path/to/headless_shell            use this browser binary
// Online play over the public relays is not tested here.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createResponder, LOBBY_LINK_CAP, LEAVE_MIN_S, LEAVE_MAX_S, ASKER_SLACK, LOBBY_PEERS, LOBBY_JOIN_DELAY_S, REJOIN_S, REJOIN_MAX_S } from "../js/lobby.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log("# the cap rules, in node");
{
  const mk = () => { const mh = [], jh = [], lh = [], timers = []; return { timers, say: (m, id) => mh.forEach(h => h(m, id)), join: id => jh.forEach(h => h(id)), leave: id => lh.forEach(h => h(id)), net: { send() {}, onMessage: h => mh.push(h), onPeerJoin: h => jh.push(h), onPeerLeave: h => lh.push(h) } }; };
  const setup = (rand = () => 0.5) => { const m = mk(); let left = 0; const r = createResponder(m.net, () => 1, { now: () => 0, rand, after: (fn, ms) => { const t = { fn, ms, live: true }; m.timers.push(t); return t; }, leave: () => left++ }); return { m, r, left: () => left, fire: () => { for (const t of m.timers) if (t.live) { t.live = false; t.fn(); } } }; };
  ok(LOBBY_LINK_CAP < LOBBY_PEERS && LOBBY_LINK_CAP >= 2, `the cap is a constant in code: ${LOBBY_LINK_CAP} others, below the ${LOBBY_PEERS} that are heard`);
  { const t = setup(); for (let i = 0; i < LOBBY_LINK_CAP; i++) t.m.join("p" + i); t.fire();
    ok(t.m.timers.length === 0 && t.left() === 0, `${LOBBY_LINK_CAP} others: no timer, no leaving`); }
  { const t = setup(); for (let i = 0; i < LOBBY_LINK_CAP + 1; i++) t.m.join("p" + i);
    ok(t.m.timers.length === 1 && t.m.timers[0].ms >= LEAVE_MIN_S * 1000 && t.m.timers[0].ms <= LEAVE_MAX_S * 1000, `${LOBBY_LINK_CAP + 1} others: one leave timer of ${LEAVE_MIN_S} to ${LEAVE_MAX_S} s (${t.m.timers[0] && t.m.timers[0].ms} ms)`);
    for (let i = 0; i < 20; i++) t.m.join("q" + i); ok(t.m.timers.length === 1, "more joins do not start more timers");
    t.fire(); ok(t.left() === 1 && t.r.left(), "when the timer fires and it is still crowded the page leaves once");
    t.fire(); ok(t.left() === 1, "and never asks to leave twice"); }
  { const lo = setup(() => 0), hi = setup(() => 1); for (const t of [lo, hi]) for (let i = 0; i < 12; i++) t.m.join("p" + i);
    ok(lo.m.timers[0].ms === LEAVE_MIN_S * 1000 && hi.m.timers[0].ms === LEAVE_MAX_S * 1000, "the wait runs from the shortest to the longest by the random number"); }
  { const t = setup(); for (let i = 0; i < LOBBY_LINK_CAP + 2; i++) t.m.join("p" + i); t.m.leave("p0"); t.m.leave("p1"); t.fire();
    ok(t.left() === 0 && !t.r.left() && t.r.links() === LOBBY_LINK_CAP, "if others leave first and it is quiet when the timer fires, the page stays"); }
  { const t = setup(); for (let i = 0; i < LOBBY_LINK_CAP; i++) t.m.join("p" + i);
    for (let i = 0; i < ASKER_SLACK; i++) { t.m.join("a" + i); t.m.say({ k: "lq" }, "a" + i); } t.fire();
    ok(t.left() === 0 && t.r.others() === LOBBY_LINK_CAP && t.r.links() === LOBBY_LINK_CAP + ASKER_SLACK, `${ASKER_SLACK} askers on top of ${LOBBY_LINK_CAP} answerers do not push the page out`);
    for (let i = 0; i < 10; i++) { t.m.join("h" + i); t.m.say({ k: "lq" }, "h" + i); } t.fire();
    ok(t.left() === 1, `askers beyond ${ASKER_SLACK} count as others (a hostile client cannot hide behind questions)`); }
  { const t = setup(); for (let i = 0; i < 20; i++) t.m.say({ k: "lq" }, "ghost" + i); for (const bad of [null, 5, {}, { k: "lq", x: 1 }]) t.m.say(bad, "ghost"); t.m.join(7); t.m.join(null);
    ok(t.r.links() === 0 && t.r.others() === 0, "questions from pages that never joined, bad messages and non-string ids add no links"); }
  ok(REJOIN_S >= 30 && REJOIN_MAX_S >= REJOIN_S * 2, `rejoining waits ${REJOIN_S} s, doubling to ${REJOIN_MAX_S} s`);
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


const PAGES = 14, IN_A = 10, ROOM_A = 3, ROOM_B = 4, REST = 40;
async function enter(page, room) { await page.goto(`${base}?net=local&hour=3&weather=clear&lobbyrest=${REST}#room=${room}`); await page.click("#enter"); await waitFor(page, () => window.__longWatch.self().playing, null, 5000); }
const lobbyOf = (p) => p.evaluate(() => window.__longWatch.lobby());
const sum = (a) => a.reduce((x, y) => x + y, 0);
const snap = async (pages) => Promise.all(pages.map(lobbyOf));

try {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 700 } });
  const pages = [];
  for (let i = 0; i < PAGES; i++) { const p = await ctx.newPage(); watch(p, "p" + i); pages.push(p); }
  const rooms = pages.map((_, i) => (i < IN_A ? ROOM_A : ROOM_B));
  console.log(`\n# ${PAGES} pages in Lantern ${ROOM_A} (${IN_A}) and Lantern ${ROOM_B} (${PAGES - IN_A}), then one asker`);
  for (let i = 0; i < PAGES; i++) await enter(pages[i], rooms[i]);
  const t0 = Date.now();
  // all of them reach the lobby, then crowding sorts itself out
  ok(await waitFor(pages[0], (n) => window.__longWatch.lobby().inLobby || window.__longWatch.lobby().crowdLeaves > 0, null, (LOBBY_JOIN_DELAY_S + 10) * 1000), "pages join the lobby room");
  const settled = async () => { const s = await snap(pages); const inL = s.filter(x => x.inLobby); return s.every(x => !x.inLobby || x.links <= LOBBY_LINK_CAP) && inL.length >= 2 && sum(s.map(x => x.crowdLeaves)) >= PAGES - 1 - LOBBY_LINK_CAP; };
  let good = false;
  for (let i = 0; i < 120 && !good; i++) { await sleep(500); good = await settled(); }
  const s1 = await snap(pages);
  const inL = s1.filter(x => x.inLobby), leaves = sum(s1.map(x => x.crowdLeaves));
  console.log(`  after ${((Date.now() - t0) / 1000).toFixed(1)} s: in the lobby ${inL.length}, left ${s1.length - inL.length}, links per page ${JSON.stringify(inL.map(x => x.links))}`);
  ok(good, "the lobby settles with no page linked to more than the cap");
  ok(inL.every(x => x.links <= LOBBY_LINK_CAP) && Math.max(...inL.map(x => x.links)) <= LOBBY_LINK_CAP, `links per page stay at or under ${LOBBY_LINK_CAP} (most: ${Math.max(...inL.map(x => x.links))})`);
  ok(inL.length >= LOBBY_LINK_CAP - 1 && inL.length <= LOBBY_LINK_CAP + 1, `about ${LOBBY_LINK_CAP + 1} pages stay (${inL.length}); the rest left (${s1.length - inL.length})`);
  ok(leaves === s1.length - inL.length, `each leaver left once (${leaves} leaves)`);
  // the asker
  const D = await ctx.newPage(); watch(D, "asker");
  await D.goto(`${base}?net=local&hour=3&weather=clear#room=1`);
  await D.click("#look");
  const truthOf = async (live) => { const c = new Array(7).fill(0); for (const p of live) c[(await p.evaluate(() => window.__longWatch.self())).room]++; return c; };
  const stayers = pages.filter((_, i) => s1[i].inLobby);
  const stayCounts = await truthOf(stayers);
  const got = await waitFor(D, () => { const c = window.__longWatch.lobby().counts; return !!c && c.reduce((x, y) => x + y, 0) >= 1; }, null, 10000);
  ok(got, "the asker hears answers from the pages that stayed");
  await waitFor(D, (n) => { const c = window.__longWatch.lobby().counts; return !!c && c.reduce((x, y) => x + y, 0) >= n; }, stayers.length, 12000);
  const L = await lobbyOf(D);
  console.log(`  asker counts ${JSON.stringify(L.counts)}; the stayers are ${JSON.stringify(stayCounts)}; text: ${L.text.slice(0, 140)}`);
  ok(sum(L.counts) === stayers.length && L.counts[ROOM_A] === stayCounts[ROOM_A] && L.counts[ROOM_B] === stayCounts[ROOM_B], "its counts are exactly the stayers' lanterns (the leavers cannot answer)");
  ok(L.pick === ROOM_A && L.text.includes(`Lantern ${ROOM_A} looks busiest`) && /guess/i.test(L.text), `the hint still names the busiest lantern, ${ROOM_A}, and calls it a guess`);
  ok((await lobbyOf(D)).heard <= LOBBY_PEERS, `the asker was linked to ${(await lobbyOf(D)).heard} lobby pages, not ${PAGES}`);
  const s2 = await snap(pages);
  const changed = s2.map((x, i) => ({ i, before: s1[i], after: x })).filter(c => c.after.inLobby !== c.before.inLobby);
  ok(changed.length === 0, "the asker's visit pushed nobody out of the lobby and let nobody in");
  if (changed.length) console.log("  milestone 31 diagnostics, pages whose lobby state changed (before, after):", JSON.stringify(changed.map(c => ({ page: c.i, before: { inLobby: c.before.inLobby, links: c.before.links, crowdLeaves: c.before.crowdLeaves }, after: { inLobby: c.after.inLobby, links: c.after.links, crowdLeaves: c.after.crowdLeaves } }))), "asker heard", (await lobbyOf(D)).heard, "stayers", stayers.length);
  await waitFor(D, () => window.__longWatch.lobby().looking === "done", null, 30000);
  // quiet: the stayers leave their lanterns, the leavers should come back to the lobby
  const leavers = pages.filter((_, i) => !s1[i].inLobby);
  for (const p of stayers) await p.click("#leave");
  const back = await waitFor(leavers[0], () => window.__longWatch.lobby().inLobby, null, (REST * 1.25 + 15) * 1000);
  ok(back, `a page that left rejoins the lobby when it is quiet (within ${REST * 1.25 + 15} s; ${REST} s was its wait)`);
  for (const p of leavers) await waitFor(p, () => window.__longWatch.lobby().inLobby, null, 20000);
  await sleep(1500);
  const s3 = await snap(leavers);
  ok(s3.every(x => x.inLobby), `all ${leavers.length} leavers are back in the lobby`);
  ok(s3.every(x => x.links <= LOBBY_LINK_CAP), `and each is linked to ${Math.max(...s3.map(x => x.links))} others, within the cap`);
  await D.click("#look");
  await waitFor(D, (n) => { const c = window.__longWatch.lobby().counts; return !!c && c.reduce((x, y) => x + y, 0) >= n; }, leavers.length, 12000);
  const L3 = await lobbyOf(D), t3 = await truthOf(leavers);
  ok(JSON.stringify(L3.counts) === JSON.stringify(t3), `a new question is answered by the returned pages: counts ${JSON.stringify(L3.counts)}`);
  ok(errors.length === 0, errors.length ? `console errors: ${errors.slice(0, 3).join(" | ")}` : "no console errors");
} catch (e) {
  ok(false, `test crashed: ${e && e.stack || e}`);
} finally {
  await browser.close(); server.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
