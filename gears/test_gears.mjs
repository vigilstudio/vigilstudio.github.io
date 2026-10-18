// node test_gears.mjs  -> runs every check, then breaks each new check once and expects it to fail; writes results.json
import fs from 'fs'; import {createRequire} from 'module';
const L = createRequire(import.meta.url)('./gearlib.js');
const cut = fs.readFileSync('gearset.svg','utf8'), mesh = fs.readFileSync('gearset-meshed.svg','utf8');
const base = L.runChecks(cut, mesh);
const failed = base.rows.filter(r => !r.ok);
let tally = base.rows.length;
// Brocot against brute force
const targets = [[3652564,2247008],[365242200,29530589],[1,1],[314159265,100000000],[1414213562,1000000000],[12,1],[7,3]];
const bounds = [8,13,20,40,60,100];
let bfOk = 0, bfN = 0; const bfRows = [];
for (const [n,d] of targets) for (const N of bounds) {
  if (BigInt(n) / BigInt(d) >= BigInt(N)) continue; // target must be inside 0..N
  const r = L.brocotAgreesWithBrute(n,d,N); bfN++; if (r.ok) bfOk++;
  bfRows.push({t:n+'/'+d,N,sb:L.fstr(r.sb.best),bf:r.bf.all.map(L.fstr).join(' or '),ok:r.ok});
}
// random sweep, many targets
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
let sweepN = 0, sweepOk = 0;
for (let i = 0; i < 400; i++) { const d = 1 + rnd() % 997, n = 1 + rnd() % 5000, N = 3 + rnd() % 40; if (n/d >= N) continue; sweepN++; if (L.brocotAgreesWithBrute(n,d,N).ok) sweepOk++; }
// ---------- break each check once ----------
const breaks = [];
const expectFail = (name, rows, pred) => { const hit = rows.filter(pred); breaks.push({name, failed: hit.length > 0, example: hit[0] ? hit[0].group + ': ' + hit[0].label + ' (' + hit[0].detail + ')' : null}); };
const grab = (id) => { const re = new RegExp('(<g id="gear-' + id + '"[\\s\\S]*?<path class="cut"[^>]* d=")([^"]+)(")'); return re; };
// 1 remove a tooth (delete the points of the first tooth after the start)
{ const re = grab('A2'); const m = re.exec(cut); const pts = m[2].split(' '); const per = (pts.length - 1) / 54; const mutated = ['M'+pts[0].slice(1)].concat(pts.slice(1)); const keep = pts.slice(Math.round(per)); keep[0] = 'M' + keep[0].slice(1);
  const c2 = cut.replace(re, '$1' + keep.join(' ') + '$3'); expectFail('delete one tooth of A2 -> teeth count', L.runChecks(c2, mesh).rows, r => r.group === 'gear A2' && r.label.startsWith('teeth')); }
// 2 tip radius: push one tip vertex out by 0.3 mm
{ const re = grab('A1'); const m = re.exec(cut); const pts = m[2].split(' '); let k = pts.findIndex(p => { const [x,y] = p.slice(1).split(',').map(Number); return Math.hypot(x,y) > 14.99; }); const [x,y] = pts[k].slice(1).split(',').map(Number); const s = 15.3/15; pts[k] = 'L' + (x*s).toFixed(3) + ',' + (y*s).toFixed(3);
  expectFail('push one tip vertex out 0.3 mm -> tip radius', L.runChecks(cut.replace(re, '$1' + pts.join(' ') + '$3'), mesh).rows, r => r.group === 'gear A1' && r.label === 'tip radius'); }
// 3 fatter teeth: spread every vertex's angle 10 % about its nearest tooth centre (thickness check only)
{ const z = 24, re = grab('V'); const m = re.exec(cut); const pts = m[2].split(' ').map(p => p.slice(1).split(',').map(Number)); const pitch = 2*Math.PI/z;
  const out = pts.map(([x,y],i) => { const r = Math.hypot(x,y), a = Math.atan2(y,x), c = Math.round(a/pitch)*pitch; const a2 = c + (a - c)*1.1; return (i?'L':'M') + (r*Math.cos(a2)).toFixed(3) + ',' + (r*Math.sin(a2)).toFixed(3); });
  expectFail('widen every tooth of V by 10 % -> thickness at pitch circle', L.runChecks(cut.replace(re, '$1' + out.join(' ') + '$3'), mesh).rows, r => r.group === 'gear V' && r.label.startsWith('tooth thickness')); }
// 4 pitch circle element changed
expectFail('change V pitch circle r 18 -> 18.5 in the file', L.runChecks(cut.replace(/(id="gear-V"[\s\S]*?class="pitch[^>]* r=")18\.000/, '$118.500'), mesh).rows, r => r.group === 'gear V' && r.label.startsWith('pitch circle'));
// 5 move a gear 0.5 mm in the meshed drawing
expectFail('move gear V 0.5 mm in the meshed drawing -> centre distance', L.runChecks(cut, mesh.replace(/(id="gear-V"[^>]*translate\()([\d.]+)/, (s,a,b) => a + (+b + 0.5).toFixed(3))).rows, r => r.group === 'mesh E-V' && r.label.includes('centre distance'));
// 6 un-share the shaft
expectFail('move A3 off A2\'s centre -> one shaft', L.runChecks(cut, mesh.replace(/(id="gear-A3"[^>]*translate\()([\d.]+)/, (s,a,b) => a + (+b + 1).toFixed(3))).rows, r => r.group === 'train A');
// 7 ratio: spec says V has 25 teeth is not enough; instead change the claim by removing a tooth from V
{ const re = grab('V'); const m = re.exec(cut); const pts = m[2].split(' '); const per = (pts.length - 1) / 24; const keep = pts.slice(Math.round(per)); keep[0] = 'M' + keep[0].slice(1);
  expectFail('delete one tooth of V -> train B exact ratio', L.runChecks(cut.replace(re, '$1' + keep.join(' ') + '$3'), mesh).rows, r => r.group === 'train B'); }
// 8 contact ratio: wrong closed form (extra cos alpha)
expectFail('contact ratio closed form with a stray cos(alpha)', L.runChecks(cut, mesh, {fault:'cosA'}).rows, r => r.label.startsWith('contact ratio'));
// 9 interference: a 12-tooth pinion with a 36-tooth gear at module 1.5 (not in the set)
{ const g1 = L.geom(12,1.5), g2 = L.geom(36,1.5), a = 1.5*48/2; const im = L.interferenceMargins(g1,g2,a); breaks.push({name:'12-tooth pinion on 36 teeth would interfere', failed: im.m1 < 0 || im.m2 < 0, example:'margins ' + im.m1.toFixed(2) + ' and ' + im.m2.toFixed(2) + ' mm'}); }
// 10 Brocot: always pick the lower neighbour (a wrong rule) must disagree with brute force somewhere
{ let dis = 0, tot = 0; for (const [n,d] of targets) for (const N of bounds) { if (BigInt(n)/BigInt(d) >= BigInt(N)) continue; tot++; if (!L.brocotAgreesWithBrute(n,d,N,'alwaysLow').ok) dis++; } breaks.push({name:'Stern-Brocot that always takes the lower neighbour', failed: dis > 0, example: dis + ' of ' + tot + ' target/bound pairs disagree with brute force'}); }
// 11 Brocot with a bound one too small
{ let dis = 0, tot = 0; for (const [n,d] of targets) for (const N of bounds) { if (BigInt(n)/BigInt(d) >= BigInt(N)) continue; tot++; const s = L.sbBest(n,d,N-1), b = L.bruteBest(n,d,N); if (L.fcmp(s.err,b.err) !== 0) dis++; } breaks.push({name:'Stern-Brocot run with bound N-1 compared against brute force at N', failed: dis > 0, example: dis + ' of ' + tot + ' pairs disagree'}); }
const allBroke = breaks.every(b => b.failed);
const res = { gearChecks: base.rows.length, gearChecksFailed: failed.length, brocotTargets: bfN, brocotAgree: bfOk, sweepTargets: sweepN, sweepAgree: sweepOk, breaks, allBroke, bfRows };
fs.writeFileSync('results.json', JSON.stringify(res, null, 1));
console.log(JSON.stringify({gearChecks: res.gearChecks, failed: failed.map(f=>f.group+' '+f.label), bf: bfOk+'/'+bfN, sweep: sweepOk+'/'+sweepN, allBroke}, null, 1));
for (const b of breaks) console.log(b.failed ? 'FAILS as intended' : 'DID NOT FAIL', '-', b.name, '|', b.example);
