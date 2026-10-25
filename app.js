'use strict';

const MIN_N = 2, MAX_N = 12, LEVELS = 12, PAD = 14, SPEED = 900;
const COLORS = ['#e4572e', '#2e86ab', '#3bb273', '#f2a900', '#8e5bd1', '#e0457b',
                '#17a2a2', '#7a8b2e', '#d2691e', '#4a6fa5', '#b5446e', '#5c5c5c'];

const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');

let n = 4;
let names = ['参加者1', '参加者2', '参加者3', '参加者4'];
let prizes = ['当たり', 'はずれ', 'はずれ', 'はずれ'];
let bridges = [];            // bridges[row] = Set of left-column indices
let traces = [];             // per start column: {pts, len, shown, done, end}
let revealed = [];           // per bottom column: start column that arrived, or -1
let raf = 0, last = 0;

const hiddenMode = () => $('hidden').checked;

// ---- model ---------------------------------------------------------------

function generate() {
  bridges = Array.from({ length: LEVELS }, () => new Set());
  for (const row of bridges) {
    for (let c = 0; c < n - 1; c++) {
      if (row.has(c - 1)) continue;
      if (Math.random() < 0.5) row.add(c);
    }
  }
  // every gap gets at least one rung so no column is isolated
  for (let g = 0; g < n - 1; g++) {
    if (bridges.some(r => r.has(g))) continue;
    const rows = [...bridges.keys()].sort(() => Math.random() - 0.5);
    const r = rows.find(i => !bridges[i].has(g - 1) && !bridges[i].has(g + 1));
    bridges[r === undefined ? rows[0] : r].add(g);
  }
  clearTraces();
}

function clearTraces() {
  cancelAnimationFrame(raf); raf = 0;
  traces = Array(n).fill(null);
  revealed = Array(n).fill(-1);
}

const colX = c => (c + 0.5) * canvas.clientWidth / n;
const rowY = r => PAD + (r + 0.5) * (canvas.clientHeight - 2 * PAD) / LEVELS;

function buildTrace(start) {
  let c = start;
  const pts = [[colX(c), PAD]];
  for (let r = 0; r < LEVELS; r++) {
    const to = bridges[r].has(c) ? c + 1 : bridges[r].has(c - 1) ? c - 1 : c;
    pts.push([colX(c), rowY(r)]);
    if (to !== c) { c = to; pts.push([colX(c), rowY(r)]); }
  }
  pts.push([colX(c), canvas.clientHeight - PAD]);
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return { pts, len, shown: 0, done: false, end: c };
}

// ---- drawing -------------------------------------------------------------

function line(a, b) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }

function draw() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  ctx.strokeStyle = css.getPropertyValue('--line').trim();
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let c = 0; c < n; c++) line([colX(c), PAD], [colX(c), h - PAD]);
  if (!hiddenMode()) {
    for (let r = 0; r < LEVELS; r++) for (const c of bridges[r]) line([colX(c), rowY(r)], [colX(c + 1), rowY(r)]);
  }
  ctx.stroke();

  ctx.lineWidth = 6;
  traces.forEach((t, i) => {
    if (!t) return;
    ctx.strokeStyle = COLORS[i % COLORS.length];
    ctx.beginPath();
    let left = t.shown;
    ctx.moveTo(t.pts[0][0], t.pts[0][1]);
    for (let k = 1; k < t.pts.length && left > 0; k++) {
      const [x0, y0] = t.pts[k - 1], [x1, y1] = t.pts[k];
      const d = Math.hypot(x1 - x0, y1 - y0);
      const f = d === 0 ? 1 : Math.min(1, left / d);
      ctx.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
      left -= d;
    }
    ctx.stroke();
  });
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // geometry changed: rebuild traces, keeping progress
  traces = traces.map((t, i) => {
    if (!t) return t;
    const nt = buildTrace(i);
    nt.done = t.done; nt.shown = t.done ? nt.len : Math.min(t.shown, nt.len);
    return nt;
  });
  draw();
}

// ---- interaction ---------------------------------------------------------

function start(i) {
  if (traces[i]) return;
  traces[i] = buildTrace(i);
  $('starts').children[i].querySelector('button').disabled = true;
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
}

function tick(now) {
  const dt = (now - last) / 1000; last = now;
  let active = false;
  traces.forEach((t, i) => {
    if (!t || t.done) return;
    t.shown = Math.min(t.len, t.shown + SPEED * dt);
    if (t.shown >= t.len) { t.done = true; revealed[t.end] = i; renderResults(); renderSummary(); }
    else active = true;
  });
  draw();
  raf = active ? requestAnimationFrame(tick) : 0;
}

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

function renderNames() {
  $('board').style.setProperty('--n', n);
  const nm = $('names'), st = $('starts');
  nm.replaceChildren(); st.replaceChildren();
  for (let i = 0; i < n; i++) {
    const color = COLORS[i % COLORS.length];
    const input = el('input', { value: names[i], maxLength: 8, ariaLabel: `参加者${i + 1}の名前` });
    input.addEventListener('input', () => { names[i] = input.value; renderSummary(); renderResults(); });
    const cell = el('div', {}, input);
    cell.style.setProperty('--c', color);
    nm.append(cell);

    const btn = el('button', { type: 'button', className: 'start-btn', textContent: '▼', title: 'たどる', disabled: !!traces[i] });
    btn.addEventListener('click', () => start(i));
    const sc = el('div', {}, btn);
    sc.style.setProperty('--c', color);
    st.append(sc);
  }
}

function renderResults() {
  const box = $('results');
  const focus = document.activeElement;
  const keep = focus && focus.dataset && focus.dataset.i;
  box.replaceChildren();
  for (let i = 0; i < n; i++) {
    const masked = hiddenMode() && revealed[i] < 0;
    const input = el('input', { value: prizes[i], maxLength: 8, ariaLabel: `結果${i + 1}` });
    input.dataset.i = i;
    input.className = masked ? 'masked' : '';
    input.addEventListener('input', () => { prizes[i] = input.value; renderSummary(); });
    const cell = el('div', { className: 'cell' }, input);
    if (masked) cell.append(el('span', { className: 'q', textContent: '？' }));
    const who = el('span', { className: 'who', textContent: revealed[i] >= 0 ? `← ${names[revealed[i]]}` : '' });
    if (revealed[i] >= 0) cell.style.setProperty('--c', COLORS[revealed[i] % COLORS.length]);
    box.append(el('div', {}, cell, who));
  }
  if (keep !== undefined && keep !== null) box.querySelector(`[data-i="${keep}"]`)?.focus();
}

function renderSummary() {
  const ul = $('summary');
  ul.replaceChildren();
  const done = traces.map((t, i) => (t && t.done ? i : -1)).filter(i => i >= 0);
  if (!done.length) { ul.append(el('li', { textContent: 'まだ誰もたどっていません。', style: 'color:var(--muted)' })); return; }
  for (const i of done) {
    const li = el('li', {}, el('span', { className: 'dot' }), `${names[i] || `参加者${i + 1}`} → ${prizes[traces[i].end] || '（空欄）'}`);
    li.style.setProperty('--c', COLORS[i % COLORS.length]);
    ul.append(li);
  }
}

function setCount(m) {
  n = Math.max(MIN_N, Math.min(MAX_N, m));
  while (names.length < n) names.push(`参加者${names.length + 1}`);
  while (prizes.length < n) prizes.push('はずれ');
  $('count').textContent = n;
  $('minus').disabled = n <= MIN_N;
  $('plus').disabled = n >= MAX_N;
  generate();
  renderAll();
}

function renderAll() {
  renderNames(); renderResults(); renderSummary(); resize();
}

function reset() { clearTraces(); renderAll(); }

$('minus').onclick = () => setCount(n - 1);
$('plus').onclick = () => setCount(n + 1);
$('regen').onclick = () => { generate(); renderAll(); };
$('reset').onclick = reset;
$('all').onclick = () => { for (let i = 0; i < n; i++) start(i); };
$('hidden').onchange = () => { renderResults(); draw(); };
new ResizeObserver(resize).observe(canvas);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);

setCount(4);
