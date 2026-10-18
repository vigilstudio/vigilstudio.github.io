// Self-checks for the dither page. Each one compares the page's code with something computed another way, so each can fail.
// Run by the page and by test.js (which breaks the code once per check to prove every check can fail).
(function (root) {
  "use strict";
  function run(D, ref) {
    var W = D.W, H = D.H, out = [], g = D.makeGrey(), i;
    function add(id, title, ok, detail, flag) { out.push({ id: id, title: title, ok: ok, detail: detail, flag: !!flag }); }

    // 1. same test image as the Python script built
    var sum = 0;
    for (i = 0; i < g.length; i++) sum = (sum + (i % 65521 + 1) * g[i]) % 4294967296;
    add("image", "Test image equals the one Python built", sum === ref.greyChecksum,
      "weighted checksum " + sum + (sum === ref.greyChecksum ? " = " : " vs ") + ref.greyChecksum + " (Python, separate code)");

    // 2. threshold against Pillow
    var th = D.threshold(g, W, H), pth = D.unpack(ref.threshold, W, H), dth = D.countDiff(th, pth);
    add("thr-pillow", "Plain threshold equals Pillow's, pixel by pixel", dth === 0,
      dth + " of " + W * H + " pixels differ from Pillow " + ref.pillow + " convert('1', dither=NONE)");

    // 3. FS against Pillow (flagged when they differ)
    var fs = D.floydSteinberg(g, W, H), pfs = D.unpack(ref.fs, W, H), dfs = D.countDiff(fs.out, pfs);
    add("fs-pillow", "Floyd-Steinberg equals Pillow's, pixel by pixel", dfs === 0,
      dfs + " of " + W * H + " pixels differ (" + (100 * dfs / (W * H)).toFixed(1) + "%) from Pillow " + ref.pillow + " convert('1')", dfs !== 0);

    // 4. Bayer on flat grey: white count of a 4 x 4 block must equal the number of cells whose threshold lies at or below the grey
    var bad = [], v, n, expect, flat = new Uint8Array(16);
    for (v = 0; v < 256; v++) {
      flat.fill(v);
      var o = D.bayer(flat, 4, 4); n = 0;
      for (i = 0; i < 16; i++) if (o[i]) n++;
      expect = 0;
      for (var m = 0; m < 16; m++) if (v >= (2 * m + 1) * 255 / 32) expect++;   // cell m turns white from grey (2m+1)*255/32
      if (n !== expect) bad.push(v);
    }
    add("bayer", "Bayer block of flat grey has the right number of white pixels", bad.length === 0,
      bad.length === 0 ? "all 256 grey levels give white counts between 0 and 16 as the threshold ladder says" : "wrong at grey " + bad.slice(0, 5).join(", "));

    // 5. FS tone accounting, in sixteenths of a grey level: input total minus output total must equal what was lost
    //    (error off the edges, truncated fractions, clipped excess). Breaks if the four weights do not add to 16.
    var tin = 0, tout = 0;
    for (i = 0; i < g.length; i++) { tin += g[i]; tout += fs.out[i]; }
    var gap = 16 * (tin - tout) - fs.lost16;
    add("fs-sum", "Floyd-Steinberg loses no tone except what it drops", gap === 0,
      "grey total " + tin + ", output total " + tout + ", difference " + (tin - tout) + " = tone dropped at edges, by truncation and by clipping, gap " + gap + "/16");

    // 6. hand-computed cases for the two measures
    var flat100 = new Uint8Array(64).fill(100), black = new Uint8Array(64), white = new Uint8Array(64).fill(255);
    var te = D.tileErrors(flat100, black, 8, 8, 8);
    var be = D.blurError(black, white, 8, 8, 1);
    add("measures", "Tile error and blur error give the hand-worked values", te.length === 1 && te[0] === 100 && Math.abs(be - 255) < 1e-9,
      "grey 100 against black: tile error " + te[0] + " (hand: 100); black against white after blur: " + be.toFixed(3) + " (hand: 255)");

    // 7. plain threshold on the four flat patches, tiles of 8: hand sum (32 + 96 + 95 + 31) / 4 = 63.5
    var te8 = D.tileErrors(g, th, W, H, 8), tw = W / 8, tot = 0, cnt = 0;
    for (var ty = 3; ty < 7; ty++) for (var tx = 8; tx < 16; tx++) { tot += te8[ty * tw + tx]; cnt++; }
    var avg = tot / cnt;
    add("patches", "Threshold's error on the four flat patches matches the hand sum", Math.abs(avg - 63.5) < 1e-9,
      "mean tile error " + avg + " over " + cnt + " tiles (hand: (32 + 96 + 95 + 31) / 4 = 63.5)");
    return out;
  }
  var api = { run: run };
  root.DitherChecks = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
