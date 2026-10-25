'use strict';

const LEVELS = 12, PAD = 14, SPEED = 900;
const MAX_PEOPLE = 20, MAX_PRIZES = 30, MAX_NAME = 12;
const COLORS = ['#e4572e', '#2e86ab', '#3bb273', '#f2a900', '#8e5bd1', '#e0457b',
                '#17a2a2', '#7a8b2e', '#d2691e', '#4a6fa5', '#b5446e', '#5c5c5c'];
const colorOf = i => COLORS[i % COLORS.length];
const $ = id => document.getElementById(id);

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---- ladder model --------------------------------------------------------

// returns bridges[row] = array of left-column indices
function generateBridges(k) {
  const rows = Array.from({ length: LEVELS }, () => new Set());
  for (const row of rows) {
    for (let c = 0; c < k - 1; c++) {
      if (row.has(c - 1)) continue;
      if (Math.random() < 0.5) row.add(c);
    }
  }
  for (let g = 0; g < k - 1; g++) {
    if (rows.some(r => r.has(g))) continue;
    const order = shuffle([...rows.keys()]);
    const r = order.find(i => !rows[i].has(g - 1) && !rows[i].has(g + 1));
    rows[r === undefined ? order[0] : r].add(g);
  }
  return rows.map(r => [...r]);
}

// ---- ladder view ---------------------------------------------------------
// setup({tops, prizes, bridges, hidden, editTops, editPrizes, canStart, mine, onDone, onChange})
//   tops[i]: 名前 or null(空きスロット) / prizes[i]: 結果 (長さは tops と同じ)

function createLadder(board) {
  board.replaceChildren(el('div', { className: 'row names' }), el('div', { className: 'row starts' }),
    el('canvas'), el('div', { className: 'row results' }));
  const [namesEl, startsEl, canvas, resultsEl] = board.children;
  const ctx = canvas.getContext('2d');
  let S = null, bridges = [], traces = [], revealed = [], raf = 0, last = 0;
  const K = () => S.tops.length;
  const colX = c => (c + 0.5) * canvas.clientWidth / K();
  const rowY = r => PAD + (r + 0.5) * (canvas.clientHeight - 2 * PAD) / LEVELS;

  function buildTrace(start) {
    let c = start;
    const pts = [[colX(c), PAD]];
    for (let r = 0; r < LEVELS; r++) {
      const to = bridges[r].includes(c) ? c + 1 : bridges[r].includes(c - 1) ? c - 1 : c;
      pts.push([colX(c), rowY(r)]);
      if (to !== c) { c = to; pts.push([colX(c), rowY(r)]); }
    }
    pts.push([colX(c), canvas.clientHeight - PAD]);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { pts, len, shown: 0, done: false, end: c };
  }

  function draw() {
    if (!S) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--line').trim();
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let c = 0; c < K(); c++) { ctx.moveTo(colX(c), PAD); ctx.lineTo(colX(c), h - PAD); }
    if (!S.hidden) {
      bridges.forEach((cols, r) => cols.forEach(c => { ctx.moveTo(colX(c), rowY(r)); ctx.lineTo(colX(c + 1), rowY(r)); }));
    }
    ctx.stroke();
    ctx.lineWidth = 6;
    traces.forEach((t, i) => {
      if (!t) return;
      ctx.strokeStyle = colorOf(i);
      ctx.beginPath();
      let left = t.shown;
      ctx.moveTo(t.pts[0][0], t.pts[0][1]);
      for (let k = 1; k < t.pts.length && left > 0; k++) {
        const [x0, y0] = t.pts[k - 1], [x1, y1] = t.pts[k];
        const d = Math.hypot(x1 - x0, y1 - y0), f = d === 0 ? 1 : Math.min(1, left / d);
        ctx.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
        left -= d;
      }
      ctx.stroke();
    });
  }

  function resize() {
    if (!S) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    traces = traces.map((t, i) => {
      if (!t) return t;
      const nt = buildTrace(i);
      nt.done = t.done; nt.shown = t.done ? nt.len : Math.min(t.shown, nt.len);
      return nt;
    });
    draw();
  }

  function renderTops() {
    namesEl.replaceChildren(); startsEl.replaceChildren();
    for (let i = 0; i < K(); i++) {
      const name = S.tops[i];
      const cell = el('div', { className: 'cell' + (S.mine === i ? ' me-name' : '') });
      cell.style.setProperty('--c', colorOf(i));
      if (name === null) cell.append(el('div', { className: 'label-box empty', textContent: '—' }));
      else if (S.editTops) {
        const input = el('input', { value: name, maxLength: MAX_NAME, ariaLabel: `参加者${i + 1}の名前` });
        input.addEventListener('input', () => { S.tops[i] = input.value; S.onChange && S.onChange(); });
        cell.append(input);
      } else cell.append(el('div', { className: 'label-box', textContent: name, title: name }));
      namesEl.append(cell);

      const sc = el('div');
      sc.style.setProperty('--c', colorOf(i));
      if (name !== null && (!S.canStart || S.canStart(i))) {
        const b = el('button', { type: 'button', className: 'start-btn', textContent: '▼', title: 'たどる', disabled: !!traces[i] });
        b.addEventListener('click', () => start(i));
        sc.append(b);
      }
      startsEl.append(sc);
    }
  }

  function renderResults() {
    resultsEl.replaceChildren();
    for (let i = 0; i < K(); i++) {
      const masked = S.hidden && revealed[i] < 0;
      const cell = el('div');
      if (S.editPrizes) {
        const input = el('input', { value: S.prizes[i], maxLength: MAX_NAME, ariaLabel: `結果${i + 1}`, className: masked ? 'masked' : '' });
        input.addEventListener('input', () => { S.prizes[i] = input.value; S.onChange && S.onChange(); });
        cell.append(input);
      } else cell.append(el('div', { className: 'label-box' + (masked ? ' masked' : ''), textContent: S.prizes[i], title: masked ? '' : S.prizes[i] }));
      if (masked) cell.append(el('span', { className: 'q', textContent: '？' }));
      const who = revealed[i] >= 0 ? S.tops[revealed[i]] : '';
      cell.append(el('span', { className: 'who', textContent: who ? `← ${who}` : '' }));
      resultsEl.append(cell);
    }
  }

  function start(i) {
    if (!S || traces[i] || S.tops[i] === null) return;
    traces[i] = buildTrace(i);
    const b = startsEl.children[i] && startsEl.children[i].querySelector('button');
    if (b) b.disabled = true;
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }

  function tick(now) {
    const dt = (now - last) / 1000; last = now;
    let active = false;
    traces.forEach((t, i) => {
      if (!t || t.done) return;
      t.shown = Math.min(t.len, t.shown + SPEED * dt);
      if (t.shown >= t.len) {
        t.done = true; revealed[t.end] = i; renderResults();
        S.onDone && S.onDone(i, t.end); S.onChange && S.onChange();
      } else active = true;
    });
    draw();
    raf = active ? requestAnimationFrame(tick) : 0;
  }

  function reset() { cancelAnimationFrame(raf); raf = 0; traces = Array(K()).fill(null); revealed = Array(K()).fill(-1); }

  return {
    setup(opts) {
      S = opts; bridges = opts.bridges; reset();
      board.style.setProperty('--n', K());
      renderTops(); renderResults(); resize();
    },
    setHidden(h) { S.hidden = h; renderResults(); draw(); },
    startAll() { for (let i = 0; i < K(); i++) start(i); },
    start,
    items: () => traces.map((t, i) => (t && t.done ? { i, top: S.tops[i], prize: S.prizes[t.end] } : null)).filter(Boolean),
    resize,
    redraw: draw,
  };
}

function renderSummary(ul, items) {
  ul.replaceChildren();
  if (!items.length) { ul.append(el('li', { textContent: 'まだ誰もたどっていません。', style: 'color:var(--muted)' })); return; }
  for (const it of items) {
    const li = el('li', {}, el('span', { className: 'dot' }), `${it.top || '（名前なし）'} → ${it.prize || '（空欄）'}`);
    li.style.setProperty('--c', colorOf(it.i));
    ul.append(li);
  }
}

// ---- shared widgets ------------------------------------------------------

// 結果リストの編集 UI。arr を直接書き換える。
function prizeEditor(box, arr, onChange) {
  const render = () => {
    box.replaceChildren();
    const list = el('div', { className: 'plist' });
    arr.forEach((v, i) => {
      const input = el('input', { value: v, maxLength: MAX_NAME, ariaLabel: `結果${i + 1}` });
      input.addEventListener('input', () => { arr[i] = input.value; onChange(); });
      const del = el('button', { type: 'button', textContent: '✕', title: '削除', disabled: arr.length <= 1 });
      del.addEventListener('click', () => { arr.splice(i, 1); onChange(); render(); });
      list.append(el('div', { className: 'item' }, input, del));
    });
    const add = el('button', { type: 'button', textContent: '＋ 結果を追加', disabled: arr.length >= MAX_PRIZES });
    add.addEventListener('click', () => { arr.push('はずれ'); onChange(); render(); });
    box.append(list, add);
  };
  render();
}

function stepper(minus, plus, label, get, set, lo, hi) {
  const upd = () => { label.textContent = get(); minus.disabled = get() <= lo; plus.disabled = get() >= hi; };
  minus.onclick = () => { set(get() - 1); upd(); };
  plus.onclick = () => { set(get() + 1); upd(); };
  upd();
  return upd;
}

async function copyText(text, input) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    input.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
}

// ---- views ---------------------------------------------------------------

let store = null, unsubs = [], localLadder = null, roomLadder = null;
const views = ['home', 'local', 'room'];
function show(name) { views.forEach(v => { $(v).hidden = v !== name; }); }
function clearRoomListeners() { unsubs.forEach(u => u()); unsubs = []; }

// -- home
const home = { n: 4, prizes: ['当たり', 'はずれ', 'はずれ', 'はずれ'], inited: false };
function showHome() {
  clearRoomListeners(); show('home');
  if (home.inited) return;
  home.inited = true;
  stepper($('h-minus'), $('h-plus'), $('h-n'), () => home.n, v => { home.n = v; }, 2, MAX_PEOPLE);
  prizeEditor($('h-prizes'), home.prizes, () => {});
  $('h-local').onclick = () => { location.hash = '#local'; };
  $('h-create').onclick = async () => {
    const btn = $('h-create'); btn.disabled = true;
    try {
      const id = Math.random().toString(36).slice(2, 10);
      await store.set(`rooms/${id}/meta`, { hostUid: store.uid, n: home.n, title: $('h-title').value.trim(), at: Date.now() });
      await store.set(`rooms/${id}/secret`, { prizes: JSON.stringify(home.prizes) });
      location.hash = '#r=' + id;
    } catch (e) { alert('ルームを作れませんでした: ' + e.message); } finally { btn.disabled = false; }
  };
}

// -- local (1台)
const local = { n: 4, m: 4, names: [], prizes: [], bridges: null };
function localKM() { return Math.max(local.n, local.m); }
function showLocal() {
  clearRoomListeners(); show('local');
  if (!localLadder) {
    localLadder = createLadder($('l-board'));
    const regen = () => {
      const k = localKM();
      while (local.names.length < local.n) local.names.push(`参加者${local.names.length + 1}`);
      while (local.prizes.length < local.m) local.prizes.push('はずれ');
      if (local.prizes.every(p => p === 'はずれ')) local.prizes[0] = '当たり';
      const tops = Array.from({ length: k }, (_, i) => (i < local.n ? local.names[i] : null));
      const prizes = Array.from({ length: k }, (_, i) => (i < local.m ? local.prizes[i] : 'はずれ'));
      // 編集内容が local.* に反映されるよう、tops/prizes の元配列を共有する
      local.names = tops.slice(0, local.n); local.prizes = prizes.slice(0, local.m);
      localLadder.setup({
        tops, prizes, bridges: generateBridges(k), hidden: $('l-hidden').checked, editTops: true, editPrizes: true,
        onChange: () => {
          for (let i = 0; i < local.n; i++) local.names[i] = tops[i];
          for (let i = 0; i < local.m; i++) local.prizes[i] = prizes[i];
          renderSummary($('l-summary'), localLadder.items());
        },
      });
      renderSummary($('l-summary'), []);
    };
    local.regen = regen;
    stepper($('l-nminus'), $('l-nplus'), $('l-n'), () => local.n, v => { local.n = v; regen(); }, 2, MAX_PEOPLE);
    stepper($('l-mminus'), $('l-mplus'), $('l-m'), () => local.m, v => { local.m = v; regen(); }, 2, MAX_PRIZES);
    $('l-regen').onclick = regen;
    $('l-reset').onclick = regen;
    $('l-all').onclick = () => localLadder.startAll();
    $('l-hidden').onchange = () => localLadder.setHidden($('l-hidden').checked);
    regen();
  }
  localLadder.resize();
}

// -- room
function showRoom(id) {
  clearRoomListeners(); show('room');
  const base = `rooms/${id}`;
  const R = { meta: undefined, parts: {}, pub: undefined, prizes: null, prizesShown: false, nameInit: false, shownPub: false };
  const isHost = () => R.meta && R.meta.hostUid === store.uid;

  $('r-title').textContent = 'ルームを読み込み中…';
  $('r-status').textContent = '';
  $('r-link').value = location.href;
  $('r-result').hidden = true; $('r-host').hidden = true;
  $('r-join').hidden = false; $('r-invite').hidden = false;
  $('r-name').value = ''; $('r-mine').textContent = '';
  roomLadder = roomLadder || createLadder($('r-board'));

  const refresh = () => {
    const m = R.meta;
    if (m === undefined) return;
    if (m === null) { $('r-title').textContent = 'ルームが見つかりません'; $('r-join').hidden = true; $('r-invite').hidden = true; return; }
    $('r-title').textContent = m.title || 'あみだくじ';
    const list = Object.entries(R.parts).sort((a, b) => a[1].at - b[1].at);
    const published = !!R.pub;
    $('r-count').textContent = list.length; $('r-max').textContent = m.n;
    const ul = $('r-list'); ul.replaceChildren();
    list.forEach(([uid, p], k) => {
      const li = el('li', { textContent: p.name + (uid === store.uid ? '（あなた）' : '') });
      li.style.setProperty('--c', colorOf(k));
      if (uid === store.uid) li.classList.add('me');
      ul.append(li);
    });
    const mine = R.parts[store.uid];
    if (mine && !R.nameInit) { $('r-name').value = mine.name; R.nameInit = true; }
    const full = list.length >= m.n && !mine;
    $('r-joinbtn').textContent = mine ? '名前を変更' : '参加する';
    $('r-joinbtn').disabled = published || full;
    $('r-name').disabled = published || full;
    $('r-joinmsg').textContent = published ? '結果が公開されました。' : full ? '定員に達しました。' : mine ? '参加済みです。公開までお待ちください。' : '';
    $('r-status').textContent = published ? '' : isHost() ? 'あなたは主催者です。全員が入力したら「結果を公開する」を押してください。' : '主催者が結果を公開するまでお待ちください。';
    $('r-host').hidden = !isHost() || published;
    $('r-invite').hidden = published;
    $('r-publish').disabled = !list.length;
    if (isHost() && !R.prizesShown && R.prizes) {
      R.prizesShown = true;
      prizeEditor($('r-prizes'), R.prizes, () => { store.set(`${base}/secret/prizes`, JSON.stringify(R.prizes)); });
    }
    if (published && !R.shownPub) { R.shownPub = true; showPublished(); }
  };

  function showPublished() {
    const d = JSON.parse(R.pub.data);
    $('r-result').hidden = false; $('r-host').hidden = true;
    const myCol = d.colByUid[store.uid];
    roomLadder.setup({
      tops: d.tops, prizes: d.prizes, bridges: d.bridges, hidden: true, mine: myCol,
      onDone: (i, end) => { if (i === myCol) $('r-mine').textContent = `あなたの結果：${d.prizes[end]}`; },
      onChange: () => renderSummary($('r-summary'), roomLadder.items()),
    });
    renderSummary($('r-summary'), []);
    roomLadder.startAll();
  }

  const err = e => { $('r-status').textContent = '読み込みエラー: ' + (e && e.message); };
  unsubs.push(store.listen(`${base}/meta`, v => { R.meta = v; refresh(); }, err));
  unsubs.push(store.listen(`${base}/participants`, v => { R.parts = v || {}; refresh(); }, err));
  unsubs.push(store.listen(`${base}/published`, v => { R.pub = v || undefined; refresh(); }, err));
  unsubs.push(store.listen(`${base}/secret/prizes`, v => { if (v && !R.prizes) { R.prizes = JSON.parse(v); refresh(); } }, () => {}));

  $('r-copy').onclick = async () => { const ok = await copyText($('r-link').value, $('r-link')); $('r-copy').textContent = ok ? 'コピーしました' : '手動でコピーしてください'; setTimeout(() => { $('r-copy').textContent = 'コピー'; }, 2000); };
  $('r-joinbtn').onclick = async () => {
    const name = $('r-name').value.trim();
    if (!name) { $('r-joinmsg').textContent = '名前を入力してください。'; return; }
    try { await store.set(`${base}/participants/${store.uid}`, { name, at: (R.parts[store.uid] || {}).at || Date.now() }); }
    catch (e) { $('r-joinmsg').textContent = '参加できませんでした: ' + e.message; }
  };
  $('r-publish').onclick = async () => {
    const list = Object.entries(R.parts).sort((a, b) => a[1].at - b[1].at);
    if (list.length < R.meta.n && !confirm(`まだ ${R.meta.n - list.length} 人が未入力です。このまま公開しますか？`)) return;
    const k = Math.max(list.length, R.prizes.length);
    const prizes = Array.from({ length: k }, (_, i) => (i < R.prizes.length && R.prizes[i].trim() ? R.prizes[i] : 'はずれ'));
    const cols = shuffle([...Array(k).keys()]).slice(0, list.length);
    const tops = Array(k).fill(null), colByUid = {};
    list.forEach(([uid, p], j) => { tops[cols[j]] = p.name; colByUid[uid] = cols[j]; });
    try {
      await store.set(`${base}/published`, { data: JSON.stringify({ tops, prizes, bridges: generateBridges(k), colByUid }), at: Date.now() });
    } catch (e) { alert('公開できませんでした: ' + e.message); }
  };
}

// ---- routing -------------------------------------------------------------

function route() {
  const h = location.hash;
  const m = h.match(/^#r=([\w-]+)$/);
  if (m) showRoom(m[1]);
  else if (h === '#local') showLocal();
  else showHome();
}

(async function main() {
  try { store = await Store.init(); }
  catch (e) { document.body.prepend(el('p', { className: 'notice', textContent: '共有機能を初期化できませんでした: ' + e.message })); store = null; }
  if (store && store.mode === 'demo') $('demo-notice').hidden = false;
  if (!store) { $('h-create').disabled = true; }
  addEventListener('hashchange', route);
  addEventListener('resize', () => { localLadder && localLadder.resize(); roomLadder && roomLadder.resize(); });
  new ResizeObserver(() => { localLadder && localLadder.resize(); roomLadder && roomLadder.resize(); }).observe(document.body);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { localLadder && localLadder.redraw(); roomLadder && roomLadder.redraw(); });
  route();
})();
