// Paper-strip folding: stack simulation, closed-form rule, dragon-curve geometry. MIT. Works in browsers and Node.
(function (root) {
  "use strict";
  // Simulate n folds of a strip of N = 2^n unit cells, folding the right half over the left (toward the viewer) each time.
  // Cell ids 0..N-1 run along the strip. The stack is K layers, each L cells wide (layer j at cells[j*L ... j*L+L-1]).
  // Returns Uint8Array c of length N: c[k] for k=1..N-1 is 1 for a valley and 0 for a mountain, seen from the
  // strip's original top face, at the crease between cell k-1 and cell k.
  function simulate(n) {
    var N = 1 << n, L = N, K = 1;
    var cells = new Int32Array(N); for (var i = 0; i < N; i++) cells[i] = i;
    var faceUp = new Uint8Array(1); faceUp[0] = 1;
    var crease = new Uint8Array(N);
    for (var f = 0; f < n; f++) {
      var L2 = L >> 1, K2 = K * 2;
      var nc = new Int32Array(N), nf = new Uint8Array(K2);
      for (var j = 0; j < K; j++) {
        var a = cells[j * L + L2 - 1], b = cells[j * L + L2];      // neighbours across the fold line: they are joined paper
        crease[a > b ? a : b] = faceUp[j] ? 1 : 0;                 // folded toward the viewer: valley if this layer shows its top face
        for (var q = 0; q < L2; q++) nc[j * L2 + q] = cells[j * L + q];          // left half stays where it is
        nf[j] = faceUp[j];
        var u = K + (K - 1 - j);                                    // right half turns over: layer order reverses, goes on top
        for (q = 0; q < L2; q++) nc[u * L2 + q] = cells[j * L + L - 1 - q];
        nf[u] = faceUp[j] ? 0 : 1;
      }
      cells = nc; faceUp = nf; L = L2; K = K2;
    }
    return { crease: crease, N: N, layers: K, order: cells }; // order[layer] = the cell in that layer after all folds (L = 1)
  }
  // Closed form: write k = 2^j * m with m odd. Valley (1) if m mod 4 = 1, i.e. the bit above k's lowest set bit is 0.
  function rule(k) { var m = k; while ((m & 1) === 0) m >>>= 1; return (m & 3) === 1 ? 1 : 0; }
  // Dragon curve from the creases: walk east, then before each next unit step turn left at a valley, right at a mountain.
  var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  function dragon(crease, N) {
    var xs = new Int32Array(N + 1), ys = new Int32Array(N + 1), d = 0, x = 1, y = 0;
    xs[0] = 0; ys[0] = 0; xs[1] = 1; ys[1] = 0;
    for (var k = 1; k < N; k++) {
      d = (d + (crease[k] ? 1 : 3)) & 3; x += DX[d]; y += DY[d]; xs[k + 1] = x; ys[k + 1] = y;
    }
    return { xs: xs, ys: ys, N: N };
  }
  // Count, on the integer lattice: edges used twice, vertices visited 0/1/2/3+ times, straight-through visits
  // (a crossing of two passes needs a straight pass), and the squared endpoint distance.
  function analyse(path) {
    var xs = path.xs, ys = path.ys, N = path.N, i, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (i = 0; i <= N; i++) { if (xs[i] < minx) minx = xs[i]; if (xs[i] > maxx) maxx = xs[i]; if (ys[i] < miny) miny = ys[i]; if (ys[i] > maxy) maxy = ys[i]; }
    var W = maxx - minx + 1, H = maxy - miny + 1, vis = new Uint8Array(W * H), ee = new Uint8Array(W * H), ne = new Uint8Array(W * H);
    var edgeReuse = 0, straight = 0, maxVisits = 0, revisited = 0;
    for (i = 0; i <= N; i++) {
      var id = (xs[i] - minx) * H + (ys[i] - miny);
      if (++vis[id] === 2) revisited++;
      if (vis[id] > maxVisits) maxVisits = vis[id];
      if (i > 0 && i < N) {
        var dx1 = xs[i] - xs[i - 1], dy1 = ys[i] - ys[i - 1], dx2 = xs[i + 1] - xs[i], dy2 = ys[i + 1] - ys[i];
        if (dx1 === dx2 && dy1 === dy2) straight++;
      }
      if (i < N) {
        var ax = xs[i] - minx, ay = ys[i] - miny, bx = xs[i + 1] - minx, by = ys[i + 1] - miny, e;
        if (ay === by) e = ee, id = (ax < bx ? ax : bx) * H + ay; else e = ne, id = ax * H + (ay < by ? ay : by);
        if (++e[id] > 1) edgeReuse++;
      }
    }
    var ex = xs[N] - xs[0], ey = ys[N] - ys[0];
    return { edges: N, edgeReuse: edgeReuse, straight: straight, maxVisits: maxVisits, revisited: revisited, dist2: ex * ex + ey * ey, W: W, H: H };
  }
  // Independent crossing test for small curves: any two unit edges that share no endpoint but meet (they cannot on a lattice) or
  // overlap along a line. Brute force over all edge pairs.
  function bruteCrossings(path) {
    var xs = path.xs, ys = path.ys, N = path.N, bad = 0, i, j;
    function ori(ax, ay, bx, by, cx, cy) { var v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); return v > 0 ? 1 : v < 0 ? -1 : 0; }
    for (i = 0; i < N; i++) for (j = i + 1; j < N; j++) {
      var shared = 0;
      if (xs[i] === xs[j] && ys[i] === ys[j]) shared++; if (xs[i] === xs[j + 1] && ys[i] === ys[j + 1]) shared++;
      if (xs[i + 1] === xs[j] && ys[i + 1] === ys[j]) shared++; if (xs[i + 1] === xs[j + 1] && ys[i + 1] === ys[j + 1]) shared++;
      if (shared === 2) { bad++; continue; }          // same edge twice
      if (shared === 1) continue;                      // touching at a vertex is allowed
      var o1 = ori(xs[i], ys[i], xs[i + 1], ys[i + 1], xs[j], ys[j]), o2 = ori(xs[i], ys[i], xs[i + 1], ys[i + 1], xs[j + 1], ys[j + 1]);
      var o3 = ori(xs[j], ys[j], xs[j + 1], ys[j + 1], xs[i], ys[i]), o4 = ori(xs[j], ys[j], xs[j + 1], ys[j + 1], xs[i + 1], ys[i + 1]);
      if (o1 !== o2 && o3 !== o4) bad++;               // proper crossing (collinear overlaps are caught as shared endpoints on a lattice of unit edges)
    }
    return bad;
  }
  // Gallivan's single-direction limit (weaker source: recalled, then matched to a search summary of Science News).
  // Minimum strip length for n folds, same units as thickness t.
  function gallivanLength(n, t) { var p = Math.pow(2, n); return Math.PI * t / 6 * (p + 4) * (p - 1); }
  function maxFolds(L, t) { var n = 0; while (gallivanLength(n + 1, t) <= L && n < 60) n++; return n; }
  var api = { simulate: simulate, rule: rule, dragon: dragon, analyse: analyse, bruteCrossings: bruteCrossings, gallivanLength: gallivanLength, maxFolds: maxFolds };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Fold = api;
})(typeof self !== "undefined" ? self : this);
