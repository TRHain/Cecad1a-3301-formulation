#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const protocolPath = path.join(__dirname, "v0.83-protocol.json");
const artifactPath = path.join(ROOT, "liber-primus", "v0.83-red-events.json");
const corpusPath = path.join(ROOT, "liber-primus", "runes-text.txt");
const protocolBytes = fs.readFileSync(protocolPath);
const artifactBytes = fs.readFileSync(artifactPath);
const corpusBytes = fs.readFileSync(corpusPath);
const protocol = JSON.parse(protocolBytes);
const artifact = JSON.parse(artifactBytes);
const sha256 = data => crypto.createHash("sha256").update(data).digest("hex");
if (sha256(corpusBytes) !== protocol.corpus_sha256) throw new Error("corpus hash mismatch");
if (sha256(artifactBytes) !== protocol.red_event_artifact_sha256) throw new Error("red-event artifact hash mismatch");
if (artifact.source.image_archive_sha256 !== protocol.image_archive_sha256) throw new Error("image archive hash mismatch");
if (!protocol.reflection.includes("+ 8") || protocol.window_transitions_each_side !== 58) throw new Error("frozen primary drift");

const argv = process.argv.slice(2);
function option(name, fallback = null) { const i = argv.indexOf(name); return i < 0 ? fallback : argv[i + 1]; }
const outputPath = option("--output");
const B = Number(option("--resamples", protocol.resamples_per_control));
if (!argv.includes("--validate-only") && !outputPath) throw new Error("--output is required");
if (!Number.isInteger(B) || B < 5000) throw new Error("principal controls require at least 5000 resamples");

const ALPHABET = [..."ᚠᚢᚦᚩᚱᚳᚷᚹᚻᚾᛁᛄᛇᛈᛉᛋᛏᛒᛖᛗᛚᛝᛟᛞᚪᚫᚣᛡᛠ"];
const runeIndex = new Map(ALPHABET.map((r, i) => [r, i]));
const excludedLines = new Set([453, 454, 455, 456]);
const sectionPages = {
  "0.5":[0,2], "0.6":[3,7], "0.7":[8,14], "0.8":[15,22],
  "0.9":[23,26], "0.10":[27,32], "0.11":[33,39], "0.12":[40,55]
};
const expectedCounts = {"0.5":729,"0.6":1145,"0.7":1729,"0.8":1903,"0.9":1021,"0.10":1433,"0.11":1589,"0.12":3316};
function sectionForPage(page) {
  for (const [section, [lo, hi]] of Object.entries(sectionPages)) if (page >= lo && page <= hi) return section;
  return null;
}

const sectionRecords = Object.fromEntries(Object.keys(sectionPages).map(s => [s, []]));
const pageRecords = new Map();
let rawPage = 0;
for (const [lineIndex, line] of corpusBytes.toString("utf8").split("\n").entries()) {
  if (line === "%") { rawPage++; continue; }
  const page = rawPage <= 49 ? rawPage : rawPage + 1;
  const section = sectionForPage(page);
  for (let col = 0; col < line.length; col++) {
    const ch = line[col];
    if (!runeIndex.has(ch) || !section || excludedLines.has(lineIndex + 1)) continue;
    const record = {value:runeIndex.get(ch), rune:ch, page, section, source_line:lineIndex+1, source_col:col+1};
    sectionRecords[section].push(record);
    if (!pageRecords.has(page)) pageRecords.set(page, []);
    pageRecords.get(page).push(record);
  }
}
for (const [section, count] of Object.entries(expectedCounts))
  if (sectionRecords[section].length !== count) throw new Error(`section ${section} count drift`);

const pageStarts = {};
for (const [section, [lo, hi]] of Object.entries(sectionPages)) {
  let offset = 0;
  for (let page = lo; page <= hi; page++) {
    pageStarts[`${section}|${page}`] = offset;
    offset += (pageRecords.get(page) || []).length;
  }
}

const W = protocol.window_transitions_each_side;
function deltas(values) { const out = new Array(values.length - 1); for (let i=0;i<out.length;i++) out[i]=(values[i+1]-values[i]+29)%29; return out; }
function entropyBins(values, bins=29) {
  if (!values.length) return 0;
  const counts=Array(bins).fill(0); for(const value of values) counts[value]++;
  let h=0; for(const count of counts) if(count){const p=count/values.length;h-=p*Math.log2(p);} return h;
}
function jsBits(left, right) {
  const a=Array(29).fill(0),b=Array(29).fill(0); for(const x of left)a[x]++;for(const x of right)b[x]++;
  let js=0;for(let i=0;i<29;i++){const p=a[i]/left.length,q=b[i]/right.length,m=(p+q)/2;if(p)js+=0.5*p*Math.log2(p/m);if(q)js+=0.5*q*Math.log2(q/m);}return js;
}
function scoreBoundary(values, position) {
  if (position < W || position + W >= values.length) return null;
  const d=deltas(values), before=d.slice(position-W,position), after=d.slice(position,position+W);
  if(before.length!==W||after.length!==W)throw new Error("window construction drift");
  const reflected=after.map(x=>(-x+8+29)%29);
  const identity_js_bits=jsBits(before,after),reflection_js_bits=jsBits(before,reflected);
  return {identity_js_bits,reflection_js_bits,advantage:identity_js_bits-reflection_js_bits};
}

function eventForAnalysis(event) {
  const boundaries=event.boundary_positions_section_0 || [];
  const values=sectionRecords[event.section];
  const valid=boundaries.filter(position=>scoreBoundary(values,position)!==null);
  return {...event, boundaries, valid_boundaries:valid};
}
const analyzedEvents=artifact.events.filter(e=>e.section).map(eventForAnalysis);
const v072Event=analyzedEvents.find(e=>e.id==="p39-heading");
const v072=scoreBoundary(sectionRecords["0.11"].map(r=>r.value),protocol.v072_exact_audit.boundary_coordinate_0);
if (!v072Event || !v072Event.valid_boundaries.includes(1468)) throw new Error("v0.72 event alignment drift");
if (Math.abs(v072.identity_js_bits-protocol.v072_exact_audit.identity_js_bits)>protocol.v072_exact_audit.tolerance ||
    Math.abs(v072.reflection_js_bits-protocol.v072_exact_audit.reflection_js_bits)>protocol.v072_exact_audit.tolerance)
  throw new Error("v0.72 exact reproduction failed");

const phaseSections={discovery:protocol.independent_discovery_sections,heldout:protocol.heldout_sections};
function eventsForPhase(phase){return analyzedEvents.filter(e=>phaseSections[phase].includes(e.section)&&e.valid_boundaries.length);}
const phaseEvents={discovery:eventsForPhase("discovery"),heldout:eventsForPhase("heldout")};
const eligibilityBySection={};
for(const section of Object.keys(sectionPages)){
  const events=analyzedEvents.filter(e=>e.section===section),valid=events.filter(e=>e.valid_boundaries.length);
  eligibilityBySection[section]={events:events.length,eligible_events:valid.length,unique_valid_boundaries:[...new Set(valid.flatMap(e=>e.valid_boundaries))].sort((a,b)=>a-b),status:section==="0.11"?"historical_discovery_only":valid.length?"eligible":"no_complete_58_transition_window"};
}

if(argv.includes("--validate-only")){
  process.stdout.write(JSON.stringify({protocol_sha256:sha256(protocolBytes),artifact_sha256:sha256(artifactBytes),corpus_sha256:sha256(corpusBytes),v072_exact_reproduction:{section:"0.11",boundary_coordinate_0:1468,...v072,status:"EXACT_REPRODUCTION_NOT_NEW_EVIDENCE"},eligibility_by_section:eligibilityBySection,discovery_event_ids:phaseEvents.discovery.map(e=>e.id),heldout_event_ids:phaseEvents.heldout.map(e=>e.id)},null,2)+"\n");
  process.exit(0);
}

function mean(values){return values.reduce((a,b)=>a+b,0)/values.length;}
function hierarchyScore(sectionValues, events, boundaryOverride=null) {
  const eventResults=[];
  for(const event of events){
    const positions=boundaryOverride?boundaryOverride.get(event.id):event.valid_boundaries;
    const boundaries=positions.map(position=>({position,...scoreBoundary(sectionValues,position)}));
    eventResults.push({id:event.id,page:event.page,section:event.section,kind:event.kind,boundaries,score:mean(boundaries.map(x=>x.advantage))});
  }
  const pages=[...new Set(eventResults.map(e=>e.page))].sort((a,b)=>a-b).map(page=>{const es=eventResults.filter(e=>e.page===page);return{page,event_ids:es.map(e=>e.id),score:mean(es.map(e=>e.score))};});
  return {aggregate:mean(pages.map(p=>p.score)),positive_pages:pages.filter(p=>p.score>0).length,page_count:pages.length,pages,events:eventResults};
}

function mulberry32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function pick(array,rng){return array[Math.floor(rng()*array.length)];}
function shuffleRange(array,start,end,rng){for(let i=end-1;i>start;i--){const j=start+Math.floor(rng()*(i-start+1));const t=array[i];array[i]=array[j];array[j]=t;}}
function summarizeNull(values,observed){let sum=0,sq=0,exceed=0;for(const x of values){sum+=x;sq+=x*x;if(x>=observed)exceed++;}const mean=sum/values.length,sd=Math.sqrt(Math.max(0,sq/values.length-mean*mean)),p=(exceed+1)/(values.length+1);return{resamples:values.length,mean,sd,z:sd?(observed-mean)/sd:0,exceedances:exceed,p_raw:p,p_bonferroni_3:Math.min(1,3*p)};}

function forbiddenForSection(section){
  const positions=new Set(),intervalsByPage=new Map();
  for(const event of analyzedEvents.filter(e=>e.section===section)){
    for(const p of event.boundaries)positions.add(p);
    if(event.rune_stream_role==="rune_run"){
      const [a,b]=event.section_rune_range_0_half_open;
      for(let p=a;p<=b;p++)positions.add(p);
      if(!intervalsByPage.has(event.page))intervalsByPage.set(event.page,[]);
      intervalsByPage.get(event.page).push(event.page_raw_rune_range_0_half_open);
    }
  }
  return{positions,intervalsByPage};
}
function phasePools(events,section){
  const values=sectionRecords[section],forbidden=forbiddenForSection(section),boundaryPools=new Map(),eventPools=new Map();
  for(const event of events){
    const page=event.page,start=pageStarts[`${section}|${page}`],length=(pageRecords.get(page)||[]).length;
    if(!boundaryPools.has(page)){
      const pool=[];for(let local=0;local<=length;local++){const p=start+local;if(scoreBoundary(values.map(r=>r.value),p)&&!forbidden.positions.has(p))pool.push(p);}if(!pool.length)throw new Error(`empty matched pool page ${page}`);boundaryPools.set(page,pool);
    }
    const runLength=event.run_length||0,candidates=[];
    for(let local=0;local+runLength<=length;local++){
      const intervalOverlap=(forbidden.intervalsByPage.get(page)||[]).some(([a,b])=>runLength?local<b&&local+runLength>a:local>=a&&local<=b);
      if(intervalOverlap)continue;
      const ps=runLength?[start+local,start+local+runLength]:[start+local];
      if(ps.every(p=>scoreBoundary(values.map(r=>r.value),p)&&!forbidden.positions.has(p)))candidates.push(ps);
    }
    if(!candidates.length)throw new Error(`empty event-position pool ${event.id}`);eventPools.set(event.id,candidates);
  }
  return{boundaryPools,eventPools};
}

function runPhase(phase,seedOffset){
  const sections=phaseSections[phase];if(sections.length!==1)throw new Error("v0.83 freezes one section per independent phase");
  const section=sections[0],records=sectionRecords[section],values=records.map(r=>r.value),events=phaseEvents[phase],observed=hierarchyScore(values,events),pools=phasePools(events,section);
  const matched=new Float64Array(B),positions=new Float64Array(B),permuted=new Float64Array(B);
  const rngMatched=mulberry32(protocol.rng_seed+seedOffset+1),rngPositions=mulberry32(protocol.rng_seed+seedOffset+2),rngPermutation=mulberry32(protocol.rng_seed+seedOffset+3);
  const pageSlices=[];for(const page of [...new Set(records.map(r=>r.page))]){const start=pageStarts[`${section}|${page}`],length=(pageRecords.get(page)||[]).length;pageSlices.push([start,start+length]);}
  for(let b=0;b<B;b++){
    const matchedMap=new Map(),positionMap=new Map();
    for(const event of events){matchedMap.set(event.id,event.valid_boundaries.map(()=>pick(pools.boundaryPools.get(event.page),rngMatched)));positionMap.set(event.id,pick(pools.eventPools.get(event.id),rngPositions));}
    matched[b]=hierarchyScore(values,events,matchedMap).aggregate;
    positions[b]=hierarchyScore(values,events,positionMap).aggregate;
    const pv=values.slice();for(const [start,end] of pageSlices)shuffleRange(pv,start,end,rngPermutation);permuted[b]=hierarchyScore(pv,events).aggregate;
  }
  const controls={matched_nonred_boundaries:summarizeNull(matched,observed.aggregate),randomized_event_positions:summarizeNull(positions,observed.aggregate),within_page_rune_permutation:summarizeNull(permuted,observed.aggregate)};
  const allControlsPass=Object.values(controls).every(c=>c.p_bonferroni_3<=0.05);
  const passes=observed.aggregate>0&&observed.positive_pages>=2&&allControlsPass;
  return{phase,section,event_count:events.length,unique_boundary_count:new Set(events.flatMap(e=>e.valid_boundaries)).size,observed,controls,criteria:{reflection_beats_identity:observed.aggregate>0,positive_pages_at_least_2:observed.positive_pages>=2,all_three_bonferroni_controls:allControlsPass,passes}};
}

function bigramKey(a,b){return `${a},${b}`;}
function descriptiveBoundary(section,position){
  const values=sectionRecords[section].map(r=>r.value),d=deltas(values),beforeD=d.slice(position-W,position),afterD=d.slice(position,position+W);
  const sectionCounts=new Map();for(let i=0;i+1<values.length;i++){const k=bigramKey(values[i],values[i+1]);sectionCounts.set(k,(sectionCounts.get(k)||0)+1);}
  function side(start){const keys=[];for(let i=start;i<start+W;i++)keys.push(bigramKey(values[i],values[i+1]));const outside=new Map(sectionCounts);for(const k of keys)outside.set(k,outside.get(k)-1);const pairIds=keys.map(k=>{const [a,b]=k.split(",").map(Number);return a*29+b;});return{adjacent_repeat_rate:keys.filter(k=>{const[a,b]=k.split(",");return a===b;}).length/W,delta_entropy_bits:entropyBins(start===position-W?beforeD:afterD),directed_bigram_entropy_bits:entropyBins(pairIds,29*29),outside_window_forbidden_bigram_rate:keys.filter(k=>outside.get(k)===0).length/W,section_rare_bigram_rate:keys.filter(k=>sectionCounts.get(k)<=2).length/W};}
  return{section,position,before:side(position-W),after:side(position)};
}

const discovery=runPhase("discovery",1000),heldout=runPhase("heldout",2000);
const survived=discovery.criteria.passes&&heldout.criteria.passes;
const allUnsolvedEvents=analyzedEvents.filter(e=>e.page<=55),validOccurrences=allUnsolvedEvents.flatMap(e=>e.valid_boundaries.map(position=>({event_id:e.id,page:e.page,section:e.section,position})));
const uniqueValid=new Map();for(const x of validOccurrences)uniqueValid.set(`${x.section}|${x.position}`,x);
const secondary={status:"DESCRIPTIVE_ONLY",event_counts:{all_image_events:artifact.event_count,unsolved_events:allUnsolvedEvents.length,solved_control_events:artifact.events.filter(e=>e.solved_control).length,eligible_unsolved_events:allUnsolvedEvents.filter(e=>e.valid_boundaries.length).length,eligible_boundary_occurrences:validOccurrences.length,unique_eligible_section_boundaries:uniqueValid.size},eligibility_by_section:eligibilityBySection,boundary_window_statistics:[...uniqueValid.values()].map(x=>({...x,...descriptiveBoundary(x.section,x.position)}))};
const result={protocol_version:protocol.version,protocol_sha256:sha256(protocolBytes),artifact_sha256:sha256(artifactBytes),corpus_sha256:sha256(corpusBytes),image_archive_sha256:protocol.image_archive_sha256,resamples_per_control:B,primary:{window_transitions_each_side:W,reflection:"(-delta + 8) mod 29",aggregate:protocol.aggregate},exact_reproductions:{v072:{section:"0.11",boundary_coordinate_0:1468,...v072,expected_identity_js_bits:protocol.v072_exact_audit.identity_js_bits,expected_reflection_js_bits:protocol.v072_exact_audit.reflection_js_bits,status:"EXACT_REPRODUCTION_NOT_NEW_EVIDENCE"}},new_results:{discovery,heldout},secondary_descriptive:secondary,hard_negative_guards:protocol.hard_negative_guards,plaintext_generated:false,decision:survived?protocol.promotion.success_label:protocol.promotion.failure_label};
fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({exact_v072:result.exact_reproductions.v072,new_discovery:{aggregate:discovery.observed.aggregate,passes:discovery.criteria.passes},new_heldout:{aggregate:heldout.observed.aggregate,passes:heldout.criteria.passes},decision:result.decision,output:outputPath},null,2));
