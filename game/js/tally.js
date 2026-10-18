// The dawn tally: at dawn every page in a lantern shows the same short tally of the night. Nothing is sent and nothing is
// saved: each browser works the numbers out from state every page in the lantern already shares, and that state only grows
// (the beacons' fuel shares, the keeper's notes' shares, the shades' light shares), so pages that have heard the same
// messages work out the same numbers.
//
// What is counted, and where each number comes from:
//   beacons burning at dawn   the beacons' shares (beacon.js): lit when the shares add up and two players added some
//   the lighthouse            lit when every beacon is lit (lighthouse.js `watchKept`)
//   keeper's notes done today the notes' shares (quests.js); a night never crosses a UTC day change (48 minutes divide a day by 30)
//   shades driven off tonight the one thing that is not kept anywhere else: a shade's shares are forgotten when its 160 s slot
//                             ends, so this page writes down each (slot, shade) it saw driven off, in a set that only grows
//                             until the night ends. A page that was not here for the whole night cannot know what happened
//                             before it came, so its tally is labelled partial.
// The music stone's glow is left out on purpose: each browser decides it from the notes it heard in the last 1.5 s, so it is not
// shared state and two pages can disagree about it.
import { HOURS, HOUR_MS } from "./nightclock.js";
import { SLOT_MS, MAX_SHADES } from "./shades.js";

export const NIGHT_MS = HOURS * HOUR_MS;                       // 48 minutes
export const DAWN_HOUR = 7;                                    // the tally is shown from this night hour to the end of the night
export const SLOTS_PER_NIGHT = NIGHT_MS / SLOT_MS;            // 18 shade slots in a night
export const MAX_BANISHED = SLOTS_PER_NIGHT * MAX_SHADES;      // the most distinct (slot, shade) pairs one night can hold (the set cannot grow past it: each pair is checked to belong to this night and counted once)

export const nightOf = (ms) => Math.floor(ms / NIGHT_MS);
export const nightStart = (night) => night * NIGHT_MS;
export const slotNo = (ms) => Math.floor(ms / SLOT_MS);

// The tally of one page. `clock` returns the page's time in ms since 1970 (the same clock the shades use).
export function createTally(opts = {}) {
  const clock = opts.clock || (() => Date.now());
  const t0 = clock();
  let night = nightOf(t0);
  let partialLate = t0 > nightStart(night);   // came in after this night began: whatever happened before is unknown
  let lastSlot = slotNo(t0);
  const gone = new Set();                      // slot * MAX_SHADES + shade, for shades driven off this night

  // Start a new night's record when the clock has moved into one (a page that watched the whole of it starts complete).
  function roll() {
    const n = nightOf(clock());
    if (n === night) return;
    night = n; gone.clear(); partialLate = false; lastSlot = slotNo(nightStart(n));
  }
  return {
    get night() { return night; },
    // Called every frame: change night at the night's end, and notice a stretch the page did not see (a tab that stood still
    // for a whole slot or more would have missed what happened in it).
    watch() {
      roll();
      const s = slotNo(clock());
      if (s - lastSlot > 1) partialLate = true;
      if (s > lastSlot) lastSlot = s;
    },
    // A shade of `slot` (number k) was driven off. Returns true when it was written down (it belongs to this night, is new
    // and the list is not full).
    banished(slot, k) {
      roll();
      if (!Number.isInteger(slot) || !Number.isInteger(k) || k < 0 || k >= MAX_SHADES) return false;
      if (nightOf(slot * SLOT_MS) !== night) return false;
      const key = slot * MAX_SHADES + k;
      if (gone.has(key)) return false;
      gone.add(key);
      return true;
    },
    // The tally now. `lit`: array of booleans, one per beacon; `kept`: is the lighthouse lit; `notes`: array of booleans, one per
    // keeper's note; `synced`: has this page heard the others' counts yet. Plain numbers and flags only.
    view({ lit, kept, notes, synced }) {
      roll();
      const late = partialLate, waiting = synced === false;
      return {
        night,
        beaconsLit: lit.filter(v => v === true).length, beaconsTotal: lit.length,
        lighthouse: kept === true,
        notesDone: notes.filter(v => v === true).length, notesTotal: notes.length,
        shades: gone.size,
        partial: late || waiting, why: waiting ? "sync" : late ? "late" : "",
      };
    },
  };
}

// The words, from the numbers only (nothing a peer sent is ever text). Returns { title, lines, note }.
export function tallyText(v) {
  const alsoLeast = v.why === "sync" ? "at least " : "";
  const lines = [
    `Beacons burning at dawn: ${alsoLeast}${v.beaconsLit} of ${v.beaconsTotal}.`,
    v.lighthouse ? "The lighthouse: lit." : "The lighthouse: dark.",
    `Shades driven off tonight: ${v.partial ? "at least " : ""}${v.shades}.`,
    `Keeper's notes done today: ${alsoLeast}${v.notesDone} of ${v.notesTotal}.`,
  ];
  const note = v.why === "late" ? "Partial tally: you came in after this night began (or this page stood still for a while), so shades driven off while you were not here are not counted. The beacons and notes come from the counts the others share, so they match every page that has heard the same messages."
    : v.why === "sync" ? "Partial tally: this page is still hearing the other players' counts, so every number may be higher."
    : "Every page in this lantern that has heard the same messages shows these same numbers. They are worked out in each browser from counts the players share; nothing is saved.";
  return { title: v.partial ? "The dawn tally (partial)" : "The dawn tally", lines, note };
}
