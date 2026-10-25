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

// -- 最近のルーム（この端末のブラウザに記憶）
const ROOMS_KEY = 'amida-rooms';
const loadRooms = () => { try { return JSON.parse(localStorage.getItem(ROOMS_KEY)) || []; } catch { return []; } };
const storeRooms = l => { try { localStorage.setItem(ROOMS_KEY, JSON.stringify(l.slice(0, 30))); } catch { /* 保存できなくても動作に影響なし */ } };
function rememberRoom(id, patch) {
  const l = loadRooms();
  let r = l.find(x => x.id === id);
  if (!r) { r = { id, at: Date.now() }; l.unshift(r); }
  Object.assign(r, patch);
  storeRooms(l);
}
const fmtDate = ms => new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const forgetRoom = id => storeRooms(loadRooms().filter(x => x.id !== id));

// -- home
const home = { n: 4, prizes: ['当たり', 'はずれ', 'はずれ', 'はずれ'], inited: false };
function renderRecent() {
  const list = loadRooms(), ul = $('h-rooms');
  $('h-rooms-box').hidden = !list.length;
  ul.replaceChildren();
  for (const r of list) {
    const a = el('a', { href: '#r=' + r.id, textContent: `${r.title || 'あみだくじ'}（${r.role === 'host' ? '主催' : '参加'}）` + (r.expiresAt ? ` 〜${fmtDate(r.expiresAt)}` : '') });
    const del = el('button', { type: 'button', textContent: '✕', title: '一覧から消す（ルーム自体は消えません）' });
    del.onclick = () => { forgetRoom(r.id); renderRecent(); };
    ul.append(el('li', {}, a, del));
  }
}
function showHome() {
  clearRoomListeners(); show('home');
  renderRecent();
  if (home.inited) return;
  home.inited = true;
  stepper($('h-minus'), $('h-plus'), $('h-n'), () => home.n, v => { home.n = v; }, 2, MAX_PEOPLE);
  prizeEditor($('h-prizes'), home.prizes, () => {});
  $('h-local').onclick = () => { location.hash = '#local'; };
  $('h-create').onclick = async () => {
    const btn = $('h-create'); btn.disabled = true;
    try {
      const id = Math.random().toString(36).slice(2, 10);
      const title = $('h-title').value.trim();
      const k = Math.max(home.n, home.prizes.length);
      const expiresAt = Date.now() + Number($('h-days').value) * 86400000;
      await store.set(`rooms/${id}/meta`, { hostUid: store.uid, n: home.n, k, title, at: Date.now(), expiresAt });
      await store.set(`rooms/${id}/prizes`, JSON.stringify(home.prizes));
      rememberRoom(id, { title, role: 'host', expiresAt });
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
  const R = { meta: undefined, parts: {}, slots: {}, pub: undefined, prizes: null, prizeList: null, prizesShown: false, nameInit: false, shownPub: false, gone: false };
  const isHost = () => R.meta && R.meta.hostUid === store.uid;
  const sortedParts = () => Object.entries(R.parts).sort((a, b) => a[1].at - b[1].at);
  const slotOf = uid => { const e = Object.entries(R.slots).find(([, u]) => u === uid); return e ? Number(e[0]) : undefined; };

  $('r-title').textContent = 'ルームを読み込み中…';
  $('r-status').textContent = '';
  $('r-link').value = location.href;
  $('r-result').hidden = true; $('r-host').hidden = true;
  $('r-join').hidden = false; $('r-invite').hidden = false; $('r-slotcard').hidden = false; $('r-expire').textContent = '';
  $('r-name').value = ''; $('r-mine').textContent = ''; $('r-slotmsg').textContent = '';
  roomLadder = roomLadder || createLadder($('r-board'));

  async function pick(i) {
    const mine = slotOf(store.uid);
    try {
      if (mine === i) { await store.remove(`${base}/slots/${i}`); return; }
      if (R.slots[i] && R.slots[i] !== store.uid) { $('r-slotmsg').textContent = 'その線はもう選ばれています。'; return; }
      await store.set(`${base}/slots/${i}`, store.uid);
      if (mine !== undefined) await store.remove(`${base}/slots/${mine}`);
    } catch (e) { $('r-slotmsg').textContent = '選べませんでした（先に選ばれた可能性があります）'; }
  }

  const goneUI = () => {
    R.gone = true; forgetRoom(id);
    $('r-title').textContent = 'ルームが見つからないか、保存期間が過ぎて削除されました';
    $('r-status').textContent = ''; $('r-expire').textContent = '';
    ['r-join', 'r-invite', 'r-slotcard', 'r-prizecard', 'r-host', 'r-hostadmin', 'r-result'].forEach(x => { $(x).hidden = true; });
  };
  const expire = () => { if (R.gone) return; store.remove(base).catch(() => {}); goneUI(); };

  const refresh = () => {
    const m = R.meta;
    if (m === undefined || R.gone) return;
    if (m === null) { goneUI(); return; }
    if (m.expiresAt && m.expiresAt < Date.now()) { expire(); return; }
    rememberRoom(id, { title: m.title || '', role: isHost() ? 'host' : 'guest', expiresAt: m.expiresAt });
    $('r-expire').textContent = m.expiresAt ? `このルームは ${fmtDate(m.expiresAt)} まで保存され、その後は自動で削除されます。` : '';
    $('r-hostadmin').hidden = !isHost();
    if (isHost() && !R.prizes && R.prizeList) R.prizes = R.prizeList.slice();
    // 参加者向けの結果一覧（同じ結果は「×個数」にまとめる）
    const pl = R.prizeList || [], kk = Math.max(m.k || m.n, pl.length), counts = new Map();
    for (let i = 0; i < kk; i++) { const p = pl[i] && pl[i].trim() ? pl[i].trim() : 'はずれ'; counts.set(p, (counts.get(p) || 0) + 1); }
    const pul = $('r-prizelist'); pul.replaceChildren();
    counts.forEach((c, p) => pul.append(el('li', { textContent: `${p} ×${c}` })));
    $('r-prizecard').hidden = !!R.pub || isHost() || !R.prizeList;
    $('r-title').textContent = m.title || 'あみだくじ';
    const list = sortedParts(), published = !!R.pub, mine = R.parts[store.uid], myslot = slotOf(store.uid);
    const k = m.k || m.n;
    $('r-count').textContent = list.length; $('r-max').textContent = m.n;
    const ul = $('r-list'); ul.replaceChildren();
    list.forEach(([uid, p], j) => {
      const s = slotOf(uid);
      const li = el('li', { textContent: p.name + (uid === store.uid ? '（あなた）' : '') + (s !== undefined ? ` ${s + 1}番` : '') });
      li.style.setProperty('--c', colorOf(j));
      if (uid === store.uid) li.classList.add('me');
      ul.append(li);
    });
    if (mine && !R.nameInit) { $('r-name').value = mine.name; R.nameInit = true; }
    const full = list.length >= m.n && !mine;
    $('r-joinbtn').textContent = mine ? '名前を変更' : '参加する';
    $('r-joinbtn').disabled = published || full;
    $('r-name').disabled = published || full;
    $('r-joinmsg').textContent = published ? '結果が公開されました。' : full ? '定員に達しました。' : mine ? '参加済みです。' : '';
    $('r-status').textContent = published ? '' : isHost() ? 'あなたは主催者です。全員が入力したら「結果を公開する」を押してください。' : '主催者が結果を公開するまでお待ちください。';
    $('r-host').hidden = !isHost() || published;
    $('r-invite').hidden = published;
    $('r-slotcard').hidden = published;
    $('r-publish').disabled = !list.length;

    const grid = $('r-slots'); grid.replaceChildren();
    for (let i = 0; i < k; i++) {
      const u = R.slots[i], owner = u && R.parts[u], me = u === store.uid;
      const b = el('button', { type: 'button', className: 'slot' + (me ? ' mine' : '') + (u && !me ? ' taken' : '') });
      b.style.setProperty('--c', colorOf(i));
      b.append(el('b', { textContent: i + 1 }), el('span', { textContent: u ? (owner ? owner.name : '選択済み') : '空き' }));
      b.disabled = published || !mine || (!!u && !me);
      b.onclick = () => pick(i);
      grid.append(b);
    }
    $('r-slotmsg').textContent = !mine ? '先に名前を入れて「参加する」を押してください。'
      : myslot === undefined ? '好きな線を選んでください。選ばなかった場合は、公開時に空いている線へランダムに割り当てられます。'
      : `${myslot + 1}番の線を選びました。変えるときは別の空き線を押してください（もう一度押すと解除）。`;

    if (isHost() && !R.prizesShown && R.prizes) {
      R.prizesShown = true;
      prizeEditor($('r-prizes'), R.prizes, () => { store.set(`${base}/prizes`, JSON.stringify(R.prizes)); });
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
  unsubs.push(store.listen(`${base}/meta`, v => { R.meta = v; refresh(); }, e => { if (/permission/i.test(String((e && (e.code || e.message)) || ''))) expire(); else err(e); }));
  unsubs.push(store.listen(`${base}/participants`, v => { R.parts = v || {}; refresh(); }, err));
  unsubs.push(store.listen(`${base}/slots`, v => {
    R.slots = {};
    Object.entries(v || {}).forEach(([i, u]) => { if (u) R.slots[i] = u; }); // 配列で返る場合に対応
    refresh();
  }, err));
  unsubs.push(store.listen(`${base}/published`, v => { R.pub = v || undefined; refresh(); }, err));
  unsubs.push(store.listen(`${base}/prizes`, v => { R.prizeList = v ? JSON.parse(v) : null; refresh(); }, () => {}));

  $('r-days').value = '';
  $('r-days').onchange = async () => {
    const d = Number($('r-days').value); $('r-days').value = '';
    if (!d) return;
    try { await store.update(`${base}/meta`, { expiresAt: Date.now() + d * 86400000 }); }
    catch (e) { alert('保存期間を変えられませんでした: ' + e.message); }
  };
  $('r-delete').onclick = async () => {
    if (!confirm('このルームを削除します。参加者の名前も結果も消え、元に戻せません。よろしいですか？')) return;
    try { await store.remove(base); forgetRoom(id); location.hash = ''; }
    catch (e) { alert('削除できませんでした: ' + e.message); }
  };
  $('r-copy').onclick = async () => { const ok = await copyText($('r-link').value, $('r-link')); $('r-copy').textContent = ok ? 'コピーしました' : '手動でコピーしてください'; setTimeout(() => { $('r-copy').textContent = 'コピー'; }, 2000); };
  $('r-joinbtn').onclick = async () => {
    const name = $('r-name').value.trim();
    if (!name) { $('r-joinmsg').textContent = '名前を入力してください。'; return; }
    try { await store.set(`${base}/participants/${store.uid}`, { name, at: (R.parts[store.uid] || {}).at || Date.now() }); }
    catch (e) { $('r-joinmsg').textContent = '参加できませんでした: ' + e.message; }
  };
  $('r-publish').onclick = async () => {
    const list = sortedParts();
    if (list.length < R.meta.n && !confirm(`まだ ${R.meta.n - list.length} 人が未入力です。このまま公開しますか？`)) return;
    const k = Math.max(R.meta.k || R.meta.n, R.prizes.length, list.length);
    const prizes = Array.from({ length: k }, (_, i) => (i < R.prizes.length && R.prizes[i].trim() ? R.prizes[i] : 'はずれ'));
    // 自分で選んだ線を優先し、未選択の人には空いている線をランダムに割り当てる
    const colByUid = {}, used = new Set();
    list.forEach(([uid]) => { const s = slotOf(uid); if (s !== undefined && s < k) { colByUid[uid] = s; used.add(s); } });
    const free = shuffle([...Array(k).keys()].filter(i => !used.has(i)));
    list.forEach(([uid]) => { if (colByUid[uid] === undefined) colByUid[uid] = free.pop(); });
    const tops = Array(k).fill(null);
    list.forEach(([uid, p]) => { tops[colByUid[uid]] = p.name; });
    try {
      await store.set(`${base}/published`, { data: JSON.stringify({ tops, prizes, bridges: generateBridges(k), colByUid }), at: Date.now() });
    } catch (e) { alert('公開できませんでした: ' + e.message); }
  };
}

// この端末で記憶しているルームのうち期限切れのものを、データベースからも消す
async function cleanupExpired() {
  for (const r of loadRooms()) {
    if (!r.expiresAt || r.expiresAt >= Date.now()) continue;
    try { await store.remove('rooms/' + r.id); forgetRoom(r.id); } catch { /* 次回また試す */ }
  }
}

// ---- version / update ----------------------------------------------------

const ASSETS = ['./', 'index.html', 'style.css', 'app.js', 'store.js', 'version.js', 'firebase-config.js'];
async function latestVersion() {
  const res = await fetch('version.js?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const m = (await res.text()).match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m) throw new Error('バージョンを読み取れませんでした');
  return m[1];
}
async function reloadFresh() {
  // ブラウザのキャッシュを最新で上書きしてから再読み込みする
  await Promise.all(ASSETS.map(f => fetch(f, { cache: 'reload' }).catch(() => {})));
  location.reload();
}
function setupUpdate() {
  $('ver').textContent = window.APP_VERSION;
  const msg = $('update-msg'), btn = $('update');
  let newer = false;
  btn.onclick = async () => {
    if (newer) { msg.textContent = '更新しています…'; await reloadFresh(); return; }
    btn.disabled = true; msg.textContent = '確認中…';
    try {
      const v = await latestVersion();
      if (v === window.APP_VERSION) msg.textContent = '最新です。';
      else { newer = true; btn.textContent = `${v} に更新`; msg.textContent = `新しいバージョン ${v} があります。`; }
    } catch (e) { msg.textContent = '確認できませんでした: ' + e.message; }
    btn.disabled = false;
  };
  if (location.protocol.startsWith('http')) btn.click(); // 開いたときに自動で確認
}

// ---- routing -------------------------------------------------------------

function route() {
  const h = location.hash;
  const m = h.match(/^#r=([\w-]+)$/);
  $('nav').hidden = !(m || h === '#local');
  if (m) showRoom(m[1]);
  else if (h === '#local') showLocal();
  else showHome();
  window.scrollTo(0, 0);
}

(async function main() {
  try { store = await Store.init(); }
  catch (e) { document.body.prepend(el('p', { className: 'notice', textContent: '共有機能を初期化できませんでした: ' + e.message })); store = null; }
  if (store && store.mode === 'demo') {
    document.querySelector('main').prepend(el('p', { className: 'notice', textContent: 'デモモードです（Firebase 未設定）。共有は同じブラウザ内のタブ同士でのみ動きます。' }));
  }
  if (!store) { $('h-create').disabled = true; }
  addEventListener('hashchange', route);
  new ResizeObserver(() => { localLadder && localLadder.resize(); roomLadder && roomLadder.resize(); }).observe(document.body);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { localLadder && localLadder.redraw(); roomLadder && roomLadder.redraw(); });
  setupUpdate();
  if (store) await cleanupExpired();
  route();
})();
