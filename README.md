# x402 manifest fixer

Tell one host exactly what to change.

```bash
npx tsx fix.ts api.example.com
```

## Why this exists

A [census of the Bazaar catalog][census] on 2026-08-22 found **910 hosts**
serving a document at `/.well-known/x402` and **three** that validate.

**426 of them fail on one field.**

That population does not need a linter that says *invalid*. It needs the diff.
So this prints two things: what is wrong, and the document that would be right.

[census]: https://github.com/whawk46/x402-discovery-checks

## What it looks like

```
  https://fieldpulse.theaslangroupllc.com/.well-known/x402
  ONE EDIT AWAY — it fails only on fields the discovery extension introduced.

  What is wrong:
    - kind: missing kind — REQUIRED by this extension; add "facilitator",
      "resource-server" or "both"  [discovery extension]

  Filled in from the document itself — CHECK THESE:
    - kind = "resource-server"  (the document carries a non-empty resources array)

  A manifest that validates:
    { ...your document, with the field added... }

  And the DNS record, at _x402.fieldpulse.theaslangroupllc.com (TXT):
    v=x402-1; wk=https://fieldpulse.theaslangroupllc.com/.well-known/x402; k=resource-server
```

Every violation is labelled with **who introduced the requirement** — the
discovery extension, or x402 itself. A host failing only on the former was a
valid x402 manifest before this extension existed and is one mechanical edit
from valid after it. Reporting those identically to a real structural problem
is what makes adoption look like a wall instead of an afternoon. That
distinction exists because [@melchiorreoliva][mo] pointed out on
[#2979][2979] that a first-throw validator teaches an operator one field per
debugging round-trip.

[mo]: https://github.com/x402-foundation/x402/pull/2979
[2979]: https://github.com/x402-foundation/x402/pull/2979

## What it will not do

**Invent a value it cannot know.** `kind` is the field those 426 hosts are
missing, and whether a service is a facilitator or a resource server is not
something a fetch can decide.

Where the document's own shape implies it, the value is filled in and the
inference is **labelled** so you can check it. Where nothing implies it, the
output says so and stops:

```
  You have to decide these — this tool will not guess:
    - kind: the document describes neither a facilitator block nor any
      resources, so nothing in it says which this service is. Set it by hand —
      this tool will not guess, because a wrong value validates and misleads.
```

A fixer that quietly guesses produces a manifest that is valid and false, which
is worse than one that is honestly broken.

## What it does to your host

One HTTPS GET of `/.well-known/x402`. Read-only. No payments, no writes,
nothing reported anywhere. It does not follow redirects off-origin.

## The checks

`src/discovery.ts` is vendored — zero imports, no dependency on anything we
publish. It is the same resolver behind
[`@flareclaw/x402-trust`](https://www.npmjs.com/package/@flareclaw/x402-trust)
and the [discovery census][census], and it implements
[`draft-hawkins-x402-dns-discovery`][draft]. The `_x402` underscored node name
was registered with IANA on 2026-08-11.

[draft]: https://datatracker.ietf.org/doc/draft-hawkins-x402-dns-discovery/

MIT. Take it, fork it, wire it into your own tooling.
