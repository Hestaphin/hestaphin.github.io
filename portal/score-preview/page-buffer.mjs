// SPDX-License-Identifier: GPL-3.0-only
// Render and decode ahead of the music, keeping a bounded, reusable page buffer.
export function createPageBuffer({load,prepare,release=()=>{},limit=6}){
 const entries=new Map(),pending=new Map();let closed=false,pinned=new Set();
 function trim(){for(const [index,value]of entries){if(entries.size<=limit)break;if(!pinned.has(index)){entries.delete(index);release(value);}}}
 function get(index){const value=entries.get(index);if(value){entries.delete(index);entries.set(index,value);}return value;}
 function request(index,content){
  if(closed)return Promise.reject(Error('CLOSED'));
  const cached=get(index);if(cached)return Promise.resolve(cached);
  if(pending.has(index))return pending.get(index);
  const work=Promise.resolve().then(async()=>{
   const value=await prepare(content??await load(index),index);
   if(closed){release(value);throw Error('CLOSED');}
   entries.set(index,value);trim();return value;
  }).finally(()=>pending.delete(index));
  pending.set(index,work);return work;
 }
 return {get,request,protect(indices){pinned=new Set(indices);trim();},close(){closed=true;for(const value of entries.values())release(value);entries.clear();},size:()=>entries.size};
}

// Use written time within each native repeat run. Do not assume page + 1 is
// next: a repeat can turn backwards, and an ending can skip written pages.
export function createPageLookahead(measures,repeatPlan=[]){
 const ranges=[];
 for(const m of measures.slice().sort((a,b)=>a.startMs-b.startMs)){
  const last=ranges.at(-1);
  if(last?.page===m.page)last.endMs=Math.max(last.endMs,m.endMs);
  else ranges.push({page:m.page,startMs:m.startMs,endMs:m.endMs});
 }
 const runs=repeatPlan.length?repeatPlan:[{startMs:0,endMs:ranges.at(-1)?.endMs||0}];
 return (time,runIndex,currentPage,count=2)=>{
  const pages=[];
  for(let r=runIndex;r<runs.length&&pages.length<count;r++){
   const run=runs[r],from=r===runIndex?Math.max(time,run.startMs):run.startMs;
   let lo=0,hi=ranges.length;while(lo<hi){const mid=(lo+hi)>>1;if(ranges[mid].endMs<=from)lo=mid+1;else hi=mid;}
   for(let i=lo;i<ranges.length&&ranges[i].startMs<run.endMs&&pages.length<count;i++){
    const page=ranges[i].page;if(page!==currentPage&&!pages.includes(page))pages.push(page);
   }
  }
  return pages;
 };
}
