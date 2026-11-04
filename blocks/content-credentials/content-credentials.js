/*
 * Content Credentials block
 * Shows images or videos with a "CR" pin that reveals their C2PA provenance,
 * read in the browser with the CAI SDK (@contentauth/c2pa-web).
 *
 * Authoring: one row per asset.
 *   Column 1: link to the media to display. An optional second link is the
 *             asset to read credentials from (e.g. the original), if different.
 *   Column 2: optional caption.
 */

const SDK_VERSION = '0.15.6';
const SDK_BASE = `https://cdn.jsdelivr.net/npm/@contentauth/c2pa-web@${SDK_VERSION}`;
const VERIFY_URL = 'https://contentcredentials.org/verify';
const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|$)/i;

const AI_SOURCE_TYPES = {
  trainedAlgorithmicMedia: 'Created using generative AI',
  compositeWithTrainedAlgorithmicMedia: 'Edited using generative AI',
  algorithmicMedia: 'Created by an algorithm',
};

const ACTION_LABELS = {
  'c2pa.created': 'Created',
  'c2pa.opened': 'Opened',
  'c2pa.edited': 'Edited',
  'c2pa.placed': 'Placed content',
  'c2pa.resized': 'Resized',
  'c2pa.cropped': 'Cropped',
  'c2pa.color_adjustments': 'Adjusted color',
  'c2pa.converted': 'Converted',
  'c2pa.published': 'Published',
};

let sdkPromise;

/* -------------------------------------------------------------------------- */
/* SDK                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Loads the CAI web SDK once per page.
 * @returns {Promise<{c2pa: object, Reader: object}>}
 */
function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = import(`${SDK_BASE}/+esm`).then(async ({ createC2pa, Reader }) => ({
      c2pa: await createC2pa({ wasmSrc: `${SDK_BASE}/dist/resources/c2pa_bg.wasm` }),
      Reader,
    }));
  }
  return sdkPromise;
}

/**
 * Reads the manifest store of a remote asset.
 * @param {string} url Asset URL (must allow CORS)
 * @returns {Promise<object|null>} Manifest store, or null when the asset has none
 */
async function readManifestStore(url) {
  const { c2pa, Reader } = await loadSdk();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const blob = await resp.blob();
  const reader = await Reader.fromBlob(c2pa, blob.type, blob);
  if (!reader) return null;
  try {
    return await reader.manifestStore();
  } finally {
    await reader.free();
  }
}

/* -------------------------------------------------------------------------- */
/* Manifest summary                                                           */
/* -------------------------------------------------------------------------- */

function agentName(agent) {
  if (!agent) return '';
  return typeof agent === 'string' ? agent : agent.name || '';
}

function actionsOf(manifest) {
  return (manifest?.assertions || [])
    .filter((a) => a.label.startsWith('c2pa.actions'))
    .flatMap((a) => a.data?.actions || []);
}

function appOf(manifest) {
  const info = manifest?.claim_generator_info?.[0];
  if (info?.name) return [info.name, info.version].filter(Boolean).join(' ').trim();
  return manifest?.claim_generator || '';
}

/**
 * Condenses a manifest store into what a viewer needs to see.
 * @param {object} store C2PA manifest store
 * @returns {object} Summary
 */
export function summarise(store) {
  const manifests = store.manifests || {};
  const active = manifests[store.active_manifest] || {};
  const all = Object.values(manifests);

  const ai = new Map();
  all.flatMap(actionsOf).forEach((action) => {
    const type = (action.digitalSourceType || '').split('/').pop();
    if (AI_SOURCE_TYPES[type]) {
      const tool = agentName(action.softwareAgent);
      const key = `${type}|${tool}`;
      if (!ai.has(key)) ai.set(key, { type, label: AI_SOURCE_TYPES[type], tool });
    }
  });
  const disclosures = [...ai.values()]
    .filter((a) => a.tool || ![...ai.values()].some((b) => b.type === a.type && b.tool));

  return {
    valid: store.validation_state || '',
    issuer: active.signature_info?.issuer || '',
    time: active.signature_info?.time || '',
    app: appOf(active),
    ai: disclosures,
    actions: actionsOf(active).map((a) => ({
      label: ACTION_LABELS[a.action] || a.action.replace(/^c2pa\./, ''),
      tool: agentName(a.softwareAgent),
    })),
    ingredients: (active.ingredients || []).map((i) => ({
      title: i.title || 'Untitled ingredient',
      signed: Boolean(i.active_manifest),
    })),
    history: all.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  });
  children.flat().filter((c) => c !== null && c !== undefined && c !== '').forEach((c) => {
    node.append(c instanceof Node ? c : document.createTextNode(c));
  });
  return node;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function row(label, value) {
  if (!value) return null;
  return el('div', { class: 'cc-row' }, el('dt', {}, label), el('dd', {}, value));
}

function list(title, items) {
  if (!items.length) return null;
  return el(
    'div',
    { class: 'cc-section' },
    el('h4', {}, title),
    el('ul', {}, items.map(([main, extra]) => el('li', {}, main, extra ? el('span', {}, ` · ${extra}`) : ''))),
  );
}

function renderPanel(summary, source) {
  const verify = `${VERIFY_URL}?source=${encodeURIComponent(source)}`;
  const state = summary.valid || 'Unknown';
  return el(
    'div',
    { class: 'cc-panel', role: 'dialog', 'aria-label': 'Content Credentials' },
    el(
      'div',
      { class: 'cc-panel-head' },
      el('strong', {}, 'Content Credentials'),
      el('span', { class: `cc-state cc-state-${state.toLowerCase()}` }, state),
    ),
    el(
      'dl',
      {},
      row('Issued by', summary.issuer),
      row('Signed', formatDate(summary.time)),
      row('App or device', summary.app),
    ),
    list('AI disclosure', summary.ai.map((a) => [a.label, a.tool])),
    list('Actions', summary.actions.map((a) => [a.label, a.tool])),
    list('Ingredients', summary.ingredients.map((i) => [i.title, i.signed ? 'has credentials' : ''])),
    el(
      'p',
      { class: 'cc-foot' },
      `${summary.history} manifest${summary.history === 1 ? '' : 's'} in history · `,
      el('a', { href: verify, target: '_blank', rel: 'noopener' }, 'Inspect'),
    ),
  );
}

function renderMedia(url, caption) {
  if (VIDEO_EXT.test(url)) {
    const video = el('video', {
      src: url, controls: '', loop: '', playsinline: '', preload: 'metadata', 'aria-label': caption || 'Video',
    });
    video.muted = true;
    return video;
  }
  return el('img', { src: url, alt: caption || '', loading: 'lazy' });
}

async function attachCredentials(figure, source) {
  const media = figure.querySelector('.cc-media');
  const pin = el('button', { class: 'cc-pin cc-pin-loading', type: 'button', 'aria-label': 'Checking Content Credentials' }, 'CR');
  media.append(pin);

  let store;
  try {
    store = await readManifestStore(source);
  } catch (e) {
    pin.remove();
    figure.append(el('p', { class: 'cc-status cc-status-error' }, `Could not read credentials (${e.message}).`));
    return;
  }

  if (!store) {
    pin.className = 'cc-pin cc-pin-none';
    pin.setAttribute('aria-label', 'No Content Credentials');
    pin.disabled = true;
    figure.append(el('p', { class: 'cc-status cc-status-none' }, 'No Content Credentials found on this file.'));
    return;
  }

  const summary = summarise(store);
  const panel = renderPanel(summary, source);
  panel.hidden = true;
  media.append(panel);

  pin.className = 'cc-pin';
  pin.setAttribute('aria-label', 'Show Content Credentials');
  pin.setAttribute('aria-expanded', 'false');
  pin.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    pin.setAttribute('aria-expanded', String(!panel.hidden));
  });

  const status = summary.ai.length ? summary.ai[0].label : 'Content Credentials present';
  const issuer = (summary.issuer || 'an unknown issuer').replace(/\.$/, '');
  figure.append(el('p', { class: 'cc-status cc-status-ok' }, `${status}. Signed by ${issuer}.`));
}

export default function decorate(block) {
  const items = [...block.children].map((r) => {
    const [mediaCell, captionCell] = r.children;
    const links = [...(mediaCell?.querySelectorAll('a') || [])].map((a) => a.href);
    const text = mediaCell?.textContent.trim() || '';
    const display = links[0] || (text.startsWith('http') ? text : '');
    return { display, source: links[1] || display, caption: captionCell?.textContent.trim() || '' };
  }).filter((i) => i.display);

  const figures = items.map(({ display, source, caption }) => el(
    'figure',
    { class: 'cc-item', 'data-source': source },
    el('div', { class: 'cc-media' }, renderMedia(display, caption)),
    caption ? el('figcaption', {}, caption) : null,
  ));

  block.replaceChildren(...figures);

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      observer.disconnect();
      figures.forEach((f) => attachCredentials(f, f.dataset.source));
    }
  }, { rootMargin: '200px' });
  observer.observe(block);
}
