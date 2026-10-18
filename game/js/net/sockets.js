// Counts every WebSocket this page opens, by address (milestone 28): tries, opens, attempts that closed before they
// ever opened (refused, unreachable, rejected) and sockets that closed after being open. Trystero opens one socket per
// relay and opens a new one after each loss, so a relay can add several. The addresses stay in this module's map and only
// sums leave it (js/net/trystero.js asks for the sum over its own list). At most MAX_URLS addresses are kept.
// A socket that never answers is neither an open nor a failure until it closes: it shows as "pending".
const MAX_URLS = 64;
const stats = new Map(); // url -> { tries, opens, failures, drops, live }
let installed = false;

export function installSocketCounter() {
  if (installed || typeof globalThis.WebSocket !== "function") return;
  installed = true;
  const Native = globalThis.WebSocket;
  class Counted extends Native {
    constructor(...args) {
      super(...args);
      const url = String(args[0]);
      let s = stats.get(url);
      if (!s) { if (stats.size >= MAX_URLS) return; s = { tries: 0, opens: 0, failures: 0, drops: 0, live: 0 }; stats.set(url, s); }
      s.tries++; s.live++;
      let opened = false, done = false;
      this.addEventListener("open", () => { opened = true; s.opens++; });
      this.addEventListener("close", () => { if (done) return; done = true; s.live--; if (opened) s.drops++; else s.failures++; });
    }
  }
  globalThis.WebSocket = Counted;
}

// Sums over a list of addresses: { tried (addresses attempted), everOpened (addresses that opened at least once), opens, failures, drops, pending }
export function countsFor(urls) {
  const out = { tried: 0, everOpened: 0, opens: 0, failures: 0, drops: 0, pending: 0 };
  for (const u of urls) {
    const s = stats.get(u);
    if (!s) continue;
    out.tried++; if (s.opens > 0) out.everOpened++;
    out.opens += s.opens; out.failures += s.failures; out.drops += s.drops; out.pending += Math.max(0, s.live - (s.opens - s.drops)); // live sockets that are not open
  }
  return out;
}
