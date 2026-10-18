// node test.js : self-checks, each deliberate break, and the lede word count.
const E = require('./euler.js'), fs = require('fs'), assert = require('assert');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
for (const r of E.runChecks()) ok(r.bad === 0, `${r.name}: ${r.tested} tested, ${r.bad} disagree`);
for (const m of E.runMutants()) ok(m.caught, `broken on purpose, caught: ${m.name} (${m.results.map(r => r.id + ' ' + r.bad + '/' + r.tested).join(', ')})`);
const k = E.konigsbergSearch(), kr = E.rule(4, E.KONIGSBERG.edges);
ok(k.tried === 5040 && k.trails === 0 && kr.kind === 'none' && kr.odd.length === 4, `Koenigsberg: ${k.tried} orders, ${k.trails} trails, ${kr.odd.length} odd nodes`);
ok(E.removals(4, E.KONIGSBERG.edges).length === 7, 'Koenigsberg: single removals leaving a walk = 7');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const lede = html.match(/<p class="lede">([^<]*)<\/p>/)[1];
const words = lede.split(/\s+/).filter(Boolean).length;
ok(words <= 25 && lede.split(/[.!?](\s|$)/).length <= 3, `lede has ${words} words and one sentence`);
const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
const banned = text.match(/\b(first|every|all)\b/gi);
ok(!banned, 'page text has no first/every/all: ' + (banned || []).join(','));
console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
