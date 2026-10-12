# India ASOC Practice — reviewed practice seed

**Status: Stage 8D3A seed bank. This edition is buildable for local review and
further development, but is not an official examination and must not be
presented or deployed as one.** All 15 seed questions have the required
independent review recorded in the provenance sidecar with reviewer
`vu2lid`; the bank remains a deliberately small, partial practice slice.

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
- `banks/restricted.json` — **the Stage 8D3A seed bank: exactly 15
  practice questions**, in the existing runtime schema unchanged (`id`,
  `sub`, `q`, `choices`, `correct`, `correctText`, `ref` -- no new runtime
  field). A deliberately small, documented SUBSET of the Restricted
  syllabus, not a claim of syllabus coverage:
  - **5 items (`R1B01`-`R1B05`, group `R1`)** — Section A: Elementary
    electricity and magnetism (Ohm's Law, resistance units, conductors,
    series resistance, current/magnetism).
  - **5 items (`R1A01`-`R1A05`, group `R1A`)** — Section A: AC theory
    basics (frequency, period, RMS value, the frequency/period
    reciprocal, reactance).
  - **5 items (`R2A01`-`R2A05`, group `R2A`)** — Section B: ITU phonetic
    alphabet and Q-codes (A/M/S letters, QRM, QTH).
  - **Not covered by this slice** (Section A): semiconductors, receivers,
    transmitters, propagation, aerials, frequency measurement. **Not
    covered** (Section B): the Indian amateur rules themselves, emission
    designations, frequency allocations, distress/urgency procedure. A
    later slice extends coverage; this one does not imply completeness.
  - Provenance: 10 items `india-original` (elementary electricity/
    magnetism, AC theory -- written from scratch, informed only by the
    named syllabus topics, no copied text); 5 items `reference-informed`
    (Q-codes/phonetic alphabet -- original wording, informed by the
    internationally standardized ITU convention the Section B syllabus
    topic names). No item uses `ncvec-adapted`.
  - **Review status: `approved` for all 15 items.** The provenance sidecar
    records reviewer `vu2lid`, cleared rights status, and completion of the
    required review gate. These remain author-curated practice questions, not
    official ASOC questions.
- `banks/restricted.provenance.json` — the per-item authoring/provenance
  sidecar (docs/INDIA_CONTENT_CONTRACT.md §2), one entry per bank question
  keyed by its `id`: syllabus code/topic, provenance class, source
  citation, author, reviewer, review status, rights status, rationale, and
  figure status (`"none"` for every item -- this slice is figureless).
  Validated by `scripts/question-provenance.js`, wired into the India build
  path via the new, edition-agnostic `profile.build.provenanceSidecars`
  field (declared only here; US and the synthetic fixture declare none and
  are completely unaffected by this gate).

No `help-content.html` / `getting-started-content.html` overrides are
declared: until they are authored, the build would fall back to the US default
prose, which is itself a reason this template must not be built as-is.

## Build and review status (Stage 8D3A)

Stage 8D2's missing-bank reason no longer applies: the reviewed seed bank
and its provenance sidecar both exist and are schema-valid. All 15 entries
record reviewer `vu2lid`, `reviewStatus: "approved"`, and
`rightsStatus: "cleared"`; the provenance gate therefore permits the India
build. The build remains practice-only and does not claim official ASOC
status or complete syllabus coverage.

`npm run build -- --edition india` produces `dist-editions/india/` after
all ordinary pre-mutation gates pass. Repeated builds are deterministic, and
malformed or incomplete provenance still fails before output mutation. The
India artifact is not deployed by this scaffold; deployment requires a
separate release decision and the content/architecture gates recorded in the
India contract.

## Timing values

`examTimerSecondsValues: [0, 600, 1200, 1800]` are modest practice values.
They encode **no official timing claim** — no official ASOC time limit is
recorded in the research; treat them as placeholders to be revisited with
evidence.

## Deployment prohibition

No artifact may be deployed from this scaffold. Only a completed,
contract-compliant, reviewed India edition may produce `dist-editions/india/`,
and any such release is a separate, explicitly gated decision.
