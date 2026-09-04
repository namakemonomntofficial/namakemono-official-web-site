/**
 * 怠けモノ Official site — main.js  v5
 *
 * 設計:
 *  - ナビ・ボーダーライン: 色相追従のみ。スライド/フェード一切なし。
 *  - ナビの位置に合わせてタイトルの退場・入場方向を切り替える。
 *  - コンテンツは上から下へ移動しながら入場する。
 *  - 色相は最短経路で補間し、彩度・明度も同時に補間する。
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
const PAGE_ORDER = [
  'index.html',
  'profile.html',
  'portfolio.html',
  'blog.html',
  'tips.html',
  'original.html',
  'shop.html',
  'commission.html',
  'fanart.html',
  'links.html',
];
const NEUTRAL_H = 215;
const DEFAULT_S = 58;
const DEFAULT_L = 42;
const NEUTRAL_S = 10;
const NEUTRAL_L = 48;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─────────────────────────────────────────
// 現在ページ
// ─────────────────────────────────────────
function currentPage() {
  return location.pathname.split('/').pop() || 'index.html';
}
function getPageColor(page) {
  const h = PAGE_HUE[page];
  const neutral = h == null;
  return {
    h: neutral ? NEUTRAL_H : h,
    s: neutral ? NEUTRAL_S : DEFAULT_S,
    l: neutral ? NEUTRAL_L : DEFAULT_L,
  };
}

function transitionDirection(fromPage, toPage) {
  const fromIndex = PAGE_ORDER.indexOf(fromPage || 'index.html');
  const toIndex = PAGE_ORDER.indexOf(toPage || 'index.html');
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return 'right';
  return toIndex > fromIndex ? 'right' : 'left';
}

// ─────────────────────────────────────────
// CSS カスタムプロパティ書き換え
// ─────────────────────────────────────────
function applyColor(color) {
  const r = document.documentElement;
  r.style.setProperty('--live-h', (((color.h % 360) + 360) % 360).toFixed(2));
  r.style.setProperty('--live-s', `${color.s.toFixed(2)}%`);
  r.style.setProperty('--live-l', `${color.l.toFixed(2)}%`);
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
let liveColor = getPageColor(currentPage());

function animateColor(fromColor, toColor, onDone) {
  if (rafId) cancelAnimationFrame(rafId);

  const hueDelta = shortestDelta(fromColor.h, toColor.h);
  const saturationDelta = toColor.s - fromColor.s;
  const lightnessDelta = toColor.l - fromColor.l;
  const dur = REDUCED_MOTION
    ? 0
    : Math.min(480, Math.max(280, Math.abs(hueDelta) * 3.2));
  const start = performance.now();

  function step(now) {
    const t = dur === 0 ? 1 : Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    liveColor = {
      h: fromColor.h + hueDelta * ease,
      s: fromColor.s + saturationDelta * ease,
      l: fromColor.l + lightnessDelta * ease,
    };
    applyColor(liveColor);
    if (t < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      liveColor = { ...toColor };
      applyColor(liveColor);
      rafId = null;
      if (onDone) onDone();
    }
  }
  rafId = requestAnimationFrame(step);
}

// ─────────────────────────────────────────
// ページ遷移
// ─────────────────────────────────────────
let navigating = false;

function navigate(href, clickedLink) {
  if (navigating) return;
  const destFile = href.split('/').pop().split('?')[0] || '';
  if (destFile === currentPage()) return;

  navigating = true;
  const destPage = destFile || 'index.html';
  const destColor = getPageColor(destPage);
  const direction = transitionDirection(currentPage(), destPage);

  // 押したリンクへ active を先に移し、ボーダーと同じ色で追従させる。
  if (clickedLink) {
    document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === href);
    });
  }

  const titleWrap = document.querySelector('.page-title-wrap');
  const contWrap  = document.querySelector('.page-content-wrap');
  if (titleWrap) titleWrap.classList.add(`title-exit-${direction}`);
  if (contWrap)  contWrap.classList.add('content-exit');

  // ページを開く前に色補間を完了し、到着先ではその色を維持する。
  animateColor({ ...liveColor }, destColor, () => {
    try {
      sessionStorage.setItem('entryColor', JSON.stringify(destColor));
      sessionStorage.setItem('pageDirection', direction);
    } catch(e) {}
    window.location.href = href;
  });
}

// ─────────────────────────────────────────
// 初期化
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const page      = currentPage();
  const targetColor = getPageColor(page);
  let entryColor = targetColor;
  let direction = 'right';
  try {
    const storedColor = sessionStorage.getItem('entryColor');
    const storedDirection = sessionStorage.getItem('pageDirection');
    if (storedColor) {
      const parsed = JSON.parse(storedColor);
      if ([parsed.h, parsed.s, parsed.l].every(Number.isFinite)) entryColor = parsed;
    }
    if (storedDirection === 'left' || storedDirection === 'right') direction = storedDirection;
    sessionStorage.removeItem('entryColor');
    sessionStorage.removeItem('pageDirection');
  } catch(e) {}

  liveColor = entryColor;
  applyColor(entryColor);

  // ── 入場アニメーション ──
  const titleWrap = document.querySelector('.page-title-wrap');
  const contWrap  = document.querySelector('.page-content-wrap');

  // わずかに遅延させてブラウザの初回レンダリングを先に済ませる
  requestAnimationFrame(() => {
    if (titleWrap) {
      const enterClass = `title-enter-${direction}`;
      titleWrap.classList.add(enterClass);
      titleWrap.addEventListener('animationend',
        () => titleWrap.classList.remove(enterClass), { once: true });
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
    if (!href || /^(https?:|mailto:|#)/.test(href) || a.target === '_blank' || a.hasAttribute('download')) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href, a);
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
    if (href === page)
      a.classList.add('active');
    if (href === page) a.setAttribute('aria-current', 'page');
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
