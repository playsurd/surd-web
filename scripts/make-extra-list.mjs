/* Build data/keep-extra.txt — the two tiers held back from the first mirror pass:
 *   1. games rejected by the size cap
 *   2. paid-storefront titles (Steam / Nintendo / Sega / …)
 *
 * Staged locally for testing only. Publishing these is a separate decision.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (f) => join(root, f);

const PAID_HOSTS = [
  'store.steampowered.com', 'nintendo.com', 'sega.com', 'valvesoftware.com',
  'idsoftware.com', 'scottgames.com', 'joeydrewstudios.com', 'grannyhorror.com',
  'apps.apple.com', 'epicgames.com', 'gog.com', 'xbox.com', 'playstation.com',
];
const ROM_TAGS = ['emulator', 'n64', 'gba', 'nds', 'nes', 'psx'];
const UPSTREAM = /gn-?math|genizy/i;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

const all = JSON.parse(readFileSync(p('data/catalogue.full.json'), 'utf8'));
const report = JSON.parse(readFileSync(p('data/mirror-report.json'), 'utf8'));

const oversize = report.failed
  .filter((f) => /too large/.test(f.reason))
  .map((f) => ({ id: f.id, why: f.reason }));

const paid = all
  .filter((g) => PAID_HOSTS.includes(host(g.authorLink)))
  .filter((g) => !g.tags.some((t) => ROM_TAGS.includes(t)))   // still no ROMs
  .filter((g) => !UPSTREAM.test(g.author || '') && !UPSTREAM.test(g.title))
  .map((g) => ({ id: g.id, why: 'paid: ' + host(g.authorLink) }));

const seen = new Set();
const rows = [...oversize, ...paid].filter((r) => !seen.has(r.id) && seen.add(r.id));

writeFileSync(p('data/keep-extra.txt'),
  ['# oversized + paid-storefront tier — staged for testing, NOT cleared for publishing', '',
    ...rows.map((r) => `${r.id}\t# ${r.why}`)].join('\n') + '\n');

console.log(`oversized: ${oversize.length}`);
console.log(`paid:      ${paid.length}`);
console.log(`total:     ${rows.length} -> data/keep-extra.txt`);
