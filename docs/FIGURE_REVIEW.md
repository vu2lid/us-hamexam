# Figure fidelity review (Stage 2C)

This document records the acquisition and fidelity evidence for the 14 official
NCVEC exam figures that 44 questions depend on. It is the human-review tracking
artifact called for by [`docs/FIGURE_PIPELINE.md`](FIGURE_PIPELINE.md) §6.

**Reviewer disclosure.** The comparisons below were performed by an automated
agent: each source PDF page and each extracted asset was rendered and inspected
visually, and structural checks were scripted. This is **not** independent human
approval. **A qualified human fidelity review of every figure remains PENDING**
(see [status](#review-status)). Nothing here should be read as sign-off.

**Encoding update.** The 13 non-E5-1 assets were re-encoded from 8-bit grayscale
to 16-level grayscale (`g16`, colour type 0 / bit depth 4) on the user's visual
authorisation after the Stage 2 optimisation experiment
([`docs/FIGURE_OPTIMIZATION.md`](FIGURE_OPTIMIZATION.md)). E5-1 is unchanged. §2,
§6, and §7 reflect this; the source-provenance and monochrome analysis (§1, §3)
predate it and still hold.

---

## 1. Source provenance

All three pool PDFs were already present in the working tree under
`data/pool-sources/`. As of Stage 2C they are **tracked**: `.gitignore` still
excludes everything else under that directory (e.g. `pdftotext` dumps) but has
three narrow `!` exceptions for `technician.pdf`, `general.pdf`, and
`extra.pdf`, so a fresh checkout can reproduce the extraction and the full
provenance validation. On **2026-09-07** each file was re-downloaded from the
current NCVEC release page and confirmed **byte-for-byte identical** (SHA-256)
to the working-tree copy; the file timestamps are 2026-08-28 (original
retrieval). Combined size of the three PDFs: ~1.87 MiB.

| Registry id (`data/figures.json`) | Edition | Release page (`url`) | Exact PDF downloaded | SHA-256 | Bytes | Pages |
|---|---|---|---|---|---|---|
| `technician-2026-2030` | 2026–2030 Technician (Element 2), released 2025-12-18, **19 Feb 2026 errata**; effective 2026-07-01 → 2030-06-30 | https://www.ncvec.org/index.php/2026-2030-technician-question-pool | `2026-2030 Technician Pool and Syllabus Public Release Feb 19 2026.pdf` | `3618649d64df77f2cf217fa79ef82094fe5d2d41b26d20ce08c46ca1c3d5055a` | 480,239 | 79 |
| `general-2023-2027` | 2023–2027 General (Element 3), released 2022-12-01, **6th errata 4 Feb 2026**; effective 2023-07-01 → 2027-06-30 | https://www.ncvec.org/index.php/2023-2027-general-question-pool-release | `General Class Pool and Syllabus 2023-2027 Public Release with 6th Errata Feb 4 2026.pdf` | `0627221fe69014b3015e97b44d3552a119ef7370144da8de9d02719c91cfa433` | 487,877 | 87 |
| `extra-2024-2028` | 2024–2028 Amateur Extra (Element 4), released 2023-12-07, **4th errata 4 Feb 2026**; effective 2024-07-01 → 2028-06-30 | https://www.ncvec.org/index.php/2024-2028-extra-class-question-pool-release | `2024-2028 Extra Class Question Pool and Syllabus Public Release with 4th Errata Feb 4 2026.pdf` | `9cc63ae0c1c9ee63a617824555d5b4e73da8c8edb91566f97a66770eb200f517` | 952,745 | 121 |

Each PDF is the *combined pool + syllabus* release, which includes the figure
pages. NCVEC also publishes figure-only PDFs (`…Technician Pool 3 Diagrams.pdf`,
`G7-1.pdf`, `Extra_Figures_2024-2028-1.pdf`); the combined pool PDF was used
because it is the file the repository already tracks and it is the authoritative
document for the edition/errata level of each question bank.

**Edition compatibility.** `src/app.js` pool metadata records exactly these
editions and errata dates (`errata: "February 19, 2026 errata"`, `"6th errata
February 4, 2026"`, `"4th errata February 4, 2026"`). The question banks and the
source PDFs agree; **no discrepancy** was found. The newest published pools were
*not* substituted — the 2026–2030 Technician pool is genuinely the one this bank
targets (effective 2026-07-01).

**Reuse.** The NCVEC pool release pages state that NCVEC *"releases into public
domain"* the question pools, and that adopters are *"free to correct minor
typographical and punctuation errors."* No licence text is embedded in the PDFs
themselves. Attribution to NCVEC / the Question Pool Committee (pool author:
Maria Somma, AB1FM) is customary and is retained in `src/app.js` and the app UI.
A human should confirm attribution wording before release.

---

## 2. Extraction method

Every one of the 14 figures is an **embedded raster image** inside its pool PDF
(confirmed with `pdfimages -list`: the figure pages carry image XObjects and no
vector drawing operators). Automated PDF→SVG export (`pdftocairo -svg`,
attempted on the Technician figure page) produces `<use>` glyph references,
`<clipPath>`, `<image>`, and `xlink:href` — none of which are in the fail-closed
SVG subset, and normalising them by hand for 14 figures would risk fidelity.
Because the sources are already raster, a **faithful PNG raster-export** is the
correct choice and no validator change is warranted (see
[§5](#5-validator-notes)).

Pipeline — `scripts/figure-extract.js` (dependency-free Node; shells out to the
tools below; **not** wired into the build):

1. `pdfimages -png -f <page> -l <page>` extracts the embedded image at its
   **native resolution** — no re-rasterisation, no scaling. The base image is
   the even-indexed output; the odd-indexed companion is its soft mask.
2. The soft mask of every masked figure was measured to be **fully opaque**
   (min = max = 255), so it is a no-op; the base image is flattened onto white
   and alpha is dropped (`convert -background white -alpha remove -alpha off`).
3. `convert -colorspace Gray` — **every figure is monochrome black line art**
   (see [§3](#3-monochrome-determination)). For the JPEG-compressed Extra
   figures this also removes chroma-subsampling fringe; for the already-gray
   Technician and General images it is a no-op. This is the **8-bit baseline**.
4. Per-figure encoding (`encoding` field in `scripts/figure-extract.js`):
   - **`grayscale8` — E5-1 only.** `optipng -o5 -strip all` on the 8-bit
     baseline. E5-1 keeps its exact Stage 2C bytes: its background is value 254
     (not pure white) and a contrast stretch reveals faint pre-existing ghost
     artefacts in NCVEC's raster; the 16-level step in `g16` posterises the
     background to a visible gray and amplifies those artefacts (see
     `docs/FIGURE_OPTIMIZATION.md`).
   - **`g16` — the other 13 figures.** A **lossy** 16-level grayscale
     quantisation of the 8-bit baseline, adopted after the Stage 2 optimisation
     experiment on the user's visual authorisation:
     `convert <8-bit baseline> -colorspace Gray +dither -depth 4 -strip
     -define png:exclude-chunks=bkgd,date,time,text`, then
     `optipng -o7 -strip all`. Output = PNG colour type 0, **bit depth 4**.
     The quantisation input is always the fresh 8-bit baseline from the PDF —
     committed assets are never re-quantised.

Output: `assets/figures/<pool>/<id>.png`, grayscale (colour type 0),
non-interlaced, chunks limited to `IHDR`/`IDAT`/`IEND`; bit depth **4** for the
13 `g16` figures, **8** for E5-1.

**Reproducibility.** `node scripts/figure-extract.js --check` re-runs the whole
pipeline in a temp dir and byte-compares against the committed assets. Verified
identical on this machine with:

| Tool | Version |
|---|---|
| poppler `pdfimages` | 24.02.0 |
| ImageMagick `convert` | 6.9.12-98 Q16 |
| `optipng` | 0.7.8 |

Exact output bytes depend on these tool versions; the committed asset bytes and
their `sha256` in `data/figures.json` are the contract that the validator
enforces.

---

## 3. Monochrome determination

Per-figure pixel analysis (chroma of non-white "ink" pixels):

- **T-1, T-2, T-3, G7-1** — 0 coloured pixels; the embedded images are already
  grayscale.
- **All 10 Extra figures** — the only non-neutral pixels are complementary
  orange `(173, 94, 35)` / cyan `(35, 139, 204)` pairs, present in near-equal
  counts and scattered along every black edge across the whole image. This is
  the unambiguous signature of JPEG 4:2:0 chroma ringing, not authored colour
  (authored colour would be localised and unbalanced). E5-1 has the most
  (~4,000 px, 0.6%); RMSE between the colour render and its grayscale is < 0.01.

Grayscale conversion is therefore faithful and removes a compression artifact.
No figure carries information-bearing colour.

---

## 4. Per-figure review

Asset facts are from `data/figures.json` and `identify`. "Agent inspection"
compares the committed PNG against a 150 dpi render of the source PDF page.
Every figure: **human fidelity review PENDING.**

### T-1 — `assets/figures/technician/t-1.png`
- Source: `technician-2026-2030`, **PDF page 78** (image XObject 155, 1800×1200 @ 300 ppi). Asset 18,778 B (was 29,567 B 8-bit), 1800×1200, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (native-resolution embedded image; already grayscale).
- Agent inspection: transistor amplifier schematic. Call-outs 1–5 present and legibly placed; series component, three-terminal device, bulb, battery, input jack, and both ground symbols render crisply; wire connectivity and the caption "Figure T-1" match the source. No clipping, no added/removed marks.
- Alt-text review (T6C02, T6C03, T6C04, T6C05, T6D10 — each asks "what is / what is the function of component N"): alt names only "five individually numbered component call-outs and two ground symbols" — it does not identify any component or hint a component type. OK.
- Outstanding: none beyond pending human review.

### T-2 — `assets/figures/technician/t-2.png`
- Source: `technician-2026-2030`, **PDF page 79** (image XObject 158, 1800×1200 @ 300 ppi). Asset 23,570 B (was 36,920 B 8-bit), 1800×1200, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (already grayscale).
- Agent inspection: AC-source → transformer → rectifier/filter/divider schematic. All ten call-outs present; switch, transformer winding dots, diode orientation, capacitor, LED emission arrows, potentiometer wiper, and grounds are legible and match the source. Caption present.
- Alt-text review (T6A09 "type of switch is component 3", T6C06/07/08/09 "what is component 6/8/9/4"): alt says only "ten individually numbered component call-outs … a source … an output terminal … ground symbols" — no component named, no type hinted. OK.
- Outstanding: none beyond pending human review.

### T-3 — `assets/figures/technician/t-3.png`
- Source: `technician-2026-2030`, **PDF page 79** (image XObject 159, 1800×1200 @ 300 ppi). Asset 14,609 B (was 22,073 B 8-bit), 1800×1200, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (already grayscale).
- Agent inspection: antenna matching network. Call-outs 1–4, both variable capacitors (arrows), the tapped/variable inductor arrow, the antenna symbol, junction dots, and ground match the source. Caption present.
- Alt-text review (T6C10 "component 3", T6C11 "component 4"): alt says "small matching network with four individually numbered component call-outs and a ground symbol" — nothing identified. OK.
- Outstanding: none beyond pending human review.

### G7-1 — `assets/figures/general/g7-1.png`
- Source: `general-2023-2027`, **PDF page 87** (image XObject 175 + fully-opaque smask, 1845×1455 @ 264 ppi). Asset 31,294 B (was 59,893 B 8-bit), 1845×1455, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (indexed source + opaque smask → flatten → grayscale).
- Agent inspection: two-stage RF amplifier. All eleven numbered symbols present and distinct (FET-in-circle, BJT-in-circle, two diode variants, zener, transformer, tapped inductor, capacitors, resistor, potentiometer); `+DC` and `OUT` labels, junction dots, and every ground match the source. Caption present.
- Alt-text review (G7A09–G7A13 "which symbol represents a FET / Zener / NPN / transformer / tapped inductor"): alt says "eleven individually numbered component call-outs, a positive supply rail marked plus DC, and an output terminal marked OUT" — it does not say which number is which device. OK.
- Outstanding: none beyond pending human review.

### E5-1 — `assets/figures/extra/e5-1.png`
- Source: `extra-2024-2028`, **PDF page 119**, image XObject 238 (817×805 @ 264 ppi). Asset 22,225 B, 817×805, grayscale, bit depth 8 (unchanged from Stage 2C — the `g16` exception).
- Extraction: raster-export (RGB JPEG + opaque smask → flatten → grayscale; chroma fringe removed).
- Agent inspection: rectangular R–X (X-/Y-axis) grid, −600…600 on each axis, eight dots labelled "Point 1"…"Point 8" at the same coordinates as the source; axis labels `+X −X +Y −Y` present. Grid lines and point labels legible. Caption present.
- Alt-text review (E5C10/11/12 "which point best represents the impedance of a series R–C / R–L circuit"): alt states only the grid extent and that eight labelled points exist — it does not associate any point with an impedance. OK.
- Outstanding: none beyond pending human review.

### E6-1 — `assets/figures/extra/e6-1.png`
- Source: `extra-2024-2028`, **PDF page 119**, image XObject 240 (801×570 @ 258 ppi). Asset 12,377 B (was 15,727 B 8-bit), 801×570, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (→ grayscale).
- Agent inspection: six FET symbols in circles, numbered 1–6; gate-arrow direction, channel-line style, and the `G/D/S` (and `G1/G2` on 4 and 5) labels are legible and match the source.
- Alt-text review (E6A10 "N-channel dual-gate MOSFET", E6A11 "P-channel JFET"): alt says "six numbered semiconductor schematic symbols … leads marked G, D, and S (symbols 4 and 5 also marked G1 and G2)" — a visible structural fact; it does not say which number is which type. OK.
- Outstanding: fine details (arrowhead fill) are near the resolution limit of the source JPEG; legible at display size. Pending human review.

### E6-2 — `assets/figures/extra/e6-2.png`
- Source: `extra-2024-2028`, **PDF page 119**, image XObject 242 (826×540 @ 267 ppi). Asset 9,685 B (was 14,110 B 8-bit), 826×540, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (→ grayscale).
- Agent inspection: eight diode-family symbols numbered 1–8; distinguishing marks (varactor plate, back-to-back pair, cathode-bar variants, light-emission arrows on 5, optocoupler circles on 7 and 8) are all visible and match the source.
- Alt-text review (E6B10 "which is a Schottky diode"): alt says "eight numbered two- and three-terminal semiconductor schematic symbols built on the diode triangle-and-bar shape" — no symbol identified. OK.
- Outstanding: none beyond pending human review.

### E6-3 — `assets/figures/extra/e6-3.png`
- Source: `extra-2024-2028`, **PDF page 119**, image XObject 244 (790×533 @ 255 ppi). Asset 7,739 B (was 9,642 B 8-bit), 790×533, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (→ grayscale).
- Agent inspection: six logic-gate symbols numbered 1–6; gate body shapes and the inversion bubbles on 2, 4, and 5, and the doubled input arc on 6, are clearly present and match the source.
- Alt-text review (E6C08 NAND, E6C10 NOR, E6C11 NOT): alt says "six numbered digital logic gate schematic symbols, each with input lines … and one output line" — it does not enumerate gate types. OK.
- Outstanding: none beyond pending human review.

### E7-1 — `assets/figures/extra/e7-1.png`
- Source: `extra-2024-2028`, **PDF page 120**, image XObject 249 (796×674 @ 257 ppi). Asset 11,783 B (was 14,034 B 8-bit), 796×674, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (→ grayscale).
- Agent inspection: single-transistor stage. `IN`, `OUT`, `+`, `R1`, `R2`, `R3`, `C1`, `C2`, `C3` labels legible; bias divider, emitter network, coupling capacitors, transistor, and grounds match the source. Caption present.
- Alt-text review (E7B10 "purpose of R1 and R2", E7B11 "purpose of R3", E7B12 "type of amplifier circuit"): alt restates only printed labels (`IN`, `OUT`, `R1`–`R3`, `C1`–`C3`) and calls it a "single-transistor circuit" — it does not state the amplifier class or the roles of R1/R2/R3. OK.
- Outstanding: none beyond pending human review.

### E7-2 — `assets/figures/extra/e7-2.png`
- Source: `extra-2024-2028`, **PDF page 120**, image XObject 251 (782×657 @ 252 ppi). Asset 12,747 B (was 15,751 B 8-bit), 782×657, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (→ grayscale).
- Agent inspection: `+25`, `+12`, `Q1`, `D1`, `R1`, `R2`, `C1 4000`, `C2 4000`, `C3 0.01` labels all legible; pass transistor, shunt reference diode, and grounds match the source. Caption present.
- Alt-text review (E7D06 "purpose of Q1", E7D07 "purpose of C2", **E7D08 "what type of circuit is shown"**): alt was revised to drop the words "voltage regulator" — it now says only "a circuit with a 25-volt input … a 12-volt output … transistor Q1, semiconductor D1 …". It does not name the circuit type or the component roles. OK.
- Outstanding: none beyond pending human review.

### E7-3 — `assets/figures/extra/e7-3.png`
- Source: `extra-2024-2028`, **PDF page 120**, image XObject 253 (738×614 @ 238 ppi). Asset 7,657 B (was 9,754 B 8-bit), 738×614, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (→ grayscale).
- Agent inspection: op-amp triangle with `−`/`+` inputs, `R1` in series with the inverting input, `R`\_`F` feedback across the amp, output node, and grounds — matches the source. The `F` subscript on `RF` renders. Caption present.
- Alt-text review (E7G07/09/10/11 — numeric gain / output-voltage calculations): alt restates only the printed labels and topology; it contains no numbers and no computed result. OK.
- Outstanding: none beyond pending human review.

### E9-1 — `assets/figures/extra/e9-1.png`
- Source: `extra-2024-2028`, **PDF page 120**, image XObject 255 (759×649 @ 245 ppi). Asset 26,082 B (was 32,946 B 8-bit), 759×649, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (→ grayscale).
- Agent inspection: full polar pattern, main lobe toward 0°, one rear lobe and side structure; azimuth labels every 30° (`0 … 180 … −150 … −30`), ring labels `−3 −6 −12 −24`, and the "Free-Space Pattern" caption match the source lobe geometry.
- Alt-text review (E9B01 "3 dB beamwidth", E9B02 "front-to-back ratio", E9B03 "front-to-side ratio"): alt describes plot structure and the printed ring labels only — it states none of the measured values. OK.
- Outstanding: reading a beamwidth to the degree depends on the source raster's own resolution; the shape needed for the question is preserved. Pending human review.

### E9-2 — `assets/figures/extra/e9-2.png`
- Source: `extra-2024-2028`, **PDF page 121**, image XObject 259 (760×581 @ 245 ppi). Asset 20,312 B (was 30,632 B 8-bit), 760×581, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (→ grayscale).
- Agent inspection: half-polar (0°–180°) pattern with several low-elevation lobes; radial dB scale `−40 −30 −20 −10`, angle labels `0 30 60 90 120 150 180`, and the "Over Real Ground" caption match the source.
- Alt-text review (E9B04 "front-to-back ratio", **E9B05 "what type of antenna pattern"**, E9B06 "elevation angle of peak response"): alt was revised to drop the word "elevation" — it now says "a half-polar antenna radiation pattern plot titled Over Real Ground". The words "Over Real Ground" are the figure's own printed title (visible to any sighted user), not an answer to E9B05 (which is answered by the pattern *type*). No measured value stated. OK — but see concern.
- Outstanding: the printed title "Over Real Ground" is inherent to the figure; a human reviewer should confirm quoting the on-figure title in alt text is acceptable for E9B05. Pending human review.

### E9-3 — `assets/figures/extra/e9-3.png`
- Source: `extra-2024-2028`, **PDF page 121**, image XObject 261 (395×366 @ 126 ppi). Asset 10,631 B (was 12,653 B 8-bit), 395×366, grayscale, bit depth 4 (`g16`, re-encoded from the 8-bit baseline).
- Extraction: raster-export (native-resolution embedded image; this is the **lowest-resolution source** of the 14).
- Agent inspection: Smith chart — resistance circles, reactance arcs, horizontal centreline, and scale labels `0 0.2 0.5 1.0 2.0 5.0 ∞`. Structure matches the source. The small scale numerals are soft but readable; this is the resolution of NCVEC's own embedded image and cannot be improved without redrawing.
- Alt-text review (E9G06 "name for the large outer circle", E9G07 "the only straight line shown"): alt says only "a Smith chart drawn with its standard curved impedance-coordinate grid and numeric scale markings" — it deliberately does **not** mention the outer circle or the straight centreline. OK.
- Outstanding: low source resolution — legible at display size but a human reviewer should confirm the numerals are adequate, and decide whether Stage 3 should offer zoom (already a Stage 3 deliverable) or whether this one figure warrants sourcing NCVEC's standalone `Extra_Figures_2024-2028-1.pdf` for a higher-resolution copy. Pending human review.

---

## 5. Validator notes

No change to `scripts/figure-manifest.js` or the contract was needed — the
restricted PNG subset already accepts colour type 0 at bit depths 1/2/4/8/16, so
the 13 `g16` assets (colour type 0, bit depth 4) and E5-1 (bit depth 8) all pass
`validatePng` unmodified; chunks stay `IHDR`/`IDAT`/`IEND`. The restricted SVG
subset is not designed for automated PDF→SVG export, but that is by design; all
14 sources are raster. `raster-export` is the recorded `extractionMethod` for
all 14; none require a `review` block (only `hand-tracing` does).

`validateFigurePipeline({ banks, repoRoot, fs })` returns zero errors against the
real manifest, the three real banks, the committed assets, and the source PDFs.

---

## 6. Size and packaging implications

Sizes of the **committed assets** — 13 figures at `g16` (bit depth 4), E5-1 at
8-bit (`*`):

| Figure | bytes | base64 | | Figure | bytes | base64 |
|---|--:|--:|---|---|--:|--:|
| T-1  | 18,778 | 25,040 | | E7-1 | 11,783 | 15,712 |
| T-2  | 23,570 | 31,428 | | E7-2 | 12,747 | 16,996 |
| T-3  | 14,609 | 19,480 | | E7-3 | 7,657 | 10,212 |
| G7-1 | 31,294 | 41,728 | | E9-1 | 26,082 | 34,776 |
| E5-1`*` | 22,225 | 29,636 | | E9-2 | 20,312 | 27,084 |
| E6-1 | 12,377 | 16,504 | | E9-3 | 10,631 | 14,176 |
| E6-2 | 9,685 | 12,916 | | **Σ (14)** | **229,489** | **306,008** |
| E6-3 | 7,739 | 10,320 | | | | |

Aggregate: **229,489 B on-disk (224.1 KiB)** / **306,008 B as base64
(298.8 KiB)** — down from the 8-bit total of 325,927 B / 434,592 B. Largest
single asset: G7-1, 31,294 B (was 59,893 B); every asset is well under the
512 KiB per-PNG contract limit. `base64` = `ceil(bytes/3)*4`, i.e. the exact
length of `Buffer.from(png).toString("base64")`.

**Standalone embedding estimate — ESTIMATE, not a compliance claim.** Stage 3 is
not built; assets are not embedded yet.

| Component | Bytes | Basis |
|---|--:|---|
| `dist/index.html` today | 633,892 | measured |
| + figure base64 (adopted encoding) | 306,008 | measured |
| + `data:image/png;base64,` prefixes × 14 | 308 | 22 chars × 14 |
| + figure-registry keys / wrapper / inlined `alt` text | ~3,000 | **estimate** |
| **Projected `dist/index.html`** | **≈ 943,208** | **estimate** |
| Budget | 1,048,576 | fixed |
| **Projected room under budget** | **≈ 105,368** | **estimate** |
| − provisional Stage 3 allowance (code, CSS, UI markup) | 65,536 | 64 KiB planning allowance (not a budget change) |
| **Estimated free after allowance** | **≈ 39,832 B** | **estimate** |

The bounded encoding experiment that produced this choice — every candidate
(`g16`, `g4`, `p16`, `p4`, `bw`, lossless-only) and its measurements — is
preserved in [`docs/FIGURE_OPTIMIZATION.md`](FIGURE_OPTIMIZATION.md) as a
historical record. `p4` remains a documented future size lever. PWA precaching
does **not** relieve the standalone budget. Final 1 MiB compliance can only be
established once Stage 3 embeds the assets.

---

## 7. Review status

Three **distinct** kinds of evidence — do not conflate them:

- **Agent structural check** — automated: `validateFigurePipeline` (schema,
  checksums, safe PNG subset, cross-references) plus the encoding regression
  tests (`tests/unit/figure-manifest.test.js` → "adopted figure encoding").
- **Agent visual inspection** — an AI agent rendered each source-PDF page and
  each asset and compared them, and (for this slice) compared the 8-bit
  baseline against its `g16` re-encode. Not a human review.
- **User visual feedback / authorisation** — the user inspected multiple
  encoding candidates during the Stage 2 optimisation experiment, judged the
  quality acceptable, and **authorised adopting `g16` for 13 figures with E5-1
  left at 8-bit**. This is feedback + go-ahead for the encoding choice; it is
  **not** a formal per-figure comparison of each asset against the official
  source PDF.
- **Human source-PDF fidelity sign-off** — a qualified human placing each asset
  beside its source-PDF page and confirming every label/number/connection/
  symbol/axis/orientation. **Still PENDING for all 14 figures.**

| Figure | Agent structural | Agent visual | User authorised encoding | **Human source-PDF sign-off** |
|---|---|---|---|---|
| T-1 | pass | pass | yes (`g16`) | **PENDING** |
| T-2 | pass | pass | yes (`g16`) | **PENDING** |
| T-3 | pass | pass | yes (`g16`) | **PENDING** |
| G7-1 | pass | pass | yes (`g16`) | **PENDING** |
| E5-1 | pass | pass | yes (kept 8-bit) | **PENDING** |
| E6-1 | pass | pass (fine detail near source limit) | yes (`g16`) | **PENDING** |
| E6-2 | pass | pass | yes (`g16`) | **PENDING** |
| E6-3 | pass | pass | yes (`g16`) | **PENDING** |
| E7-1 | pass | pass | yes (`g16`) | **PENDING** |
| E7-2 | pass | pass | yes (`g16`) | **PENDING** |
| E7-3 | pass | pass | yes (`g16`) | **PENDING** |
| E9-1 | pass | pass | yes (`g16`) | **PENDING** |
| E9-2 | pass | pass (confirm on-figure title in alt) | yes (`g16`) | **PENDING** |
| E9-3 | pass | pass (low source resolution) | yes (`g16`) | **PENDING** |

A human reviewer should, for each figure: open the source PDF at the recorded
page, place the committed asset beside it, and confirm every label / number /
connection / symbol / axis / orientation is present and legible with nothing
added or removed; confirm the alt text reveals nothing for any listed question;
and sign and date this table. Until then the figure pipeline is **not** cleared
for Stage 3 rendering.
