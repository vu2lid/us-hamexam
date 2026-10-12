# India ASOC Practice — reviewed practice seed

**Status: Stage 8D3A seed bank, Stage 8D3B browser/technical QA complete.
This edition is buildable and locally QA-tested, but is not an official
examination and must not be presented or deployed as one.** All 15 seed
questions have the required independent review recorded in the provenance
sidecar with reviewer `vu2lid`; the bank remains a deliberately small,
partial practice slice with limited syllabus coverage, not ready for
public release or any official-exam claim.

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

- `help-content.html` / `getting-started-content.html` — India-specific
  Help & About / Getting Started prose (Stage 8D3B), declared in
  `edition.json`'s `build.helpContent`/`gettingStartedContent`. Added after
  QA found the build otherwise fell back to the shared US default prose
  (FCC, NCVEC, Technician/General/Extra) verbatim -- the same override
  mechanism Stage 8A2/8C already built for the synthetic fixture, no new
  engine code. Explicitly practice-labeled; states the limited syllabus
  coverage and makes no official-exam claim.

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

## Browser and technical QA (Stage 8D3B)

With the Stage 8D3A seed bank reviewed and the build gate passing, this
pass added local browser/technical QA against the real
`dist-editions/india/` output -- `tests/india-edition.spec.js`, served
alongside US and synthetic on one origin via the extended
`scripts/serve-editions.js` (`npm run test:editions`). 13 India-specific
test cases (plus the 7 existing US/synthetic edition-isolation cases, all
still passing -- 20/20 total) cover:

- the standalone app loads and shows the first question (`R1B01`);
- all 15 reviewed practice questions are reachable via Next;
- "India ASOC Practice" / "ASOC (Restricted) Practice — not an official
  exam" branding and the in-app disclaimer text are visible;
- no US/FCC/NCVEC/Technician/General/Extra term appears anywhere in the
  rendered UI (checked via `innerText`, not raw HTML source -- a few
  inert, never-displayed fallback literals remain in shared `src/app.js`,
  the same documented boundary as the synthetic edition);
- the single `restricted` pool is selected and is the only option;
- progress and bookmarks persist across a reload;
- the canonical key, all four legacy-key templates, and the probe key
  resolve to the `india-asoc-practice-*` namespace, confirmed both by
  reading the resolved runtime config and by a real legacy-migration
  round-trip;
- Help & Getting Started content is now India-specific (see above), not a
  fallback to US prose;
- the PWA manifest's name/short_name/description and the page's
  `apple-mobile-web-app-title`/meta description are India-specific;
- the service worker's scope (`/editions/india/`) and cache-name prefix
  (`india-asoc-practice-`) are India-specific, with no interference from
  the US/synthetic workers or caches on the same origin;
- an offline reload after installation still shows the first question and
  can reveal its answer;
- the 320×568 layout has no horizontal overflow and the main controls
  (Menu, Next, Reveal) meet the 44px touch-target minimum;
- Menu, the pool selector, and Reveal are keyboard-focusable and operable
  via Enter/Escape.

**One real gap was found and fixed** (not an India-specific hack -- the
existing generic content-override seam, already proven by the synthetic
fixture): see "Files" above for `help-content.html`/
`getting-started-content.html`. No other generic-engine assumption
surfaced; a single-pool edition's pool selector, storage, exam setup, and
offline/PWA behavior all worked correctly on the first attempt.

**This remains a small, reviewed practice slice, not a release-ready
product.** The seed bank's syllabus coverage is deliberately limited (see
"Files" above for exactly what is and is not covered) and the product
makes no claim to official ASOC status, format, scoring, or timing
fidelity. Public release requires a separate, explicitly gated decision
(see "Deployment prohibition" below), broader syllabus coverage, and
resolution of the open regulatory questions in
`docs/INDIA_ASOC_REQUIREMENTS.md` §6 before any exam-faithful feature.

## Deployment prohibition

No artifact may be deployed from this scaffold. A buildable, reviewed India
edition is not the same decision as a public release: deployment requires
its own separate, explicitly gated decision, unaffected by this QA pass.
