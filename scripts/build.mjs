/* surd build — inlines everything into a single self-contained HTML file.
 *
 * Why single-file: the offline loader must run from file://, where fetch() of local
 * files and ES-module imports are both blocked. Inlining at build time means the
 * offline build and the hosted build are literally the same artifact.
 *
 *   node scripts/build.mjs
 *
 * Output: dist/index.html  (hosted)  +  dist/surd.html  (the downloadable copy)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (f) => join(root, f);
const read = (f) => readFileSync(join(root, f), 'utf8');

const build = new Date().toISOString().slice(0, 10);
const { games } = JSON.parse(read('data/games.json'));
const cdn = JSON.parse(read('data/cdn.json'));
const { collections } = JSON.parse(read('data/collections.json'));

// Assign each game to a series collection, so one card can stand for a 50-entry mod series.
// A game keeps its own identity — the collection is just how the grid groups it.
/* Two orthogonal axes decide a game's base:
 *   risk  — main library ({A}) vs high-risk tier in its own repo ({X})
 *   size  — jsDelivr hard-403s any file over 20 MB, so those games must come from
 *           raw.githubusercontent instead ({B} for main, {Y} for high-risk)
 * Same repos either way; only the CDN order differs.
 */
const bigSet = new Set(
  existsSync(p('data/big-games.json')) ? JSON.parse(read('data/big-games.json')) : []);
const riskSet = new Set(
  existsSync(p('data/keep-extra.txt'))
    ? read('data/keep-extra.txt').split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean)
    : []);

for (const g of games) {
  const tier = riskSet.has(g.id) ? (bigSet.has(g.id) ? 'Y' : 'X')
                                 : (bigSet.has(g.id) ? 'B' : 'A');
  g.src = String(g.src).replace(/^\{[A-Z]\}/, `{${tier}}`);
}

const cols = collections.map((c) => ({ ...c, re: new RegExp(c.match, 'i'), n: 0 }));
for (const g of games) {
  const hit = cols.find((c) => c.re.test(g.title));
  if (hit) { g.col = hit.id; hit.n++; }
}

// A one-game "series" is just a game — don't make the user click through to it.
const live = cols.filter((c) => c.n > 1);
const liveIds = new Set(live.map((c) => c.id));
for (const g of games) if (g.col && !liveIds.has(g.col)) delete g.col;

// Strip fields the client never reads — keeps the inlined payload small.
// src/cover keep their {A}/{C} placeholders; the client resolves them against cdn bases.
const slim = games.map(({ id, title, tags, src, cover, author, authorLink, col, pick }) =>
  ({ id, title, tags, src, cover, author, authorLink, col, pick }));

const colMeta = live.map((c) => ({ id: c.id, title: c.title, n: c.n }));

const bases = { A: cdn.A, C: cdn.C };

// Conservative CSS squeeze: comments + leading indentation + blank lines only.
const css = read('src/app.css')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]+/gm, '')
  .replace(/\n{2,}/g, '\n')
  .trim();

const html = read('src/index.html')
  .replace('/*STYLE*/', () => css)
  .replace('/*GAMES*/', () =>
    `window.SURD_GAMES=${JSON.stringify(slim)};` +
    `window.SURD_COLS=${JSON.stringify(colMeta)};` +
    `window.SURD_CDN=${JSON.stringify(bases)};` +
    `window.SURD_BUILD=${JSON.stringify(build)};`)
  .replace('/*APP*/', () => read('src/app.js'));

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
writeFileSync(join(root, 'dist/surd.html'), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
const inCols = games.filter((g) => g.col).length;
console.log(`built dist/index.html + dist/surd.html — ${games.length} games, ${kb} KB`);
console.log(`  ${live.length} collections holding ${inCols} games -> grid shows ${games.length - inCols + live.length} cards`);
console.log(`  ${games.filter((g) => g.pick).length} editorial picks`);
