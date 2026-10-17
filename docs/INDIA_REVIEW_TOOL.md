# India question-review tool (Stage 8E1 → 8E2, schemaVersion 2)

Development-only tool that creates an auditable candidate set from the US
NCVEC banks, accepts strictly validated local-model output, and preserves
human review decisions in a separate manifest. It has no runtime/app
imports, uses no network in fixture mode, and **never edits
`editions/india/`** (tested: the production bank and its provenance sidecar
are sha256-hashed before/after the test run and asserted identical).

## Commands

```sh
node scripts/review-cli.js extract --data-dir data --out /tmp/india-candidates.jsonl
node scripts/review-cli.js triage --candidates /tmp/india-candidates.jsonl --model-output /tmp/model.jsonl --adapter fixture --model local --manifest /tmp/india-review.json
node scripts/review-cli.js pilot --candidates /tmp/india-candidates.jsonl --sample 25 --adapter fixture --model-output /tmp/model.jsonl --model <id> --model-path <label> --out /tmp/pilot-report.json
node scripts/review-cli.js serve --manifest /tmp/india-review.json --port 8787
node scripts/review-cli.js export --manifest /tmp/india-review.json --out /tmp/india-approved.jsonl
```

Fixture mode is offline and makes no network requests. The command adapter
executes a caller-supplied local command; any network behavior of that
command is outside this tool's control. The review server binds to loopback
only. Export emits only approved `keep`/`adapt` records; importing or
authoring production questions remains a separate, human-controlled step.

## Candidate schema v2 (schemaVersion 2)

Each candidate carries: `id`, `poolKey`, `sub`, `question`,
`choices` (A–D), `correct` (letter), `correctText` (must byte-match
`choices[correct]`), `ref` (source reference string), `figure` (always
`false` — figure-bearing questions are filtered out, but the field is
present so the model/UI can reason about figure rights), and `source`
(`editionId`, `revisionId`, `element`, `displayName` from the pool registry).
Extraction filters: figure-bearing, withdrawn IDs, bare Commission-rules
subelements (T1/G1/E1), and any question referencing FCC Part 97.

## Model output contract v2

`validateModelRecord` enforces exactly this key set, per record, with a
per-record diagnostic on any violation:

```json
{"id":"T2A01","syllabusRelevant":true,"indianTopic":"...","recommendation":"keep|adapt|reject|defer","jurisdictionRisk":"none|low|medium|high","figureRightsWarning":"none|warning","rationale":"one concise sentence"}
```

`createManifest` additionally rejects duplicate model-output IDs and
incomplete coverage (missing records). Model records are validated again on
manifest load; malformed JSONL lines are rejected with line numbers.

## Prompt versioning

`PROMPT_VERSION = "india-review-prompt-v3"`; the template is
`tools/india-review/prompt-v3.txt` (placeholder `__CANDIDATE_JSON__`). Its
sha256 is embedded in every manifest (`promptHash`) and every pilot report —
the exact prompt used is therefore auditable after the fact.

### Prompt v3 status: EXPERIMENTAL — not a measured improvement

Prompt v3 is retained as the active template by author decision, but it is
**experimental and unproven**. The only real-model pilot run against it so
far (2026-10-14, Qwen2.5-1.5B local run) was **negative**:

- On 19 universal (non-US-specific) questions, 7 rationales were fabricated
  or self-contradictory (the rationale contradicted the emitted
  recommendation/jurisdictionRisk fields).
- 2 of 19 records hit the one-JSON-object output contract and failed
  validation (truncated/invalid output). Truncation and any other
  schema/enum violation is a hard failure: `validateModelRecord` rejects
  the record loudly with a per-record diagnostic, `pilot` records it in
  `failures[]`, and nothing is silently coerced — a failed record never
  becomes a manifest item.
- On the 6 known US-specific questions in the same pilot, the separate
  deterministic jurisdiction guard (below) flagged all 6 correctly; the
  guard, not the model, is what made those calls.

Consequences recorded here so a future reader does not trust v3 blindly:

- v3 must NOT be described as an improvement over v2 in any summary; no
  A/B evidence supports that, and the only pilot evidence is negative.
- All model fields (`syllabusRelevant`, `indianTopic`, `recommendation`,
  `jurisdictionRisk`, `figureRightsWarning`, `rationale`) are
  **advisory-only**. They never override the deterministic jurisdiction
  guard and never approve anything; the human review step is mandatory.
- Any future real-model run must report failures/truncation counts
  explicitly (the `pilot` report's `counts.failed` + `failures[]` exist
  for exactly this) before its keep/adapt/reject distribution is given
  any weight.

## Deterministic jurisdiction guard (Stage 8E3)

`scripts/jurisdiction-guard.js` runs in `createManifest()` **after**
model-output validation and **before** the manifest item is built. It scans
only the candidate's own question text and correct-answer text (never the
wrong-answer distractors, which routinely name US concepts as decoys, and
never any model output) against 7 narrow rules: FCC Part 97, RACES/civil
defense, US band-plan restrictions, US call-sign/licensing rules (incl.
VEC/Vanity/VE), FCC RF-exposure rules, explicit "in the United States"
framing, and a deliberate catch-all bare-`FCC` rule. A flagged item's model
record is forced to `recommendation:"reject"` + `jurisdictionRisk:"high"`
with the original model rationale preserved inside the override rationale;
there is no code path by which a model result can avoid or reverse this,
because the guard never reads model output.

The guard now runs at BOTH points: **pre-invocation**, the `triage`/`pilot`
dispatch paths split candidates via `splitGuarded()` before calling the
model adapter, so flagged candidates never reach it (they enter the manifest
through a clearly labeled synthetic model record, `indianTopic`
`"Jurisdiction-specific (US) — not syllabus relevant"`, with a rationale
stating no model was involved); and **post-invocation**, the
`createManifest()` override above stays in place as defense in depth.
Extraction already pre-filters bare `97.` references and T1/G1/E1
subelements. See `tests/unit/jurisdiction-guard.test.js`.

The synthetic guard record's shape is a cross-repository convention shared
with the `local-llm-review-runner` project (runner half committed as
`92b8343`), and it is pinned by the
checked-in golden fixture `tools/india-review/guard-record-golden.json` (a
byte-identical copy lives in that repo's `fixtures/`). The golden test cases
in `tests/unit/jurisdiction-guard.test.js` always run — they need no sibling
checkout — so CI detects guard-record drift on its own; when the sibling
checkout is present, the tests additionally assert the two golden files are
byte-identical. Changing the guard-record shape requires updating the golden
fixture in BOTH repositories together and bumping its `conventionVersion`.

## Pilot subcommand

`pilot` takes `--candidates` (or extracts), `--sample N` (**integer 1–50,
default 25** — enforced before anything is written), `--adapter
fixture|command`, `--model-output`/`--command`, `--model` (identifier),
`--model-path` (label), `--out` (report JSON). The sample is deterministic:
the first N candidates after the existing ID sort. The report records: tool
version, `promptVersion`, `promptHash`, model/runtime identifier, model path
label, adapter, runtime settings (deterministic-flags summary:
temperature 0 / seed 42 / greedy / non-interactive), `startedAt`,
`elapsedMs`, counts (`extracted`, `sampled`, `succeeded`, `failed`),
per-record `failures` diagnostics, and the manifest of successful records.

## BitNet local-model wrapper — NOT VERIFIED ON A REAL RUNTIME

`tools/india-review/run-bitnet.sh` (see `tools/india-review/README.md`):
reads JSONL on stdin, emits one strict JSON object per record on stdout in
input order, logs to stderr, `set -euo pipefail`, per-record timeout guard,
`BITNET_CLI`/`BITNET_MODEL` env-configurable (unset `BITNET_MODEL` → exit
2). Intended invocation (NOT YET VERIFIED): `$BITNET_CLI -m "$BITNET_MODEL"
--temp 0 --seed 42 -no-cnv -f <prompt-file>` per record.

**BitNet was not available on the development machine** (no BitNet.cpp /
llama.cpp runtime, no weights); the wrapper was exercised **only against a
stub/fake runtime** in `tests/unit/india-review-bitnet.test.js` (env-var seam:
`BITNET_CLI=<stub> BITNET_MODEL=<label>`).

## Review UI

`reviewHtml` renders the manifest with: source metadata (editionId,
revisionId, element, ref, poolKey), the full model suggestion block labeled
**"Model suggestion (advisory only)"**, decision select (pending/keep/adapt/
reject) + topic + note + save/download, J/K navigation, and a deliberate
**"Reveal answer"** control — the correct letter + correctText are redacted
from the embedded manifest (base64-gated) and only render after the human
clicks Reveal. Human approval is mandatory; the UI never auto-approves.

## Manual pilot workflow

1. `extract` → candidates JSONL + filter report.
2. `pilot --sample 25` (fixture stub or, when available, the BitNet wrapper)
   → pilot report with prompt hash, counts, failures.
3. Human review in `serve` UI: read each question, reveal the answer only
   when needed, sanity-check every model field, decide keep/adapt/reject.
4. `export` → approved records JSONL.
5. Separate human authoring step (outside this tool) writes/adapts content
   for `editions/india/banks/` under the Stage 8D1 content contract.

## Evaluation checklist for a real local-model run

- [ ] Determinism spot-check: run the same input twice → byte-identical
      outputs (stub-mode test asserts this today).
- [ ] Per-field sanity: every record has the right key set, valid enums, a
      non-empty rationale, and `id` matching its candidate.
- [ ] Failure paths: malformed output line, missing record, duplicate id,
      nonzero runtime exit each fail loudly with a clear diagnostic.
- [ ] No writes to `editions/india/` (unit test hashes bank + provenance
      before/after).
- [ ] The prompt hash in the report matches `tools/india-review/prompt-v3.txt`.

## Hard rules

- Human approval is mandatory for every question; the model cannot approve
  content.
- The model cannot decide rights (its figure-rights output is a warning
  flag for a human, never a clearance).
- The model cannot claim ASOC equivalence or exam faithfulness.
- The model never writes banks; `export` output is advisory input to a
  separate human authoring step.
- Figure-bearing questions never enter the candidate set.
