/**
 * init — generate a starter manifest for a host that publishes nothing.
 *
 * The fixer helps the 910 hosts that already serve a document. A further 654
 * are listed in the public catalogue as x402 participants and serve NOTHING at
 * `/.well-known/x402`. They cannot be handed a diff, because there is nothing
 * to diff against. They need a first draft.
 *
 * NOTHING HERE IS INVENTED. Every field is assembled from the operator's own
 * catalogue entry — their resource URLs, their descriptions, their declared
 * x402Version. The generator reorganises data they already published into the
 * shape the discovery extension specifies; it does not learn anything about
 * them that was not already public, and it does not contact their host at all
 * unless you ask it to check.
 *
 * What it will NOT do, for the same reason the fixer will not:
 *   - invent a facilitator block. Listing resources makes you a resource
 *     server; nothing in a catalogue entry says you run a facilitator.
 *   - invent a `name`. It defaults to the hostname and says so, because a
 *     generated display name is a lie the operator then has to notice.
 *
 * Usage:
 *   npx tsx init.ts <host> [--check]      # --check: confirm they serve nothing first
 *   npx tsx init.ts --all <census.json>   # every host in the census serving nothing
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { buildX402TxtRecord, diagnoseManifest } from './src/discovery.js';

const BAZAAR = 'https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources';
const PAGE = 100;
const CACHE = 'bazaar-cache.json';

interface Listing {
    resource: string;
    description?: string;
    x402Version?: number;
    type?: string;
    accepts?: { scheme?: string; network?: string; asset?: string }[];
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** One fetch of the whole catalogue, cached — 152 pages is rude to repeat. */
async function catalogue(): Promise<Listing[]> {
    if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, 'utf8'));
    const all: Listing[] = [];
    let offset = 0, total = 0, pages = 0;
    for (; ;) {
        const res = await fetch(`${BAZAAR}?limit=${PAGE}&offset=${offset}`, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`bazaar ${res.status}`);
        const page = await res.json() as { items?: Listing[]; pagination?: { total?: number } };
        const items = page.items ?? [];
        total = page.pagination?.total ?? total;
        all.push(...items);
        offset += items.length; pages++;
        process.stderr.write(`\r  catalogue: ${all.length}${total ? '/' + total : ''}   `);
        if (items.length === 0) break;                 // short page is NOT the end
        if (total && offset >= total) break;
        if (pages > 500) throw new Error('pagination runaway');
        await sleep(120);
    }
    process.stderr.write('\n');
    writeFileSync(CACHE, JSON.stringify(all));
    return all;
}

const hostOf = (u: string): string | null => {
    try { return new URL(u).hostname.toLowerCase(); } catch { return null; }
};

export function manifestFor(host: string, listings: Listing[]) {
    const mine = listings.filter(l => hostOf(l.resource) === host);
    if (mine.length === 0) return null;

    // Their own declared version, when they agree with themselves.
    const versions = [...new Set(mine.map(l => l.x402Version).filter(v => typeof v === 'number'))];
    const x402Version = versions.length === 1 ? versions[0]! : 2;

    const manifest: Record<string, unknown> = {
        x402Version,
        kind: 'resource-server',
        name: host,
        resources: mine.map(l => ({
            url: l.resource,
            ...(l.description ? { description: l.description } : {}),
        })),
    };

    const notes = [
        `resources[] assembled from ${mine.length} entr${mine.length === 1 ? 'y' : 'ies'} you already publish in the public catalogue`,
        versions.length === 1
            ? `x402Version ${x402Version} taken from your own catalogue entries`
            : `x402Version defaulted to 2 — your catalogue entries disagree (${versions.join(', ') || 'none declared'}), so confirm this`,
        'kind is "resource-server" because you list resources; nothing in a catalogue entry says whether you also run a facilitator, so no facilitator block is generated',
        `name defaults to the hostname — set a real display name, this one is a placeholder`,
    ];
    return { manifest, notes, count: mine.length };
}

async function servesNothing(host: string): Promise<boolean> {
    try {
        const r = await fetch(`https://${host}/.well-known/x402`, {
            redirect: 'manual', signal: AbortSignal.timeout(9000),
        });
        return r.status === 404 || r.status === 410;
    } catch { return false; }   // unreachable is not "serves nothing"
}

async function main() {
    const args = process.argv.slice(2);
    const listings = await catalogue();

    if (args[0] === '--all') {
        const censusPath = args[1];
        if (!censusPath) { console.error('usage: npx tsx init.ts --all <census.json>'); process.exit(2); }
        const census = JSON.parse(readFileSync(censusPath, 'utf8')) as { rows: { host: string; manifest: string }[] };
        // The census keeps only rows with something to say, so hosts serving
        // nothing AND publishing no record are absent from it by design.
        // Derive them from the catalogue instead, minus everyone the census saw.
        const seen = new Set(census.rows.map(r => r.host));
        const allHosts = [...new Set(listings.map(l => hostOf(l.resource)).filter((h): h is string => !!h))];
        const candidates = allHosts.filter(h => !seen.has(h));
        process.stderr.write(`hosts with no manifest and no record: ${candidates.length}\n`);

        mkdirSync('starter', { recursive: true });
        const index: string[] = [];
        index.push('# Starter manifests\n');
        index.push('For hosts listed in the public x402 catalogue that serve **nothing** at');
        index.push('`/.well-known/x402`. Each file is assembled from that host\'s own catalogue');
        index.push('entries — resource URLs, descriptions and declared version. Nothing is');
        index.push('invented and no host was contacted to build these.\n');
        index.push('Find your hostname, drop the JSON at `/.well-known/x402`, then publish the');
        index.push('TXT record printed alongside it. Read the notes first — `name` is a');
        index.push('placeholder and `kind` is an inference from the fact that you list resources.\n');
        index.push('| host | resources | starter |');
        index.push('|---|---|---|');

        let written = 0;
        for (const host of candidates.sort()) {
            const built = manifestFor(host, listings);
            if (!built) continue;
            const txt = buildX402TxtRecord({ manifestUrl: `https://${host}/.well-known/x402`, kind: 'resource-server' });
            const d = diagnoseManifest(built.manifest);
            // Refuse to publish a starter that does not itself validate — the
            // one thing this tool must never do is hand someone a broken file.
            if (!d.ok) { process.stderr.write(`  SKIP ${host}: generated manifest fails ${d.violations.map(v => v.field).join(',')}\n`); continue; }
            const safe = host.replace(/[^a-z0-9.-]/gi, '_');
            writeFileSync(`starter/${safe}.json`, JSON.stringify(built.manifest, null, 2) + '\n');
            index.push(`| \`${host}\` | ${built.count} | [\`starter/${safe}.json\`](starter/${safe}.json) |`);
            written++;
        }
        index.push(`\n**${written} starter manifests generated.** DNS record for each, substituting your host:\n`);
        index.push('```');
        index.push('_x402.<your-host>  TXT  "v=x402-1; wk=https://<your-host>/.well-known/x402; k=resource-server"');
        index.push('```');
        writeFileSync('starter/README.md', index.join('\n') + '\n');
        console.log(`\ngenerated ${written} starter manifests -> starter/`);
        return;
    }

    const host = args.find(a => !a.startsWith('--'));
    if (!host) { console.error('usage: npx tsx init.ts <host> [--check]'); process.exit(2); }
    if (args.includes('--check') && !(await servesNothing(host))) {
        console.error(`${host} already serves something at /.well-known/x402 — use fix.ts instead`);
        process.exit(1);
    }
    const built = manifestFor(host, listings);
    if (!built) { console.error(`${host} has no entries in the public catalogue — nothing to build from`); process.exit(1); }

    console.log(`\n  A manifest for ${host}, built from your own catalogue entries:\n`);
    console.log(JSON.stringify(built.manifest, null, 2).split('\n').map(l => '    ' + l).join('\n'));
    console.log('\n  Notes — read these before publishing:');
    for (const n of built.notes) console.log(`    - ${n}`);
    console.log(`\n  Then the DNS record, at _x402.${host} (TXT):`);
    console.log(`    ${buildX402TxtRecord({ manifestUrl: `https://${host}/.well-known/x402`, kind: 'resource-server' })}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
