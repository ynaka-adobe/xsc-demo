/*
 * Mock "third-party" email builder (Campaign Classic style delivery editor).
 * It knows nothing about AEM: it embeds the picker in an iframe, receives items via postMessage,
 * and hands the assembled content to a Campaign adapter. Same contract any real app would use.
 */
import apiBase from './config.js';

const SOURCE = 'xsc-asset-picker';
const API = apiBase();
const PICKER = new URL('/tools/asset-picker/picker.html', window.location.href);

const SLOTS = [
  { id: 'header', label: 'Header', hint: 'Experience Fragment', types: ['xf'], multi: false },
  { id: 'hero', label: 'Hero image', hint: 'Asset', types: ['assets'], multi: false },
  { id: 'body', label: 'Body content', hint: 'Content Fragments, Experience Fragments or Assets', types: ['cf', 'xf', 'assets'], multi: true },
  { id: 'footer', label: 'Footer', hint: 'Experience Fragment', types: ['xf'], multi: false },
];

const content = Object.fromEntries(SLOTS.map((s) => [s.id, []]));
let activeSlot = null;
let lastPush = null;

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

function docFor(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;font-family:Arial,sans-serif}img{max-width:100%;height:auto}</style></head><body>${html}</body></html>`;
}

function renderItem(slot, item, index) {
  const wrap = el('div');
  const head = el('div', 'slot-head');
  head.append(el('span', null, `${item.kind.toUpperCase()} · ${item.title}${item.warning ? ' ⚠ not public yet' : ''}`));
  if (item.warning) head.title = item.warning;
  const acts = el('div', 'acts');
  const rm = el('button', null, 'Remove');
  rm.type = 'button';
  rm.addEventListener('click', () => { content[slot.id].splice(index, 1); render(); });
  acts.append(rm);
  head.append(acts);
  const frame = el('iframe', 'render');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.title = item.title;
  // Unpublished assets 404 anonymously, so preview via the picker backend thumbnail instead.
  const preview = item.kind === 'asset' && item.warning
    ? `<img src="${API}/thumb?path=${encodeURIComponent(item.path)}" alt="" style="display:block;width:100%;max-width:600px;height:auto;">`
    : item.html;
  frame.srcdoc = docFor(preview);
  frame.addEventListener('load', () => {
    try { frame.style.height = `${frame.contentDocument.documentElement.scrollHeight + 4}px`; } catch { /* keep default */ }
  });
  wrap.append(head, frame);
  return wrap;
}

function render() {
  const email = $('email');
  email.replaceChildren();
  SLOTS.forEach((slot) => {
    const sec = el('section', 'slot');
    sec.setAttribute('aria-label', slot.label);
    const items = content[slot.id];
    if (!items.length) {
      const head = el('div', 'slot-head');
      head.append(el('span', null, slot.label));
      const acts = el('div', 'acts');
      const add = el('button', 'add', 'Insert from AEM');
      add.type = 'button';
      add.addEventListener('click', () => openPicker(slot));
      acts.append(add);
      head.append(acts);
      sec.append(head, el('div', 'slot-empty', slot.hint));
    } else {
      items.forEach((it, i) => sec.append(renderItem(slot, it, i)));
      if (slot.multi) {
        const head = el('div', 'slot-head');
        head.append(el('span', null, `${slot.label}: add more`));
        const add = el('button', 'add', 'Insert from AEM');
        add.type = 'button';
        add.addEventListener('click', () => openPicker(slot));
        const acts = el('div', 'acts');
        acts.append(add);
        head.append(acts);
        sec.append(head);
      }
    }
    email.append(sec);
  });
  $('p-html').textContent = assemble();
}

function assemble() {
  const rows = SLOTS.flatMap((s) => content[s.id]).map((i) => `    <tr><td>\n${i.html}\n    </td></tr>`);
  if (!rows.length) return '<!-- Insert content from AEM to build the email -->';
  return `<table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">\n${rows.join('\n')}\n</table>`;
}

function openPicker(slot) {
  activeSlot = slot;
  const url = new URL(PICKER);
  url.searchParams.set('origin', window.location.origin);
  url.searchParams.set('types', slot.types.join(','));
  url.searchParams.set('multi', slot.multi ? '1' : '0');
  if (new URLSearchParams(window.location.search).get('api')) url.searchParams.set('api', API);
  $('dlg-title').textContent = `Choose for “${slot.label}” from AEM`;
  $('frame').src = url.href;
  $('dlg').showModal();
}

function closePicker() {
  $('dlg').close();
  $('frame').removeAttribute('src');
  activeSlot = null;
}

window.addEventListener('message', (e) => {
  if (e.origin !== PICKER.origin || e.source !== $('frame').contentWindow) return;
  const m = e.data;
  if (m?.source !== SOURCE) return;
  if (m.type === 'cancel') closePicker();
  if (m.type === 'error') toast(`Picker error: ${m.message}`);
  if (m.type === 'selection' && activeSlot && Array.isArray(m.items)) {
    const slot = activeSlot;
    const items = m.items
      .filter((i) => i && typeof i.html === 'string' && ['asset', 'cf', 'xf'].includes(i.kind))
      .map((i) => ({ kind: i.kind, title: String(i.title || 'Untitled'), path: String(i.path || ''), html: i.html, warning: i.warning ? String(i.warning) : null }));
    if (slot.multi) content[slot.id].push(...items);
    else content[slot.id] = items.slice(0, 1);
    closePicker();
    render();
    toast(`${items.length} item${items.length === 1 ? '' : 's'} added to ${slot.label}`);
  }
});

function showTab(which) {
  const html = which === 'html';
  $('t-html').setAttribute('aria-selected', String(html));
  $('t-camp').setAttribute('aria-selected', String(!html));
  $('p-html').hidden = !html;
  $('p-camp').hidden = html;
}

function renderPush(r) {
  const box = $('p-camp');
  box.replaceChildren();
  const res = el('div', 'result');
  const title = el('strong', null, `Delivery ${r.result.deliveryId} created`);
  title.append(el('span', 'tag', 'simulated'));
  res.append(title, el('div', null, `${r.result.internalName} · ${r.result.state}`));
  res.append(el('div', null, `${r.result.blocks.length} personalization block(s): ${r.result.blocks.map((b) => b.name).join(', ')}`));
  box.append(res, el('p', 'hint', `${r.endpoint}`));
  r.requests.forEach((q) => {
    const d = el('details', 'step');
    d.append(el('summary', null, `${q.step} · ${q.schema}`));
    d.append(el('pre', null, q.soap));
    box.append(d);
  });
}

async function push() {
  const items = SLOTS.flatMap((s) => content[s.id]);
  if (!items.length) { toast('Add some content from AEM first'); return; }
  const btn = $('push');
  btn.disabled = true;
  try {
    const res = await fetch(`${API}/campaign-push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: $('label').value, subject: $('subject').value, items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    lastPush = data;
    renderPush(data);
    showTab('camp');
    toast('Pushed to Campaign (simulated)');
  } catch (e) {
    toast(`Push failed: ${e.message}`);
  }
  btn.disabled = false;
}

$('t-html').addEventListener('click', () => showTab('html'));
$('t-camp').addEventListener('click', () => showTab('camp'));
$('view-desktop').addEventListener('click', () => { $('email').classList.remove('mobile'); $('view-desktop').setAttribute('aria-pressed', 'true'); $('view-mobile').setAttribute('aria-pressed', 'false'); });
$('view-mobile').addEventListener('click', () => { $('email').classList.add('mobile'); $('view-mobile').setAttribute('aria-pressed', 'true'); $('view-desktop').setAttribute('aria-pressed', 'false'); });
$('push').addEventListener('click', push);
$('dlg-close').addEventListener('click', closePicker);
$('dlg').addEventListener('cancel', () => { activeSlot = null; });
render();
