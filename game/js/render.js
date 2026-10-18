// Drawing: the island is painted once into an offscreen canvas (8 px per tile), then each frame the
// visible part is scaled up with a camera on the local player, avatars are drawn, and a night layer
// with a pool of lantern light around every player goes on top.
import { figurePose } from "./figure.js";
import { T, LANDMARK_NAMES, tileAt } from "./world.js";
import { KIND_NAMES } from "./resources.js";
import { PHRASES, EMOTES } from "./talk.js";
import { edgeArrows } from "./arrows.js";
import { lampOf } from "./craft.js";
import { titleFor, MAX_RANK } from "./rank.js";
import { LIT_RADIUS, BEACON_NEED } from "./beacon.js";
import { EMBER_TILES, SHADE_NEED } from "./shades.js";
import { classify, D, EDGE, phaseOf, sway, foamState, sparkle, moonAt, starAlpha, STARS, fireflies, softStops, createGovernor } from "./living.js";
import { CASTERS_MAX, shadowOf, keepDarkest, flameFlicker } from "./shadows.js";
import { glowAt, GLOW_POOL } from "./skyglow.js";
import { createTracks, MARKS_DRAWN, footAlpha, wakeRing } from "./tracks.js";
import { RAIN_DROPS, MIST_BLOBS, MAX_MIST, rainDrops, mistBanks, nameAlpha } from "./weather.js";

const TILE_SRC = 8;
const PAL = {
  [T.DEEP]: ["#0b1830", "#0c1a33", "#0a172d", "#0d1b35"],
  [T.SHALLOW]: ["#17345a", "#183660", "#163257", "#19385f"],
  [T.SAND]: ["#8a7b58", "#8f805c", "#857654", "#928360"],
  [T.GRASS]: ["#2f5a3a", "#31603d", "#2c5537", "#335f3f"],
  [T.MEADOW]: ["#4b6b3a", "#4f703c", "#476636", "#52733f"],
  [T.TREE]: ["#2f5a3a", "#31603d", "#2c5537", "#335f3f"],
  [T.ROCK]: ["#3a3f47", "#3e434b", "#373c44", "#41464e"],
};

// The small up-and-down bob while walking. Reduced-motion players get a steady avatar.
export function walkBob(moving, t, tile, reduce) { return moving && !reduce ? Math.sin(t / 90) * tile * 0.03 : 0; }

function paintLandmarks(g, world) {
  const P = TILE_SRC;
  for (const l of world.landmarks) {
    const px = Math.floor(l.x) * P, py = Math.floor(l.y) * P;
    if (l.kind === "beacon") { // a stone base, a dark post and an unlit iron basket
      g.fillStyle = "#4a4f58"; g.fillRect(px + 1, py + 4, 6, 4);
      g.fillStyle = "#2a2118"; g.fillRect(px + 3, py - 6, 2, 11);
      g.fillStyle = "#1a1612"; g.fillRect(px + 1, py - 10, 6, 4);
      g.fillStyle = "#6b4a2a"; g.fillRect(px + 2, py - 9, 4, 1);
    } else if (l.kind === "lighthouse") { // a round tower with a broken top and a dark doorway
      g.fillStyle = "#8d8f94"; g.fillRect(px + 1, py - 14, 6, 21);
      g.fillStyle = "#6e7077"; g.fillRect(px + 1, py - 14, 2, 21);
      g.fillStyle = "#b9bbbf"; g.fillRect(px + 1, py - 4, 6, 2); g.fillRect(px + 1, py - 10, 6, 2);
      g.fillStyle = "#0b1830"; g.fillRect(px + 1, py - 15, 2, 2); g.fillRect(px + 4, py - 16, 2, 3); // broken crown
      g.fillStyle = "#1a1612"; g.fillRect(px + 3, py + 3, 2, 4);
    } else if (l.kind === "jetty") {
      for (const [bx, by] of l.planks) {
        g.fillStyle = "#6b4a2a"; g.fillRect(bx * P, by * P, P, P);
        g.fillStyle = "#8a6238";
        if (l.dir[0]) for (let i = 1; i < P; i += 3) g.fillRect(bx * P + i, by * P, 1, P);
        else for (let i = 1; i < P; i += 3) g.fillRect(bx * P, by * P + i, P, 1);
        g.fillStyle = "#2a2118";
        if (l.dir[0]) { g.fillRect(bx * P, by * P, P, 1); g.fillRect(bx * P, by * P + P - 1, P, 1); } else { g.fillRect(bx * P, by * P, 1, P); g.fillRect(bx * P + P - 1, by * P, 1, P); }
      }
    } else if (l.kind === "well") { // a ring of stones around dark water
      g.fillStyle = "#6b727d"; g.beginPath(); g.arc(px + 4, py + 4, 3.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#0b1830"; g.beginPath(); g.arc(px + 4, py + 4, 2, 0, Math.PI * 2); g.fill();
    }
  }
}

export function paintWorld(world) {
  const c = document.createElement("canvas");
  c.width = world.w * TILE_SRC; c.height = world.h * TILE_SRC;
  const g = c.getContext("2d");
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const i = y * world.w + x, t = world.tiles[i], s = world.shade[i];
      g.fillStyle = PAL[t][s];
      g.fillRect(x * TILE_SRC, y * TILE_SRC, TILE_SRC, TILE_SRC);
      const px = x * TILE_SRC, py = y * TILE_SRC;
      if (t === T.TREE) {
        g.fillStyle = "#173b26"; g.beginPath(); g.arc(px + 4, py + 4, 3.6, 0, Math.PI * 2); g.fill(); // the crown's lit side sways: drawn each frame by the renderer
      } else if (t === T.ROCK) {
        g.fillStyle = "#565c66"; g.fillRect(px + 1, py + 2, 6, 4); g.fillStyle = "#6b727d"; g.fillRect(px + 2, py + 2, 3, 2);
      } else if (t === T.MEADOW && s === 0) {
        g.fillStyle = "#c9b26b"; g.fillRect(px + 2, py + 5, 1, 1); g.fillStyle = "#b79ad6"; g.fillRect(px + 5, py + 2, 1, 1);
      } else if (t === T.SHALLOW && s === 1) {
        g.fillStyle = "#24477a"; g.fillRect(px + 1, py + 3, 3, 1);
      }
    }
  }
  paintLandmarks(g, world);
  return c;
}

export function createRenderer(canvas, world, opts = {}) {
  const g = canvas.getContext("2d");
  const map = paintWorld(world);
  const dark = document.createElement("canvas");
  const dg = dark.getContext("2d");
  let dpr = 1, cw = 0, ch = 0, lastArrows = [], lastLights = [];
  // The living layer: animated water, foam, swaying trees and grass, fireflies, the moon. `?look=plain` switches it
  // off, `?look=low` starts at the lowest level; by default a governor lowers it on a device that cannot keep up.
  const living = classify(world), gov = createGovernor(opts.look === "low" ? 0 : 2);
  const plain = opts.look === "plain";
  let shadowsOn = !plain && opts.shadows !== false; // `?shadows=off` (tests, measuring) leaves the shadows out
  let tracksOn = !plain && opts.tracks !== false; // `?tracks=off` (tests, measuring) leaves footprints and wakes out
  const tracks = createTracks(), kindAt = (x, y) => { const t = tileAt(world, x, y); return t === T.SAND ? "sand" : t === T.MEADOW ? "meadow" : t === T.SHALLOW ? "wake" : null; };
  let drawnMarks = [], stressN = 0; // stressN: tests only, a fixed crowd of made-up marks round the camera to measure the worst case
  let shadowList = [], lastFlame = null, stoneView = null;
  const samples = new Float32Array(240), frames = new Float32Array(240); let nSamp = 0, prevT = 0, drawCalls = 0;
  let nameDraw = [], flyCount = 0, mistCount = 0, dropCount = 0, lastSky = null, lastGlow = null;
  // One soft blob of mist, painted once and drawn scaled (cheap: no gradient is built per frame).
  const mistSprite = document.createElement("canvas"); mistSprite.width = mistSprite.height = 64;
  { const mg = mistSprite.getContext("2d"), gr = mg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(190,205,225,0.9)"); gr.addColorStop(0.5, "rgba(190,205,225,0.35)"); gr.addColorStop(1, "rgba(190,205,225,0)");
    mg.fillStyle = gr; mg.fillRect(0, 0, 64, 64); }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    dark.width = canvas.width; dark.height = canvas.height;
  }

  // ---- shadows: trees, rocks and landmarks throw a soft shadow away from nearby lights (lanterns, lit beacons, the lit
  // lighthouse), drawn under the crowns and the night layer. Level 2: a soft double edge, up to 40; level 1: one flat
  // shadow, up to 14; level 0: none. The shadows lean a little with a flame's flicker; reduced motion holds them still. ----
  function drawShadows(t, reduce, level, camX, camY, tile, W, H, me, peers, fires, watch, lt) {
    shadowList = [];
    const max = CASTERS_MAX[level];
    if (!shadowsOn || !max) return;
    const lights = [];
    for (const p of [...peers.values(), me]) lights.push({ x: p.x, y: p.y, r: p.snuffed ? EMBER_TILES : lt.reach * lampOf(p.lamp).mult, f: p.snuffed ? 0.5 : 1 });
    for (const f of fires) if (f.lit) lights.push({ x: f.x, y: f.y, r: LIT_RADIUS, f: flameFlicker(t, f.n, level, reduce).glow });
    if (watch) lights.push({ x: watch.x, y: watch.y, r: watch.r * watch.f, f: flameFlicker(t, 99, level, reduce).glow });
    const w = world.w, x0 = Math.max(0, Math.floor(camX / tile) - 1), x1 = Math.min(w - 1, Math.floor((camX + W) / tile) + 1);
    const y0 = Math.max(0, Math.floor(camY / tile) - 1), y1 = Math.min(world.h - 1, Math.floor((camY + H) / tile) + 2);
    const found = [], add = (x, y, kind) => { const sh = shadowOf(x, y, kind, lights); if (sh) found.push({ x, y, kind, ...sh }); };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const tt = world.tiles[y * w + x];
      if (tt === T.TREE) add(x + 0.5, y + 0.78, "tree"); else if (tt === T.ROCK) add(x + 0.5, y + 0.72, "rock");
    }
    for (const l of world.landmarks) if (l.kind !== "jetty" && l.x >= x0 - 1 && l.x <= x1 + 2 && l.y >= y0 - 1 && l.y <= y1 + 2) add(l.x, l.y + 0.3, l.kind);
    shadowList = keepDarkest(found, max);
    const stretch = lt.glow ? lt.glow.shadowLen : 1; // long shadows at dawn and dusk
    for (const s of shadowList) {
      if (stretch !== 1) s.len *= stretch;
      const bx = s.x * tile - camX, by = s.y * tile - camY, len = s.len * tile, half = len / 2, wd = s.wid * tile / 2, ang = Math.atan2(s.dy, s.dx);
      const cx = bx + s.dx * half * 0.9, cy = by + s.dy * half * 0.9;
      if (level >= 2) { g.fillStyle = `rgba(0,0,0,${(s.alpha * 0.45).toFixed(3)})`; g.beginPath(); g.ellipse(cx, cy, half * 1.12, wd * 1.35, ang, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = `rgba(0,0,0,${(s.alpha * (level >= 2 ? 0.7 : 1)).toFixed(3)})`; g.beginPath(); g.ellipse(cx, cy, half * (level >= 2 ? 0.88 : 1), wd, ang, 0, Math.PI * 2); g.fill();
    }
  }

  // ---- footprints and wakes (milestone 29): worked out here from the positions this browser already holds; a footprint
  // on sand or meadow every 0.6 tile walked, a ring on shallow water every 0.45, fading in 6 s and 2.2 s. Drawn under the
  // players and the night layer, so they show where a lantern lights them. Level 0: none; level 1: up to 120 marks and
  // wakes that do not spread; level 2: up to 300. Reduced motion keeps the footprints and holds the wake rings still. ----
  function stressMarks(t, level, me, max) {
    const out = [];
    for (let i = 0; i < Math.min(stressN, max); i++) {
      const wake = i % 5 === 0, a = i * 2.399963, r = 0.6 + (i % 17) * 0.45; // a spiral of marks round the player, a fifth of them wakes
      out.push({ o: "s" + (i % 12), x: me.x + Math.cos(a) * r, y: me.y + Math.sin(a) * r * 0.7, ang: a, ground: wake ? "wake" : i % 2 ? "sand" : "meadow", t: t - (i * 37) % (wake ? 2000 : 5500) });
    }
    return out;
  }
  const FOOT_RGB = { sand: "44,32,14", meadow: "22,42,16" };
  function drawTracks(t, reduce, level, camX, camY, tile, me, peers) {
    drawnMarks = [];
    if (!tracksOn) { tracks.clear(); return; }
    const walkers = [{ id: "me", x: me.x, y: me.y, moving: !!me.moving }];
    for (const p of peers.values()) walkers.push({ id: p.id, x: p.x, y: p.y, moving: !!p.moving });
    tracks.update(t, walkers, kindAt);
    const max = MARKS_DRAWN[level];
    if (!max) return;
    const still = reduce || level < 2, W = g.canvas.width, H = g.canvas.height;
    drawnMarks = stressN ? stressMarks(t, level, me, max) : tracks.list(max);
    for (const m of drawnMarks) {
      const sx = m.x * tile - camX, sy = m.y * tile - camY;
      if (sx < -tile || sy < -tile || sx > W + tile || sy > H + tile) continue;
      const age = t - m.t;
      if (m.ground === "wake") {
        const w = wakeRing(age, still); if (!(w.a > 0.005)) continue;
        g.strokeStyle = `rgba(200,225,245,${w.a.toFixed(3)})`; g.lineWidth = Math.max(1, tile * 0.05);
        g.beginPath(); g.ellipse(sx, sy, w.r * tile, w.r * tile * 0.55, 0, 0, Math.PI * 2); g.stroke();
      } else {
        const a = footAlpha(age, m.ground); if (!(a > 0.005)) continue;
        g.fillStyle = `rgba(${FOOT_RGB[m.ground]},${a.toFixed(3)})`;
        g.beginPath(); g.ellipse(sx, sy, tile * 0.115, tile * 0.065, m.ang, 0, Math.PI * 2); g.fill();
      }
    }
  }

  // ---- the living layer: water glints, shore foam, swaying crowns and grass, all on the visible tiles only ----
  function drawGround(t, reduce, level, camX, camY, tile, W, H, light) {
    const k = tile / TILE_SRC, w = world.w, seed = world.seed;
    const x0 = Math.max(0, Math.floor(camX / tile)), x1 = Math.min(w - 1, Math.floor((camX + W) / tile));
    const y0 = Math.max(0, Math.floor(camY / tile)), y1 = Math.min(world.h - 1, Math.floor((camY + H) / tile));
    const moon = moonAt(light.hour), glintK = 0.35 + 0.5 * moon.lit, th = Math.max(1, k * 0.55);
    const lively = !plain;
    const crowns = new Path2D(), flecks = new Path2D(), blades = new Path2D(), bladesM = new Path2D();
    let nBlades = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x, d = living.deco[i], f = living.foam[i];
        if (!d && !f) continue;
        const px = x * tile - camX, py = y * tile - camY, ph = phaseOf(x, y, seed);
        if (d === D.TREE) {
          const sw = sway(t, ph, reduce || !lively);
          crowns.moveTo(px + (3.3 + sw.x) * k + 2 * k, py + (3.3 + sw.y) * k); crowns.arc(px + (3.3 + sw.x) * k, py + (3.3 + sw.y) * k, 2 * k, 0, Math.PI * 2);
          if (lively) { flecks.moveTo(px + (2.5 + sw.x * 1.7) * k + 0.9 * k, py + (2.6 + sw.y * 1.7) * k); flecks.arc(px + (2.5 + sw.x * 1.7) * k, py + (2.6 + sw.y * 1.7) * k, 0.9 * k, 0, Math.PI * 2); }
        }
        if (!lively) continue;
        if (f) {
          const fs = foamState(t, ph, reduce), off = fs.wash * 0.2 * tile;
          g.fillStyle = `rgba(226,238,250,${fs.alpha.toFixed(2)})`;
          const a0 = (ph % 1) * 0.1; // each tile's foam breaks in a slightly different place
          if (f & EDGE.N) { g.fillRect(px + (0.05 + a0) * tile, py + off, 0.45 * tile, th); g.fillRect(px + (0.58 - a0) * tile, py + off + th, 0.37 * tile, th); }
          if (f & EDGE.S) { g.fillRect(px + (0.05 + a0) * tile, py + tile - off - th, 0.4 * tile, th); g.fillRect(px + (0.55 - a0) * tile, py + tile - off - 2 * th, 0.4 * tile, th); }
          if (f & EDGE.W) { g.fillRect(px + off, py + (0.05 + a0) * tile, th, 0.45 * tile); g.fillRect(px + off + th, py + (0.58 - a0) * tile, th, 0.37 * tile); }
          if (f & EDGE.E) { g.fillRect(px + tile - off - th, py + (0.05 + a0) * tile, th, 0.4 * tile); g.fillRect(px + tile - off - 2 * th, py + (0.55 - a0) * tile, th, 0.4 * tile); }
        }
        if (d === D.SPARKLE && level >= 2) {
          const sp = sparkle(t, ph, reduce);
          if (sp > 0.02) {
            g.fillStyle = `rgba(205,224,255,${(sp * glintK).toFixed(2)})`;
            g.fillRect(px + (1 + (ph % 3.1)) * k, py + (1 + ((ph * 7) % 5)) * k, 2.2 * k, Math.max(1, 0.7 * k));
          }
        } else if (d === D.GRASS && level >= 2 && nBlades < 220) {
          nBlades++;
          const sw = sway(t, ph, reduce), bx = px + (1.5 + (ph * 3) % 5) * k, by = py + 6.6 * k, p = world.tiles[i] === T.MEADOW ? bladesM : blades;
          p.moveTo(bx, by); p.lineTo(bx + sw.x * 1.5 * k, by - 2.5 * k);
          p.moveTo(bx + k, by); p.lineTo(bx + k + sw.x * 1.5 * k + 0.4 * k, by - 1.8 * k);
        }
      }
    }
    g.fillStyle = "#215034"; g.fill(crowns);
    if (lively) { g.fillStyle = "#2f6a44"; g.fill(flecks); }
    if (nBlades) {
      g.lineWidth = Math.max(1, k * 0.5); g.lineCap = "round";
      g.strokeStyle = "rgba(96,148,86,0.8)"; g.stroke(blades);
      g.strokeStyle = "rgba(168,178,92,0.8)"; g.stroke(bladesM);
      g.lineCap = "butt";
    }
  }

  // Fireflies drift round lit beacons and every lantern; coloured lanterns draw more, in their colour.

  // ---- the shades: a hooded wisp of cold mist with two pale eyes, drawn over the night so it is always found. Light
  // thins it, shrinks it and bends it away from the lantern; sparks fly off it where light burns it; a ring at its feet
  // fills with the light the players have put on it. A driven-off shade bursts into drifting motes. ----
  const bursts = [];
  function burst(x, y, t) { if (bursts.length < 12) bursts.push({ x, y, t0: t }); }
  function shadeBody(u, s, lean, sw, hemT, k, reduce) {
    const p = new Path2D(), top = -13 * u * s, hw = 5 * u;
    p.moveTo(lean + sw * 0.8 * u, top);
    p.bezierCurveTo(lean * 0.8 - 1.8 * u, top + 2.5 * u, -4.6 * u + lean * 0.3, -7.5 * u * s, -hw, -1 * u);
    const n = 5, step = (2 * hw) / n;
    for (let i = 0; i < n; i++) {
      const x0 = -hw + i * step, x1 = x0 + step, w = reduce ? 0 : Math.sin(hemT / 260 + i * 1.3 + k) * 0.9 * u;
      p.quadraticCurveTo((x0 + x1) / 2, (i % 2 ? 1.6 : -1.8) * u + w, x1, (i === n - 1 ? -1 : (i % 2 ? -1.4 : 0.2)) * u);
    }
    p.bezierCurveTo(4.6 * u + lean * 0.3, -7.5 * u * s, lean * 0.8 + 1.8 * u, top + 2.5 * u, lean + sw * 0.8 * u, top);
    p.closePath();
    return p;
  }
  function drawShades(t, reduce, camX, camY, tile, shades, all, lt, me) {
    const u = tile / 8, fontPx = Math.round(12 * dpr), SC = 1.25; // a shade stands about two tiles tall
    for (const sh of shades) {
      if (sh.gone) continue;
      const sx = sh.x * tile - camX, sy = sh.y * tile - camY;
      if (sx < -tile * 3 || sy < -tile * 3 || sx > canvas.width + tile * 3 || sy > canvas.height + tile * 3) continue;
      let c = 0, ax = 0;
      for (const p of all) {
        const tiles = p.snuffed ? EMBER_TILES : lt.reach * lampOf(p.lamp).mult, d = Math.hypot(p.x - sh.x, p.y - sh.y);
        const v = Math.max(0, Math.min(1, (tiles * 0.9 - d) / (tiles * 0.6)));
        if (v > c) { c = v; ax = Math.sign(sh.x - p.x) || 1; }
      }
      const a = sh.alpha * (sh.safe ? 0.35 : 1) * (1 - 0.5 * c), s = 1 - 0.3 * c, lean = ax * c * 1.8 * u;
      const sw = reduce ? 0 : Math.sin(t / 520 + sh.k * 1.7), fy = reduce ? 0 : Math.sin(t / 900 + sh.k * 2.3) * 0.5 * u; // it floats a little
      g.save();
      g.translate(sx, sy + fy); g.scale(SC, SC);
      g.globalAlpha = a * 0.35; g.fillStyle = "#000"; // ground shadow
      g.beginPath(); g.ellipse(0, 0.8 * u, 5.5 * u * s, 1.9 * u, 0, 0, Math.PI * 2); g.fill();
      g.globalAlpha = a * 0.5; g.fillStyle = "rgb(58,46,112)"; // mist round its feet
      for (let i = 0; i < 3; i++) { const o = reduce ? 0 : Math.sin(t / 700 + i * 2.1 + sh.k) * 1.4 * u; g.beginPath(); g.ellipse((i - 1) * 3.2 * u + o, 0.2 * u, 3.2 * u, 1.3 * u, 0, 0, Math.PI * 2); g.fill(); }
      // trailing arms: thin wisps that reach out and sway
      g.globalAlpha = a * 0.7; g.strokeStyle = "rgb(124,104,190)"; g.lineWidth = Math.max(1, 0.8 * u); g.lineCap = "round";
      for (const side of [-1, 1]) {
        const w = sw * side * 0.9 * u;
        g.beginPath(); g.moveTo(side * 3.2 * u, -7 * u * s);
        g.quadraticCurveTo(side * 7.4 * u + w, -6 * u * s, side * 7.6 * u + w * 1.4, -2.2 * u * s + Math.abs(w) * 0.4);
        g.stroke();
        for (let f = -1; f <= 1; f++) { g.beginPath(); g.moveTo(side * 7.6 * u + w * 1.4, -2.2 * u * s + Math.abs(w) * 0.4); g.lineTo(side * (8.4 + 0.3 * f) * u + w * 1.5, (-0.6 + f * 0.9) * u * s); g.stroke(); }
      }
      // the cloak
      const body = shadeBody(u, s, lean, sw, t, sh.k, reduce);
      const gr = g.createLinearGradient(0, -13 * u * s, 0, 1.5 * u);
      gr.addColorStop(0, "rgba(104,82,162,0.96)"); gr.addColorStop(0.55, "rgba(52,38,98,0.9)"); gr.addColorStop(1, "rgba(24,16,52,0.35)");
      g.globalAlpha = a; g.fillStyle = gr; g.fill(body);
      g.globalAlpha = a * 0.8; g.strokeStyle = c > 0.5 ? "rgb(255,226,160)" : "rgb(150,232,228)"; g.lineWidth = Math.max(1, 0.45 * u); g.lineJoin = "round"; g.stroke(body); // a cold rim keeps it readable on dark ground
      // the hood's void and the eyes
      g.globalAlpha = a; g.fillStyle = "rgba(3,2,10,0.96)";
      g.beginPath(); g.ellipse(lean * 0.7 + sw * 0.5 * u, -9.4 * u * s, 2.3 * u, 2.9 * u * s, 0, 0, Math.PI * 2); g.fill();
      const blink = !reduce && (t / 1000 + sh.k * 1.3) % 4.2 < 0.14, squint = c > 0.3 || blink ? 0.35 : 1;
      for (const ex of [-1, 1]) {
        const cx = lean * 0.7 + sw * 0.5 * u + ex * 1.0 * u, cy = -9.6 * u * s;
        g.fillStyle = "rgba(160,245,236,0.22)"; g.beginPath(); g.arc(cx, cy, 1.7 * u, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#bff8ee"; g.beginPath(); g.ellipse(cx, cy, 0.62 * u, 0.95 * u * squint, 0, 0, Math.PI * 2); g.fill();
      }
      // sparks where light burns it
      if (c > 0.05) {
        const n = reduce ? 3 : Math.round(3 + 6 * c);
        g.fillStyle = "#ffe9a8";
        for (let i = 0; i < n; i++) {
          const ph = reduce ? i / n : ((t / 900 + i * 0.37 + sh.k * 0.2) % 1), px = (((i * 37 + sh.k * 11) % 9) - 4) * 0.8 * u + lean * ph, py = -(1 + ph * 12) * u * s;
          g.globalAlpha = a * (1 - ph) * Math.min(1, c * 2.2); g.fillRect(px - 0.4 * u, py - 0.4 * u, 0.8 * u, 0.8 * u);
        }
      }
      g.restore();
      // the ring of light put on it, and its count when you are near
      if (sh.total > 0 || c > 0.05) {
        g.save(); g.translate(sx, sy + 1.2 * u); g.scale(SC, SC); g.globalAlpha = Math.min(1, sh.alpha * 1.2);
        g.strokeStyle = "rgba(255,233,168,0.28)"; g.lineWidth = Math.max(1.5, 0.7 * u);
        g.beginPath(); g.ellipse(0, 0, 7.2 * u, 2.9 * u, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = "rgb(255,224,130)";
        g.beginPath(); g.ellipse(0, 0, 7.2 * u, 2.9 * u, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, sh.total / SHADE_NEED)); g.stroke();
        g.restore();
      }
      if (Math.hypot(me.x - sh.x, me.y - sh.y) < 6 && sh.alpha > 0.5) {
        g.font = `${fontPx}px Georgia, serif`; g.textAlign = "center";
        const lab = `Shade: light ${Math.min(sh.total, SHADE_NEED)} of ${SHADE_NEED}`, ly = sy - 18.5 * u * s;
        g.lineWidth = 3 * dpr; g.strokeStyle = "rgba(5,8,18,0.85)"; g.fillStyle = "#d6cdf5";
        g.strokeText(lab, sx, ly); g.fillText(lab, sx, ly);
      }
    }
    // motes of a shade that was driven off
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i], age = (t - b.t0) / 1800;
      if (age >= 1 || age < 0) { bursts.splice(i, 1); continue; }
      const bx = b.x * tile - camX, by = b.y * tile - camY;
      g.save(); g.translate(bx, by);
      for (let j = 0; j < 16; j++) {
        const ang = j * 0.3927 + (j % 3) * 0.2, d = (reduce ? 0.5 : age) * (4 + (j % 4)) * u, up = (reduce ? 0.5 : age) * (6 + (j % 5)) * u;
        g.globalAlpha = (1 - age) * 0.9; g.fillStyle = j % 2 ? "#ffe9a8" : "#e8e4ff";
        g.fillRect(Math.cos(ang) * d - 0.6 * u, Math.sin(ang) * d * 0.5 - up - 0.6 * u, 1.2 * u, 1.2 * u);
      }
      g.restore();
    }
  }

  function drawFireflies(t, reduce, level, camX, camY, tile, W, H, all, fires) {
    if (level < 1) { flyCount = 0; return; }
    const r = tile * 0.075; let n = 0;
    const draw = (list, sx, sy, rgb) => {
      for (const f of list) {
        const x = f.x * tile - camX, y = f.y * tile - camY;
        if (x < -r * 4 || y < -r * 4 || x > W + r * 4 || y > H + r * 4) continue;
        g.fillStyle = `rgba(${rgb},${(0.2 * f.a).toFixed(2)})`; g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgba(${rgb},${f.a.toFixed(2)})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        n++;
      }
    };
    g.globalCompositeOperation = "lighter";
    for (const f of fires) if (f.lit) draw(fireflies(level >= 2 ? 7 : 3, 100 + f.n, f.x, f.y - 0.4, 3.4, t, reduce), 0, 0, "255,222,130");
    for (const p of all) {
      const gl = lampOf(p.lamp).glow, cnt = gl ? (level >= 2 ? 3 : 1) : (level >= 2 ? 1 : 0);
      if (cnt) draw(fireflies(cnt, 500 + ((p.seed || 0) % 997), p.x, p.y, gl ? 2.0 : 1.5, t, reduce), 0, 0, gl ? gl.join(",") : "240,226,160");
    }
    g.globalCompositeOperation = "source-over";
    flyCount = n;
  }

  // A small strip at the top centre: stars and the moon crossing from dusk to dawn.
  // Mist: a thin flat veil plus (above level 0) a few soft banks drifting across; always thin enough that lanterns, paths
  // and players stay easy to see. Reduced motion: the banks stand still.
  function drawMist(t, reduce, level, W, H, mist) {
    mistCount = 0;
    if (mist <= 0.02) return;
    g.fillStyle = `rgba(150,170,195,${(mist * MAX_MIST * 0.45).toFixed(3)})`; g.fillRect(0, 0, W, H);
    const n = MIST_BLOBS[level];
    if (!n) return;
    g.globalAlpha = Math.min(1, mist * MAX_MIST * 1.6);
    for (const b of mistBanks(n, t, reduce)) {
      const r = b.r * Math.max(W, H) * 0.9, x = b.x * (W + 2 * r) - r, y = b.y * H;
      g.drawImage(mistSprite, x - r, y - r * 0.55, r * 2, r * 1.1); mistCount++;
    }
    g.globalAlpha = 1;
  }
  // Rain: a cool tint and thin slanted streaks (none under reduced motion, where only the tint stays).
  function drawRain(t, reduce, level, W, H, rain, dpr) {
    dropCount = 0;
    if (rain <= 0.02) return;
    g.fillStyle = `rgba(20,32,56,${(0.14 * rain).toFixed(3)})`; g.fillRect(0, 0, W, H);
    const drops = rainDrops(RAIN_DROPS[level], t, rain, reduce);
    if (!drops.length) return;
    g.strokeStyle = "rgba(190,210,235,0.38)"; g.lineWidth = Math.max(1, dpr);
    g.beginPath();
    for (const d of drops) { const x = d.x * W, y = d.y * H, l = d.len * H; g.moveTo(x, y); g.lineTo(x - l * 0.25, y + l); }
    g.stroke(); dropCount = drops.length;
  }

  function drawSky(t, reduce, light, dpr, env) {
    const W = canvas.width, bw = Math.min(150 * dpr, W * 0.36), bh = 40 * dpr, x = W / 2 - bw / 2, y = 8 * dpr, hor = y + bh * 0.82;
    const moon = moonAt(light.hour), sh = env ? env.shades : 0, wet = env ? Math.min(1, env.mist * 0.6 + env.rain * 0.5) : 0;
    const sa = starAlpha(light.dark) * (1 - 0.8 * sh) * (1 - 0.6 * wet);
    g.save();
    g.beginPath(); if (g.roundRect) g.roundRect(x, y, bw, bh, 8 * dpr); else g.rect(x, y, bw, bh);
    g.fillStyle = "rgba(5,8,18,0.62)"; g.fill();
    g.clip();
    const sky = g.createLinearGradient(0, y, 0, hor);
    sky.addColorStop(0, "rgba(10,18,44,0.0)"); sky.addColorStop(1, `rgba(${light.tint[0] * 2 + 20},${light.tint[1] * 2 + 20},${light.tint[2] * 2 + 40},0.55)`);
    g.fillStyle = sky; g.fillRect(x, y, bw, hor - y);
    g.fillStyle = "#fff6dc";
    for (const s of STARS) {
      const a = sa * (reduce ? 0.8 : 0.55 + 0.45 * Math.sin(t / 700 + s.ph));
      if (a < 0.05 || s.y > 0.7) continue;
      g.globalAlpha = Math.min(1, a); g.fillRect(x + s.x * bw, y + 3 * dpr + s.y * bh * 0.85, s.s * dpr, s.s * dpr);
    }
    g.globalAlpha = 1;
    if (wet > 0.05) { // cloud over the strip in mist and rain: a grey wash, with a few short streaks when it rains
      g.fillStyle = `rgba(120,135,160,${(0.22 * wet).toFixed(3)})`; g.fillRect(x, y, bw, bh);
      if (env.rain > 0.1 && !reduce) { g.strokeStyle = "rgba(190,210,235,0.45)"; g.lineWidth = Math.max(1, dpr * 0.8); g.beginPath(); for (let i = 0; i < 7; i++) { const u = ((i * 0.37 + t / 900) % 1), sx = x + ((i * 0.61) % 1) * bw; g.moveTo(sx, y + u * bh * 0.8); g.lineTo(sx - 2 * dpr, y + u * bh * 0.8 + 6 * dpr); } g.stroke(); }
    }
    const mx = x + bw * (0.1 + 0.8 * moon.x), my = hor - moon.h * bh * 0.62, mr = 6 * dpr;
    g.fillStyle = "rgba(244,236,208,0.16)"; g.beginPath(); g.arc(mx, my, mr * 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f4ecd0"; g.globalAlpha = 1 - 0.55 * Math.max(sh, wet); g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.fillStyle = "rgba(160,150,120,0.55)"; g.beginPath(); g.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.28, 0, Math.PI * 2); g.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.2, 0, Math.PI * 2); g.fill();
    if (sh > 0.02) { // a wave of shades: a violet-black darkness gathers over the strip, with dark banks creeping in from both sides
      g.fillStyle = `rgba(14,4,28,${(0.5 * sh).toFixed(3)})`; g.fillRect(x, y, bw, bh);
      g.fillStyle = `rgba(4,2,12,${(0.7 * sh).toFixed(3)})`;
      const drift = reduce ? 0 : Math.sin(t / 2400) * 0.04;
      for (const [fx, fy, fr] of [[0.08, 0.35, 0.3], [0.92, 0.3, 0.3], [0.3 + drift, 0.12, 0.22], [0.7 - drift, 0.14, 0.22]]) { g.beginPath(); g.ellipse(x + bw * fx, y + bh * fy, bw * fr * sh * 1.2, bh * 0.28 * sh, 0, 0, Math.PI * 2); g.fill(); }
    }
    const gl = glowAt(light.hour, light.tint);
    if (gl.amount > 0.02) { // dusk or dawn: the sky glows low over the sea
      const band = g.createLinearGradient(0, hor - bh * 0.5, 0, hor), c = gl.horizon;
      band.addColorStop(0, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},0)`); band.addColorStop(1, `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(0.38 * gl.amount).toFixed(3)})`);
      g.fillStyle = band; g.fillRect(x, hor - bh * 0.5, bw, bh * 0.5);
    }
    g.fillStyle = "rgba(5,8,18,0.9)"; g.fillRect(x, hor, bw, y + bh - hor); // the dark horizon
    { const c = gl.horizon, shim = reduce ? 1 : 1 + 0.08 * Math.sin(t / 1300); // the thin line where sky meets sea (steady under reduced motion)
      g.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.min(1, c[3] * shim).toFixed(3)})`; g.fillRect(x, hor, bw, Math.max(1, Math.round(dpr))); }
    g.restore();
    g.strokeStyle = sh > 0.3 ? `rgba(200,170,235,${(0.4 + 0.2 * sh).toFixed(2)})` : "rgba(255,243,214,0.4)"; g.lineWidth = Math.max(1, dpr);
    g.beginPath(); if (g.roundRect) g.roundRect(x, y, bw, bh, 8 * dpr); else g.rect(x, y, bw, bh); g.stroke();
  }

  // Frame and draw times of the last 240 frames, for the tests and for measuring (never sent anywhere).
  function stats() {
    const n = Math.min(nSamp, 240); if (!n) return { frames: 0, level: gov.level };
    const a = Array.from(samples.subarray(0, n)).sort((p, q) => p - q), f = Array.from(frames.subarray(0, n)).filter(v => v > 0 && v < 500).sort((p, q) => p - q);
    const mean = (v) => v.reduce((p, q) => p + q, 0) / (v.length || 1), pct = (v, q) => v.length ? v[Math.min(v.length - 1, Math.floor(v.length * q))] : 0;
    return { frames: nSamp, level: gov.level, drawMean: mean(a), drawP95: pct(a, 0.95), drawMax: a[a.length - 1], frameMean: mean(f), frameP95: pct(f, 0.95), fps: f.length ? 1000 / mean(f) : 0, fireflies: flyCount, mistBanks: mistCount, drops: dropCount, names: nameDraw, sky: lastSky, flame: lastFlame ? { ...lastFlame } : null, glow: lastGlow ? { kind: lastGlow.kind, amount: lastGlow.amount, tint: lastGlow.tint.slice(), darkAdd: lastGlow.darkAdd, shadowLen: lastGlow.shadowLen } : null, tracks: { on: tracksOn, marks: tracks.size(), drawn: drawnMarks.length, feet: drawnMarks.filter(m => m.ground !== "wake").length, wakes: drawnMarks.filter(m => m.ground === "wake").length, list: drawnMarks.map(m => ({ o: m.o, x: m.x, y: m.y, ground: m.ground, age: Math.round(prevT - m.t) })) }, shadows: shadowList.length, shadowList: shadowList.map(s => ({ x: s.x, y: s.y, kind: s.kind, dx: s.dx, dy: s.dy, len: s.len, alpha: s.alpha })) };
  }

  function draw(me, peers, stick, t, light, nodes, reach, fires, shades, env, watch, fishing) {
    const t0 = performance.now();
    drawFrame(me, peers, stick, t, light, nodes, reach, fires, shades, env, watch, fishing);
    const i = nSamp % 240; samples[i] = performance.now() - t0; frames[i] = prevT ? t - prevT : 0; nSamp++;
    if (prevT) gov.note(t - prevT);
    prevT = t;
  }

  function drawFrame(me, peers, stick, t, light, nodes = [], reach = null, fires = [], shades = [], env = null, watch = null, fishing = null) {
    const reduce = !!(opts.reducedMotion && opts.reducedMotion());
    const level = plain ? 0 : gov.level;
    if (canvas.clientWidth !== cw || canvas.clientHeight !== ch) resize();
    const tile = (cw < 520 ? 30 : 36) * dpr; // screen px per tile
    const W = canvas.width, H = canvas.height;
    const camX = me.x * tile - W / 2, camY = me.y * tile - H / 2;
    g.imageSmoothingEnabled = false;
    g.fillStyle = PAL[T.DEEP][0]; g.fillRect(0, 0, W, H);
    const k = tile / TILE_SRC;
    g.drawImage(map, -camX, -camY, map.width * k, map.height * k);
    const lt0 = light || { dark: 0.5, tint: [3, 6, 18], reach: 3.2, hour: 3 };
    const glow = plain ? null : glowAt(lt0.hour, lt0.tint); lastGlow = glow;
    const lt = glow ? { ...lt0, tint: glow.tint, glow } : lt0; // at dusk and dawn the night layer takes the sky's colour
    drawShadows(t, reduce, level, camX, camY, tile, W, H, me, peers, fires, watch, lt);
    drawGround(t, reduce, level, camX, camY, tile, W, H, lt);
    drawTracks(t, reduce, level, camX, camY, tile, me, peers);
    lastSky = env ? { mist: env.mist, rain: env.rain, kind: env.kind, shades: env.shades } : null;
    if (env && !plain) drawMist(t, reduce, level, W, H, env.mist);

    for (const n of nodes) drawNode(g, n, n.x * tile - camX, n.y * tile - camY, tile, n === reach, t, reduce);
    if (fishing) for (const f of fishing.fish) drawFish(g, f, f.x * tile - camX, f.y * tile - camY, tile, t, reduce); // under the night layer: seen where a lantern lights the water

    if (stoneView) drawStone(g, stoneView, stoneView.x * tile - camX, stoneView.y * tile - camY, tile, t, reduce);
    { const lf = fires.find(q => q.lit); lastFlame = lf && !plain ? flameFlicker(t, lf.n, level, reduce) : null; }
    for (const f of fires) drawFlame(g, f, f.x * tile - camX, (f.y - 0.85) * tile - camY, tile, t, reduce, plain ? -1 : level);

    const all = [...peers.values(), me];
    all.sort((a, b) => a.y - b.y);
    const fontPx = Math.round(12 * dpr);
    g.font = `${fontPx}px Georgia, serif`;
    g.textAlign = "center";
    for (const p of all) drawAvatar(g, p, p.x * tile - camX, p.y * tile - camY, tile, p === me, t, reduce);

    // Night layer with light pools.
    dg.globalCompositeOperation = "source-over";
    dg.clearRect(0, 0, W, H);
    dg.fillStyle = `rgba(${lt.tint[0]},${lt.tint[1]},${lt.tint[2]},${Math.min(0.95, lt.dark + (lt.glow ? lt.glow.darkAdd : 0)).toFixed(3)})`; dg.fillRect(0, 0, W, H);
    dg.globalCompositeOperation = "destination-out";
    lastLights = [];
    for (const p of all) {
      const sx = p.x * tile - camX, sy = p.y * tile - camY, lamp = p.snuffed ? lampOf(0) : lampOf(p.lamp);
      const flick = reduce || !lamp.glow ? 1 : 1 + Math.sin(t / 140 + (p.seed || 0) % 7) * 0.012; // coloured lanterns flicker a very little
      const tiles = p.snuffed ? EMBER_TILES : lt.reach * lamp.mult * flick, r = tile * tiles;
      lastLights.push({ id: p.id === "me" || p === me ? "me" : p.id, tiles: Math.round(tiles * 100) / 100, lamp: p.lamp | 0, snuffed: !!p.snuffed });
      const grad = dg.createRadialGradient(sx, sy, 0, sx, sy, r);
      if (lamp.glow && !plain && !p.snuffed) for (const [s, a] of softStops(0.95)) grad.addColorStop(s, `rgba(0,0,0,${a.toFixed(3)})`); // coloured lanterns: a soft edge
      else { grad.addColorStop(0, "rgba(0,0,0,0.95)"); grad.addColorStop(0.55, "rgba(0,0,0,0.6)"); grad.addColorStop(1, "rgba(0,0,0,0)"); }
      dg.fillStyle = grad; dg.beginPath(); dg.arc(sx, sy, r, 0, Math.PI * 2); dg.fill();
    }
    // Beacons: a lit one clears a wide pool of night; one that is taking fuel gives a small ember light.
    for (const f of fires) {
      const sx = f.x * tile - camX, sy = f.y * tile - camY, tiles = f.lit ? LIT_RADIUS * (plain ? (reduce ? 1 : 1 + Math.sin(t / 300 + f.n) * 0.015) : flameFlicker(t, f.n, level, reduce).glow) : 0.8 + 1.8 * f.frac;
      if (f.fuel <= 0 && !f.lit) continue;
      const r = tile * tiles, grad = dg.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, "rgba(0,0,0,0.98)"); grad.addColorStop(0.6, f.lit ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.5)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      dg.fillStyle = grad; dg.beginPath(); dg.arc(sx, sy, r, 0, Math.PI * 2); dg.fill();
    }
    if (watch) { // the lit lighthouse clears a wide pool of night
      const sx = watch.x * tile - camX, sy = watch.y * tile - camY, r = tile * watch.r * watch.f, grad = dg.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, "rgba(0,0,0,0.98)"); grad.addColorStop(0.7, "rgba(0,0,0,0.75)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      dg.fillStyle = grad; dg.beginPath(); dg.arc(sx, sy, r, 0, Math.PI * 2); dg.fill();
    }
    g.drawImage(dark, 0, 0);
    // The glow of a coloured lantern: a soft pool of its colour on the ground, for everyone who can see it.
    g.globalCompositeOperation = "lighter";
    if (lt.glow && lt.glow.amount > 0.02) { // dawn and dusk: the sky is bright, so every lantern also lays a soft warm pool on the ground to keep its edge easy to see
      for (const p of all) {
        if (p.snuffed) continue;
        const sx = p.x * tile - camX, sy = p.y * tile - camY, r = tile * lt.reach * lampOf(p.lamp).mult * 0.95, grad = g.createRadialGradient(sx, sy, 0, sx, sy, r);
        for (const [st, a] of softStops(GLOW_POOL * lt.glow.amount)) grad.addColorStop(st, `rgba(255,214,140,${a.toFixed(3)})`);
        g.fillStyle = grad; g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
      }
    }
    for (const p of all) {
      const lamp = lampOf(p.lamp);
      if (!lamp.glow || p.snuffed) continue;
      const sx = p.x * tile - camX, sy = p.y * tile - camY, r = tile * lt.reach * lamp.mult * 0.85, [cr, cg, cb] = lamp.glow;
      const grad = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      if (plain) { grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.30)`); grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.12)`); grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`); }
      else for (const [s, a] of softStops(0.30)) grad.addColorStop(s, `rgba(${cr},${cg},${cb},${a.toFixed(3)})`);
      g.fillStyle = grad; g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
    }
    for (const f of fires) {
      if (!f.lit) continue;
      const sx = f.x * tile - camX, sy = f.y * tile - camY, r = tile * LIT_RADIUS * 0.8;
      const grad = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, "rgba(255,170,70,0.28)"); grad.addColorStop(0.5, "rgba(255,150,60,0.10)"); grad.addColorStop(1, "rgba(255,150,60,0)");
      g.fillStyle = grad; g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
    }
    if (stoneView && stoneView.glow > 0) { // the music stone's glow when its tune was played
      const sx = stoneView.x * tile - camX, sy = stoneView.y * tile - camY, r = tile * 3.6 * (0.7 + 0.3 * stoneView.glow), a = 0.85 * stoneView.glow;
      const grad = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      grad.addColorStop(0, `rgba(190,235,255,${a.toFixed(3)})`); grad.addColorStop(0.5, `rgba(120,200,255,${(a * 0.4).toFixed(3)})`); grad.addColorStop(1, "rgba(120,200,255,0)");
      g.fillStyle = grad; g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
    }
    if (watch) drawLighthouse(g, watch, watch.x * tile - camX, watch.y * tile - camY, tile, t, reduce, plain, level);
    g.globalCompositeOperation = "source-over";
    if (fishing) drawLines(g, fishing, camX, camY, tile, t, reduce);
    drawShades(t, reduce, camX, camY, tile, shades, all, lt, me);
    if (!plain) drawFireflies(t, reduce, level, camX, camY, tile, W, H, all, fires);
    if (env && !plain) drawRain(t, reduce, level, W, H, env.rain, dpr);

    // Landmark names when one is close (words from our own list).
    g.font = `${fontPx}px Georgia, serif`; g.textAlign = "center";
    for (const l of world.landmarks) {
      const d = Math.hypot(l.x - me.x, l.y - me.y);
      if (d > 7) continue;
      const lx = l.x * tile - camX, ly = (l.y - (l.kind === "jetty" ? 0.2 : 1.3)) * tile - camY;
      g.globalAlpha = Math.min(1, (7 - d) / 2);
      g.lineWidth = 3 * dpr; g.strokeStyle = "rgba(5,8,18,0.85)"; g.fillStyle = "#f2d9a0";
      const f = l.kind === "beacon" ? fires.find(q => q.x === l.x && q.y === l.y) : null;
      const label = LANDMARK_NAMES[l.kind] + (f ? (f.lit ? ": lit" : `: fuel ${f.fuel} of ${BEACON_NEED}`) : (l.kind === "lighthouse" && watch && watch.f >= 1 ? ": lit" : "")); // words and numbers from our own code
      g.strokeText(label, lx, ly); g.fillText(label, lx, ly);
      g.globalAlpha = 1;
    }

    if (stoneView && Math.hypot(stoneView.x - me.x, stoneView.y - me.y) < 7) { // the stone's name when close
      const d = Math.hypot(stoneView.x - me.x, stoneView.y - me.y);
      g.globalAlpha = Math.min(1, (7 - d) / 2); g.lineWidth = 3 * dpr; g.strokeStyle = "rgba(5,8,18,0.85)"; g.fillStyle = "#f2d9a0";
      const label = stoneView.glow > 0 ? "Music stone: glowing" : "Music stone", lx = stoneView.x * tile - camX, ly = (stoneView.y - 1.3) * tile - camY;
      g.strokeText(label, lx, ly); g.fillText(label, lx, ly); g.globalAlpha = 1;
    }

    // The prompt over the node in reach (words from our own list).
    if (reach) {
      const lx = reach.x * tile - camX, ly = (reach.y + 1.05) * tile - camY, txt = `${KIND_NAMES[reach.kind]}: gather (E)`;
      g.lineWidth = 3 * dpr; g.strokeStyle = "rgba(5,8,18,0.85)"; g.fillStyle = "#ffe9a8";
      g.strokeText(txt, lx, ly); g.fillText(txt, lx, ly);
    }

    // Names above the dark layer so they stay readable.
    nameDraw = [];
    for (const p of all) {
      const sx = p.x * tile - camX, sy = p.y * tile - camY - tile * 0.62;
      const na = p === me || !env ? 1 : nameAlpha(env.mist, Math.hypot(p.x - me.x, p.y - me.y));
      if (p !== me) nameDraw.push({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), alpha: +na.toFixed(3) });
      if (na < 0.02) continue; // lost in the mist (still on the minimap)
      g.globalAlpha = na;
      g.lineWidth = 3 * dpr; g.strokeStyle = "rgba(5,8,18,0.85)"; g.fillStyle = p === me ? "#fff3d6" : "#e6e9f2";
      g.strokeText(p.name, sx, sy); g.fillText(p.name, sx, sy);
      if (p.rank > 0) { // the lamplighter title, a smaller gold line over the name (looked up in our own list)
        const title = titleFor(p.rank);
        g.font = `${Math.round(fontPx * 0.82)}px Georgia, serif`;
        g.lineWidth = 3 * dpr; g.strokeStyle = "rgba(5,8,18,0.85)"; g.fillStyle = "#ffd36b";
        g.strokeText(title, sx, sy - fontPx * 1.05); g.fillText(title, sx, sy - fontPx * 1.05);
        g.font = `${fontPx}px Georgia, serif`;
      }
      g.globalAlpha = 1;
    }

    // Speech bubbles (preset phrases, words from our own list), over the names.
    for (const p of all) {
      if (!p.say || t >= p.say.until) continue;
      drawBubble(g, PHRASES[p.say.id], p.say, p.x * tile - camX, p.y * tile - camY - tile * 0.62 - fontPx * 1.5, fontPx, dpr, t, W);
    }

    if (!plain) drawSky(t, reduce, lt, dpr, env);

    // Arrows at the screen edge toward players who are off screen.
    lastArrows = edgeArrows(me, peers.values(), tile, W, H, 22 * dpr);
    for (const a of lastArrows) drawArrow(g, a, fontPx, dpr);

    if (stick.on) {
      g.strokeStyle = "rgba(255,243,214,0.5)"; g.lineWidth = 2 * dpr;
      g.beginPath(); g.arc(stick.ox * dpr, stick.oy * dpr, 48 * dpr, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "rgba(255,243,214,0.35)";
      g.beginPath(); g.arc(stick.x * dpr, stick.y * dpr, 16 * dpr, 0, Math.PI * 2); g.fill();
    }
  }

  return { draw, resize, burst, setStone: (v) => { stoneView = v; }, stoneSeen: () => !!stoneView, arrows: () => lastArrows.map(a => ({ id: a.id, dist: a.dist, ang: a.ang })), lights: () => lastLights.map(l => ({ ...l })), stats, setShadows: (on) => { shadowsOn = !!on && !plain; }, setTracks: (on) => { tracksOn = !!on && !plain; }, stressTracks: (n) => { stressN = Math.max(0, Math.min(600, n | 0)); }, setLevel: (l) => gov.set(Math.max(0, Math.min(2, l | 0))) };
}

// The lit lighthouse: a warm pool on the ground, a bright lamp at the top of the tower and two long beams that turn
// slowly (still, one pointing out to sea, with reduced motion). Drawn in the additive pass; cost is a few fills.
// A fish: a dark teal body with a tail, a pale ring on the water round it (a shoal fish is silver and has a brighter ring).
// The music stone: a standing grey stone with eight small marks; each note just played lifts a ring of its own height.
const STONE_HUES = [200, 215, 230, 250, 275, 300, 330, 20];
function drawStone(g, v, sx, sy, tile, t, reduce) {
  const w = tile * 0.62, h = tile * 0.95;
  g.fillStyle = "rgba(0,0,0,0.28)"; g.beginPath(); g.ellipse(sx, sy + h * 0.02, w * 0.75, w * 0.28, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#6f7480"; g.beginPath(); g.moveTo(sx - w / 2, sy); g.lineTo(sx - w * 0.38, sy - h * 0.8); g.quadraticCurveTo(sx, sy - h * 1.08, sx + w * 0.38, sy - h * 0.8); g.lineTo(sx + w / 2, sy); g.closePath(); g.fill();
  g.fillStyle = "#8d93a0"; g.fillRect(sx - w * 0.22, sy - h * 0.72, w * 0.16, h * 0.62);
  for (let i = 0; i < 8; i++) { // eight marks, one per note, bright when its note was just played
    const lit = v.recent.some(q => q.n === i && q.age < 0.9);
    g.fillStyle = lit || v.glow > 0 ? `hsl(${STONE_HUES[i]},90%,${lit ? 78 : 66}%)` : "rgba(30,34,44,0.75)";
    g.fillRect(sx - w * 0.3 + (i % 4) * w * 0.2, sy - h * (0.62 - Math.floor(i / 4) * 0.2), Math.max(2, w * 0.1), Math.max(2, w * 0.1));
  }
  for (const q of v.recent) {
    if (q.age > 1.5) continue;
    const k = reduce ? 0.5 : q.age / 1.5, r = tile * (0.5 + 1.1 * k);
    g.strokeStyle = `hsla(${STONE_HUES[q.n]},90%,75%,${(0.8 * (1 - k)).toFixed(3)})`; g.lineWidth = Math.max(1.5, tile * 0.06);
    g.beginPath(); g.arc(sx, sy - h * 0.4, r, 0, Math.PI * 2); g.stroke();
  }
}

function drawFish(g, f, sx, sy, tile, t, reduce) {
  const u = tile / 8, a = f.alpha;
  const ang = reduce ? 0 : Math.atan2(Math.cos(t / 900 + f.id), -Math.sin(t / 900 + f.id)) + Math.PI / 2;
  g.save(); g.globalAlpha = a;
  g.strokeStyle = f.shoal ? "rgba(220,240,255,0.55)" : "rgba(170,215,230,0.35)"; g.lineWidth = Math.max(1, u * 0.35);
  g.beginPath(); g.ellipse(sx, sy, u * (reduce ? 3.2 : 3 + Math.sin(t / 500 + f.id) * 0.5), u * 1.8, 0, 0, Math.PI * 2); g.stroke();
  g.translate(sx, sy); g.rotate(ang);
  g.fillStyle = f.shoal ? "#c9dde8" : "#1d4a57";
  g.beginPath(); g.ellipse(0, 0, u * 2.1, u * 0.95, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(-u * 1.8, 0); g.lineTo(-u * 3.1, -u * 1.1); g.lineTo(-u * 3.1, u * 1.1); g.closePath(); g.fill();
  g.fillStyle = f.shoal ? "#ffffff" : "#8fc4cf"; g.fillRect(u * 1.1, -u * 0.5, u * 0.5, u * 0.5);
  g.restore();
}
// Fishing lines and floats, drawn over the night so every float is found: a thin line from the angler to a red and white float;
// a bite adds two bright rings (static under reduced motion); a shoal is a soft silver glimmer round the middle of two floats.
function drawLines(g, fishing, camX, camY, tile, t, reduce) {
  const u = tile / 8;
  if (fishing.shoal) {
    const sx = fishing.shoal.x * tile - camX, sy = fishing.shoal.y * tile - camY;
    g.save(); g.globalCompositeOperation = "lighter";
    const grad = g.createRadialGradient(sx, sy, 0, sx, sy, tile * 1.3);
    grad.addColorStop(0, "rgba(190,225,245,0.30)"); grad.addColorStop(1, "rgba(190,225,245,0)");
    g.fillStyle = grad; g.beginPath(); g.arc(sx, sy, tile * 1.3, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  for (const l of fishing.lines) {
    const px = l.px * tile - camX, py = (l.py - 0.15) * tile - camY, fx = l.fx * tile - camX, fy = l.fy * tile - camY;
    g.strokeStyle = l.mine ? "rgba(240,240,225,0.85)" : "rgba(240,240,225,0.55)"; g.lineWidth = Math.max(1, u * 0.3);
    g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo((px + fx) / 2, (py + fy) / 2 + u * 1.2, fx, fy); g.stroke();
    const bob = reduce ? 0 : Math.sin(t / 380 + l.fx) * u * (l.bite ? 0.9 : 0.25);
    g.strokeStyle = "rgba(210,235,245,0.6)"; g.lineWidth = Math.max(1, u * 0.3);
    g.beginPath(); g.ellipse(fx, fy, u * (l.bite ? 3.4 : 2.2), u * (l.bite ? 1.9 : 1.2), 0, 0, Math.PI * 2); g.stroke();
    if (l.bite) { g.beginPath(); g.ellipse(fx, fy, u * 5, u * 2.8, 0, 0, Math.PI * 2); g.strokeStyle = "rgba(255,233,168,0.9)"; g.stroke(); }
    g.fillStyle = "#f2f2ea"; g.beginPath(); g.arc(fx, fy + bob, u * 1.0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e0453a"; g.beginPath(); g.arc(fx, fy + bob - u * 0.7, u * 0.8, Math.PI, 0); g.fill();
  }
}

function drawLighthouse(g, w, sx, sy, tile, t, reduce, plain, level = 2) {
  const R = tile * w.r * w.f, top = sy - tile * 1.9, a0 = reduce ? 0.6 : t / 4200;
  let grad = g.createRadialGradient(sx, sy, 0, sx, sy, R * 0.9);
  grad.addColorStop(0, "rgba(255,225,150,0.26)"); grad.addColorStop(0.5, "rgba(255,200,110,0.09)"); grad.addColorStop(1, "rgba(255,200,110,0)");
  g.fillStyle = grad; g.beginPath(); g.arc(sx, sy, R * 0.9, 0, Math.PI * 2); g.fill();
  if (!plain) for (let i = 0; i < 2; i++) {
    const a = a0 + i * Math.PI;
    grad = g.createRadialGradient(sx, top, 0, sx, top, R);
    grad.addColorStop(0, "rgba(255,244,200,0.40)"); grad.addColorStop(1, "rgba(255,244,200,0)");
    g.fillStyle = grad; g.beginPath(); g.moveTo(sx, top); g.arc(sx, top, R, a - 0.14, a + 0.14); g.closePath(); g.fill();
  }
  const pulse = plain ? (reduce ? 1 : 1 + Math.sin(t / 260) * 0.08) : (reduce ? 1 : 1 + Math.sin(t / 260) * 0.05 + (flameFlicker(t, 99, level, false).glow - 1) * 1.2), lr = tile * 0.55 * pulse * Math.min(1, w.f * 1.2);
  grad = g.createRadialGradient(sx, top, 0, sx, top, lr);
  grad.addColorStop(0, "rgba(255,250,225,0.95)"); grad.addColorStop(0.4, "rgba(255,226,150,0.5)"); grad.addColorStop(1, "rgba(255,200,110,0)");
  g.fillStyle = grad; g.beginPath(); g.arc(sx, top, lr, 0, Math.PI * 2); g.fill();
}

// A beacon basket's fire: nothing without fuel, embers while it fills, a tall flame once lit.
function drawFlame(g, f, sx, sy, tile, t, reduce, level = 2) {
  if (f.fuel <= 0 && !f.lit) return;
  const fl = level < 0 ? null : flameFlicker(t, f.n, level, reduce); // level -1: the plain look keeps the old simple sway
  const u = tile / 8, wob = fl ? fl.wob : reduce ? 0 : Math.sin(t / 110 + f.n * 2) * 0.35, h = (f.lit ? 4.6 : 1.2 + 2.2 * f.frac) * (fl ? fl.h : 1);
  g.fillStyle = f.lit ? "#ff9a2e" : "#c8501c";
  g.beginPath(); g.moveTo(sx - 2 * u, sy + u); g.quadraticCurveTo(sx - 2.2 * u + wob * u, sy - h * u * 0.6, sx + wob * u, sy - h * u); g.quadraticCurveTo(sx + 2.2 * u + wob * u, sy - h * u * 0.6, sx + 2 * u, sy + u); g.closePath(); g.fill();
  g.fillStyle = f.lit ? "#ffe08a" : "#ff9a2e";
  g.beginPath(); g.ellipse(sx + wob * u * 0.3, sy - u * 0.2, u, h * u * 0.4, 0, 0, Math.PI * 2); g.fill();
  if (fl && level >= 1 && f.lit) { // a second, thinner tongue that leans the other way
    g.fillStyle = "#ffcf5c"; g.beginPath(); g.moveTo(sx - 0.9 * u, sy + u * 0.4); g.quadraticCurveTo(sx - 1 * u - wob * u * 0.8, sy - h * u * 0.35, sx - wob * u * 0.9, sy - h * u * 0.78); g.quadraticCurveTo(sx + 1 * u - wob * u * 0.8, sy - h * u * 0.35, sx + 0.9 * u, sy + u * 0.4); g.closePath(); g.fill();
  }
}

// Gatherables: a pale log, a tuft of reeds, a cluster of berries. A ring marks the one within reach.
function drawNode(g, n, sx, sy, tile, inReach, t, reduce) {
  const u = tile / 8;
  if (inReach) {
    g.strokeStyle = "rgba(255,233,168,0.85)"; g.lineWidth = Math.max(1.5, u * 0.5);
    g.beginPath(); g.arc(sx, sy, tile * (0.42 + (reduce ? 0 : Math.sin(t / 260) * 0.03)), 0, Math.PI * 2); g.stroke();
  }
  if (n.kind === "driftwood") {
    g.save(); g.translate(sx, sy); g.rotate(((n.id * 37) % 7 - 3) * 0.2);
    g.fillStyle = "#b59a72"; g.fillRect(-3 * u, -u, 6 * u, 2 * u);
    g.fillStyle = "#d8c29a"; g.fillRect(-3 * u, -u, 6 * u, 0.7 * u);
    g.fillStyle = "#7d6544"; g.fillRect(-1 * u, -2 * u, 0.8 * u, 1.2 * u); g.fillRect(1.2 * u, u, 0.8 * u, 1.2 * u);
    g.restore();
  } else if (n.kind === "reeds") {
    g.strokeStyle = "#8fb06a"; g.lineWidth = Math.max(1.5, u * 0.55);
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(sx + i * u * 0.7, sy + 2.5 * u); g.lineTo(sx + i * u * 1.1 + (reduce ? 0 : Math.sin(t / 700 + n.id + i * 0.6) * u * 0.45), sy - (2.8 - Math.abs(i) * 0.4) * u); g.stroke(); }
    g.fillStyle = "#6b4a2a"; g.fillRect(sx - 0.5 * u, sy - 3.2 * u, u, 1.4 * u);
  } else {
    g.fillStyle = "#2f5a3a"; g.beginPath(); g.arc(sx, sy + 0.3 * u, 2.6 * u, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#b07ad8";
    for (const [dx, dy] of [[-1.2, -0.6], [1.1, -0.3], [0, 1.1]]) { g.beginPath(); g.arc(sx + dx * u, sy + dy * u, 0.95 * u, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#f0d8ff"; g.fillRect(sx - 1.5 * u, sy - 1.1 * u, 0.6 * u, 0.6 * u);
  }
}

function drawAvatar(g, p, sx, sy, tile, isMe, t, reduce) {
  const r0 = tile * 0.33;
  const e = p.emote && t < p.emote.until ? p.emote : null;
  const name = e ? EMOTES[e.id] : "";
  const k = e ? (t - e.start) / (e.until - e.start) : 0; // 0..1 through the gesture
  let r = r0, bob = walkBob(p.moving, t, tile, reduce), dip = 0;
  if (name === "bow") dip = Math.sin(Math.PI * Math.min(1, k * 1.4)) * tile * 0.16;
  if (name === "cheer" && !reduce) bob -= Math.abs(Math.sin(k * Math.PI * 3)) * tile * 0.22;
  if (name === "sit") { r = r0 * 0.82; dip = r0 * 0.25; }
  g.fillStyle = "rgba(0,0,0,0.35)";
  g.beginPath(); g.ellipse(sx, sy + r0 * 0.9, r0 * 0.9, r0 * 0.35, 0, 0, Math.PI * 2); g.fill();
  const pose = figurePose(p.moving, t, (p.seed || 0) % 6.283, name, k, reduce);
  const fx = Math.cos(p.d), fy = Math.sin(p.d); // facing; the feet step along it and across it
  g.fillStyle = "#0e1220"; // two feet, stepping in turn
  for (const f of [pose.footL, pose.footR]) {
    g.beginPath(); g.arc(sx + (fx * f.fwd - fy * f.side) * r, sy + r0 * 0.5 + (fy * f.fwd + fx * f.side) * r * 0.5 - pose.footLift * r, r * 0.26, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = "#1c2233";
  g.beginPath(); g.arc(sx, sy + bob + dip, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = Math.max(2, tile * 0.07); g.strokeStyle = p.colour;
  g.stroke();
  // The head: a pale dot that leans toward the facing direction (further in a bow, up in a cheer).
  g.fillStyle = "#e8d3b0";
  g.beginPath(); g.arc(sx + fx * r * pose.headLean, sy + bob + dip + fy * r * pose.headLean * 0.6 - r * (0.1 + pose.headUp), r * 0.34, 0, Math.PI * 2); g.fill();
  // The lantern, held toward the facing direction on a swinging arm (set down in front when sitting).
  const la = p.d + pose.lanternSwing, reach = r * pose.armReach;
  let lx = sx + Math.cos(la) * reach, ly = sy + bob + dip + Math.sin(la) * reach;
  if (name === "sit") { lx = sx + Math.cos(p.d) * r * 1.5; ly = sy + r0 * 0.75 + Math.sin(p.d) * r * 0.6; }
  else { g.strokeStyle = "#e8d3b0"; g.lineWidth = Math.max(1.5, tile * 0.05); g.beginPath(); g.moveTo(sx + fx * r * 0.5, sy + bob + dip + fy * r * 0.5); g.lineTo(lx, ly); g.stroke(); }
  const glow = p.snuffed ? null : lampOf(p.lamp).glow;
  if (p.snuffed) { // the flame is out: a dull ember and a curl of smoke
    g.fillStyle = "#5a3322"; g.beginPath(); g.arc(lx, ly, r * 0.38, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(190,190,205,0.55)"; g.lineWidth = Math.max(1, tile * 0.04);
    for (let i = 0; i < 2; i++) { const w = reduce ? 0 : Math.sin(t / 300 + i * 2) * r * 0.25; g.beginPath(); g.moveTo(lx, ly - r * 0.3); g.quadraticCurveTo(lx + w + r * 0.2 * (i ? 1 : -1), ly - r * 0.9, lx + w * 1.5, ly - r * (1.5 + i * 0.4)); g.stroke(); }
  }
  else if (glow) { g.fillStyle = `rgba(${glow[0]},${glow[1]},${glow[2]},0.35)`; g.beginPath(); g.arc(lx, ly, r * 0.75, 0, Math.PI * 2); g.fill(); }
  if (!p.snuffed) { g.fillStyle = glow ? `rgb(${glow[0]},${glow[1]},${glow[2]})` : p.colour; g.beginPath(); g.arc(lx, ly, r * 0.38, 0, Math.PI * 2); g.fill(); }
  if (p.flame && !p.snuffed) { // a carried flame: a small orange tongue above the lantern (still under reduced motion)
    const fl = reduce ? 1 : 1 + Math.sin(t / 90 + (p.seed || 0) % 5) * 0.15, fh = r * 1.15 * fl;
    g.fillStyle = "rgba(255,150,40,0.95)"; g.beginPath(); g.moveTo(lx - r * 0.2, ly - r * 0.3); g.quadraticCurveTo(lx - r * 0.25, ly - fh * 0.8, lx, ly - r * 0.3 - fh); g.quadraticCurveTo(lx + r * 0.25, ly - fh * 0.8, lx + r * 0.2, ly - r * 0.3); g.closePath(); g.fill();
    g.fillStyle = "rgba(255,235,160,0.95)"; g.beginPath(); g.arc(lx, ly - r * 0.45, r * 0.1, 0, Math.PI * 2); g.fill();
  }
  if (p.rank > 0 && !p.snuffed) { // lamplighter trim: one gold mark round the lantern per rank (the rank is a clamped number)
    const n = Math.min(MAX_RANK, p.rank | 0), lr = r * 0.62;
    g.fillStyle = "#ffd36b";
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.62; g.beginPath(); g.arc(lx + Math.cos(a) * lr, ly + Math.sin(a) * lr, Math.max(1.5, r * 0.11), 0, Math.PI * 2); g.fill(); }
  }
  if (name === "wave") { // a raised hand swinging side to side
    const hx = sx + r * 1.1 + (reduce ? 0 : Math.sin(t / 80) * r * 0.5), hy = sy - r * 1.35;
    g.strokeStyle = "#e8d3b0"; g.lineWidth = Math.max(2, tile * 0.06);
    g.beginPath(); g.moveTo(sx + r * 0.8, sy - r * 0.3); g.lineTo(hx, hy); g.stroke();
    g.fillStyle = "#e8d3b0"; g.beginPath(); g.arc(hx, hy, r * 0.22, 0, Math.PI * 2); g.fill();
  } else if (name === "point") { // an arm and arrow head along the facing direction
    const len = r * (2.5 + (reduce ? 0 : Math.sin(t / 120) * 0.2)), ax = sx + Math.cos(p.d) * len, ay = sy + bob + Math.sin(p.d) * len;
    g.strokeStyle = "#e8d3b0"; g.lineWidth = Math.max(2, tile * 0.06);
    g.beginPath(); g.moveTo(sx + Math.cos(p.d) * r, sy + bob + Math.sin(p.d) * r); g.lineTo(ax, ay); g.stroke();
    g.fillStyle = "#e8d3b0"; g.beginPath();
    g.moveTo(ax + Math.cos(p.d) * r * 0.5, ay + Math.sin(p.d) * r * 0.5);
    g.lineTo(ax + Math.cos(p.d + 2.4) * r * 0.45, ay + Math.sin(p.d + 2.4) * r * 0.45);
    g.lineTo(ax + Math.cos(p.d - 2.4) * r * 0.45, ay + Math.sin(p.d - 2.4) * r * 0.45); g.closePath(); g.fill();
  } else if (name === "cheer") { // little sparks
    g.fillStyle = "#ffe9a8";
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + (reduce ? 0 : k * 3), d = r * (1.6 + k * 1.2);
      g.fillRect(sx + Math.cos(a) * d - 1.5, sy + bob + Math.sin(a) * d - 1.5, 3, 3);
    }
  }
  if (isMe) {
    g.strokeStyle = "rgba(255,243,214,0.55)"; g.lineWidth = 1.5;
    g.beginPath(); g.arc(sx, sy + bob + dip, r * 1.45, 0, Math.PI * 2); g.stroke();
  }
}

// A bubble with a thin bar that runs down as the phrase is about to fade. Text comes from our own list only.
function drawBubble(g, text, say, cx, bottom, fontPx, dpr, t, W) {
  if (typeof text !== "string") return;
  g.font = `${fontPx}px Georgia, serif`; g.textAlign = "center";
  const padX = 8 * dpr, h = fontPx * 1.7;
  const w = g.measureText(text).width + padX * 2;
  const x = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, cx)), y = bottom - h;
  const left = Math.min(1, Math.max(0, (say.until - t) / (say.until - say.start)));
  const fade = Math.min(1, (say.until - t) / 400);
  g.globalAlpha = fade;
  g.fillStyle = "rgba(255,248,230,0.95)"; g.strokeStyle = "rgba(5,8,18,0.8)"; g.lineWidth = 1.5 * dpr;
  g.beginPath();
  if (g.roundRect) g.roundRect(x - w / 2, y, w, h, 6 * dpr); else g.rect(x - w / 2, y, w, h);
  g.fill(); g.stroke();
  g.fillStyle = "#16120c"; g.textBaseline = "middle";
  g.fillText(text, x, y + h * 0.5 - dpr);
  g.fillStyle = "rgba(168,86,28,0.85)"; g.fillRect(x - w / 2 + 3 * dpr, y + h - 4 * dpr, (w - 6 * dpr) * left, 2 * dpr);
  g.textBaseline = "alphabetic"; g.globalAlpha = 1;
}

function drawArrow(g, a, fontPx, dpr) {
  g.save();
  g.translate(a.x, a.y); g.rotate(a.ang);
  const s = 9 * dpr;
  g.fillStyle = a.colour; g.strokeStyle = "rgba(5,8,18,0.9)"; g.lineWidth = 2 * dpr;
  g.beginPath(); g.moveTo(s, 0); g.lineTo(-s * 0.8, -s * 0.8); g.lineTo(-s * 0.4, 0); g.lineTo(-s * 0.8, s * 0.8); g.closePath();
  g.stroke(); g.fill();
  g.restore();
  // distance, tucked inward from the arrow
  const lab = `${Math.round(a.dist)}`;
  g.font = `${Math.round(fontPx * 0.9)}px Georgia, serif`; g.textAlign = "center"; g.textBaseline = "middle";
  const lx = a.x - Math.cos(a.ang) * 20 * dpr, ly = a.y - Math.sin(a.ang) * 20 * dpr;
  g.lineWidth = 3 * dpr; g.strokeStyle = "rgba(5,8,18,0.85)"; g.fillStyle = "#e6e9f2";
  g.strokeText(lab, lx, ly); g.fillText(lab, lx, ly);
  g.textBaseline = "alphabetic";
}
