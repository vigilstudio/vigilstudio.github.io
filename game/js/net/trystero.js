// Real transport: Trystero 0.25.4 (MIT, vendored in ../../vendor/). Signalling (finding each other) goes
// through public Nostr relays or BitTorrent trackers; after that, game messages travel directly between
// browsers over encrypted WebRTC data channels. No server of ours, no keys, no sign-up.
//
// Link watchdog (milestone 6). Seen in a stress run of 150 three-player meshes: now and then a WebRTC link comes up on
// one side only. That side gets a join event for the peer; the other side never does (its handshake timed out), so it
// sends nothing to us and the two never see each other, while our half of the link stays "joined" for ever.
// So: a peer that has been joined for STALL_MS without a single message from it (every client sends something every
// 2 s) means a half-open link; we leave the room and join it again, which makes everyone start a fresh handshake.
// The game is told every peer left, then every peer that comes back joins again, so nothing above needs to know.
// At most MAX_REBUILDS times per transport, MIN_GAP_MS apart, so a silent hostile peer can cost a few reconnects, not a loop.
import { APP_ID, emitter, capped } from "./transport.js";
import { PRIMARY, SPARES, MIN_OPEN_RELAYS, SPARE_AFTER_MS, SPARE_RETRY_MS } from "./relays.js";
import { installSocketCounter, countsFor } from "./sockets.js";

const MODULES = {
  nostr: "../../vendor/trystero-0.25.4/nostr/index.mjs",
  torrent: "../../vendor/trystero-0.25.4/torrent/index.mjs",
};
export const MAX_MET = 200;
export const STALL_MS = 8000, MIN_GAP_MS = 10000, MAX_REBUILDS = 3, CHECK_MS = 2000;

// Trystero keeps a pool of ready offers and, once one is older than ~57 s, renews it: roll back the pooled
// offer, restart ICE, make a new offer. Rolling back the very first offer also throws away the data channel it
// created, so the renewed offer is an empty description (no m= line, no ICE credentials) and the peer it goes
// to can never connect. The result: a player who joins a room that others have been in for about a minute or
// more is often unable to connect to them (the third player in the gather test never saw the first two, about
// half the time). This subclass makes that rollback a no-op (the new offer simply replaces the old one, the
// channel stays), and holds the renewed offer back until its fresh candidates are gathered or a short while
// has passed, because the first candidates of a restart are otherwise emitted before anyone listens.
const RENEW_GATHER_MS = 2500;
function warmRenewals(Base) {
  return class extends Base {
    restartIce() { this._renewing = true; } // createOffer({ iceRestart: true }) restarts by itself; the real call would also fire a second, racing negotiation
    async setLocalDescription(...args) {
      const type = args[0]?.type;
      if (type === "rollback" && this.signalingState === "have-local-offer" && !this.remoteDescription) { this._renewing = true; return; }
      const renewing = this._renewing && type === "offer";
      if (renewing) this._renewing = false;
      const result = await super.setLocalDescription(...args);
      if (renewing && this.iceGatheringState !== "complete") {
        await new Promise((done) => {
          const finish = () => { clearTimeout(timer); this.removeEventListener("icegatheringstatechange", check); done(); };
          const check = () => { if (this.iceGatheringState === "complete") finish(); };
          const timer = setTimeout(finish, RENEW_GATHER_MS);
          this.addEventListener("icegatheringstatechange", check);
        });
      }
      return result;
    }
  };
}

// Spare relays are added for a whole path at once. The library reads its address list only when no room of that path is
// open (Trystero joins every room of a strategy over the sockets its first room opened), and a page holds two rooms per path
// (the lantern and the lobby, js/lobby.js), so adding spares means every room of the path leaves, then all join again
// over the longer list. `groups` holds this page's transports per path; `spareList` is the longer list once it exists.
const groups = { nostr: new Set(), torrent: new Set() };
const spareList = { nostr: null, torrent: null }, sparesAdded = { nostr: 0, torrent: 0 };

export async function createTrysteroTransport(kind, room, opts = {}) {
  installSocketCounter(); // before the library opens any socket (js/net/sockets.js)
  const lib = await import(MODULES[kind] || MODULES.nostr);
  const config = { appId: APP_ID, relayConfig: { warnOnRelayFailure: false } };
  if (typeof RTCPeerConnection === "function") config.rtcPolyfill = warmRenewals(RTCPeerConnection);
  // Milestone 28: the addresses come from js/net/relays.js (or one test relay on this machine). Spares are tried only if
  // fewer than MIN_OPEN_RELAYS sockets are open SPARE_AFTER_MS after joining; with a test relay the spares are the test's own.
  const kindKey = kind === "torrent" ? "torrent" : "nostr";
  const primary = opts.relays?.length ? opts.relays : opts.relay ? [opts.relay] : PRIMARY[kindKey];
  const spares = (opts.spares ?? (opts.relay || opts.relays?.length ? [] : SPARES[kindKey])).filter((u) => !primary.includes(u));
  let urls = spareList[kindKey] || primary, sparesDone = false;
  config.relayConfig.urls = urls;
  const onMsg = capped(emitter()), onJoin = emitter(), onLeave = emitter();

  const history = []; // the last join and leave events with their time in seconds since the room was joined (kept for diagnosing dropped links)
  const t0 = performance.now(), note = (what, id) => { history.push([what, Math.round((performance.now() - t0) / 100) / 10, id.slice(0, 4)]); if (history.length > 12) history.shift(); };
  // Tests only (loopback pages): `mute` seconds during which this side neither sends nor hears anything, like a half-open link.
  const muted = () => !!opts.mute && performance.now() - t0 < opts.mute * 1000;
  const joined = new Map(); // peer id -> when its join event arrived
  // Connection report (milestone 27): numbers only. Opens and failures are counted per address as they happen (js/net/sockets.js; addresses come from js/net/relays.js or a test
  // relay, never from a peer) and only counts leave this file. `met` holds the ids of players met (at most MAX_MET, ids are never exposed), `left` counts leave events.
  const met = new Set();
  let left = 0;
  const openNow = () => Object.entries(lib.getRelaySockets?.() || {}).filter(([u, s]) => urls.includes(u) && s && s.readyState === 1).length;
  const heard = new Set();  // peer ids we have received at least one message from since they joined
  let r = null, action = null, rebuilds = 0, lastRebuild = -1e9, closed = false, busy = false;

  function open() {
    const mine = r = lib.joinRoom(config, room);
    action = r.makeAction("m");
    r.onPeerJoin = (id) => { if (mine !== r || muted()) return; note("join", id); joined.set(id, performance.now()); if (met.size < MAX_MET) met.add(id); onJoin.emit(id); };
    r.onPeerLeave = (id) => { if (mine !== r) return; note("leave", id); left++; joined.delete(id); heard.delete(id); onLeave.emit(id); };
    action.onMessage = (data, ctx) => { if (mine !== r || muted()) return; heard.add(ctx.peerId); onMsg.emit(data, ctx.peerId); };
  }
  async function detach(emitLeaves = true) {
    busy = true;
    const old = r; r = null; // events from the old room object are ignored from here on
    if (emitLeaves) for (const id of [...joined.keys()]) { note("leave", id); left++; onLeave.emit(id); }
    joined.clear(); heard.clear();
    try { await old?.leave(); } catch { /* already gone */ }
  }
  function attach() { if (!closed) open(); busy = false; }
  async function rebuild() {
    rebuilds++; lastRebuild = performance.now();
    await detach(); attach();
  }
  open();
  // Spare relays: once, SPARE_AFTER_MS after joining, if fewer than MIN_OPEN_RELAYS are open, join again over the
  // primary list plus the spares (the sockets already open are kept by the library). Not while a player is linked on this
  // path: joining again would drop and rebuild their links, so it looks again every SPARE_RETRY_MS instead.
  async function checkSpares() {
    spareTimer = 0;
    if (closed || sparesDone) return;
    if (sparesAdded[kindKey] || openNow() >= MIN_OPEN_RELAYS || !spares.length) { sparesDone = true; return; }
    const group = [...groups[kindKey]];
    if (group.some((g) => g.busy() || g.linked())) { spareTimer = setTimeout(checkSpares, SPARE_RETRY_MS); return; }
    sparesDone = true; sparesAdded[kindKey] = spares.length;
    spareList[kindKey] = [...primary, ...spares];
    await Promise.all(group.map((g) => g.detach()));
    for (const g of group) g.attach(spareList[kindKey]);
  }
  let spareTimer = setTimeout(checkSpares, SPARE_AFTER_MS);
  const member = { busy: () => busy, linked: () => joined.size > 0, detach: () => detach(), attach: (list) => { urls = list; config.relayConfig.urls = list; attach(); } };
  groups[kindKey].add(member);
  const timer = setInterval(() => {
    if (closed || busy || !r || rebuilds >= MAX_REBUILDS || performance.now() - lastRebuild < MIN_GAP_MS) return;
    const t = performance.now();
    for (const [id, at] of joined) if (!heard.has(id) && t - at > STALL_MS) { rebuild(); return; }
  }, CHECK_MS);

  return {
    kind,
    selfId: lib.selfId,
    send(msg, peerId) { if (!action || muted()) return; action.send(msg, peerId ? { target: peerId } : undefined).catch(() => {}); },
    onMessage: onMsg.add, onPeerJoin: onJoin.add, onPeerLeave: onLeave.add,
    status() {
      const socks = Object.entries(lib.getRelaySockets?.() || {}).filter(([u]) => urls.includes(u));
      const open = socks.filter(([, s]) => s && s.readyState === 1).length;
      const c = countsFor(urls);
      // sock: relays/trackers tried, open now, ever seen open (so tried - everOpened never opened: refused, unreachable or
      // still connecting); opens (every time a socket opened), failures (closed before it opened), drops (closed after
      // opening), pending (sockets still connecting); spares (how many spare addresses were added, 0 if none)
      return { relays: socks.length, relaysOpen: open, dropped: onMsg.dropped(), rebuilds, history: history.map(h => h.slice()),
        sock: { tried: socks.length, open, everOpened: Math.max(open, Math.min(socks.length, c.everOpened)), opens: c.opens, failures: c.failures, drops: c.drops, pending: c.pending, spares: sparesAdded[kindKey] }, met: met.size, left };
    },
    leave() { closed = true; clearInterval(timer); clearTimeout(spareTimer); groups[kindKey].delete(member); if (r) r.leave().catch(() => {}); r = null; },
  };
}
