"use strict";

// Bounded figure-encoding experiment (NOT production tooling; NOT wired into the
// build). Generates candidate PNG encodings of the 14 committed figure assets
// into a fresh temp directory, runs each through the real PNG validator
// (scripts/figure-manifest.js -> validatePng, unmodified), and reports bytes,
// exact base64 length, PNG colour type / bit depth, and decoded-pixel deltas vs.
// the current asset. It never touches assets/figures/, data/figures.json,
// scripts/build.js, or scripts/figure-extract.js.
//
// Strategies (native dimensions and orientation preserved throughout):
//   base   the committed asset, unchanged (reference)
//   opt    lossless recompression only  (optipng -o7 -strip all) -- pixels MUST match base
//   g16    16-level grayscale, no dither (ImageMagick -colorspace Gray -depth 4 +dither) + optipng   [lossy quantisation]
//   g4      4-level grayscale, no dither (-depth 2 +dither) + optipng                                 [lossy quantisation]
//   p16    16-colour indexed, no dither (-colors 16 +dither) + optipng                                [lossy quantisation]
//   p4      4-colour indexed, no dither (-colors 4 +dither) + optipng                                 [lossy quantisation]
//   bw     1-bit, 50% threshold (-threshold 50% -depth 1) + optipng  -- COMPARISON ONLY, not a recommendation
//
// External tools: optipng, ImageMagick `convert`, python3 (+ Pillow/numpy for
// pixel metrics). No new dependencies. Usage:
//
//   node scripts/figure-optim-experiment.js [--out <dir>] [--strategies opt,g16,...]
//
// Prints a table + per-strategy aggregates and writes <out>/results.csv and
// every candidate PNG. With no --out it creates one with fs.mkdtempSync and
// prints the path (nothing is deleted).

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const { validatePng } = require(path.join(ROOT, "scripts", "figure-manifest.js"));

const FIGURES = [
  ["T-1", "assets/figures/technician/t-1.png"],
  ["T-2", "assets/figures/technician/t-2.png"],
  ["T-3", "assets/figures/technician/t-3.png"],
  ["G7-1", "assets/figures/general/g7-1.png"],
  ["E5-1", "assets/figures/extra/e5-1.png"],
  ["E6-1", "assets/figures/extra/e6-1.png"],
  ["E6-2", "assets/figures/extra/e6-2.png"],
  ["E6-3", "assets/figures/extra/e6-3.png"],
  ["E7-1", "assets/figures/extra/e7-1.png"],
  ["E7-2", "assets/figures/extra/e7-2.png"],
  ["E7-3", "assets/figures/extra/e7-3.png"],
  ["E9-1", "assets/figures/extra/e9-1.png"],
  ["E9-2", "assets/figures/extra/e9-2.png"],
  ["E9-3", "assets/figures/extra/e9-3.png"]
];

const ALL_STRATEGIES = ["opt", "g16", "g4", "p16", "p4", "bw"];

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status}): ${(r.stderr || r.stdout || "").trim()}`);
  }
  return r;
}

function toolVersion(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return `${r.stdout || ""}\n${r.stderr || ""}`.split("\n").map((s) => s.trim()).filter(Boolean)[0] || "(unknown)";
}

function pngInfo(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const chunks = [];
  let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    chunks.push(buf.toString("latin1", o + 4, o + 8));
    o += 12 + len;
  }
  return { width, height, bitDepth, colorType, chunks };
}

// Decoded-pixel comparison via python (Pillow + numpy). Structural metrics
// only -- "how many pixels changed value at all" is meaningless for a
// quantisation (it is ~100%), so this reports what actually matters for line
// art: perceptible shifts and lost / added ink.
//   identical  every pixel byte-equal
//   rmse       root-mean-square value error (0..255)
//   maxAbs     largest single-pixel value error
//   bigPct     % of pixels shifted by more than 64 (perceptible)
//   dropout    # reference-dark pixels (<110) that became light (>150)  [lines/text lost]
//   spurious   # reference-light pixels (>200) that became dark (<110)  [ink added]
function pixelDelta(baseFile, candFile) {
  const py = `
import sys, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert("L"), dtype=np.int16)
b = np.asarray(Image.open(sys.argv[2]).convert("L"), dtype=np.int16)
if a.shape != b.shape:
    print("SHAPE_MISMATCH", a.shape, b.shape); sys.exit(2)
d = np.abs(a - b)
dark = a < 110
light = a > 200
print("%d %.4f %d %.4f %d %d" % (
    1 if not d.any() else 0,
    float(np.sqrt((d.astype(np.float64) ** 2).mean())),
    int(d.max()),
    100.0 * (d > 64).mean(),
    int((dark & (b > 150)).sum()),
    int((light & (b < 110)).sum()),
))
`;
  const r = spawnSync("python3", ["-c", py, baseFile, candFile], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`pixel compare failed: ${(r.stderr || "").trim()}`);
  const [ident, rmse, maxAbs, bigPct, dropout, spurious] = r.stdout.trim().split(/\s+/);
  return {
    identical: ident === "1",
    rmse: Number(rmse),
    maxAbs: Number(maxAbs),
    bigPct: Number(bigPct),
    dropout: Number(dropout),
    spurious: Number(spurious)
  };
}

function makeCandidate(strategy, srcAbs, dstAbs) {
  const optipng = ["-quiet", "-o7", "-strip", "all", "-out", dstAbs];
  if (strategy === "opt") {
    run("optipng", [...optipng, srcAbs]);
    return;
  }
  const tmp = dstAbs + ".im.png";
  const common = ["-strip", "-define", "png:exclude-chunks=bkgd,date,time,text"];
  const recipes = {
    g16: [srcAbs, "-colorspace", "Gray", "+dither", "-depth", "4", ...common, tmp],
    g4: [srcAbs, "-colorspace", "Gray", "+dither", "-depth", "2", ...common, tmp],
    p16: [srcAbs, "-colorspace", "Gray", "+dither", "-colors", "16", "-type", "Palette", ...common, tmp],
    p4: [srcAbs, "-colorspace", "Gray", "+dither", "-colors", "4", "-type", "Palette", ...common, tmp],
    bw: [srcAbs, "-colorspace", "Gray", "-threshold", "50%", "-depth", "1", ...common, tmp]
  };
  if (!recipes[strategy]) throw new Error(`unknown strategy ${strategy}`);
  run("convert", recipes[strategy]);
  run("optipng", [...optipng, tmp]);
  fs.rmSync(tmp, { force: true });
}

function main() {
  const argv = process.argv.slice(2);
  let outDir = null;
  let strategies = ALL_STRATEGIES.slice();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") outDir = argv[++i];
    else if (argv[i] === "--strategies") strategies = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else throw new Error(`unknown arg ${argv[i]}`);
  }
  if (!outDir) outDir = fs.mkdtempSync(path.join(os.tmpdir(), "hamexam-figopt-"));
  fs.mkdirSync(outDir, { recursive: true });

  process.stdout.write(`experiment dir: ${outDir}\n`);
  process.stdout.write(`tools: optipng "${toolVersion("optipng", ["-v"])}" | ` +
    `imagemagick "${toolVersion("convert", ["-version"])}" | python3 "${toolVersion("python3", ["--version"])}"\n\n`);

  const rows = [];
  const aggregate = {};
  for (const s of ["base", ...strategies]) aggregate[s] = { bytes: 0, b64: 0, valid: true, worstDropout: 0, worstSpurious: 0 };

  for (const [id, rel] of FIGURES) {
    const srcAbs = path.join(ROOT, rel);
    const baseBuf = fs.readFileSync(srcAbs);
    const baseCopy = path.join(outDir, `${id}.base.png`);
    fs.writeFileSync(baseCopy, baseBuf);
    const record = (strategy, buf, file, delta) => {
      const info = pngInfo(buf);
      const vr = validatePng(buf);
      const b64 = Buffer.byteLength(buf.toString("base64"));
      rows.push({
        id, strategy,
        bytes: buf.length, b64,
        ct: info.colorType, bd: info.bitDepth,
        chunks: info.chunks.join("+"),
        valid: vr.errors.length === 0,
        errors: vr.errors.join("; "),
        identical: delta ? delta.identical : true,
        rmse: delta ? delta.rmse : 0,
        maxAbs: delta ? delta.maxAbs : 0,
        bigPct: delta ? delta.bigPct : 0,
        dropout: delta ? delta.dropout : 0,
        spurious: delta ? delta.spurious : 0
      });
      const a = aggregate[strategy];
      a.bytes += buf.length;
      a.b64 += b64;
      if (vr.errors.length) a.valid = false;
      a.worstDropout = Math.max(a.worstDropout, delta ? delta.dropout : 0);
      a.worstSpurious = Math.max(a.worstSpurious, delta ? delta.spurious : 0);
    };

    record("base", baseBuf, baseCopy, null);

    for (const s of strategies) {
      const dst = path.join(outDir, `${id}.${s}.png`);
      makeCandidate(s, srcAbs, dst);
      const buf = fs.readFileSync(dst);
      const delta = pixelDelta(baseCopy, dst);
      record(s, buf, dst, delta);
    }
  }

  // CSV
  const header = "id,strategy,bytes,base64,colorType,bitDepth,chunks,validatorPass,pixelsIdentical,rmse,maxAbsDiff,pctShiftedGt64,dropoutPx,spuriousPx,validatorErrors";
  const csv = [header, ...rows.map((r) => [
    r.id, r.strategy, r.bytes, r.b64, r.ct, r.bd, r.chunks, r.valid, r.identical,
    r.rmse.toFixed(4), r.maxAbs, r.bigPct.toFixed(4), r.dropout, r.spurious,
    JSON.stringify(r.errors)
  ].join(","))].join("\n") + "\n";
  fs.writeFileSync(path.join(outDir, "results.csv"), csv);

  // Console table
  const pad = (v, n) => String(v).padStart(n);
  process.stdout.write(
    `${"id".padEnd(5)} ${"strat".padEnd(5)} ${pad("bytes", 7)} ${pad("base64", 7)} ${pad("ct/bd", 6)} ${pad("valid", 5)} ${pad("ident", 5)} ${pad("rmse", 7)} ${pad("maxΔ", 5)} ${pad(">64Δ%", 7)} ${pad("drop", 6)} ${pad("spur", 6)}\n`
  );
  for (const r of rows) {
    process.stdout.write(
      `${r.id.padEnd(5)} ${r.strategy.padEnd(5)} ${pad(r.bytes, 7)} ${pad(r.b64, 7)} ${pad(r.ct + "/" + r.bd, 6)} ` +
      `${pad(r.valid ? "ok" : "FAIL", 5)} ${pad(r.identical ? "yes" : "no", 5)} ${pad(r.rmse.toFixed(3), 7)} ${pad(r.maxAbs, 5)} ` +
      `${pad(r.bigPct.toFixed(3), 7)} ${pad(r.dropout, 6)} ${pad(r.spurious, 6)}\n`
    );
  }

  process.stdout.write(`\naggregate over 14 figures (base64 is what a data: URI actually costs):\n`);
  process.stdout.write(`${"strategy".padEnd(9)} ${pad("bytes", 8)} ${pad("base64", 8)} ${pad("valid", 10)} ${pad("worstDrop", 10)} ${pad("worstSpur", 10)}\n`);
  for (const s of ["base", ...strategies]) {
    const a = aggregate[s];
    process.stdout.write(`${s.padEnd(9)} ${pad(a.bytes, 8)} ${pad(a.b64, 8)} ${pad(a.valid ? "all-pass" : "SOME-FAIL", 10)} ${pad(s === "base" ? "-" : a.worstDropout, 10)} ${pad(s === "base" ? "-" : a.worstSpurious, 10)}\n`);
  }

  const standalone = fs.statSync(path.join(ROOT, "dist", "index.html")).size;
  process.stdout.write(`\ncurrent dist/index.html = ${standalone} B; budget 1048576 B; headroom ${1048576 - standalone} B\n`);
  process.stdout.write(`results.csv + candidate PNGs are in: ${outDir}\n`);
}

if (require.main === module) main();
module.exports = { FIGURES, ALL_STRATEGIES, makeCandidate, pngInfo, pixelDelta };
