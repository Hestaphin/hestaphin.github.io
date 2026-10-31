// SPDX-License-Identifier: GPL-3.0-only
// The pinned encoder writes the written score once. Follow MuseScore's native
// repeat itinerary by seeking that audio at repeat/ending boundaries.
export function buildRepeatPlan(measures,events){
 if(!Array.isArray(measures)||!Array.isArray(events)||events.length>200000)throw Error('NOTE_MAP_UNAVAILABLE');
 const ranges=new Map();
 for(const m of measures){if(!Number.isSafeInteger(m.layoutId)||m.layoutId<0||![m.startMs,m.endMs].every(Number.isFinite)||m.startMs<0||m.endMs<=m.startMs)throw Error('NOTE_MAP_UNAVAILABLE');
  const old=ranges.get(m.layoutId);if(old){old.startMs=Math.min(old.startMs,m.startMs);old.endMs=Math.max(old.endMs,m.endMs);}else ranges.set(m.layoutId,{startMs:m.startMs,endMs:m.endMs});
 }
 const written=[...ranges.keys()],order=events.map(e=>Number(e.elid));
 if(order.length===written.length&&order.every((id,i)=>id===written[i]))return [];
 const runs=[];
 for(const id of order){const r=ranges.get(id);if(!r)throw Error('NOTE_MAP_UNAVAILABLE');const previous=runs.at(-1);
  if(previous&&Math.abs(previous.endMs-r.startMs)<.1)previous.endMs=r.endMs;else runs.push({...r});
 }
 if(runs.length&&runs.at(-1).endMs<[...ranges.values()].reduce((end,r)=>Math.max(end,r.endMs),0)-.1)runs.at(-1).stopAtEnd=true;
 return runs;
}
export function createRepeatPlayback(audio,plan,{offsetMs=0,onJump=()=>{},schedule=setTimeout,cancel=clearTimeout}={}){
 if(!Array.isArray(plan)||plan.length<2)return {close(){},index:()=>0};
 let index=0,timer,closed=false,internal=null,completed=false;
 const time=()=>Math.max(0,(Number(audio.currentTime)||0)*1000-offsetMs);
 const stop=()=>{if(timer!=null)cancel(timer);timer=null;};
 function seekRun(next){index=next;const target=plan[index].startMs;internal=target;audio.currentTime=(target+offsetMs)/1000;onJump();}
 function locate(){const at=time();if(internal!=null&&Math.abs(at-internal)<150)return;
  if(at<=plan[0].startMs+2){index=0;return;}
  if(at>=plan[index].startMs&&at<plan[index].endMs)return;
  let found=plan.findIndex((r,i)=>i>=index&&at>=r.startMs&&at<r.endMs);if(found<0)found=plan.findIndex(r=>at>=r.startMs&&at<r.endMs);if(found>=0)index=found;
 }
 function tick(){stop();if(closed||audio.paused||audio.ended)return;
  if(audio.seeking){arm();return;}
  const at=time();if(index<plan.length-1&&at>=plan[index].endMs-1)seekRun(index+1);
  else if(index===plan.length-1&&plan[index].stopAtEnd&&at>=plan[index].endMs-1){completed=true;audio.pause();audio.currentTime=(plan[index].endMs+offsetMs-1)/1000;onJump();return;}
  arm();
 }
 function arm(){stop();if(closed||audio.paused||audio.ended||(index>=plan.length-1&&!plan[index].stopAtEnd))return;
  timer=schedule(tick,Math.max(4,Math.min(1000,(plan[index].endMs-time())/(Number(audio.playbackRate)||1))));
 }
 const handlers={play:()=>{if(completed){completed=false;seekRun(0);}locate();arm();},pause:stop,ratechange:arm,timeupdate:()=>{if(!audio.seeking)tick();},seeking:()=>{locate();stop();},seeked:()=>{internal=null;arm();},ended:()=>{stop();if(index<plan.length-1){seekRun(index+1);Promise.resolve(audio.play()).catch(()=>{});}}};
 for(const [event,fn]of Object.entries(handlers))audio.addEventListener(event,fn);
 locate();arm();
 return {index:()=>index,close(){closed=true;stop();for(const [event,fn]of Object.entries(handlers))audio.removeEventListener?.(event,fn);}};
}
