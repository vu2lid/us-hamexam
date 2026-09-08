"use strict";

// Figure-extraction helper (reproducibility aid; NOT wired into the build).
// Regenerates the 14 official exam-figure PNGs under assets/figures/ from the
// committed, checksum-pinned NCVEC source PDFs in data/pool-sources/.
//
// All 14 figures are embedded raster images inside the pool PDFs (verified with
// `pdfimages -list`; see docs/FIGURE_REVIEW.md for page/index provenance). The
// pipeline:
//   1. extracts the embedded image at its native resolution (`pdfimages -png`)
//      -- no re-rasterisation, no scaling;
//   2. flattens the (fully-opaque) soft mask onto white and drops alpha;
//   3. converts to grayscale -- every figure is monochrome black line art;
//      for the JPEG-compressed Extra figures this also removes chroma-subsampling
//      fringe. Verified per-figure: no figure carries meaningful colour.
//   4. encodes per figure (`encoding` field below):
//      * "grayscale8" -- 8-bit grayscale + `optipng -o5 -strip all`.
//        E5-1 ONLY: it keeps its exact Stage 2C bytes (its off-white background
//        and faint pre-existing source artefacts posterise badly under step 4b).
//      * "g16" -- the encoding adopted after the Stage 2 optimisation experiment
//        (docs/FIGURE_OPTIMIZATION.md) for the other 13 figures: a **lossy**
//        16-level grayscale quantisation of the 8-bit baseline via
//        `convert -colorspace Gray +dither -depth 4 -strip
//                 -define png:exclude-chunks=bkgd,date,time,text`
//        then `optipng -o7 -strip all` -> PNG colour type 0, bit depth 4.
//      The quantisation input is always the fresh 8-bit baseline from the PDF;
//      committed assets are never re-quantised.
//
// External tools (invoked via child_process; no npm dependencies):
//   pdfimages (poppler), convert (ImageMagick), optipng
//
// Usage:
//   node scripts/figure-extract.js            # (re)write assets/figures/**.png
//   node scripts/figure-extract.js --check    # verify on-disk bytes match a
//                                             # fresh extraction (no writes)

const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");

const SOURCE_PDF = {
  technician: "data/pool-sources/technician.pdf",
  general: "data/pool-sources/general.pdf",
  extra: "data/pool-sources/extra.pdf"
};

// id -> pool, 1-based PDF page index, 0-based embedded-image index on that page,
// and encoding ("g16" for the 13 adopted 16-level grayscale figures;
// "grayscale8" for the E5-1 exception, which keeps its exact Stage 2C bytes).
// Reading order on the shared Extra figure pages is left-to-right, top-to-bottom;
// base images are the even indices (odd indices are their fully-opaque smasks).
const FIGURES = [
  { id: "T-1", pool: "technician", page: 78, image: 0, encoding: "g16" },
  { id: "T-2", pool: "technician", page: 79, image: 0, encoding: "g16" },
  { id: "T-3", pool: "technician", page: 79, image: 1, encoding: "g16" },
  { id: "G7-1", pool: "general", page: 87, image: 0, encoding: "g16" },
  { id: "E5-1", pool: "extra", page: 119, image: 0, encoding: "grayscale8" },
  { id: "E6-1", pool: "extra", page: 119, image: 2, encoding: "g16" },
  { id: "E6-2", pool: "extra", page: 119, image: 4, encoding: "g16" },
  { id: "E6-3", pool: "extra", page: 119, image: 6, encoding: "g16" },
  { id: "E7-1", pool: "extra", page: 120, image: 0, encoding: "g16" },
  { id: "E7-2", pool: "extra", page: 120, image: 2, encoding: "g16" },
  { id: "E7-3", pool: "extra", page: 120, image: 4, encoding: "g16" },
  { id: "E9-1", pool: "extra", page: 120, image: 6, encoding: "g16" },
  { id: "E9-2", pool: "extra", page: 121, image: 0, encoding: "g16" },
  { id: "E9-3", pool: "extra", page: 121, image: 2, encoding: "g16" }
];

function sh(cmd, args, opts) {
  return execFileSync(cmd, args, Object.assign({ stdio: ["ignore", "pipe", "pipe"] }, opts || {}));
}

function toolVersion(cmd, args) {
  // Several of these tools print their version banner to stderr.
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  const text = `${r.stdout || ""}\n${r.stderr || ""}`;
  const line = text.split("\n").map((s) => s.trim()).filter(Boolean)[0];
  return line || "(version unavailable)";
}

function assetRelPath(fig) {
  return `assets/figures/${fig.pool}/${fig.id.toLowerCase()}.png`;
}

// Produce the final optimised PNG bytes for one figure. Never writes into the
// repository -- returns a Buffer the caller decides what to do with.
function buildFigure(fig, tmpDir) {
  const pdfAbs = path.join(ROOT, SOURCE_PDF[fig.pool]);
  if (!fs.existsSync(pdfAbs)) {
    throw new Error(`source PDF missing: ${SOURCE_PDF[fig.pool]} (this is a tracked file; restore it from the checkout or re-download the checksum-pinned NCVEC PDF)`);
  }
  const prefix = path.join(tmpDir, fig.id);
  sh("pdfimages", ["-png", "-f", String(fig.page), "-l", String(fig.page), pdfAbs, prefix]);
  const base = `${prefix}-${String(fig.image).padStart(3, "0")}.png`;
  if (!fs.existsSync(base)) {
    throw new Error(`expected embedded image ${base} not produced for ${fig.id}`);
  }
  // 8-bit grayscale baseline from the PDF (native dimensions, alpha flattened
  // onto white). This is the quantisation input for "g16"; committed assets are
  // never fed back in.
  const flat8 = path.join(tmpDir, `${fig.id}.flat.png`);
  sh("convert", [base, "-background", "white", "-alpha", "remove", "-alpha", "off", "-colorspace", "Gray", flat8]);

  const out = path.join(tmpDir, `${fig.id}.out.png`);
  if (fig.encoding === "grayscale8") {
    // E5-1 exception: unchanged Stage 2C recipe -> exact pre-experiment bytes.
    sh("optipng", ["-quiet", "-o5", "-strip", "all", "-out", out, flat8]);
  } else {
    // Adopted 16-level grayscale (lossy): colour type 0, bit depth 4, no dither.
    const g16 = path.join(tmpDir, `${fig.id}.g16.png`);
    sh("convert", [
      flat8, "-colorspace", "Gray", "+dither", "-depth", "4", "-strip",
      "-define", "png:exclude-chunks=bkgd,date,time,text", g16
    ]);
    sh("optipng", ["-quiet", "-o7", "-strip", "all", "-out", out, g16]);
  }
  return fs.readFileSync(out);
}

function pngInfo(buf) {
  // IHDR: width/height at bytes 16..24, bit depth at 24, colour type at 25.
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    bitDepth: buf[24],
    colorType: buf[25]
  };
}

function main() {
  const check = process.argv.includes("--check");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hamexam-figextract-"));
  let failures = 0;
  const rows = [];
  try {
    for (const fig of FIGURES) {
      const buf = buildFigure(fig, tmpDir);
      const rel = assetRelPath(fig);
      const abs = path.join(ROOT, rel);
      const sha = crypto.createHash("sha256").update(buf).digest("hex");
      const info = pngInfo(buf);
      rows.push({ id: fig.id, file: rel, bytes: buf.length, sha256: sha, ...info });

      if (check) {
        const cur = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
        const same = cur && cur.equals(buf);
        if (!same) failures++;
        process.stdout.write(`${same ? "ok  " : "DIFF"}  ${fig.id.padEnd(5)} ${fig.encoding.padEnd(10)} ${rel}\n`);
      } else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, buf);
        process.stdout.write(
          `wrote ${fig.id.padEnd(5)} ${fig.encoding.padEnd(10)} ${rel}  ` +
          `${String(buf.length).padStart(6)} B  ${info.width}x${info.height}  ct${info.colorType}/bd${info.bitDepth}  ${sha}\n`
        );
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const total = rows.reduce((n, r) => n + r.bytes, 0);
  const b64 = rows.reduce((n, r) => n + Math.ceil(r.bytes / 3) * 4, 0);
  process.stdout.write(`\n14 figures, ${total} B on-disk (${(total / 1024).toFixed(1)} KiB), ` +
    `${b64} B as base64 (${(b64 / 1024).toFixed(1)} KiB)\n`);
  process.stdout.write(`tools: ${toolVersion("pdfimages", ["-v"])} | ` +
    `${toolVersion("convert", ["-version"])} | ${toolVersion("optipng", ["-v"])}\n`);

  if (check && failures) {
    process.stdout.write(`\n${failures} figure(s) differ from a fresh extraction.\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { FIGURES, SOURCE_PDF, assetRelPath, buildFigure };
