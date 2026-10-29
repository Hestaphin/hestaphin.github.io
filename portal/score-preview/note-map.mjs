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
function replacements(source,items){for(const x of items.sort((a,b)=>b.start-a.start||b.end-a.end))source=source.slice(0,x.start)+x.text+source.slice(x.end);return source;}
export function tagNativeMscx(source,{maxNotes=100000}={}){
 const tree=parseXml(source),edits=[],notes=[];
 for(const chord of walk(tree))if(chord.name==='Chord')for(const note of kids(chord,'Note')){
  if(notes.length>=maxNotes)fail('NOTE_LIMIT');const code=0x120001+notes.length;if(code>=0xffffff)fail('COLOR_LIMIT');
  const color='#'+code.toString(16).padStart(6,'0');
  notes.push({id:notes.length,color,eid:text(note,'eid')||null,pitch:num(text(note,'pitch'),NaN)});
  for(const c of kids(note,'color'))edits.push({start:c.start,end:c.end,text:''});
  edits.push({start:note.closeStart,end:note.closeStart,text:`<color r="${code>>16&255}" g="${code>>8&255}" b="${code&255}" a="255"/>`});
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
 const byColor=new Map(colors.map(x=>[lower(x.color),x]));const parts=[],notes=[],warnings=[];let measureLengths=[];
 const partDefs=new Map(kids(kid(root,'part-list')||{children:[]},'score-part').map(p=>[p.attrs.id,p]));
 for(const part of kids(root,'part')){
  const def=partDefs.get(part.attrs.id),instruments=new Map((def?kids(def,'midi-instrument'):[]).map(x=>[x.attrs.id,{channel:num(text(x,'midi-channel'),1)-1,unpitched:num(text(x,'midi-unpitched'),NaN)-1}]));
  let divisions=1,transpose=0,defaultLength=4;const measures=[];
  for(const [measureIndex,m]of kids(part,'measure').entries()){
   let cursor=0,lastStart=0,maxEnd=0;const localNotes=[];
   for(const item of m.children){
    if(item.name==='attributes'){
     const d=num(text(item,'divisions'),divisions);if(!finite(d)||d<=0)fail('MUSICXML_DIVISIONS');divisions=d;
     const time=kid(item,'time');if(time){const beats=text(time,'beats').split('+').reduce((n,x)=>n+Number(x),0),bt=num(text(time,'beat-type'));if(beats>0&&bt>0)defaultLength=beats*4/bt;}
     const tr=kid(item,'transpose');if(tr)transpose=num(text(tr,'chromatic'))+12*num(text(tr,'octave-change'));
    }else if(item.name==='backup'||item.name==='forward')cursor+=(item.name==='backup'?-1:1)*num(text(item,'duration'))/divisions;
    else if(item.name==='note'){
     const grace=!!kid(item,'grace'),chord=!!kid(item,'chord'),duration=num(text(item,'duration'))/divisions;if(!finite(duration)||duration<0)fail('MUSICXML_DURATION');
     const start=chord?lastStart:cursor;if(!chord){lastStart=start;if(!grace)cursor+=duration;}maxEnd=Math.max(maxEnd,start+duration,cursor);
     const color=lower(kid(item,'notehead')?.attrs.color||item.attrs.color),identity=byColor.get(color),pitch=kid(item,'pitch'),unpitched=kid(item,'unpitched');
     const instrument=instruments.get(kid(item,'instrument')?.attrs.id)||instruments.values().next().value||{channel:0,unpitched:NaN};
     let midi=NaN;if(pitch)midi=12*(num(text(pitch,'octave'))+1)+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[text(pitch,'step')]??NaN)+num(text(pitch,'alter'))+transpose;else if(unpitched)midi=instrument.unpitched;
     if(identity){const ties=kids(item,'tie').map(x=>x.attrs.type);const note={...identity,part:part.attrs.id,measure:measureIndex,voice:text(item,'voice')||'1',staff:text(item,'staff')||'1',startQ:start,durationQ:duration,grace,midi,channel:instrument.channel,tieStart:ties.includes('start'),tieStop:ties.includes('stop')};notes.push(note);localNotes.push(note);if(grace)warnings.push('GRACE_NOTE_TIMING');}
    }
   }
   const length=maxEnd>0?maxEnd:defaultLength;measures.push({index:measureIndex,lengthQ:length,notes:localNotes});measureLengths[measureIndex]=Math.max(measureLengths[measureIndex]||0,length);
  }
  parts.push({id:part.attrs.id,measures});
 }
 if(!notes.length)fail('MUSICXML_COLOR_JOIN');return {notes,parts,measureLengths,warnings:[...new Set(warnings)]};
}
export function parseMidi(input){
 const b=input instanceof Uint8Array?input:new Uint8Array(input),v=new DataView(b.buffer,b.byteOffset,b.byteLength);const str=(p,n)=>String.fromCharCode(...b.subarray(p,p+n));
 if(b.length<14||str(0,4)!=='MThd'||v.getUint16(8)>1)fail('MIDI_FORMAT');const ppq=v.getUint16(12);if(!ppq||(ppq&0x8000))fail('MIDI_SMPTE');const tracks=v.getUint16(10),tempos=[{tick:0,us:500000,order:-1}],notes=[];let p=8+v.getUint32(4),order=0,totalEvents=0,maxTick=0;
 const vl=(d,s)=>{let n=0;for(let i=0;i<4;i++){if(s>=d.length)fail('MIDI_TRUNCATED');const c=d[s++];n=n*128+(c&127);if(c<128)return[n,s];}fail('MIDI_VARLEN');};
 for(let ti=0;ti<tracks;ti++){
  if(p+8>b.length||str(p,4)!=='MTrk')fail('MIDI_TRACK');const end=p+8+v.getUint32(p+4);if(end>b.length)fail('MIDI_TRACK');const d=b.subarray(p+8,end);p=end;let i=0,tick=0,running=0;const active=new Map();
  while(i<d.length){if(++totalEvents>1500000)fail('MIDI_LIMIT');let dt;[dt,i]=vl(d,i);tick+=dt;maxTick=Math.max(maxTick,tick);let status=d[i];if(status&128)i++;else status=running;
   if(status===255){const type=d[i++];let n;[n,i]=vl(d,i);if(type===81&&n===3)tempos.push({tick,us:(d[i]<<16)|(d[i+1]<<8)|d[i+2],order:order++});i+=n;}
   else if(status===240||status===247){let n;[n,i]=vl(d,i);i+=n;running=0;}
   else {if(status<128||status>=240)fail('MIDI_STATUS');running=status;const type=status>>4,channel=status&15,a=d[i++],c=[12,13].includes(type)?0:d[i++];if(a==null||c==null)fail('MIDI_TRUNCATED');const key=channel+':'+a;
    if(type===9&&c>0){const row={channel,pitch:a,onTick:tick,offTick:null,velocity:c};notes.push(row);const q=active.get(key)||[];q.push(row);active.set(key,q);}
    else if(type===8||(type===9&&c===0)){const row=active.get(key)?.shift();if(row)row.offTick=tick;}
   }
  }
 }
 tempos.sort((a,b)=>a.tick-b.tick||a.order-b.order);const timing=[];let previousTick=0,ms=0,us=500000;
 for(const t of tempos){if(!t.us)fail('MIDI_TEMPO');ms+=(t.tick-previousTick)*us/ppq/1000;previousTick=t.tick;us=t.us;if(timing.at(-1)?.tick===t.tick)timing.pop();timing.push({tick:t.tick,ms,us});}
 function toMs(tick){let lo=0,hi=timing.length;while(lo<hi){const m=(lo+hi)>>1;if(timing[m].tick<=tick)lo=m+1;else hi=m;}const x=timing[Math.max(0,lo-1)];return x.ms+(tick-x.tick)*x.us/ppq/1000;}
 for(const n of notes){n.startMs=toMs(n.onTick);n.endMs=toMs(n.offTick??n.onTick);}
 return {ppq,tempos:timing,notes,maxTick,toMs,durationMs:toMs(maxTick)};
}
export function buildPlaybackMap(music,positions,midi,{alignmentToleranceMs=12,onsetToleranceTicks=2,strictOnsets=true,maxPlaybackNotes=200000}={}){
 if(!positions?.elements?.length||positions.elements.length!==music.measureLengths.length||!positions.events?.length)fail('MEASURE_LAYOUT_MISMATCH');
 const geometryByMeasure=new Map(positions.elements.map(x=>[x.id,x])),perMeasure=new Map();for(const n of music.notes){const list=perMeasure.get(n.measure)||[];list.push(n);perMeasure.set(n.measure,list);}
 const playback=[],measures=[],warnings=[...music.warnings],byPitch=new Map();let tick=0;
 for(const n of midi.notes){const key=n.channel+':'+n.pitch,list=byPitch.get(key)||[];list.push(n);byPitch.set(key,list);}
 for(const list of byPitch.values())list.sort((a,b)=>a.onTick-b.onTick);
 const matchMidi=(note,onset)=>{
  const list=byPitch.get(note.channel+':'+note.midi)||[];let lo=0,hi=list.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(list[mid].onTick<=onset+onsetToleranceTicks)lo=mid+1;else hi=mid;}
  if(note.tieStop){for(let i=lo-1;i>=Math.max(0,lo-64);i--){const n=list[i];if(n.onTick<=onset+onsetToleranceTicks&&(n.offTick??-1)>onset-onsetToleranceTicks)return n;}return null;}
  const n=list[lo-1];return n&&Math.abs(n.onTick-onset)<=onsetToleranceTicks?n:null;
 };
 for(const [pass,event]of positions.events.entries()){
  const measure=Number(event.elid),length=music.measureLengths[measure],geo=geometryByMeasure.get(measure);if(!geo||!finite(length)||!finite(event.position)||length<=0)fail('MEASURE_EVENT_INVALID');
  const nativeMs=event.position,midiMs=midi.toMs(tick);if(Math.abs(nativeMs-midiMs)>alignmentToleranceMs)fail('MIDI_MEASURE_ALIGNMENT');
  measures.push({pass,measure,page:geo.page,tick,startMs:midiMs,nativeMs});
  for(const note of perMeasure.get(measure)||[]){
   if(note.grace||note.durationQ<=0)continue;
   const onset=tick+note.startQ*midi.ppq,end=onset+note.durationQ*midi.ppq,matched=matchMidi(note,onset);
   if(!matched){if(strictOnsets)fail('MIDI_NOTE_ONSET_MISMATCH');warnings.push('MIDI_NOTE_ONSET_MISMATCH');continue;}
   if(playback.length>=maxPlaybackNotes)fail('PLAYBACK_MAP_LIMIT');
   playback.push({id:note.id,color:note.color,part:note.part,voice:note.voice,staff:note.staff,measure,pass,page:geo.page,pitch:note.midi,startTick:onset,endTick:end,startMs:midi.toMs(onset),endMs:midi.toMs(end),midiStartMs:matched.startMs,midiEndMs:matched.endMs,tieStart:note.tieStart,tieStop:note.tieStop});
  }
  tick+=length*midi.ppq;
 }
 playback.sort((a,b)=>a.startMs-b.startMs||a.id-b.id);
 return {notes:playback,measures,durationMs:midi.toMs(tick),midiDurationMs:midi.durationMs,warnings:[...new Set(warnings)]};
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
