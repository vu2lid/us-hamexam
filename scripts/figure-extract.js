"use strict";

// Stage 2C figure-extraction helper (reproducibility aid; NOT wired into the
// build). Regenerates the 14 official exam-figure PNGs under assets/figures/
// from the committed NCVEC source PDFs in data/pool-sources/.
//
// All 14 figures are embedded raster images inside the pool PDFs (verified with
// `pdfimages -list`; see docs/FIGURE_REVIEW.md for page/index provenance). The
// pipeline therefore:
//   1. extracts the embedded image at its native resolution (`pdfimages -png`)
//      -- no re-rasterisation, no scaling;
//   2. flattens the (fully-opaque) soft mask onto white and drops alpha;
//   3. converts to grayscale -- every figure is monochrome black line art;
//      for the JPEG-compressed Extra figures this also removes chroma-subsampling
//      fringe. Verified per-figure: no figure carries meaningful colour.
//   4. losslessly optimises and strips metadata (`optipng -o5 -strip all`).
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

// id -> pool, 1-based PDF page index, 0-based embedded-image index on that page.
// Reading order on the shared Extra figure pages is left-to-right, top-to-bottom;
// base images are the even indices (odd indices are their fully-opaque smasks).
const FIGURES = [
  { id: "T-1", pool: "technician", page: 78, image: 0 },
  { id: "T-2", pool: "technician", page: 79, image: 0 },
  { id: "T-3", pool: "technician", page: 79, image: 1 },
  { id: "G7-1", pool: "general", page: 87, image: 0 },
  { id: "E5-1", pool: "extra", page: 119, image: 0 },
  { id: "E6-1", pool: "extra", page: 119, image: 2 },
  { id: "E6-2", pool: "extra", page: 119, image: 4 },
  { id: "E6-3", pool: "extra", page: 119, image: 6 },
  { id: "E7-1", pool: "extra", page: 120, image: 0 },
  { id: "E7-2", pool: "extra", page: 120, image: 2 },
  { id: "E7-3", pool: "extra", page: 120, image: 4 },
  { id: "E9-1", pool: "extra", page: 120, image: 6 },
  { id: "E9-2", pool: "extra", page: 121, image: 0 },
  { id: "E9-3", pool: "extra", page: 121, image: 2 }
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
  const flat = path.join(tmpDir, `${fig.id}.flat.png`);
  sh("convert", [base, "-background", "white", "-alpha", "remove", "-alpha", "off", "-colorspace", "Gray", flat]);
  const out = path.join(tmpDir, `${fig.id}.out.png`);
  sh("optipng", ["-quiet", "-o5", "-strip", "all", "-out", out, flat]);
  return fs.readFileSync(out);
}

function pngDimensions(buf) {
  // IHDR width/height live at bytes 16..24 of a PNG.
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
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
      const dim = pngDimensions(buf);
      rows.push({ id: fig.id, file: rel, bytes: buf.length, sha256: sha, width: dim.width, height: dim.height });

      if (check) {
        const cur = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
        const same = cur && cur.equals(buf);
        if (!same) failures++;
        process.stdout.write(`${same ? "ok  " : "DIFF"}  ${fig.id.padEnd(5)} ${rel}\n`);
      } else {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, buf);
        process.stdout.write(`wrote ${fig.id.padEnd(5)} ${rel}  ${buf.length} B  ${dim.width}x${dim.height}  ${sha}\n`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  const total = rows.reduce((n, r) => n + r.bytes, 0);
  process.stdout.write(`\n14 figures, ${total} B total (${(total / 1024).toFixed(1)} KiB)\n`);
  process.stdout.write(`tools: ${toolVersion("pdfimages", ["-v"])} | ` +
    `${toolVersion("convert", ["-version"])} | ${toolVersion("optipng", ["-v"])}\n`);

  if (check && failures) {
    process.stdout.write(`\n${failures} figure(s) differ from a fresh extraction.\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { FIGURES, SOURCE_PDF, assetRelPath, buildFigure };
