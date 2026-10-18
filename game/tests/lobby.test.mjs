#!/usr/bin/env node
// Milestone 21 tests for The Long Watch: where the others are. A page on the landing screen asks a shared lobby room which
// lantern players are in; pages inside lanterns answer with one number. Node checks of the rules, then three pages in two
// lanterns plus one in the lobby, on the local transport and again through a local Nostr relay.
//
//   node game/tests/lobby.test.mjs            node checks, local transport, then real Trystero/WebRTC via a local Nostr relay
//   node game/tests/lobby.test.mjs --local    skip the WebRTC part
//   CHROME=/path/to/headless_shell            use this browser binary
// Online play over the public relays is not tested here.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createResponder, createAsker, validAsk, validAnswer, suggest, lookText, ROOMS, ROOM_SIZE, LOBBY_PEERS, LOOK_S, LOBBY_JOIN_DELAY_S, ASK_GAP_S, RE_ASK_S, MAX_ASKS, ANSWER_TTL_S, MAX_ANSWERS } from "../js/lobby.js";
import { startRelay } from "./nostr-relay.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const onlyLocal = process.argv.includes("--local");
const onlyRelay = process.argv.includes("--relay-only");
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log("# the lobby rules, in node");
{
  ok(validAsk({ k: "lq" }) && !validAsk({ k: "lq", x: 1 }) && !validAsk({ k: "lr" }) && !validAsk(null) && !validAsk("lq"), "a question is exactly { k: lq }");
  const badA = [{ k: "lr", r: 0 }, { k: "lr", r: ROOMS + 1 }, { k: "lr", r: 1.5 }, { k: "lr", r: "2" }, { k: "lr", r: NaN }, { k: "lr", r: Infinity }, { k: "lr", r: -1 }, { k: "lr", r: 2, n: 5 }, { k: "lr" }, { k: "lr", r: [2] }, { k: "lr", r: "<b>" }, { k: "lq", r: 2 }];
  ok(validAnswer({ k: "lr", r: 1 }) && validAnswer({ k: "lr", r: ROOMS }) && badA.every(m => !validAnswer(m)), `an answer is a whole lantern number 1 to ${ROOMS}; ${badA.length} malformed ones are refused`);
  const mk = () => { const sent = [], mh = [], jh = [], lh = []; return { sent, say: (m, id) => mh.forEach(h => h(m, id)), join: id => jh.forEach(h => h(id)), leave: id => lh.forEach(h => h(id)), net: { send: (m, to) => sent.push([m, to]), onMessage: h => mh.push(h), onPeerJoin: h => jh.push(h), onPeerLeave: h => lh.push(h) } }; };

  // the responder
  {
    const m = mk(), c = { t: 1e6 }; let room = 3;
    const r = createResponder(m.net, () => room, { now: () => c.t });
    m.say({ k: "lq" }, "p1");
    ok(m.sent.length === 0, "a question from someone the page has not seen join gets no answer");
    m.join("p1"); m.say({ k: "lq" }, "p1");
    ok(m.sent.length === 1 && m.sent[0][1] === "p1" && JSON.stringify(m.sent[0][0]) === '{"k":"lr","r":3}', "a known player's question is answered with my lantern number, to them alone");
    m.say({ k: "lq" }, "p1"); m.say({ k: "lq" }, "p1");
    ok(m.sent.length === 2, `a third question inside ${ASK_GAP_S} s is dropped (burst of 2)`);
    c.t += ASK_GAP_S * 1000; m.say({ k: "lq" }, "p1");
    ok(m.sent.length === 3, `after ${ASK_GAP_S} s one more is answered`);
    for (const bad of [{ k: "lq", r: 1 }, { k: "lr", r: 2 }, { k: "zz" }, null, 5, "lq"]) m.say(bad, "p1");
    c.t += 60000; for (const bad of [{ k: "lq", r: 1 }, { k: "lr", r: 2 }, null, "lq"]) m.say(bad, "p1");
    ok(m.sent.length === 3, "malformed questions and answers sent to a responder get no reply");
    room = 0; c.t += 60000; m.say({ k: "lq" }, "p1");
    ok(m.sent.length === 3, "a page that is not in a lantern never answers");
    room = 2; m.join("p2"); c.t += 1; for (let i = 0; i < 300; i++) m.say({ k: "lq" }, "p2");
    ok(m.sent.length === 5 && r.answered() === 5, "a flood of 300 questions from one player gets 2 answers");
    const m2 = mk(); createResponder(m2.net, () => 1, { now: () => 0 });
    for (let i = 0; i < LOBBY_PEERS + 5; i++) m2.join("q" + i);
    for (let i = 0; i < LOBBY_PEERS + 5; i++) m2.say({ k: "lq" }, "q" + i);
    ok(m2.sent.length === LOBBY_PEERS, `only the first ${LOBBY_PEERS} players seen in the lobby are answered`);
  }

  // the asker
  {
    const m = mk(), c = { t: 5e6 };
    const a = createAsker(m.net, { now: () => c.t });
    m.join("a"); m.join("b"); m.join("c");
    ok(m.sent.length === 3 && m.sent.every(([msg]) => JSON.stringify(msg) === '{"k":"lq"}') && m.sent.map(s => s[1]).join() === "a,b,c", "each player who joins the lobby is asked, alone");
    m.say({ k: "lr", r: 2 }, "stranger");
    ok(a.counts().every(n => n === 0), "an answer from a player never asked is ignored");
    m.say({ k: "lr", r: 2 }, "a"); m.say({ k: "lr", r: 5 }, "a");
    ok(a.counts()[2] === 1 && a.counts()[5] === 0, "a player's second answer to the same question changes nothing");
    m.say({ k: "lr", r: 2 }, "b"); m.say({ k: "lr", r: 5 }, "c");
    let k = a.counts();
    ok(k[2] === 2 && k[5] === 1 && k.reduce((x, y) => x + y, 0) === 3, "answers are counted per lantern: 2 in Lantern 2, 1 in Lantern 5");
    ok(JSON.stringify(suggest(k)) === '{"room":2,"count":2}', "the lantern with most answers is suggested");
    for (const bad of [{ k: "lr", r: 0 }, { k: "lr", r: 99 }, { k: "lr", r: "3" }, { k: "lr", r: 3, z: 1 }]) { m.join("d"); m.say(bad, "d"); }
    ok(a.counts().reduce((x, y) => x + y, 0) === 3, "malformed answers are not counted");
    m.sent.length = 0; a.tick();
    ok(m.sent.length === 0, "a tick right after the first question asks nobody again");
    c.t += RE_ASK_S * 1000; a.tick(); c.t += RE_ASK_S * 1000; a.tick(); c.t += RE_ASK_S * 1000; a.tick(); c.t += RE_ASK_S * 1000; a.tick();
    ok(m.sent.length === MAX_ASKS - 1 && m.sent.every(s => s[1] === "d"), `a silent player is asked ${MAX_ASKS} times in all (the first when they joined), then left alone; answered players are not asked again`);
    c.t += ANSWER_TTL_S * 1000 + 1;
    ok(a.counts().every(n => n === 0), `answers older than ${ANSWER_TTL_S} s no longer count`);
    a.stop(); m.join("e"); m.say({ k: "lr", r: 1 }, "e");
    ok(a.counts().every(n => n === 0) && !m.sent.some(s => s[1] === "e"), "after stop() nothing is asked or counted");
  }
  {
    const m = mk(), a = createAsker(m.net, { now: () => 0 });
    for (let i = 0; i < LOBBY_PEERS + 10; i++) { m.join("x" + i); m.say({ k: "lr", r: 4 }, "x" + i); }
    ok(a.counts()[4] === LOBBY_PEERS && a.heard() === LOBBY_PEERS, `only the first ${LOBBY_PEERS} players seen are asked or heard; ${LOBBY_PEERS + 10} answered, ${a.counts()[4]} counted`);
    ok(MAX_ANSWERS === ROOM_SIZE * ROOMS && MAX_ANSWERS >= LOBBY_PEERS, "the answer table can never outgrow its cap");
    const m3 = mk(), a3 = createAsker(m3.net, { now: () => 0 });
    for (let i = 0; i < 6; i++) { m3.join("y" + i); m3.say({ k: "lr", r: 6 }, "y" + i); }
    ok(a3.counts()[6] === 6, "six answers are six");
    m3.leave("y0"); ok(a3.counts()[6] === 5, "a player who leaves the lobby stops counting");
    const big = new Array(7).fill(0); big[1] = ROOM_SIZE; big[3] = 4;
    ok(suggest(big).room === 3, `a full lantern (${ROOM_SIZE}) is not suggested; the next is`);
    ok(suggest(new Array(7).fill(0)) === null && suggest([0, 2, 2, 0, 0, 0, 0]).room === 1, "nobody answered: nothing suggested; a tie goes to the lower number");
    const full = new Array(7).fill(0); full[2] = ROOM_SIZE; ok(suggest(full) === null && /full/i.test(lookText(full, "done")), "all answering lanterns full: nothing suggested, and it says so");
  }
  {
    const none = new Array(7).fill(0), some = [0, 0, 2, 0, 0, 1, 0];
    ok(/Nobody answered/.test(lookText(none, "done")) && /guess/.test(lookText(none, "done")) && /guess/.test(lookText(some, "done")), "the words always call it a guess");
    ok(lookText(some, "done").includes("Lantern 2 looks busiest (2 players)") && lookText(some, "done").includes("1 player in Lantern 5"), `the words come from the counts: "${lookText(some, "done").slice(0, 120)}…"`);
    ok(lookText(none, "looking").includes(`${LOOK_S} seconds`), "while asking the words give the time from the constant");
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

async function enter(page, query, room) { await page.goto(`${base}${query}#room=${room}`); await page.click("#enter"); await waitFor(page, () => window.__longWatch.self().playing, null, 5000); }
const lobbyOf = (p) => p.evaluate(() => window.__longWatch.lobby());

async function scenario(label, mk, query, rooms, timeout) {
  console.log(`\n# ${label}`);
  const [R1, R2] = rooms;
  const A = await mk(), B = await mk(), C = await mk(), D = await mk(), E = await mk();
  await enter(A, query, R1); await enter(B, query, R1); await enter(C, query, R2);
  ok(await waitFor(A, () => window.__longWatch.peers().length === 1, null, timeout) && await waitFor(B, () => window.__longWatch.peers().length === 1, null, timeout), `two pages in Lantern ${R1} see each other; one page in Lantern ${R2} is apart`);
  ok(await waitFor(A, () => window.__longWatch.lobby().inLobby, null, 20000) && await waitFor(B, () => window.__longWatch.lobby().inLobby, null, 20000) && await waitFor(C, () => window.__longWatch.lobby().inLobby, null, 20000), `pages inside lanterns have joined the lobby room too (${LOBBY_JOIN_DELAY_S} s after entering)`);
  // D is on the landing screen and presses the button
  await D.goto(`${base}${query}#room=1`);
  const t0 = Date.now();
  ok(!(await D.locator("#lookpick").isVisible()) && (await D.locator("#lookstate").innerText()) === "", "before asking, the lobby shows no hint and no pick button");
  ok((await lobbyOf(D)).looking === "" && (await lobbyOf(D)).heard === 0, "and the page has joined nothing yet (it asks only when the button is pressed)");
  await D.click("#look");
  const got = await waitFor(D, ([a, b]) => { const c = window.__longWatch.lobby().counts; return !!c && c[a] === 2 && c[b] === 1; }, [R1, R2], timeout);
  const L = await lobbyOf(D);
  if (!got) for (const [n, p] of [["A", A], ["B", B], ["C", C], ["D", D]]) console.log(`  debug ${n}`, JSON.stringify(await lobbyOf(p)).slice(0, 300), JSON.stringify(await p.evaluate(() => window.__longWatch.linkHistory())));
  ok(got, `the lobby page learns 2 players in Lantern ${R1} and 1 in Lantern ${R2} (${((Date.now() - t0) / 1000).toFixed(1)} s; counts ${JSON.stringify(L.counts)})`);
  ok(L.counts.reduce((x, y) => x + y, 0) === 3, "no other lantern has a count: the three players in lanterns are the whole result");
  ok(L.pick === R1 && (await D.locator("#lookpick").innerText()) === `Pick Lantern ${R1}`, `the busiest lantern, ${R1}, is offered`);
  ok(/guess/i.test(L.text) && L.text.includes(`Lantern ${R1} looks busiest (2 players)`) && L.text.includes(`1 player in Lantern ${R2}`), `the words call it a guess and give the numbers: "${L.text.slice(0, 150)}…"`);
  ok(await D.evaluate(() => !document.querySelector("#lookstate").children.length), "the hint is plain text");
  ok((await D.evaluate(() => window.__longWatch.self().playing)) === false && (await D.evaluate(() => window.__longWatch.peers().length)) === 0, "the asking page is in no lantern and sees no players");
  ok((await lobbyOf(A)).answered >= 1 && (await lobbyOf(B)).answered >= 1 && (await lobbyOf(C)).answered >= 1, "each page inside a lantern answered at least once");
  // another lobby page does not count as a lantern, and the first asker's presence in the lobby changes nothing
  await E.goto(`${base}${query}#room=1`); await E.click("#look");
  ok(await waitFor(E, ([a, b]) => { const c = window.__longWatch.lobby().counts; return !!c && c[a] === 2 && c[b] === 1; }, [R1, R2], timeout), "a second page asking at the same time sees the same three players, not the first asker");
  ok(await waitFor(D, () => window.__longWatch.lobby().looking === "done", null, (LOOK_S + 8) * 1000), `asking ends by itself after ${LOOK_S} s and the answer stays on the page`);
  const LD = await lobbyOf(D);
  ok(LD.counts[R1] === 2 && LD.pick === R1, `the finished answer is still shown${LD.counts[R1] === 2 && LD.pick === R1 ? "" : ` (milestone 31 diagnostics: counts ${JSON.stringify(LD.counts)}, pick ${LD.pick}, looking ${LD.looking}, heard ${LD.heard}, text "${String(LD.text).slice(0, 120)}", ${((Date.now() - t0) / 1000).toFixed(1)} s after the first ask)`}`);
  // pick the suggestion, enter, meet them
  await D.click("#lookpick");
  ok((await D.evaluate(() => location.hash)) === `#room=${R1}` && (await D.locator(`#rooms button[data-room="${R1}"]`).getAttribute("aria-pressed")) === "true", "the pick button selects the suggested lantern");
  await D.click("#enter");
  ok(await waitFor(D, () => window.__longWatch.peers().length === 2, null, timeout), `entering it, the player meets both players of Lantern ${R1}`);
  ok((await lobbyOf(D)).looking === "done" && await waitFor(D, () => window.__longWatch.lobby().inLobby, null, 20000), "once inside, the page answers in the lobby like the others");
  ok(await waitFor(E, () => window.__longWatch.lobby().looking === "done", null, (LOOK_S + 8) * 1000), "E's asking ends by itself too");
  // a leaver is no longer counted by a fresh question
  await A.click("#leave");
  ok(await waitFor(B, () => window.__longWatch.peers().length === 1, null, timeout), "A left; B and D remain in the lantern");
  await E.click("#look");
  const fresh = await waitFor(E, ([a, b]) => { const c = window.__longWatch.lobby().counts; return !!c && c[a] === 2 && c[b] === 1; }, [R1, R2], timeout);
  if (!fresh) for (const [n, p] of [["B", B], ["C", C], ["D", D], ["E", E]]) console.log(`  debug ${n}`, JSON.stringify(await lobbyOf(p)).slice(0, 300), JSON.stringify(await p.evaluate(() => window.__longWatch.linkHistory())));
  ok(fresh, "a fresh question counts B and D (2) and C (1); A, who left, is not counted");
  ok(await waitFor(E, () => window.__longWatch.lobby().looking === "done", null, (LOOK_S + 8) * 1000), "the second asking also ends by itself");
  ok(!(await E.evaluate(() => window.__longWatch.self().playing)), "E never joined a lantern");
  for (const p of [A, B, C, D, E]) await p.close();
}

try {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const mk = () => ctx.newPage().then(p => (watch(p, "local"), p));
  if (!onlyRelay) await scenario("local transport (BroadcastChannel)", mk, "?net=local&hour=3&weather=clear", [2, 5], 10000);
  await ctx.close();
  if (!onlyLocal) {
    const relay = await startRelay();
    const cs = [];
    for (let i = 0; i < 5; i++) cs.push(await browser.newContext({ viewport: i === 0 ? { width: 390, height: 800 } : { width: 900, height: 800 }, ...(i === 0 ? { isMobile: true, hasTouch: true } : {}) }));
    let i = 0;
    const mk2 = () => cs[i++ % 5].newPage().then(p => (watch(p, "webrtc"), p));
    await scenario("Trystero over Nostr + WebRTC (relay on 127.0.0.1)", mk2, `?net=nostr&hour=3&weather=clear&relay=${encodeURIComponent(relay.url)}`, [3, 6], 30000);
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
