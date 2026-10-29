// SPDX-License-Identifier: GPL-3.0-only
import {validateScoreArchive} from './model.mjs';
import {tagMsczNotes,readMusicXml,parseMidi,buildPlaybackMap,noteGeometryFromSvg} from './note-map.mjs?v=1.37';
const vendor=new URL('./vendor/webmscore-4.6.5-build.1/',import.meta.url);
async function browserMappingLibrary(){
 if(typeof globalThis.window==='undefined')globalThis.window={addEventListener(){},location:globalThis.location,encodeURIComponent:globalThis.encodeURIComponent};
 return (await import(new URL('inline.mjs',vendor))).default;
}
// This engine MUST run in its own Worker: native document globals do not safely
// support loading the tagged score alongside the audio score in one WASM core.
export function createMappingEngine({loadLibrary=browserMappingLibrary,inflateRaw}={}){
 let score,identities,pageCount=0;
 return {
  async load(buffer){
   const bytes=new Uint8Array(buffer);validateScoreArchive(bytes);
   const tagged=await tagMsczNotes(bytes,{inflateRaw});identities=tagged.notes;
   const Library=await loadLibrary();await Library.ready;if(Library.setLogLevel)await Library.setLogLevel(0);
   score=await Library.load('mscz',tagged.bytes,[],true);pageCount=Number(await score.npages());
   const xml=await score.saveXml(),positions=await score.measurePositions(),midi=parseMidi(await score.saveMidi(true));
   const map=buildPlaybackMap(readMusicXml(xml,identities),positions,midi);
   if(!map.notes.length||map.warnings?.length)throw Error('NOTE_MAP_UNAVAILABLE');
   return {pages:pageCount,notes:map.notes,durationMs:map.durationMs};
  },
  async page(index){if(!score||!Number.isSafeInteger(index)||index<0||index>=pageCount)throw Error('NOTE_MAP_UNAVAILABLE');const geometry=noteGeometryFromSvg(await score.saveSvg(index,true),identities,index);if(geometry.warnings.length)throw Error('NOTE_MAP_UNAVAILABLE');return geometry;}
 };
}
