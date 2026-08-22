/** Independent re-validation of every generated starter manifest.
 *  The generator already refuses to write an invalid one; this checks the
 *  files on disk rather than trusting that it did. */
import { diagnoseManifest } from './src/discovery.js';
import { readFileSync, readdirSync } from 'node:fs';
const files = readdirSync('starter').filter(f => f.endsWith('.json'));
let bad = 0;
for (const f of files) {
    const d = diagnoseManifest(JSON.parse(readFileSync('starter/' + f, 'utf8')));
    if (!d.ok) { bad++; if (bad < 4) console.log('  INVALID', f, d.violations.map(v => v.field)); }
}
console.log(`  checked ${files.length} · invalid ${bad}`);
// A validator that cannot fail proves nothing — show it bites.
const control = diagnoseManifest({ x402Version: 2 });
console.log(`  control (manifest missing kind) rejected: ${!control.ok}`);
