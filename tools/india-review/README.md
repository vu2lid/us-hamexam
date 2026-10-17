# Stage 8E2 BitNet local-model pilot (tools/india-review/)

Development-only pilot wiring for the Stage 8E1/8E2 India question-review tool
(`scripts/review-pipeline.js`, `scripts/review-cli.js`; see
`docs/INDIA_REVIEW_TOOL.md`). Nothing here is imported by the runtime app or
PWA, and nothing here ever writes under `editions/india/`.

## BitNet availability — honest statement

**BitNet was NOT available on the development machine used for this stage.**
No BitNet.cpp, llama.cpp, llama-cli, llama-server, or ollama runtime and no
local model weights exist there. The wrapper below was therefore written and
documented but exercised **only against a fake/stub runtime** in the unit
tests (`tests/unit/india-review-bitnet.test.js`). The exact intended BitNet
command is documented below and is **NOT YET VERIFIED** against a real
BitNet.cpp build. Do not treat any model output as meaningful until a real
runtime has been run and spot-checked by a human.

## Files

- `prompt-v3.txt` — the versioned prompt template (`PROMPT_VERSION =
  "india-review-prompt-v3"`, kept in sync with `scripts/review-pipeline.js`).
  Placeholder: `__CANDIDATE_JSON__`. Its sha256 is recorded in every pilot
  report and manifest.
- `run-bitnet.sh` — the defensive bash wrapper (executable).
- This README.

## Wrapper contract (run-bitnet.sh)

- Reads JSONL candidate records on **stdin**; emits exactly **one strict JSON
  object per input record on stdout, in input order**; nothing else on
  stdout; all diagnostics on stderr.
- `set -euo pipefail`. Plain bash; `python3` (or `node`) is required only to
  extract the first JSON object from the model's free-text output.
- The script itself initiates **no network access**; it only invokes the
  local CLI named by `BITNET_CLI`.

### Environment variables

| Variable | Meaning | Default |
|---|---|---|
| `BITNET_CLI` | llama.cpp/BitNet.cpp-compatible CLI command (or a fake/stub for tests) | `bitnet` |
| `BITNET_MODEL` | Path/label of the model weights. **Required** — unset exits 2 with a clear message. | — |
| `BITNET_TIMEOUT` | Per-record timeout in seconds (uses the `timeout` command when available) | `600` |

### Intended invocation (NOT YET VERIFIED against a real runtime)

One documented approach, per record:

```sh
$BITNET_CLI -m "$BITNET_MODEL" --temp 0 --seed 42 -no-cnv -f <prompt-file>
```

Determinism flags where supported: temperature 0 (greedy), fixed seed 42,
non-interactive mode (`-no-cnv`). If your BitNet.cpp build does not support a
flag, adjust the invocation in the script and record the deviation.

Per record the wrapper: substitutes the candidate JSON into
`prompt-v3.txt`, invokes the runtime, extracts the **first** JSON object
(stripping markdown code fences), checks the output `id` matches the input
`id`, and prints it. Nonzero runtime exit propagates (abort); a malformed
line, a missing record, or an id mismatch fails the run with a stderr
diagnostic and exit 1.

## Worked example (as documented for the day a real runtime exists)

```sh
# 1. Extract candidates (US banks, figure/withdrawn/Part-97 filtered)
node scripts/review-cli.js extract --data-dir data --out /tmp/india-candidates.jsonl

# 2. Pilot on a bounded deterministic sample of 25 via the real wrapper
BITNET_MODEL=/path/to/model.gguf \
node scripts/review-cli.js pilot \
  --candidates /tmp/india-candidates.jsonl --sample 25 \
  --adapter command --command tools/india-review/run-bitnet.sh \
  --model bitnet-1bit --model-path /path/to/model.gguf \
  --out /tmp/india-pilot-report.json

# 3. Human review in the loopback-only UI (model suggestions are advisory only)
node scripts/review-cli.js serve --manifest /tmp/india-pilot-manifest.json --port 8787

# 4. Export approved records; authoring production questions remains a
#    separate, human-controlled step.
node scripts/review-cli.js export --manifest ... --out /tmp/india-approved.jsonl
```

## Test stub

Tests stub the runtime with an executable shell script and set
`BITNET_CLI=<stub> BITNET_MODEL=<label>`, which is all the wrapper needs —
this is the supported fake-runtime seam.
