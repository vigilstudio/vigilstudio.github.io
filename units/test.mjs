import { createRequire } from 'node:module';
import fs from 'node:fs';
const U = createRequire(import.meta.url)('./units.js');
let bad = 0; const fail = m => { bad++; console.log('FAIL', m); };
const res = U.runChecks();
if (res.some(r => !r.ok)) fail('a check fails unbroken');
for (const c of U.CHECKS) if (U.runChecks(c.id).find(r => r.id === c.id).ok) fail('not broken: ' + c.id);
for (const p of U.PUBLISHED) {
  const ok = U.comparePublished(p);
  if (!ok) fail('published ' + p.text);
  if (ok && U.comparePublished(p, U.bumped(p.text))) fail('bump survives ' + p.text);
}
if (!U.eq(U.M('mi'), U.R(201168, 125))) fail('mile');
if (U.fraction(U.convert(U.R(1), 'mi', 'ft')) !== '5280') fail('5280');
if (U.parse('0.0').value.n !== 0n) fail('parse 0.0');
if (U.parse('1e5').ok) fail('exponent accepted');
if (U.parse('1'.repeat(41)).ok || !U.parse('1'.repeat(40)).ok) fail('length rule');
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const lede = /id="lede">([^<]+)</.exec(html)[1];
console.log('lede words:', lede.trim().split(/\s+/).length);
if (lede.trim().split(/\s+/).length > 25) fail('lede too long');
console.log(bad ? bad + ' failures' : 'all ok', U.CHECKS.length + ' checks', U.PUBLISHED.length + ' published');
