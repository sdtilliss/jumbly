/* Test double for the claude.ai artifact `room` capability, following its published contract:
   presence patches merge per field (null removes), onPeers delivers frozen snapshots at most once
   per frame with you included, named rooms via join(). Both tabs count as the same signed-in
   viewer (isMe is true for every peer; sameTab only for this document), as when one person opens two tabs. */
(() => {
  const me = Math.random().toString(36).slice(2, 12);
  function space(name) {
    const bc = new BroadcastChannel('mockroom:' + name), peers = new Map(), handlers = new Set();
    let mine = {}, timer = 0, prev = new Map(), gone = false;
    const snap = () => {
      const list = [Object.freeze({ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...mine }), updatedAt: Date.now() })];
      for (const [id, p] of peers) list.push(p.frozen);
      return Object.freeze(list);
    };
    let current = snap();
    const flush = () => {
      timer = 0;
      if (gone) return;
      current = snap();
      const now = new Map(current.map(p => [p.peer, p]));
      const joined = [], left = [], updated = [];
      for (const [id, p] of now) { if (!prev.has(id)) joined.push(p); else if (JSON.stringify(prev.get(id).presence) !== JSON.stringify(p.presence)) updated.push(p); }
      for (const [id, p] of prev) if (!now.has(id)) left.push(p);
      prev = now;
      const change = { peers: current, joined, left, updated };
      for (const h of [...handlers]) h(change);
    };
    const dirty = () => { if (!timer) timer = setTimeout(flush, 16); };
    const say = m => { try { bc.postMessage(m); } catch (e) {} };
    bc.onmessage = ev => {
      const m = ev.data;
      if (!m || m.peer === me) return;
      if (m.t === 'hello') { say({ t: 'p', peer: me, presence: mine }); return; }
      if (m.t === 'bye') peers.delete(m.peer);
      else peers.set(m.peer, { frozen: Object.freeze({ peer: m.peer, by: null, isMe: true, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(m.presence), updatedAt: Date.now() }) });
      dirty();
    };
    addEventListener('pagehide', () => say({ t: 'bye', peer: me }));
    say({ t: 'hello', peer: me });
    setTimeout(() => say({ t: 'p', peer: me, presence: mine }), 30);
    return {
      name,
      async emit() {}, on() { return () => {}; },
      async presence(patch) {
        if (gone) throw { code: 'invalid_argument' };
        const next = { ...mine };
        for (const [k, v] of Object.entries(patch)) { if (v === null) delete next[k]; else next[k] = JSON.parse(JSON.stringify(v)); }
        if (new TextEncoder().encode(JSON.stringify(next)).length > 4096) throw { code: 'invalid_argument', message: 'presence over 4 KiB' };
        mine = next;
        setTimeout(() => say({ t: 'p', peer: me, presence: mine }), 33);   // coalesced send
        dirty();
      },
      peers: () => current,
      onPeers(h) { handlers.add(h); prev = new Map(); dirty(); return () => handlers.delete(h); },
      connected: () => !gone,
      onConnection(h) { setTimeout(() => h(true), 0); return () => {}; },
      async leave() { gone = true; handlers.clear(); say({ t: 'bye', peer: me }); bc.close(); }
    };
  }
  const lobby = space('lobby'), rooms = new Map();
  const room = Object.freeze({ ...lobby, leave: undefined, async join(name) {
    if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) throw { code: 'invalid_argument' };
    if (!rooms.has(name) || !rooms.get(name).connected()) rooms.set(name, Object.freeze(space(name)));
    return rooms.get(name);
  } });
  window.claude = { use: name => new Promise(r => setTimeout(() => r(name === 'room' ? room : null), 120)) };
})();
