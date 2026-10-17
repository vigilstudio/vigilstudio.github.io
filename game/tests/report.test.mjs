#!/usr/bin/env node
// Milestone 27: the connection report. A "Connection" line and a Copy button that give numbers only. Everything runs on
// 127.0.0.1 (a tiny Nostr relay and a tiny BitTorrent tracker, and dead ports that refuse), so this proves the counting
// and the text, not the public relays.
//
//   node game/tests/report.test.mjs
//
// U. Unit: figures are clamped whole numbers; a hostile status (strings, addresses, names, NaN) cannot reach the text; the
//    "public relays untested" statement agrees with the newest CHANGELOG entry.
// A. Two players, Nostr relay alive, tracker refused (dead port): the counts match what happened (1 of 1 Nostr open, 1 tracker
//    tried and never opened, 1 player met), the clipboard holds the same text as the page builds, and none of the other
//    player's id, name or any address is in it; the other player leaving is counted once.
// B. ?net=nostr with a refused relay: 0 of 1 open, 1 never opened, nobody met. ?net=torrent with a live tracker: 1 of 1.
// C. Both paths refused: both counted as never opened.
// D. A relay that opens and is then closed: counted as opened and then closed.
// E. No clipboard in the browser: the text is shown selected in a box instead, and says so.
// F. Local test mode says so; leaving clears the line.
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRelay } from "./nostr-relay.mjs";
import { startTracker } from "./tracker-server.mjs";
import { num, reportText, reportLine, reportFigures, PUBLIC_PLAY_TESTED_BY_BUILDERS, REPORT_MAX } from "../js/net/report.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
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

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };

// ---- U. unit checks ----
console.log("# U. the report builder");
ok(num(3.9) === 3 && num(-4) === 0 && num(NaN) === 0 && num(Infinity) === 0 && num("7") === 0 && num({}) === 0 && num(1e9) === REPORT_MAX, "num() gives a whole number 0 to REPORT_MAX, and 0 for anything that is not a finite number");
const hostile = {
  relays: "wss://evil.example/x", relaysOpen: "<script>alert(1)</script>", dropped: "Grey Heron 41", rebuilds: NaN,
  sock: { tried: "ws://10.0.0.5:9", open: { toString: () => "boom" }, everOpened: "abc" },
  byPath: { nostr: { sock: { tried: 5, open: 99, everOpened: -3 }, met: "peer-id-abcdef", left: 1e12, rebuilds: 2.7 }, torrent: "wss://tracker.evil.example" },
  met: "Moss Fox 12", gone: Infinity, links: { both: "x", single: 2 }, host: "wss://relay.example", name: "Moss Fox 12", id: "abcdef0123",
};
for (const kind of ["both", "nostr", "torrent", "local", "zzz"]) {
  const t = reportText(hostile, { kind, lantern: "<b>3</b>", seconds: "later", playersNow: 2 });
  ok(!/evil|script|Heron|Moss|abcdef|10\.0\.0|relay\.example|<|>|boom|NaN|Infinity/.test(t), `kind ${kind}: nothing from a hostile status reaches the text`);
  ok(t.split("\n").every(l => /^[A-Za-z0-9 .:;,()+\-]*$/.test(l)), `kind ${kind}: only plain characters in the text`);
  const line = reportLine(hostile, { kind });
  ok(!/evil|script|Heron|Moss|abcdef|<|>|NaN|Infinity/.test(line), `kind ${kind}: nor into the line`);
}
{
  const f = reportFigures(hostile, { kind: "both" });
  ok(f.paths.nostr.tried === 5 && f.paths.nostr.open === 5 && f.paths.nostr.everOpened === 5 && f.paths.torrent.tried === 0, `figures are clamped to the number tried: ${JSON.stringify(f.paths.nostr)}`);
}
{
  const clean = { relays: 2, relaysOpen: 1, dropped: 0, rebuilds: 0, sock: { tried: 2, open: 1, everOpened: 1 }, met: 3, left: 1 };
  const t = reportText(clean, { kind: "nostr", lantern: 4, seconds: 90, playersNow: 2 });
  ok(/Nostr relays: 1 of 2 Nostr relays open now; 1 never opened/.test(t) && /Players met since entering: 3/.test(t) && /Lantern: 4/.test(t), "a clean status gives the expected lines");
  ok(/not been tested by the builders/.test(t), "the report says public relays are untested");
}
{
  const log = readFileSync(path.join(root, "game", "CHANGELOG.md"), "utf8");
  const newest = log.split(/\n### /).pop();
  ok(PUBLIC_PLAY_TESTED_BY_BUILDERS === false && /online play over the public/i.test(newest), "the report's untested statement agrees with the newest CHANGELOG entry (which still lists public online play as unverified)");
}

// ---- pages ----
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
const browser = await pw.chromium.launch({ ...(await findChrome() ? { executablePath: await findChrome() } : {}), args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
const errors = [];
function watch(page, label) {
  page.on("pageerror", e => errors.push(`${label}: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/WebSocket connection to 'wss?:|ERR_CONNECTION_REFUSED/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
}
async function waitFor(page, fn, arg, timeout = 10000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
}
const dead = "ws://127.0.0.1:1"; // nothing listens on port 1: a refused connection
const conn = (page) => page.evaluate(() => window.__longWatch.connection());
const noTime = (t) => t.replace(/Time in the lantern: \d+ s/, "Time in the lantern: N s");
async function open(query, room, perm) {
  const ctx = await browser.newContext({ viewport: { width: 700, height: 800 }, permissions: perm ? ["clipboard-read", "clipboard-write"] : [] });
  const page = await ctx.newPage();
  watch(page, query.slice(0, 30));
  await page.goto(`${base}${query}#room=${room}`);
  await page.click("#enter");
  return { page, ctx };
}

// ---- A. relay alive, tracker refused, two players ----
{
  console.log("\n# A. Nostr relay alive, tracker refused, two players");
  const relay = await startRelay();
  const q = `?relay=${encodeURIComponent(relay.url)}&tracker=${encodeURIComponent(dead)}`;
  const A = await open(q, 2, true), B = await open(q, 2, false);
  const a = A.page, b = B.page;
  ok(await waitFor(a, () => window.__longWatch.peers().length === 1, null, 40000) && await waitFor(b, () => window.__longWatch.peers().length === 1, null, 40000), "the two pages meet through the relay");
  ok(await waitFor(a, () => /Players met since entering: 1/.test(window.__longWatch.connection().text), null, 8000), "A's report counts 1 player met");
  await a.waitForTimeout(2500); // let the once-a-second sample see the sockets
  const c = await conn(a);
  console.log(c.text.split("\n").map(l => "     | " + l).join("\n"));
  ok(/^Nostr relays: 1 of 1 Nostr relay open now$/m.test(c.text), "the live relay counts as 1 of 1 open");
  ok(/^BitTorrent trackers: 0 of 1 BitTorrent tracker open now; 1 never opened \(refused, unreachable or still connecting\)$/m.test(c.text), "the refused tracker counts as 1 tried, 0 open, 1 never opened");
  ok(/^Way: Nostr relays and BitTorrent trackers together$/m.test(c.text) && /^Lantern: 2$/m.test(c.text) && /^Players here now: 1$/m.test(c.text), "way, lantern and players here match what the test did");
  ok(/^Linked on both ways: 0; on one way only: 1$/m.test(c.text) && /^Players gone again: 0$/m.test(c.text) && /^Connections rebuilt after going silent: 0$/m.test(c.text), "one link on one way, nobody gone, nothing rebuilt");
  ok(/not been tested by the builders/.test(c.text), "the copied text says public relays are untested");
  ok(/^Connection: Nostr 1 of 1 open; BitTorrent 0 of 1 open, 1 never opened; 1 player met\.$/.test(c.line), `the page's line: "${c.line}"`);
  // the Copy button
  await a.click("#copyreport");
  const clip = await a.evaluate(() => navigator.clipboard.readText());
  const after = await conn(a);
  ok(noTime(clip) === noTime(after.text), "the clipboard holds exactly the report the page builds");
  ok(/Copied/.test(after.copyState) && after.fallback === "", `the page says it was copied ("${after.copyState}")`);
  // nothing from the other player
  const me = await a.evaluate(() => window.__longWatch.self()), other = (await a.evaluate(() => window.__longWatch.peers()))[0];
  const bad = [other.id, other.id.slice(0, 6), other.name, other.name.split(" ")[0], me.id, me.name, "127.0.0.1", "ws:", "wss:", String(new URL(relay.url).port)];
  ok(bad.every(s => !clip.includes(s)) && !bad.some(s => c.line.includes(s)), "no player id, name, relay address or port is in the copied text or the line");
  ok(clip.split("\n").every(l => /^[A-Za-z0-9 .:;,()+\-]*$/.test(l)) && clip.length < 900, `the copied text is plain characters only (${clip.length} characters)`);
  // the other player leaves: gone once, met stays
  await b.click("#leave");
  ok(await waitFor(a, () => /Players gone again: 1/.test(window.__longWatch.connection().text), null, 15000), "when B leaves, A counts 1 player gone");
  const c2 = await conn(a);
  ok(/Players met since entering: 1/.test(c2.text) && /Players here now: 0/.test(c2.text), "met stays 1, players here now 0");
  await a.click("#leave");
  const c3 = await conn(a);
  ok(c3.line === "" && c3.text === "", "leaving clears the line");
  await A.ctx.close(); await B.ctx.close(); relay.close();
}

// ---- B. one path chosen by hand ----
{
  console.log("\n# B. ?net=nostr with a refused relay, ?net=torrent with a live tracker");
  const { page, ctx } = await open(`?net=nostr&relay=${encodeURIComponent(dead)}`, 3, false);
  await page.waitForTimeout(3000);
  const c = await conn(page);
  ok(/^Way: Nostr relays$/m.test(c.text) && /^Nostr relays: 0 of 1 Nostr relay open now; 1 never opened/m.test(c.text) && !/BitTorrent/.test(c.text.replace(/Way:.*/, "")), `refused relay: 0 of 1, 1 never opened, no tracker line ("${c.line}")`);
  ok(/Players met since entering: 0/.test(c.text) && /^Connection: Nostr 0 of 1 open, 1 never opened; 0 players met\.$/.test(c.line), "nobody met");
  await ctx.close();
  const tracker = await startTracker();
  const t = await open(`?net=torrent&tracker=${encodeURIComponent(tracker.url)}`, 3, false);
  ok(await waitFor(t.page, () => /BitTorrent trackers: 1 of 1 BitTorrent tracker open now/.test(window.__longWatch.connection().text), null, 15000), "a live tracker counts 1 of 1 open");
  const ct = await conn(t.page);
  ok(!/never opened/.test(ct.text) && /^Way: BitTorrent trackers$/m.test(ct.text), "and nothing is counted as never opened");
  await t.ctx.close(); tracker.close();
}

// ---- C. both refused ----
{
  console.log("\n# C. both paths refused");
  const { page, ctx } = await open(`?relay=${encodeURIComponent(dead)}&tracker=${encodeURIComponent(dead)}`, 4, false);
  ok(await waitFor(page, () => /Nostr relays: 0 of 1 Nostr relay open now; 1 never opened/.test(window.__longWatch.connection().text) && /BitTorrent trackers: 0 of 1 BitTorrent tracker open now; 1 never opened/.test(window.__longWatch.connection().text), null, 12000), "both counted as 0 of 1 open and 1 never opened");
  const c = await conn(page);
  ok(/^Connection: Nostr 0 of 1 open, 1 never opened; BitTorrent 0 of 1 open, 1 never opened; 0 players met\.$/.test(c.line), `the line: "${c.line}"`);
  await ctx.close();
}

// ---- D. a relay that opens and then closes ----
{
  console.log("\n# D. a relay that opens and is then closed");
  const relay = await startRelay();
  const { page, ctx } = await open(`?net=nostr&relay=${encodeURIComponent(relay.url)}`, 5, false);
  ok(await waitFor(page, () => /Nostr relays: 1 of 1 Nostr relay open now/.test(window.__longWatch.connection().text), null, 15000), "the relay is open");
  await page.waitForTimeout(1500);
  relay.close(); // the relay goes away; the page keeps trying to reconnect
  ok(await waitFor(page, () => /Nostr relays: 0 of 1 Nostr relay open now; 1 opened and then closed/.test(window.__longWatch.connection().text), null, 15000), "after the relay closed it is counted as opened and then closed (not as never opened)");
  const c = await conn(page);
  ok(!/never opened/.test(c.text), "and not as never opened");
  await ctx.close();
}

// ---- E. no clipboard ----
{
  console.log("\n# E. a browser with no clipboard");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true }); });
  const page = await ctx.newPage(); watch(page, "E");
  await page.goto(`${base}?net=local#room=6`); await page.click("#enter");
  await page.click("#copyreport");
  const c = await conn(page);
  ok(c.fallback.length > 0 && noTime(c.fallback) === noTime(c.text) && /copy it by hand/.test(c.copyState), `the text is shown in a box and the page says to copy by hand ("${c.copyState}")`);
  ok(await page.evaluate(() => { const t = document.getElementById("copyfallback"); return document.activeElement === t && t.selectionEnd - t.selectionStart === t.value.length; }), "the whole text is selected");
  // ---- F. local mode (same page) ----
  console.log("\n# F. local test mode");
  ok(/^Connection: local test mode, no relays\.$/.test(c.line) && /^Way: local test mode \(no relays\)$/m.test(c.text) && !/Nostr relays:|BitTorrent trackers:/.test(c.text), `local mode says so ("${c.line}")`);
  await page.click("#leave");
  const c2 = await conn(page);
  ok(c2.line === "" && await page.evaluate(() => document.getElementById("copyfallback").hidden), "leaving clears the line and hides the box");
  await ctx.close();
}

ok(errors.length === 0, `no console errors${errors.length ? ":\n  " + errors.join("\n  ") : ""}`);
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
