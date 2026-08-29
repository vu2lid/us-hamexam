#!/usr/bin/env node
"use strict";

// Cross-check our parsed NCVEC pools against the open-source JSON data from
// https://github.com/russolsen/ham_radio_question_pool
// Place the comparison files at data/crosscheck/{technician,general,extra}.json

const fs = require("fs");

const pools = [
  { name: "technician", ours: "data/technician.json", cross: "data/crosscheck/technician.json" },
  { name: "general", ours: "data/general.json", cross: "data/crosscheck/general.json" },
  { name: "extra", ours: "data/extra.json", cross: "data/crosscheck/extra.json" },
];

function normalize(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim()
    .toLowerCase();
}

function compareChoices(ours, cross) {
  const letters = ["A", "B", "C", "D"];
  const diffs = [];
  for (const l of letters) {
    const o = normalize(ours[l] || "");
    const c = normalize(cross[l] || "");
    if (o !== c) {
      diffs.push({ letter: l, ours: ours[l], cross: cross[l] });
    }
  }
  return diffs;
}

const report = [];

for (const pool of pools) {
  const ours = JSON.parse(fs.readFileSync(pool.ours, "utf8"));
  const cross = JSON.parse(fs.readFileSync(pool.cross, "utf8"));

  const oursById = Object.fromEntries(ours.map(q => [q.id, q]));
  const crossById = Object.fromEntries(cross.map(q => [q.id, q]));

  const oursIds = Object.keys(oursById).sort();
  const crossIds = Object.keys(crossById).sort();

  const missingInOurs = crossIds.filter(id => !oursById[id]);
  const missingInCross = oursIds.filter(id => !crossById[id]);

  const discrepancies = [];

  for (const id of oursIds) {
    const o = oursById[id];
    const c = crossById[id];
    if (!c) continue;

    const item = { id };
    let hasDiff = false;

    if (normalize(o.q) !== normalize(c.question)) {
      item.question = { ours: o.q, cross: c.question };
      hasDiff = true;
    }

    const crossChoices = {
      A: c.answers[0],
      B: c.answers[1],
      C: c.answers[2],
      D: c.answers[3],
    };
    const choiceDiffs = compareChoices(o.choices, crossChoices);
    if (choiceDiffs.length) {
      item.choices = choiceDiffs;
      hasDiff = true;
    }

    if (o.correct !== c.correct_letter) {
      item.correct = { ours: o.correct, cross: c.correct_letter };
      hasDiff = true;
    }

    if (hasDiff) discrepancies.push(item);
  }

  report.push({
    pool: pool.name,
    oursCount: oursIds.length,
    crossCount: crossIds.length,
    missingInOurs,
    missingInCross,
    discrepancies,
  });

  console.log(`\n=== ${pool.name.toUpperCase()} ===`);
  console.log(`Ours: ${oursIds.length}, Cross-check: ${crossIds.length}`);
  if (missingInOurs.length) console.log("Missing in ours:", missingInOurs);
  if (missingInCross.length) console.log("Missing in cross-check:", missingInCross);
  console.log("Discrepancies:", discrepancies.length);
  for (const d of discrepancies) {
    console.log(`  ${d.id}`);
    if (d.question) console.log("    question differs");
    if (d.choices) console.log("    choices differ:", d.choices.map(c => c.letter).join(", "));
    if (d.correct) console.log("    correct differs");
  }
}

fs.mkdirSync("data/crosscheck", { recursive: true });
fs.writeFileSync("data/crosscheck/discrepancies.json", JSON.stringify(report, null, 2), "utf8");
console.log("\nWrote data/crosscheck/discrepancies.json");
