'use strict';
// 共有ルーム用のデータ層。Firebase Realtime Database、または設定が無いときの
// localStorage 製デモ（同一ブラウザのタブ間のみ）を同じインターフェースで提供する。
//   store.uid / store.mode
//   store.set(path, v) / update(path, obj) / remove(path)
//   store.listen(path, cb, errCb) -> 解除関数
const Store = (() => {
  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed to load ' + src));
    document.head.append(s);
  });

  async function firebaseStore(cfg) {
    const v = '10.12.2', base = `https://www.gstatic.com/firebasejs/${v}/`;
    for (const f of ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-database-compat.js']) {
      await loadScript(base + f);
    }
    firebase.initializeApp(cfg);
    const cred = await firebase.auth().signInAnonymously();
    const db = firebase.database();
    return {
      mode: 'firebase',
      uid: cred.user.uid,
      set: (p, v) => db.ref(p).set(v),
      update: (p, v) => db.ref(p).update(v),
      remove: p => db.ref(p).remove(),
      listen(p, cb, errCb) {
        const r = db.ref(p);
        const h = r.on('value', s => cb(s.val()), e => errCb && errCb(e));
        return () => r.off('value', h);
      },
    };
  }

  function demoStore() {
    const KEY = 'amida-demo-db';
    let uid = sessionStorage.getItem('amida-demo-uid');
    if (!uid) { uid = 'u' + Math.random().toString(36).slice(2, 10); sessionStorage.setItem('amida-demo-uid', uid); }
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
    const parts = p => p.split('/').filter(Boolean);
    const get = (tree, p) => parts(p).reduce((o, k) => (o == null ? o : o[k]), tree) ?? null;
    const put = (p, v) => {
      const tree = read(), ks = parts(p);
      let o = tree;
      ks.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
      if (v === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v;
      localStorage.setItem(KEY, JSON.stringify(tree));
      notify();
    };
    const ls = new Set();
    const notify = () => ls.forEach(l => {
      const val = JSON.stringify(get(read(), l.path));
      if (val !== l.last) { l.last = val; l.cb(JSON.parse(val)); }
    });
    addEventListener('storage', e => e.key === KEY && notify());
    return {
      mode: 'demo', uid,
      set: async (p, v) => put(p, v),
      update: async (p, o) => { for (const k in o) put(p + '/' + k, o[k]); },
      remove: async p => put(p, null),
      listen(path, cb) {
        const l = { path, cb, last: undefined };
        ls.add(l);
        Promise.resolve().then(() => { if (ls.has(l)) { l.last = JSON.stringify(get(read(), path)); cb(JSON.parse(l.last)); } });
        return () => ls.delete(l);
      },
    };
  }

  return { init: () => (window.FIREBASE_CONFIG ? firebaseStore(window.FIREBASE_CONFIG) : Promise.resolve(demoStore())) };
})();
