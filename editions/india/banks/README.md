# banks/ — Stage 8D3A reviewed seed bank

This directory holds `restricted.json` — 15 practice questions in the
existing runtime schema, unchanged — plus its required provenance sidecar,
`restricted.provenance.json` (docs/INDIA_CONTENT_CONTRACT.md §2). See
`../README.md` for the exact questions/topics covered and what remains
outside this deliberately small practice slice.

**All 15 items are approved for the current practice build.** Every sidecar
entry records reviewer `vu2lid`, "reviewStatus": "approved", and
"rightsStatus": "cleared". The provenance gate in
`scripts/question-provenance.js` enforces these conditions and still fails
closed for incomplete or malformed future additions.

Extending this bank (more items, more syllabus topics) must follow the same
contract: independently authored or rule/reference-derived content only,
never copied from Vigyan Prasar, society material, or NCVEC wording, with a
complete sidecar entry and independent review per item.
