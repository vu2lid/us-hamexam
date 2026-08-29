#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ID_RE = /^([TGE]\d[A-Z]\d{2})\s+\(([A-D])\)\s*(\[[^\]]*\])?/;
const ANSWER_RE = /^([A-D])\.\s?(.*)$/;
const DELETED_RE = /question deleted|removed from use/i;

function extractText(pdfPath) {
  const result = spawnSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) {
    throw new Error("pdftotext failed: " + result.error.message);
  }
  if (result.status !== 0) {
    throw new Error("pdftotext exited " + result.status + ": " + result.stderr);
  }
  // Strip form-feed and other page-break control characters.
  return result.stdout.replace(/\f/g, "");
}

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function mergeHyphenatedLines(lines) {
  // Rejoin words split across lines by a trailing hyphen (e.g., ["quarter-", "wave"] -> "quarter-wave").
  // Lines that end with "- " or other content are left unchanged.
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.endsWith("-") && i + 1 < lines.length) {
      out.push(line + lines[i + 1]);
      i++;
    } else {
      out.push(line);
    }
  }
  return out;
}

function parsePool(text) {
  const allLines = text.split(/\r?\n/);

  // Skip errata pages: the actual pool begins at the first "SUBELEMENT" heading.
  let startLine = 0;
  for (let i = 0; i < allLines.length; i++) {
    if (/^SUBELEMENT\s+[TGE]\d/i.test(allLines[i])) {
      startLine = i;
      break;
    }
  }
  const lines = allLines.slice(startLine);
  const questions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = ID_RE.exec(line);
    if (!match) continue;

    const id = match[1];
    const correct = match[2];
    const ref = match[3] ? match[3].slice(1, -1) : "";
    const sub = id.slice(0, 2);

    // Collect all lines until the next "~~" separator.
    const rawBlockLines = [];
    i++;
    while (i < lines.length && lines[i].trim() !== "~~") {
      rawBlockLines.push(lines[i]);
      i++;
    }

    const blockLines = mergeHyphenatedLines(rawBlockLines);
    const block = blockLines.join("\n").trim();
    if (DELETED_RE.test(block) || block.toLowerCase().startsWith("question deleted")) {
      continue;
    }

    // Skip errata notes that mention a question ID but contain no answer choices.
    const answerLines = blockLines.filter(l => ANSWER_RE.test(l));
    if (answerLines.length < 4) {
      continue;
    }

    // First line(s) before answer A. form the question text.
    const choices = { A: "", B: "", C: "", D: "" };
    let questionLines = [];
    let currentAnswer = null;
    let currentAnswerLines = [];

    for (const bl of blockLines) {
      const answerMatch = ANSWER_RE.exec(bl);
      if (answerMatch) {
        if (currentAnswer) {
          choices[currentAnswer] = normalizeWhitespace(currentAnswerLines.join(" "));
        }
        currentAnswer = answerMatch[1];
        currentAnswerLines = [answerMatch[2]];
      } else if (currentAnswer) {
        currentAnswerLines.push(bl);
      } else {
        questionLines.push(bl);
      }
    }

    if (currentAnswer) {
      choices[currentAnswer] = normalizeWhitespace(currentAnswerLines.join(" "));
    }

    const q = normalizeWhitespace(questionLines.join(" "));
    const correctText = choices[correct] || "";

    if (!q || !choices.A || !choices.B || !choices.C || !choices.D) {
      throw new Error(`Failed to parse question ${id}: missing question text or choices`);
    }

    questions.push({ id, sub, q, choices, correct, correctText, ref });
  }

  return questions;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error("Usage: node scripts/extract-pool.js <input.pdf> <output.json>");
    process.exit(1);
  }

  const [pdfPath, outPath] = args;
  const text = extractText(pdfPath);
  const pool = parsePool(text);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(pool, null, 2), "utf8");

  console.log(`Extracted ${pool.length} questions from ${pdfPath}`);
  console.log(`Wrote ${outPath}`);
}

main();
