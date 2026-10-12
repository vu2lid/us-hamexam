# India ASOC Practice — authoring scaffold (NON-BUILDABLE TEMPLATE)

**Status: authoring scaffold. This edition is intentionally NOT buildable and
must not be deployed.** It exists so that future, contract-compliant India
ASOC practice content has a validated profile/registry to land in.

## What this directory is

A template for the future **India ASOC (Restricted) practice** edition of this
app — an independently authored practice bank for the Indian Amateur Station
Operator's Certificate (Restricted) syllabus, governed by the Stage 8D1
content and provenance contract at
[docs/INDIA_CONTENT_CONTRACT.md](../../docs/INDIA_CONTENT_CONTRACT.md) and the
recorded research at
[docs/INDIA_ASOC_REQUIREMENTS.md](../../docs/INDIA_ASOC_REQUIREMENTS.md).

Everything here is **practice content labeling**: the profile, pool registry,
and (eventually) question bank describe an independent practice exercise.
Nothing here is an official examination, an official question pool, or a
replica of any official paper.

## Files

- `edition.json` — the edition profile: branding ("India ASOC Practice",
  subtitle "ASOC (Restricted) Practice — not an official exam"), jurisdiction
  and authority metadata (Wireless Planning & Coordination Wing / WPC of the
  Department of Telecommunications as the regulator; the question bank is an
  **independently authored practice bank**, not an official pool source),
  label templates, practice timer values, the India storage/cache namespace
  (`india-asoc-practice-*`), and the build input paths. It is fully
  schema-valid — it passes `scripts/edition-profile.js` validation.
- `pools.json` — the pool registry for the single `restricted` practice pool
  (generic idPolicy shape, `R`-prefixed question IDs, syllabus-topic groups).
  The counts, passing score, and timer values are **neutral practice
  placeholders**, chosen small and deliberately NOT encoding the unresolved
  official exam numbers recorded in the research (the 25+25 structure / 40%
  pass-criteria conflict, docs/INDIA_ASOC_REQUIREMENTS.md §1/§3/§6). Replace
  them with evidence-settled configuration before any release.
- `banks/` — **intentionally empty.** `banks/README.md` explains why.

No `help-content.html` / `getting-started-content.html` overrides are
declared: until they are authored, the build would fall back to the US default
prose, which is itself a reason this template must not be built as-is.

## Why `--edition india` fails by design

The build validator (`scripts/build.js` → `scripts/question-bank.js`) requires
real, schema-valid question banks. This scaffold deliberately ships **no
question file and no fake/placeholder questions** — authored content must come
from the Stage 8D1 contract workflow (provenance classes, review, and release
gates in docs/INDIA_CONTENT_CONTRACT.md).

So `npm run build -- --edition india` fails **early and clearly, before any
`dist/` or `dist-editions/` mutation**, with the missing-bank diagnostic from
the build's question-bank gate:

```
Question bank editions/india/banks/restricted.json (profile build.questionBanks.restricted) could not be read: ENOENT: ...
```

(the ENOENT branch of the gate's message names the missing bank file and notes
that a declared-but-absent bank means a non-buildable authoring template).
This is mechanism (a) from the Stage 8D2 design: no special-case in build.js,
no validator weakening — the ordinary fail-before-mutation gate fires. The
failure creates no `dist-editions/india/` directory, and the default US build
(`npm run build`, `--edition us`) is completely unaffected.

## Timing values

`examTimerSecondsValues: [0, 600, 1200, 1800]` are modest practice values.
They encode **no official timing claim** — no official ASOC time limit is
recorded in the research; treat them as placeholders to be revisited with
evidence.

## Deployment prohibition

No artifact may be deployed from this scaffold. Only a completed,
contract-compliant, reviewed India edition may produce `dist-editions/india/`,
and any such release is a separate, explicitly gated decision.
