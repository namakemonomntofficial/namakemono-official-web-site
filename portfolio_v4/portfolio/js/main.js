/**
 * 怠けモノ Official site — main.js  v4
 *
 * 設計:
 *  - ナビ・ボーダーライン: 色相追従のみ。スライド/フェード一切なし。
 *  - .page-title-wrap   : 左スライドアウト → 右スライドイン
 *  - .page-content-wrap : フェードアウト   → フェードイン
 *  - 色相補間: 45°/300ms ペース、最短経路。
 *    ページ到着時は「前ページの色相」から補間開始するため
 *    sessionStorage で出発色相を引き継ぐ。
 */

// ─────────────────────────────────────────
// 定数
// ─────────────────────────────────────────
const PAGE_HUE = {
  'index.html':      120,
  '':                120,
  'profile.html':    120,
  'portfolio.html':   30,
  'blog.html':       165,
  'tips.html':        75,
  'original.html':   300,
  'shop.html':       345,
  'commission.html': 255,
  'fanart.html':     210,
  'links.html':     null,
};
const NEUTRAL_H  = 215;   // links.html 用のグレー寄り色相
const SAT_LIVE   = '58%';
const LIT_LIVE   = '42%';
const MS_PER_DEG = 300 / 45;   // 6.67ms/deg → 45°=300ms

// ─────────────────────────────────────────
// 現在ページ
// ─────────────────────────────────────────
function currentPage() {
  return location.pathname.split('/').pop() || '';
}
function getTargetHue(page) {
  const h = PAGE_HUE[page];
  return (h == null) ? NEUTRAL_H : h;
}

// ─────────────────────────────────────────
// CSS カスタムプロパティ書き換え
// ─────────────────────────────────────────
function applyHue(h) {
  const r = document.documentElement;
  const isNeutral = (PAGE_HUE[currentPage()] == null);
  r.style.setProperty('--live-h', Math.round(((h % 360) + 360) % 360));
  r.style.setProperty('--live-s', isNeutral ? '10%' : SAT_LIVE);
  r.style.setProperty('--live-l', isNeutral ? '48%' : LIT_LIVE);
}

// ─────────────────────────────────────────
// 最短経路デルタ  (-180 〜 +180)
// ─────────────────────────────────────────
function shortestDelta(from, to) {
  let d = ((to - from) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

// ─────────────────────────────────────────
// 色相アニメーター
// ─────────────────────────────────────────
let rafId   = null;
let liveHue = 120;

function animateHue(fromH, toH, onDone) {
  if (rafId) cancelAnimationFrame(rafId);

  const delta = shortestDelta(fromH, toH);
  const dur   = Math.max(Math.abs(delta) * MS_PER_DEG, 60);
  const start = performance.now();

  function step(now) {
    const t    = Math.min((now - start) / dur, 1);
    // ease-in-out cubic
    const ease = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
    liveHue = fromH + delta * ease;
    applyHue(liveHue);
    if (t < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      liveHue = fromH + delta;
      applyHue(liveHue);
      if (onDone) onDone();
    }
  }
  rafId = requestAnimationFrame(step);
}

// ─────────────────────────────────────────
// ページ遷移
// ─────────────────────────────────────────
let navigating = false;

function navigate(href) {
  if (navigating) return;
  const destFile = href.split('/').pop().split('?')[0] || '';
  if (destFile === currentPage()) return;

  navigating = true;
  const destHue = getTargetHue(destFile);

  // 出発時の色相を次ページへ引き継ぐ
  try { sessionStorage.setItem('fromHue', String(liveHue)); } catch(e){}

  const titleWrap = document.querySelector('.page-title-wrap');
  const contWrap  = document.querySelector('.page-content-wrap');
  if (titleWrap) titleWrap.classList.add('title-exit');
  if (contWrap)  contWrap.classList.add('content-exit');

  // 色相補間しながら遷移
  animateHue(liveHue, destHue, () => {
    window.location.href = href;
  });
}

// ─────────────────────────────────────────
// 初期化
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const page      = currentPage();
  const targetHue = getTargetHue(page);

  // 前ページから色相を引き継ぐ（あれば）
  let fromHue = targetHue;
  try {
    const stored = sessionStorage.getItem('fromHue');
    if (stored !== null) {
      fromHue = parseFloat(stored);
      sessionStorage.removeItem('fromHue');
    }
  } catch(e){}

  // 即座に fromHue を適用（ちらつき防止）
  liveHue = fromHue;
  applyHue(fromHue);

  // fromHue → targetHue へ補間（入場と同時進行）
  if (Math.abs(shortestDelta(fromHue, targetHue)) > 1) {
    animateHue(fromHue, targetHue, null);
  }

  // ── 入場アニメーション ──
  const titleWrap = document.querySelector('.page-title-wrap');
  const contWrap  = document.querySelector('.page-content-wrap');

  // わずかに遅延させてブラウザの初回レンダリングを先に済ませる
  requestAnimationFrame(() => {
    if (titleWrap) {
      titleWrap.classList.add('title-enter');
      titleWrap.addEventListener('animationend',
        () => titleWrap.classList.remove('title-enter'), { once: true });
    }
    if (contWrap) {
      contWrap.classList.add('content-enter');
      contWrap.addEventListener('animationend',
        () => contWrap.classList.remove('content-enter'), { once: true });
    }
  });

  // ── 内部リンクのインターセプト ──
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || /^(https?:|mailto:|#)/.test(href)) return;
    e.preventDefault();
    navigate(href);
  });

  // ── モバイルメニュー ──
  const menuBtn   = document.querySelector('.nav-menu-btn');
  const mobileNav = document.querySelector('.nav-mobile');
  if (menuBtn && mobileNav) {
    menuBtn.addEventListener('click', () => mobileNav.classList.toggle('open'));
  }

  // ── アクティブリンク ──
  document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html'))
      a.classList.add('active');
  });

  // ── スクロールフェードイン ──
  const io = new IntersectionObserver(entries => {
    entries.forEach((e, i) => {
      if (e.isIntersecting)
        setTimeout(() => e.target.classList.add('visible'), i * 55);
    });
  }, { threshold: 0.06 });
  document.querySelectorAll('.fade-in').forEach(el => io.observe(el));
});
