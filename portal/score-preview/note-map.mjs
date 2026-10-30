// SPDX-License-Identifier: GPL-3.0-only
// Bounded, dependency-free note-mapping adapter for webmscore 4.6.5-build.1.
// No DOM, network calls, eval, or engine binary are included.
const utf8=new TextEncoder(),decode=new TextDecoder('utf-8',{fatal:true});
const fail=message=>{throw new Error(message);};
const num=(value,fallback=0)=>value==null||value===''?fallback:Number(value);
const finite=value=>Number.isFinite(value);
const lower=value=>String(value||'').toLowerCase();
export function parseXml(source,{maxNodes=300000,maxDepth=128}={}) {
 if(typeof source!=='string'||source.length>72*1024*1024)fail('XML_LIMIT');
 const root={name:'#document',attrs:{},children:[],text:'',start:0,end:source.length};const stack=[root];let p=0,count=0;
 const entity=s=>s.replace(/&([^;\s]+);/g,(_,x)=>{
  const known={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(Object.hasOwn(known,x))return known[x];
  if(/^#(?:x[0-9a-f]+|[0-9]+)$/i.test(x)){const n=x[1].toLowerCase()==='x'?parseInt(x.slice(2),16):Number(x.slice(1));if(n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff))return String.fromCodePoint(n);}
  fail('XML_ENTITY');
 });
 while(p<source.length){
  if(source[p]!=='<'){let e=source.indexOf('<',p);if(e<0)e=source.length;stack.at(-1).text+=entity(source.slice(p,e));p=e;continue;}
  if(source.startsWith('<!--',p)){const e=source.indexOf('-->',p+4);if(e<0)fail('XML_COMMENT');p=e+3;continue;}
  if(source.startsWith('<![CDATA[',p)){const e=source.indexOf(']]>',p+9);if(e<0)fail('XML_CDATA');stack.at(-1).text+=source.slice(p+9,e);p=e+3;continue;}
  if(source.startsWith('<?',p)){const e=source.indexOf('?>',p+2);if(e<0)fail('XML_PI');p=e+2;continue;}
  let e=p+1,quote='',depth=0;
  for(;e<source.length;e++){const c=source[e];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='[')depth++;else if(c===']')depth--;else if(c==='>'&&!depth)break;}
  if(e===source.length)fail('XML_TAG');
  const token=source.slice(p+1,e);
  if(token[0]==='!'){if(!/^!DOCTYPE\s/i.test(token))fail('XML_DECLARATION');p=e+1;continue;}
  if(token[0]==='/'){
   const name=token.slice(1).trim();const node=stack.pop();if(stack.length===0||node.rawName!==name)fail('XML_NESTING');node.closeStart=p;node.end=e+1;p=e+1;continue;
  }
  const m=/^([^\s/>]+)([\s\S]*)$/.exec(token);if(!m)fail('XML_TAG_NAME');
  const selfClosing=/\/\s*$/.test(token),tail=m[2].replace(/\/\s*$/,'');const attrs=Object.create(null);let cursor=0;
  const re=/([^\s=/>]+)\s*=\s*("[^"]*"|'[^']*')/g;let a;
  while((a=re.exec(tail))){if(tail.slice(cursor,a.index).trim())fail('XML_ATTRIBUTE');attrs[a[1]]=entity(a[2].slice(1,-1));cursor=re.lastIndex;}
  if(tail.slice(cursor).trim())fail('XML_ATTRIBUTE');
  const n={rawName:m[1],name:m[1].split(':').at(-1),attrs,children:[],text:'',start:p,openEnd:e+1,closeStart:selfClosing?e:e+1,end:selfClosing?e+1:null};
  if(++count>maxNodes||stack.length>maxDepth)fail('XML_LIMIT');stack.at(-1).children.push(n);if(!selfClosing)stack.push(n);p=e+1;
 }
 if(stack.length!==1)fail('XML_UNCLOSED');return root;
}
const kids=(n,name)=>n.children.filter(x=>x.name===name),kid=(n,name)=>n.children.find(x=>x.name===name);
const text=(n,name)=>kid(n,name)?.text?.trim()||'';
function* walk(n){for(const c of n.children){yield c;yield*walk(c);}}
function replacements(source,items){
 // Assemble once. Re-copying the complete MSCX for every note is quadratic
 // and can exhaust the Worker timeout on ordinary full ensemble scores.
 const parts=[];let cursor=0;
 for(const x of items.sort((a,b)=>a.start-b.start||a.end-b.end)){
  if(x.start<cursor||x.end<x.start)fail('XML_EDIT_OVERLAP');
  parts.push(source.slice(cursor,x.start),x.text);cursor=x.end;
 }
 parts.push(source.slice(cursor));return parts.join('');
}
export function tagNativeMscx(source,{maxNotes=100000}={}){
 const tree=parseXml(source),edits=[],notes=[],chords=new Map();
 for(const chord of walk(tree))if(chord.name==='Chord')for(const note of kids(chord,'Note')){
  if(notes.length>=maxNotes)fail('NOTE_LIMIT');const code=0x120001+notes.length;if(code>=0xffffff)fail('COLOR_LIMIT');
  const color='#'+code.toString(16).padStart(6,'0');
  const graceKind=chord.children.find(x=>/^(acciaccatura|appoggiatura|grace\d+(after)?)$/i.test(x.name))?.name||null;
  const identity={id:notes.length,color,eid:text(note,'eid')||null,pitch:num(text(note,'pitch'),NaN),graceKind};
  notes.push(identity);if(!chords.has(chord))chords.set(chord,[]);chords.get(chord).push(identity);
  for(const c of kids(note,'color'))edits.push({start:c.start,end:c.end,text:''});
  edits.push({start:note.closeStart,end:note.closeStart,text:`<color r="${code>>16&255}" g="${code>>8&255}" b="${code&255}" a="255"/>`});
 }
 // MuseScore serializes both before- and after-grace chords before their
 // owner. MusicXML drops the after designation, so retain it from MSCX.
 for(const parent of [tree,...walk(tree)]){
  let pending=[];
  for(const chord of parent.children)if(chord.name==='Chord'){
   const group=chords.get(chord)||[];
   if(group[0]?.graceKind)pending.push(...group);
   else if(group.length){for(const grace of pending)grace.ownerId=group[0].id;pending=[];}
  }
 }
 if(!notes.length)fail('NO_NOTES');return {xml:replacements(source,edits),notes};
}
let crcTable;
function crc32(bytes){if(!crcTable)crcTable=Uint32Array.from({length:256},(_,i)=>{for(let k=0;k<8;k++)i=(i&1)?0xedb88320^(i>>>1):i>>>1;return i>>>0;});let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function zipEntries(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===bytes.length){end=p;break;}
 if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))fail('ZIP_FORMAT');
 let p=v.getUint32(end+16,true),expanded=0;const centralStart=p,centralEnd=p+v.getUint32(end+12,true),count=v.getUint16(end+10,true),entries=[],names=new Set();if(!count||count>2048||count!==v.getUint16(end+8,true)||centralEnd>end)fail('ZIP_LIMIT');
 for(let i=0;i<count;i++){
  if(p+46>centralEnd||v.getUint32(p,true)!==0x02014b50)fail('ZIP_CENTRAL');
  const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),packed=v.getUint32(p+20,true),size=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),offset=v.getUint32(p+42,true);
  if(flags&1||![0,8].includes(method)||offset+30>centralStart||p+46+nl+el+cl>centralEnd||v.getUint16(p+34,true))fail('ZIP_FORMAT');
  const nameBytes=bytes.slice(p+46,p+46+nl),name=decode.decode(nameBytes).replaceAll('\\','/');if(names.has(name)||name.includes('\0')||name.startsWith('/')||/^[a-z]:/i.test(name)||name.split('/').includes('..'))fail('ZIP_PATH');names.add(name);
  if(v.getUint32(offset,true)!==0x04034b50||v.getUint16(offset+6,true)!==flags||v.getUint16(offset+8,true)!==method)fail('ZIP_LOCAL');const localNl=v.getUint16(offset+26,true),dataStart=offset+30+localNl+v.getUint16(offset+28,true);if(localNl!==nl||dataStart+packed>centralStart)fail('ZIP_DATA');
  for(let j=0;j<nl;j++)if(bytes[offset+30+j]!==nameBytes[j])fail('ZIP_LOCAL_NAME');
  expanded+=size;if(expanded>64*1024*1024)fail('ZIP_EXPANSION');
  entries.push({name,nameBytes,flags,method,size,crc:v.getUint32(p+16,true),packed:bytes.slice(dataStart,dataStart+packed),central:bytes.slice(p,p+46+nl+el+cl)});p+=46+nl+el+cl;
 }
 if(p!==centralEnd)fail('ZIP_CENTRAL_SIZE');return entries;
}
async function inflateEntry(e,inflateRaw){
 let b=e.packed;
 if(e.method!==0){
  if(inflateRaw)b=await inflateRaw(e.packed,{maxOutputLength:e.size});
  else{
   const reader=new Blob([e.packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let length=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>e.size||length>64*1024*1024){await reader.cancel();fail('ZIP_EXPANSION');}chunks.push(value);}}
   finally{reader.releaseLock();}
   b=new Uint8Array(length);let p=0;for(const chunk of chunks){b.set(chunk,p);p+=chunk.length;}
  }
 }
 const out=b instanceof Uint8Array?b:new Uint8Array(b);if(out.length!==e.size||crc32(out)!==e.crc)fail('ZIP_CRC');return out;
}
function repack(entries,replacedName,replacement){
 let localSize=0,centralSize=0;const locals=[],centrals=[];
 for(const e of entries){
  const changed=e.name===replacedName,data=changed?replacement:e.packed,method=changed?0:e.method,size=changed?replacement.length:e.size,crc=changed?crc32(replacement):e.crc;
  const local=new Uint8Array(30+e.nameBytes.length+data.length),lv=new DataView(local.buffer);lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,e.flags&~8,true);lv.setUint16(8,method,true);local.set(e.central.subarray(12,16),10);lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,size,true);lv.setUint16(26,e.nameBytes.length,true);local.set(e.nameBytes,30);local.set(data,30+e.nameBytes.length);
  const central=e.central.slice(),cv=new DataView(central.buffer);cv.setUint16(8,e.flags&~8,true);cv.setUint16(10,method,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,size,true);cv.setUint32(42,localSize,true);locals.push(local);centrals.push(central);localSize+=local.length;centralSize+=central.length;
 }
 const out=new Uint8Array(localSize+centralSize+22);let p=0;for(const b of [...locals,...centrals]){out.set(b,p);p+=b.length;}const end=new DataView(out.buffer,p,22);end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,centralSize,true);end.setUint32(16,localSize,true);return out;
}
export async function tagMsczNotes(input,options={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),entries=zipEntries(bytes);let target;
 const container=entries.find(x=>x.name==='META-INF/container.xml');
 if(container){const t=parseXml(decode.decode(await inflateEntry(container,options.inflateRaw)));const refs=[...walk(t)].filter(x=>x.name==='rootfile');target=entries.find(x=>refs.some(r=>r.attrs['full-path']===x.name)&&/\.mscx$/i.test(x.name));}
 target??=entries.find(x=>/\.mscx$/i.test(x.name)&&!/^Excerpts\//i.test(x.name));if(!target)fail('MSCX_MISSING');
 const source=decode.decode(await inflateEntry(target,options.inflateRaw));const tagged=tagNativeMscx(source,options);return {bytes:repack(entries,target.name,utf8.encode(tagged.xml)),notes:tagged.notes,scorePath:target.name};
}
export function readMusicXml(source,colors){
 const tree=parseXml(source),root=tree.children.find(x=>x.name==='score-partwise');if(!root)fail('MUSICXML_FORMAT');
 const byColor=new Map(colors.map(x=>[lower(x.color),x])),parts=[],notes=[],measureLengths=[],layoutSpans=[];
 const partDefs=new Map(kids(kid(root,'part-list')||{children:[]},'score-part').map(p=>[p.attrs.id,p]));let staffCount=0;
 for(const part of kids(root,'part')){
  const def=partDefs.get(part.attrs.id),devices=new Map((def?kids(def,'midi-device'):[]).map(x=>[x.attrs.id,num(x.attrs.port,1)-1]));
  const instruments=new Map((def?kids(def,'midi-instrument'):[]).map(x=>[x.attrs.id,{channel:num(text(x,'midi-channel'),1)-1,port:devices.get(x.attrs.id)??0,unpitched:num(text(x,'midi-unpitched'),NaN)-1}]));
  let divisions=1,transpose=0,defaultLength=4,staves=1;const measures=[];
  for(const [measureIndex,m]of kids(part,'measure').entries()){
   let cursor=0,lastStart=0,maxEnd=0;const localNotes=[];
   for(const item of m.children){
    if(item.name==='attributes'){
     const d=num(text(item,'divisions'),divisions);if(!finite(d)||d<=0)fail('MUSICXML_DIVISIONS');divisions=d;
     staves=Math.max(staves,num(text(item,'staves'),1));
     const time=kid(item,'time');if(time){const beats=text(time,'beats').split('+').reduce((n,x)=>n+Number(x),0),bt=num(text(time,'beat-type'));if(beats>0&&bt>0)defaultLength=beats*4/bt;}
     const tr=kid(item,'transpose');if(tr)transpose=num(text(tr,'chromatic'))+12*num(text(tr,'octave-change'));
     for(const style of kids(item,'measure-style')){const span=num(text(style,'multiple-rest'),1);if(Number.isSafeInteger(span)&&span>1)layoutSpans[measureIndex]=Math.max(layoutSpans[measureIndex]||1,span);}
    }else if(item.name==='backup'||item.name==='forward')cursor+=(item.name==='backup'?-1:1)*num(text(item,'duration'))/divisions;
    else if(item.name==='note'){
     const grace=!!kid(item,'grace'),chord=!!kid(item,'chord'),duration=num(text(item,'duration'))/divisions;if(!finite(duration)||duration<0)fail('MUSICXML_DURATION');
     const start=chord?lastStart:cursor;if(!chord){lastStart=start;if(!grace)cursor+=duration;}maxEnd=Math.max(maxEnd,start+duration,cursor);
     const color=lower(kid(item,'notehead')?.attrs.color||item.attrs.color),identity=byColor.get(color),pitch=kid(item,'pitch'),unpitched=kid(item,'unpitched');
     const instrument=instruments.get(kid(item,'instrument')?.attrs.id)||instruments.values().next().value||{channel:0,port:0,unpitched:NaN};
     const staff=text(item,'staff')||'1';staves=Math.max(staves,num(staff,1));
     let midi=NaN;if(pitch)midi=12*(num(text(pitch,'octave'))+1)+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[text(pitch,'step')]??NaN)+num(text(pitch,'alter'))+transpose;else if(unpitched)midi=instrument.unpitched;
     if(identity){const ties=kids(item,'tie').map(x=>x.attrs.type),notations=kid(item,'notations');const note={...identity,part:part.attrs.id,measure:measureIndex,voice:text(item,'voice')||'1',staff,startQ:start,durationQ:duration,grace:grace||!!identity.graceKind,afterGrace:/after$/i.test(identity.graceKind||''),midi,channel:instrument.channel,port:instrument.port,tieStart:ties.includes('start'),tieStop:ties.includes('stop'),ornament:!!(notations&&kid(notations,'ornaments')),tremolo:notations?kid(kid(notations,'ornaments')||{children:[]},'tremolo')?.attrs.type||null:null};notes.push(note);localNotes.push(note);}
    }
   }
   const length=maxEnd>0?maxEnd:defaultLength;measures.push({index:measureIndex,lengthQ:length,notes:localNotes});measureLengths[measureIndex]=Math.max(measureLengths[measureIndex]||0,length);
  }
  if(!Number.isSafeInteger(staves)||staves<1||staves>256)fail('MUSICXML_STAVES');
  for(const m of measures)for(const n of m.notes)n.track=staffCount+num(n.staff,1)-1;
  parts.push({id:part.attrs.id,measures,staffOffset:staffCount,staves});staffCount+=staves;
 }
 if(!notes.length)fail('MUSICXML_COLOR_JOIN');return {notes,parts,measureLengths,layoutSpans,staffCount,warnings:[]};
}
export function parseMidi(input){
 const b=input instanceof Uint8Array?input:new Uint8Array(input),v=new DataView(b.buffer,b.byteOffset,b.byteLength),str=(p,n)=>String.fromCharCode(...b.subarray(p,p+n));
 if(b.length<14||str(0,4)!=='MThd'||v.getUint16(8)>1)fail('MIDI_FORMAT');const ppq=v.getUint16(12);if(!ppq||(ppq&0x8000))fail('MIDI_SMPTE');
 const trackCount=v.getUint16(10),tracks=[],tempos=[{tick:0,us:500000,order:-1}],notes=[];let p=8+v.getUint32(4),order=0,totalEvents=0,maxTick=0;
 const vl=(d,s)=>{let n=0;for(let i=0;i<4;i++){if(s>=d.length)fail('MIDI_TRUNCATED');const c=d[s++];n=n*128+(c&127);if(c<128)return[n,s];}fail('MIDI_VARLEN');};
 for(let ti=0;ti<trackCount;ti++){
  if(p+8>b.length||str(p,4)!=='MTrk')fail('MIDI_TRACK');const end=p+8+v.getUint32(p+4);if(end>b.length)fail('MIDI_TRACK');const d=b.subarray(p+8,end);p=end;
  let i=0,tick=0,running=0,port=0;const active=new Map(),track={id:ti,name:'',ports:[]};tracks.push(track);
  while(i<d.length){
   if(++totalEvents>1500000)fail('MIDI_LIMIT');let dt;[dt,i]=vl(d,i);tick+=dt;maxTick=Math.max(maxTick,tick);let status=d[i];if(status&128)i++;else status=running;
   if(status===255){const type=d[i++];let n;[n,i]=vl(d,i);if(i+n>d.length)fail('MIDI_TRUNCATED');if(type===81&&n===3)tempos.push({tick,us:(d[i]<<16)|(d[i+1]<<8)|d[i+2],order:order++});if(type===33&&n===1){port=d[i];if(!track.ports.includes(port))track.ports.push(port);}if(type===3)track.name=new TextDecoder().decode(d.subarray(i,i+n));i+=n;}
   else if(status===240||status===247){let n;[n,i]=vl(d,i);if(i+n>d.length)fail('MIDI_TRUNCATED');i+=n;running=0;}
   else {
    if(status<128||status>=240)fail('MIDI_STATUS');running=status;const type=status>>4,channel=status&15,a=d[i++],c=[12,13].includes(type)?0:d[i++];if(a==null||c==null||a>127||c>127)fail('MIDI_TRUNCATED');const key=port+':'+channel+':'+a;
    if(type===9&&c>0){const row={track:ti,port,channel,pitch:a,onTick:tick,offTick:null,velocity:c};notes.push(row);const q=active.get(key)||[];q.push(row);active.set(key,q);}
    else if(type===8||(type===9&&c===0)){const row=active.get(key)?.shift();if(row)row.offTick=tick;}
   }
  }
 }
 tempos.sort((a,b)=>a.tick-b.tick||a.order-b.order);const timing=[];let previousTick=0,ms=0,us=500000;
 for(const t of tempos){if(!t.us)fail('MIDI_TEMPO');ms+=(t.tick-previousTick)*us/ppq/1000;previousTick=t.tick;us=t.us;if(timing.at(-1)?.tick===t.tick)timing.pop();timing.push({tick:t.tick,ms,us});}
 function toMs(tick){let lo=0,hi=timing.length;while(lo<hi){const m=(lo+hi)>>1;if(timing[m].tick<=tick)lo=m+1;else hi=m;}const x=timing[Math.max(0,lo-1)];return x.ms+(tick-x.tick)*x.us/ppq/1000;}
 for(const n of notes){n.startMs=toMs(n.onTick);n.endMs=toMs(n.offTick??n.onTick);}
 return {ppq,tracks,trackCount,tempos:timing,notes,maxTick,toMs,durationMs:toMs(maxTick)};
}
export function buildPlaybackMap(music,positions,midi,{alignmentToleranceMs=12,onsetToleranceTicks=2,strictOnsets=true,expandRepeats=true,maxPlaybackNotes=200000}={}){
 if(!positions?.elements?.length||!music.measureLengths?.length)fail('MEASURE_LAYOUT_MISMATCH');
 const groups=[];for(let m=0;m<music.measureLengths.length;){const span=positions.elements.length===music.measureLengths.length?1:Math.min(music.layoutSpans?.[m]||1,music.measureLengths.length-m);groups.push(Array.from({length:span},(_,i)=>m+i));m+=span;}
 if(groups.length!==positions.elements.length)fail('MEASURE_LAYOUT_MISMATCH');
 const geometry=new Map(positions.elements.map(x=>[Number(x.id),x])),perMeasure=new Map();
 for(const n of music.notes){const list=perMeasure.get(n.measure)||[];list.push(n);perMeasure.set(n.measure,list);}
 const byTrack=new Map(),byPort=new Map();for(const n of midi.notes){for(const [map,key]of [[byTrack,n.track+':'+n.pitch],[byPort,(n.port||0)+':'+n.channel+':'+n.pitch]]){const list=map.get(key)||[];list.push(n);map.set(key,list);}}
 for(const map of [byTrack,byPort])for(const list of map.values())list.sort((a,b)=>a.onTick-b.onTick);
 const useTracks=Number.isSafeInteger(music.staffCount)&&music.staffCount>0&&music.staffCount===midi.trackCount;
 const listFor=note=>useTracks?byTrack.get(note.track+':'+note.midi)||[]:byPort.get((note.port||0)+':'+note.channel+':'+note.midi)||[];
 const lowerBound=(list,tick)=>{let lo=0,hi=list.length;while(lo<hi){const m=(lo+hi)>>1;if(list[m].onTick<tick)lo=m+1;else hi=m;}return lo;};
 const matchMidi=(note,onset)=>{
  const list=listFor(note),at=lowerBound(list,onset-onsetToleranceTicks);
  for(let i=at;i<list.length&&list[i].onTick<=onset+onsetToleranceTicks;i++)if((list[i].offTick??0)>list[i].onTick)return list[i];
  if(note.tieStop){for(let i=at-1;i>=Math.max(0,at-64);i--)if((list[i].offTick??-1)>onset-onsetToleranceTicks)return list[i];}
  return null;
 };
 const measures=[],rows=[],playback=[],anchors=[],warnings=new Set(),claimed=new Set();let tick=0;
 const events=expandRepeats?positions.events:groups.map((_,elid)=>({elid,position:null}));if(!events?.length)fail('MEASURE_EVENT_INVALID');
 for(const event of events){
  const id=Number(event.elid),geo=geometry.get(id),group=groups[id];if(!geo||!group||!Number.isSafeInteger(geo.page)||geo.page<0)fail('MEASURE_EVENT_INVALID');
  if(expandRepeats&&(!finite(event.position)||Math.abs(event.position-midi.toMs(tick))>alignmentToleranceMs))fail('MIDI_MEASURE_ALIGNMENT');
  for(const measure of group){
   const length=music.measureLengths[measure];if(!finite(length)||length<=0)fail('MEASURE_EVENT_INVALID');const pass=measures.length;measures.push({pass,measure,page:geo.page,tick,startMs:midi.toMs(tick),nativeMs:event.position});
   for(const note of perMeasure.get(measure)||[]){
    if(rows.length>=maxPlaybackNotes)fail('PLAYBACK_MAP_LIMIT');if(!finite(note.startQ)||note.startQ<0||!finite(note.durationQ)||note.durationQ<0)fail('MUSICXML_DURATION');
    const onset=tick+note.startQ*midi.ppq,end=onset+note.durationQ*midi.ppq;
    rows.push({note,id:note.id,color:note.color,part:note.part,voice:note.voice,staff:note.staff,measure,pass,page:geo.page,pitch:note.midi,nominalStart:onset,nominalEnd:end,startTick:onset,endTick:end,tieStart:note.tieStart,tieStop:note.tieStop});
   }
   tick+=length*midi.ppq;
  }
 }
 const rowKey=(r,id=r.id)=>r.pass+':'+r.part+':'+r.staff+':'+id,owners=new Map();for(const row of rows)if(!row.note.grace){const key=rowKey(row);if(!owners.has(key))owners.set(key,row);}
 const beforeOwners=new Set(rows.filter(r=>r.note.grace&&!r.note.afterGrace&&r.note.ownerId!=null).map(r=>rowKey(r,r.note.ownerId)));
 const afterOwners=new Set(rows.filter(r=>r.note.grace&&r.note.afterGrace&&r.note.ownerId!=null).map(r=>rowKey(r,r.note.ownerId)));
 // Two-note tremolos alternate over the combined chord span, including the
 // second head before its written onset. Resolve their actual repeated gates.
 const voices=new Map();for(const row of rows)if(!row.note.grace){const key=row.part+':'+row.staff+':'+row.voice,list=voices.get(key)||[];list.push(row);voices.set(key,list);}
 for(const voice of voices.values()){
  const chords=new Map();for(const row of voice){const list=chords.get(row.nominalStart)||[];list.push(row);chords.set(row.nominalStart,list);}
  let pending=null;for(const chord of [...chords.values()].sort((a,b)=>a[0].nominalStart-b[0].nominalStart)){
   if(chord.some(r=>r.note.tremolo==='start'))pending=chord;
   if(pending&&chord.some(r=>r.note.tremolo==='stop')){const start=pending[0].nominalStart,end=Math.max(...chord.map(r=>r.nominalEnd));for(const row of [...pending,...chord])row.tremoloSpan={start,end};pending=null;}
   if(chord.some(r=>r.note.tremolo==='single'))for(const row of chord)row.tremoloSpan={start:row.nominalStart,end:row.nominalEnd};
  }
 }
 const output=row=>{const {note,nominalStart,nominalEnd,...value}=row;return value;};
 let notationCount=0,graceAnchorCount=0,graceEventCount=0;
 for(const row of rows)if(!row.note.grace&&row.note.durationQ>0){
  const note=row.note;
  if(row.tremoloSpan){
   const {start,end}=row.tremoloSpan,list=listFor(note);let found=0;const seen=new Set();
   for(let i=lowerBound(list,start-onsetToleranceTicks);i<list.length&&list[i].onTick<end;i++){
    const gate=list[i],key=gate.onTick+':'+gate.offTick;if((gate.offTick??0)<=gate.onTick||seen.has(key))continue;seen.add(key);claimed.add(gate);
    if(playback.length>=maxPlaybackNotes)fail('PLAYBACK_MAP_LIMIT');
    playback.push(output({...row,startTick:gate.onTick,endTick:Math.min(gate.offTick,end),startMs:gate.startMs,endMs:midi.toMs(Math.min(gate.offTick,end)),midiStartMs:gate.startMs,midiEndMs:gate.endMs,midiTrack:gate.track,midiPort:gate.port,timing:'performed-tremolo'}));found++;
   }
   if(found)continue;
   row.startTick=start;row.endTick=end;
  }
  let matched=matchMidi(note,row.nominalStart);
  if(!matched&&beforeOwners.has(rowKey(row))){const list=listFor(note);for(let i=lowerBound(list,row.nominalStart);i<list.length&&list[i].onTick<row.nominalEnd;i++)if((list[i].offTick??0)>list[i].onTick){matched=list[i];row.startTick=matched.onTick;break;}}
  if(!matched){if(strictOnsets)fail('MIDI_NOTE_ONSET_MISMATCH');notationCount++;row.timing='notation';}else{claimed.add(matched);row.timing=row.startTick===row.nominalStart?'midi':'performed';row.midiStartMs=matched.startMs;row.midiEndMs=matched.endMs;row.midiTrack=matched.track;row.midiPort=matched.port;}
  if(matched&&afterOwners.has(rowKey(row))&&matched.offTick>row.startTick)row.endTick=Math.min(row.endTick,matched.offTick);
  row.startMs=midi.toMs(row.startTick);row.endMs=midi.toMs(row.endTick);if(row.endMs>row.startMs){if(playback.length>=maxPlaybackNotes)fail('PLAYBACK_MAP_LIMIT');playback.push(output(row));}
 }
 const lastGrace=new Map();
 for(const row of rows)if(row.note.grace){
  const note=row.note,owner=note.ownerId==null?null:owners.get(rowKey(row,note.ownerId));
  const beat=owner?(note.afterGrace?owner.nominalEnd:owner.nominalStart):row.nominalStart;
  const right=note.afterGrace?beat:Math.max(beat,owner?.startTick??beat),left=note.afterGrace?(owner?.nominalStart??Math.max(0,beat-midi.ppq)):Math.max(0,beat-midi.ppq);
  const group=rowKey(row,note.ownerId??'grace')+':'+Boolean(note.afterGrace),list=listFor(note);let matched;
  for(let i=lowerBound(list,Math.max(left,lastGrace.get(group)??left));i<list.length&&list[i].onTick<=right+onsetToleranceTicks;i++)if(!claimed.has(list[i])&&(list[i].offTick??0)>list[i].onTick){matched=list[i];break;}
  if(matched){if(playback.length>=maxPlaybackNotes)fail('PLAYBACK_MAP_LIMIT');claimed.add(matched);lastGrace.set(group,matched.onTick);row.startTick=matched.onTick;row.endTick=matched.offTick;row.startMs=matched.startMs;row.endMs=matched.endMs;row.midiStartMs=matched.startMs;row.midiEndMs=matched.endMs;row.midiTrack=matched.track;row.midiPort=matched.port;row.timing='performed-grace';playback.push(output(row));graceEventCount++;}
  else {row.startTick=beat;row.endTick=beat;row.startMs=midi.toMs(beat);row.endMs=row.startMs;row.timing='beat-anchor';anchors.push(output(row));graceAnchorCount++;}
 }
 if(notationCount)warnings.add('NOTATED_TIMING');if(graceAnchorCount)warnings.add('GRACE_BEAT_ANCHOR');
 playback.sort((a,b)=>a.startMs-b.startMs||a.id-b.id);anchors.sort((a,b)=>a.startMs-b.startMs||a.id-b.id);
 return {notes:playback,anchors,measures,durationMs:midi.toMs(tick),midiDurationMs:midi.durationMs,warnings:[...warnings],diagnostics:{notationCount,graceAnchorCount,graceEventCount},playbackOrder:expandRepeats?'expanded':'single-pass'};
}
function multiply(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function matrix(value=''){
 let out=[1,0,0,1,0,0],cursor=0;const re=/(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g;let m;
 while((m=re.exec(value))){if(value.slice(cursor,m.index).trim())fail('SVG_TRANSFORM');const a=m[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);if(a.some(x=>!finite(x)))fail('SVG_TRANSFORM');let next;
  if(a.some(x=>Math.abs(x)>1e6))fail('SVG_TRANSFORM');
  if(m[1]==='matrix'&&a.length===6)next=a;else if(m[1]==='translate'&&[1,2].includes(a.length))next=[1,0,0,1,a[0],a[1]||0];else if(m[1]==='scale'&&[1,2].includes(a.length))next=[a[0],0,0,a[1]??a[0],0,0];else if(m[1]==='rotate'&&[1,3].includes(a.length)){const t=a[0]*Math.PI/180,c=Math.cos(t),s=Math.sin(t);next=[c,s,-s,c,0,0];if(a.length===3)next=multiply(multiply([1,0,0,1,a[1],a[2]],next),[1,0,0,1,-a[1],-a[2]]);}else fail('SVG_TRANSFORM');out=multiply(out,next);cursor=re.lastIndex;
 }
 if(value.slice(cursor).trim())fail('SVG_TRANSFORM');return out;
}
export function pathBounds(d,transform=[1,0,0,1,0,0]){
 if(typeof d!=='string'||d.length>200000||/[^MLHVCSQTAZmlhvcsqtaz0-9eE+.,\s-]/.test(d))fail('SVG_PATH');
 const tokens=d.match(/[a-df-zA-DF-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];let i=0,command='',x=0,y=0,sx=0,sy=0,lastC=null,lastQ=null;const points=[];
 const point=(x,y)=>[transform[0]*x+transform[2]*y+transform[4],transform[1]*x+transform[3]*y+transform[5]],add=(x,y)=>points.push(point(x,y));
 const cubic=(p0,p1,p2,p3)=>{
  const a=point(...p0),b=point(...p1),c=point(...p2),e=point(...p3);points.push(a,e);const ts=new Set();
  for(let dim=0;dim<2;dim++){const A=-a[dim]+3*b[dim]-3*c[dim]+e[dim],B=2*(a[dim]-2*b[dim]+c[dim]),C=b[dim]-a[dim];if(Math.abs(A)<1e-12){if(Math.abs(B)>1e-12)ts.add(-C/B);}else{const disc=B*B-4*A*C;if(disc>=0){ts.add((-B+Math.sqrt(disc))/(2*A));ts.add((-B-Math.sqrt(disc))/(2*A));}}}
  for(const t of ts)if(t>0&&t<1){const u=1-t;points.push([0,1].map(k=>u*u*u*a[k]+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*e[k]));}
 };
 const read=n=>{const a=[];for(let j=0;j<n;j++){const v=Number(tokens[i++]);if(!finite(v)||Math.abs(v)>1e8)fail('SVG_COORDINATE');a.push(v);}return a;};
 while(i<tokens.length){if(/^[A-Za-z]$/.test(tokens[i]))command=tokens[i++];if(!command)fail('SVG_COMMAND');const upper=command.toUpperCase(),rel=command!==upper,ox=x,oy=y;
  if(upper==='Z'){add(x,y);x=sx;y=sy;add(x,y);command='';lastC=lastQ=null;continue;}
  const counts={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2};if(!(upper in counts))fail('SVG_ARC_OR_UNKNOWN');let a=read(counts[upper]);
  if(['M','L','C','S','Q','T'].includes(upper)&&rel)for(let k=0;k<a.length;k+=2){a[k]+=ox;a[k+1]+=oy;}
  if(upper==='M'||upper==='L'){[x,y]=a;add(x,y);if(upper==='M'){sx=x;sy=y;command=rel?'l':'L';}lastC=lastQ=null;}
  else if(upper==='H'){x=a[0]+(rel?ox:0);add(ox,oy);add(x,y);lastC=lastQ=null;}
  else if(upper==='V'){y=a[0]+(rel?oy:0);add(ox,oy);add(x,y);lastC=lastQ=null;}
  else if(upper==='C'){cubic([ox,oy],a.slice(0,2),a.slice(2,4),a.slice(4,6));[x,y]=a.slice(4);lastC=a.slice(2,4);lastQ=null;}
  else if(upper==='S'){const c=lastC?[2*ox-lastC[0],2*oy-lastC[1]]:[ox,oy];cubic([ox,oy],c,a.slice(0,2),a.slice(2,4));[x,y]=a.slice(2);lastC=a.slice(0,2);lastQ=null;}
  else {const q=upper==='Q'?a.slice(0,2):lastQ?[2*ox-lastQ[0],2*oy-lastQ[1]]:[ox,oy],end=upper==='Q'?a.slice(2):a;cubic([ox,oy],[ox+2*(q[0]-ox)/3,oy+2*(q[1]-oy)/3],[end[0]+2*(q[0]-end[0])/3,end[1]+2*(q[1]-end[1])/3],end);[x,y]=end;lastQ=q;lastC=null;}
 }
 if(!points.length)fail('SVG_EMPTY_PATH');let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const [px,py]of points){if(!finite(px)||!finite(py)||Math.abs(px)>1e9||Math.abs(py)>1e9)fail('SVG_COORDINATE');minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px);maxY=Math.max(maxY,py);}
 return{x:minX,y:minY,width:maxX-minX,height:maxY-minY};
}
export function noteGeometryFromSvg(source,colors,page=0){
 const tree=parseXml(source),root=tree.children.find(x=>x.name==='svg');if(!root)fail('SVG_ROOT');const viewBox=(root.attrs.viewBox||'').trim().split(/[\s,]+/).map(Number);if(viewBox.length!==4||viewBox.some(x=>!finite(x))||viewBox[2]<=0||viewBox[3]<=0)fail('SVG_VIEWBOX');
 const identities=new Map(colors.map(x=>[lower(x.color),x])),found=new Map(),warnings=[];
 const visit=(node,parentTransform,parentFill)=>{
  const transform=multiply(parentTransform,matrix(node.attrs.transform)),fill=node.attrs.fill||parentFill;
  if(node.name==='path'&&String(node.attrs.class||'').split(/\s+/).includes('Note')){
   const identity=identities.get(lower(fill));if(identity){try{const bounds=pathBounds(node.attrs.d,transform),row=found.get(identity.id)||{id:identity.id,color:identity.color,page,paths:[],bounds:null};row.paths.push({d:node.attrs.d,matrix:transform});const b=row.bounds;if(!b)row.bounds=bounds;else{const right=Math.max(b.x+b.width,bounds.x+bounds.width),bottom=Math.max(b.y+b.height,bounds.y+bounds.height);b.x=Math.min(b.x,bounds.x);b.y=Math.min(b.y,bounds.y);b.width=right-b.x;b.height=bottom-b.y;}found.set(identity.id,row);}catch(e){warnings.push({id:identity.id,reason:e.message});}}
  }
  for(const c of node.children)visit(c,transform,fill);
 };
 visit(root,[1,0,0,1,0,0],root.attrs.fill||'#000000');return {page,viewBox,notes:[...found.values()].sort((a,b)=>a.id-b.id),warnings};
}
