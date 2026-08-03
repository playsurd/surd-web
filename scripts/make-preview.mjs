/* Build a self-contained preview into Shared/ that shows the site WITH cover art.
 *
 *   node scripts/make-preview.mjs
 *
 * The real build points covers at a CDN that isn't published yet, so the live preview
 * shows fallback tiles everywhere. This variant repoints {C} at a local covers folder
 * copied alongside it, so the grid and hero look the way they will once assets ship.
 * Games still won't launch here — only the artwork is local.
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (f) => join(root, f);
const OUT = '/home/adam/Shared/surd-look';

if (!existsSync(p('dist/index.html'))) {
  console.error('build first: node scripts/build.mjs');
  process.exit(1);
}

let html = readFileSync(p('dist/index.html'), 'utf8');

const m = html.match(/window\.SURD_CDN=(\{.*?\});/s);
if (!m) { console.error('could not find SURD_CDN in the build'); process.exit(1); }
const cdn = JSON.parse(m[1]);
cdn.C = ['covers'];                       // relative to this file
html = html.replace(m[0], `window.SURD_CDN=${JSON.stringify(cdn)};`);

// Make it obvious this is a look-and-feel preview, not the working site.
html = html.replace('<title>Surd</title>', '<title>Surd — preview (art only)</title>');
// Append the notice; do NOT rewrite the footer — removing elements the app expects
// used to throw and kill every script on the page.
html = html.replace('<span id="foot-count"></span>',
  '<span id="foot-count"></span>' +
  '<span style="color:#c2f04a">preview build — covers local, games do not launch here</span>');

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index.html'), html);
if (existsSync(p('mirror/_covers'))) {
  cpSync(p('mirror/_covers'), join(OUT, 'covers'), { recursive: true });
}

const n = (html.match(/"id":/g) || []).length;
console.log(`wrote ${OUT}/index.html (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, ${n} games)`);
console.log('covers copied — open Shared/surd-look/index.html');
