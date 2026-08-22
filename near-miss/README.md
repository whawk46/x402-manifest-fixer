# The five who already chose `_x402`

Observed 2026-08-22T22:26:18.923Z. Read-only: one DNS TXT query and one HTTPS GET per host.

In a survey of 1,609 catalogued hosts, **one** publishes a conformant `_x402`
record and **five** publish something else at the same name, in three
mutually incompatible syntaxes. Nobody told them to use `_x402` — the node
name was only registered with IANA on 2026-08-11.

**Every one points at its own domain.** Zero records anywhere in the catalogue
point off-domain, so this is convergence rather than squatting. The risk to the
name is fragmentation: several people spelling it differently while every
implementation silently skips the ones it does not recognise.

Two of these publish at the **apex** with the target on a service subdomain —
the arrangement that made a naive census record the draft's own author as a
non-publisher, and which the specification had to be revised to describe.

Nobody here was emailed. If you own one of these and want to converge, the
exact record is below. If you prefer your own syntax that is a legitimate
answer, and the point stands either way.

---

## `api.telemost.io`

```
now:    _x402.api.telemost.io  TXT  "v=x4021;descriptor=api;url=https://api.telemost.io/.well-known/x402"
target: _x402.api.telemost.io  TXT  "v=x402-1; wk=https://api.telemost.io/.well-known/x402; k=resource-server"
```

Diagnosis: **near-miss**

What differs:

- `v=x4021` → `v=x402-1`
- `url=` → `wk=`

Manifest at `https://api.telemost.io/.well-known/x402`: **one-edit-away** (missing `kind`)

`kind` inferred as `resource-server` from the document's own shape — check it before publishing.

A conformant resolver skips this record today (`parseX402TxtRecord` returns null), which is why the diagnosis exists at all.

## `tablint.dev`

```
now:    _x402.tablint.dev  TXT  "v=x4021;url=https://tablint.dev/.well-known/x402"
target: _x402.tablint.dev  TXT  "v=x402-1; wk=https://tablint.dev/.well-known/x402; k=resource-server"
```

Diagnosis: **near-miss**

What differs:

- `v=x4021` → `v=x402-1`
- `url=` → `wk=`

Manifest at `https://tablint.dev/.well-known/x402`: **one-edit-away** (missing `kind`)

`kind` inferred as `resource-server` from the document's own shape — check it before publishing.

A conformant resolver skips this record today (`parseX402TxtRecord` returns null), which is why the diagnosis exists at all.

## `vibesprings.net`

```
now:    _x402.vibesprings.net  TXT  "x402-manifest=https://vibesprings.net/.well-known/x402.json"
target: _x402.vibesprings.net  TXT  "v=x402-1; wk=https://vibesprings.net/.well-known/x402"
```

Diagnosis: **near-miss**

What differs:

- no `v=` token; a version is required
- `x402-manifest=` → `wk=`

Manifest at `https://vibesprings.net/.well-known/x402`: **needs-work** (missing `x402Version`, `kind`)

Needs a decision only its operator can make:

- `kind` — the document describes neither a facilitator block nor any resources, so nothing in it says which this service is. Set "facilitator", "resource-server", or "both" by hand — this tool will not guess, because a wrong value validates and misleads.

A conformant resolver skips this record today (`parseX402TxtRecord` returns null), which is why the diagnosis exists at all.

## `auor.io`

```
now:    _x402.auor.io  TXT  "https://api.auor.io/.well-known/x402"
target: _x402.auor.io  TXT  "v=x402-1; wk=https://api.auor.io/.well-known/x402; k=resource-server"
```

Diagnosis: **near-miss** · record at the apex, service on `api.auor.io`

What differs:

- the record is a bare URL; the grammar is `v=x402-1; wk=<url>`

Manifest at `https://api.auor.io/.well-known/x402`: **needs-work** (missing `x402Version`, `kind`)

`kind` inferred as `resource-server` from the document's own shape — check it before publishing.

A conformant resolver skips this record today (`parseX402TxtRecord` returns null), which is why the diagnosis exists at all.

## `naiko.io`

```
now:    _x402.naiko.io  TXT  "https://x402.naiko.io/.well-known/x402"
target: _x402.naiko.io  TXT  "v=x402-1; wk=https://x402.naiko.io/.well-known/x402; k=resource-server"
```

Diagnosis: **near-miss** · record at the apex, service on `x402.naiko.io`

What differs:

- the record is a bare URL; the grammar is `v=x402-1; wk=<url>`

Manifest at `https://x402.naiko.io/.well-known/x402`: **needs-work** (missing `x402Version`, `kind`)

`kind` inferred as `resource-server` from the document's own shape — check it before publishing.

A conformant resolver skips this record today (`parseX402TxtRecord` returns null), which is why the diagnosis exists at all.

