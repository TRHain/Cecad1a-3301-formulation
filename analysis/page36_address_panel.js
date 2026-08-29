#!/usr/bin/env node
"use strict";

const fs=require("fs"),path=require("path"),crypto=require("crypto");
const ROOT=path.resolve(__dirname,"..");
const configPath=path.join(__dirname,"v0.82-page36-protocol.json");
const config=JSON.parse(fs.readFileSync(configPath,"utf8"));
const parentProtocolBytes=fs.readFileSync(path.join(__dirname,"v0.82-protocol.json"));
if(crypto.createHash("sha256").update(parentProtocolBytes).digest("hex")!==config.parent_protocol_sha256)throw new Error("parent protocol hash mismatch");
const artifactPath=path.join(ROOT,"liber-primus","page36-91-artifact.json");
const artifactBytes=fs.readFileSync(artifactPath);
if(crypto.createHash("sha256").update(artifactBytes).digest("hex")!==config.artifact_sha256)throw new Error("artifact hash mismatch");
if(config.red_event_state!==false)throw new Error("red must be OFF");
const artifact=JSON.parse(artifactBytes);
const argv=process.argv.slice(2);function option(n,d=null){const i=argv.indexOf(n);return i<0?d:argv[i+1];}
const B=Number(option("--resamples",config.resamples)),output=option("--output");if(!output)throw new Error("--output required");

const primes=[];for(let n=2;primes.length<9999;n++){let p=true;for(let d=2;d*d<=n;d++)if(n%d===0){p=false;break;}if(p)primes.push(n);}
function isPrime(n){if(n<2)return false;for(let d=2;d*d<=n;d++)if(n%d===0)return false;return true;}
function primeRank(n){let lo=0,hi=primes.length;while(lo<hi){const m=(lo+hi)>>1;if(primes[m]<=n)lo=m+1;else hi=m;}return lo;}
const fib=[1,2,3,4,6,9,14,22,35,56,90,145,234,378,611,988];
function transform(q,t){const f=fib[(q-1)%16];if(t==="identity")return q;if(t==="prime_rank")return primeRank(q);if(t==="nth_prime")return primes[q-1];if(t==="page32_ordinal")return f;if(t==="page32_prime")return primes[f-1];throw new Error(t);}
function address(t,L,map,orientation){let a;if(map==="bounded"){if(t<1||t>L)return null;a=t-1;}else a=(t-1)%L;return orientation==="forward"?a:L-1-a;}
const runeById=new Map();const markAdjacent=new Map();
for(const row of artifact.rows){for(let i=0;i<row.tokens.length;i++){const tok=row.tokens[i];if(tok.type!=="rune")continue;runeById.set(tok.rune_id,tok);markAdjacent.set(tok.rune_id,(row.tokens[i-1]&&row.tokens[i-1].type==="word_mark")||(row.tokens[i+1]&&row.tokens[i+1].type==="word_mark"));}}
const pairs=[[2,3],[4,5],[6,7]],diag=Math.hypot(2400,3600);
const rules=[];for(const order of config.reading_orders)for(const t of config.transforms)for(const map of config.address_maps)for(const orientation of config.orientations)rules.push({order,transform:t,map,orientation,id:`${order}|${t}|${map}|${orientation}`});
function score(rule,selectors,offset=0){const order=artifact.reading_orders[rule.order],hits=[];let word=0,state=0,anchors=0;
 for(const q of selectors){let pos=address(transform(q,rule.transform),order.length,rule.map,rule.orientation);if(pos===null){hits.push(null);continue;}pos=(pos+offset)%order.length;const tok=runeById.get(order[pos]);hits.push(tok);anchors++;if(markAdjacent.get(tok.rune_id))word++;if(tok.rune_index_0===q%29)state++;}
 let collisions=0,concord=0,rowSame=0,negDist=0;for(let i=0;i<hits.length;i++)for(let j=i+1;j<hits.length;j++)if(hits[i]&&hits[j]&&hits[i].rune_index_0===hits[j].rune_index_0)collisions++;
 for(const [a,b] of pairs)if(hits[a]&&hits[b]){if(hits[a].rune_index_0===hits[b].rune_index_0&&markAdjacent.get(hits[a].rune_id)===markAdjacent.get(hits[b].rune_id))concord++;if(hits[a].row===hits[b].row)rowSame++;negDist-=Math.hypot(hits[a].centroid_px[0]-hits[b].centroid_px[0],hits[a].centroid_px[1]-hits[b].centroid_px[1])/diag;}
 return {word_mark_hits:word,selector_state_matches:state,rune_collisions:collisions,reversal_rune_and_mark_concordance:concord,reversal_row_coincidence:rowSame,negative_reversal_distance:negDist,anchors};}
const cells=[];for(const rule of rules){const s=score(rule,config.selectors);if(!s.anchors)continue;for(const metric of config.metrics)cells.push({id:`page36|${rule.id}|${metric}`,rule,metric,score:s[metric],anchors:s.anchors});}
function rng32(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function rev(n){return Number(String(n).split("").reverse().join(""));}const pd=[],pc=[],pp3=[],pp4=[];for(let a=11;a<=49;a++)if(isPrime(a))pd.push([a,2*a]);for(let a=100;a<=999;a++){const b=rev(a);if(b<100)continue;if(!isPrime(a)&&isPrime(b))pc.push([a,b]);if(isPrime(a)&&isPrime(b))pp3.push([a,b]);}for(let a=1000;a<=9999;a++){const b=rev(a);if(b>=1000&&isPrime(a)&&isPrime(b))pp4.push([a,b]);}
function family(rng){for(;;){const q=[pd,pc,pp3,pp4].map(p=>p[Math.floor(rng()*p.length)]).flat();if(new Set(q).size===8&&q.join(",")!==config.selectors.join(","))return q;}}
function allocate(){return cells.map(()=>new Float64Array(B));}
function structured(){const a=allocate(),rng=rng32(config.rng_seed+1);for(let b=0;b<B;b++){const q=family(rng),cache=new Map();for(let i=0;i<cells.length;i++){const c=cells[i];if(!cache.has(c.rule.id))cache.set(c.rule.id,score(c.rule,q));a[i][b]=cache.get(c.rule.id)[c.metric];}}return a;}
function shifted(){const a=allocate(),rng=rng32(config.rng_seed+2);for(let b=0;b<B;b++){const offsets=new Map(config.reading_orders.map(o=>[o,Math.floor(rng()*91)])),cache=new Map();for(let i=0;i<cells.length;i++){const c=cells[i],key=c.rule.id;if(!cache.has(key))cache.set(key,score(c.rule,config.selectors,offsets.get(c.rule.order)));a[i][b]=cache.get(key)[c.metric];}}return a;}
function adjust(arrays){const st=cells.map((c,i)=>{let s=0,q=0;for(const x of arrays[i]){s+=x;q+=x*x;}const mean=s/B,sd=Math.sqrt(Math.max(0,q/B-mean*mean));return{mean,sd,z:sd?(c.score-mean)/sd:0};}),mx=new Float64Array(B);for(let b=0;b<B;b++){let m=-Infinity;for(let i=0;i<cells.length;i++){const z=st[i].sd?(arrays[i][b]-st[i].mean)/st[i].sd:0;if(z>m)m=z;}mx[b]=m;}return cells.map((c,i)=>{let e=0;for(const m of mx)if(m>=st[i].z)e++;return{...st[i],p_fwer:(e+1)/(B+1)};});}
const sa=adjust(structured()),wa=adjust(shifted());const results=cells.map((c,i)=>({...c,structured_number_control:sa[i],circular_order_control:wa[i]}));
const dual=results.filter(r=>r.structured_number_control.p_fwer<=0.05&&r.circular_order_control.p_fwer<=0.05&&r.structured_number_control.z>0&&r.circular_order_control.z>0).map(r=>r.id);
const out={protocol_version:config.version,protocol_sha256:crypto.createHash("sha256").update(fs.readFileSync(configPath)).digest("hex"),artifact_sha256:config.artifact_sha256,resamples:B,red_event_state:false,status:config.status,cell_count:cells.length,results,dual_control_descriptive_hits:dual,decision:dual.length?"PAGE36_DESCRIPTIVE_ADDRESS_ANOMALY_NONPROMOTABLE":"NO_PAGE36_ADDRESS_ANOMALY"};fs.writeFileSync(output,JSON.stringify(out,null,2)+"\n");console.log(JSON.stringify({cells:cells.length,dual_control_descriptive_hits:dual,decision:out.decision,output},null,2));
