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

const MODULES = {
  nostr: "../../vendor/trystero-0.25.4/nostr/index.mjs",
  torrent: "../../vendor/trystero-0.25.4/torrent/index.mjs",
};
export const MAX_MET = 200, SAMPLE_MS = 1000;
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

export async function createTrysteroTransport(kind, room, opts = {}) {
  const lib = await import(MODULES[kind] || MODULES.nostr);
  const config = { appId: APP_ID, relayConfig: { warnOnRelayFailure: false } };
  if (typeof RTCPeerConnection === "function") config.rtcPolyfill = warmRenewals(RTCPeerConnection);
  if (opts.relay) config.relayConfig.urls = [opts.relay];
  const onMsg = capped(emitter()), onJoin = emitter(), onLeave = emitter();

  const history = []; // the last join and leave events with their time in seconds since the room was joined (kept for diagnosing dropped links)
  const t0 = performance.now(), note = (what, id) => { history.push([what, Math.round((performance.now() - t0) / 100) / 10, id.slice(0, 4)]); if (history.length > 12) history.shift(); };
  // Tests only (loopback pages): `mute` seconds during which this side neither sends nor hears anything, like a half-open link.
  const muted = () => !!opts.mute && performance.now() - t0 < opts.mute * 1000;
  const joined = new Map(); // peer id -> when its join event arrived
  // Connection report (milestone 27): numbers only. `everOpen` holds the relay addresses (from the code's own list or a test
  // relay, never from a peer) whose socket was seen open by the once-a-second sample; the addresses stay in this closure and
  // only counts leave it. `met` holds the ids of players met (at most MAX_MET, ids are never exposed), `left` counts leave events.
  const everOpen = new Set(), met = new Set();
  let left = 0;
  const sample = () => { for (const [u, s] of Object.entries(lib.getRelaySockets?.() || {})) if (s && s.readyState === 1) everOpen.add(u); };
  const heard = new Set();  // peer ids we have received at least one message from since they joined
  let r = null, action = null, rebuilds = 0, lastRebuild = -1e9, closed = false, busy = false;

  function open() {
    const mine = r = lib.joinRoom(config, room);
    action = r.makeAction("m");
    r.onPeerJoin = (id) => { if (mine !== r || muted()) return; note("join", id); joined.set(id, performance.now()); if (met.size < MAX_MET) met.add(id); onJoin.emit(id); };
    r.onPeerLeave = (id) => { if (mine !== r) return; note("leave", id); left++; joined.delete(id); heard.delete(id); onLeave.emit(id); };
    action.onMessage = (data, ctx) => { if (mine !== r || muted()) return; heard.add(ctx.peerId); onMsg.emit(data, ctx.peerId); };
  }
  async function rebuild() {
    busy = true; rebuilds++; lastRebuild = performance.now();
    const old = r; r = null; // events from the old room object are ignored from here on
    for (const id of [...joined.keys()]) { note("leave", id); left++; onLeave.emit(id); }
    joined.clear(); heard.clear();
    try { await old.leave(); } catch { /* already gone */ }
    if (!closed) open();
    busy = false;
  }
  open();
  const sampler = setInterval(sample, SAMPLE_MS);
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
      sample();
      const socks = Object.values(lib.getRelaySockets?.() || {});
      const open = socks.filter(s => s && s.readyState === 1).length;
      // sock: relays/trackers tried, open now, ever seen open (so tried - everOpened never opened: refused or unreachable)
      return { relays: socks.length, relaysOpen: open, dropped: onMsg.dropped(), rebuilds, history: history.map(h => h.slice()),
        sock: { tried: socks.length, open, everOpened: everOpen.size }, met: met.size, left };
    },
    leave() { closed = true; clearInterval(timer); clearInterval(sampler); if (r) r.leave().catch(() => {}); r = null; },
  };
}
