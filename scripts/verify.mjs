/* surd verify — HEAD-checks every game src and cover, and stamps `verified`.
 *
 *   node scripts/verify.mjs         # report only
 *   node scripts/verify.mjs --write # also update data/games.json
 *
 * Curation is the moat: a dead game must get pruned, not quietly linger.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'data/games.json');
const doc = JSON.parse(readFileSync(file, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const write = process.argv.includes('--write');

async function ok(url) {
  if (!url) return true;
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    // Some hosts reject HEAD; fall back to a ranged GET before calling it dead.
    if (r.status === 405 || r.status === 501) {
      const g = await fetch(url, { headers: { Range: 'bytes=0-0' } });
      return g.ok || g.status === 206;
    }
    return r.ok;
  } catch {
    return false;
  }
}

const limit = 8;
const queue = [...doc.games];
const dead = [];

async function worker() {
  while (queue.length) {
    const g = queue.shift();
    const [srcOk, coverOk] = await Promise.all([ok(g.src), ok(g.cover)]);
    if (srcOk) g.verified = today;
    else dead.push(g.id);
    if (!coverOk) console.warn(`  cover missing: ${g.id}`);
  }
}

await Promise.all(Array.from({ length: limit }, worker));

if (dead.length) {
  console.log(`\n${dead.length} dead game(s): ${dead.join(', ')}`);
  console.log('Prune them from data/games.json.');
} else {
  console.log(`\nAll ${doc.games.length} games reachable.`);
}

if (write) {
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
  console.log('data/games.json updated.');
}
