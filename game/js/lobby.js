// Where the others are (milestone 21). A hint, worked out without a server, about which lantern has players in it.
//
// There is no list of rooms anywhere, so the only way to know is to ask. A shared "lobby" room (its own Trystero or
// local room, apart from the six lanterns) holds two kinds of page: a page that is inside a lantern (it answers) and a
// page on the landing screen that pressed "Where are the others?" (it asks, for LOOK_S seconds, then leaves the lobby).
//
// Messages, numbers only, nothing else exists:
//   { k:"lq" }          a newcomer asks: "which lantern are you in?"   (exactly one field)
//   { k:"lr", r }       the answer: r = the answerer's lantern, a whole number 1 to ROOMS (exactly two fields)
// The answer goes to the asker alone. A page that is not in a lantern never answers.
//
// Limits, all enforced by the receiver: a sender may ask a page once per ASK_GAP_S (burst 2); a page takes an answer
// only from a player it asked, at most one answer per player per ask, at most ROOM_SIZE * ROOMS answers in all and
// only from the first LOBBY_PEERS players it saw join (more are ignored; their connections are not closed); an
// answer counts for ANSWER_TTL_S seconds; a lantern's count is shown at most ROOM_SIZE. A modified client can
// answer any lantern, so the result is a guess and the page says so.
import { createGuard } from "./guard.js";
import { MAX_PEERS } from "./presence.js";

export const ROOMS = 6;
export const LOBBY_ROOM = "lobby";
export const LOBBY_PEERS = MAX_PEERS; // others in the lobby room that are heard; the same cap as a lantern
export const ROOM_SIZE = MAX_PEERS + 1; // a lantern holds MAX_PEERS others, so this many players; a lantern at this count is not suggested
export const LOBBY_JOIN_DELAY_S = 8; // a page joins the lobby this long after entering a lantern, so the lantern's own connections come first
export const LOOK_S = 20;           // an asker stays in the lobby this long
export const ASK_GAP_S = 4;         // a page answers one question per player per this many seconds (burst 2)
export const RE_ASK_S = 3;          // a player who has not answered is asked again after this long, up to MAX_ASKS times in all
export const MAX_ASKS = 3;
export const ANSWER_TTL_S = 60;     // an answer is used for this long
export const MAX_ANSWERS = ROOM_SIZE * ROOMS;
// Milestone 30: the lobby room is a mesh (every page linked to every other), so it must not grow without end. A page in a
// lantern that has more than LOBBY_LINK_CAP other answering pages linked in the lobby leaves it after a random 2 to 6 s
// (looking again before it goes, so pages do not all leave together) and tries again after REJOIN_S, doubling the wait up to
// REJOIN_MAX_S each time it finds the lobby still crowded. Pages that are asking (they sent a question) are not counted,
// except at most ASKER_SLACK of them, so a few newcomers do not push answerers out. The cap is on settled links: while pages
// are still joining, a page can be linked to more for a few seconds.
export const LOBBY_LINK_CAP = 8;
export const LEAVE_MIN_S = 2;
export const LEAVE_MAX_S = 6;
export const REJOIN_S = 60;
export const REJOIN_MAX_S = 240;
export const ASKER_SLACK = 3;

export function validAsk(m) {
  return !!m && typeof m === "object" && m.k === "lq" && Object.keys(m).length === 1;
}
export function validAnswer(m) {
  return !!m && typeof m === "object" && m.k === "lr" && Object.keys(m).length === 2 && Number.isInteger(m.r) && m.r >= 1 && m.r <= ROOMS;
}

// A page inside a lantern: answers questions. `room()` is the lantern number, or 0 when the page is not in one.
export function createResponder(net, room, opts = {}) {
  const now = opts.now || (() => performance.now());
  const guard = createGuard(1 / ASK_GAP_S, 2);
  const known = new Set();
  const links = new Set();   // every page linked in the lobby, not only the first LOBBY_PEERS
  const askers = new Set();  // linked pages that sent a question
  const after = opts.after || ((fn, ms) => setTimeout(fn, ms));
  const rand = opts.rand || Math.random;
  let answered = 0, timer = null, gone = false;
  const others = () => links.size - Math.min(ASKER_SLACK, askers.size);
  const check = () => {
    if (gone || timer !== null || others() <= LOBBY_LINK_CAP) return;
    timer = after(() => {
      timer = null;
      if (gone || others() <= LOBBY_LINK_CAP) return; // it quietened while waiting
      gone = true;
      if (opts.leave) opts.leave();
    }, (LEAVE_MIN_S + rand() * (LEAVE_MAX_S - LEAVE_MIN_S)) * 1000);
  };
  net.onPeerJoin((id) => { if (typeof id !== "string") return; links.add(id); if (known.size < LOBBY_PEERS) known.add(id); check(); });
  net.onPeerLeave((id) => { known.delete(id); links.delete(id); askers.delete(id); guard.forget(id); });
  net.onMessage((m, id) => {
    if (typeof id !== "string" || !validAsk(m)) return;
    if (links.has(id)) { askers.add(id); }
    if (!known.has(id)) return;
    const r = room();
    if (!r) return;
    if (!guard.allow(id, now())) return;
    answered++;
    net.send({ k: "lr", r }, id);
  });
  return { answered: () => answered, links: () => links.size, others, left: () => gone };
}

// A page on the landing screen: asks, collects. `counts()` is the number of answers per lantern (index 1 to ROOMS).
export function createAsker(net, opts = {}) {
  const now = opts.now || (() => performance.now());
  const guard = createGuard(1 / ASK_GAP_S, 3);
  const known = new Set();       // players heard from, first LOBBY_PEERS only
  const asked = new Map();       // id -> { n, at, done }
  const answers = new Map();     // id -> { r, at }
  let ended = false, sent = 0;

  const askOne = (id) => {
    const a = asked.get(id) || { n: 0, at: 0, done: false };
    if (a.done || a.n >= MAX_ASKS || (a.n && now() - a.at < RE_ASK_S * 1000)) return;
    a.n++; a.at = now(); asked.set(id, a); sent++;
    net.send({ k: "lq" }, id);
  };
  net.onPeerJoin((id) => { if (ended) return; if (known.size < LOBBY_PEERS) known.add(id); if (known.has(id)) askOne(id); });
  net.onPeerLeave((id) => { known.delete(id); guard.forget(id); });
  net.onMessage((m, id) => {
    if (ended || typeof id !== "string" || !known.has(id) || !validAnswer(m)) return;
    const a = asked.get(id);
    if (!a || a.done) return;                       // only a player we asked, and only once per ask
    if (!guard.allow(id, now())) return;
    if (!answers.has(id) && answers.size >= MAX_ANSWERS) return;
    a.done = true;
    answers.set(id, { r: m.r, at: now() });
  });

  return {
    // called about once a second: ask again whoever has not answered
    tick() { if (!ended) for (const id of known) askOne(id); },
    counts() {
      const c = new Array(ROOMS + 1).fill(0), t = now();
      for (const [id, a] of answers) {
        if (t - a.at > ANSWER_TTL_S * 1000) { answers.delete(id); continue; }
        if (known.has(id)) c[a.r] = Math.min(ROOM_SIZE, c[a.r] + 1);
      }
      return c;
    },
    heard: () => known.size,
    sent: () => sent,
    stop() { ended = true; },
  };
}

// The lantern to suggest: the one with the most answers that is not full (ROOM_SIZE); ties go to the lower number.
// null when nobody answered.
export function suggest(counts) {
  let best = 0;
  for (let r = 1; r <= ROOMS; r++) if (counts[r] > 0 && counts[r] < ROOM_SIZE && (!best || counts[r] > counts[best])) best = r;
  return best ? { room: best, count: counts[best] } : null;
}

const plural = (n) => `${n} player${n === 1 ? "" : "s"}`;
// The words under the lobby button. `counts` as from counts(); `heard` how many players answered or were reached.
export function lookText(counts, state) {
  const parts = [];
  for (let r = 1; r <= ROOMS; r++) if (counts[r] > 0) parts.push(`${plural(counts[r])} in Lantern ${r}${counts[r] >= ROOM_SIZE ? " (full)" : ""}`);
  const guess = "This is only a guess: it counts the players whose browsers answered just now.";
  if (state === "looking" && !parts.length) return `Asking around for ${LOOK_S} seconds…`;
  if (!parts.length) return `Nobody answered. Players may still be somewhere that did not answer in ${LOOK_S} seconds, so this is only a guess. Pick any lantern and wait there, or share the link with a friend.`;
  const s = suggest(counts);
  const lead = s ? `Lantern ${s.room} looks busiest (${plural(s.count)}).` : "Every lantern that answered is full.";
  return `${lead} Seen: ${parts.join(", ")}. ${guess}${state === "looking" ? " Still asking…" : ""}`;
}
