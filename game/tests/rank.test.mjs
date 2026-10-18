#!/usr/bin/env node
// Milestone 10 tests for The Long Watch: the lamplighter rank, earned only by helping other players.
//
//   node game/tests/rank.test.mjs            node checks, local transport, then real Trystero/WebRTC via a local Nostr relay
//   node game/tests/rank.test.mjs --local    skip the WebRTC part
//
// Part 0 (node): the rank steps, every kind of deed counted once, the gaps between gifts and relights, the caps (500 deed
// keys remembered per visit, 100000 points), bad saved numbers, the message on a fake mesh (sent on change, to a newcomer
// and every 5 s; bad, extra-field, unknown-sender and flooded messages change nothing), and the shades module telling the
// game when I helped relight a friend (only if I stood by long enough, only if the friend was relit early).
// Then pages: A gives B items (a gift that arrives is a deed; receiving earns nothing), three confirmed gifts make A a
// Lamplighter, B sees the title in its list and A's mark, A's points survive a reload, a gift too soon after another earns
// no point, and (local run) forged rank messages change nothing.
// SHOTS=dir saves screenshots at 375 and 1100 px wide.
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRelay } from "./nostr-relay.mjs";
import { generateWorld } from "../js/world.js";
import { createRank, createRankNet, rankFor, titleFor, cleanPoints, pointsToNext, TITLES, THRESHOLDS, MAX_RANK, MAX_POINTS, MAX_SEEN, GAPS_MS, DEEDS, RESEND_MS } from "../js/rank.js";
import { cleanSave } from "../js/inventory.js";
import { createShades, shadeCount, SLOT_MS, SNUFF_S, RELIGHT_R, RELIGHT_S, HELP_S } from "../js/shades.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const onlyLocal = process.argv.includes("--local");

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const HOUR = 3;
const world = generateWorld();

// ---- 0. node: the rules ----
console.log("# rank, in node");
{
  ok(TITLES.length === 5 && TITLES[0] === "" && TITLES[1] === "Lamplighter" && THRESHOLDS.join() === "0,3,10,25,60" && MAX_RANK === 4, "five steps: none, Lamplighter at 3 points, then 10, 25 and 60");
  ok([0, 2, 3, 9, 10, 24, 25, 59, 60, 99999].map(rankFor).join() === "0,0,1,1,2,2,3,3,4,4" && rankFor(NaN) === 0 && rankFor(-5) === 0 && rankFor(undefined) === 0, "points map to ranks at the steps; odd values give rank 0");
  ok(titleFor(0) === "" && titleFor(1) === "Lamplighter" && titleFor(4) === "Long watcher" && titleFor(5) === "" && titleFor(-1) === "" && titleFor(1.5) === "" && titleFor("1") === "" && titleFor(null) === "", "a title is looked up from a whole number 0..4 only");
  ok(cleanPoints(7) === 7 && cleanPoints(-1) === 0 && cleanPoints(1.5) === 0 && cleanPoints("9") === 0 && cleanPoints(NaN) === 0 && cleanPoints(null) === 0 && cleanPoints(MAX_POINTS + 50) === MAX_POINTS, "saved points: whole numbers only, never above the cap");
  ok(pointsToNext(0) === 3 && pointsToNext(2) === 1 && pointsToNext(3) === 7 && pointsToNext(60) === 0, "points to the next rank");
  ok(cleanSave({ help: 12 }).help === 12 && cleanSave({ help: -3 }).help === 0 && cleanSave({ help: "12" }).help === 0 && cleanSave({ help: 1e9 }).help === 0 && cleanSave(null).help === 0, "a save keeps the help points only when they are a sane whole number");

  const clock = { t: 0 };
  const mk = (start = 0) => { const events = [], saves = []; const r = createRank(start, { now: () => clock.t, onEvent: (...a) => events.push(a), persist: () => saves.push(r.points) }); return { r, events, saves }; };
  {
    const { r, events, saves } = mk();
    ok(r.points === 0 && r.rank === 0, "a new player has no rank");
    clock.t = 1000;
    ok(r.credit("beacon", "2") && r.points === 1 && saves.join() === "1", "a deed adds one point and saves at once");
    ok(!r.credit("beacon", "2") && r.points === 1, "the same deed again (same key) adds nothing");
    ok(r.credit("beacon", "3") && r.credit("note", "5.0") && r.points === 3 && r.rank === 1, "three different deeds make a Lamplighter");
    ok(events.filter(e => e[0] === "rank").length === 1 && events.find(e => e[0] === "rank")[1] === 1 && events.filter(e => e[0] === "deed").length === 3, "the game is told of each deed and of the new rank, once");
    ok(!r.credit("bogus", "1") && !r.credit("", "1") && !r.credit("toString", "1") && !r.credit("__proto__", "1") && !r.credit(undefined, "1") && r.points === 3, "an unknown kind of deed adds nothing");
    ok(!r.credit("shade", undefined) && !r.credit("shade", null) && !r.credit("shade", {}) && !r.credit("shade", 1.5) && !r.credit("shade", NaN) && r.points === 3 && r.credit("shade", 7) && r.points === 4, "a deed needs a text or whole-number key");
    clock.t = 2000;
    ok(r.credit("gift", "a") && !r.credit("gift", "b") && r.points === 5, `a second gift within ${GAPS_MS.gift / 1000} s earns nothing`);
    clock.t += GAPS_MS.gift - 1; ok(!r.credit("gift", "c"), "just inside the gap still nothing");
    clock.t += 2; ok(r.credit("gift", "d") && r.points === 6, "just after the gap it counts");
    ok(r.credit("relight", "x") && !r.credit("relight", "y") && r.credit("shade", "k") , `a relight is limited to one every ${GAPS_MS.relight / 1000} s, other kinds are not held up by it`);
    r.newVisit();
    ok(r.seenCount() === 0 && r.credit("gift", "a") && r.points === 9, "a new visit forgets the keys (and the gaps); the points stay");
    ok(DEEDS.join() === Object.keys(GAPS_MS).join() && DEEDS.length === 7, "seven kinds of deed");
    clock.t += 1000; ok(r.credit("stone", "1.1") && !r.credit("stone", "1.2") && r.credit("note", "zz"), `a stone glow earns a point, a second within ${GAPS_MS.stone / 1000} s does not, other kinds are not held up`);
    clock.t += GAPS_MS.stone; ok(r.credit("stone", "1.3"), "after the gap another stone glow counts");
  }
  {
    const { r } = mk(MAX_POINTS - 1);
    ok(r.credit("note", "1") && r.points === MAX_POINTS && !r.credit("note", "2") && r.points === MAX_POINTS, `points stop at ${MAX_POINTS}`);
    const f = mk();
    for (let i = 0; i < MAX_SEEN + 50; i++) f.r.credit("beacon", String(i));
    ok(f.r.seenCount() === MAX_SEEN && f.r.points === MAX_SEEN && !f.r.credit("beacon", "new") && f.r.points === MAX_SEEN, `a full list of ${MAX_SEEN} keys refuses new deeds for this visit and forgets none`);
    ok(!f.r.credit("beacon", "0") && f.r.points === MAX_SEEN, "and an old key still counts only once");
    const a = mk(5);
    ok(a.r.adopt(9) && a.r.points === 9 && !a.r.adopt(4) && a.r.points === 9 && !a.r.adopt(-2) && !a.r.adopt("20") && !a.r.adopt(1.5) && a.r.points === 9, "adopting another tab's save only ever raises the points");
    const b = mk(-4); const c = mk(2.5); const d = mk("12");
    ok(b.r.points === 0 && c.r.points === 0 && d.r.points === 0, "bad starting points become 0");
  }

  // the message on a fake mesh
  const mkNet = () => { const sent = [], hs = [], joins = [], leaves = []; return { sent, hs, joins, leaves, net: { selfId: "me", send: (msg, to) => sent.push([msg, to]), onMessage: h => hs.push(h), onPeerJoin: h => joins.push(h), onPeerLeave: h => leaves.push(h) } }; };
  {
    const m = mkNet(), peers = new Map(), me = {}, c = { t: 100000 };
    const rank = createRank(0, { now: () => c.t });
    const rn = createRankNet(m.net, me, peers, rank, { now: () => c.t });
    const say = (msg, id) => m.hs.forEach(h => h(msg, id));
    ok(me.rank === 0, "my rank is on my player record");
    m.joins.forEach(h => h("p1"));
    ok(m.sent.length === 1 && JSON.stringify(m.sent[0]) === JSON.stringify([{ k: "rk", r: 0 }, "p1"]), "a newcomer is told my rank (a single number)");
    rank.credit("beacon", "1"); rank.credit("beacon", "2"); rank.credit("beacon", "3");
    rn.tick();
    ok(me.rank === 1 && m.sent.length === 2 && m.sent[1][0].r === 1 && m.sent[1][1] === undefined, "when my rank changes everyone is told at once");
    rn.tick(); ok(m.sent.length === 2, "and not again until 5 s have passed");
    c.t += RESEND_MS; rn.tick(); ok(m.sent.length === 3, `then every ${RESEND_MS / 1000} s`);
    const p = { id: "p1" }; peers.set("p1", p);
    c.t += 3000;
    say({ k: "rk", r: 2 }, "p1"); ok(p.rank === 2, "a good rank from a known player is kept");
    const before = JSON.stringify(p);
    c.t += 5000;
    const bad = [{ k: "rk", r: 5 }, { k: "rk", r: -1 }, { k: "rk", r: 1.5 }, { k: "rk", r: "3" }, { k: "rk", r: NaN }, { k: "rk", r: null }, { k: "rk", r: [1] }, { k: "rk", r: true }, { k: "rk" }, { k: "rk", r: 3, x: 1 }, { k: "rk", r: 3, t: "Boss" }, { k: "rkx", r: 3 }, { k: "RK", r: 3 }, null, 7, "rk", [], { r: 3 }];
    for (const msg of bad) { say(msg, "p1"); c.t += 1000; }
    ok(JSON.stringify(p) === before, `${bad.length} bad, extra-field and unknown messages change nothing`);
    say({ k: "rk", r: 4 }, "stranger");
    ok(!peers.has("stranger"), "a rank from someone who never said hello is ignored");
    c.t += 10000;
    for (let i = 0; i < 300; i++) say({ k: "rk", r: i % 5 }, "p1");
    ok([0, 1, 2, 3, 4].includes(p.rank), `a flood of 300 messages is cut by the rate limit (rank ${p.rank}, still a number 0..4)`);
    c.t += 10000; say({ k: "rk", r: 0 }, "p1"); ok(p.rank === 0, "after the flood a real update is heard again");
    m.leaves.forEach(h => h("p1"));
  }

  // the shades module tells the game when I helped relight a friend
  {
    let quietSlot = 5000; while (shadeCount(world.seed, quietSlot) !== 0 || shadeCount(world.seed, quietSlot + 1) !== 0) quietSlot++;
    const mk2 = () => {
      const m = mkNet(), peers = new Map(), me = { seed: 4242, x: 20, y: 20, lamp: 0 }, c = { ms: quietSlot * SLOT_MS + 1000, perf: 10000 }, events = [];
      const q = createShades(m.net, world, me, peers, { now: () => c.perf, clock: () => c.ms, onEvent: (t, i, x) => events.push([t, i, x]), reachFor: () => 3.2 });
      const say = (msg, id) => m.hs.forEach(h => h(msg, id));
      const adv = (secs, dt = 0.1) => { for (let i = 0; i < Math.round(secs / dt); i++) { c.perf += dt * 1000; q.tick(dt); } };
      const friend = (dx, dy) => { const p = { id: "f1", seed: 777, x: me.x + dx, y: me.y + dy, lamp: 0, snuffed: false }; peers.set("f1", p); return p; };
      return { me, q, c, events, say, adv, friend, peers };
    };
    const helped = (T) => T.events.filter(e => e[0] === "helped");
    ok(HELP_S <= RELIGHT_S && HELP_S > 0, `standing by for ${HELP_S} s is what counts as help (a relight takes ${RELIGHT_S} s)`);
    { const T = mk2(); T.friend(1, 0); T.adv(1); T.say({ k: "sf", z: 1 }, "f1"); T.adv(HELP_S + 0.3); T.say({ k: "sf", z: 0 }, "f1");
      ok(helped(T).length === 1 && helped(T)[0][1] === 777, "a friend snuffed beside me and relit early: I helped (the game gets their seed, once)"); }
    { const T = mk2(); T.friend(5, 0); T.adv(1); T.say({ k: "sf", z: 1 }, "f1"); T.adv(3); T.say({ k: "sf", z: 0 }, "f1");
      ok(helped(T).length === 0, `a friend ${5} tiles away (reach ${RELIGHT_R}) relit early: I did not help`); }
    { const T = mk2(); T.friend(1, 0); T.adv(1); T.say({ k: "sf", z: 1 }, "f1"); T.adv(0.3); T.say({ k: "sf", z: 0 }, "f1");
      ok(helped(T).length === 0, "I was beside them for only 0.3 s: not help"); }
    { const T = mk2(); T.friend(1, 0); T.adv(1); T.say({ k: "sf", z: 1 }, "f1"); T.adv(SNUFF_S + 0.5); T.say({ k: "sf", z: 0 }, "f1");
      ok(helped(T).length === 0, `their lantern lit itself after ${SNUFF_S} s: nobody helped`); }
    { const T = mk2(); T.friend(1, 0); T.adv(1); T.say({ k: "sf", z: 0 }, "f1"); T.adv(3); T.say({ k: "sf", z: 0 }, "f1");
      ok(helped(T).length === 0, "a lit friend saying 'lit' again: not help"); }
    { const T = mk2(); const f = T.friend(1, 0); T.adv(1); T.say({ k: "sf", z: 1 }, "f1"); T.adv(0.5); f.x += 6; T.adv(1); f.x -= 6; T.adv(0.5); T.say({ k: "sf", z: 0 }, "f1");
      ok(helped(T).length === 0, "walking away resets the time beside them: 0.5 s + 0.5 s in two visits is not help"); }
    { const T = mk2(); T.friend(1, 0); T.adv(1); T.say({ k: "sf", z: 1 }, "f1"); T.adv(1.5); T.say({ k: "sf", z: 0 }, "f1"); T.adv(1); T.say({ k: "sf", z: 1 }, "f1"); T.adv(0.2); T.say({ k: "sf", z: 0 }, "f1");
      ok(helped(T).length === 1, "a second snuff relit at once is a new episode and needs its own time beside them"); }
    { const T = mk2(); T.friend(1, 0); T.adv(1); T.say({ k: "sf", z: 1 }, "f1"); T.adv(1.5); T.me.snuffed = true; T.say({ k: "sf", z: 0 }, "f1");
      ok(helped(T).length === 0, "if my own lantern is out I cannot have helped"); }
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
const rk = (page) => page.evaluate(() => window.__longWatch.rank());
const STORE = "vigil.longwatch.v1";
async function shoot(page, name) {
  if (!shots) return;
  await mkdir(shots, { recursive: true });
  const keep = page.viewportSize();
  for (const [w, h] of [[375, 760], [1100, 800]]) { await page.setViewportSize({ width: w, height: h }); await sleep(500); await page.locator(".stage").screenshot({ path: path.join(shots, `${name}-${w}.png`) }); }
  await page.setViewportSize(keep); await sleep(200);
}

async function scenario(label, mk, query, room, opts = {}) {
  console.log(`\n# ${label}`);
  const local = query.includes("net=local");
  const [A, B] = [await mk(), await mk()];
  const url = `${base}${query}#room=${room}`;
  // A starts with six driftwood (written into its saved character before it enters, as a player's own save would hold them)
  await A.goto(url); await B.goto(url);
  await A.evaluate(([key, local]) => { const st = local ? sessionStorage : localStorage; const s = JSON.parse(st.getItem(key)); s.inv = { driftwood: 6, reeds: 0, berries: 0 }; st.setItem(key, JSON.stringify(s)); }, [STORE, local]);
  await A.goto(url); await A.reload();
  await A.click("#enter"); await B.click("#enter");
  const meet = async () => await waitFor(A, () => window.__longWatch.peers().length === 1, null, opts.timeout) && await waitFor(B, () => window.__longWatch.peers().length === 1, null, opts.timeout);
  ok(await meet(), "each page sees exactly one other player");
  ok((await A.evaluate(() => window.__longWatch.give().inv.driftwood)) === 6, "A holds six driftwood");
  const stand = async () => { // both stand within 3 tiles, each sure the other is there
    await A.evaluate(() => window.__longWatch.teleport(window.__longWatch.self().x, window.__longWatch.self().y));
    const pa = await A.evaluate(() => { const s = window.__longWatch.self(); return [s.x, s.y]; });
    await B.evaluate(([x, y]) => window.__longWatch.teleport(x + 0.8, y), pa);
    return await waitFor(A, () => window.__longWatch.give().target !== null, null, 8000) && await waitFor(B, () => window.__longWatch.peers().length === 1, null, 8000);
  };
  ok(await stand(), "A and B stand together");

  let r = await rk(A);
  ok(r.panel && r.points === 0 && r.rank === 0 && /no rank yet/i.test(r.text) && /3 more/.test(r.text), `the rank panel shows: "${r.text}"`);
  const gift = async () => {
    await A.evaluate(() => window.__longWatch.offer(0));
    if (!await waitFor(B, () => window.__longWatch.give().incoming !== null, null, 6000)) return false;
    await B.evaluate(() => window.__longWatch.accept());
    return await waitFor(A, () => window.__longWatch.give().outgoing === null && window.__longWatch.give().out.length === 0 && /confirmed/.test(window.__longWatch.give().info), null, 8000);
  };
  ok(await gift(), "A gives B one driftwood and B confirms it arrived");
  ok(await waitFor(A, () => window.__longWatch.rank().points === 1, null, 3000), "A earned one point for the gift that arrived");
  r = await rk(A);
  ok(/gift/.test(r.info) && r.rank === 0, `A is told: "${r.info}"`);
  const rb = await rk(B);
  ok(rb.points === 0 && (await B.evaluate(() => window.__longWatch.give().inv.driftwood)) === 1, "B, who only received, earned nothing");

  // a second gift straight away earns nothing
  ok(await gift(), "A gives a second driftwood at once");
  await sleep(300);
  ok((await rk(A)).points === 1, "no point: gifts count at most one every 4 s");
  await sleep(4200);
  ok(await gift() && await waitFor(A, () => window.__longWatch.rank().points === 2, null, 3000), "after 4 s a gift counts (2 points)");
  await sleep(4200);
  ok(await gift() && await waitFor(A, () => window.__longWatch.rank().rank === 1, null, 3000), "the third counted gift makes A a Lamplighter");
  await waitFor(A, () => /Your rank: Lamplighter/.test(window.__longWatch.rank().text), null, 3000);
  r = await rk(A);
  ok(r.points === 3 && r.title === "Lamplighter" && /Lamplighter/.test(r.info) && /Lamplighter/.test(r.text), `A's panel: "${r.text}" / "${r.info}"`);
  ok(await waitFor(B, () => window.__longWatch.rank().peerRanks.some(p => p.rank === 1), null, 8000), "B hears that A's rank is 1");
  ok(await waitFor(B, () => [...document.querySelectorAll("#peers li")].some(li => /Lamplighter/.test(li.textContent)), null, 5000), "B's player list shows the title beside A's generated name");
  ok(await waitFor(A, () => [...document.querySelectorAll("#peers li")].some(li => /Lamplighter \(you\)/.test(li.textContent)), null, 5000), "A's own entry shows the title");
  const saved = (await rk(A)).saved;
  ok(saved === 3, "A's points were saved in A's own browser at once");
  ok((await rk(B)).points === 0, "B's rank is untouched");
  await shoot(B, opts.shot || "rank");

  // a reload keeps the points
  await A.reload();
  const r2 = await rk(A);
  ok(r2.points === 3 && r2.rank === 1, "after a reload A still has 3 points and its rank");
  await A.click("#enter");
  ok(await meet(), "A is back in the lantern");
  ok(await waitFor(B, () => window.__longWatch.rank().peerRanks.some(p => p.rank === 1), null, 8000), "B hears A's rank again after the reload");
  ok((await rk(A)).points === 3, "and coming back earned nothing by itself");

  if (opts.local) await forged(A, B);
}

async function forged(A, B) {
  console.log("\n# forged rank messages (local run)");
  const ctx = B.context();
  const E = await ctx.newPage();
  await E.goto(`${base}?net=local`);
  const post = (from, to, msgs) => E.evaluate(([room, from, to, msgs]) => { const ch = new BroadcastChannel(`vigil-long-watch:lantern-${room}`); for (const d of msgs) ch.postMessage({ k: "data", d, from, to }); ch.close(); }, [6, from, to, msgs]);
  const idA = await A.evaluate(() => window.__longWatch.self().id), idB = await B.evaluate(() => window.__longWatch.self().id);
  const peerRank = () => B.evaluate(() => window.__longWatch.rank().peerRanks.map(p => p.rank).join());
  await sleep(5500); // A's own rank is repeated every 5 s, so wait for a clean reading
  const before = await peerRank();
  ok(before === "1", `B shows A at rank 1 (${before})`);
  await sleep(2500);
  await post(idA, idB, [{ k: "rk", r: 9 }, { k: "rk", r: -1 }, { k: "rk", r: 2.5 }, { k: "rk", r: "4" }, { k: "rk", r: 4, extra: 1 }, { k: "rk", r: 4, t: "Boss" }, { k: "rk" }, { k: "rk", r: [4] }, { k: "rk", r: null }, "rk", 42]);
  await sleep(500);
  ok(await peerRank() === before, "B ignored out-of-range, fractional, text, array, extra-field and missing rank values");
  await post("stranger-never-said-hello", idB, [{ k: "rk", r: 4 }]);
  await sleep(300);
  ok(await peerRank() === before, "a rank from someone who never said hello is ignored");
  await post(idA, idB, Array.from({ length: 500 }, (_, i) => ({ k: "rk", r: 2 + (i % 3) })));
  await sleep(700);
  const after = await peerRank();
  ok(/^[0-4]$/.test(after) && B && (await B.evaluate(() => !!document.querySelector("#peers li"))), `a flood of 500 well-formed messages is cut by the rate limit; the page still works (shows rank ${after})`);
  await E.close();
}

// ---- 1. local transport ----
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const mk = () => ctx.newPage().then(p => (watch(p, "local"), p));
  await scenario("local transport (BroadcastChannel)", mk, `?net=local&hour=${HOUR}`, 6, { local: true, shot: "rank-local" });
  await ctx.close();
}

// ---- 2. real WebRTC through a local Nostr relay ----
if (!onlyLocal) {
  const relay = await startRelay();
  const c = [await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }), await browser.newContext({ viewport: { width: 1000, height: 800 } }), await browser.newContext({ viewport: { width: 800, height: 700 } })];
  let i = 0;
  const mk = () => c[i++ % 3].newPage().then(p => (watch(p, "webrtc"), p));
  await scenario("Trystero over Nostr + WebRTC (relay on 127.0.0.1)", mk, `?net=nostr&hour=${HOUR}&relay=${encodeURIComponent(relay.url)}`, 5, { timeout: 30000, shot: "rank-webrtc" });
  for (const x of c) await x.close().catch(() => {});
  relay.close();
}

ok(errors.length === 0, `no console errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
