/* Exact length units: every unit is a fraction of a metre (BigInt numerator / denominator). */
(function (root) {
  'use strict';
  function gcd(a, b) { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; }
  function R(n, d) {
    n = BigInt(n); d = d === undefined ? 1n : BigInt(d);
    if (d === 0n) throw new Error('zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    return { n: n / g, d: d / g };
  }
  const add = (a, b) => R(a.n * b.d + b.n * a.d, a.d * b.d);
  const sub = (a, b) => R(a.n * b.d - b.n * a.d, a.d * b.d);
  const mul = (a, b) => R(a.n * b.n, a.d * b.d);
  const div = (a, b) => R(a.n * b.d, a.d * b.n);
  const abs = a => R(a.n < 0n ? -a.n : a.n, a.d);
  const eq = (a, b) => a.n === b.n && a.d === b.d;
  const le = (a, b) => a.n * b.d <= b.n * a.d;
  const sgn = a => a.n < 0n ? -1 : a.n > 0n ? 1 : 0;

  /* Parse "12", "-1.5", ".5", "3/8" or "1.5/2" exactly. Returns {ok, value} or {ok:false, error}. No clamping. */
  const MAXLEN = 40;
  function parseDecimal(s) {
    const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) return null;
    const frac = m[3] || '';
    let n = BigInt((m[2] || '0') + frac);
    if (m[1] === '-') n = -n;
    return R(n, 10n ** BigInt(frac.length));
  }
  function parse(str) {
    const s = String(str).trim().replace(/,/g, '');
    if (s === '') return { ok: false, error: 'Type a number.' };
    if (s.length > MAXLEN) return { ok: false, error: 'Too long: ' + s.length + ' characters typed, ' + MAXLEN + ' allowed. Nothing was shortened.' };
    const parts = s.split('/');
    if (parts.length > 2) return { ok: false, error: 'Use one slash at most, as in 3/8.' };
    const a = parseDecimal(parts[0].trim());
    if (!a) return { ok: false, error: '"' + parts[0] + '" is not a number (digits, one point, optional sign).' };
    if (parts.length === 1) return { ok: true, value: a };
    const b = parseDecimal(parts[1].trim());
    if (!b || /^[+-]/.test(parts[1].trim())) return { ok: false, error: 'The part after the slash must be an unsigned number.' };
    if (b.n === 0n) return { ok: false, error: 'Division by zero.' };
    return { ok: true, value: div(a, b) };
  }

  /* Decimal text with `sig` significant digits; flag says whether the text is the exact value. */
  function decimal(r, sig) {
    sig = sig || 12;
    if (r.n === 0n) return { text: '0', exact: true };
    const neg = r.n < 0n, n = neg ? -r.n : r.n, d = r.d;
    let e = n.toString().length - d.toString().length;
    // e is within one of floor(log10(n/d)); fix it up
    const p10 = k => (k >= 0 ? R(10n ** BigInt(k)) : R(1n, 10n ** BigInt(-k)));
    while (le(p10(e + 1), R(n, d))) e++;
    while (!le(p10(e), R(n, d))) e--;
    const shift = sig - 1 - e;
    const scaled = shift >= 0 ? R(n * 10n ** BigInt(shift), d) : R(n, d * 10n ** BigInt(-shift));
    let q = scaled.n / scaled.d;
    if (2n * (scaled.n % scaled.d) >= scaled.d) q += 1n;
    const exact = eq(shift >= 0 ? R(q, 10n ** BigInt(shift)) : R(q * 10n ** BigInt(-shift)), R(n, d));
    let digits = q.toString();
    if (digits.length > sig) { digits = digits.slice(0, sig); e += 1; } // rounding carried to a new digit
    let text;
    if (e >= 16 || e <= -7) {
      text = digits[0] + (sig > 1 ? '.' + digits.slice(1) : '') + 'e' + e;
      if (exact) text = text.replace(/\.?0+e/, 'e');
    } else if (e >= 0) {
      const ip = digits.slice(0, e + 1).padEnd(e + 1, '0'), fp = digits.slice(e + 1);
      text = ip + (fp ? '.' + fp : '');
    } else {
      text = '0.' + '0'.repeat(-e - 1) + digits;
    }
    if (text.indexOf('.') >= 0 && text.indexOf('e') < 0) text = text.replace(/0+$/, '').replace(/\.$/, '');
    return { text: (neg ? '-' : '') + text, exact: exact };
  }
  function fraction(r) { return r.d === 1n ? r.n.toString() : r.n + '/' + r.d; }

  /* ---------- the ladder: each unit built from its definition ---------- */
  // [key, name, parent, count of parent (fraction), how it is defined, system]
  const LADDER = [
    ['m',   'metre',               null, R(1),        'the base unit here', 'metric'],
    ['cm',  'centimetre',          'm',  R(1, 100),   '1/100 m', 'metric'],
    ['km',  'kilometre',           'm',  R(1000),     '1000 m', 'metric'],
    ['in',  'inch',                'cm', R(254, 100), 'exactly 2.54 cm (1959 agreement)', 'international'],
    ['ft',  'foot',                'in', R(12),       '12 inches', 'international'],
    ['yd',  'yard',                'ft', R(3),        '3 feet', 'international'],
    ['fm',  'fathom',              'yd', R(2),        '2 yards', 'international'],
    ['rd',  'rod (pole, perch)',   'yd', R(11, 2),    '5.5 yards', 'international'],
    ['lk',  'link (Gunter)',       'in', R(792, 100), '7.92 inches', 'international'],
    ['ch',  'chain',               'rd', R(4),        '4 rods', 'international'],
    ['fur', 'furlong',             'ch', R(10),       '10 chains', 'international'],
    ['mi',  'statute mile',        'fur', R(8),       '8 furlongs', 'international'],
    ['nmi', 'nautical mile',       'm',  R(1852),     'exactly 1852 m (international, 1929)', 'international'],
    ['sft', 'US survey foot',      'm',  R(1200, 3937), '1200/3937 m (US, 1893 to 2022)', 'survey'],
    ['srd', 'survey rod',          'sft', R(33, 2),   '16.5 survey feet', 'survey'],
    ['sch', 'survey chain',        'srd', R(4),       '4 survey rods', 'survey'],
    ['sfur','survey furlong',      'sch', R(10),      '10 survey chains', 'survey'],
    ['smi', 'US survey mile',      'sfur', R(8),      '8 survey furlongs', 'survey']
  ];
  const UNITS = {}, ORDER = [];
  for (const [key, name, parent, count, how, system] of LADDER) {
    UNITS[key] = { key, name, parent, count, how, system, m: parent ? mul(count, UNITS[parent].m) : R(1) };
    ORDER.push(key);
  }
  const M = k => UNITS[k].m;
  const convert = (v, from, to) => div(mul(v, M(from)), M(to));

  /* ---------- self-checks: each routes to a unit by a path the ladder did NOT use ---------- */
  // typed * unit  must equal  target (within tol, 0 = exact). delta is what "break once" adds to the typed value.
  const route = (id, typed, unit, target, label) => ({ id, group: 'route', label, typed: R(typed), delta: R(1),
    tol: R(0), lhs: t => mul(t, M(unit)), rhs: () => M(target), unitTxt: unit });
  const CHECKS = [
    route('mi-ft',   5280,  'ft',  'mi',  '1 mile = 5,280 feet'),
    route('mi-yd',   1760,  'yd',  'mi',  '1 mile = 1,760 yards'),
    route('mi-rd',   320,   'rd',  'mi',  '1 mile = 320 rods'),
    route('mi-ch',   80,    'ch',  'mi',  '1 mile = 80 chains'),
    route('mi-in',   63360, 'in',  'mi',  '1 mile = 63,360 inches'),
    route('fur-ft',  660,   'ft',  'fur', '1 furlong = 660 feet'),
    route('fur-yd',  220,   'yd',  'fur', '1 furlong = 220 yards'),
    route('fur-rd',  40,    'rd',  'fur', '1 furlong = 40 rods'),
    route('fur-in',  7920,  'in',  'fur', '1 furlong = 7,920 inches'),
    route('ch-ft',   66,    'ft',  'ch',  '1 chain = 66 feet'),
    route('ch-yd',   22,    'yd',  'ch',  '1 chain = 22 yards'),
    route('ch-lk',   100,   'lk',  'ch',  '1 chain = 100 links'),
    route('ch-in',   792,   'in',  'ch',  '1 chain = 792 inches'),
    null, // placeholder for the rod check below (33 feet = 2 rods)
    route('yd-in',   36,    'in',  'yd',  '1 yard = 36 inches'),
    route('fm-ft',   6,     'ft',  'fm',  '1 fathom = 6 feet'),
    route('smi-sft', 5280,  'sft', 'smi', '1 survey mile = 5,280 survey feet'),
    route('smi-sch', 80,    'sch', 'smi', '1 survey mile = 80 survey chains'),
    route('smi-srd', 320,   'srd', 'smi', '1 survey mile = 320 survey rods'),
    route('sfur-sft',660,   'sft', 'sfur','1 survey furlong = 660 survey feet'),
    route('sch-sft', 66,    'sft', 'sch', '1 survey chain = 66 survey feet'),
  ];
  // 33 feet against two rods needs its own form
  CHECKS[CHECKS.indexOf(null)] = { id: 'rd-ft', group: 'route', label: '2 rods = 33 feet', typed: R(33), delta: R(1), tol: R(0),
    lhs: t => mul(t, M('ft')), rhs: () => mul(R(2), M('rd')) };
  // one metre is 39.37 survey inches (the 1866 figure the survey foot keeps)
  CHECKS.push({ id: 'm-sin', group: 'route', label: '1 metre = 39.37 survey inches (a survey inch is 1/12 survey foot)',
    typed: R(3937, 100), delta: R(1), tol: R(0), lhs: t => mul(t, div(M('sft'), R(12))), rhs: () => R(1) });
  CHECKS.push({ id: 'm-in', group: 'route', label: '1 metre = 10,000/254 inches',
    typed: R(10000, 254), delta: R(1), tol: R(0), lhs: t => mul(t, M('in')), rhs: () => R(1) });
  // derived claims written on the page, with the tolerance the page's wording needs
  CHECKS.push({ id: 'd-1959', group: 'derived', label: 'The 1959 yard (0.9144 m) is shorter than the US yard of 3600/3937 m by about 2 parts per million (within 5%)',
    typed: R(2, 1000000), delta: R(1, 1000000), tol: R(1, 10000000),
    lhs: t => t, rhs: () => div(sub(div(R(3600, 3937), R(1)), M('yd')), M('yd')) });
  CHECKS.push({ id: 'd-smi', group: 'derived', label: 'A survey mile is longer than a statute mile by about 3.2 mm (within 0.1 mm)',
    typed: R(32, 10000), delta: R(1, 100), tol: R(1, 10000),
    lhs: t => t, rhs: () => sub(M('smi'), M('mi')) });
  CHECKS.push({ id: 'd-6e6', group: 'derived', label: '6,000,000 survey feet is about 12 international feet longer than 6,000,000 feet (within 0.1 ft)',
    typed: R(12), delta: R(1), tol: R(1, 10),
    lhs: t => t, rhs: () => sub(div(mul(R(6000000), M('sft')), M('ft')), R(6000000)) });
  CHECKS.push({ id: 'd-nmi', group: 'derived', label: 'A 40,000 km meridian circle has 21,600 arcminutes of about 1851.85 m, within half a metre of 1852 m (rounded: a plausibility check, not a definition)',
    typed: R(40000000), delta: R(1000000), tol: R(1, 2),
    lhs: t => div(t, R(21600)), rhs: () => M('nmi') });

  function runChecks(breakId) {
    return CHECKS.map(c => {
      const typed = c.id === breakId ? add(c.typed, c.delta) : c.typed;
      const l = c.lhs(typed), r = c.rhs();
      return { id: c.id, group: c.group, label: c.label, ok: le(abs(sub(l, r)), c.tol), got: l, want: r };
    });
  }

  /* ---------- second list: figures read from search summaries of NIST pages (not fetched) ---------- */
  // text is in metres; kind 'exact' needs equality, 'rounded' needs agreement to the last printed digit.
  const PUBLISHED = [
    { unit: 'in',  text: '0.0254',          kind: 'exact',   say: 'inch = 2.54 cm exactly' },
    { unit: 'ft',  text: '0.3048',          kind: 'exact',   say: 'foot 0.3048 m' },
    { unit: 'yd',  text: '0.9144',          kind: 'exact',   say: 'yard 0.9144 m' },
    { unit: 'fm',  text: '1.8288',          kind: 'exact',   say: 'fathom 6 ft = 1.8288 m exactly' },
    { unit: 'rd',  text: '5.0292',          kind: 'exact',   say: 'rod 16.5 ft = 5.0292 m exactly' },
    { unit: 'ch',  text: '20.1168',         kind: 'exact',   say: 'chain 66 ft = 20.1168 m exactly' },
    { unit: 'fur', text: '201.168',         kind: 'exact',   say: 'furlong 660 ft = 201.168 m exactly' },
    { unit: 'mi',  text: '1609.344',        kind: 'exact',   say: 'mile 5,280 ft = 1609.344 m exactly' },
    { unit: 'nmi', text: '1852',            kind: 'exact',   say: 'international nautical mile 1852 m (one source only)' },
    { unit: 'sft', text: '0.304800609601',  kind: 'rounded', say: 'survey foot about 0.304 800 609 601 m' },
    { unit: 'sch', text: '20.116840234',    kind: 'rounded', say: 'chain in survey feet about 20.116 840 234 m' }
  ];
  function comparePublished(row, textOverride) {
    const text = textOverride === undefined ? row.text : textOverride;
    const p = parseDecimal(text), mine = M(row.unit);
    if (row.kind === 'exact') return eq(p, mine);
    const dp = (text.split('.')[1] || '').length;
    return le(abs(sub(p, mine)), R(5, 10n ** BigInt(dp + 1))); // half a unit in the last printed place
  }
  // bump the last printed digit by one
  function bumped(text) {
    const dp = (text.split('.')[1] || '').length;
    const p = add(parseDecimal(text), R(1, 10n ** BigInt(dp)));
    return decimal(p, 30).text;
  }
  const api = { R, add, sub, mul, div, abs, eq, le, sgn, parse, parseDecimal, decimal, fraction, UNITS, ORDER, M, convert,
    CHECKS, runChecks, PUBLISHED, comparePublished, bumped, MAXLEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Units = api;
})(typeof window !== 'undefined' ? window : globalThis);
