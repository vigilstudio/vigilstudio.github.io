# Crossing Each Bridge Once

A short essay with a drawing tool. Draw a graph (nodes and edges, parallel edges and loops allowed); the page finds
an Euler trail or circuit with Hierholzer's method, or says from the odd-degree count (or from disconnected edges)
why none exists. Subject: Euler's Königsberg bridges.

Files: `index.html` (page), `euler.js` (rule, construction, validator, two brute-force searches, self-checks; runs in
browser and Node), `test.js` (`node test.js`), `LICENSE` (MIT).

## How it works
- `rule()`: the closed form. A trail exists when the edges form one connected piece and 0 (circuit) or 2 (open trail)
  nodes have odd degree.
- `construct()`: Hierholzer's method. `validate()` is a separate test that a node/edge sequence uses each edge once
  and each step joins its nodes.
- `bruteLiteral()` lists each of the E! edge orders (E up to 8) and tests whether it chains into a trail.
  `bruteSearch()` is a backtracking search from each start node.

## What was checked (`node test.js`; the same runs on the page, counts come from code)
- Rule against literal search: 300 random multigraphs (2-6 nodes, 1-7 edges, loops and parallel edges, fixed seed),
  270,205 edge orders listed, 0 disagreements.
- Rule against backtracking search: the 1,024 labelled simple graphs on 5 nodes, 0 disagreements.
- Backtracking search against literal search on the 300 random graphs: 0 disagreements.
- Constructed trail passes the validator: 919 graphs with a trail or circuit, 0 failures.
- Validator rejects 470 corrupted trails (184 dropped edge, 164 retraced edge, 122 wrong node).
- Königsberg graph: degrees 5, 3, 3, 3; 5,040 edge orders, 0 form a trail; each of the 7 single removals leaves a trail.
- Each check broken once (12 deliberate breaks: rule without connectivity, rule allowing 4 odd nodes, literal search
  skipping the last edge or never closed, backtracking search starting only at node 0 or never closed, construction
  dropping an edge, repeating one or starting anywhere, validator without the count, uniqueness or step test): 12 of 12 caught.
- `tools/page_check.mjs` at 375, 768 and 1100 px, light and dark: no problems. Drawing, dragging, loops, undo and
  keyboard selection were driven in headless Chromium.

## Weaker, unverified
- History (Königsberg's seven bridges and four land areas, Euler's 1735/1736/1741 dates, the Marinoni letter,
  Hierholzer 1873, wartime damage) is from memory and not checked against any source. The bridge layout in the
  example is the usual textbook map as I recall it.
- The checks cover small graphs. The parity argument is the standard one; it is not formally proved here.
- Held by construction, not counted: degrees sum to twice the edge count, so the number of odd nodes is even.
- An equivalent break (searching only one orientation of the first edge) cannot be noticed by any check, since reversing a
  trail gives a trail; it is not in the table.
- Not tried on a real phone or with a screen reader.
