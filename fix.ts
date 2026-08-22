/**
 * x402-manifest-fixer — tell one host exactly what to change.
 *
 * A census of the Bazaar catalog on 2026-08-22 found 910 hosts serving a
 * document at /.well-known/x402 and THREE that validate. 426 of them fail on
 * one field. That population does not need a linter that says "invalid"; it
 * needs the diff.
 *
 * So this prints two things and nothing else worth reading: what is wrong, and
 * the document that would be right.
 *
 * WHAT IT WILL NOT DO: invent a value it cannot know. `kind` is the field 426
 * hosts are missing, and whether a service is a facilitator or a resource
 * server is not something a fetch can decide. Where it can be inferred from
 * the document's own shape it is, and the inference is LABELLED. Where it
 * cannot, the output says so instead of guessing, because a fixer that quietly
 * guesses wrong produces a valid manifest that lies.
 *
 * Read-only. One GET. No payments, no writes, nothing sent anywhere.
 *
 * Usage:
 *   npx tsx fix.ts <domain> [--json]
 *   npx tsx fix.ts api.example.com
 */
import { diagnoseManifest, isOneEditAway, buildX402TxtRecord, type ManifestViolation } from './src/discovery.js';

const TIMEOUT_MS = 10_000;

interface Report {
    domain: string;
    manifestUrl: string;
    status: 'valid' | 'one-edit-away' | 'needs-work' | 'absent' | 'not-json' | 'unreachable';
    violations: ManifestViolation[];
    /** Fields we filled in, and on what basis. Never silently applied. */
    inferences: { field: string; value: unknown; basis: string }[];
    /** Fields a human must decide. */
    unresolved: { field: string; why: string }[];
    corrected?: unknown;
    txtRecord?: string;
}

async function fetchManifest(url: string) {
    let res: Response;
    try {
        res = await fetch(url, {
            redirect: 'manual',
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch { return { ok: false as const, status: 'unreachable' as const }; }
    if (res.status === 404 || res.status === 410) return { ok: false as const, status: 'absent' as const };
    if (!res.ok) return { ok: false as const, status: res.status >= 500 ? 'unreachable' as const : 'absent' as const };
    try { return { ok: true as const, body: await res.json() as Record<string, any> }; }
    catch { return { ok: false as const, status: 'not-json' as const }; }
}

/**
 * Fill what the document itself implies, and be explicit that it is an
 * inference. The rules are deliberately narrow: a facilitator block means the
 * author already described a facilitator, a resources array means they already
 * described resources. Anything ambiguous is left for a human.
 */
function inferKind(m: Record<string, any>): { value: string; basis: string } | null {
    const hasFac = m.facilitator && typeof m.facilitator === 'object';
    const hasRes = Array.isArray(m.resources) && m.resources.length > 0;
    if (hasFac && hasRes) return { value: 'both', basis: 'the document carries a facilitator block AND a non-empty resources array' };
    if (hasFac) return { value: 'facilitator', basis: 'the document carries a facilitator block' };
    if (hasRes) return { value: 'resource-server', basis: 'the document carries a non-empty resources array' };
    return null;
}

export async function report(domain: string): Promise<Report> {
    const manifestUrl = `https://${domain}/.well-known/x402`;
    const base: Report = { domain, manifestUrl, status: 'absent', violations: [], inferences: [], unresolved: [] };

    const got = await fetchManifest(manifestUrl);
    if (!got.ok) return { ...base, status: got.status };

    const m = got.body;
    const d = diagnoseManifest(m);
    if (d.ok) {
        return {
            ...base, status: 'valid', violations: [],
            txtRecord: buildX402TxtRecord({ manifestUrl, kind: (m as any).kind }),
        };
    }

    const corrected: Record<string, any> = { ...m };
    const inferences: Report['inferences'] = [];
    const unresolved: Report['unresolved'] = [];

    if (typeof m.x402Version !== 'number') {
        // The only value any deployed manifest could mean today.
        corrected.x402Version = 2;
        inferences.push({ field: 'x402Version', value: 2, basis: 'x402 v2 is the current protocol version; confirm before publishing' });
    }
    if (!['facilitator', 'resource-server', 'both'].includes(m.kind)) {
        const k = inferKind(m);
        if (k) { corrected.kind = k.value; inferences.push({ field: 'kind', value: k.value, basis: k.basis }); }
        else {
            unresolved.push({
                field: 'kind',
                why: 'the document describes neither a facilitator block nor any resources, so nothing in it says which this service is. '
                    + 'Set "facilitator", "resource-server", or "both" by hand — this tool will not guess, because a wrong value validates and misleads.',
            });
        }
    }

    // Anything left after the fills is a real decision, not a formality.
    const after = diagnoseManifest(corrected);
    for (const v of after.violations) {
        if (!unresolved.some(u => u.field === v.field)) {
            unresolved.push({ field: v.field, why: v.message });
        }
    }

    return {
        ...base,
        status: isOneEditAway(m) ? 'one-edit-away' : 'needs-work',
        violations: d.violations,
        inferences, unresolved,
        corrected: after.ok ? corrected : undefined,
        txtRecord: buildX402TxtRecord({ manifestUrl, ...(corrected.kind ? { kind: corrected.kind } : {}) }),
    };
}

function render(r: Report): string {
    const L: string[] = [];
    L.push(`\n  ${r.manifestUrl}`);
    const headline: Record<Report['status'], string> = {
        'valid': 'VALID — nothing to change.',
        'one-edit-away': 'ONE EDIT AWAY — it fails only on fields the discovery extension introduced.',
        'needs-work': 'NEEDS WORK — it fails a rule that predates the discovery extension.',
        'absent': 'NOTHING SERVED at this path.',
        'not-json': 'SERVED, but it is not JSON.',
        'unreachable': 'UNREACHABLE (timeout, TLS, or 5xx).',
    };
    L.push(`  ${headline[r.status]}\n`);

    if (r.violations.length) {
        L.push('  What is wrong:');
        for (const v of r.violations) {
            const who = v.introducedBy === 'x402-discovery' ? 'discovery extension' : 'x402 core';
            L.push(`    - ${v.field}: ${v.message}  [${who}]`);
        }
        L.push('');
    }
    if (r.inferences.length) {
        L.push('  Filled in from the document itself — CHECK THESE:');
        for (const i of r.inferences) L.push(`    - ${i.field} = ${JSON.stringify(i.value)}  (${i.basis})`);
        L.push('');
    }
    if (r.unresolved.length) {
        L.push('  You have to decide these — this tool will not guess:');
        for (const u of r.unresolved) L.push(`    - ${u.field}: ${u.why}`);
        L.push('');
    }
    if (r.corrected) {
        L.push('  A manifest that validates:');
        L.push(JSON.stringify(r.corrected, null, 2).split('\n').map(l => '    ' + l).join('\n'));
        L.push('');
    }
    if (r.txtRecord) {
        L.push(`  And the DNS record, at _x402.${r.domain} (TXT):`);
        L.push(`    ${r.txtRecord}\n`);
    }
    return L.join('\n');
}

const argv = process.argv.slice(2);
const domain = argv.find(a => !a.startsWith('--'));
if (!domain) {
    console.error('usage: npx tsx fix.ts <domain> [--json]');
    process.exit(2);
}
const r = await report(domain.replace(/^https?:\/\//, '').replace(/\/.*$/, ''));
console.log(argv.includes('--json') ? JSON.stringify(r, null, 2) : render(r));
