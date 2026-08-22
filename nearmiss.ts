/**
 * The near-miss publishers: people who chose `_x402` and a different grammar.
 *
 * These five are the most interesting hosts in the catalogue. Nobody told them
 * to publish at `_x402` — the draft was not widely read and the node name was
 * only registered with IANA on 2026-08-11 — and they did it anyway, in three
 * mutually incompatible syntaxes, every one pointing at its own domain.
 *
 * Two of them publish at the APEX with the target on a service subdomain, which
 * is the arrangement that made a naive census record the draft's own author as
 * a non-publisher. They arrived independently at the layout the specification
 * had to be fixed to describe.
 *
 * This produces, per host: what they publish now, what a conformant record
 * would be, and exactly which tokens differ. It is published rather than
 * mailed. If someone wants to converge, the diff is here; if they prefer their
 * own syntax, that is a legitimate answer and the point stands that the name is
 * being used faster than it is being specified.
 *
 * Usage: npx tsx nearmiss.ts > near-miss/README.md
 */
import { Resolver } from 'node:dns/promises';
import { diagnoseX402TxtRecord, buildX402TxtRecord, parseX402TxtRecord } from './src/discovery.js';
import { report } from './fix.js';

/** owner name where the record lives -> the host it points at */
const OBSERVED: { owner: string; serviceHost: string }[] = [
    { owner: 'api.telemost.io', serviceHost: 'api.telemost.io' },
    { owner: 'tablint.dev', serviceHost: 'tablint.dev' },
    { owner: 'vibesprings.net', serviceHost: 'vibesprings.net' },
    { owner: 'auor.io', serviceHost: 'api.auor.io' },
    { owner: 'naiko.io', serviceHost: 'x402.naiko.io' },
];

const resolver = new Resolver({ timeout: 4000, tries: 2 });
resolver.setServers(['1.1.1.1', '8.8.8.8']);

/** Which tokens actually differ, stated as tokens rather than as a diff blob. */
function tokenDelta(current: string, target: string): string[] {
    const notes: string[] = [];
    const cur = new Map<string, string>();
    for (const part of current.split(';')) {
        const eq = part.indexOf('=');
        if (eq > -1) cur.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
    }
    if (!current.includes('=')) return ['the record is a bare URL; the grammar is `v=x402-1; wk=<url>`'];
    const v = cur.get('v');
    if (v && v !== 'x402-1') notes.push(`\`v=${v}\` → \`v=x402-1\``);
    if (!v) notes.push('no `v=` token; a version is required');
    for (const k of ['url', 'manifest', 'x402-manifest', 'href', 'uri']) {
        if (cur.has(k)) notes.push(`\`${k}=\` → \`wk=\``);
    }
    if (!cur.has('wk') && !notes.some(n => n.includes('wk='))) notes.push('no manifest URL under `wk=`');
    return notes;
}

async function main() {
    const L: string[] = [];
    L.push('# The five who already chose `_x402`\n');
    L.push('Observed ' + new Date().toISOString() + '. Read-only: one DNS TXT query and one HTTPS GET per host.\n');
    L.push('In a survey of 1,609 catalogued hosts, **one** publishes a conformant `_x402`');
    L.push('record and **five** publish something else at the same name, in three');
    L.push('mutually incompatible syntaxes. Nobody told them to use `_x402` — the node');
    L.push('name was only registered with IANA on 2026-08-11.\n');
    L.push('**Every one points at its own domain.** Zero records anywhere in the catalogue');
    L.push('point off-domain, so this is convergence rather than squatting. The risk to the');
    L.push('name is fragmentation: several people spelling it differently while every');
    L.push('implementation silently skips the ones it does not recognise.\n');
    L.push('Two of these publish at the **apex** with the target on a service subdomain —');
    L.push('the arrangement that made a naive census record the draft\'s own author as a');
    L.push('non-publisher, and which the specification had to be revised to describe.\n');
    L.push('Nobody here was emailed. If you own one of these and want to converge, the');
    L.push('exact record is below. If you prefer your own syntax that is a legitimate');
    L.push('answer, and the point stands either way.\n');
    L.push('---\n');

    for (const { owner, serviceHost } of OBSERVED) {
        let current = '';
        try {
            const recs = await resolver.resolveTxt(`_x402.${owner}`);
            current = recs.map(r => r.join('')).find(t => !/^v=spf1|google-site-verification/.test(t)) ?? '';
        } catch { /* leave blank */ }
        if (!current) { L.push(`## \`${owner}\`\n\nNo record resolved at observation time.\n`); continue; }

        const diag = diagnoseX402TxtRecord(current);
        const r = await report(serviceHost);
        const manifestUrl = `https://${serviceHost}/.well-known/x402`;
        const kind = r.inferences.find(i => i.field === 'kind')?.value as string | undefined;
        const target = buildX402TxtRecord({ manifestUrl, ...(kind ? { kind: kind as any } : {}) });

        L.push(`## \`${owner}\`\n`);
        L.push('```');
        L.push(`now:    _x402.${owner}  TXT  "${current}"`);
        L.push(`target: _x402.${owner}  TXT  "${target}"`);
        L.push('```\n');
        L.push(`Diagnosis: **${diag.kind}**` + (owner !== serviceHost ? ` · record at the apex, service on \`${serviceHost}\`` : '') + '\n');
        const delta = tokenDelta(current, target);
        if (delta.length) { L.push('What differs:\n'); for (const d of delta) L.push(`- ${d}`); L.push(''); }
        L.push(`Manifest at \`${manifestUrl}\`: **${r.status}**` + (r.violations.length ? ` (missing ${r.violations.map(v => '`' + v.field + '`').join(', ')})` : '') + '\n');
        if (r.unresolved.length) {
            L.push('Needs a decision only its operator can make:\n');
            for (const u of r.unresolved) L.push(`- \`${u.field}\` — ${u.why}`);
            L.push('');
        } else if (kind) {
            L.push(`\`kind\` inferred as \`${kind}\` from the document's own shape — check it before publishing.\n`);
        }
        // Honesty: our parser refuses all of these today.
        L.push(`A conformant resolver skips this record today (\`parseX402TxtRecord\` returns ${JSON.stringify(parseX402TxtRecord(current))}), which is why the diagnosis exists at all.\n`);
    }
    console.log(L.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
