// node test.js : runs the checks on the real code, then breaks the code once per check and expects that check to fail.
"use strict";
global.window = {};
const D = require("./dither.js"), C = require("./checks.js");
require("./reference.js");
const ref = window.DITHER_REFERENCE;
let fails = 0;
const say = (ok, s) => { console.log((ok ? "ok   " : "FAIL ") + s); if (!ok) fails++; };

const base = C.run(D, ref);
const expectFlag = {};
for (const c of base) say(c.ok === !expectFlag[c.id], c.id + " on the real code: " + (c.ok ? "pass" : "fails") + " (" + c.detail + ")");

function broken(id, patch, restore) {
  patch();
  const r = C.run(D, ref).find(c => c.id === id);
  restore();
  say(!r.ok, "breaking the code makes '" + id + "' fail");
}
const origGrey = D.makeGrey;
broken("image", () => { D.makeGrey = () => { const g = origGrey(); g[5000] ^= 1; return g; }; }, () => { D.makeGrey = origGrey; });
broken("thr-pillow", () => { D.threshold = (g, w, h) => { const o = new Uint8Array(w * h); for (let i = 0; i < g.length; i++) o[i] = g[i] >= 129 ? 255 : 0; return o; }; }, (t => () => { D.threshold = t; })(D.threshold));
{
  const t = D.threshold; // threshold 129 already differs at the 28 pixels of grey 128; 160 is a coarser break
  D.threshold = (g, w, h) => { const o = new Uint8Array(w * h); for (let i = 0; i < g.length; i++) o[i] = g[i] >= 160 ? 255 : 0; return o; };
  const r = C.run(D, ref).find(c => c.id === "thr-pillow"); D.threshold = t;
  say(!r.ok, "threshold moved to 160 makes 'thr-pillow' fail");
}
{
  // fs-pillow must fail when the recipe is nudged: threshold >= 128 instead of > 128 is not enough on this image, so move the weights
  const w = D.FS_WEIGHTS.below;
  D.FS_WEIGHTS.below = 4; D.FS_WEIGHTS.belowRight = 2;
  const r = C.run(D, ref).find(c => c.id === "fs-pillow"); D.FS_WEIGHTS.below = w; D.FS_WEIGHTS.belowRight = 1;
  say(!r.ok, "moving a sixteenth from below to below-right makes 'fs-pillow' fail");
}
const w0 = D.FS_WEIGHTS.right;
broken("fs-sum", () => { D.FS_WEIGHTS.right = 8; }, () => { D.FS_WEIGHTS.right = w0; });
const b0 = D.BAYER4[1][1];
broken("bayer", () => { D.BAYER4[1][1] = 0; }, () => { D.BAYER4[1][1] = b0; });
const te = D.tileErrors;
broken("measures", () => { D.tileErrors = (a, b, w, h, t) => te(a, b, w, h, t).map(x => x + 1); }, () => { D.tileErrors = te; });
const be = D.blurError;
broken("measures", () => { D.blurError = (a, b, w, h, s) => be(a, b, w, h, s) * 0.99; }, () => { D.blurError = be; });
broken("patches", () => { D.tileErrors = (a, b, w, h, t) => te(a, b, w, h, t === 8 ? 4 : t).slice(0, 96); }, () => { D.tileErrors = te; });
const afterAll = C.run(D, ref);
say(afterAll.every((c, i) => c.ok === base[i].ok), "after all the breaking, the code is restored and gives the first results again");
console.log(fails ? fails + " problem(s)" : "all good");
process.exit(fails ? 1 : 0);
