/**
 * Run the fixer across every host that serves a manifest, and publish the
 * result so an operator can find their own domain instead of being told
 * "invalid" by a tool they have never heard of.
 *
 * The census says 910 hosts serve a document at /.well-known/x402 and three
 * validate. Knowing that and doing nothing with it is worth very little. This
 * turns the finding into 900-odd specific, checkable diffs.
 *
 * WHAT THIS IS NOT: an outreach list. Nobody is emailed. The report is
 * published where an operator searching for their own hostname can find it,
 * which is the difference between a service and a mailshot.
 *
 * Read-only. One GET per host (plus the fixer's own per-host negative control).
 *
 * Usage:
 *   npx tsx batch.ts <census.json> [--limit N]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { report } from './fix.js';

const CONCURRENCY = 10;

interface Row { host: string; manifest: string }

async function pool<T, R>(items: T[], width: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const queue = [...items];
    const out: R[] = [];
    let done = 0;
    await Promise.all(Array.from({ length: width }, async () => {
        for (; ;) {
            const it = queue.shift();
            if (it === undefined) return;
            try { out.push(await fn(it)); } catch { /* a single host must not end the run */ }
            if (++done % 25 === 0) process.stderr.write(`\r  ${done}/${items.length}   `);
        }
    }));
    process.stderr.write(`\r  ${done}/${items.length}\n`);
    return out;
}

async function main() {
    const censusPath = process.argv[2];
    if (!censusPath) { console.error('usage: npx tsx batch.ts <census.json> [--limit N]'); process.exit(2); }
    const li = process.argv.indexOf('--limit');
    const limit = li >= 0 ? Number(process.argv[li + 1]) : null;

    const census = JSON.parse(readFileSync(censusPath, 'utf8')) as { rows: Row[]; observedAt: string };
    // Only hosts that actually serve something. A host serving nothing has no
    // diff to offer — telling it to "add a field" would be nonsense.
    const serving = census.rows.filter(r => ['one_edit_away', 'core_invalid', 'valid'].includes(r.manifest));
    const hosts = (limit ? serving.slice(0, limit) : serving).map(r => r.host);
    process.stderr.write(`hosts serving a manifest: ${hosts.length}\n`);

    const reports = await pool(hosts, CONCURRENCY, h => report(h));

    // A host can change between the census and this run; report what WE saw.
    const byStatus: Record<string, number> = {};
    for (const r of reports) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

    const fixable = reports.filter(r => r.corrected && r.status !== 'valid');
    const needsHuman = reports.filter(r => r.unresolved.length > 0);

    const artifact = {
        artifact: 'x402-manifest-fix-report',
        version: '0.1.0',
        observedAt: new Date().toISOString(),
        censusObservedAt: census.observedAt,
        method: 'one GET of /.well-known/x402 per host, plus a per-host negative control; read-only, no payments',
        notEvaluated: [
            'whether the host would settle a payment',
            'whether the inferred `kind` is what the operator intends — it is labelled, never assumed correct',
            'hosts that serve nothing at the well-known path',
        ],
        summary: {
            hostsChecked: reports.length,
            byStatus,
            mechanicallyFixable: fixable.length,
            needAHumanDecision: needsHuman.length,
        },
        results: reports.map(r => ({
            host: r.domain,
            status: r.status,
            violations: r.violations,
            inferences: r.inferences,
            unresolved: r.unresolved,
            txtRecord: r.txtRecord,
        })),
    };

    mkdirSync('report', { recursive: true });
    writeFileSync('report/fix-report.json', JSON.stringify(artifact, null, 2) + '\n');

    // Human-readable index: an operator should be able to search this file for
    // their own hostname and read one line.
    const L: string[] = [];
    L.push('# What each host needs to change\n');
    L.push(`Generated ${artifact.observedAt} from a census of ${artifact.summary.hostsChecked} hosts serving \`/.well-known/x402\`.\n`);
    L.push('Search this file for your hostname. Every entry is one HTTPS GET of your own');
    L.push('public manifest — nothing was paid for, nothing was written, nobody was emailed.\n');
    L.push(`- **${byStatus['one-edit-away'] ?? 0}** hosts fail only on fields the discovery extension introduced.`);
    L.push(`- **${byStatus['needs-work'] ?? 0}** hosts also fail a rule that predates it.`);
    L.push(`- **${byStatus['valid'] ?? 0}** hosts validate as they stand.\n`);
    L.push('Inferred values are marked. A tool cannot know whether you are a facilitator');
    L.push('or a resource server; where your own document implies it, the value is filled');
    L.push('in and labelled, and where it implies nothing the entry says so instead of guessing.\n');
    L.push('| host | status | needs |');
    L.push('|---|---|---|');
    for (const r of reports.sort((a, b) => a.domain.localeCompare(b.domain))) {
        if (r.status === 'valid') { L.push(`| \`${r.domain}\` | valid | — |`); continue; }
        const needs = r.violations.map(v => `\`${v.field}\``).join(', ') || '—';
        const inf = r.inferences.map(i => `${i.field}=\`${JSON.stringify(i.value)}\``).join(', ');
        L.push(`| \`${r.domain}\` | ${r.status} | ${needs}${inf ? ` (suggested: ${inf})` : ''} |`);
    }
    writeFileSync('report/README.md', L.join('\n') + '\n');

    console.log(`\nchecked ${reports.length}`);
    console.log(`  ${JSON.stringify(byStatus)}`);
    console.log(`  mechanically fixable : ${fixable.length}`);
    console.log(`  need a human decision: ${needsHuman.length}`);
    console.log('written: report/fix-report.json, report/README.md');
}

main().catch(e => { console.error(e); process.exit(1); });
