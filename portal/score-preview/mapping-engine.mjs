// SPDX-License-Identifier: GPL-3.0-only
import {validateScoreArchive} from './model.mjs';
import {tagMsczNotes,readMusicXml,parseMidi,buildPlaybackMap,noteGeometryFromSvg} from './note-map.mjs?v=1.39';
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
   // The pinned saveAudio exporter renders a single pass, even though native
   // metadata and measurePositions include repeats. Use the same pass/order
   // and its MIDI tempo map; never stretch a timeline to the MP3's audio tail.
   const xml=await score.saveXml(),positions=await score.measurePositions(),midi=parseMidi(await score.saveMidi(false));
   const map=buildPlaybackMap(readMusicXml(xml,identities),positions,midi,{expandRepeats:false,strictOnsets:false});
   if(!map.notes.length&&!map.anchors.length)throw Error('NOTE_MAP_UNAVAILABLE');
   return {pages:pageCount,notes:map.notes,anchors:map.anchors,durationMs:map.durationMs,warnings:map.warnings,diagnostics:map.diagnostics,playbackOrder:map.playbackOrder};
  },
  async page(index){if(!score||!Number.isSafeInteger(index)||index<0||index>=pageCount)throw Error('NOTE_MAP_UNAVAILABLE');return noteGeometryFromSvg(await score.saveSvg(index,true),identities,index);}
 };
}
