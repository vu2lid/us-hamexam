# Stage 8E1 local question review tool

This development-only tool creates an auditable candidate set from the US NCVEC
banks, accepts strictly validated JSON model output, and preserves human review
decisions in a separate manifest. It has no runtime/app imports, uses no network in fixture mode,
and never edits `editions/india/banks/`.

```sh
node scripts/review-cli.js extract --data-dir data --out /tmp/india-candidates.jsonl
node scripts/review-cli.js triage --candidates /tmp/india-candidates.jsonl --model-output fixtures/model.jsonl --adapter fixture --model local --manifest /tmp/india-review.json
node scripts/review-cli.js serve --manifest /tmp/india-review.json --port 8787
node scripts/review-cli.js export --manifest /tmp/india-review.json --out /tmp/india-approved.jsonl
```

Fixture mode is offline and makes no network requests. The command adapter executes a caller-supplied local command; any network behavior of that command is outside this tool’s control. The adapter must emit one exact JSON object per candidate (`id`, `indianTopic`, `verdict`, `reason`). Export emits only approved `keep` and `adapt` records; importing or authoring production questions remains a separate, human-controlled step. The review server binds to loopback only.
