// SPDX-License-Identifier: GPL-3.0-only
// Build a bounded seekable index once; the animation loop only binary-searches it.
// Measured against WAV with the pinned 4.6.5 encoder (2,257 samples at 44.1 kHz).
// This is a fixed encoder delay, not a scale derived from MP3 tail/duration.
export const MP3_OFFSET_MS = 2257 / 44100 * 1000;
export function createPlaybackIndex(input,{anchors=[],measures=[],maxReferences=2000000}={}) {
 if(!Array.isArray(input)||!Array.isArray(anchors)||!Array.isArray(measures)||!(input.length+anchors.length+measures.length)||input.length+anchors.length+measures.length>200000)throw Error('NOTE_MAP_UNAVAILABLE');
 const bars=measures.map((m,i)=>{
  if(![m.measure,m.layoutId,m.page].every(v=>Number.isSafeInteger(v)&&v>=0)||![m.startMs,m.endMs].every(Number.isFinite)||m.startMs<0||m.endMs<=m.startMs||m.endMs>86400000)throw Error('NOTE_MAP_UNAVAILABLE');
  return {...m,eventId:i};
 }).sort((a,b)=>a.startMs-b.startMs||a.eventId-b.eventId);
 const rows=input.map((n,i)=>{
  if(!Number.isSafeInteger(n.id)||n.id<0||!Number.isSafeInteger(n.page)||n.page<0||![n.startMs,n.endMs].every(Number.isFinite)||n.startMs<0||n.endMs<=n.startMs||n.endMs>86400000)throw Error('NOTE_MAP_UNAVAILABLE');
  return {...n,eventId:i};
 }).sort((a,b)=>a.startMs-b.startMs||a.id-b.id);
 const boundaries=[];for(const n of rows){boundaries.push({at:n.startMs,on:true,n},{at:n.endMs,on:false,n});}
 boundaries.sort((a,b)=>a.at-b.at||Number(a.on)-Number(b.on));
 const frames=[],active=new Map(),occurrences=new Map();let references=0;
 for(const n of rows){if(!occurrences.has(n.id))occurrences.set(n.id,[]);occurrences.get(n.id).push(n);}
 for(const n of anchors){
  if(!Number.isSafeInteger(n.id)||n.id<0||!Number.isSafeInteger(n.page)||n.page<0||!Number.isFinite(n.startMs)||n.startMs<0||n.startMs>86400000)throw Error('NOTE_MAP_UNAVAILABLE');
  if(!occurrences.has(n.id))occurrences.set(n.id,[]);occurrences.get(n.id).push({...n,endMs:n.startMs});
 }
 for(const list of occurrences.values())list.sort((a,b)=>a.startMs-b.startMs);
 for(let i=0;i<boundaries.length;){const at=boundaries[i].at;while(i<boundaries.length&&boundaries[i].at===at){const e=boundaries[i++];if(e.on)active.set(e.n.eventId,e.n);else active.delete(e.n.eventId);}
  references+=active.size;if(references>maxReferences)throw Error('NOTE_MAP_UNAVAILABLE');
  const playing=[...active.values()];let focus=playing[0];for(const n of playing)if(n.startMs>focus.startMs)focus=n;
  frames.push({at,notes:playing,ids:[...new Set(playing.map(n=>n.id))],page:focus?.page??null,key:playing.map(n=>n.eventId).join(',')});
 }
 return {
  durationMs:bars.reduce((end,m)=>Math.max(end,m.endMs),rows.reduce((end,n)=>Math.max(end,n.endMs),0)),
  at(time){let lo=0,hi=frames.length;while(lo<hi){const mid=(lo+hi)>>1;if(frames[mid].at<=time)lo=mid+1;else hi=mid;}const frame=frames[lo-1]||{at:0,notes:[],ids:[],page:null,key:''};
   lo=0;hi=bars.length;while(lo<hi){const mid=(lo+hi)>>1;if(bars[mid].startMs<=time)lo=mid+1;else hi=mid;}const candidate=bars[lo-1],measure=candidate&&time<candidate.endMs?candidate:null;
   return {...frame,measure,page:measure?.page??frame.page,key:frame.key+'|'+(measure?.eventId??'')};},
  noteStart(id,currentMs=0){const list=occurrences.get(id)||[];return list.find(n=>n.startMs<=currentMs&&n.endMs>currentMs)?.startMs??list.find(n=>n.startMs>=currentMs)?.startMs??list[0]?.startMs??null;},
  occurrences(id){return occurrences.get(id)||[];}
 };
}
export function barHighlightBox(geometry,id) {
 if(!Array.isArray(geometry?.viewBox)||geometry.viewBox.length!==4||geometry.viewBox.some(v=>!Number.isFinite(v))||geometry.viewBox[2]<=0||geometry.viewBox[3]<=0)throw Error('NOTE_MAP_UNAVAILABLE');
 const b=geometry.measures?.find(m=>m.id===id)?.bounds;
 if(!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)throw Error('NOTE_MAP_UNAVAILABLE');
 const [x,y,w,h]=geometry.viewBox;return {left:(b.x-x)/w*100,top:(b.y-y)/h*100,width:b.width/w*100,height:b.height/h*100,bounds:b};
}
export function barHighlightSvg(geometry,id) {
 const b=barHighlightBox(geometry,id).bounds;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${geometry.viewBox.join(' ')}"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#ff8080" opacity=".4"/></svg>`;
}
export function hitNote(geometry,x,y) {
 let found=null,distance=Infinity;
 for(const n of geometry?.notes||[]){const b=n.bounds,pad=Math.max(3,Math.min(10,b.height));if(x<b.x-pad||x>b.x+b.width+pad||y<b.y-pad||y>b.y+b.height+pad)continue;
  const d=((x-(b.x+b.width/2))/Math.max(4,b.width))**2+((y-(b.y+b.height/2))/Math.max(4,b.height))**2;
  if(d<distance){distance=d;found=n;}
 }
 return found;
}
export function highlightSvg(geometry,ids) {
 if(!Array.isArray(geometry?.viewBox)||geometry.viewBox.length!==4||geometry.viewBox.some(v=>!Number.isFinite(v))||geometry.viewBox[2]<=0||geometry.viewBox[3]<=0)throw Error('NOTE_MAP_UNAVAILABLE');
 const selected=new Set(ids),parts=[];
 for(const n of geometry?.notes||[])if(selected.has(n.id)){
  const b=n.bounds;if(!b||![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<0||b.height<0)throw Error('NOTE_MAP_UNAVAILABLE');parts.push(`<rect x="${b.x-2}" y="${b.y-2}" width="${b.width+4}" height="${b.height+4}" rx="2" fill="#8ed0ff" opacity=".3"/>`);
  for(const p of n.paths){if(typeof p.d!=='string'||/[^MLHVCSQTAZmlhvcsqtaz0-9eE+.,\s-]/.test(p.d)||!Array.isArray(p.matrix)||p.matrix.length!==6||p.matrix.some(v=>!Number.isFinite(v)))throw Error('NOTE_MAP_UNAVAILABLE');parts.push(`<path d="${p.d}" transform="matrix(${p.matrix.join(' ')})" fill="#096ac4"/>`);}
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${geometry.viewBox.join(' ')}">${parts.join('')}</svg>`;
}
