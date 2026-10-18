#!/usr/bin/env node
// Milestone 28: spare relays. The list of relays and trackers lives in js/net/relays.js with where each came from; each socket's
// opens and failures are counted (js/net/sockets.js); when fewer than MIN_OPEN_RELAYS sockets of a path are open SPARE_AFTER_MS
// after joining, and nobody is linked on that path yet, the spares are added. Everything runs on 127.0.0.1: a port nothing
// listens on (refuses), a server that opens and then closes, a server that accepts and never answers, and live test relays
// and trackers. Public relays are not reached (and could not be from the sandbox).
//
//   node game/tests/spares.test.mjs
//
// U. the list: sources named, primaries equal Trystero's own pick for this app id, spares apart from them, flags safe
// A. refused first choice, one live spare: two pages meet through the spare after the wait, counts say so
// B. first choice that never answers + a server that opens then closes + live spare
// C. two first-choice relays open: no spare is added
// D. one first choice open and a player linked: no spare is added (links are not interrupted)
// E. BitTorrent: refused tracker, live spare tracker
// F. the page line and the copied report show the counts and no address
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRelay } from "./nostr-relay.mjs";
import { startTracker } from "./tracker-server.mjs";
import net from "node:net";
import { createHash } from "node:crypto";
import { pickTestList } from "../js/net/transport.js";
import { RELAYS, PRIMARY, SPARES, MIN_OPEN_RELAYS, SPARE_AFTER_MS } from "../js/net/relays.js";
import { PUBLIC_PLAY_TESTED_BY_BUILDERS } from "../js/net/report.js";

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


const only = process.env.ONLY || ""; // e.g. ONLY=E runs just section E (for looking at one failure)
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };
const errors = [];
function watch(page, label) {
  page.on("pageerror", e => errors.push(`${label}: ${e.message}`));
  page.on("console", m => { if (m.type() === "error" && !/WebSocket connection to 'wss?:|ERR_CONNECTION_REFUSED|ERR_CONNECTION_CLOSED|ERR_INVALID_HTTP_RESPONSE/.test(m.text()) && !/User-Initiated Abort, reason=Close called/.test(m.text())) errors.push(`${label}: ${m.text()}`); });
}
async function waitFor(page, fn, arg, timeout = 10000) {
  try { await page.waitForFunction(fn, arg, { timeout, polling: 100 }); return true; } catch { return false; }
}
const ns = (page) => page.evaluate(() => window.__longWatch.netStatus());
const dead = "ws://127.0.0.1:1";

// a server that accepts connections and never answers (the socket stays connecting)
function startMute() { const socks = new Set(); const s = net.createServer((c) => { socks.add(c); c.on("data", () => {}); c.on("error", () => {}); }); return new Promise(r => s.listen(0, "127.0.0.1", () => r({ url: `ws://127.0.0.1:${s.address().port}`, close: () => { for (const c of socks) c.destroy(); s.close(); } }))); }
// a server that completes the WebSocket handshake and then closes the connection
function startCloser() {
  const s = createServer((req, res) => res.writeHead(426).end());
  s.on("upgrade", (req, socket) => {
    const key = req.headers["sec-websocket-key"];
    const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    setTimeout(() => socket.destroy(), 200); socket.on("error", () => {});
  });
  return new Promise(r => s.listen(0, "127.0.0.1", () => r({ url: `ws://127.0.0.1:${s.address().port}`, close: () => s.close() })));
}

async function pair(label, query, room) {
  console.log(`\n# ${label}`);
  const c1 = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const c2 = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const a = await c1.newPage(), b = await c2.newPage();
  watch(a, label + " A"); watch(b, label + " B");
  await a.goto(`${base}${query}#room=${room}`); await b.goto(`${base}${query}#room=${room}`);
  await a.click("#enter"); await b.click("#enter");
  return { a, b, close: async () => { await c1.close(); await c2.close(); } };
}
const q = (o) => "?" + Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
const S = SPARE_AFTER_MS / 1000;

// ---- U. the list and the flags ----
{
  console.log("\n# U. the list and the flags");
  const read = async (k) => (await readFile(path.join(root, "game/vendor/trystero-0.25.4", k, "index.mjs"), "utf8")).match(/defaultRelayUrls = \[([\s\S]*?)\]\.map/)[1].split(",").map(s => s.trim().replace(/"/g, "")).filter(Boolean).map(h => "wss://" + h);
  const nostrAll = await read("nostr"), torrentAll = await read("torrent");
  const utils = await import(path.join(root, "game/vendor/trystero-0.25.4/core/utils.mjs"));
  const { APP_ID } = await import("../js/net/transport.js");
  const pick = utils.shuffle(nostrAll, utils.strToNum(APP_ID)).slice(0, 5);
  ok(JSON.stringify(PRIMARY.nostr) === JSON.stringify(pick), `the Nostr first choices are exactly the 5 Trystero's own shuffle picks for this app id (${PRIMARY.nostr.length})`);
  ok(JSON.stringify(PRIMARY.torrent) === JSON.stringify(torrentAll.slice(0, 3)), "the tracker first choices are the first 3 of Trystero's list");
  const all = [...RELAYS.nostr, ...RELAYS.torrent];
  ok(all.every(r => /^wss:\/\//.test(r.url) && ["primary", "spare"].includes(r.role) && ["trystero", "memory", "search"].includes(r.source)), `every one of the ${all.length} entries is wss, has a role and names its source`);
  ok(all.filter(r => r.source === "trystero").every(r => nostrAll.includes(r.url) || torrentAll.includes(r.url)), "every entry whose source is \"trystero\" is in the vendored Trystero list");
  ok(new Set(all.map(r => r.url)).size === all.length, "no address appears twice");
  ok(SPARES.nostr.length >= 3 && SPARES.torrent.length >= 1 && SPARES.nostr.every(u => !PRIMARY.nostr.includes(u)) && SPARES.torrent.every(u => !PRIMARY.torrent.includes(u)), `spares: ${SPARES.nostr.length} Nostr, ${SPARES.torrent.length} tracker, none also a first choice`);
  ok(RELAYS.nostr.some(r => r.source === "memory"), "entries from memory are marked as such");
  ok(MIN_OPEN_RELAYS === 2 && SPARE_AFTER_MS === 10000, "the thresholds are 2 open and 10 s");
  ok(PUBLIC_PLAY_TESTED_BY_BUILDERS === false, "the report still says public play is untested by the builders");
  const l = pickTestList("?spare=ws://127.0.0.1:5,wss://evil.example/,ws://10.0.0.5:1,ws://localhost:6,ws://127.0.0.1:5,ws://127.0.0.1:7,ws://127.0.0.1:8,ws://127.0.0.1:9");
  ok(l.length === 2 && l.every(u => /^ws:\/\/(127\.0\.0\.1|localhost):\d+\/$/.test(u)), `?spare= keeps only addresses on this machine, at most 4 entries looked at: ${l.length}`);
  ok(pickTestList("") === null && pickTestList("?spare=").length === 0, "no flag is null, an empty flag is an empty list");
  const { readdirSync } = await import("node:fs");
  const named = [];
  for (const dir of ["game/js", "game/js/net"]) for (const f of readdirSync(path.join(root, dir)).filter(f => f.endsWith(".js") && f !== "relays.js")) {
    if (/wss:\/\/[a-z0-9]/i.test(await readFile(path.join(root, dir, f), "utf8").then(t => t.replace(/\/\/.*$/gm, "")))) named.push(f);
  }
  ok(named.length === 0, `no code file but relays.js names a wss address in code (${named.join(", ") || "none"})`);
}

// ---- A. refused first choice, one live spare ----
if (!only || only.includes("A")) {
  const spare = await startRelay();
  const { a, b, close } = await pair("A. first choice refused, one live spare", "?net=nostr&" + q({ relay: dead, spare: spare.url }).slice(1), 2);
  await a.waitForTimeout(3000);
  const s0 = await ns(a);
  ok(s0.relays === 1 && s0.relaysOpen === 0 && s0.sock.spares === 0, `before ${S} s: 1 tried, 0 open, no spare yet (${JSON.stringify(s0.sock)})`);
  ok(s0.sock.failures >= 1 && s0.sock.opens === 0, `the refusal is counted: ${s0.sock.failures} failed, ${s0.sock.opens} opens`);
  ok(await waitFor(a, () => window.__longWatch.netStatus().sock.spares === 1, null, 14000), `after ${S} s with 0 open the spare is added`);
  const t0 = Date.now();
  const met = await waitFor(a, () => window.__longWatch.peers().length === 1, null, 45000) && await waitFor(b, () => window.__longWatch.peers().length === 1, null, 45000);
  ok(met, `the two pages meet through the spare (${met ? ((Date.now() - t0) / 1000).toFixed(1) + " s after the spare" : "gave up"})`);
  const s1 = await ns(a);
  ok(s1.sock.tried === 2 && s1.sock.open === 1 && s1.sock.everOpened === 1 && s1.sock.opens >= 1, `1 of 2 open, the spare opened ${s1.sock.opens} time(s): ${JSON.stringify(s1.sock)}`);
  ok(s1.sock.failures >= 1 && s1.rebuilds === 0, `failures stay counted (${s1.sock.failures}) and adding the spare is not counted as a rebuild (${s1.rebuilds})`);
  await close(); spare.close();
}

// ---- B. never answers + opens-then-closes, live spare ----
if (!only || only.includes("B")) {
  const mute = await startMute(), closer = await startCloser(), spare = await startRelay();
  const { a, close } = await pair("B1. first choice never answers", "?net=nostr&" + q({ relay: mute.url, spare: spare.url }).slice(1), 3);
  await waitFor(a, () => window.__longWatch.netStatus().sock.spares === 1, null, 14000);
  await a.waitForTimeout(2500);
  const s = await ns(a);
  ok(s.sock.spares === 1 && s.sock.tried === 2 && s.sock.open === 1 && s.sock.pending === 1 && s.sock.failures === 0, `the silent one is pending, not a failure; the spare is open: ${JSON.stringify(s.sock)}`);
  ok(s.sock.everOpened === 1, "only the spare ever opened");
  await close(); mute.close();
  const { a: a2, close: close2 } = await pair("B2. first choice opens and then closes", "?net=nostr&" + q({ relay: closer.url, spare: spare.url }).slice(1), 4);
  await waitFor(a2, () => window.__longWatch.netStatus().sock.spares === 1, null, 14000);
  await a2.waitForTimeout(2500);
  const s2 = await ns(a2);
  ok(s2.sock.opens >= 2 && s2.sock.drops >= 1, `opens and closes are counted (${s2.sock.opens} opens, ${s2.sock.drops} closed after opening)`);
  ok(s2.sock.spares === 1 && s2.sock.tried === 2, `the spare was added: ${JSON.stringify(s2.sock)}`);
  await close2(); closer.close(); spare.close();
}

// ---- C. two first choices open: no spare ----
if (!only || only.includes("C")) {
  const r1 = await startRelay(), r2 = await startRelay(), spare = await startRelay();
  const { a, b, close } = await pair("C. two first-choice relays open", "?net=nostr&" + q({ relays: `${r1.url},${r2.url}`, spare: spare.url }).slice(1), 5);
  const met = await waitFor(a, () => window.__longWatch.peers().length === 1, null, 30000) && await waitFor(b, () => window.__longWatch.peers().length === 1, null, 30000);
  ok(met, "the two pages meet");
  await a.waitForTimeout(SPARE_AFTER_MS + 2500);
  const s = await ns(a);
  ok(s.sock.tried === 2 && s.sock.open === 2 && s.sock.spares === 0, `2 of 2 open after ${S} s, no spare added: ${JSON.stringify(s.sock)}`);
  ok(s.sock.failures === 0, "no failures");
  await close(); r1.close(); r2.close(); spare.close();
}

// ---- D. one open and a player linked: spares wait ----
if (!only || only.includes("D")) {
  const r1 = await startRelay(), spare = await startRelay();
  const { a, b, close } = await pair("D. one relay open and a player linked", "?net=nostr&" + q({ relay: r1.url, spare: spare.url }).slice(1), 6);
  const met = await waitFor(a, () => window.__longWatch.peers().length === 1, null, 30000) && await waitFor(b, () => window.__longWatch.peers().length === 1, null, 30000);
  ok(met, "the two pages meet");
  await a.waitForTimeout(SPARE_AFTER_MS + 4000);
  const s = await ns(a);
  ok(s.sock.open === 1 && s.sock.tried === 1 && s.sock.spares === 0, `1 of 1 open, spare not added while a player is linked: ${JSON.stringify(s.sock)}`);
  ok(s.rebuilds === 0, "no rebuild");
  ok((await a.evaluate(() => window.__longWatch.peers().length)) === 1, "the player is still linked");
  await close(); r1.close(); spare.close();
}

// ---- E. trackers ----
if (!only || only.includes("E")) {
  const spare = await startTracker();
  const { a, b, close } = await pair("E. tracker refused, one live spare tracker", "?net=torrent&" + q({ tracker: dead, tspare: spare.url }).slice(1), 7);
  ok(await waitFor(a, () => window.__longWatch.netStatus().sock.spares === 1, null, 14000), `after ${S} s the spare tracker is added`);
  const met = await waitFor(a, () => window.__longWatch.peers().length === 1, null, 45000) && await waitFor(b, () => window.__longWatch.peers().length === 1, null, 45000);
  ok(met, "the two pages meet through the spare tracker");
  if (!met) console.log("  diagnosis:", JSON.stringify({ a: await ns(a), b: await ns(b), swarms: spare.swarmSizes() }));
  const s = await ns(a);
  ok(s.sock.tried === 2 && s.sock.open === 1 && s.sock.failures >= 1, `1 of 2 open, the refusal counted: ${JSON.stringify(s.sock)}`);
  await close(); spare.close();
}

// ---- F. the page and the report ----
if (!only || only.includes("F")) {
  const spare = await startRelay();
  const { a, close } = await pair("F. line and report", "?net=nostr&" + q({ relay: dead, spare: spare.url }).slice(1), 8);
  await waitFor(a, () => window.__longWatch.netStatus().sock.spares === 1, null, 14000);
  await a.waitForTimeout(2500);
  const c = await a.evaluate(() => window.__longWatch.connection());
  ok(/^Connection: Nostr 1 of 2 open, 1 never opened, 1 spare added; \d+ players? met\.$/.test(c.line), `the page's line: "${c.line}"`);
  ok(/^Nostr relays, sockets: 1 open; \d+ failed before opening; 0 closed after opening; 1 spare addresses added after 10 s with fewer than 2 open$/m.test(c.text), "the report counts opens, failures and the spare");
  ok(!/127\.0\.0\.1|ws:|wss:|localhost/.test(c.text + c.line), "no address in the line or the report");
  ok(/not been tested by the builders/.test(c.text), "the report still says public relays are untested by the builders");
  await close(); spare.close();
}

ok(errors.length === 0, `no page errors (${errors.slice(0, 3).join(" | ")})`);
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
