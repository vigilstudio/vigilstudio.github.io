// The connection report (milestone 27): what this page knows about its own connection, as numbers only.
//
// It is built from the transport's status() and from nothing else a peer could influence: every figure is read as a
// whole number, clamped to 0..REPORT_MAX, and printed with fixed words around it. No relay or tracker address, no player id,
// no name, no phrase and no text from any peer is ever read here, so none can reach the line on the page or the text a
// player copies. (The report does not even hold addresses: js/net/trystero.js keeps them inside the transport.)
// Whether public online play has been tested is a constant written here and checked against the CHANGELOG by
// tests/report.test.mjs, so the page cannot claim more than the changelog does.

export const REPORT_MILESTONE = 27;
export const REPORT_MAX = 9999;
// Online play over the public Nostr relays and BitTorrent trackers, tested by the builders since milestone 1: no.
// (The owner's one test on 15 October 2026, milestone 1, is mentioned in the page's "About" text.)
export const PUBLIC_PLAY_TESTED_BY_BUILDERS = false;
export const PATHS = ["nostr", "torrent"];
const NAME = { nostr: "Nostr relays", torrent: "BitTorrent trackers" };
const NAME_ONE = { nostr: "Nostr relay", torrent: "BitTorrent tracker" };

// One figure from untrusted-looking input: a whole number from 0 to REPORT_MAX, or 0.
export function num(v) {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : 0;
  return n < 0 ? 0 : n > REPORT_MAX ? REPORT_MAX : n;
}

// Per-path figures from a status(), whichever transport made it: { tried, open, everOpened, met, left, rebuilds }.
function pathStats(status, kind) {
  const grab = (o) => {
    const sock = o && typeof o.sock === "object" && o.sock ? o.sock : {};
    const tried = num(sock.tried ?? o?.relays);
    const open = Math.min(tried, num(sock.open ?? o?.relaysOpen));
    const everOpened = Math.max(open, Math.min(tried, num(sock.everOpened)));
    return { tried, open, everOpened, met: num(o?.met), left: num(o?.left), rebuilds: num(o?.rebuilds) };
  };
  if (kind === "both") return Object.fromEntries(PATHS.map((k) => [k, grab(status?.byPath?.[k])]));
  if (kind === "nostr" || kind === "torrent") return { [kind]: grab(status) };
  return {};
}

// The structured figures (used by the line, the copied text and the tests).
export function reportFigures(status, ctx = {}) {
  const kind = ctx.kind === "both" || ctx.kind === "nostr" || ctx.kind === "torrent" ? ctx.kind : "local";
  const paths = pathStats(status, kind);
  const f = {
    kind,
    lantern: num(ctx.lantern),
    seconds: num(ctx.seconds),
    paths,
    met: kind === "both" ? num(status?.met) : kind === "local" ? 0 : num(paths[kind]?.met),
    now: num(ctx.playersNow),
    gone: kind === "both" ? num(status?.gone) : kind === "local" ? 0 : num(paths[kind]?.left),
    rebuilds: Object.values(paths).reduce((n, p) => n + p.rebuilds, 0),
    linkedBoth: num(status?.links?.both),
    linkedOne: num(status?.links?.single),
    dropped: num(status?.dropped),
  };
  return f;
}

function pathLine(k, p, secs) {
  const never = p.tried - p.everOpened;
  const lost = p.everOpened - p.open;
  const word = p.tried === 1 ? NAME_ONE[k] : NAME[k];
  const parts = [`${p.open} of ${p.tried} ${word} open now`];
  if (never > 0) parts.push(`${never} never opened (refused, unreachable or still connecting)`);
  if (lost > 0) parts.push(`${lost} opened and then closed`);
  if (p.tried === 0) parts[0] = secs < 8 ? `${NAME[k]}: still starting` : `${NAME[k]}: none tried`;
  else parts[0] = `${NAME[k]}: ${parts[0]}`;
  return parts.join("; ");
}

// The text the Copy button puts on the clipboard: plain lines, numbers and fixed words only.
export function reportText(status, ctx = {}) {
  const f = reportFigures(status, ctx);
  const lines = [`The Long Watch connection report (numbers only), milestone ${REPORT_MILESTONE}`];
  const way = f.kind === "both" ? "Nostr relays and BitTorrent trackers together" : f.kind === "local" ? "local test mode (no relays)" : NAME[f.kind];
  lines.push(`Way: ${way}`);
  lines.push(`Lantern: ${f.lantern}`);
  lines.push(`Time in the lantern: ${f.seconds} s`);
  if (f.kind !== "local") for (const k of PATHS) if (f.paths[k]) lines.push(pathLine(k, f.paths[k], f.seconds));
  lines.push(`Players here now: ${f.now}`);
  if (f.kind !== "local") {
    lines.push(`Players met since entering: ${f.met}`);
    lines.push(`Players gone again: ${f.gone}`);
    if (f.kind === "both") lines.push(`Linked on both ways: ${f.linkedBoth}; on one way only: ${f.linkedOne}`);
    lines.push(`Connections rebuilt after going silent: ${f.rebuilds}`);
    lines.push(`Messages dropped as too big or invalid in transit: ${f.dropped}`);
  }
  lines.push(PUBLIC_PLAY_TESTED_BY_BUILDERS
    ? "Public relays: tested by the builders."
    : "Public relays: online play over them has not been tested by the builders (only relays on one machine).");
  return lines.join("\n");
}

// The short "Connection" line shown in the game panel.
export function reportLine(status, ctx = {}) {
  const f = reportFigures(status, ctx);
  if (f.kind === "local") return "Connection: local test mode, no relays.";
  const bits = [];
  for (const k of PATHS) {
    const p = f.paths[k];
    if (!p) continue;
    const label = k === "nostr" ? "Nostr" : "BitTorrent";
    bits.push(p.tried ? `${label} ${p.open} of ${p.tried} open${p.tried - p.everOpened > 0 ? `, ${p.tried - p.everOpened} never opened` : ""}` : `${label} starting`);
  }
  bits.push(`${f.met} ${f.met === 1 ? "player" : "players"} met`);
  if (f.rebuilds) bits.push(`${f.rebuilds} ${f.rebuilds === 1 ? "link" : "links"} rebuilt`);
  return `Connection: ${bits.join("; ")}.`;
}
