# Figure asset pipeline contract

This document defines the contract for the 14 official NCVEC figures that 44
questions depend on, and the validator that enforces it. It is the reference for
the later asset-acquisition and rendering slices.

**Status (Stage 2D + encoding adoption).** The contract and its validator
(`scripts/figure-manifest.js`) are implemented and unit-tested. The real
material exists and is tracked: the three official NCVEC source PDFs under
`data/pool-sources/` (via narrow `.gitignore` exceptions — other working files
there stay ignored), the 14 figure assets under `assets/figures/`, and
`data/figures.json` as the real manifest. The 13 non-E5-1 assets are encoded as
**16-level grayscale** (`g16`; colour type 0 / bit depth 4) following the Stage 2
optimisation experiment; E5-1 keeps its 8-bit bytes (see §7 and
`docs/FIGURE_OPTIMIZATION.md`).

**Validation is now a mandatory build gate.** Every `npm run build`
(`node scripts/build.js`) loads and validates `data/figures.json` — schema, the
question-to-figure cross-check against all three pools, on-disk asset content and
exact checksums, safe paths, unlisted assets, and every checksum-pinned source
PDF — and aborts with a nonzero exit **before any file under `dist/` is created,
written, copied, or removed** (see
[Production integration](#production-integration)). There is no skip flag,
optional mode, missing-source fallback, or network/extraction step.

Structural validation is not visual correctness: the **per-figure human fidelity
review is still pending** (`docs/FIGURE_REVIEW.md` §7), so Stage 2 is not
complete. Provenance and fidelity evidence are in
[`docs/FIGURE_REVIEW.md`](FIGURE_REVIEW.md); extraction is reproducible via
`scripts/figure-extract.js` (a standalone aid — **not** run during the build).

Related:

- Stage 2A added the optional `question.figure` field and its build-time
  reference gate (`scripts/figure-references.js`, `AGENTS.md`). That field is the
  single source of truth for which question needs which figure; this contract
  does **not** restate the 44-question mapping.
- `docs/IMPLEMENTATION_PLAN.md` tracks Stage 2 progress.

---

## 1. Expected inventory

Derived from `question.figure` in `data/*.json` (see `scripts/figure-references.js`):

| Pool | Figures | Questions |
|------|---------|-----------|
| Technician | `T-1`, `T-2`, `T-3` | 12 |
| General | `G7-1` | 5 |
| Extra | `E5-1`, `E6-1`, `E6-2`, `E6-3`, `E7-1`, `E7-2`, `E7-3`, `E9-1`, `E9-2`, `E9-3` | 27 |
| **Total** | **14 unique** | **44** |

`validateManifestAgainstQuestions()` recomputes this from the pools; the exact
totals are asserted only in the inventory regression test, never in the normal
build, so a future official pool can change them deliberately.

---

## 2. Manifest schema (`data/figures.json`, `schemaVersion: 1`)

```jsonc
{
  "schemaVersion": 1,

  // Source registry: one entry per official PDF, keyed by a stable id.
  // Provenance lives here once and is referenced by figures (non-duplicative).
  "sources": {
    "technician-2026-2030": {
      "pool": "technician",
      "pdf": "data/pool-sources/technician-2026-2030.pdf",
      "url": "https://www.ncvec.org/.../2026-2030-technician-question-pool.pdf",
      "edition": "2026–2030 Technician pool, 19 Feb 2026 errata",
      "sha256": "<64 lowercase hex of the exact PDF bytes>"
    }
  },

  "figures": [
    {
      "id": "T-1",                                  // normalized, uppercase (Stage 2A format)
      "pool": "technician",                         // technician | general | extra
      "file": "assets/figures/technician/t-1.svg",  // repo-root-relative, forward slashes
      "source": "technician-2026-2030",             // key into "sources"
      "sourcePage": 55,                             // 1-based PDF page index (not the printed label)
      "extractionMethod": "direct-vector-export",   // see §4
      "alt": "Schematic containing six numbered components",
      "sha256": "<64 lowercase hex of the exact final asset bytes>",

      // Required only when extractionMethod === "hand-tracing":
      "review": { "reviewer": "<independent second reviewer>", "date": "2026-09-30", "notes": "…" }
    }
  ]
}
```

> The block above is a **schema example**. The page number, description, URL, and
> hashes are placeholders. Never copy them into real records — every value must
> be verified against the official source when the assets are acquired.

### Field rules (`validateManifestShape`, pure — no filesystem)

Root:

- `schemaVersion` — must equal `1`. Unknown top-level keys are rejected.
- `sources` — non-empty object. Every entry must be referenced by ≥1 figure.
- `figures` — non-empty array.

Source registry entry:

| Field | Rule |
|-------|------|
| `pool` | `technician` \| `general` \| `extra` |
| `pdf` | safe relative path (§3) under `data/pool-sources/`, ends `.pdf` |
| `url` | `https://` URL, recorded only — **never fetched** |
| `edition` | non-blank; identifies the pool edition and errata level |
| `sha256` | 64 lowercase hex of the exact PDF bytes |

Figure entry:

| Field | Rule |
|-------|------|
| `id` | matches the Stage 2A normalized form `^[A-Z][0-9]*-[0-9]+$` (e.g. `T-1`, `G7-1`, `E9-3`); unique across the manifest |
| `pool` | valid pool; `id[0]` must equal the pool prefix (`T`/`G`/`E`) |
| `file` | safe relative path (§3) under `assets/figures/<pool>/`, ends `.svg` or `.png`; unique (case-insensitively) |
| `source` | existing key in `sources`; that source's `pool` must match |
| `sourcePage` | integer `1..4000` (1-based PDF page index) |
| `extractionMethod` | one of the documented set (§4) |
| `alt` | non-blank, single line, 12–300 chars; must not name "answer"/"correct answer" (a heuristic — human review still required, §6) |
| `sha256` | 64 lowercase hex of the exact final asset bytes |
| `review` | object `{ reviewer, date (YYYY-MM-DD), notes? }`; **required** for `hand-tracing`, optional otherwise |

Unknown keys on any object are rejected (fail-closed).

### Checksum computation

`sha256` is the SHA-256 of the **exact bytes of the final artifact as stored in
the repository** — the optimized SVG or the PNG file, byte for byte, with no
normalization, re-export, or whitespace change. Recompute with:

```bash
sha256sum assets/figures/technician/t-1.svg   # lowercase hex, first field
```

Source `sha256` is computed the same way over the downloaded PDF.

---

## 3. Filesystem safety

All `file` and `pdf` paths are repository-root-relative and validated by
`checkSafeRelativePath()` + `checkContainedNoSymlink()`:

Rejected outright:

- absolute paths and Windows drive-letter paths (`/x`, `C:\…`, `C:/…`);
- backslashes;
- any `:` character (blocks `http://`, `file:`, `data:`, and NTFS ADS `name:stream`);
- control characters and leading/trailing whitespace;
- `.` or `..` path segments (parent traversal), empty segments;
- URL forms of any kind — the validator **never** opens a URL or follows an
  external reference.

Containment:

- `file` must lie under `assets/figures/<pool>/`; `pdf` under `data/pool-sources/`.
- Lexical containment is checked first, then every existing path segment is
  `lstat`-ed.

**Symlink policy: strict rejection.** If any segment of an asset or source path
is a symbolic link, the path is rejected — the validator does not resolve the
link to decide whether its target is "inside" the root. A final realpath
containment check is also applied as defence in depth. Rationale: the asset tree
is committed static content with no legitimate reason to contain links, so the
simplest fail-closed rule is adequate and removes an entire class of
TOCTOU/escape bugs.

---

## 4. Extraction methods (finite set)

`extractionMethod` must be exactly one of:

| Value | Meaning |
|-------|---------|
| `direct-vector-export` | Vector paths lifted straight from the source PDF and optimized. Preferred for line-art schematics. |
| `raster-export` | A page region exported as a raster image (PNG). Use only when vector export is infeasible or loses fidelity. |
| `vectorization` | Automated raster→vector conversion, then reviewed against the source. |
| `hand-tracing` | Manually redrawn. **Avoid** unless faithful extraction is impossible; **requires** a `review` entry naming an independent second reviewer who confirmed the content matches the source. |

---

## 5. Allowed asset content

### 5.1 SVG subset (`validateSvg`)

The security boundary is a **fail-closed grammar plus an element/attribute
allowlist**, not a string blacklist. The validator is a small purpose-built
tokenizer for exactly this subset; it does **not** implement general SVG or XML.

**Allowed elements:** `svg`, `g`, `path`, `line`, `polyline`, `polygon`, `rect`,
`circle`, `ellipse`, `text`, `tspan`, `title`, `desc`. The root element must be
`<svg>`; nested `<svg>` is rejected. Element-name membership is tested as an
**own-property** lookup on the allowlist, so inherited object property names
(`constructor`, `toString`, `__proto__`, …) are ordinary "not in the allowed
element subset" validation errors — never accepted, and never a thrown
exception.

**Allowed attributes**

- Common (any element): `id`, `transform`, `fill`, `fill-rule`, `fill-opacity`,
  `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`,
  `stroke-dasharray`, `stroke-dashoffset`, `stroke-miterlimit`, `stroke-opacity`,
  `opacity`, `color`, `visibility`, `vector-effect`, `shape-rendering`.
- `svg`: `xmlns` (must be exactly `http://www.w3.org/2000/svg`), `viewBox`,
  `width`, `height`, `preserveAspectRatio`, `version`.
- `path`: `d`, `pathLength`. `line`: `x1 y1 x2 y2`. `polyline`/`polygon`:
  `points`. `rect`: `x y width height rx ry`. `circle`: `cx cy r`. `ellipse`:
  `cx cy rx ry`. `text`/`tspan`: `x y dx dy text-anchor font-size font-family
  font-weight font-style letter-spacing`.

**Attribute-value policy.** Before any value check runs, the validator resolves
the character references the subset permits (`&amp; &lt; &gt; &quot; &apos;`
and numeric `&#…;` / `&#x…;`) **and** the CSS escape sequences a lenient style
engine would collapse (`\26 `, `\000026`, `\28`, trailing-backslash line
continuations). The `url(…)` and URI-scheme checks then run against that
decoded value, so an encoded `&#117;rl(…)` / `\75 rl(…)` / `ur\6C(…)` cannot
slip through.

The resource-capable paint attributes — `fill`, `stroke`, `color` — additionally
get a **fail-closed value allowlist**. After decoding, the value must be one of:

- a keyword: `none`, `currentColor`, `transparent`, `inherit`;
- a hex colour: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`;
- a numeric `rgb()` / `rgba()` / `hsl()` / `hsla()` — digits, `.`, `%`, and
  comma/slash separators only (no nested functions, no identifiers);
- a CSS `<named-color>` keyword (the CSS Color 4 list).

Every other form — including all `url(...)` paint-server references, bare
identifiers, and CSS-function payloads such as `var(...)` / `attr(...)` /
`expression(...)` — is rejected. This deliberately drops gradient/pattern paint
references (the elements that define them are already off the allowlist) and
space-separated CSS Color 4 syntax; extraction tooling must emit one of the
static forms above. Non-paint attributes are not colour-checked, but their
decoded values are still rejected for `url(...)` or a URI scheme.

**XML character range.** Every code point in the decoded document — not just
text nodes and attribute values, but also the positions the tokenizer treats as
insignificant whitespace — must fall inside the XML 1.0 `Char` production, and
numeric character references are range-checked the same way. Rejected: C0
controls other than tab / LF / CR, the surrogate range `U+D800–U+DFFF`, the
non-characters `U+FFFE` / `U+FFFF`, and any value above `U+10FFFF`. So `&#0;`,
`&#xB;`, `&#xD800;`, `&#xFFFF;`, `&#x110000;`, a literal `U+0001`, and a vertical
tab or form feed sitting between attributes / around `=` / inside a closing tag
are all rejected, while valid non-ASCII labels (Ω, µ, →, CJK, emoji) pass. The
tokenizer also recognises only the XML `S` whitespace set (space, tab, CR, LF)
as a separator — never JavaScript's wider `\s` (vertical tab, form feed, Unicode
spaces) — so those are markup errors, not silent separators.

**Encoding checks.** For `Buffer` input, UTF-8 validity is verified with a
strict decoder (`TextDecoder` in `fatal` mode) — overlong encodings, truncated
sequences, lone continuation bytes, and encoded surrogates are rejected. A
decoded-byte-length comparison is **not** used (it misses sequences that
round-trip to the same length). `string` input is held to the same character
policy: an unpaired surrogate code unit is rejected.

**Rejected** (non-exhaustive; anything not on the allowlist is rejected):

- `script`, `style`, `foreignObject`, `image`, `use`, `a`, `animate*`, `set`,
  `filter`, `pattern`, `mask`, `clipPath`, `marker`, `symbol`, `switch`,
  `metadata`, `view`, and every other element;
- `style` and `class` attributes; any `on*` event handler; `href`,
  `xlink:href`, or any other resource reference;
- any namespaced (`prefix:name`) element or attribute; any `xmlns:*`; any
  `xmlns` value other than the SVG namespace;
- attribute values whose **decoded** form contains `url(…)` or a URI scheme
  (`javascript:` `vbscript:` `data:` `file:` `blob:` `http(s):` `ftp:`);
- a `fill` / `stroke` / `color` value that is not one of the static colour
  forms in the attribute-value policy above;
- `<!DOCTYPE>`, `<!ENTITY>`, `<![CDATA[`, processing instructions and the XML
  declaration (`<?…?>`), and XML comments (`<!-- -->`);
- any entity other than `&amp; &lt; &gt; &quot; &apos;` and numeric character
  references (`&#…;`, `&#x…;`); numeric references outside the XML character
  range (see above);
- text content anywhere except inside `text`, `tspan`, `title`, `desc`;
- code points outside the XML 1.0 `Char` range anywhere in the document
  (including markup whitespace), literal or referenced; unpaired surrogates;
  a non-XML separator (vertical tab, form feed, Unicode space) between tokens;
- malformed markup: unquoted or unterminated attribute values, missing `=`,
  duplicate attributes, mismatched or unclosed tags, `<` inside an attribute
  value, NUL bytes, invalid UTF-8 (strict decode);
- files over 256 KiB, more than 5000 elements, or nesting deeper than 32.

The accepted subset is comment-free, PI-free, and DOCTYPE-free. Extraction
tooling must strip those before an asset is submitted.

**Guarantee.** A passing SVG uses only static drawing primitives from the
allowlist, references no external or active content, and is well-formed under
this grammar. It is *not* a guarantee of correct rendering or visual fidelity —
that is the §6 review.

### 5.2 PNG subset (`validatePng`, Node built-ins only)

Verified structurally with bounded parsing and CRC-32 checks:

- 8-byte PNG signature.
- `IHDR` first, length 13: width and height `1..4096`; colour type ∈
  `{0,2,3,4,6}` with a bit depth valid for that type; compression `0`; filter
  method `0`; **interlace `0`** (interlaced PNG is not in the subset).
- ≥1 `IDAT`; colour type 3 requires `PLTE`.
- Terminal `IEND` with zero length; no trailing bytes after it.
- Every chunk's CRC-32 must match; chunk length must fit within the file.
- **Chunk allowlist:** `IHDR`, `PLTE`, `IDAT`, `IEND`, `tRNS`, `pHYs`, `sRGB`,
  `gAMA`. Any other chunk is rejected — text metadata (`tEXt`/`zTXt`/`iTXt`),
  colour profiles (`iCCP`), Exif (`eXIf`), private chunks, and **APNG**
  (`acTL`/`fcTL`/`fdAT`).
- Limits: ≤ 512 KiB total, ≤ 64 chunks, ≤ 512 KiB per chunk.
- Truncation (short header or short chunk body) is rejected.

**Guarantee.** A passing PNG is a well-framed, non-animated, metadata-clean
static image within the size/dimension limits, with intact chunk CRCs. The
validator does **not** inflate the pixel stream or decode the image; full
decoding and fidelity remain the §6 checks.

---

## 6. Per-figure fidelity review

Structural validation is necessary but not sufficient. Before a figure is
accepted, a reviewer records a **side-by-side comparison** of the rendered asset
against the exact source-PDF page (`sources[…].pdf` at `sourcePage`):

- every labelled component / number / axis present in the source is present and
  legible in the asset, with nothing added or removed;
- the `alt` text describes what the diagram shows and does **not** reveal or
  narrow the answer to any question that uses it;
- for `hand-tracing`, a second independent reviewer repeats this check and is
  named in `review`.

This review is a human gate tracked in the implementation plan; it is not
automated by `scripts/figure-manifest.js`.

---

## 7. Size budget

The complete standalone artifact budget is **1 MiB = 1,048,576 bytes**
(`STANDALONE_BUDGET_BYTES`). This contract keeps figure assets small enough to
fit alongside the question banks and application code.

The finished `dist/index.html` size — after inlining and any encoding overhead —
is enforced by the **packaging** stage, not by this validator. Source-asset byte
totals are an input to that budget, **not** an equivalent of the final embedded
size. Do not treat "sum of asset bytes < 1 MiB" as proof the packaged file fits.

**Committed asset sizes (adopted `g16` encoding).** After the Stage 2
optimisation experiment the 13 non-E5-1 assets were re-encoded from 8-bit
grayscale to **16-level grayscale** (colour type 0, bit depth 4); E5-1 keeps its
8-bit bytes. The 14 committed assets now total **229,489 B on-disk** /
**306,008 B as base64** (was 325,927 / 434,592 at 8-bit; largest single asset
G7-1 31,294 B). Estimated projected `dist/index.html` once Stage 3 inlines them
≈ **943,208 B** → ≈ **39,832 B** free after a provisional 64 KiB Stage 3
allowance — an **estimate**, not a compliance claim; the finished size is
enforced by the packaging stage. See `docs/FIGURE_OPTIMIZATION.md` (the historical
experiment) and `docs/FIGURE_REVIEW.md` §6.

---

## 8. Validator API (`scripts/figure-manifest.js`)

Dependency-free CommonJS. Requiring the module runs no CLI and reads no files.
Every function returns `{ errors: string[] }` (empty ⇒ valid) or throws only from
the `assert*` wrappers; none mutate their inputs.

| Export | Purpose |
|--------|---------|
| `SCHEMA_VERSION`, `STANDALONE_BUDGET_BYTES`, `EXTRACTION_METHODS`, `ASSET_LIMITS`, `ASSET_DIR`, `SOURCE_DIR`, `SVG_ELEMENTS`, `SVG_COMMON_ATTRS`, `SVG_PAINT_ATTRS`, `SVG_NAMESPACE`, `PNG_ALLOWED_CHUNKS` | Contract constants (also drive the tests). |
| `sha256Hex(buf)`, `crc32(buf)` | Checksums (CRC-32 is a local table impl; no `zlib.crc32` dependency, Node 20-safe). |
| `isAllowedPaintValue(decodedValue)` → `boolean` | The fail-closed `fill`/`stroke`/`color` value policy (§5.1), exposed for tests. |
| `checkSafeRelativePath(p, label)` → `string\|null`, `isSafeRelativePath(p)`, `assertSafeRelativePath(p, label)` | Path-safety primitives (§3). |
| `validateSvg(bufferOrString, opts?)` | Restricted SVG subset (§5.1). |
| `validatePng(buffer, opts?)` → `{ errors, info }` | Restricted PNG subset (§5.2); `info` carries width/height/colorType when `IHDR` parsed. |
| `validateManifestShape(manifest)` | Root shape, fields, types, dup ids/paths, source registry (pure). |
| `validateManifestAgainstQuestions(manifest, banks)` | Every mapped question → exactly one same-pool entry; every entry referenced (pure; reuses `figure-references.js`). |
| `validateManifestAssets(manifest, { repoRoot, fs? })` | On-disk: containment + symlink rejection, extension↔content agreement, subset validity, exact `sha256`, source-PDF existence + checksum, unlisted assets under the figure root. |
| `validateFigurePipeline(manifest, { banks?, repoRoot?, fs?, continueOnShapeErrors? })` | Runs shape, then (if usable) questions + assets; returns deduped, sorted errors. |
| `assertFigurePipeline(manifest, opts)` | Throws a single multi-line `Error` if `validateFigurePipeline` reports any error. |
| `listAssetFiles(repoRoot, fs)` | Sorted repo-relative list of `*.svg`/`*.png` under `assets/figures/`. |

`banks` accepts either `{ pool: Question[] }` or the build's
`{ pool: { questions: Question[] } }` shape.

---

## Production integration

**Wired and mandatory (Stage 2D).** `scripts/build.js` `main()`:

1. Loads the three pools (`loadPool`), which runs the Stage 2A per-pool
   reference gate (`figureReferences.assertPoolFigureReferences`) and assembles
   `banks = { technician|general|extra: { title, questions } }`.
2. **Immediately after `banks` is assembled — and before the first output
   mutation** — calls `assertFigureManifest(banks)`, which reads and parses
   `data/figures.json` (an unreadable file or invalid JSON is a build error
   naming the manifest) and then calls:

   ```js
   figureManifest.assertFigurePipeline(manifest, {
     banks,             // the three loaded pools
     repoRoot: ROOT,    // scripts/build.js already computes this
     fs                 // the real fs
   });
   ```

3. Any schema, question-cross-reference, asset-format/content, checksum
   (asset **or** source PDF), path-safety, unlisted-asset, or
   missing-source-PDF error throws. `main()` is called unguarded, so the throw
   exits nonzero **before** `fs.mkdirSync(OUT_DIR)`, `fs.writeFileSync(OUT_FILE)`,
   `fs.rmSync(PWA_OUT_DIR)`, the PWA writes, or any icon/manifest copy — a
   pre-existing `dist/` tree is left byte-identical, and no `dist/` is created
   where none existed.
4. There is **no** skip flag, optional mode, missing-source fallback, network
   fetch, or figure-extraction step. Source PDFs are committed inputs; a missing
   one fails the build.

Regression coverage: `tests/unit/build-gate.test.js` drives `node scripts/build.js`
inside isolated temp-repo fixtures (real inputs never mutated) for a valid build
plus every failure mode, and asserts output preservation on failure.

Packaging (Stage 3) then owns embedding the assets and enforcing the finished
1 MiB standalone size.

---

## Open design decisions for later slices

- **PWA packaging**: inline figures into the shell vs. precache them as separate
  cached files — deferred to Stage 3 (listed in the plan's decision points).
- **PNG vs SVG**: *resolved (Stage 2C).* All 14 source figures are embedded
  raster images inside the pool PDFs, so all 14 assets are `raster-export` PNG.
  Vector SVG was not viable without redrawing.
- **`alt` review workflow**: *resolved (Stage 2C).* The side-by-side fidelity
  record lives in [`docs/FIGURE_REVIEW.md`](FIGURE_REVIEW.md) (per-figure
  sections + a sign-off table), not in `manifest.review.notes`.
- **Asset encoding**: *resolved.* Adopted **16-level grayscale (`g16`, colour
  type 0 / bit depth 4)** for 13 figures; **E5-1 kept at 8-bit**. See
  `docs/FIGURE_OPTIMIZATION.md` (experiment) and `scripts/figure-extract.js`.
  `p4` (4-colour) is a documented future size lever if Stage 3 code overruns the
  allowance.
