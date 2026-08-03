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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const build = new Date().toISOString().slice(0, 10);
const { games } = JSON.parse(read('data/games.json'));

// Strip fields the client never reads — keeps the inlined payload small.
const slim = games.map(({ id, title, tags, src, cover }) => ({ id, title, tags, src, cover }));

// Conservative CSS squeeze: comments + leading indentation + blank lines only.
const css = read('src/app.css')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]+/gm, '')
  .replace(/\n{2,}/g, '\n')
  .trim();

const html = read('src/index.html')
  .replace('/*STYLE*/', () => css)
  .replace('/*GAMES*/', () => `window.SURD_GAMES=${JSON.stringify(slim)};window.SURD_BUILD=${JSON.stringify(build)};`)
  .replace('/*APP*/', () => read('src/app.js'));

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
writeFileSync(join(root, 'dist/surd.html'), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`built dist/index.html + dist/surd.html — ${games.length} games, ${kb} KB`);
