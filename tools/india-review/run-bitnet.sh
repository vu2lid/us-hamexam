#!/usr/bin/env bash
# run-bitnet.sh — BitNet.cpp (llama-compatible CLI) wrapper for the Stage 8E2
# India question-review pilot (tools/india-review/, docs/INDIA_REVIEW_TOOL.md).
#
# Contract:
#   - Reads JSONL candidate records on stdin (one JSON object per line).
#   - Emits EXACTLY ONE strict JSON object per input record on stdout, in
#     input order. Nothing else goes to stdout; all diagnostics go to stderr.
#   - Exits nonzero on any failure (missing BITNET_MODEL → 2; per-record
#     runtime/parse/id-mismatch failure → 1; a failed record aborts the run).
#
# Runtime configuration (environment):
#   BITNET_CLI   command to invoke (default: "bitnet"). This may be ANY
#                llama.cpp/BitNet.cpp-compatible CLI, or a fake/stub command
#                for testing — the wrapper only ever invokes this local
#                command and never initiates network access itself.
#   BITNET_MODEL path/label of the model weights (REQUIRED, exit 2 if unset).
#   BITNET_TIMEOUT per-record timeout in seconds (default 600; uses the
#                `timeout` command when available).
#
# Invocation pattern (per record — ONE approach, documented but NOT YET
# VERIFIED against a real BitNet runtime, because no BitNet/llama runtime or
# weights exist on the development machine; verified only against a stub):
#   $BITNET_CLI -m "$BITNET_MODEL" --temp 0 --seed 42 -no-cnv -f <prompt-file>
# Determinism flags where supported: temperature 0 (greedy), fixed seed 42,
# non-interactive mode (-no-cnv). If your build does not support a flag,
# adjust BITNET_EXTRA or edit the invocation below and record the change.
#
# Prompt template: tools/india-review/prompt-v3.txt (next to this script),
# placeholder __CANDIDATE_JSON__ substituted per record. PROMPT_VERSION must
# stay in sync with scripts/review-pipeline.js.
#
# Dependencies: bash, and python3 (or node) ONLY for extracting the first
# JSON object from the model's free-text output. No network access is
# initiated by this script.

set -euo pipefail

BITNET_CLI="${BITNET_CLI:-bitnet}"
BITNET_MODEL="${BITNET_MODEL:-}"
BITNET_TIMEOUT="${BITNET_TIMEOUT:-600}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="$SCRIPT_DIR/prompt-v3.txt"

log() { printf 'run-bitnet: %s\n' "$*" >&2; }

if [ -z "$BITNET_MODEL" ]; then
  log "BITNET_MODEL is required (path/label of the model weights); set it and re-run."
  exit 2
fi
if [ ! -f "$TEMPLATE_FILE" ]; then
  log "prompt template not found: $TEMPLATE_FILE"
  exit 2
fi
TEMPLATE="$(cat "$TEMPLATE_FILE")"
case "$TEMPLATE" in
  *__CANDIDATE_JSON__*) ;;
  *) log "template $TEMPLATE_FILE is missing the __CANDIDATE_JSON__ placeholder"; exit 2 ;;
esac

if ! command -v "$BITNET_CLI" >/dev/null 2>&1; then
  log "runtime command not found: $BITNET_CLI (set BITNET_CLI, or install BitNet.cpp per tools/india-review/README.md)"
  exit 2
fi

have_timeout=0
if command -v timeout >/dev/null 2>&1; then have_timeout=1; fi

# Extract the FIRST JSON object from a free-text model output file:
# strips markdown code fences, then scans for the first balanced {...}.
extract_first_json() {
  # $1 = output file; prints the JSON object on stdout; returns nonzero on failure.
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$1" <<'PYEOF'
import json, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
text = text.replace("```json", " ").replace("```", " ")
dec = json.JSONDecoder()
for idx, ch in enumerate(text):
    if ch == "{":
        try:
            obj, _ = dec.raw_decode(text[idx:])
            print(json.dumps(obj))
            sys.exit(0)
        except ValueError:
            continue
sys.exit(1)
PYEOF
  elif command -v node >/dev/null 2>&1; then
    node -e '
      const fs=require("fs"),s=fs.readFileSync(process.argv[1],"utf8").replace(/```json/g," ").replace(/```/g," ");
      // Scan for the first balanced {...}, tracking brace depth and string
      // state (so a brace inside a quoted string never miscounts).
      let depth=0,start=-1,inStr=false,esc=false;
      for(let i=0;i<s.length;i++){const c=s[i];
        if(inStr){if(esc)esc=false;else if(c==="\\")esc=true;else if(c==="\"")inStr=false;continue;}
        if(c==="\"")inStr=true;
        else if(c==="{"){if(depth===0)start=i;depth++;}
        else if(c==="}"){depth--;if(depth===0&&start>=0){try{JSON.parse(s.slice(start,i+1));console.log(s.slice(start,i+1));process.exit(0);}catch(e){start=-1;}}}
      }
      process.exit(1);
    ' "$1"
  else
    log "need python3 or node to extract JSON from model output"
    return 2
  fi
}

record_no=0
failures=0

while IFS= read -r line; do
  [ -z "$line" ] && continue
  record_no=$((record_no + 1))

  # Validate input line is JSON with an id.
  input_id="$(printf '%s' "$line" | { if command -v python3 >/dev/null 2>&1; then python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])'; else node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).id)})'; fi; })" \
    || { log "record $record_no: input line is not a JSON object with an id"; failures=$((failures + 1)); continue; }

  # Wrap the candidate in the versioned prompt template (pure bash substitution).
  prompt="${TEMPLATE//__CANDIDATE_JSON__/$line}"
  prompt_file="$(mktemp "${TMPDIR:-/tmp}/india-review-prompt.XXXXXX")"
  out_file="$(mktemp "${TMPDIR:-/tmp}/india-review-out.XXXXXX")"
  printf '%s' "$prompt" > "$prompt_file"

  log "record $record_no ($input_id): invoking $BITNET_CLI"
  set +e
  if [ "$have_timeout" = 1 ]; then
    timeout "$BITNET_TIMEOUT" "$BITNET_CLI" -m "$BITNET_MODEL" --temp 0 --seed 42 -no-cnv -f "$prompt_file" > "$out_file"
  else
    "$BITNET_CLI" -m "$BITNET_MODEL" --temp 0 --seed 42 -no-cnv -f "$prompt_file" > "$out_file"
  fi
  status=$?
  set -e
  rm -f "$prompt_file"

  if [ "$status" != 0 ]; then
    log "record $record_no ($input_id): runtime exited $status; aborting"
    rm -f "$out_file"; exit 1
  fi

  if ! json="$(extract_first_json "$out_file")"; then
    log "record $record_no ($input_id): no valid JSON object found in runtime output"
    rm -f "$out_file"; failures=$((failures + 1)); continue
  fi
  rm -f "$out_file"

  output_id="$(printf '%s' "$json" | { if command -v python3 >/dev/null 2>&1; then python3 -c 'import json,sys; print(json.load(sys.stdin).get("id",""))'; else node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).id)})'; fi; } 2>/dev/null || true)"
  if [ "$output_id" != "$input_id" ]; then
    log "record $record_no: output id mismatch (input '$input_id', output '$output_id')"
    failures=$((failures + 1)); continue
  fi

  printf '%s\n' "$json"
done

if [ "$record_no" = 0 ]; then
  log "no input records on stdin"
  exit 1
fi
if [ "$failures" != 0 ]; then
  log "$failures of $record_no record(s) failed; see stderr diagnostics"
  exit 1
fi
exit 0
