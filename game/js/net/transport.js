// The one networking interface the game uses. Two kinds of implementation:
//   local   - BroadcastChannel between tabs of one browser (tests, offline development)
//   nostr   - Trystero over public Nostr relays, real WebRTC between browsers
//   torrent - Trystero over public BitTorrent WebSocket trackers
//   auto    - the default: Nostr first; if no Nostr relay can be reached, BitTorrent trackers (js/net/auto.js)
//
// Every transport returns the same object:
//   { kind, selfId,
//     send(msg, peerId?)        msg is a small plain JSON object; no peerId means everyone in the room
//     onMessage(fn(msg, peerId)), onPeerJoin(fn(peerId)), onPeerLeave(fn(peerId)),
//     status()                  { relays, relaysOpen } for the connection line in the UI
//     leave() }
// Game code never imports Trystero or BroadcastChannel directly.

export const APP_ID = "vigilstudio-long-watch-v1";
export const KINDS = ["auto", "nostr", "torrent", "local"];

export function pickKind(search) {
  const k = new URLSearchParams(search).get("net");
  return KINDS.includes(k) ? k : "auto";
}

// A test-only relay override: accepted only for a relay on this machine, so a shared link cannot point
// a player at someone else's server.
export function pickTestRelay(search, param = "relay") {
  const r = new URLSearchParams(search).get(param);
  if (!r) return null;
  try {
    const u = new URL(r);
    if ((u.protocol === "ws:" || u.protocol === "wss:") && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return u.href;
  } catch { /* ignore */ }
  return null;
}

// Test-only: the same for a BitTorrent tracker on this machine (?tracker=ws://127.0.0.1:PORT).
export const pickTestTracker = (search) => pickTestRelay(search, "tracker");

// Test-only: a short list of spare relays or trackers on this machine (?spare=ws://127.0.0.1:A,ws://127.0.0.1:B), at most
// MAX_TEST_SPARES, each accepted by the same rule; anything else in the list is dropped. null when the flag is absent.
export const MAX_TEST_SPARES = 4;
export function pickTestList(search, param = "spare") {
  const raw = new URLSearchParams(search).get(param);
  if (raw === null) return null;
  const out = [];
  for (const part of raw.split(",").slice(0, MAX_TEST_SPARES)) {
    const u = pickTestRelay("?x=" + encodeURIComponent(part), "x");
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

// Test-only: seconds (1 to 30) during which a page neither sends nor hears anything, imitating a half-open link.
// Like ?relay=, main.js uses it only on a page served from this machine.
export function pickTestMute(search) {
  const v = Number(new URLSearchParams(search).get("mute"));
  return Number.isInteger(v) && v >= 1 && v <= 30 ? v : 0;
}

export async function createTransport(kind, room, opts = {}) {
  if (kind === "local") {
    const { createLocalTransport } = await import("./local.js");
    return createLocalTransport(room);
  }
  if (kind === "auto") {
    const { createAutoTransport } = await import("./auto.js");
    return createAutoTransport(room, opts);
  }
  const { createTrysteroTransport } = await import("./trystero.js");
  // a test relay (Nostr) or tracker (BitTorrent) on this machine replaces the public list for that path
  return createTrysteroTransport(kind, room, { ...opts, relay: (kind === "torrent" ? opts.tracker : opts.relay) || undefined, spares: kind === "torrent" ? opts.trackerSpares : opts.spares, relays: kind === "torrent" ? undefined : opts.relays });
}

// The biggest message the game will look at, measured as JSON bytes. Real messages are under 100 bytes;
// anything bigger is dropped before any game code sees it. (Trystero has already decoded it by then, so this keeps
// big objects away from the game, it does not stop a peer from making the browser decode them.)
export const MAX_MESSAGE_BYTES = 512;
export function withinSizeCap(msg, max = MAX_MESSAGE_BYTES) {
  try {
    const s = JSON.stringify(msg);
    return typeof s === "string" && s.length <= max && new TextEncoder().encode(s).length <= max;
  } catch { return false; }
}
// Wraps an emitter so oversize messages never reach listeners; `dropped()` counts them.
export function capped(inner, max = MAX_MESSAGE_BYTES) {
  let dropped = 0;
  return {
    add: inner.add,
    emit(msg, id) { if (withinSizeCap(msg, max)) inner.emit(msg, id); else dropped++; },
    dropped: () => dropped,
  };
}

// Small helper both implementations use for their listener lists.
export function emitter() {
  const fns = new Set();
  return { add: fn => (fns.add(fn), () => fns.delete(fn)), emit: (...a) => fns.forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } }) };
}
