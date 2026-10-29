// SPDX-License-Identifier: GPL-3.0-only
import { readScoreResponse, ScorePreviewError, scoreTime } from './model.mjs';
let activePreview;
const words = {
  en: { title: 'Score preview', close: 'Close score preview', loading: 'Loading score…', preparing: 'Preparing playback…', ready: 'Score ready', audioReady: 'Audio ready. Press Play in the player.', play: 'Play score', previous: 'Previous page', next: 'Next page', page: 'Page', zoom: 'Zoom', fit: 'Fit width', speed: 'Playback speed', download: 'Download original', notice: 'Player source & licences', note: 'Standard instrument sounds. Audio is prepared when you press Play.', failed: 'This score could not be previewed. You can still download the original attachment.', unavailable: 'The attachment is unavailable. Close this window and refresh the task or notification.', large: 'The score exceeds the 10 MB attachment limit.', complex: 'This compressed score is too large to preview safely.', unsupported: 'This score is damaged, empty, or uses a newer unsupported MuseScore format.', audioFailed: 'Playback could not be prepared. The score preview is still available.', timeout: 'Preparing this score took too long. Close the window and try again.', controls: 'Score pages and playback' },
  cn: { title: '乐谱预览', close: '关闭乐谱预览', loading: '正在载入乐谱…', preparing: '正在准备播放…', ready: '乐谱已就绪', audioReady: '音频已就绪，请点击播放器中的播放按钮。', play: '播放乐谱', previous: '上一页', next: '下一页', page: '页', zoom: '缩放', fit: '适应宽度', speed: '播放速度', download: '下载原文件', notice: '播放器源码与许可', note: '使用标准乐器音色。点击播放后准备音频。', failed: '无法预览此乐谱，仍可下载原附件。', unavailable: '无法读取附件，请关闭窗口并刷新任务或讨论。', large: '乐谱超过 10 MB 的附件大小限制。', complex: '压缩乐谱解压后过大，无法安全预览。', unsupported: '乐谱可能已损坏、没有内容，或使用了暂不支持的较新 MuseScore 格式。', audioFailed: '无法准备播放，仍可查看乐谱。', timeout: '准备乐谱用时过长，请关闭窗口后重试。', controls: '乐谱页面与播放' }
};
export function createScoreWorkerClient(worker, { timeout = 120000 } = {}) {
  let serial = 0, closed = false; const pending = new Map();
  function failAll(code) {
    for (const value of pending.values()) { clearTimeout(value.timer); value.reject(new ScorePreviewError(code)); }
    pending.clear();
  }
  worker.onmessage = ({ data }) => {
    const entry = pending.get(data?.id); if (!entry || closed) return;
    pending.delete(data.id); clearTimeout(entry.timer);
    data.error ? entry.reject(new ScorePreviewError(data.error)) : entry.resolve(data.value);
  };
  worker.onerror = event => { event.preventDefault?.(); failAll('WORKER_FAILED'); };
  worker.onmessageerror = () => failAll('WORKER_FAILED');
  return {
    request(method, params = {}, transfer = []) {
      if (closed) return Promise.reject(new ScorePreviewError('CLOSED'));
      return new Promise((resolve, reject) => {
        const id = ++serial;
        const timer = setTimeout(() => { closed = true; worker.terminate(); failAll('TIMEOUT'); }, timeout);
        pending.set(id, { resolve, reject, timer });
        try { worker.postMessage({ id, method, ...params }, transfer); }
        catch { pending.delete(id); clearTimeout(timer); reject(new ScorePreviewError('WORKER_FAILED')); }
      });
    },
    close() { if (!closed) { closed = true; worker.terminate(); } failAll('CLOSED'); }
  };
}
export function openScorePreview({ name, fetchScore, opener, document: doc = document, makeWorker = () => new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }) }) {
  activePreview?.close();
  const dialog = doc.createElement('dialog'); dialog.className = 'score-preview-dialog'; dialog.dataset.userContent = '';
  dialog.innerHTML = '<header class="score-preview-header"><div><p class="score-preview-eyebrow"></p><h2 id="score-preview-name"></h2><p class="score-preview-composer" hidden></p></div><button type="button" class="score-preview-close">×</button></header><section class="score-preview-controls"><button type="button" class="score-play" disabled></button><audio controls preload="metadata" hidden></audio><label class="score-speed-label" hidden><span></span><select class="score-speed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label><div class="score-page-tools"><button type="button" class="score-previous" disabled>‹</button><span class="score-page-count"></span><button type="button" class="score-next" disabled>›</button><label class="score-zoom-label"><span></span><select class="score-zoom"><option value="fit"></option><option value="100">100%</option><option value="125">125%</option><option value="150">150%</option><option value="200">200%</option></select></label></div></section><p class="score-preview-status" role="status" aria-live="polite"></p><p class="score-preview-error" role="alert" hidden></p><div class="score-preview-stage" aria-busy="true" tabindex="0"><div class="score-paper" hidden><img class="score-page-image" alt=""></div></div><footer class="score-preview-footer"><span class="score-preview-note"></span><a class="score-download" hidden></a><a class="score-source" target="_blank" rel="noopener"></a></footer>';
  const q = s => dialog.querySelector(s), audio = q('audio'), paper = q('.score-paper'), stage = q('.score-preview-stage');
  const abort = new AbortController(), urls = new Set(), pageCache = new Map();
  let closed = false, client, fileUrl, audioUrl, pages = 0, page = 0, duration = 0, pageSequence = 0, currentStatus = 'loading', audioPreparing = false;
  const text = () => words[window.COPKU_I18N?.language === 'cn' ? 'cn' : 'en'];
  function refreshLabels() {
    const t = text(); dialog.setAttribute('aria-label', t.title); q('.score-preview-eyebrow').textContent = t.title;
    q('.score-preview-close').setAttribute('aria-label', t.close); q('.score-play').textContent = t.play;
    q('.score-previous').setAttribute('aria-label', t.previous); q('.score-next').setAttribute('aria-label', t.next);
    q('.score-zoom-label span').textContent = t.zoom; q('.score-zoom option[value="fit"]').textContent = t.fit;
    q('.score-speed-label span').textContent = t.speed; q('.score-download').textContent = t.download;
    q('.score-source').textContent = t.notice; q('.score-preview-note').textContent = t.note;
    q('.score-preview-controls').setAttribute('aria-label', t.controls);
    q('.score-page-count').textContent = `${t.page} ${pages ? page + 1 : '—'} / ${pages || '—'}${duration ? ' · ' + scoreTime(duration) : ''}`;
    q('.score-page-image').alt = `${String(name || '').slice(0, 250)} · ${t.page} ${page + 1}`;
    q('.score-preview-status').textContent = t[currentStatus] || '';
  }
  function showError(error, audioOnly = false) {
    if (closed || error?.code === 'CLOSED' || error?.name === 'AbortError') return;
    const t = text(); const label = audioOnly ? t.audioFailed : ({ FILE_UNAVAILABLE: t.unavailable, SCORE_TOO_LARGE: t.large, SCORE_TOO_COMPLEX: t.complex, UNSUPPORTED_SCORE: t.unsupported, INVALID_SCORE: t.unsupported, TIMEOUT: t.timeout })[error?.code] || t.failed;
    q('.score-preview-error').textContent = label; q('.score-preview-error').hidden = false;
    currentStatus = ''; refreshLabels(); stage.setAttribute('aria-busy', 'false');
  }
  function objectUrl(blob) { const url = URL.createObjectURL(blob); urls.add(url); return url; }
  function cachePage(index, svg) {
    const url = objectUrl(new Blob([svg], { type: 'image/svg+xml' })); pageCache.set(index, url);
    while (pageCache.size > 6) { const key = pageCache.keys().next().value, old = pageCache.get(key); pageCache.delete(key); URL.revokeObjectURL(old); urls.delete(old); }
    return url;
  }
  function displayPage(index, url) {
    page = index; q('.score-page-image').src = url; paper.hidden = false; stage.scrollTop = 0; stage.scrollLeft = 0;
    stage.setAttribute('aria-busy', 'false'); q('.score-previous').disabled = page === 0; q('.score-next').disabled = page >= pages - 1;
    currentStatus = audioPreparing ? 'preparing' : 'ready'; refreshLabels();
  }
  async function changePage(index) {
    if (closed || index < 0 || index >= pages) return;
    const sequence = ++pageSequence; stage.setAttribute('aria-busy', 'true'); q('.score-previous').disabled = true; q('.score-next').disabled = true;
    try { const url = pageCache.get(index) || cachePage(index, await client.request('page', { index })); if (!closed && sequence === pageSequence) displayPage(index, url); }
    catch (error) { showError(error); }
  }
  function close() { if (!closed) dialog.close(); }
  dialog.addEventListener('close', () => {
    if (closed) return; closed = true; abort.abort(); client?.close(); audio.pause(); audio.removeAttribute('src'); audio.load();
    for (const url of urls) URL.revokeObjectURL(url); urls.clear(); pageCache.clear();
    window.removeEventListener('copku-language-change', refreshLabels); window.removeEventListener('pagehide', close);
    doc.documentElement.classList.remove('score-preview-open'); dialog.remove();
    if (activePreview?.dialog === dialog) activePreview = null;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }, { once: true });
  q('.score-preview-close').onclick = close;
  q('.score-previous').onclick = () => changePage(page - 1); q('.score-next').onclick = () => changePage(page + 1);
  q('.score-zoom').onchange = event => { const value = event.target.value; paper.style.width = value === 'fit' ? '100%' : `${Number(value)}%`; };
  q('.score-speed').onchange = event => { audio.playbackRate = Number(event.target.value); };
  q('.score-play').onclick = async () => {
    if (closed || audioPreparing) return;
    audioPreparing = true; q('.score-play').disabled = true; q('.score-preview-error').hidden = true; currentStatus = 'preparing'; refreshLabels();
    try {
      const bytes = await client.request('audio'); if (closed) return;
      audioUrl = objectUrl(new Blob([bytes], { type: 'audio/mpeg' })); audio.src = audioUrl; audio.hidden = false; audio.setAttribute('aria-label', `${text().title}: ${String(name || '')}`);
      q('.score-play').hidden = true; q('.score-speed-label').hidden = false; currentStatus = 'audioReady'; refreshLabels();
      try { await audio.play(); if (!closed) { currentStatus = 'ready'; refreshLabels(); } } catch { /* Native controls remain available when the browser requires another tap. */ }
    } catch (error) { showError(error, true); if (!closed) q('.score-play').disabled = false; }
    finally { audioPreparing = false; }
  };
  audio.onerror = () => { if (!closed) showError(new ScorePreviewError('AUDIO_UNAVAILABLE'), true); };
  q('#score-preview-name').textContent = String(name || 'MuseScore').slice(0, 300);
  q('.score-source').href = new URL('./licences.html', import.meta.url).href;
  window.addEventListener('copku-language-change', refreshLabels); window.addEventListener('pagehide', close, { once: true });
  doc.body.append(dialog); doc.documentElement.classList.add('score-preview-open'); refreshLabels(); dialog.showModal();
  activePreview = { close, dialog };
  (async () => {
    try {
      const response = await fetchScore(abort.signal), bytes = await readScoreResponse(response, abort.signal); if (closed) return;
      fileUrl = objectUrl(new Blob([bytes], { type: 'application/octet-stream' })); q('.score-download').href = fileUrl; q('.score-download').download = String(name || 'score.mscz'); q('.score-download').hidden = false;
      client = createScoreWorkerClient(makeWorker());
      const info = await client.request('load', { buffer: bytes.buffer }, [bytes.buffer]); if (closed) return;
      pages = info.pages; duration = info.duration;
      if (info.composer) { q('.score-preview-composer').textContent = info.composer; q('.score-preview-composer').hidden = false; }
      displayPage(0, cachePage(0, info.svg)); q('.score-play').disabled = false;
    } catch (error) { if (!closed) { client?.close(); showError(error); } }
  })();
  return activePreview;
}
