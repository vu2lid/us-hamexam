# Figure-encoding experiment (bounded)

> **Status: ADOPTED.** The recommendation below was accepted. The 13 non-E5-1
> assets are now committed as `g16` (colour type 0 / bit depth 4); E5-1 keeps
> its 8-bit bytes. The production recipe lives in `scripts/figure-extract.js`
> (`encoding` field). This document is retained as the **historical experiment
> record** — its measurements were made against the pre-adoption 8-bit assets
> and are not re-run. `p4` remains a documented future size lever.
> Human source-PDF fidelity sign-off is still pending (`docs/FIGURE_REVIEW.md`
> §7).

**Question.** Can all 14 figure assets be embedded in the standalone
`dist/index.html` within its **1,048,576-byte** budget, leaving room for Stage 3
rendering code, without losing exam-relevant detail?

**Answer (this experiment).** Not at the current 8-bit encoding — inlined base64
of the committed assets overshoots the budget. **Yes** with a **16-level
grayscale re-encode (`-depth 4`, no dither)** applied to 13 of 14 figures, with
**E5-1 kept at its current 8-bit encoding** (its off-white background and faint
pre-existing source artifacts posterize badly). Estimated projected
`dist/index.html` ≈ 943,208 B → ≈ 39,832 B free after a 64 KiB Stage 3 planning
allowance.

*At the time of this experiment* it was a **recommendation only** — no
production asset, `data/figures.json`, source PDF, or build/extraction script
was changed by the experiment itself. All 14 figures were visually compared
(§4) — that agent visual review, **not** the pixel metrics (§3), was the basis
for the fidelity claim. The recommendation was subsequently adopted (see the
banner above); human source-PDF fidelity sign-off is still pending
(`docs/FIGURE_REVIEW.md` §7).

---

## 1. Baseline (verified 2026-09-07)

| Measure | Value |
|---|---|
| `dist/index.html` (standalone) | **633,892 B** |
| Standalone budget (`STANDALONE_BUDGET_BYTES`) | **1,048,576 B** |
| Headroom today | **414,684 B** |
| 14 assets, aggregate on-disk | **325,927 B** (318.3 KiB) |
| 14 assets, aggregate **actual base64** | **434,592 B** (424.4 KiB) |

All 14 committed assets are PNG **colour type 0 (grayscale), bit depth 8**,
non-interlaced, chunks `IHDR/IDAT/IEND` only (already metadata-clean).

Per-figure baseline (bytes / exact base64 / W×H):

| Fig | bytes | base64 | W×H | | Fig | bytes | base64 | W×H |
|---|--:|--:|--:|---|---|--:|--:|--:|
| T-1  | 29,567 | 39,424 | 1800×1200 | | E7-1 | 14,034 | 18,712 | 796×674 |
| T-2  | 36,920 | 49,228 | 1800×1200 | | E7-2 | 15,751 | 21,004 | 782×657 |
| T-3  | 22,073 | 29,432 | 1800×1200 | | E7-3 | 9,754 | 13,008 | 738×614 |
| G7-1 | 59,893 | 79,860 | 1845×1455 | | E9-1 | 32,946 | 43,928 | 759×649 |
| E5-1 | 22,225 | 29,636 | 817×805  | | E9-2 | 30,632 | 40,844 | 760×581 |
| E6-1 | 15,727 | 20,972 | 801×570  | | E9-3 | 12,653 | 16,872 | 395×366 |
| E6-2 | 14,110 | 18,816 | 826×540  | | | | | |
| E6-3 | 9,642 | 12,856 | 790×533  | | **Σ** | **325,927** | **434,592** | |

**Base64 alone (434,592 B) already exceeds the 414,684 B headroom by ~20 KB**,
before any data-URL prefix, figure registry, alt text, or Stage 3 code.
Inlining the assets as-is does **not** fit.

### Tools

| Tool | Version | Role |
|---|---|---|
| `optipng` | 0.7.8 | lossless PNG recompression, metadata strip |
| ImageMagick `convert` | 6.9.12-98 Q16 | grayscale conversion, depth/palette reduction, threshold |
| `python3` + Pillow + numpy | 3.12.3 / PIL 10.2 / numpy 1.26 | decoded-pixel metrics |
| Node | 24.18.0 | driver + `validatePng` (`scripts/figure-manifest.js`, unmodified) |

No tools were installed. `pngquant` / `zopflipng` / `pngcrush` are **not**
available on this machine (a stronger palette quantiser might do slightly better;
noted as a follow-up, not required).

---

## 2. Reproduction

Helper: **`scripts/figure-optim-experiment.js`** (experiment-only; not wired to
the build). It reads the 14 committed assets, builds every candidate into a
fresh temp dir, runs each through the real `validatePng`, and writes
`results.csv` + all candidate PNGs.

```bash
node scripts/figure-optim-experiment.js                 # all strategies, ~6–8 min (optipng -o7)
node scripts/figure-optim-experiment.js --strategies opt,g16   # subset
node scripts/figure-optim-experiment.js --out /path/to/dir     # fixed output dir
```

Exact per-candidate recipes (native dimensions and orientation preserved
throughout; **no resize, no redraw**):

| Strategy | Command | Lossy? |
|---|---|---|
| `base` | committed asset, untouched | — (reference) |
| `opt` | `optipng -o7 -strip all` | **no** (decoded pixels byte-identical — asserted) |
| `g16` | `convert IN -colorspace Gray +dither -depth 4 -strip -define png:exclude-chunks=bkgd,date,time,text OUT` then `optipng -o7 -strip all` | **yes** — 16 evenly-spaced gray levels `{0,17,…,238,255}`, **no dither** |
| `g4` | as `g16` with `-depth 2` | **yes** — 4 levels `{0,85,170,255}`, no dither |
| `p16` | as `g16` with `-colors 16 -type Palette` (replaces `-depth 4`) | **yes** — 16 **adaptive** grays, colour type 3 |
| `p4` | as `p16` with `-colors 4` | **yes** — 4 adaptive grays |
| `bw` | `convert IN -colorspace Gray -threshold 50% -depth 1 …` then `optipng` | **yes** — 1-bit, hard threshold (comparison only) |

Reduced palettes and thresholding are lossy **even though PNG deflate is
lossless**. `+dither` disables ordered dithering — line art is kept non-dithered
by design; dithered variants were not pursued (they add noise that reads as
stray ink on schematics).

`optipng -o7 -strip all` recompressed **nothing** off the committed assets
(`opt` bytes == `base` bytes for all 14) — the Stage 2C extraction already ran
`optipng -o5`. **The tested optimiser saved nothing. Other lossless approaches
(`zopflipng`, `pngcrush -brute`, per-scanline filter search, custom deflate) are
not installed here and were not evaluated.**

For context on the gap: to fit with the Stage 3 allowance the figure payload
must be **≤ 345,840 B of base64** (`983,040 − (633,892 + 308 + 3,000)`) vs.
**434,592 B today** — an ~89 KB base64 / ~67 KB on-disk reduction. Whether any
lossless method could close that is not established here.

---

## 3. Per-figure comparison

`base` vs `g16` (the recommended lossy encoding). The columns are **coarse
numerical bounds, not a fidelity proof** — the actual fidelity gate is the
visual review in §4. `maxΔ` = largest single-pixel value error; `rmse` over all
pixels; `>64Δ%` = share of pixels shifted by more than 64; `drop` = reference-
dark pixels (<110) that flipped to light (>150); `spur` = reference-light pixels
(>200) that flipped to dark (<110).

**These threshold tests are vacuous for `g16`.** `-depth 4` bounds every pixel
to within one 16-level step (`maxΔ ≤ 16`), so a value under 110 can move to at
most 126 — it can never cross 150, and nothing can shift by more than 64. So
`g16`'s `drop = 0`, `spur = 0`, `>64Δ = 0` are **arithmetic certainties, not
evidence that a thin gray line is still legible**. They mean only "the change is
bounded at one quantisation step." The metrics *are* meaningful for the coarser
candidates — `maxΔ` there is 84 (`g4`) or 127 (`bw`), the thresholds *can*
trigger, and they do (`p4` drop 300–3,004; `bw`/`g4` `>64Δ` up to 2–4 %). Use
them to **rule coarser options out**, and §4 to judge `g16` in.

| Fig | base B / b64 | g16 B / b64 | Δbytes | g16 ct/bd | maxΔ | rmse | >64Δ% | drop | spur |
|---|--:|--:|--:|:--:|--:|--:|--:|--:|--:|
| T-1  | 29,567 / 39,424 | 18,778 / 25,040 | −36% | 0/4 | 16 | 1.64 | 0.00 | 0 | 0 |
| T-2  | 36,920 / 49,228 | 23,570 / 31,428 | −36% | 0/4 | 16 | 1.81 | 0.00 | 0 | 0 |
| T-3  | 22,073 / 29,432 | 14,609 / 19,480 | −34% | 0/4 | 16 | 1.08 | 0.00 | 0 | 0 |
| G7-1 | 59,893 / 79,860 | 31,294 / 41,728 | −48% | 0/4 | 16 | 1.66 | 0.00 | 0 | 0 |
| E5-1 | 22,225 / 29,636 | 16,455 / 21,940 | −26% | 0/4 | 16 | **15.16** | 0.00 | 0 | 0 |
| E6-1 | 15,727 / 20,972 | 12,377 / 16,504 | −21% | 0/4 | 16 | 1.50 | 0.00 | 0 | 0 |
| E6-2 | 14,110 / 18,816 | 9,685 / 12,916 | −31% | 0/4 | 16 | 1.49 | 0.00 | 0 | 0 |
| E6-3 | 9,642 / 12,856 | 7,739 / 10,320 | −20% | 0/4 | 16 | 1.26 | 0.00 | 0 | 0 |
| E7-1 | 14,034 / 18,712 | 11,783 / 15,712 | −16% | 0/4 | 16 | 1.44 | 0.00 | 0 | 0 |
| E7-2 | 15,751 / 21,004 | 12,747 / 16,996 | −19% | 0/4 | 16 | 1.73 | 0.00 | 0 | 0 |
| E7-3 | 9,754 / 13,008 | 7,657 / 10,212 | −21% | 0/4 | 16 | 1.34 | 0.00 | 0 | 0 |
| E9-1 | 32,946 / 43,928 | 26,082 / 34,776 | −21% | 0/4 | 16 | 2.44 | 0.00 | 0 | 0 |
| E9-2 | 30,632 / 40,844 | 20,312 / 27,084 | −34% | 0/4 | 16 | 2.16 | 0.00 | 0 | 0 |
| E9-3 | 12,653 / 16,872 | 10,631 / 14,176 | −16% | 0/4 | 16 | 3.03 | 0.00 | 0 | 0 |

`g16` on every figure: `maxΔ = 16` (one quantisation step); `>64Δ`, `drop`, and
`spur` are `0` **by construction** (see the note above), not by measurement. The
only non-trivial number is `rmse`, which is ≤ 3.0 everywhere except **E5-1
(15.16)** — E5-1's off-white background posterising, not detail loss (§4). What
this table *does* establish: `g16` never moves a pixel by more than ~7 % of full
scale. Whether that leaves every thin line, dot, and numeral **legible** is the
§4 visual review's call.

### Aggregate by strategy (all 14 figures)

`worst drop` / `worst spur` = max over the 14 figures of the dropout / spurious
counts. **Zero is meaningful only where `maxΔ` is large enough for the test to
fire** (`g4`, `bw`, `p4`); for `g16`/`p16` it is arithmetically forced.

| Strategy | bytes | **base64** | validator | maxΔ | worst drop | worst spur | notes |
|---|--:|--:|:--:|--:|--:|--:|---|
| `base` / `opt` | 325,927 | **434,592** | all pass | 0 | 0 | 0 | `opt` = 0 byte gain (one optimiser only) |
| **`g16`** | 223,719 | **298,312** | all pass | 16 | 0 † | 0 † | recommended; †forced zero — §4 is the evidence |
| `g4` | 149,383 | 199,204 | all pass | 84 | 0 | 0 | test *can* fire; visible AA-halo banding; E5-1 bg → mid-gray |
| `p16` | 226,707 | 302,296 | all pass | 20–38 | 0 † | 0 † | fidelity ≈ g16, but **larger** overall (esp. G7-1) |
| `p4` | 121,496 | 162,012 | all pass | 51–84 | **up to 3,004** | 0 | adaptive 4-colour drops thin AA line pixels — **reject** |
| `bw` | 71,156 | 94,892 | all pass | 57–127 | 0 * | 0 | *hard threshold: a dark pixel can't "drop", but thin *gray* lines vanish — see §4 — **reject as general** |

Every candidate — including `bw` and `p4` — **passes the unmodified
`validatePng`** (colour type 0 bit depths 1/2/4/8 and colour type 3 are all in
the accepted subset; chunk lists stayed `IHDR[/PLTE]/IDAT/IEND`). The validator
does not decode pixels, so passing it is **not** a fidelity statement.

---

## 4. Visual inspection (agent, at native + 1–3× nearest-neighbour zoom)

**All 14 figures were compared** (`base | g16 | g4 | bw`), across two montage
batches — regeneration recipe in §7. This is the fidelity gate for the `g16`
recommendation (the §3 numbers do not decide it). Agent inspection only —
**human review still required** (§8).

Checks per figure: small numbers/letters · thin wires & grid lines · junction
dots vs crossing lines · arrowhead direction & fill · semiconductor
channel/gate distinctions · chart scales & component call-outs.

Summary: `g16` was **visually indistinguishable from the 8-bit baseline on all
13 recommended figures**; the only visible `g16` change anywhere is E5-1's
background (which is why E5-1 is excluded). `g4` adds a light-gray posterisation
halo around curved strokes (clearest where a symbol sits in a circle). `bw`
removes anti-aliasing everywhere and fragments the thin polar/Smith grids.

| Figure (questions) | Detail that matters | `g16` | `g4` | `bw` |
|---|---|---|---|---|
| **T-1** (T6C02–05, T6D10) | resistor / transistor bar+arrow / lamp filament arc / battery plate pairs / connector fork; caption | **indistinguishable from base** | gray halo around transistor circle; all symbols identifiable | thinner, no halo; all symbols legible; caption slightly jagged |
| **T-2** (T6A09, T6C06–09) | numbered nodes, diode/LED/zener triangles & orientation, SPST switch, junction dots | **indistinguishable** | detail present; faint posterised speckle near edges | lines thinned, numerals jagged; triangles & dots still clear |
| **T-3** (T6C10–11) | two variable-cap arrows, tapped-inductor coil + tap arrow, antenna, junction dots | **indistinguishable** | near-identical (sparse figure, little halo) | thinner; arrows, coil turns, dots all clear |
| **G7-1** (G7A09–13) | 11 symbols incl. FET vs BJT, Zener, transformer core, tapped-inductor arrow; small "1…11" | **indistinguishable** | **visible light-gray halo/banding** around circles & wires; still legible | clean (no halo); thinner lines; caption slightly jagged |
| **E5-1** (E5C10–12) | ±600 grid, 8 "Point N" dots + labels | grid/points/labels perfect, **but background tint → visible light gray + white streaks** (see below) | as g16 but background → **mid-gray, looks damaged** | grid/points/labels clean on white; background tint removed |
| **E6-1** (E6A10–11) | gate bar vs broken channel, arrow direction, dual-gate G1/G2, substrate dot | **indistinguishable** | indistinguishable | thinner; substrate dot & internal arrow still resolvable |
| **E6-2** (E6B10) | 8 diode symbols: varactor bar, back-to-back pair, bent tunnel cathode, **LED emission arrows**, optocoupler circles + internal triangles | **indistinguishable** | indistinguishable | emission arrows thinner but present; circles & internal triangles clear; numerals jagged |
| **E6-3** (E6C08/10/11) | gate body shapes, **inversion bubbles** | **indistinguishable** | indistinguishable | fine (thick clean strokes) |
| **E7-1** (E7B10–12) | R1/R2/R3, C1/C2/C3, IN/OUT/+ labels, transistor arrow, junction dots | **indistinguishable** | gray halo around transistor circle; labels/structure fine | thinner, no halo; all labels legible; text slightly jagged |
| **E7-2** (E7D06–08) | +25/+12, Q1, D1 zener cathode, C1 4000 / C2 4000 / C3 0.01 (fraction bars), R1/R2 | **indistinguishable** | gray halo around Q1 & D1 circles; values/labels fine | thinner, no halo; all values legible; zener cathode distinct |
| **E7-3** (E7G07/09/10/11) | op-amp triangle, `−`/`+` inputs, R1, **R_F subscript** | **indistinguishable** | faint double-edge halo on the concave triangle edge; `−`/`+`/R_F clear | triangle edge crisp; `−`/`+`/R_F legible; thin leads lighter |
| **E9-1** (E9B01–03) | bold pattern curve vs **thin polar grid**, dB rings −3/−6/−12/−24, azimuth numerals | **indistinguishable** | thin grid slightly lighter, intact | **thin polar grid breaks into dashes**; bold curve fine |
| **E9-2** (E9B04–06) | thin half-polar grid (continuous), multi-lobe curve, dB scale −40…−10, angle labels, "Over Real Ground" | **indistinguishable** — thin grid stays continuous | thin grid slightly lighter, continuous | grid mostly continuous (heavier than E9-1's) with minor breaks; bold curve fine; numerals jagged |
| **E9-3** (E9G06–07) | Smith arcs, straight centreline, scale numerals `0 .2 .5 1 2 5 ∞` | **indistinguishable** (even at 3×) | arcs slightly coarser, all legible | **arcs fragment into dotted lines**; numerals jagged |

### Rejected candidates and why

- **`opt` (lossless, `optipng -o7`):** 0 bytes saved on any figure — the assets
  were already run through `optipng -o5`. Only this one optimiser was tested;
  other lossless approaches were not evaluated (§2). It does not, on its own,
  provide the reduction needed.
- **`bw` (1-bit):** smallest, but destroys anti-aliasing everywhere and
  **fragments the thin polar/Smith grids of E9-1, E9-2, E9-3 into dashed
  lines**; numerals become jagged. Not a general solution (as the task
  anticipated).
- **`g4` (4-level):** meets the budget with room to spare but introduces a
  **visible gray halo/banding** around curved strokes (clearest on G7-1) and
  turns **E5-1's background mid-gray**. Rejected as the primary; usable only as a
  size lever if Stage 3 code proves much larger than the allowance.
- **`p4` (4-colour adaptive):** its quantiser drops hundreds–thousands of thin
  anti-aliased line pixels per schematic (`drop` up to 3,004). Reject.
- **`p16` (16-colour adaptive):** fidelity ≈ `g16` and it does **not** hit the
  E5-1 background problem (keeps value 254), but its aggregate base64 (302,296)
  is **larger** than `g16` and G7-1 balloons to 54,564 B. Not preferred overall;
  it *is* the natural pick **for E5-1 specifically** if a mixed encoding is
  wanted (E5-1 `p16` = 16,400 B / 21,868 b64, clean background).

### E5-1 — a source-quality finding (separate follow-up)

E5-1 is the only figure whose background is **not pure white**: 88.9 % of its
pixels are value **254**, with 7 % pure-white patches. A contrast stretch of the
committed asset also reveals **faint diagonal banding and two ghost
icon/"Office365"-like shapes** at ~value 253–254 in the lower-left quadrant —
invisible at normal 8-bit viewing, present in NCVEC's embedded raster (the
Stage 2C extraction faithfully reproduces the source). 16-level posterisation
maps 254 → 238, turning the background a visible light gray **and amplifying
those artifacts**. No exam-relevant content is affected.

Recommendation for E5-1: **keep the current 8-bit asset** (artifacts stay
invisible). Separately, **flag E5-1 for a possible cleaner official source**
(NCVEC also publishes `Extra_Figures_2024-2028-1.pdf`) as a Stage 2 follow-up —
**do not substitute a source in this experiment**, and do not white-point-clamp
the background here (that is a content edit needing human review).

`agent inspection ≠ human approval.` The comparisons above are the agent's; a
qualified human must confirm before any re-encode ships.

---

## 5. Recommended strategy

**Uniform `g16` (16-level grayscale, `-depth 4`, no dither, `optipng -o7 -strip
all`) for 13 figures; E5-1 keeps its current 8-bit encoding.**

Rationale: of the candidates that fit the budget, `g16` is the one that agent
visual review (§4, all 14 figures) found **visually indistinguishable from the
current asset** on every recommended figure — coarser candidates (`g4`, `bw`,
`p4`) each showed a visible or structural defect. A single recipe keeps
packaging simple; per-figure choice is only needed for the one outlier (E5-1).
Human fidelity sign-off is still required (§8).

| | asset bytes | **base64 bytes** |
|---|--:|--:|
| Current (all 8-bit) | 325,927 | 434,592 |
| **Recommended (`g16` ×13 + E5-1 8-bit)** | **229,489** | **306,008** |
| (for reference) uniform `g16` ×14 | 223,719 | 298,312 |
| (for reference) uniform `g4` ×14 | 149,383 | 199,204 |

Figures to **retain original encoding:** **E5-1** (background tint + faint source
artifacts). All 14 recommended candidates **pass `validatePng`** (verified).

If no strategy had met both size and fidelity, the correct outcome would be to
say so — it did not come to that here, but note the margin below is an
**estimate**.

---

## 6. Standalone packaging estimate — **ESTIMATE, not compliance**

Final compliance can only be established after Stage 3 packaging exists. PWA
precaching does **not** relieve the standalone budget (AGENTS.md constraint 1).

| Component | Bytes | Basis |
|---|--:|---|
| `dist/index.html` today | 633,892 | measured |
| + figure base64 (recommended mix) | 306,008 | measured (`Buffer.from(png).toString("base64").length`) |
| + data-URL prefixes `data:image/png;base64,` × 14 | 308 | 22 chars × 14 |
| + figure registry keys / wrapper / inlined `alt` text | 3,000 | **estimate** (~190 B/entry: id key, `"src"/"w"/"h"` keys, ~140-char alt) |
| base64 JSON/JS-string escaping | 0 | base64 alphabet has no `"` `\` `<`; build's `asInlineScript` finds nothing to escape |
| **Projected `dist/index.html`** | **943,208** | **estimate** (633,892 + 306,008 + 308 + 3,000) |
| Budget | 1,048,576 | fixed |
| **Projected room under budget** | **105,368** | **estimate** |
| − provisional Stage 3 allowance (code, CSS, UI markup) | 65,536 | 64 KiB planning allowance (not a budget change) |
| **Estimated free after allowance** | **39,832 B (~39 KB)** | **estimate** |

(Independent review reproduced these: projected + allowance = 1,008,744 B,
leaving 39,832 B under the 1,048,576 B budget. The `3,000 B` registry/`alt` line
is the one soft input; the rest is measured.)

For comparison: uniform `g16` ×14 → projected ≈ 935,500 → ≈ 47 KB free after the
allowance. Uniform 8-bit (no change) → projected ≈ **1,072,000 → ~23 KB over
budget before any Stage 3 code**.

If Stage 3 code exceeds the 64 KiB allowance, size levers remain, in order of
preference: (a) move `alt` text out of the inlined figure blob (it is
accessibility content, ~2 KB), (b) `g16 → g4` for the antenna-pattern figures
only (E9-1/E9-2 save ~13 KB base64 combined, with the AA-halo cost), (c) `g4`
uniformly (saves ~107 KB base64, visible banding).

---

## 7. Experiment artifacts and regeneration

**This run's candidate images + `results.csv` (99 files, ~1.6 MB):**
`/tmp/hamexam-figopt-6gB1OX/` — created by `scripts/figure-optim-experiment.js`
via `fs.mkdtempSync`. Detail montages (`base|g16|g4|bw`, native + zoom) for **all
14 figures**, in two session-scratchpad batches:
`…/3b84fb51-…/scratchpad/montages/` (T-2, G7-1, E6-1, E6-3, E5-1, E9-1, E9-3)
and `…/scratchpad/montages2/` (T-1, T-3, E6-2, E7-1, E7-2, E7-3, E9-2) —
generated by `scratchpad/montage.sh` / `montage2.sh`. **None of this is
committed** and temp dirs do not survive a reboot. To recreate everything:

```bash
# 1. all candidates + metrics + results.csv (prints the new temp dir path)
node scripts/figure-optim-experiment.js

# 2. the recommended encoding for one figure, by hand (T-2 shown):
convert assets/figures/technician/t-2.png -colorspace Gray +dither -depth 4 \
        -strip -define png:exclude-chunks=bkgd,date,time,text /tmp/t-2.g16.pre.png
optipng -quiet -o7 -strip all -out /tmp/t-2.g16.png /tmp/t-2.g16.pre.png

# 3. validate a candidate against the real, unmodified PNG subset:
node -e 'const fm=require("./scripts/figure-manifest.js");
         console.log(fm.validatePng(require("fs").readFileSync(process.argv[1])).errors)' /tmp/t-2.g16.png

# 4. side-by-side detail montage (base | g16 | g4 | bw), 2× zoom:
E=/tmp/hamexam-figopt-XXXXXX          # <- the helper's temp dir
for s in base g16 g4 bw; do
  convert "$E/T-2.$s.png" -crop 1000x520+780+300 +repage \
    -gravity North -background white -splice 0x16 -annotate +0+1 "$s" /tmp/_t2_$s.png
done
convert /tmp/_t2_base.png /tmp/_t2_g16.png /tmp/_t2_g4.png /tmp/_t2_bw.png +append \
  -filter point -resize 200% /tmp/T-2_zoom2x.png
```

`results.csv` columns: `id, strategy, bytes, base64, colorType, bitDepth,
chunks, validatorPass, pixelsIdentical, rmse, maxAbsDiff, pctShiftedGt64,
dropoutPx, spuriousPx, validatorErrors`.

**Detail-crop rectangles used for the §4 montages** (`WxH+X+Y` on the extracted
`<id>.<strategy>.png`, followed by the zoom factor) — so the same views can be
rebuilt without the throwaway scripts:

| Fig | crop | zoom | | Fig | crop | zoom |
|---|---|--:|---|---|---|--:|
| T-1 | `1350x780+300+360` | 2× | | E6-2 | `826x300+0+90` and `826x300+0+300` | 2× |
| T-2 | `1000x520+780+300` | 2× | | E6-3 | `790x300+0+70` | 2× |
| T-3 | `1400x900+250+250` | 2× | | E7-1 | `796x620+0+40` | 1× |
| G7-1 | `900x700+380+560` | 2× | | E7-2 | `782x600+0+40` | 1× |
| E5-1 | `560x520+150+120` | 2× | | E7-3 | `560x420+90+150` | 2× |
| E6-1 | `500x360+10+40` | 3× | | E9-1 | `560x460+130+120` | 2× |
| | | | | E9-2 | `620x520+90+90` | 2× |
| | | | | E9-3 | `395x230+0+70` | 3× |

Any crop over a detail region works; these are just the ones this review used.

---

## 8. Human review required / unresolved

1. **Human fidelity sign-off** of the `g16` re-encode for all 13 figures, side
   by side with the source PDF pages — the pending Stage 2 gate
   (`docs/FIGURE_REVIEW.md` §7) now also covers "does the 16-level version lose
   anything a sighted exam-taker needs".
2. **E5-1:** confirm keeping it at 8-bit is acceptable, and decide whether to
   open a follow-up to source a cleaner official E5-1 (the faint ghost artifacts
   are pre-existing in NCVEC's raster). **Not** to be resolved by substitution
   or by clamping the background in this experiment.
3. **E9-3:** already flagged as the lowest-resolution source (`FIGURE_REVIEW.md`
   §4). Agent inspection found `g16` **visually indistinguishable** from the
   current E9-3 asset (native and 3× zoom); `g16` bounds every pixel to within
   one 16-level step, which is not a fidelity proof but is consistent with "no
   added degradation from the re-encode". The underlying low-resolution concern
   is a separate source follow-up, independent of the encoding choice; a human
   reviewer must still confirm the numerals are adequate.
4. **Whether to adopt uniform `g16` ×14** (simpler, ~47 KB post-allowance) and
   accept E5-1's cosmetic gray background, **vs. the mixed recommendation**
   (E5-1 8-bit, ~39 KB post-allowance).
5. All numbers past §1 baseline and §3 candidate bytes are **estimates** until
   Stage 3 packaging exists and produces a real `dist/index.html`; the 64 KiB
   Stage 3 allowance is a planning figure, not a budget change.
