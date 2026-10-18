// Page script: runs both solvers on every candidate, draws the board, the proof, the rejected puzzles, the printable
// sheet and the self-checks. All counts on the page are computed here from the solver output.
(function () {
  "use strict";
  var P = NonoPuzzles, LS = NonoLineSolver, CT = NonoCounter, K = NonoChecks;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var clueText = function (cl) { return cl.length ? cl.join(" ") : "0"; };
  var plural = K.plural;
  var by = function (n) { return n + " by " + n; };
  var EXN = by(K.EXH_N), SMALL = by(K.SIZES[0]), BIG = by(K.SIZES[K.SIZES.length - 1]);
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  var analyses = K.candidates().map(function (c) { return K.analyse(c, P, LS, CT); });
  var byId = {};
  analyses.forEach(function (a) { byId[a.id] = a; });
  var kept = analyses.filter(function (a) { return a.verdict === "kept"; });
  var rejected = analyses.filter(function (a) { return a.verdict === "two"; });
  var tally = K.tally(analyses);
  var ex = null;                       // exhaustive 4x4 result, filled in later
  var solvedThisVisit = {};
  var cur = null, play = null, board = null, mode = "f", showingAlt = false;

  // ---------- board drawing ----------
  function units(cl) { var u = 0; cl.forEach(function (v) { u += String(v).length * 0.62 + 0.4; }); return cl.length ? u : 0.62 + 0.4; }
  function measure(avail, n, rows, cols, unit, fixedCell) {
    var maxU = Math.max.apply(null, rows.map(units));
    var maxLen = Math.max.apply(null, cols.map(function (c) { return Math.max(1, c.length); }));
    var cell = fixedCell || clamp(Math.floor(avail / (n + 3)), 12, 36), font, rw;
    for (var i = 0; i < 5; i++) {
      font = fixedCell ? cell * 0.5 : clamp(Math.round(cell * 0.56), 9, 16);
      rw = Math.ceil(maxU * font) + (unit === "mm" ? 3 : 8);
      if (!fixedCell) cell = clamp(Math.floor((avail - rw - 4) / n), 12, 36);
    }
    var ch = Math.ceil(maxLen * font * 1.2) + (unit === "mm" ? 2 : 6);
    return { cell: cell, font: font, rw: rw, ch: ch, unit: unit };
  }
  function applyVars(el, m, n) {
    var u = m.unit;
    el.style.setProperty("--n", n);
    el.style.setProperty("--cell", m.cell + u);
    el.style.setProperty("--font", m.font + u);
    el.style.setProperty("--rw", m.rw + u);
    el.style.setProperty("--ch", m.ch + u);
  }
  // Build a board element. opts.interactive makes the cells buttons you can use.
  function makeBoard(a, opts) {
    var n = a.size, root = document.createElement("div");
    root.className = "board" + (opts.interactive ? "" : " static") + (opts.dot ? " dot" : "");
    var corner = document.createElement("div");
    var cc = document.createElement("div"); cc.className = "colclues";
    var rcs = document.createElement("div"); rcs.className = "rowclues";
    var cells = document.createElement("div"); cells.className = "cells"; cells.setAttribute("role", opts.interactive ? "grid" : "img");
    if (!opts.interactive) cells.setAttribute("aria-label", opts.label || "solver grid");
    var colEls = [], rowEls = [], cellEls = [];
    for (var c = 0; c < n; c++) {
      var d = document.createElement("div"); d.className = "cc";
      d.innerHTML = (a.cols[c].length ? a.cols[c] : [0]).map(function (v) { return "<span>" + v + "</span>"; }).join("");
      cc.appendChild(d); colEls.push(d);
    }
    for (var r = 0; r < n; r++) {
      var e = document.createElement("div"); e.className = "rc";
      e.innerHTML = (a.rows[r].length ? a.rows[r] : [0]).map(function (v) { return "<span>" + v + "</span>"; }).join("");
      rcs.appendChild(e); rowEls.push(e);
      var line = [];
      for (var c2 = 0; c2 < n; c2++) {
        var b = document.createElement(opts.interactive ? "button" : "div");
        b.className = "cell" + ((c2 % 5 === 4 && c2 < n - 1) ? " r5" : "") + ((r % 5 === 4 && r < n - 1) ? " b5" : "");
        b.dataset.s = "u"; b.dataset.r = r; b.dataset.c = c2;
        if (opts.interactive) { b.type = "button"; b.tabIndex = (r === 0 && c2 === 0) ? 0 : -1; b.setAttribute("aria-label", "row " + (r + 1) + ", column " + (c2 + 1) + ", empty"); }
        cells.appendChild(b); line.push(b);
      }
      cellEls.push(line);
    }
    root.appendChild(corner); root.appendChild(cc); root.appendChild(rcs); root.appendChild(cells);
    return { root: root, cells: cells, cellEls: cellEls, rowEls: rowEls, colEls: colEls, n: n, a: a };
  }

  // ---------- picker ----------
  function buildPicker() {
    var host = $("picker"); host.innerHTML = "";
    K.SIZES.forEach(function (size) {
      var row = document.createElement("div"); row.className = "picker";
      var lab = document.createElement("span"); lab.className = "sz"; lab.textContent = size + " × " + size;
      row.appendChild(lab);
      var list = kept.filter(function (a) { return a.size === size; });
      if (!list.length) { var s = document.createElement("span"); s.className = "muted small"; s.textContent = "none kept at this size"; row.appendChild(s); }
      list.forEach(function (a) {
        var b = document.createElement("button"); b.type = "button"; b.textContent = "#" + a.seed; b.dataset.id = a.id;
        b.setAttribute("aria-label", size + " by " + size + ", seed " + a.seed);
        b.setAttribute("aria-pressed", cur && cur.id === a.id ? "true" : "false");
        if (solvedThisVisit[a.id]) b.className = "solved";
        b.addEventListener("click", function () { select(a.id); });
        row.appendChild(b);
      });
      host.appendChild(row);
    });
  }

  // ---------- play ----------
  function lineMatches(line, clue) { return P.sameClue(P.lineClue(line.map(function (v) { return v === 1 ? 1 : 0; })), clue); }
  function refresh() {
    var rowsOk = 0, colsOk = 0, n = cur.size;
    for (var r = 0; r < n; r++) {
      var ok = lineMatches(play[r], cur.rows[r]); if (ok) rowsOk++;
      board.rowEls[r].classList.toggle("done", ok);
    }
    for (var c = 0; c < n; c++) {
      var okc = lineMatches(play.map(function (row) { return row[c]; }), cur.cols[c]); if (okc) colsOk++;
      board.colEls[c].classList.toggle("done", okc);
    }
    var st = $("status");
    if (rowsOk === n && colsOk === n) {
      var grid = play.map(function (row) { return row.map(function (v) { return v === 1 ? 1 : 0; }); });
      if (!P.satisfies(grid, cur.rows, cur.cols)) { st.textContent = "Rows and columns match but the check disagrees. This message should never appear."; st.className = "status"; return; }
      if (cur.verdict === "kept") {
        var same = P.sameGrid(grid, cur.cnt.solutions[0]);
        st.textContent = same ? "Every clue is met, and it is the one grid both solvers found. Solved." :
          "Every clue is met but the grid differs from the solvers' grid. This message should never appear for a kept puzzle.";
        if (same) { solvedThisVisit[cur.id] = true; markSolved(); }
      } else if (cur.verdict === "two") {
        var which = cur.cnt.solutions.map(function (s, i) { return P.sameGrid(grid, s) ? i : -1; }).filter(function (i) { return i >= 0; });
        st.textContent = "Every clue is met. This puzzle has at least two answers" + (which.length ? "; yours is the counter's grid " + "AB"[which[0]] + "." : "; yours is neither of the two the counter found, so there are more than two.");
      } else st.textContent = "Every clue is met.";
      st.className = "status win";
    } else {
      st.textContent = rowsOk + " of " + n + " rows and " + colsOk + " of " + n + " columns match their clues.";
      st.className = "status";
    }
  }
  function markSolved() {
    var b = document.querySelector('#picker button[data-id="' + cur.id + '"]');
    if (b) b.className = "solved";
  }
  function setCell(r, c, s) {
    var v = s === "f" ? 1 : s === "x" ? 2 : 0;
    play[r][c] = v;
    var el = board.cellEls[r][c];
    el.dataset.s = v === 1 ? "f" : v === 2 ? "x" : "u";
    el.setAttribute("aria-label", "row " + (r + 1) + ", column " + (c + 1) + ", " + (v === 1 ? "filled" : v === 2 ? "crossed" : "empty"));
  }
  function buildPlay() {
    var wrap = $("playwrap"); wrap.innerHTML = "";
    var n = cur.size;
    play = []; for (var r = 0; r < n; r++) play.push(new Array(n).fill(0));
    board = makeBoard(cur, { interactive: true });
    wrap.appendChild(board.root);
    fit();
    var painting = null, startMode;
    function cellAt(x, y) { var e = document.elementFromPoint(x, y); return e && e.classList && e.classList.contains("cell") && board.cells.contains(e) ? e : null; }
    function paint(e) {
      var r = +e.dataset.r, c = +e.dataset.c;
      if (play[r][c] === painting.old) return;
      setCell(r, c, painting.to); refresh();
    }
    board.cells.addEventListener("pointerdown", function (ev) {
      var e = ev.target.closest(".cell"); if (!e) return;
      ev.preventDefault();
      var r = +e.dataset.r, c = +e.dataset.c;
      var m = (ev.button === 2 || ev.shiftKey) ? "x" : mode;
      var want = m === "f" ? 1 : 2;
      var to = play[r][c] === want ? "u" : m;
      painting = { to: to, old: -1 };
      painting.old = -1;
      setCell(r, c, to); refresh(); focusCell(r, c);
      try { board.cells.setPointerCapture(ev.pointerId); } catch (x) { /* fine without capture */ }
    });
    board.cells.addEventListener("pointermove", function (ev) {
      if (!painting) return;
      var e = cellAt(ev.clientX, ev.clientY); if (!e) return;
      var r = +e.dataset.r, c = +e.dataset.c;
      var cur2 = play[r][c], want = painting.to === "f" ? 1 : painting.to === "x" ? 2 : 0;
      if (cur2 !== want) { setCell(r, c, painting.to); refresh(); }
    });
    var stop = function () { painting = null; };
    board.cells.addEventListener("pointerup", stop);
    board.cells.addEventListener("pointercancel", stop);
    board.cells.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    board.cells.addEventListener("keydown", function (ev) {
      var e = ev.target.closest(".cell"); if (!e) return;
      var r = +e.dataset.r, c = +e.dataset.c, k = ev.key, n2 = cur.size;
      if (k === "ArrowRight") c = Math.min(n2 - 1, c + 1);
      else if (k === "ArrowLeft") c = Math.max(0, c - 1);
      else if (k === "ArrowDown") r = Math.min(n2 - 1, r + 1);
      else if (k === "ArrowUp") r = Math.max(0, r - 1);
      else if (k === " " || k === "Enter") { ev.preventDefault(); setCell(r, c, play[r][c] === 1 ? "u" : "f"); refresh(); return; }
      else if (k === "x" || k === "X") { setCell(r, c, play[r][c] === 2 ? "u" : "x"); refresh(); return; }
      else if (k === "Delete" || k === "Backspace") { setCell(r, c, "u"); refresh(); return; }
      else return;
      ev.preventDefault(); focusCell(r, c);
    });
    refresh();
  }
  function focusCell(r, c) {
    board.cellEls.forEach(function (row) { row.forEach(function (b) { b.tabIndex = -1; }); });
    var b = board.cellEls[r][c]; b.tabIndex = 0; b.focus();
  }
  function fit() {
    if (!board) return;
    var avail = $("playwrap").clientWidth || 340;
    var m = measure(avail, cur.size, cur.rows, cur.cols, "px");
    applyVars(board.root, m, cur.size);
  }
  function loadSolution(i) {
    var sol = cur.cnt.solutions[i]; if (!sol) return;
    for (var r = 0; r < cur.size; r++) for (var c = 0; c < cur.size; c++) setCell(r, c, sol[r][c] ? "f" : "x");
    refresh();
  }

  function select(id) {
    cur = byId[id]; showingAlt = false;
    $("ptitle").textContent = cur.size + " × " + cur.size + ", seed " + cur.seed;
    var v = cur.verdict;
    $("pverdict").textContent = v === "kept" ? "kept: exactly one answer" : v === "two" ? "thrown out: at least two answers" : v === "stuck" ? "one answer but the line solver stalls" : "undecided";
    $("balt").hidden = cur.verdict !== "two";
    $("breveal").textContent = cur.verdict === "two" ? "Show answer A" : "Show the answer";
    buildPlay(); buildPicker(); renderProof();
  }

  // ---------- proof ----------
  var stepIdx = 0;
  function countCells(g, val) { var n = 0; g.forEach(function (r) { r.forEach(function (v) { if (v === val) n++; }); }); return n; }
  function diffCount(a, b) { var d = 0; for (var r = 0; r < a.length; r++) for (var c = 0; c < a[0].length; c++) if (a[r][c] !== b[r][c]) d++; return d; }
  function renderProof() {
    var a = cur, T = a.size * a.size, L = a.line, C = a.cnt;
    var lineHTML, cntHTML;
    if (L.status === "solved") lineHTML = "Finished the whole grid by logic alone, with no guessing: all " + T + " cells decided in " + plural(L.passes, "pass", "passes") + " (" + L.lineOps + " line looks).";
    else if (L.status === "stuck") lineHTML = "Stalled: " + L.unknown + " of " + T + " cells stay undecided after " + plural(L.passes, "pass", "passes") + ". Every move it could make was forced, but none was left.";
    else lineHTML = "Found a line no placement could fit: the clues contradict each other.";
    if (C.gaveUp) cntHTML = "Gave up after " + C.nodes.toLocaleString("en-US") + " row placements without settling it.";
    else if (C.count >= 2) cntHTML = "Found two different grids that both obey every clue (the " + plural(diffCount(C.solutions[0], C.solutions[1]), "cell", "cells") + " that differ are marked below) after " + C.nodes.toLocaleString("en-US") + " row placements, then stopped at two.";
    else cntHTML = "Searched every possibility, pruned by the column clues, and found exactly " + C.count + " grid after " + C.nodes.toLocaleString("en-US") + " row placements.";
    var agree = a.verdict === "kept" ? "Both solvers returned the same grid, cell for cell: yes." : a.verdict === "two" ? "The line solver could not finish and the counter found two: the solvers agree that this puzzle is ambiguous." : "";
    $("proof").innerHTML =
      '<div class="cols">' +
      '<div class="panel"><h3>1. The line solver</h3><p>' + lineHTML + '</p><p class="muted small">It takes one row or column at a time and keeps only what is true in every way of placing that line\'s runs. If it fills the grid, no other grid is possible, because every step was forced.</p></div>' +
      '<div class="panel"><h3>2. The backtracking counter</h3><p>' + cntHTML + '</p><p class="muted small">Written separately: it tries every legal placement of each row in turn, drops a partial grid when a column can no longer match, and counts complete grids. If it finds exactly one, no other grid exists.</p></div>' +
      '</div><p>' + agree + '</p>' +
      '<div class="panel"><h3>Watch the line solver work</h3>' +
      '<label for="step" class="small muted">Pass <span id="stepn"></span> of ' + L.passes + '</label><br>' +
      '<input type="range" id="step" min="0" max="' + L.passes + '" value="' + Math.min(stepIdx, L.passes) + '">' +
      '<div class="legend"><span><i class="f"></i>filled</span><span><i></i>undecided</span><span><i class="n"></i>decided in this pass</span></div>' +
      '<div class="boardwrap" id="stepwrap"></div><p class="small" id="stepinfo"></p></div>';
    stepIdx = Math.min(stepIdx, L.passes);
    var slider = $("step");
    slider.addEventListener("input", function () { stepIdx = +slider.value; drawStep(); });
    drawStep();
  }
  var stepBoard = null;
  function drawStep() {
    var a = cur, L = a.line, k = stepIdx, n = a.size;
    $("stepn").textContent = k;
    var wrap = $("stepwrap"); wrap.innerHTML = "";
    stepBoard = makeBoard(a, { interactive: false, dot: true, label: "line solver grid after pass " + k });
    wrap.appendChild(stepBoard.root);
    var g = k === 0 ? null : L.snapshots[k - 1], prev = k <= 1 ? null : L.snapshots[k - 2];
    var decided = 0, fresh = 0;
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      var v = g ? g[r][c] : -1, pv = prev ? prev[r][c] : -1, el = stepBoard.cellEls[r][c];
      el.dataset.s = v === 1 ? "f" : v === 0 ? "x" : "u";
      if (v !== -1) decided++;
      if (v !== -1 && pv === -1) { el.dataset.new = "1"; fresh++; }
    }
    var avail = wrap.clientWidth || 340;
    applyVars(stepBoard.root, measure(avail, n, a.rows, a.cols, "px"), n);
    $("stepinfo").textContent = k === 0 ? "Nothing decided yet: " + (n * n) + " undecided cells." :
      decided + " of " + (n * n) + " cells decided; " + plural(fresh, "cell", "cells") + " decided in this pass.";
  }

  // ---------- tally ----------
  function renderTally() {
    var t = tally, per = K.SEEDS_PER_SIZE;
    var stuckNote = ex ? " At " + EXN + ", " + (ex.uniqueSigs - ex.lineSolved).toLocaleString("en-US") + " of the " + ex.uniqueSigs.toLocaleString("en-US") + " clue sets with one answer are not line-solvable, so such puzzles exist." : "";
    var rows = K.SIZES.map(function (s) {
      var b = t.bySize[s];
      return "<tr><td>" + s + " × " + s + "</td><td>" + b.total + "</td><td>" + b.kept + "</td><td>" + b.two + "</td><td>" + b.stuck + "</td><td>" + b.undecided + "</td></tr>";
    }).join("");
    $("tally").innerHTML =
      "<p>The candidates are the first " + per + " seeds at each of " + K.SIZES.length + " sizes (" + K.SIZES.join(", ") + "), none skipped, each a random grid with " + Math.round(K.DENSITY * 100) + "% of cells filled. Of " + t.total + " candidates, <strong>" +
      t.kept + " were kept</strong> (one answer by both methods) and <strong>" + t.two + " were thrown out</strong> for having at least two answers; " +
      (t.stuck ? plural(t.stuck, "had one answer but needs guessing", "had one answer but need guessing") : "none had one answer but needed guessing") + " and " +
      (t.undecided ? plural(t.undecided, "was undecided", "were undecided") : "none were undecided") + "." + stuckNote + "</p>" +
      '<div class="tw"><table><thead><tr><th>Size</th><th>Tried</th><th>Kept</th><th>Two or more</th><th>One answer, stalls</th><th>Undecided</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }

  // ---------- rejected ----------
  function mini(grid, other, cellPx) {
    var n = grid.length, d = document.createElement("div");
    d.className = "mini"; d.style.setProperty("--n", n); d.style.setProperty("--mc", cellPx + "px");
    d.setAttribute("role", "img");
    var html = "";
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++)
      html += '<i class="' + (grid[r][c] ? "f" : "") + (other && other[r][c] !== grid[r][c] ? " d" : "") + '"></i>';
    d.innerHTML = html;
    return d;
  }
  function renderRejected() {
    var host = $("rejected");
    if (!rejected.length) { host.innerHTML = "<p>None of the " + tally.total + " candidates was thrown out.</p>"; return; }
    var cardsHTML = document.createElement("div"); cardsHTML.className = "cards";
    rejected.forEach(function (a) {
      var card = document.createElement("div"); card.className = "card";
      var cellPx = clamp(Math.floor(110 / a.size), 6, 16);
      var A = a.cnt.solutions[0], B = a.cnt.solutions[1];
      var d = diffCount(A, B);
      card.innerHTML = "<h3>" + a.size + " × " + a.size + ", seed " + a.seed + "</h3>";
      var pair = document.createElement("div"); pair.className = "pair";
      [["Grid A", A, B], ["Grid B", B, A]].forEach(function (x) {
        var f = document.createElement("figure"); f.appendChild(mini(x[1], x[2], cellPx));
        var cap = document.createElement("figcaption"); cap.textContent = x[0]; f.appendChild(cap);
        f.firstChild.setAttribute("aria-label", a.size + " by " + a.size + " grid " + x[0].slice(-1));
        pair.appendChild(f);
      });
      card.appendChild(pair);
      var p = document.createElement("p"); p.className = "small";
      p.textContent = "Both grids give the same row and column clues. They differ in " + plural(d, "cell", "cells") + " (outlined). The line solver " +
        (a.line.status === "stuck" ? "stalled with " + a.line.unknown + " of " + (a.size * a.size) + " cells undecided." : a.line.status === "contradiction" ? "reported a contradiction, which should not happen." : "finished, which should not happen.");
      card.appendChild(p);
      var b = document.createElement("button"); b.type = "button"; b.textContent = "Try this puzzle on the board";
      b.addEventListener("click", function () { select(a.id); $("ptitle").scrollIntoView({ block: "center" }); });
      card.appendChild(b);
      cardsHTML.appendChild(card);
    });
    host.innerHTML = "<p>" + plural(rejected.length, "candidate was", "candidates were") + " thrown out because the counter found a second grid with the same clues. Each is shown with the two grids it found.</p>";
    host.appendChild(cardsHTML);
  }

  // ---------- print ----------
  function printPage(a) {
    var n = a.size, div = document.createElement("div"); div.className = "pp";
    var cell = Math.min(14, Math.floor(140 / n));
    div.innerHTML = "<h2>Nonogram " + n + " × " + n + ", seed " + a.seed + "</h2>" +
      "<p>Fill cells so each row and column shows its runs, in order, with at least one empty cell between runs. Two separately written programs found exactly one answer (details at vigilstudio.github.io/nonograms/).</p>";
    var b = makeBoard(a, { interactive: false, label: "blank grid with clues" });
    applyVars(b.root, measure(0, n, a.rows, a.cols, "mm", cell), n);
    div.appendChild(b.root);
    var f = document.createElement("p"); f.style.marginTop = "5mm"; f.style.fontSize = "9pt";
    f.textContent = "Made by Claude, an AI model. Seed " + a.id + ". vigilstudio.github.io/nonograms/";
    div.appendChild(f);
    return div;
  }
  function printSheet(list, withKey) {
    var host = $("printarea"); host.innerHTML = "";
    list.forEach(function (a) { host.appendChild(printPage(a)); });
    if (withKey) {
      var key = document.createElement("div"); key.className = "pp";
      key.innerHTML = "<h2>Answer key</h2><p>Filled cells are black.</p>";
      var wrap = document.createElement("div"); wrap.className = "keys";
      list.forEach(function (a) {
        var f = document.createElement("figure");
        f.appendChild(mini(a.cnt.solutions[0], null, Math.max(3, Math.floor(34 / a.size * 1.4))));
        var cap = document.createElement("figcaption"); cap.textContent = a.size + " × " + a.size + ", seed " + a.seed; f.appendChild(cap);
        wrap.appendChild(f);
      });
      key.appendChild(wrap); host.appendChild(key);
    }
    host.setAttribute("aria-hidden", "false");
    window.print();
  }

  // ---------- checks ----------
  function renderChecks(list, tbody, showHow) {
    tbody.innerHTML = list.map(function (c) {
      return "<tr><td>" + esc(c.label) + "</td><td><span class=\"tag " + (c.ok ? "ok" : "bad") + "\">" + (c.ok ? "pass" : "FAIL") + "</span></td><td>" + esc(c.detail) + (showHow && c.how ? '<br><span class="muted small">Broken once in test.mjs: ' + esc(c.how.replace(/\.$/, "")) + ", and it failed.</span>" : "") + "</td></tr>";
    }).join("");
  }
  function pendingRows(tbody) {
    tbody.innerHTML = '<tr><td colspan="3"><span class="tag wait">running</span> checks on all ' + EXN + ' clue sets take a moment...</td></tr>';
  }
  function renderAllChecks() {
    var list = K.realChecks(analyses, P, ex);
    renderChecks(list, document.querySelector("#checks tbody"), true);
    var okN = list.filter(function (c) { return c.ok; }).length;
    $("checksum").textContent = okN + " of " + list.length + " checks that can fail pass. Two more facts hold by construction and are shown below, not counted.";
    $("construction").innerHTML = "Hold by construction (not counted): " + K.constructionFacts(analyses, P).map(function (f) { return esc(f.label) + " (" + (f.ok ? "true" : "FALSE") + "; " + esc(f.detail) + ")"; }).join("; ") + ".";
    window.__checks = list;
  }
  function damageDemo() {
    var copy = JSON.parse(JSON.stringify(analyses));
    var t = copy.find(function (a) { return a.verdict === "kept"; });
    var before = t.rows[0].slice();
    if (t.rows[0].length) t.rows[0][0] += 1; else t.rows[0] = [1];
    var list = K.realChecks(copy, P, ex);
    var failed = list.filter(function (c) { return !c.ok; });
    $("damaged").innerHTML = '<p>Damaged a copy: puzzle ' + t.id + ', first row clue changed from ' + esc(clueText(before)) + ' to ' + esc(clueText(t.rows[0])) + '. <strong>' + failed.length + ' of ' + list.length + ' checks now fail</strong>' +
      (failed.length ? ': ' + failed.map(function (c) { return esc(c.label); }).join("; ") : "") + '. The checks that only compare grids with grids stay green. The page itself is unchanged.</p>';
  }

  function renderLimits() {
    var stuck = ex ? (ex.uniqueSigs - ex.lineSolved) : null;
    var items = [
      "Both solvers were written by Claude in one sitting. They share no code, but they could still share a misreading of the rules. The brute-force comparison covers only " + EXN + "; at " + SMALL + " to " + BIG + " the evidence is that two different programs agree on every candidate.",
      "The counter stops at two answers, so for a rejected puzzle it does not say how many answers there really are, only “at least two”.",
      "“Kept” means one answer and solvable by the line solver alone. Puzzles that have one answer but need a guess are not offered; " + (tally.stuck ? "this run found " + tally.stuck + " of them." : "none turned up among these " + tally.total + " candidates") + (stuck !== null ? ", although " + stuck.toLocaleString("en-US") + " such clue sets exist at " + EXN + "." : "."),
      "The puzzles are random noise, not pictures, and are not rated for difficulty. The line solver's pass count is a rough guide only.",
      "The printable layout was checked only by printing to PDF in headless Chrome, never on a paper printer or phone. Touch dragging on the board has not been tried on a real phone.",
      "No published figures are quoted on this page."
    ];
    $("limits").innerHTML = items.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
  }

  // ---------- wire up ----------
  function setMode(m) {
    mode = m;
    $("mfill").setAttribute("aria-pressed", m === "f");
    $("mcross").setAttribute("aria-pressed", m === "x");
  }
  $("mfill").addEventListener("click", function () { setMode("f"); });
  $("mcross").addEventListener("click", function () { setMode("x"); });
  $("bclear").addEventListener("click", function () { buildPlay(); });
  $("breveal").addEventListener("click", function () { loadSolution(0); });
  $("balt").addEventListener("click", function () { loadSolution(1); });
  $("print1").addEventListener("click", function () {
    if (cur.verdict !== "kept") { $("printnote").textContent = "This puzzle was thrown out (it has at least two answers), so it is not printed. Pick a kept puzzle."; return; }
    $("printnote").textContent = ""; printSheet([cur], $("key").checked);
  });
  $("printall").addEventListener("click", function () { $("printnote").textContent = ""; printSheet(kept, $("key").checked); });
  window.addEventListener("afterprint", function () { $("printarea").innerHTML = ""; $("printarea").setAttribute("aria-hidden", "true"); });
  $("damage").addEventListener("click", damageDemo);
  $("printnote").textContent = "There are " + kept.length + " kept puzzles: " + kept.length + " pages" + ", plus the key.";
  var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { fit(); drawStep(); }, 80); });

  renderTally(); renderRejected(); renderLimits();
  pendingRows(document.querySelector("#checks tbody"));
  select(kept.length ? kept[0].id : analyses[0].id);
  window.__nono = { analyses: analyses, tally: tally };

  // The 4 by 4 comparison goes through 65,536 grids, so it runs after the page is first drawn.
  var gen = K.exhaustive4Gen(P, LS, CT), t0 = performance.now();
  (function stepGen() {
    var r = gen.next();
    if (!r.done) { setTimeout(stepGen, 0); return; }
    ex = r.value;
    window.__ex = ex; window.__exMs = Math.round(performance.now() - t0);
    renderAllChecks(); renderTally(); renderLimits();
    document.documentElement.setAttribute("data-ready", "1");
  })();
})();
