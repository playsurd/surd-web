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
const site = existsSync(p('data/site.json')) ? JSON.parse(read('data/site.json')) : {};

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

/* Point each cover at the file that actually exists.
 * The manifest was written with ".png" while mirror-covers --webp produces ".webp",
 * so every cover 404'd. Never assume an extension we can just look up.
 */
let coverFixed = 0, coverMissing = 0;
for (const g of games) {
  const webp = p(join('mirror', '_covers', g.id + '.webp'));
  const png = p(join('mirror', '_covers', g.id + '.png'));
  if (existsSync(webp)) {
    if (!/\.webp$/.test(g.cover)) coverFixed++;
    g.cover = '{C}/' + g.id + '.webp';
  } else if (existsSync(png)) {
    g.cover = '{C}/' + g.id + '.png';
  } else {
    coverMissing++;
  }
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
const slim = games.map(({ id, title, tags, src, cover, author, authorLink, porter, col, pick, hero }) =>
  ({ id, title, tags, src, cover, author, authorLink, porter, col, pick, hero }));

const colMeta = live.map((c) => ({ id: c.id, title: c.title, n: c.n }));

// Every tier must reach the client: A/B/X/Y/C/R. Emitting only A and C left {B}, {X}
// and {Y} games resolving against an empty base — i.e. every big or high-risk game broken.
const bases = {};
for (const k of Object.keys(cdn)) if (/^[A-Z]$/.test(k)) bases[k] = cdn[k];

// Conservative CSS squeeze: comments + leading indentation + blank lines only.
const css = read('src/app.css')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]+/gm, '')
  .replace(/\n{2,}/g, '\n')
  .trim();

/* Strip comments from the shipped JS.
 * Source keeps its comments; the artifact doesn't. Regex alone is unsafe here — "//"
 * appears inside URLs, strings and template literals — so walk the source tracking
 * string / template / regex-literal state and only drop comments found in code.
 */
function stripJsComments(src) {
  let out = '', i = 0;
  const n = src.length;
  let quote = null, tpl = 0, inRe = false;
  const prevSignificant = () => {
    for (let k = out.length - 1; k >= 0; k--) {
      const c = out[k];
      if (c !== ' ' && c !== '\n' && c !== '\t' && c !== '\r') return c;
    }
    return '';
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++; continue;
    }
    if (tpl) {
      out += c;
      if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; }
      if (c === '`') tpl--;
      i++; continue;
    }
    if (inRe) {
      out += c;
      if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; }
      if (c === '/') inRe = false;
      i++; continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; i++; continue; }
    if (c === '`') { tpl++; out += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '/') {
      // a regex literal can only follow an operator or opening bracket, never a value
      const p = prevSignificant();
      if (p === '' || '(,=:[!&|?{};+-*%~^<>'.indexOf(p) >= 0) inRe = true;
      out += c; i++; continue;
    }
    out += c; i++;
  }
  return out.split('\n').map((l) => l.replace(/[ \t]+$/, '')).filter((l) => l.trim()).join('\n');
}

const html = read('src/index.html')
  .replace('/*STYLE*/', () => css)
  .replace('/*GAMES*/', () =>
    `window.SURD_GAMES=${JSON.stringify(slim)};` +
    `window.SURD_COLS=${JSON.stringify(colMeta)};` +
    `window.SURD_CDN=${JSON.stringify(bases)};` +
    `window.SURD_SITE=${JSON.stringify({ contact: site.contact || '', discord: site.discord || '', github: site.github || '', tagline: site.tagline || '' })};` +
    `window.SURD_BUILD=${JSON.stringify(build)};`)
  .replace('/*APP*/', () => stripJsComments(read('src/app.js')))
  .replace(/<!--[\s\S]*?-->/g, '');

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
writeFileSync(join(root, 'dist/surd.html'), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
const inCols = games.filter((g) => g.col).length;
console.log(`built dist/index.html + dist/surd.html — ${games.length} games, ${kb} KB`);
console.log(`  ${live.length} collections holding ${inCols} games -> grid shows ${games.length - inCols + live.length} cards`);
console.log(`  ${games.filter((g) => g.pick).length} editorial picks, ${games.filter((g) => g.hero).length} heroes`);
console.log(`  covers: ${coverFixed} extensions corrected, ${coverMissing} missing`);
