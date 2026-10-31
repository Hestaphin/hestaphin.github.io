// SPDX-License-Identifier: GPL-3.0-only
import { MAX_AUDIO_BYTES, ScorePreviewError, validateScoreArchive, validateScoreSvg } from './model.mjs';
import {readMusicXml,parseMidi,buildPlaybackMap,noteGeometryFromSvg} from './note-map.mjs?v=1.49';
import {buildRepeatPlan} from './repeat-playback.mjs?v=1.49';
const vendor = new URL('./vendor/webmscore-4.6.5-build.1/', import.meta.url);
async function browserLibrary() {
  // The Qt core expects this small compatibility object in a dedicated Worker.
  if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener() {}, location: globalThis.location, encodeURIComponent: globalThis.encodeURIComponent };
  return (await import(new URL('inline.mjs', vendor))).default;
}
export function createScoreEngine({ loadLibrary = browserLibrary, fetcher = fetch } = {}) {
  let score, fontReady, pageCount = 0,positions,staffOrder=[];
  return {
    async load(buffer) {
      const bytes = new Uint8Array(buffer); validateScoreArchive(bytes);
      const Library = await loadLibrary(); await Library.ready;
      if (Library.setLogLevel) await Library.setLogLevel(0);
      // The native score initializes its synthesizer while loading. Install its
      // instruments first; adding them afterwards can produce a silent export.
      if (!fontReady) fontReady = (async () => {
        const response = await fetcher(new URL('FluidR3Mono_GM.sf3', vendor));
        if (!response.ok) throw new ScorePreviewError('AUDIO_UNAVAILABLE');
        const font = new Uint8Array(await response.arrayBuffer());
        if (!font.length || font.length > 24 * 1024 * 1024) throw new ScorePreviewError('AUDIO_UNAVAILABLE');
        await Library.setSoundFont(font);
      })().catch(error => { fontReady = null; throw error; });
      await fontReady;
      score = await Library.load('mscz', bytes, [], true);
      const metadata = await score.metadata(); pageCount = Number(await score.npages());
      const supported = Number(await Library.version());
      if (Number(metadata.fileVersion) > supported) throw new ScorePreviewError('UNSUPPORTED_SCORE');
      if (!Number.isSafeInteger(pageCount) || pageCount < 1 || pageCount > 5000) throw new ScorePreviewError('UNSUPPORTED_SCORE');
      // Validate actual engraving too: some old cores silently return blank SVG.
      const svg = validateScoreSvg(await score.saveSvg(0, true));
      let tracking;
      try {
        const music=readMusicXml(await score.saveXml(),[],{allowNoNotes:true});positions=await score.measurePositions();
        const map=buildPlaybackMap(music,positions,parseMidi(await score.saveMidi(false)),{expandRepeats:false,strictOnsets:false});
        staffOrder=music.parts.flatMap(p=>Array.from({length:p.staves},(_,i)=>({key:p.id+':'+(i+1)})));
        tracking={measures:map.measures,durationMs:map.durationMs,repeatPlan:buildRepeatPlan(map.measures,positions.events),geometry:noteGeometryFromSvg(svg,[],0,positions.elements,staffOrder)};
      } catch { positions=null; /* Note mapping can still supply tracking. */ }
      return { pages: pageCount, duration: Math.max(0, Number(metadata.duration) || 0), title: String(metadata.title || '').slice(0, 300), composer: String(metadata.composer || '').slice(0, 200), svg,tracking };
    },
    async page(index) {
      if (!score || !Number.isSafeInteger(index) || index < 0 || index >= pageCount) throw new ScorePreviewError('INVALID_PAGE');
      const svg=validateScoreSvg(await score.saveSvg(index,true));
      return {svg,tracking:positions?noteGeometryFromSvg(svg,[],index,positions.elements,staffOrder):null};
    },
    async audio() {
      if (!score) throw new ScorePreviewError('INVALID_SCORE');
      await fontReady;
      const bytes = await score.saveAudio('mp3');
      if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.byteLength > MAX_AUDIO_BYTES) throw new ScorePreviewError('AUDIO_UNAVAILABLE');
      return bytes;
    }
  };
}
