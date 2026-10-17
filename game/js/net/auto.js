// The default transport (milestone 18): one room across both signalling paths. The player joins the lantern through
// the Nostr relays AND through the BitTorrent trackers at once (both are Trystero strategies, free, no sign-up).
// Both strategies share one peer id in a page, so a player who is on both paths is the same id on each; this wrapper
// shows the game one peer for it:
//   - the first link that joins is the one we send to (the "first link wins"); the other link is remembered, and if
//     the first one drops, sends move to the other one without the game being told anyone left;
//   - a peer is announced once on its first link and reported gone only when its last link is gone;
//   - a message is passed on from whichever link it came on, and we send each message once per peer, on that peer's
//     first link, so nothing a peer says is ever delivered twice because two links exist;
//   - a broadcast is sent once per known peer (to its first link), never once per path.
// Two players who share no path (one only on Nostr, one only on BitTorrent) do not meet unless a third player is
// on both; that third player sees both, the two of them do not see each other (nothing is relayed). The page says which
// paths are open. `?net=nostr` or `?net=torrent` pins one path and does not use this wrapper.
import { emitter, capped } from "./transport.js";
import { createTrysteroTransport, MAX_MET } from "./trystero.js";

export const ORDER = ["nostr", "torrent"];
export const TRY_MS = 7000;
// Each path's link watchdog (trystero.js) rebuilds a path whose peer has been silent for 8 s. A peer's second link carries
// no game messages (we send on the first), so on every second link we send this one tiny message every KEEP_MS; it is
// dropped here on arrival and never reaches the game.
export const LINK_KIND = "ln", KEEP_MS = 2000;

export async function createAutoTransport(room, opts = {}) {
  const onMsg = capped(emitter()), onJoin = emitter(), onLeave = emitter();
  const urlFor = (kind) => (kind === "nostr" ? opts.relay : opts.tracker) || undefined;
  const parts = new Map(); // kind -> transport that started
  const links = new Map(); // peer id -> [kinds this peer is linked on], first link first
  const startedAt = performance.now();
  let closed = false, first = null, lost = 0;
  const metAll = new Set(); // ids of players met on any path (counts only leave this file; capped)

  const results = await Promise.allSettled(ORDER.map((kind) => createTrysteroTransport(kind, room, { relay: urlFor(kind), mute: opts.mute })));
  results.forEach((r, i) => { if (r.status === "fulfilled") parts.set(ORDER[i], r.value); else console.error(r.reason); });
  if (!parts.size) throw new Error("no transport could start");
  const selfId = [...parts.values()][0].selfId;

  for (const [kind, t] of parts) {
    t.onPeerJoin((id) => {
      const l = links.get(id);
      if (l) { if (!l.includes(kind)) l.push(kind); return; } // already here on the other path: the first link wins
      links.set(id, [kind]); if (metAll.size < MAX_MET) metAll.add(id); onJoin.emit(id);
    });
    t.onPeerLeave((id) => {
      const l = links.get(id);
      if (!l) return;
      const i = l.indexOf(kind);
      if (i >= 0) l.splice(i, 1);
      if (!l.length) { links.delete(id); lost++; onLeave.emit(id); }
    });
    t.onMessage((m, id) => { if (m && m.k === LINK_KIND) return; onMsg.emit(m, id); }); // link keepalives stop here
  }

  const keep = setInterval(() => {
    for (const [id, l] of links) for (let i = 1; i < l.length; i++) parts.get(l[i])?.send({ k: LINK_KIND }, id);
  }, KEEP_MS);

  const state = (kind) => {
    const t = parts.get(kind);
    if (t && t.status().relaysOpen > 0) return "open";
    return performance.now() - startedAt < TRY_MS ? "trying" : "unreached";
  };

  return {
    kind: "both",
    selfId,
    send(msg, peerId) {
      if (closed) return;
      if (peerId) {
        const l = links.get(peerId);
        if (l && l.length) parts.get(l[0])?.send(msg, peerId);
        else for (const t of parts.values()) t.send(msg, peerId); // not linked yet: try both (Trystero ignores an unknown id)
        return;
      }
      for (const [id, l] of links) if (l.length) parts.get(l[0])?.send(msg, id);
    },
    onMessage: onMsg.add, onPeerJoin: onJoin.add, onPeerLeave: onLeave.add,
    // `paths`: { nostr, torrent } each "open", "trying" or "unreached"; `open`: the paths open now; `path`: the first
    // path that was ever open (null until one is); `links`: how many peers are linked on one path only, and on both.
    status() {
      const per = ORDER.map((k) => (parts.get(k) ? parts.get(k).status() : { relays: 0, relaysOpen: 0, dropped: 0, rebuilds: 0, history: [] }));
      const paths = { nostr: state("nostr"), torrent: state("torrent") };
      const open = ORDER.filter((k) => paths[k] === "open");
      if (open.length && !first) first = open[0];
      let both = 0, single = 0;
      for (const l of links.values()) if (l.length > 1) both++; else single++;
      return {
        relays: per.reduce((n, s) => n + s.relays, 0), relaysOpen: per.reduce((n, s) => n + s.relaysOpen, 0),
        dropped: onMsg.dropped() + per.reduce((n, s) => n + (s.dropped || 0), 0), rebuilds: per.reduce((n, s) => n + (s.rebuilds || 0), 0),
        history: per.flatMap((s, i) => (s.history || []).map(h => [...h, ORDER[i]])),
        paths, open, path: first, links: { both, single }, peers: links.size,
        // connection report: per path sockets and links (numbers only), and players met / gone over all paths
        byPath: Object.fromEntries(ORDER.map((k, i) => [k, { sock: per[i].sock || { tried: per[i].relays, open: per[i].relaysOpen, everOpened: 0 }, met: per[i].met | 0, left: per[i].left | 0, rebuilds: per[i].rebuilds | 0 }])),
        met: metAll.size, gone: lost,
        exhausted: !open.length && ORDER.every((k) => paths[k] === "unreached"),
      };
    },
    // test read-out: which paths each peer is linked on (first = the one we send on)
    peerLinks() { return Object.fromEntries([...links].map(([id, l]) => [id, l.slice()])); },
    leave() { closed = true; clearInterval(keep); for (const t of parts.values()) t.leave(); parts.clear(); links.clear(); },
  };
}
