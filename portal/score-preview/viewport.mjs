// SPDX-License-Identifier: GPL-3.0-only
// Keep the viewed staff at the same screen height across engraved page layouts.
const finite=Number.isFinite;
const median=values=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
export function staffLayoutFromLines(lines,measures,order=[],notes=[]){
 const systems=[];
 for(const m of measures||[]){const b=m.bounds;if(!b||![b.x,b.y,b.width,b.height].every(finite))continue;
  if(!systems.some(s=>Math.abs(s.top-b.y)<.5&&Math.abs(s.bottom-b.y-b.height)<.5))systems.push({top:b.y,bottom:b.y+b.height});
 }
 systems.sort((a,b)=>a.top-b.top);const out=[];
 for(const [system,bounds] of systems.entries()){
  const ys=[];for(const line of lines||[])if(finite(line.y)&&line.y>=bounds.top-.5&&line.y<=bounds.bottom+.5&&!ys.some(y=>Math.abs(y-line.y)<.5))ys.push(line.y);
  ys.sort((a,b)=>a-b);if(!ys.length)continue;
  const gaps=ys.slice(1).map((y,i)=>y-ys[i]).filter(g=>g>.5),space=median(gaps)||16,groups=[];
  for(const y of ys){const last=groups.at(-1);if(last&&y-last.bottom<=space*1.6)last.bottom=y;else groups.push({top:y,bottom:y});}
  const full=groups.length===order.length,used=new Set();
  for(const [i,g] of groups.entries()){
   let key=full?order[i].key:null;
   if(!full){
    const votes=new Map();for(const n of notes){if(!n.staffKey||!n.bounds)continue;const y=n.bounds.y+n.bounds.height/2;
     if(y<bounds.top-space*2||y>bounds.bottom+space*2)continue;
     const closest=groups.reduce((best,row)=>Math.abs(y-(row.top+row.bottom)/2)<Math.abs(y-(best.top+best.bottom)/2)?row:best,groups[0]);
     if(closest===g)votes.set(n.staffKey,(votes.get(n.staffKey)||0)+1);
    }
    const ranked=[...votes].sort((a,b)=>b[1]-a[1]);if(ranked[0]&&ranked[0][1]>(ranked[1]?.[1]||0)*2&&!used.has(ranked[0][0]))key=ranked[0][0];
   }
   if(key)used.add(key);out.push({...g,key,system});
  }
 }
 return out;
}
export function captureScoreViewport(geometry,metrics){
 const top=Number(metrics.scrollTop)||0,left=Number(metrics.scrollLeft)||0,height=Number(metrics.paperHeight),width=Number(metrics.paperWidth);
 const box=geometry?.viewBox,valid=Array.isArray(box)&&box.length===4&&box.every(finite)&&box[3]>0&&height>0;
 const memory={top,left,viewBox:box,relativeY:null,horizontal:width>0?left/width:null,staffKey:null,offset:0,system:0};
 if(!valid)return memory;
 const scale=height/box[3],visible=box[1]+(metrics.viewportTop-metrics.paperTop)/scale;
 memory.relativeY=(visible-box[1])/box[3];
 const bottom=visible+(metrics.viewportHeight||0)/scale;
 const staff=geometry.staves?.find(s=>s.top>=visible&&s.bottom<=bottom)||geometry.staves?.find(s=>s.bottom>=visible&&s.top<=bottom);
 if(staff?.key){memory.staffKey=staff.key;memory.offset=(staff.top-visible)*scale;memory.system=staff.system;}
 return memory;
}
export function restoreScoreViewport(memory,geometry,metrics,{measureId=null}={}){
 const box=geometry?.viewBox||memory.viewBox,height=Number(metrics.paperHeight),scale=box?.[3]>0&&height>0?height/box[3]:0;
 let top=memory.top,staff=null;
 if(scale){
  const candidates=(geometry?.staves||[]).filter(s=>s.key&&s.key===memory.staffKey);
  const measure=geometry?.measures?.find(m=>m.id===measureId)?.bounds;
  staff=(measure?candidates.find(s=>s.top>=measure.y-.5&&s.bottom<=measure.y+measure.height+.5):null)||candidates.find(s=>s.system===memory.system)||candidates[0];
  if(staff)top=metrics.scrollTop+metrics.paperTop+(staff.top-box[1])*scale-metrics.viewportTop-memory.offset;
  else if(finite(memory.relativeY))top=metrics.scrollTop+metrics.paperTop+memory.relativeY*height-metrics.viewportTop;
 }
 const left=finite(memory.horizontal)&&metrics.paperWidth>0?memory.horizontal*metrics.paperWidth:memory.left;
 return {top:Math.max(0,Math.min(top,finite(metrics.maxTop)?Math.max(0,metrics.maxTop):Infinity)),left:Math.max(0,Math.min(left,finite(metrics.maxLeft)?Math.max(0,metrics.maxLeft):Infinity)),staffKey:staff?.key||null};
}
