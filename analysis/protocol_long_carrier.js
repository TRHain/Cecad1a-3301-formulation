#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "..");
const protocol = JSON.parse(fs.readFileSync(path.join(__dirname, "v0.81-protocol.json"), "utf8"));
const corpusPath = path.join(root, "liber-primus", "runes-text.txt");
const bytes = fs.readFileSync(corpusPath);
const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
if (sha256 !== protocol.corpus_sha256) throw new Error(`corpus hash mismatch: ${sha256}`);

const argv = process.argv.slice(2);
function option(name, fallback) {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
}
const replicates = Number(option("--replicates", protocol.permutation_replicates));
const outputPath = option("--output", null);
if (!Number.isInteger(replicates) || replicates < 1) throw new Error("--replicates must be a positive integer");

const alphabet = [...protocol.alphabet];
const runeIndex = new Map(alphabet.map((r, i) => [r, i]));
const excludedSourceLines = new Set([453, 454, 455, 456]);
const sectionPages = {
  "0.5": [0, 2], "0.6": [3, 7], "0.7": [8, 14], "0.8": [15, 22],
  "0.9": [23, 26], "0.10": [27, 32], "0.11": [33, 39], "0.12": [40, 55]
};
const expectedCounts = {
  "0.5": 729, "0.6": 1145, "0.7": 1729, "0.8": 1903,
  "0.9": 1021, "0.10": 1433, "0.11": 1589, "0.12": 3316
};

// The raw corpus omits the rune-empty printed page 50. Map raw delimiter
// segments back to printed page numbers without inventing any transcription.
const sourceLines = bytes.toString("utf8").split("\n");
const excludedRunes = sourceLines.reduce((n, line, i) =>
  n + (excludedSourceLines.has(i + 1) ? [...line].filter(c => runeIndex.has(c)).length : 0), 0);
if (excludedRunes !== 91) throw new Error(`metadata exclusion drift: expected 91 runes, got ${excludedRunes}`);

function sectionForPage(page) {
  for (const [section, [lo, hi]] of Object.entries(sectionPages)) {
    if (page >= lo && page <= hi) return section;
  }
  return null;
}

const sections = Object.fromEntries(Object.keys(sectionPages).map(s => [s, []]));
let rawPage = 0;
for (let i = 0; i < sourceLines.length; i++) {
  const line = sourceLines[i];
  if (line === "%") {
    rawPage += 1;
    continue;
  }
  const page = rawPage <= 49 ? rawPage : rawPage + 1;
  const section = sectionForPage(page);
  if (section && !excludedSourceLines.has(i + 1)) {
    for (const c of line) if (runeIndex.has(c)) sections[section].push(runeIndex.get(c));
  }
}
for (const [section, expected] of Object.entries(expectedCounts)) {
  if (sections[section].length !== expected) {
    throw new Error(`section ${section}: expected ${expected} runes, got ${sections[section].length}`);
  }
}

let globalRunePosition = 0;
const records = [];
for (const section of Object.keys(sectionPages)) {
  const runes = sections[section];
  const start = globalRunePosition;
  const runeMean = runes.reduce((a, b) => a + b, 0) / runes.length;
  const signalRecords = {
    rune_centered: runes.map((v, i) => ({position: start + i, value: v - runeMean})),
    adjacent_equality: runes.slice(1).map((v, i) => ({position: start + i + 1, value: v === runes[i] ? 1 : 0})),
    signed_modular_delta: runes.slice(1).map((v, i) => {
      let d = (v - runes[i] + 29) % 29;
      if (d > 14) d -= 29;
      return {position: start + i + 1, value: d};
    })
  };
  records.push({section, signalRecords});
  globalRunePosition += runes.length;
}

function projection(sectionRecords, signal, period, selectorPhase = 0) {
  let re = 0, im = 0, energy = 0, n = 0;
  for (const record of sectionRecords) {
    for (const point of record.signalRecords[signal]) {
      const angle = 2 * Math.PI * (point.position + selectorPhase) / period;
      re += point.value * Math.cos(angle);
      im += point.value * Math.sin(angle);
      energy += point.value * point.value;
      n += 1;
    }
  }
  return energy === 0 ? 0 : (re * re + im * im) / (energy * n);
}

function familyPowers(sectionRecords, signal, periods) {
  return Object.fromEntries(periods.map(p => [p, projection(sectionRecords, signal, p)]));
}

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffleValues(points, rng) {
  const values = points.map(p => p.value);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return points.map((p, i) => ({position: p.position, value: values[i]}));
}

function permutedRecords(sectionRecords, signal, rng) {
  return sectionRecords.map(record => ({
    section: record.section,
    signalRecords: {[signal]: shuffleValues(record.signalRecords[signal], rng)}
  }));
}

function randomDistinctPeriods(rng) {
  const result = new Set();
  const lo = protocol.random_period_min;
  const width = protocol.random_period_max - lo + 1;
  while (result.size < protocol.long_periods.length) result.add(lo + Math.floor(rng() * width));
  return [...result];
}

function empiricalP(exceed, reps) { return (exceed + 1) / (reps + 1); }

function analyzeSplit(name, sectionNames, seedOffset) {
  const selected = records.filter(r => sectionNames.includes(r.section));
  const out = {sections: sectionNames, rune_count: selected.reduce((n, r) => n + sections[r.section].length, 0), signals: {}};
  for (let signalIndex = 0; signalIndex < protocol.signals.length; signalIndex++) {
    const signal = protocol.signals[signalIndex];
    const observed = familyPowers(selected, signal, protocol.long_periods);
    const observedMax = Math.max(...Object.values(observed));
    const permutationRng = mulberry32(protocol.rng_seed + seedOffset + signalIndex * 100003);
    const periodRng = mulberry32(protocol.rng_seed + seedOffset + signalIndex * 100003 + 50001);
    let permutationExceed = 0;
    let randomPeriodExceed = 0;
    for (let r = 0; r < replicates; r++) {
      const shuffled = permutedRecords(selected, signal, permutationRng);
      const nullMax = Math.max(...Object.values(familyPowers(shuffled, signal, protocol.long_periods)));
      if (nullMax >= observedMax) permutationExceed += 1;
      const randomMax = Math.max(...Object.values(familyPowers(selected, signal, randomDistinctPeriods(periodRng))));
      if (randomMax >= observedMax) randomPeriodExceed += 1;
    }
    out.signals[signal] = {
      powers: observed,
      top_period: Number(Object.entries(observed).sort((a, b) => b[1] - a[1])[0][0]),
      family_max: observedMax,
      permutation_exceedances: permutationExceed,
      permutation_p: empiricalP(permutationExceed, replicates),
      random_period_exceedances: randomPeriodExceed,
      random_period_p: empiricalP(randomPeriodExceed, replicates)
    };
  }
  return out;
}

// Algebraic audit: selector-derived constant phases must not create models.
let phaseMaxDifference = 0;
for (const signal of protocol.signals) {
  for (const period of protocol.long_periods) {
    const base = projection(records, signal, period, 0);
    for (const selector of protocol.selectors) {
      phaseMaxDifference = Math.max(phaseMaxDifference, Math.abs(base - projection(records, signal, period, selector % period)));
    }
  }
}
if (phaseMaxDifference > 1e-12) throw new Error(`selector phase invariance failed: ${phaseMaxDifference}`);

const discovery = analyzeSplit("discovery", protocol.discovery_sections, 0);
const heldout = analyzeSplit("heldout", protocol.heldout_sections, 10000019);
let promoted = false;
for (const signal of protocol.signals) {
  const d = discovery.signals[signal];
  const h = heldout.signals[signal];
  if (d.top_period === h.top_period && d.permutation_p <= protocol.promotion_alpha &&
      h.permutation_p <= protocol.promotion_alpha && d.random_period_p <= protocol.promotion_alpha &&
      h.random_period_p <= protocol.promotion_alpha) promoted = true;
}

const result = {
  protocol_version: protocol.version,
  corpus_sha256: sha256,
  replicates,
  red_event_state: protocol.red_event_state,
  selector_phase_max_power_difference: phaseMaxDifference,
  discovery,
  heldout,
  promotion: promoted,
  decision: promoted ? "PROTOCOL_LONG_CARRIER_CANDIDATE_REQUIRES_RED_INDEPENDENT_REPLICATION" : "NO_PROTOCOL_SELECTOR_LONG_CARRIER_EVIDENCE"
};
const rendered = JSON.stringify(result, null, 2) + "\n";
if (outputPath) fs.writeFileSync(outputPath, rendered);
process.stdout.write(rendered);
