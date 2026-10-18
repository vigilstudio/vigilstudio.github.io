/* Euler trails and circuits on multigraphs (parallel edges and loops allowed).
   A graph is {n, edges:[[a,b],...]} with nodes 0..n-1. Shared by the page and by test.js.
   The `mut` arguments exist only so that each check can be broken on purpose and seen to fail. */
(function (root) {
  'use strict';

  function degrees(n, edges) {
    const d = new Array(n).fill(0);
    for (const [a, b] of edges) { d[a]++; d[b]++; } // a loop adds 2 to its node
    return d;
  }

  // Number of connected pieces that contain at least one edge (isolated nodes do not count).
  function pieces(n, edges) {
    const p = Array.from({ length: n }, (_, i) => i);
    const find = x => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
    for (const [a, b] of edges) p[find(a)] = find(b);
    const roots = new Set();
    for (const [a] of edges) roots.add(find(a));
    return roots.size;
  }

  // The closed form: the degree-parity rule plus connectivity.
  function rule(n, edges, mut) {
    mut = mut || {};
    const E = edges.length;
    const deg = degrees(n, edges);
    const odd = [];
    deg.forEach((d, i) => { if (d % 2) odd.push(i); });
    const k = pieces(n, edges);
    const out = { E, deg, odd, pieces: k, kind: 'none', reason: null };
    if (E === 0) { out.kind = 'empty'; return out; }
    if (!mut.noConnectivity && k > 1) { out.reason = 'pieces'; return out; }
    const okOdd = odd.length === 0 || odd.length === 2 || (mut.fourOdd && odd.length === 4);
    if (!okOdd) { out.reason = 'odd'; return out; }
    out.kind = odd.length === 0 ? 'circuit' : 'trail';
    return out;
  }

  // Hierholzer's method. Call it only when rule() says a trail or circuit exists.
  function construct(n, edges, mut) {
    mut = mut || {};
    const E = edges.length;
    if (!E) return { nodes: [], edges: [] };
    const deg = degrees(n, edges);
    let start = deg.findIndex(d => d > 0);
    if (!mut.anyStart) { const o = deg.findIndex(d => d % 2); if (o >= 0) start = o; }
    const adj = Array.from({ length: n }, () => []);
    edges.forEach(([a, b], id) => { adj[a].push([id, b]); if (a !== b) adj[b].push([id, a]); });
    const used = new Array(E).fill(false), ptr = new Array(n).fill(0);
    const stack = [[start, -1]], nodes = [], es = [];
    while (stack.length) {
      const [v, via] = stack[stack.length - 1];
      while (ptr[v] < adj[v].length && used[adj[v][ptr[v]][0]]) ptr[v]++;
      if (ptr[v] === adj[v].length) {
        stack.pop(); nodes.push(v); if (via >= 0) es.push(via);
      } else {
        const [id, w] = adj[v][ptr[v]++]; used[id] = true; stack.push([w, id]);
      }
    }
    nodes.reverse(); es.reverse();
    if (mut.dropLast) { es.pop(); nodes.pop(); }
    if (mut.repeatEdge && es.length > 1) es[es.length - 1] = es[0];
    return { nodes, edges: es };
  }

  // Independent test that a node/edge sequence is an Euler trail of the graph.
  function validate(n, edges, t, mut) {
    mut = mut || {};
    const E = edges.length;
    if (t.nodes.length !== t.edges.length + 1 && !(E === 0 && t.nodes.length === 0)) return { ok: false, why: 'node and edge counts do not fit' };
    if (!mut.noLength && t.edges.length !== E) return { ok: false, why: 'wrong number of edges' };
    if (!mut.noUnique) {
      const seen = new Set();
      for (const id of t.edges) { if (seen.has(id)) return { ok: false, why: 'edge used twice' }; seen.add(id); }
    }
    if (!mut.noChain) {
      for (let i = 0; i < t.edges.length; i++) {
        const e = edges[t.edges[i]];
        if (!e) return { ok: false, why: 'unknown edge' };
        const x = t.nodes[i], y = t.nodes[i + 1];
        if (!((e[0] === x && e[1] === y) || (e[0] === y && e[1] === x))) return { ok: false, why: 'step ' + (i + 1) + ' does not join its nodes' };
      }
    }
    return { ok: true };
  }

  // Does an edge order (indices into edges) form a trail? Returns 0 no, 1 open trail, 2 closed trail.
  function chain(edges, order, mut) {
    mut = mut || {};
    let best = 0;
    const e0 = edges[order[0]];
    for (let s = 0; s < 2; s++) {
      const start = s ? e0[1] : e0[0];
      let cur = s ? e0[0] : e0[1], ok = true;
      const last = mut.skipLast ? order.length - 1 : order.length;
      for (let i = 1; i < last; i++) {
        const [c, d] = edges[order[i]];
        if (c === cur) cur = d; else if (d === cur) cur = c; else { ok = false; break; }
      }
      if (ok) best = Math.max(best, (cur === start && !mut.noClosed) ? 2 : 1);
    }
    return best;
  }

  // Literal brute force: list each of the E! edge orders and test it. Use for E <= 8.
  function bruteLiteral(edges, mut) {
    const E = edges.length;
    if (E === 0) return { tried: 1, trails: 1, trail: true, circuit: true };
    if (E > 8) throw new Error('too many edges for the literal search');
    const a = Array.from({ length: E }, (_, i) => i), c = new Array(E).fill(0);
    let tried = 0, trails = 0, trail = false, circuit = false;
    const test = () => {
      tried++;
      const r = chain(edges, a, mut);
      if (r) { trails++; trail = true; if (r === 2) circuit = true; }
    };
    test();
    let i = 0;
    while (i < E) { // Heap's algorithm
      if (c[i] < i) {
        const j = i % 2 === 0 ? 0 : c[i];
        [a[j], a[i]] = [a[i], a[j]];
        test(); c[i]++; i = 0;
      } else { c[i] = 0; i++; }
    }
    return { tried, trails, trail, circuit };
  }

  // Backtracking search: from each start node, extend by each unused edge at the current node.
  function bruteSearch(n, edges, mut) {
    mut = mut || {};
    const E = edges.length;
    if (E === 0) return { trail: true, circuit: true };
    const adj = Array.from({ length: n }, () => []);
    edges.forEach(([a, b], id) => { adj[a].push([id, b]); if (a !== b) adj[b].push([id, a]); });
    let trail = false, circuit = false;
    const dfs = (v, start, mask, count) => {
      if (count === E) { trail = true; if (v === start && !mut.noClosed) circuit = true; return; }
      for (const [id, w] of adj[v]) if (!(mask & (1 << id))) dfs(w, start, mask | (1 << id), count + 1);
    };
    for (let s = 0; s < (mut.startZero ? 1 : n); s++) dfs(s, s, 0, 0);
    return { trail, circuit };
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomGraphs(count, seed) {
    const r = mulberry32(seed), out = [];
    for (let g = 0; g < count; g++) {
      const n = 2 + Math.floor(r() * 5), E = 1 + Math.floor(r() * 7), edges = [];
      for (let i = 0; i < E; i++) edges.push([Math.floor(r() * n), Math.floor(r() * n)]);
      out.push({ n, edges });
    }
    return out;
  }

  // Each labelled simple graph on n nodes (n <= 5 keeps the edge count at most 10).
  function simpleGraphs(n) {
    const pairs = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b]);
    const out = [];
    for (let m = 0; m < (1 << pairs.length); m++) out.push({ n, edges: pairs.filter((_, i) => m & (1 << i)) });
    return out;
  }

  function agrees(r, b) {
    const wantTrail = r.kind !== 'none', wantCircuit = r.kind === 'circuit' || r.kind === 'empty';
    return b.trail === wantTrail && b.circuit === wantCircuit;
  }

  const KONIGSBERG = {
    n: 4,
    names: ['A', 'B', 'C', 'D'],
    edges: [[0, 1], [0, 1], [0, 2], [0, 2], [0, 3], [1, 3], [2, 3]]
  };

  const SIMPLE5 = () => simpleGraphs(5);
  const RANDOM = () => randomGraphs(300, 1736);

  // Corrupted sequences for testing the validator. Each kind should be rejected by a different clause.
  function corruptions(graphs) {
    const out = { dropped: [], retraced: [], badNode: [] };
    const r = mulberry32(7);
    for (const g of graphs) {
      const E = g.edges.length;
      if (E < 2) continue;
      const rl = rule(g.n, g.edges);
      if (rl.kind === 'none') continue;
      const t = construct(g.n, g.edges);
      out.dropped.push({ g, t: { nodes: t.nodes.slice(0, -1), edges: t.edges.slice(0, -1) } });
      // a walk of E steps that reuses an edge: valid chain, right length, but not each edge once
      const adj = Array.from({ length: g.n }, () => []);
      g.edges.forEach(([a, b], id) => { adj[a].push([id, b]); if (a !== b) adj[b].push([id, a]); });
      let v = t.nodes[0];
      const nodes = [v], es = [];
      for (let i = 0; i < E; i++) { const [id, w] = adj[v][Math.floor(r() * adj[v].length)]; es.push(id); nodes.push(w); v = w; }
      if (new Set(es).size < E) out.retraced.push({ g, t: { nodes, edges: es } });
      // one node swapped for a node that is not an end of the neighbouring edges
      const k = 1 + Math.floor(r() * (E - 1));
      const ends = new Set([...g.edges[t.edges[k - 1]], ...g.edges[t.edges[k]]]);
      const x = Array.from({ length: g.n }, (_, i) => i).find(i => !ends.has(i));
      if (x !== undefined) { const nn = t.nodes.slice(); nn[k] = x; out.badNode.push({ g, t: { nodes: nn, edges: t.edges.slice() } }); }
    }
    return out;
  }

  // The self-checks. Each returns {name, tested, bad, what}. `mut` breaks one part at a time.
  const CHECKS = {
    ruleVsLiteral: {
      name: 'Parity rule against the literal search (each edge order listed)',
      run(mut) {
        const gs = RANDOM(); let bad = 0, orders = 0;
        for (const g of gs) {
          const b = bruteLiteral(g.edges, mut.literal); orders += b.tried;
          if (!agrees(rule(g.n, g.edges, mut.rule), b)) bad++;
        }
        return { tested: gs.length, bad, extra: orders };
      }
    },
    ruleVsSearch: {
      name: 'Parity rule against backtracking search, each labelled simple graph on 5 nodes',
      run(mut) {
        const gs = SIMPLE5(); let bad = 0;
        for (const g of gs) if (!agrees(rule(g.n, g.edges, mut.rule), bruteSearch(g.n, g.edges, mut.search))) bad++;
        return { tested: gs.length, bad };
      }
    },
    searchVsLiteral: {
      name: 'Backtracking search against the literal search (random multigraphs with loops and parallel edges)',
      run(mut) {
        const gs = RANDOM(); let bad = 0;
        for (const g of gs) {
          const a = bruteSearch(g.n, g.edges, mut.search), b = bruteLiteral(g.edges, mut.literal);
          if (a.trail !== b.trail || a.circuit !== b.circuit) bad++;
        }
        return { tested: gs.length, bad };
      }
    },
    constructed: {
      name: 'Trail built by Hierholzer’s method passes the independent validator',
      run(mut) {
        let tested = 0, bad = 0;
        for (const g of RANDOM().concat(SIMPLE5())) {
          if (rule(g.n, g.edges).kind === 'none') continue;
          tested++;
          if (!validate(g.n, g.edges, construct(g.n, g.edges, mut.construct), mut.validate).ok) bad++;
        }
        return { tested, bad };
      }
    },
    validatorRejects: {
      name: 'Validator rejects corrupted trails (a dropped edge, a retraced edge, a wrong node)',
      run(mut) {
        const c = corruptions(RANDOM()); let tested = 0, bad = 0;
        for (const k of Object.keys(c)) for (const x of c[k]) { tested++; if (validate(x.g.n, x.g.edges, x.t, mut.validate).ok) bad++; }
        return { tested, bad, parts: Object.fromEntries(Object.keys(c).map(k => [k, c[k].length])) };
      }
    }
  };

  // Each deliberate break and the checks that ought to notice it.
  const MUTANTS = [
    { name: 'Rule forgets that the edges must be connected', mut: { rule: { noConnectivity: true } }, expect: ['ruleVsLiteral', 'ruleVsSearch'] },
    { name: 'Rule lets four odd nodes through', mut: { rule: { fourOdd: true } }, expect: ['ruleVsLiteral', 'ruleVsSearch'] },
    { name: 'Literal search never tests the last edge', mut: { literal: { skipLast: true } }, expect: ['ruleVsLiteral', 'searchVsLiteral'] },
    { name: 'Literal search never reports a closed trail', mut: { literal: { noClosed: true } }, expect: ['ruleVsLiteral', 'searchVsLiteral'] },
    { name: 'Backtracking search only starts at node 0', mut: { search: { startZero: true } }, expect: ['ruleVsSearch', 'searchVsLiteral'] },
    { name: 'Backtracking search never reports a closed trail', mut: { search: { noClosed: true } }, expect: ['ruleVsSearch', 'searchVsLiteral'] },
    { name: 'Construction drops the last edge', mut: { construct: { dropLast: true } }, expect: ['constructed'] },
    { name: 'Construction repeats an edge', mut: { construct: { repeatEdge: true } }, expect: ['constructed'] },
    { name: 'Construction starts at any node, even with two odd ones', mut: { construct: { anyStart: true } }, expect: ['constructed'] },
    { name: 'Validator stops counting edges', mut: { validate: { noLength: true } }, expect: ['validatorRejects'] },
    { name: 'Validator allows an edge twice', mut: { validate: { noUnique: true } }, expect: ['validatorRejects'] },
    { name: 'Validator stops checking that steps join their nodes', mut: { validate: { noChain: true } }, expect: ['validatorRejects'] }
  ];

  function runChecks(only) {
    return Object.keys(CHECKS).filter(k => !only || only.includes(k)).map(k => Object.assign({ id: k, name: CHECKS[k].name }, CHECKS[k].run({})));
  }

  function runMutants() {
    return MUTANTS.map(m => {
      const results = m.expect.map(k => Object.assign({ id: k }, CHECKS[k].run(m.mut)));
      return { name: m.name, expect: m.expect, results, caught: results.some(r => r.bad > 0) };
    });
  }

  // Edge orders of the Koenigsberg graph, listed literally.
  function konigsbergSearch() { return bruteLiteral(KONIGSBERG.edges); }

  // Which single removals of an edge leave a graph with a trail or circuit (by the rule).
  function removals(n, edges) {
    const out = [];
    edges.forEach((e, i) => {
      const rest = edges.filter((_, j) => j !== i);
      const r = rule(n, rest);
      if (r.kind !== 'none') out.push({ index: i, kind: r.kind });
    });
    return out;
  }

  root.Euler = { degrees, pieces, rule, construct, validate, chain, bruteLiteral, bruteSearch, randomGraphs, simpleGraphs, agrees,
    KONIGSBERG, RANDOM, CHECKS, MUTANTS, runChecks, runMutants, konigsbergSearch, removals, corruptions };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Euler;
})(typeof window !== 'undefined' ? window : globalThis);
