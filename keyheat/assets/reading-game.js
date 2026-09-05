import { predictReadingFromDictionary } from './reading-dictionary-mvehbspA.js';

const hanPattern = /[\p{Script=Han}々〆ヵヶ]/u;
const hanRunPattern = /[\p{Script=Han}々〆ヵヶ]+/gu;
const state = { active: false, items: [], values: new Map(), unresolved: [], index: 0, modal: null };

function segmentWords(text) {
  const segments = globalThis.Intl?.Segmenter
    ? [...new Intl.Segmenter('ja', { granularity: 'word' }).segment(text)]
    : [...text.matchAll(hanRunPattern)].map((match) => ({ segment: match[0], index: match.index, isWordLike: true }));
  const found = new Map();
  for (const part of segments) {
    if (!part.isWordLike || !hanPattern.test(part.segment)) continue;
    const existing = found.get(part.segment) || { word: part.segment, count: 0, positions: [] };
    existing.count += 1;
    existing.positions.push(part.index ?? 0);
    found.set(part.segment, existing);
  }
  return [...found.values()]
    .map((item) => ({ ...item, next: text.slice(item.positions[0] + item.word.length, item.positions[0] + item.word.length + 3) }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'ja'));
}

function savedReadings() {
  try { return JSON.parse(localStorage.getItem('keyheat-readings') || '{}'); } catch { return {}; }
}

function isReading(value) { return typeof value === 'string' && value.trim().length > 0; }

function currentText() {
  return document.querySelector('.analysis-textarea')?.value || document.querySelector('.collapsed-text-preview')?.textContent || '';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function showModal() {
  const modal = document.querySelector('.reading-modal');
  if (!modal || modal.querySelector('.reading-game')) return;
  state.modal = modal;
  state.items = segmentWords(currentText());
  const saved = savedReadings();
  state.values = new Map(state.items.map((item) => [item.word, saved[item.word]?.defaultReading || '']));
  state.unresolved = [];
  state.index = 0;
  modal.querySelector('.reading-predict-bar')?.setAttribute('hidden', '');
  modal.querySelector('.reading-list')?.setAttribute('hidden', '');
  modal.querySelector('.reading-footer')?.setAttribute('hidden', '');
  modal.insertAdjacentHTML('beforeend', '<div class="reading-game" aria-live="polite"></div>');
  renderIntro();
}

function gameRoot() { return state.modal?.querySelector('.reading-game'); }

function renderIntro() {
  const root = gameRoot();
  if (!root) return;
  const blankCount = state.items.filter((item) => !isReading(state.values.get(item.word))).length;
  root.innerHTML = `
    <section class="reading-game-card reading-game-intro">
      <p class="reading-game-kicker">WORD BY WORD</p>
      <h3>単語ごとに読みをそろえます</h3>
      <p>Intl.Segmenterで文章を単語に分け、未入力の${blankCount}語だけを辞書で調べます。必要な辞書ファイルだけが読み込まれます。</p>
      <button class="reading-game-primary" type="button" data-reading-game-start>読みを調べる</button>
    </section>`;
  root.querySelector('[data-reading-game-start]')?.addEventListener('click', lookUpBlankWords);
}

async function lookUpBlankWords() {
  const root = gameRoot();
  if (!root) return;
  const blanks = state.items.filter((item) => !isReading(state.values.get(item.word)));
  root.innerHTML = `
    <section class="reading-game-card reading-game-loading">
      <p class="reading-game-kicker">JMDICTFURIGANA</p>
      <h3>辞書を照合しています</h3>
      <p data-reading-game-progress>0 / ${blanks.length} 語</p>
    </section>`;
  for (let index = 0; index < blanks.length; index += 1) {
    const item = blanks[index];
    try {
      const reading = await predictReadingFromDictionary(item.word);
      if (isReading(reading)) state.values.set(item.word, reading);
    } catch {
      // A missing shard or offline request simply leaves this word for the typing step.
    }
    const progress = root.querySelector('[data-reading-game-progress]');
    if (progress) progress.textContent = `${index + 1} / ${blanks.length} 語`;
  }
  state.unresolved = state.items.filter((item) => !isReading(state.values.get(item.word)));
  state.index = 0;
  state.unresolved.length ? renderTypingGame() : renderReview();
}

function saveCurrentInput() {
  const input = gameRoot()?.querySelector('[data-reading-game-input]');
  const item = state.unresolved[state.index];
  if (input && item && isReading(input.value)) state.values.set(item.word, input.value.trim());
}

function renderTypingGame() {
  const root = gameRoot();
  const item = state.unresolved[state.index];
  if (!root || !item) return renderReview();
  const later = item.next ? escapeHtml(item.next) : '文末';
  root.innerHTML = `
    <section class="reading-game-card reading-game-play">
      <div class="reading-game-progress"><span>${state.index + 1} / ${state.unresolved.length}</span><span>${item.count}回出現</span></div>
      <p class="reading-game-kicker">辞書にない単語</p>
      <div class="reading-game-word">${escapeHtml(item.word)}</div>
      <p class="reading-game-context">後続: <strong>${later}</strong></p>
      <label class="reading-game-label">読み（ひらがな）<input data-reading-game-input autocomplete="off" inputmode="kana" value="${escapeHtml(state.values.get(item.word) || '')}" placeholder="読みを入力" /></label>
      <p class="reading-game-help"><kbd>Enter</kbd> 次の単語　 <kbd>Esc</kbd> 途中終了して入力済みを確定</p>
      <div class="reading-game-actions"><button type="button" class="reading-game-secondary" data-reading-game-exit>途中終了</button><button type="button" class="reading-game-primary" data-reading-game-next>次へ</button></div>
    </section>`;
  const input = root.querySelector('[data-reading-game-input]');
  input?.focus();
  input?.addEventListener('keydown', (event) => {
    if (event.isComposing) return;
    if (event.key === 'Enter') { event.preventDefault(); nextWord(); }
    if (event.key === 'Escape') { event.preventDefault(); finishAndReview(); }
  });
  root.querySelector('[data-reading-game-next]')?.addEventListener('click', nextWord);
  root.querySelector('[data-reading-game-exit]')?.addEventListener('click', finishAndReview);
}

function nextWord() {
  saveCurrentInput();
  state.index += 1;
  state.index < state.unresolved.length ? renderTypingGame() : renderReview();
}

function finishAndReview() {
  saveCurrentInput();
  renderReview();
}

function renderReview() {
  const root = gameRoot();
  if (!root) return;
  const complete = state.items.filter((item) => isReading(state.values.get(item.word)));
  root.innerHTML = `
    <section class="reading-game-card reading-game-review">
      <p class="reading-game-kicker">CHECK</p>
      <h3>読みを確認</h3>
      <p>入力済みの単語を出現頻度順に表示しています。必要ならここで修正できます。</p>
      <div class="reading-game-review-list">${complete.map((item) => `
        <label><span><strong>${escapeHtml(item.word)}</strong><small>${item.count}回</small></span><input data-reading-game-review="${escapeHtml(item.word)}" value="${escapeHtml(state.values.get(item.word))}" inputmode="kana" /></label>`).join('') || '<p class="reading-game-none">確定した読みはまだありません。</p>'}</div>
      <div class="reading-game-actions"><button type="button" class="reading-game-secondary" data-reading-game-back>入力に戻る</button><button type="button" class="reading-game-primary" data-reading-game-apply>分析へ反映</button></div>
    </section>`;
  root.querySelectorAll('[data-reading-game-review]').forEach((input) => input.addEventListener('input', () => state.values.set(input.dataset.readingGameReview, input.value.trim())));
  root.querySelector('[data-reading-game-back]')?.addEventListener('click', () => { state.unresolved = state.items.filter((item) => !isReading(state.values.get(item.word))); state.index = 0; state.unresolved.length ? renderTypingGame() : renderIntro(); });
  root.querySelector('[data-reading-game-apply]')?.addEventListener('click', applyReadings);
}

function setReactInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function wordsInsideRun(text, start, run) {
  return state.items.filter((item) => item.positions.some((position) => position >= start && position < start + run.length));
}

async function applyReadings() {
  const text = currentText();
  const stored = savedReadings();
  const originalInputs = [...document.querySelectorAll('[data-reading-main]')];
  for (const match of text.matchAll(hanRunPattern)) {
    const block = match[0];
    const parts = wordsInsideRun(text, match.index ?? 0, block);
    if (!parts.length || !parts.every((part) => isReading(state.values.get(part.word)))) continue;
    let reading = parts.map((part) => state.values.get(part.word)).join('');
    // If Segmenter kept okurigana with the word, trim that literal kana for the legacy heatmap mapper.
    const kanaTail = block === parts[0]?.word ? '' : '';
    if (kanaTail) reading = reading.slice(0, -kanaTail.length);
    stored[block] = { ...(stored[block] || { contextual: {} }), defaultReading: reading };
    const input = originalInputs.find((element) => element.closest('.reading-item')?.querySelector('strong')?.textContent === block);
    if (input) setReactInput(input, reading);
  }
  // Preserve the word-level entries too, so the next session only asks for genuinely blank words.
  for (const item of state.items) {
    const reading = state.values.get(item.word);
    if (isReading(reading)) stored[item.word] = { ...(stored[item.word] || { contextual: {} }), defaultReading: reading };
  }
  localStorage.setItem('keyheat-readings', JSON.stringify(stored));
  document.querySelector('[data-reading-apply]')?.click();
}

function install() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('.reading-button')) requestAnimationFrame(showModal);
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!state.modal?.isConnected || !state.modal.querySelector('.reading-game-play') || event.isComposing || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    finishAndReview();
  }, true);
}

install();
