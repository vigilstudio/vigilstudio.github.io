// The one list of signalling relays and trackers the game knows (milestone 28). Nothing else in the code names one; the
// page never takes an address from a peer. Every entry says where it came from, because "free, no sign-up, working today"
// is only as good as that source. NONE of these has been reached from the builders' sandbox (its proxy refuses them), so
// whether any of them is up today is unknown, and online play over them is untested by the builders.
//
// source kinds:
//   "trystero"  read from Trystero 0.25.4's own default list in vendor/ (the code in this repository, checked by
//               tests/spares.test.mjs against the vendored files), not a claim that the relay is up today;
//   "memory"    a well-known public relay the builder remembers, not looked up and not tested;
//   "search"    a search summary named it (none are used this way yet).
//
// "primary" is what Trystero would have used for this app anyway: for Nostr the 5 relays its shuffle picks for APP_ID
// (computed with Trystero's own shuffle, which tests/spares.test.mjs repeats), for BitTorrent the first 3 of its list.
// "spare" entries are tried only when fewer than MIN_OPEN_RELAYS of a path's sockets are open SPARE_AFTER_MS after joining
// (js/net/trystero.js), and never while a player is already linked on that path.
export const MIN_OPEN_RELAYS = 2;
export const SPARE_AFTER_MS = 10000;
export const SPARE_RETRY_MS = 5000;   // while players are linked, look again this often
export const MAX_SPARES = 6;

const t = (url, role) => ({ url, role, source: "trystero" });
const m = (url, role) => ({ url, role, source: "memory" });

export const RELAYS = {
  nostr: [
    t("wss://nostr.data.haus", "primary"), t("wss://basspistol.org", "primary"), t("wss://relay.agorist.space", "primary"),
    t("wss://relay.mostro.network", "primary"), t("wss://relay-rpi.edufeed.org", "primary"),
    t("wss://nos.lol", "spare"), t("wss://bucket.coracle.social", "spare"),
    m("wss://relay.damus.io", "spare"), m("wss://relay.primal.net", "spare"),
  ],
  torrent: [
    t("wss://open.ftorrent.com", "primary"), t("wss://tracker.webtorrent.dev", "primary"), t("wss://tracker.openwebtorrent.com", "primary"),
    t("wss://tracker.btorrent.xyz", "spare"), t("wss://tracker.files.fm:7073/announce", "spare"),
  ],
};
export const listFor = (kind, role) => (RELAYS[kind] || []).filter((r) => r.role === role).map((r) => r.url);
export const PRIMARY = { nostr: listFor("nostr", "primary"), torrent: listFor("torrent", "primary") };
export const SPARES = { nostr: listFor("nostr", "spare").slice(0, MAX_SPARES), torrent: listFor("torrent", "spare").slice(0, MAX_SPARES) };
