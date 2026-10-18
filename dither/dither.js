// Dithering core: test image, three ways to make black and white, and the measures. No DOM here, so Node can run it.
(function (root) {
  "use strict";
  var W = 128, H = 96;
  var FONT = {
    G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
    R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."]
  };
  var BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  // Floyd-Steinberg weights in sixteenths: right 7, below-left 3, below 5, below-right 1. Written from memory, then matched
  // pixel for pixel to Pillow, which fixed the rest of the recipe (see floydSteinberg).
  var FS_WEIGHTS = { right: 7, belowLeft: 3, below: 5, belowRight: 1 };

  // Grey image, W*H bytes, built with integer arithmetic only.
  function makeGrey() {
    var g = new Uint8Array(W * H), x, y, i, k, r2 = 28 * 28;
    g.fill(220);
    for (y = 0; y < 24; y++) for (x = 0; x < W; x++) g[y * W + x] = Math.floor(x * 255 / (W - 1));
    var patches = [32, 96, 160, 224];
    for (y = 24; y < 56; y++) for (i = 0; i < 4; i++) for (x = 64 + 16 * i; x < 80 + 16 * i; x++) g[y * W + x] = patches[i];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var d2 = (x - 32) * (x - 32) + (y - 60) * (y - 60);
      if (d2 <= r2) g[y * W + x] = 255 - Math.floor(255 * d2 / r2);
    }
    var text = "GREY";
    for (k = 0; k < 4; k++) FONT[text[k]].forEach(function (row, gy) {
      for (var gx = 0; gx < 5; gx++) if (row[gx] === "#")
        for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) g[(64 + 2 * gy + dy) * W + 72 + 12 * k + 2 * gx + dx] = 40;
    });
    return g;
  }

  // Each method takes a grey array and sizes and returns an array of 0 (black) or 255 (white).
  function threshold(g, w, h) {
    var o = new Uint8Array(w * h);
    for (var i = 0; i < g.length; i++) o[i] = g[i] >= 128 ? 255 : 0;
    return o;
  }
  // White where grey*16 reaches the cell's threshold (2m+1)/32 of 255, so 16 cells give 17 tones.
  function bayer(g, w, h) {
    var o = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++)
      o[y * w + x] = g[y * w + x] * 32 >= (2 * BAYER4[y & 3][x & 3] + 1) * 255 ? 255 : 0;
    return o;
  }
  // Left to right on every row, integer arithmetic as in Pillow: each pixel collects the error pushed onto it (kept in
  // sixteenths), adds its whole-level part (truncated toward zero), is clipped to 0..255 and is white only if above 128.
  // Returns {out, lost16}: lost16 is the tone, in sixteenths of a grey level, that never reached another pixel: error that
  // fell off the edges, the fractions dropped by truncation, and the part cut by clipping.
  function floydSteinberg(g, w, h, weights) {
    var wt = weights || FS_WEIGHTS, o = new Uint8Array(w * h), pend = new Int32Array(w * h), lost16 = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = y * w + x, t = Math.trunc(pend[i] / 16), v = g[i] + t;
      lost16 += pend[i] - 16 * t;
      if (v > 255) { lost16 += 16 * (v - 255); v = 255; } else if (v < 0) { lost16 += 16 * v; v = 0; }
      var q = v > 128 ? 255 : 0, e = v - q;
      o[i] = q;
      if (x + 1 < w) pend[i + 1] += e * wt.right; else lost16 += e * wt.right;
      if (y + 1 < h) {
        if (x > 0) pend[i + w - 1] += e * wt.belowLeft; else lost16 += e * wt.belowLeft;
        pend[i + w] += e * wt.below;
        if (x + 1 < w) pend[i + w + 1] += e * wt.belowRight; else lost16 += e * wt.belowRight;
      } else lost16 += e * (wt.belowLeft + wt.below + wt.belowRight);
    }
    return { out: o, lost16: lost16 };
  }

  // Mean tone kept per tile: |mean(out) - mean(grey)| in grey levels, tile by tile.
  function tileErrors(g, o, w, h, t) {
    var errs = [];
    for (var ty = 0; ty + t <= h; ty += t) for (var tx = 0; tx + t <= w; tx += t) {
      var a = 0, b = 0;
      for (var y = ty; y < ty + t; y++) for (var x = tx; x < tx + t; x++) { a += g[y * w + x]; b += o[y * w + x]; }
      errs.push(Math.abs(a - b) / (t * t));
    }
    return errs;
  }
  function gaussKernel(sigma) {
    var r = Math.max(1, Math.ceil(3 * sigma)), k = [], s = 0, i;
    for (i = -r; i <= r; i++) { var v = Math.exp(-i * i / (2 * sigma * sigma)); k.push(v); s += v; }
    return k.map(function (v) { return v / s; });
  }
  // Separable Gaussian blur, edges repeated.
  function blur(a, w, h, sigma) {
    var k = gaussKernel(sigma), r = (k.length - 1) / 2, t = new Float64Array(a.length), o = new Float64Array(a.length), x, y, j;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var s = 0;
      for (j = -r; j <= r; j++) s += k[j + r] * a[y * w + Math.min(w - 1, Math.max(0, x + j))];
      t[y * w + x] = s;
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var s2 = 0;
      for (j = -r; j <= r; j++) s2 += k[j + r] * t[Math.min(h - 1, Math.max(0, y + j)) * w + x];
      o[y * w + x] = s2;
    }
    return o;
  }
  // Root-mean-square difference, in grey levels, between the blurred grey image and the blurred black and white one.
  function blurError(g, o, w, h, sigma) {
    var a = blur(g, w, h, sigma), b = blur(o, w, h, sigma), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
    return Math.sqrt(s / a.length);
  }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }

  function unpack(b64, w, h) {   // base64 bitmap, MSB first, 1 = white, to 0/255
    var bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("latin1");
    var o = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) o[i] = (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1 ? 255 : 0;
    return o;
  }
  function countDiff(a, b) { var n = 0; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; }

  root.Dither = { W: W, H: H, FS_WEIGHTS: FS_WEIGHTS, BAYER4: BAYER4, makeGrey: makeGrey, threshold: threshold, bayer: bayer,
    floydSteinberg: floydSteinberg, tileErrors: tileErrors, gaussKernel: gaussKernel, blur: blur, blurError: blurError, mean: mean,
    unpack: unpack, countDiff: countDiff };
  if (typeof module !== "undefined" && module.exports) module.exports = root.Dither;
})(typeof window !== "undefined" ? window : globalThis);
