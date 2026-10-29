// SPDX-License-Identifier: GPL-3.0-only
export const MAX_SCORE_BYTES = 10 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 96 * 1024 * 1024;
export class ScorePreviewError extends Error {
  constructor(code) { super(code); this.name = 'ScorePreviewError'; this.code = code; }
}
export function isMuseScoreFile(name) { return typeof name === 'string' && /\.mscz$/i.test(name.trim()); }
export function scoreTime(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return n >= 3600 ? `${Math.floor(n / 3600)}:${String(Math.floor(n / 60) % 60).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
// Inspect the central directory before giving an untrusted archive to the renderer.
// No files are extracted here. Reject oversized, encrypted, multipart and unsafe archives.
export function validateScoreArchive(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length > MAX_SCORE_BYTES) throw new ScorePreviewError('SCORE_TOO_LARGE');
  const bad = () => { throw new ScorePreviewError('INVALID_SCORE'); };
  if (bytes.length < 22) bad();
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (v.getUint32(0, true) !== 0x04034b50) bad();
  let end = -1;
  for (let p = bytes.length - 22; p >= Math.max(0, bytes.length - 65557); p--) {
    if (v.getUint32(p, true) === 0x06054b50 && p + 22 + v.getUint16(p + 20, true) === bytes.length) { end = p; break; }
  }
  if (end < 0 || v.getUint16(end + 4, true) || v.getUint16(end + 6, true)) bad();
  const count = v.getUint16(end + 10, true), size = v.getUint32(end + 12, true), start = v.getUint32(end + 16, true);
  if (!count || count > 2048 || count !== v.getUint16(end + 8, true) || start + size > end) bad();
  let p = start, expanded = 0, score = false;
  const names = new Set(), decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (p + 46 > start + size || v.getUint32(p, true) !== 0x02014b50) bad();
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true);
    const packed = v.getUint32(p + 20, true), unpacked = v.getUint32(p + 24, true);
    const n = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    if (!n || p + 46 + n + extra + comment > start + size || flags & 1 || ![0, 8].includes(method) || v.getUint16(p + 34, true)) bad();
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + n)).replaceAll('\\', '/');
    if (name.includes('\0') || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..') || names.has(name)) bad();
    names.add(name);
    expanded += unpacked;
    if (expanded > MAX_EXPANDED_BYTES) throw new ScorePreviewError('SCORE_TOO_COMPLEX');
    if (local + 30 > start || v.getUint32(local, true) !== 0x04034b50 || v.getUint16(local + 8, true) !== method || v.getUint16(local + 6, true) !== flags) bad();
    const localNameLength = v.getUint16(local + 26, true), localExtra = v.getUint16(local + 28, true);
    if (localNameLength !== n || local + 30 + localNameLength + localExtra + packed > start) bad();
    const localName = decoder.decode(bytes.subarray(local + 30, local + 30 + n)).replaceAll('\\', '/');
    if (localName !== name) bad();
    if (/\.mscx$/i.test(name) && unpacked > 0) score = true;
    p += 46 + n + extra + comment;
  }
  if (p !== start + size || !score) bad();
  return { entries: count, expandedBytes: expanded };
}
export function validateScoreSvg(svg) {
  if (typeof svg !== 'string' || svg.length < 500 || svg.length > 8 * 1024 * 1024 || !/<svg[\s>]/i.test(svg) || !/<(?:path|text|use)[\s>]/i.test(svg)) throw new ScorePreviewError('UNSUPPORTED_SCORE');
  return svg;
}
export async function readScoreResponse(response, signal) {
  if (!response?.ok) throw new ScorePreviewError('FILE_UNAVAILABLE');
  const declared = Number(response.headers?.get('content-length'));
  if (declared > MAX_SCORE_BYTES) throw new ScorePreviewError('SCORE_TOO_LARGE');
  const reader = response.body?.getReader();
  if (!reader) throw new ScorePreviewError('FILE_UNAVAILABLE');
  const chunks = []; let length = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read(); if (done) break;
      length += value.length;
      if (length > MAX_SCORE_BYTES) throw new ScorePreviewError('SCORE_TOO_LARGE');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  validateScoreArchive(bytes);
  return bytes;
}
