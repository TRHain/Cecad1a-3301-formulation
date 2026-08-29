#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const protocol = JSON.parse(fs.readFileSync(path.join(__dirname, "v0.82-protocol.json"), "utf8"));
const corpusBytes = fs.readFileSync(path.join(ROOT, "liber-primus", "runes-text.txt"));
const corpusHash = crypto.createHash("sha256").update(corpusBytes).digest("hex");
if (corpusHash !== protocol.corpus_sha256) throw new Error(`corpus hash mismatch: ${corpusHash}`);
if (protocol.red_event_state !== false) throw new Error("red-event state must remain OFF");

const argv = process.argv.slice(2);
function option(name, fallback = null) {
  const i = argv.indexOf(name);
  return i < 0 ? fallback : argv[i + 1];
}
const phase = option("--phase");
const outputPath = option("--output");
const discoveryPath = option("--discovery-results");
const B = Number(option("--resamples", protocol.resamples));
if (!["discovery", "heldout"].includes(phase)) throw new Error("--phase must be discovery or heldout");
if (!outputPath) throw new Error("--output is required");
if (!Number.isInteger(B) || B < 100) throw new Error("--resamples must be an integer >=100");
if (phase === "heldout" && !discoveryPath) throw new Error("heldout requires --discovery-results");

const ALPHABET = [..."ᚠᚢᚦᚩᚱᚳᚷᚹᚻᚾᛁᛄᛇᛈᛉᛋᛏᛒᛖᛗᛚᛝᛟᛞᚪᚫᚣᛡᛠ"];
const runeIndex = new Map(ALPHABET.map((r, i) => [r, i]));
const excludedLines = new Set([453, 454, 455, 456]);
const sectionPages = {
  "0.5":[0,2], "0.6":[3,7], "0.7":[8,14], "0.8":[15,22],
  "0.9":[23,26], "0.10":[27,32], "0.11":[33,39], "0.12":[40,55]
};
const expectedCounts = {"0.5":729,"0.6":1145,"0.7":1729,"0.8":1903,"0.9":1021,"0.10":1433,"0.11":1589,"0.12":3316};

function sectionForPage(page) {
  for (const [s, [lo, hi]] of Object.entries(sectionPages)) if (page >= lo && page <= hi) return s;
  return null;
}

// Parse rune values and only independently transcribed black/source structure.
// No red annotations, plaintext, or solved-text material is loaded.
const sectionRecords = Object.fromEntries(Object.keys(sectionPages).map(s => [s, []]));
const pageRecords = new Map();
const rawAllRecords = [];
let rawPage = 0;
const lines = corpusBytes.toString("utf8").split("\n");
for (let li = 0; li < lines.length; li++) {
  const line = lines[li];
  if (line === "%") { rawPage++; continue; }
  const page = rawPage <= 49 ? rawPage : rawPage + 1; // printed page 50 has no rune row
  const section = sectionForPage(page);
  for (let ci = 0; ci < line.length; ci++) {
    const ch = line[ci];
    if (!runeIndex.has(ch) || !section) continue;
    const rec = {
      value: runeIndex.get(ch), rune: ch, page, section, source_line: li + 1,
      source_col: ci + 1, sentence_mark: line[ci - 1] === "." || line[ci + 1] === ".",
      excluded91: excludedLines.has(li + 1)
    };
    rawAllRecords.push(rec);
    if (!rec.excluded91) {
      sectionRecords[section].push(rec);
      if (!pageRecords.has(page)) pageRecords.set(page, []);
      pageRecords.get(page).push(rec);
    }
  }
}
for (const [s, n] of Object.entries(expectedCounts)) if (sectionRecords[s].length !== n) throw new Error(`${s} count drift`);
if (rawAllRecords.length !== 12956 || rawAllRecords.filter(r => r.excluded91).length !== 91) throw new Error("raw/excluded rune count drift");

function decorateUnit(records) {
  return records.map((r, i) => ({...r, strong_boundary: r.sentence_mark || i === 0 || i === records.length - 1}));
}

function buildScopes(sectionNames) {
  const sections = sectionNames.map(s => ({id:s, records:decorateUnit(sectionRecords[s])}));
  const pages = [];
  for (const [page, records] of [...pageRecords.entries()].sort((a,b) => a[0]-b[0])) {
    const section = sectionForPage(page);
    if (sectionNames.includes(section)) pages.push({id:String(page), records:decorateUnit(records)});
  }
  const full = decorateUnit(sections.flatMap(u => u.records));
  // Preserve section/page edges already marked before concatenation.
  return {split_full:[{id:phase, records:full}], per_section:sections, per_page:pages};
}

const splitSections = phase === "discovery" ? protocol.discovery_sections : protocol.heldout_sections;
const scopes = buildScopes(splitSections);
if (argv.includes("--validate-only")) {
  process.stdout.write(JSON.stringify({phase, corpus_sha256:corpusHash, raw_runes:rawAllRecords.length,
    excluded_page36_runes:rawAllRecords.filter(r=>r.excluded91).length,
    split_runes:splitSections.reduce((n,s)=>n+sectionRecords[s].length,0),
    section_counts:Object.fromEntries(Object.entries(sectionRecords).map(([s,r])=>[s,r.length])),
    red_event_state:false}, null, 2) + "\n");
  process.exit(0);
}

// First 9,999 primes cover every structured-null selector and nth-prime transform.
const primes = [];
for (let n = 2; primes.length < 9999; n++) {
  let prime = true;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
  if (prime) primes.push(n);
}
function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}
function primeRank(n) {
  let lo = 0, hi = primes.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (primes[mid] <= n) lo = mid + 1; else hi = mid; }
  return lo;
}
function transform(q, name) {
  const fib = protocol.page32_fibonacci_prime_ordinals[(q - 1) % 16];
  if (name === "identity") return q;
  if (name === "prime_rank") return primeRank(q);
  if (name === "nth_prime") return primes[q - 1];
  if (name === "page32_ordinal") return fib;
  if (name === "page32_prime") return primes[fib - 1];
  throw new Error(name);
}
function address(t, L, map, orientation) {
  let a;
  if (map === "bounded") { if (t < 1 || t > L) return null; a = t - 1; }
  else a = (t - 1) % L;
  return orientation === "forward" ? a : L - 1 - a;
}

const addressRules = [];
for (const scope of protocol.inferential_scopes)
  for (const t of protocol.transforms)
    for (const map of protocol.address_maps)
      for (const orientation of protocol.orientations)
        addressRules.push({scope, transform:t, map, orientation, id:`${scope}|${t}|${map}|${orientation}`});
const addressMetrics = protocol.address_metrics;
const reversalPairs = [[2,3],[4,5],[6,7]];

function scoreAddressRule(rule, selectors, offsets = null) {
  let boundary = 0, state = 0, collisions = 0, concordance = 0, anchors = 0;
  const units = scopes[rule.scope];
  for (let ui = 0; ui < units.length; ui++) {
    const unit = units[ui].records, hits = [];
    for (let qi = 0; qi < selectors.length; qi++) {
      const q = selectors[qi];
      let pos = address(transform(q, rule.transform), unit.length, rule.map, rule.orientation);
      if (pos === null) { hits.push(null); continue; }
      if (offsets) pos = (pos + offsets[ui]) % unit.length;
      const rec = unit[pos];
      hits.push(rec); anchors++;
      if (rec.strong_boundary) boundary++;
      if (rec.value === q % 29) state++;
    }
    for (let i = 0; i < hits.length; i++) for (let j = i + 1; j < hits.length; j++)
      if (hits[i] && hits[j] && hits[i].value === hits[j].value) collisions++;
    for (const [a,b] of reversalPairs) if (hits[a] && hits[b] && hits[a].value === hits[b].value && hits[a].strong_boundary === hits[b].strong_boundary) concordance++;
  }
  return {strong_boundary_hits:boundary, selector_state_matches:state, rune_collisions:collisions, reversal_pair_concordance:concordance, anchors};
}

function globalNextDistribution(units) {
  const counts = Array(29).fill(0); let total = 0;
  for (const u of units) for (let i = 0; i + 1 < u.records.length; i++) { counts[u.records[i+1].value]++; total++; }
  return counts.map(x => x / total);
}
function scoreStateScope(scopeName, residues, boundaryOffsets = null, successorOffsets = null) {
  const units = scopes[scopeName], selected = new Set(residues), base = globalNextDistribution(units);
  let boundaryHit=0, boundaryN=0, eq=0, transitionN=0, concentrationNumerator=0;
  const transitionCounts = Object.fromEntries(residues.map(s => [s, Array(29).fill(0)]));
  const stateTotals = Object.fromEntries(residues.map(s => [s, 0]));
  for (let ui=0; ui<units.length; ui++) {
    const r=units[ui].records, L=r.length;
    for (let i=0;i<L;i++) {
      const value = boundaryOffsets ? r[(i + boundaryOffsets[ui]) % L].value : r[i].value;
      if (selected.has(value)) { boundaryN++; if (r[i].strong_boundary) boundaryHit++; }
    }
    for (let i=0;i+1<L;i++) {
      const cur=r[i].value;
      if (!selected.has(cur)) continue;
      const next = successorOffsets ? r[(i + 1 + successorOffsets[ui]) % L].value : r[i+1].value;
      transitionCounts[cur][next]++; stateTotals[cur]++; transitionN++; if (cur===next) eq++;
    }
  }
  for (const s of residues) if (stateTotals[s]) {
    let l2=0; for (let u=0;u<29;u++) { const d=transitionCounts[s][u]/stateTotals[s]-base[u]; l2+=d*d; }
    concentrationNumerator += stateTotals[s]*l2;
  }
  return {
    strong_boundary_rate: boundaryN ? boundaryHit/boundaryN : 0,
    next_rune_concentration: transitionN ? concentrationNumerator/transitionN : 0,
    adjacent_equality_rate: transitionN ? eq/transitionN : 0
  };
}

const observedAddress = [];
for (const rule of addressRules) {
  const scores = scoreAddressRule(rule, protocol.selectors);
  for (const metric of addressMetrics) if (scores.anchors) observedAddress.push({id:`address|${rule.id}|${metric}`, rule, metric, score:scores[metric], anchors:scores.anchors});
}
const observedState = [];
for (const scope of protocol.inferential_scopes) {
  const scores=scoreStateScope(scope, protocol.selector_residues_mod29);
  for (const metric of protocol.state_metrics) observedState.push({id:`state|${scope}|${metric}`, scope, metric, score:scores[metric]});
}

function mulberry32(seed) { return function() { let t=seed+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
function reverseDigits(n) { return Number(String(n).split("").reverse().join("")); }
const poolDouble=[]; for(let a=11;a<=49;a++) if(isPrime(a)) poolDouble.push([a,2*a]);
const poolCP=[],poolPP3=[],poolPP4=[];
for(let a=100;a<=999;a++) { const b=reverseDigits(a); if(b<100)continue; if(!isPrime(a)&&isPrime(b))poolCP.push([a,b]); if(isPrime(a)&&isPrime(b))poolPP3.push([a,b]); }
for(let a=1000;a<=9999;a++) { const b=reverseDigits(a); if(b>=1000&&isPrime(a)&&isPrime(b))poolPP4.push([a,b]); }
function structuredFamily(rng) {
  for (;;) {
    const pairs=[poolDouble,poolCP,poolPP3,poolPP4].map(pool=>pool[Math.floor(rng()*pool.length)]);
    const q=pairs.flat(); if(new Set(q).size===8 && q.join(",")!==protocol.selectors.join(",")) return q;
  }
}
function randomResidues(rng) { const s=new Set(); while(s.size<7)s.add(Math.floor(rng()*29)); return [...s].sort((a,b)=>a-b); }
function randomOffsets(units,rng,nonzero=false) { return units.map(u => { if(u.records.length<=1)return 0; return (nonzero?1:0)+Math.floor(rng()*(u.records.length-(nonzero?1:0))); }); }

function allocate(cells) { return cells.map(()=>new Float64Array(B)); }
function fillStructuredNull(cells) {
  const arrays=allocate(cells), rng=mulberry32(protocol.rng_seed+101);
  for(let b=0;b<B;b++) { const qs=structuredFamily(rng); const cache=new Map();
    for(let ci=0;ci<cells.length;ci++) { const c=cells[ci], key=c.rule.id; if(!cache.has(key))cache.set(key,scoreAddressRule(c.rule,qs)); arrays[ci][b]=cache.get(key)[c.metric]; }
  } return arrays;
}
function fillResidueNull(cells) {
  const arrays=allocate(cells), rng=mulberry32(protocol.rng_seed+202);
  for(let b=0;b<B;b++) { const residues=randomResidues(rng), cache=new Map();
    for(let ci=0;ci<cells.length;ci++) { const c=cells[ci]; if(!cache.has(c.scope))cache.set(c.scope,scoreStateScope(c.scope,residues)); arrays[ci][b]=cache.get(c.scope)[c.metric]; }
  } return arrays;
}
function fillWithinNull(allCells) {
  const arrays=allocate(allCells), rng=mulberry32(protocol.rng_seed+303);
  for(let b=0;b<B;b++) {
    const offsetCache=new Map(), successorCache=new Map(), addressCache=new Map(), stateCache=new Map();
    for(const scope of protocol.inferential_scopes) { offsetCache.set(scope,randomOffsets(scopes[scope],rng)); successorCache.set(scope,randomOffsets(scopes[scope],rng,true)); }
    for(let ci=0;ci<allCells.length;ci++) { const c=allCells[ci];
      if(c.id.startsWith("address|")) { const key=c.rule.id; if(!addressCache.has(key))addressCache.set(key,scoreAddressRule(c.rule,protocol.selectors,offsetCache.get(c.rule.scope))); arrays[ci][b]=addressCache.get(key)[c.metric]; }
      else { if(!stateCache.has(c.scope))stateCache.set(c.scope,scoreStateScope(c.scope,protocol.selector_residues_mod29,offsetCache.get(c.scope),successorCache.get(c.scope))); arrays[ci][b]=stateCache.get(c.scope)[c.metric]; }
    }
  } return arrays;
}
function adjusted(cells, arrays) {
  const stats=cells.map((c,i)=>{ let sum=0,sq=0; for(const x of arrays[i]){sum+=x;sq+=x*x;} const mean=sum/B, variance=Math.max(0,sq/B-mean*mean), sd=Math.sqrt(variance); return {mean,sd,z:sd?(c.score-mean)/sd:0}; });
  const maxNull=new Float64Array(B);
  for(let b=0;b<B;b++){let m=-Infinity;for(let i=0;i<cells.length;i++){const s=stats[i];const z=s.sd?(arrays[i][b]-s.mean)/s.sd:0;if(z>m)m=z;}maxNull[b]=m;}
  return cells.map((c,i)=>{let exceed=0;for(const m of maxNull)if(m>=stats[i].z)exceed++;return {...stats[i],p_fwer:(exceed+1)/(B+1)};});
}

const structuredArrays=fillStructuredNull(observedAddress);
const structuredAdj=adjusted(observedAddress,structuredArrays);
const residueArrays=fillResidueNull(observedState);
const residueAdj=adjusted(observedState,residueArrays);
const allObserved=[...observedAddress,...observedState];
const withinArrays=fillWithinNull(allObserved);
const withinAdj=adjusted(allObserved,withinArrays);
const withinById=new Map(allObserved.map((c,i)=>[c.id,withinAdj[i]]));

const addressResults=observedAddress.map((c,i)=>({...c, structured_number_control:structuredAdj[i], within_unit_control:withinById.get(c.id)}));
const stateResults=observedState.map((c,i)=>({...c, residue_control:residueAdj[i], within_unit_control:withinById.get(c.id)}));
const survivors=[];
for(const r of addressResults) if(r.structured_number_control.p_fwer<=protocol.promotion_alpha&&r.within_unit_control.p_fwer<=protocol.promotion_alpha&&r.structured_number_control.z>0&&r.within_unit_control.z>0)survivors.push(r.id);
for(const r of stateResults) if(r.residue_control.p_fwer<=protocol.promotion_alpha&&r.within_unit_control.p_fwer<=protocol.promotion_alpha&&r.residue_control.z>0&&r.within_unit_control.z>0)survivors.push(r.id);

function landingTable(selectors) {
  const out={}; for(const q of selectors){out[q]={};for(const t of protocol.transforms){const v=transform(q,t);out[q][t]={transformed_value:v,page32_slot:((q-1)%16)+1};}}return out;
}
function absoluteLandings() {
  const out=[]; for(const q of protocol.selectors)for(const t of protocol.transforms){const v=transform(q,t);if(v>=1&&v<=rawAllRecords.length){const r=rawAllRecords[v-1];out.push({selector:q,transform:t,position_1:v,rune:r.rune,rune_index_0:r.value,page:r.page,section:r.section,source_line:r.source_line,inside_excluded91:r.excluded91});}}
  return out;
}

let discovery = null, replicated=[];
if(phase==="heldout") {
  discovery=JSON.parse(fs.readFileSync(discoveryPath,"utf8"));
  if(discovery.phase!=="discovery"||discovery.protocol_sha256!==crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname,"v0.82-protocol.json"))).digest("hex"))throw new Error("discovery/protocol mismatch");
  const resultMap=new Map([...addressResults,...stateResults].map(r=>[r.id,r]));
  for(const id of discovery.survivors){const r=resultMap.get(id);if(!r)continue;const a=r.structured_number_control||r.residue_control,b=r.within_unit_control;if(a.p_fwer<=protocol.promotion_alpha&&b.p_fwer<=protocol.promotion_alpha&&a.z>0&&b.z>0)replicated.push(id);}
}

const protocolSha=crypto.createHash("sha256").update(fs.readFileSync(path.join(__dirname,"v0.82-protocol.json"))).digest("hex");
const result={protocol_version:protocol.version,protocol_sha256:protocolSha,corpus_sha256:corpusHash,phase,resamples:B,red_event_state:false,split_sections:splitSections,rune_count:splitSections.reduce((n,s)=>n+sectionRecords[s].length,0),hard_negative_guard:protocol.hard_negative_guard,index_tables:landingTable(protocol.selectors),absolute_global_landings_descriptive:absoluteLandings(),address_results:addressResults,state_results:stateResults,survivors,discovery_survivors:discovery?discovery.survivors:null,replicated,decision:phase==="discovery"?(survivors.length?"DISCOVERY_CANDIDATES_FROZEN_FOR_HELDOUT":"NO_DISCOVERY_ADDRESS_OR_STATE_CANDIDATE"):(replicated.length?"V0_82_CANDIDATE_REPLICATED_HELDOUT":"NO_ADDRESS_OR_STATE_SELECTOR_EVIDENCE")};
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+"\n");
process.stdout.write(JSON.stringify({phase:result.phase,rune_count:result.rune_count,survivors:result.survivors,replicated:result.replicated,decision:result.decision,output:outputPath},null,2)+"\n");
