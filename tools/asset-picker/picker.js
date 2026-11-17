/*
 * XSC custom AEM picker. Embeddable via iframe; talks to the host app with postMessage.
 *
 * URL params:  origin=<host origin>  types=assets,cf,xf  multi=1|0  api=<backend base>
 * Picker -> host: {source:'xsc-asset-picker', version:1, type:'ready'|'selection'|'cancel'|'error', ...}
 * Host -> picker: {target:'xsc-asset-picker', type:'configure', types:[...], multi:boolean}
 * Messages are only ever sent to the validated `origin` (never '*') and only accepted from the parent window.
 */
import apiBase from './config.js';

const SOURCE = 'xsc-asset-picker';
const TABS = {
  assets: { label: 'Assets', glyph: '🖼', root: '/content/dam' },
  cf: { label: 'Content Fragments', glyph: '📄', root: '/content/dam' },
  xf: { label: 'Experience Fragments', glyph: '🧩', root: '/content/experience-fragments' },
};

const params = new URLSearchParams(window.location.search);
const API = apiBase();
const embedded = window.parent !== window;

function hostOrigin() {
  const candidates = [params.get('origin'), document.referrer];
  for (const c of candidates) {
    try {
      const u = new URL(c);
      if (u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') return u.origin;
    } catch { /* try next */ }
  }
  return null;
}
const HOST = embedded ? hostOrigin() : null;

const state = {
  types: (params.get('types') || 'assets,cf,xf').split(',').filter((t) => TABS[t]),
  multi: params.get('multi') !== '0',
  tab: null,
  paths: {},
  q: '',
  result: null,
  items: [],
  folders: [],
  selected: new Map(),
  loading: false,
};
if (!state.types.length) state.types = Object.keys(TABS);
state.tab = state.types[0];

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function post(msg) {
  if (embedded && HOST) window.parent.postMessage({ source: SOURCE, version: 1, ...msg }, HOST);
}

async function call(name, query, body) {
  const url = new URL(`${API}/${name}`);
  Object.entries(query || {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && url.searchParams.set(k, v));
  const res = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const keyOf = (i) => `${i.kind}:${i.id}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '');

function renderTabs() {
  const tabs = $('tabs');
  tabs.replaceChildren();
  state.types.forEach((t) => {
    const b = el('button', 'tab', TABS[t].label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(t === state.tab));
    b.addEventListener('click', () => { state.tab = t; state.q = ''; $('q').value = ''; load(); });
    tabs.append(b);
  });
}

function renderCrumbs() {
  const nav = $('crumbs');
  nav.replaceChildren();
  if (state.tab === 'cf' || state.tab === 'xf') {
    nav.append(el('span', null, state.tab === 'cf' ? 'Content fragments under ' : 'Experience fragments under '));
  }
  const root = TABS[state.tab].root;
  const path = state.paths[state.tab] || root;
  const parts = path.split('/').filter(Boolean);
  const rootParts = root.split('/').filter(Boolean);
  let acc = '';
  parts.forEach((p, i) => {
    acc += `/${p}`;
    if (i < rootParts.length - 1) return;
    const target = acc;
    if (i > rootParts.length - 1) nav.append(el('span', null, '›'));
    const b = el('button', null, i === rootParts.length - 1 ? 'Home' : decodeURIComponent(p));
    b.type = 'button';
    b.addEventListener('click', () => { state.paths[state.tab] = target; load(); });
    nav.append(b);
  });
  if (state.q) nav.append(el('span', null, `· search “${state.q}”`));
}

function thumbFor(item) {
  const t = el('div', 'thumb');
  if (item.kind === 'asset') {
    t.style.backgroundImage = `url("${API}/thumb?path=${encodeURIComponent(item.path)}")`;
    t.setAttribute('role', 'img');
    t.setAttribute('aria-label', item.title);
  } else {
    t.classList.add('glyph');
    t.textContent = TABS[item.kind === 'cf' ? 'cf' : 'xf'].glyph;
  }
  return t;
}

function card(item) {
  const b = el('div', 'card');
  b.setAttribute('role', 'button');
  b.tabIndex = 0;
  b.setAttribute('aria-pressed', String(state.selected.has(keyOf(item))));
  b.append(thumbFor(item), el('div', 'tick', '✓'));
  const meta = el('div', 'meta');
  meta.append(el('div', 't', item.title));
  if (item.kind === 'asset') meta.append(el('div', 's', [item.mime, item.width && `${item.width}×${item.height}`].filter(Boolean).join(' · ')));
  if (item.kind === 'cf') {
    meta.append(el('div', 's', item.snippet || item.description || item.path));
    const row = el('div', 's');
    row.append(el('span', `badge${item.status === 'PUBLISHED' ? ' pub' : ''}`, `${item.model || 'Fragment'} · ${item.status || 'draft'}`));
    meta.append(row);
  }
  if (item.kind === 'xf') meta.append(el('div', 's', item.description || item.path.replace('/content/experience-fragments/', '')));
  b.append(meta);
  b.addEventListener('click', () => toggle(item));
  b.addEventListener('keydown', (e) => {
    if (e.target === b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(item); }
  });
  if (item.kind === 'xf' && item.variations.length > 1) {
    const v = el('div', 'variants');
    const sel = el('select');
    sel.setAttribute('aria-label', `Variation of ${item.title}`);
    item.variations.forEach((vr) => { const o = el('option', null, vr.name); o.value = vr.path; sel.append(o); });
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('keydown', (e) => e.stopPropagation());
    sel.addEventListener('change', () => { item.chosenVariation = sel.value; });
    v.append(sel);
    b.append(v);
  }
  return b;
}

function render() {
  renderTabs();
  renderCrumbs();
  const body = $('body');
  body.replaceChildren();
  if (state.error) { body.append(el('div', 'error', state.error)); return; }
  if (state.loading && !state.items.length && !state.folders.length) { body.append(el('div', 'empty', 'Loading…')); return; }
  if (state.folders.length) {
    body.append(el('div', 'section-title', 'Folders'));
    const g = el('div', 'grid');
    state.folders.forEach((f) => {
      const b = el('button', 'card folder');
      b.type = 'button';
      b.append(el('span', 'glyph', '📁'), el('span', 't', f.title));
      b.addEventListener('click', () => { state.paths[state.tab] = f.path; state.q = ''; $('q').value = ''; load(); });
      g.append(b);
    });
    body.append(g);
  }
  if (state.items.length) {
    body.append(el('div', 'section-title', TABS[state.tab].label));
    const g = el('div', 'grid');
    state.items.forEach((i) => g.append(card(i)));
    body.append(g);
  }
  if (!state.items.length && !state.folders.length) body.append(el('div', 'empty', 'Nothing here. Try another folder or search.'));
  if (state.result?.more) {
    const m = el('button', 'more', 'Load more');
    m.type = 'button';
    m.addEventListener('click', () => load(true));
    body.append(m);
  }
  renderFooter();
}

function renderFooter() {
  const n = state.selected.size;
  $('sel').textContent = n ? `${n} selected: ${[...state.selected.values()].map((i) => i.title).slice(0, 3).join(', ')}${n > 3 ? '…' : ''}` : 'Nothing selected';
  const c = $('confirm');
  c.disabled = !n;
  c.textContent = n > 1 ? `Select ${n}` : 'Select';
}

function toggle(item) {
  const k = keyOf(item);
  if (state.selected.has(k)) state.selected.delete(k);
  else {
    if (!state.multi) state.selected.clear();
    state.selected.set(k, item);
  }
  render();
}

async function load(more = false) {
  state.loading = true;
  state.error = null;
  if (!more) { state.items = []; state.folders = []; }
  render();
  const kind = state.tab;
  const query = { kind, path: state.paths[kind] || TABS[kind].root, q: state.q, limit: 40 };
  if (more && state.result) {
    if (state.result.cursor) query.cursor = state.result.cursor;
    else query.offset = state.items.length;
  }
  try {
    const r = await call('browse', query);
    state.result = r;
    state.paths[kind] = r.path;
    state.items = more ? state.items.concat(r.items) : r.items;
    state.folders = more ? state.folders : r.folders;
  } catch (e) {
    state.error = `Could not load ${TABS[kind].label.toLowerCase()}: ${e.message}`;
  }
  state.loading = false;
  render();
}

async function confirm() {
  const btn = $('confirm');
  btn.disabled = true;
  btn.textContent = 'Preparing…';
  try {
    const items = await Promise.all([...state.selected.values()].map(async (i) => {
      const r = await call('resolve', {
        kind: i.kind,
        id: i.kind === 'cf' ? i.id : undefined,
        path: i.kind === 'cf' ? undefined : i.path,
        variation: i.chosenVariation,
      });
      return r;
    }));
    const msg = { type: 'selection', items };
    if (embedded) post(msg);
    else showStandalone(msg);
  } catch (e) {
    post({ type: 'error', message: e.message });
    state.error = `Could not prepare selection: ${e.message}`;
    render();
  }
  renderFooter();
}

function showStandalone(msg) {
  const out = $('out');
  out.hidden = false;
  out.textContent = JSON.stringify(msg, null, 2);
}

function init() {
  $('env').textContent = 'demo-sandbox-prod';
  $('search').addEventListener('submit', (e) => { e.preventDefault(); state.q = $('q').value.trim(); load(); });
  $('confirm').addEventListener('click', confirm);
  $('cancel').addEventListener('click', () => { post({ type: 'cancel' }); state.selected.clear(); render(); });
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || e.origin !== HOST || e.data?.target !== SOURCE) return;
    if (e.data.type === 'configure') {
      if (Array.isArray(e.data.types)) {
        const t = e.data.types.filter((x) => TABS[x]);
        if (t.length) { state.types = t; state.tab = t.includes(state.tab) ? state.tab : t[0]; }
      }
      if (typeof e.data.multi === 'boolean') state.multi = e.data.multi;
      state.selected.clear();
      load();
    }
  });
  if (embedded && !HOST) state.error = 'Host origin is missing. Pass ?origin=https://your-app.example when embedding.';
  load().then(() => post({ type: 'ready', types: state.types }));
}

init();
