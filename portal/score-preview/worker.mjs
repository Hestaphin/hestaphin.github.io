// SPDX-License-Identifier: GPL-3.0-only
import { createScoreEngine } from './engine.mjs';
const engine = createScoreEngine();
let ready = false, queue = Promise.resolve();
const knownErrors = new Set(['SCORE_TOO_LARGE', 'SCORE_TOO_COMPLEX', 'INVALID_SCORE', 'UNSUPPORTED_SCORE', 'INVALID_PAGE', 'AUDIO_UNAVAILABLE']);
self.onmessage = ({ data }) => {
  if (!data || !Number.isSafeInteger(data.id)) return;
  queue = queue.then(async () => {
    let value;
    try {
      if (data.method === 'load' && !ready) { value = await engine.load(data.buffer); ready = true; }
      else if (data.method === 'page' && ready) value = await engine.page(data.index);
      else if (data.method === 'audio' && ready) value = await engine.audio();
      else throw Error('INVALID_SCORE');
      const transfer = value instanceof Uint8Array ? [value.buffer] : [];
      self.postMessage({ id: data.id, value }, transfer);
    } catch (error) {
      self.postMessage({ id: data.id, error: knownErrors.has(error.code) ? error.code : data.method === 'audio' ? 'AUDIO_UNAVAILABLE' : 'UNSUPPORTED_SCORE' });
    }
  });
};
