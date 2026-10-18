/**
 * Live in-context analytics panel (ported from ynaka-adobe/3m).
 *
 * A slide-over surface that visualises the event stream as it happens — block
 * impressions, CTA clicks, downloads, scroll depth and form engagement — with
 * no Adobe backend involved. Everything shown is computed client-side from the
 * events already on `window.xscDataLayer`.
 *
 * This is a *consumer*, not a second instrumentation path: it subscribes to the
 * same data layer the AppMeasurement transport reads, so what you see in the
 * panel is exactly what is being sent.
 *
 * ── Who sees it ───────────────────────────────────────────────────────────
 * Never a normal visitor. Signed-in employees open it from the account menu
 * ("Show live analytics"). The open state is remembered for the rest of the
 * browser tab (sessionStorage) so a presenter can navigate around with it open.
 */

import { subscribe } from './analytics.js';
import { INVISIBLE_TRAFFIC_SHARE, observeSignals, assessBot } from './signals.js';
import { onIdentity, observeIdentity } from './identity.js';

const STORAGE_KEY = 'xsc-insights';
const FEED_LIMIT = 60;

/* Event → display category. Keeps the summary honest: every counted event
   belongs to exactly one bucket, and the buckets are named after what the
   visitor actually did. */
const CATEGORIES = {
  page: 'Page',
  componentImpression: 'Impressions',
  ctaClick: 'Engagement',
  download: 'Downloads',
  scrollMilestone: 'Scroll',
  formStart: 'Form',
  formSubmit: 'Form',
};

/* Data layer event → the Adobe Analytics hit it becomes (see analytics.js). */
const HITS = {
  page: 's.t()',
  componentImpression: 'event1',
  ctaClick: 'event2',
  download: 'event3',
  formStart: 'event4',
  formSubmit: 'event5',
  scrollMilestone: 'event6',
};

const state = {
  events: [],
  blocks: new Map(), // block id → { name, variants, impressions, engagements }
  links: new Map(), // text|url → { text, url, type, count }
  scroll: 0,
  categories: new Map(),
  page: null,
  identity: null,
  // `<details>` open state must survive the panel's full re-render on each event
  open: { identity: true, signals: false },
};

let refs = null;
let renderQueued = false;
let signalsTimer = 0;

/* ───────────────────────────── enablement ──────────────────────────────── */

const remember = (open) => {
  try {
    if (open) sessionStorage.setItem(STORAGE_KEY, '1');
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable
  }
};

export function wasOpen() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/* ──────────────────────────── aggregation ──────────────────────────────── */

function labelFor(entry) {
  if (entry.file) return entry.file;
  if (entry.link?.text) return entry.link.text;
  if (entry.form?.name) return entry.form.name;
  if (entry.scroll) return `${entry.scroll.depth}% of page`;
  if (entry.component?.id) return entry.component.id;
  return entry.page?.path || '';
}

function record(entry) {
  const { event } = entry;
  const category = CATEGORIES[event] || 'Other';

  if (event === 'page') state.page = entry.page;

  state.events.unshift({
    event,
    hit: HITS[event] || '',
    category,
    label: labelFor(entry),
    block: entry.component?.id || null,
    time: new Date(entry.time || Date.now()),
  });
  if (state.events.length > FEED_LIMIT) state.events.length = FEED_LIMIT;

  state.categories.set(category, (state.categories.get(category) || 0) + 1);

  const { component } = entry;
  if (component?.id) {
    const row = state.blocks.get(component.id) || {
      name: component.blockName,
      impressions: 0,
      engagements: 0,
    };
    if (event === 'componentImpression') row.impressions += 1;
    // anything the visitor actively did inside the block counts as engagement
    else row.engagements += 1;
    state.blocks.set(component.id, row);
  }

  if (event === 'ctaClick' || event === 'download') {
    const url = entry.link?.url || '';
    const text = labelFor(entry);
    const key = `${text}|${url}`;
    const row = state.links.get(key) || {
      text,
      url,
      type: event === 'download' ? 'download' : 'cta',
      count: 0,
    };
    row.count += 1;
    state.links.set(key, row);
  }

  if (event === 'scrollMilestone' && entry.scroll?.depth > state.scroll) {
    state.scroll = entry.scroll.depth;
  }
}

/**
 * Derived observations. Deliberately simple and literal — each one is a direct
 * readout of the counters above, so it can be explained to an analyst without
 * hand-waving. No benchmarks, no invented baselines, no projections.
 */
function insights() {
  const out = [];
  const blocks = [...state.blocks.entries()];

  const viewed = blocks.filter(([, b]) => b.impressions > 0);
  if (viewed.length) {
    const [id, top] = viewed.reduce((a, b) => (b[1].impressions > a[1].impressions ? b : a));
    out.push({
      label: 'Most-viewed component',
      value: id,
      note: `${top.impressions} impression${top.impressions === 1 ? '' : 's'} this session`,
    });
  }

  const links = [...state.links.values()];
  if (links.length) {
    const top = links.reduce((a, b) => (b.count > a.count ? b : a));
    out.push({
      label: 'Most-clicked link',
      value: top.text,
      note: `${top.count} click${top.count === 1 ? '' : 's'} · ${top.type}`,
    });
  }

  // The genuinely useful content signal: seen, but never acted on.
  const dormant = viewed.filter(([, b]) => b.engagements === 0).map(([id]) => id);
  if (dormant.length) {
    out.push({
      label: 'Viewed but not engaged',
      value: `${dormant.length} component${dormant.length === 1 ? '' : 's'}`,
      note: dormant.slice(0, 4).join(', ') + (dormant.length > 4 ? '…' : ''),
    });
  }

  out.push({
    label: 'Deepest scroll',
    value: state.scroll ? `${state.scroll}%` : 'Not yet measured',
    note: state.scroll ? 'Milestones fire at 25 / 50 / 75 / 100%' : 'Scroll the page to record milestones',
  });

  return out;
}

/* ─────────────────────────────── rendering ─────────────────────────────── */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderStat(label, value) {
  const row = el('div', 'insights-stat');
  row.append(el('span', 'insights-stat-value', String(value)));
  row.append(el('span', 'insights-stat-label', label));
  return row;
}

function renderBars(rows, valueOf, labelOf, noteOf) {
  const list = el('ul', 'insights-bars');
  const max = rows.reduce((m, r) => Math.max(m, valueOf(r)), 0) || 1;
  rows.forEach((r) => {
    const item = el('li');
    const head = el('div', 'insights-bar-head');
    head.append(el('span', 'insights-bar-label', labelOf(r)));
    head.append(el('span', 'insights-bar-count', String(valueOf(r))));
    item.append(head);
    const track = el('div', 'insights-bar-track');
    const fill = el('span', 'insights-bar-fill');
    fill.style.width = `${Math.round((valueOf(r) / max) * 100)}%`;
    track.append(fill);
    item.append(track);
    const note = noteOf?.(r);
    if (note) item.append(el('div', 'insights-bar-note', note));
    list.append(item);
  });
  return list;
}

function renderEmpty(message) {
  return el('p', 'insights-empty', message);
}

/* ───────────────────────── roadmap preview: signals ────────────────────── */

/**
 * Builds a provenance chip. Every roadmap figure gets one so a presenter can
 * always point at whether a number is really being measured here or is a
 * reference figure standing in for a capability that is not yet GA.
 * @param {'measured'|'illustrative'} kind
 */
function provenance(kind) {
  const measured = kind === 'measured';
  const chip = el('span', `insights-prov insights-prov-${kind}`);
  chip.textContent = measured ? 'Measured in this browser' : 'Illustrative — not measured';
  return chip;
}

/* ─────────────────────────── real-time identity ────────────────────────── */

/**
 * The first-party profile built from a submitted form. Deliberately shows the
 * real submitted values — the point is to watch an identity form in real time —
 * while making its handling explicit, because this is the one card on the panel
 * that holds personal data.
 */
function renderIdentity() {
  const section = el('details', 'insights-section insights-signals insights-identity');
  section.open = state.open.identity;
  section.addEventListener('toggle', () => { state.open.identity = section.open; });

  const summary = el('summary', 'insights-heading insights-signals-summary');
  summary.append(el('span', null, 'Identity'));
  summary.append(el(
    'span',
    `insights-badge ${state.identity ? 'insights-badge-live' : ''}`.trim(),
    state.identity ? 'Captured' : 'Awaiting',
  ));
  section.append(summary);

  if (!state.identity) {
    section.append(el(
      'p',
      'insights-disclaimer',
      'A first-party profile appears here the moment a visitor submits a form '
      + 'on this page — the form block or a Marketo form.',
    ));
    section.append(renderEmpty('No identity captured yet — submit a form to see this update live.'));
    return section;
  }

  const { fields, source, at } = state.identity;
  const head = el('div', 'insights-roadmap-stat');
  head.append(el('span', 'insights-stat-value', String(fields.length)));
  head.append(el('span', 'insights-stat-label', `attributes captured from ${source}`));
  head.append(el('span', 'insights-note', `Submitted at ${at.toLocaleTimeString()}`));
  head.append(provenance('measured'));
  section.append(head);

  const dl = el('dl', 'insights-observations insights-identity-fields');
  fields.forEach((f) => {
    const row = el('div');
    const dt = el('dt', null, f.label);
    if (f.sensitive) dt.append(el('span', 'insights-pii', 'PII'));
    row.append(dt);
    const dd = el('dd');
    dd.append(el('strong', null, f.value));
    row.append(dd);
    dl.append(row);
  });
  section.append(dl);

  section.append(el(
    'p',
    'insights-disclaimer',
    'Held in memory for this page only — never written to storage, and never '
    + 'pushed to the data layer, because everything on the data layer is '
    + 'forwarded to Adobe. The event that reaches Analytics is formSubmit '
    + '(event5) with the form name only, carrying no field values.',
  ));

  return section;
}

function renderSignals() {
  const section = el('details', 'insights-section insights-signals');
  section.open = state.open.signals;
  section.addEventListener('toggle', () => { state.open.signals = section.open; });

  const summary = el('summary', 'insights-heading insights-signals-summary');
  summary.append(el('span', null, 'Signals'));
  summary.append(el('span', 'insights-badge', 'Roadmap preview'));
  section.append(summary);

  section.append(el(
    'p',
    'insights-disclaimer',
    'Illustrates two Adobe Customer Journey Analytics capabilities that are not '
    + 'generally available: Enhanced Bot Detection (beta, GA Q1 2027) and CDN Log '
    + 'Ingestion (CJA only, GA Q1 2027). This panel is a simplified stand-in — it '
    + 'calls no Adobe service and is not Adobe\u2019s scoring model.',
  ));

  // ── bot assessment (genuinely computed here)
  const bot = assessBot();
  const head = el('div', 'insights-signal-head');
  // Keyed off the score, not the label, so rewording a verdict cannot silently
  // change the colour.
  const gauge = el('div', `insights-gauge insights-gauge-${bot.score < 30 ? 'ok' : 'warn'}`);
  gauge.append(el('span', 'insights-gauge-value', String(bot.score)));
  gauge.append(el('span', 'insights-gauge-scale', '/ 100'));
  head.append(gauge);
  const headText = el('div', 'insights-signal-headtext');
  headText.append(el('strong', null, bot.verdict));
  headText.append(el('span', 'insights-note', `Confidence: ${bot.confidence} · ${bot.checked} checks evaluated`));
  headText.append(provenance('measured'));
  head.append(headText);
  section.append(head);

  const reasons = el('ul', 'insights-reasons');
  if (bot.reasons.length) {
    bot.reasons.forEach((r) => reasons.append(el('li', null, r)));
  } else {
    reasons.append(el('li', 'insights-reason-clear', 'No automation indicators triggered'));
  }
  section.append(reasons);

  // ── invisible traffic (reference figure)
  const invisible = el('div', 'insights-roadmap-stat');
  invisible.append(el('span', 'insights-stat-value', `${INVISIBLE_TRAFFIC_SHARE}%`));
  invisible.append(el('span', 'insights-stat-label', 'Invisible traffic estimate'));
  invisible.append(el(
    'span',
    'insights-note',
    'Bots, AI agents and non-consented visits that never reach Web SDK. CDN Log '
    + 'Ingestion surfaces these by ingesting Akamai/Cloudflare logs and '
    + 'de-duplicating against Web SDK data.',
  ));
  invisible.append(provenance('illustrative'));
  section.append(invisible);

  return section;
}

/** What the page view carries — the visit-level context eVars. */
function renderContext() {
  const section = el('section', 'insights-section');
  section.append(el('h3', 'insights-heading', 'Page context'));
  const p = state.page;
  if (!p) {
    section.append(renderEmpty('Page view not sent yet (fires about 3 seconds after load).'));
    return section;
  }
  const rows = [
    ['Access tier', 'eVar15', p.accessTier],
    ['Access code alias', 'eVar16', p.accessCode || '—'],
    ['Demo ID', 'eVar17', p.demoId],
    ['Template', 'eVar1', p.template],
    ['Tracking code', 'v0', new URLSearchParams(window.location.search).get('cid') || '—'],
  ];
  const dl = el('dl', 'insights-observations');
  rows.forEach(([label, variable, value]) => {
    const row = el('div');
    row.append(el('dt', null, label));
    const dd = el('dd');
    dd.append(el('strong', null, value));
    dd.append(el('span', 'insights-note', variable));
    row.append(dd);
    dl.append(row);
  });
  section.append(dl);
  return section;
}

function render() {
  renderQueued = false;
  if (!refs) return;

  // the panel re-renders wholesale, so keep the reader where they were
  const { scrollTop } = refs.body;
  const total = state.events.length;
  refs.count.textContent = String(total);

  if (!total) {
    refs.body.replaceChildren(renderEmpty('Scroll the page or click a link to start the stream.'));
    return;
  }

  const body = document.createDocumentFragment();

  // ── summary stats
  const stats = el('div', 'insights-stats');
  stats.append(renderStat('Events', total));
  stats.append(renderStat('Components seen', [...state.blocks.values()].filter((b) => b.impressions).length));
  stats.append(renderStat('Links clicked', [...state.links.values()].reduce((s, r) => s + r.count, 0)));
  stats.append(renderStat('Scroll', state.scroll ? `${state.scroll}%` : '—'));
  body.append(stats);
  body.append(renderContext());

  // ── identity (above Observations: the profile frames everything below it)
  body.append(renderIdentity());

  // ── insights
  const insightSection = el('section', 'insights-section');
  insightSection.append(el('h3', 'insights-heading', 'Observations'));
  const dl = el('dl', 'insights-observations');
  insights().forEach((o) => {
    const row = el('div');
    row.append(el('dt', null, o.label));
    const dd = el('dd');
    dd.append(el('strong', null, o.value));
    if (o.note) dd.append(el('span', 'insights-note', o.note));
    row.append(dd);
    dl.append(row);
  });
  insightSection.append(dl);
  body.append(insightSection);

  // ── roadmap preview: bot signals
  body.append(renderSignals());

  // ── components
  const blockRows = [...state.blocks.entries()]
    .map(([id, b]) => ({ id, ...b }))
    .filter((b) => b.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions);
  const blockSection = el('section', 'insights-section');
  blockSection.append(el('h3', 'insights-heading', 'Component impressions'));
  blockSection.append(blockRows.length
    ? renderBars(
      blockRows,
      (r) => r.impressions,
      (r) => r.id,
      (r) => (r.engagements ? `${r.engagements} interaction${r.engagements === 1 ? '' : 's'}` : ''),
    )
    : renderEmpty('No components in view yet.'));
  body.append(blockSection);

  // ── links
  const linkRows = [...state.links.values()].sort((a, b) => b.count - a.count);
  const linkSection = el('section', 'insights-section');
  linkSection.append(el('h3', 'insights-heading', 'Links clicked'));
  linkSection.append(linkRows.length
    ? renderBars(linkRows, (r) => r.count, (r) => r.text, (r) => `${r.type} · ${r.url}`)
    : renderEmpty('No clicks yet.'));
  body.append(linkSection);

  // ── categories
  const catRows = [...state.categories.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const catSection = el('section', 'insights-section');
  catSection.append(el('h3', 'insights-heading', 'Events by category'));
  catSection.append(renderBars(catRows, (r) => r.count, (r) => r.name));
  body.append(catSection);

  // ── live feed
  const feedSection = el('section', 'insights-section');
  feedSection.append(el('h3', 'insights-heading', 'Live event feed'));
  const feed = el('ol', 'insights-feed');
  state.events.forEach((e) => {
    const item = el('li');
    item.append(el('span', 'insights-feed-event', e.hit ? `${e.event} · ${e.hit}` : e.event));
    item.append(el('span', 'insights-feed-label', e.label));
    item.append(el('time', 'insights-feed-time', e.time.toLocaleTimeString()));
    feed.append(item);
  });
  feedSection.append(feed);
  body.append(feedSection);

  refs.body.replaceChildren(body);
  refs.body.scrollTop = scrollTop;
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(render);
}

/* ──────────────────────────────── panel ────────────────────────────────── */

function setOpen(open) {
  refs.panel.classList.toggle('insights-open', open);
  refs.panel.setAttribute('aria-hidden', String(!open));
  remember(open);
  document.dispatchEvent(new CustomEvent('xsc:insights', { detail: { open } }));
  // The bot assessment is time-sensitive (it watches for pointer movement and
  // interaction cadence), but the panel otherwise only redraws when an event
  // arrives — so it would sit frozen on a quiet page. Tick while open only.
  window.clearInterval(signalsTimer);
  if (open) {
    render();
    signalsTimer = window.setInterval(scheduleRender, 2000);
  }
}

function build() {
  const panel = el('aside', 'insights-panel');
  panel.setAttribute('aria-label', 'Live analytics insights');
  panel.setAttribute('aria-hidden', 'true');

  const header = el('header', 'insights-header');
  const title = el('div', 'insights-title');
  title.append(el('span', 'insights-eyebrow', 'Live analytics'));
  title.append(el('h2', null, 'This session'));
  header.append(title);

  const count = el('span', 'insights-count', '0');
  count.title = 'Events captured this session';
  header.append(count);

  const close = el('button', 'insights-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close analytics panel');
  close.textContent = '\u00d7';
  header.append(close);
  panel.append(header);

  const body = el('div', 'insights-body');
  panel.append(body);

  const footer = el('footer', 'insights-footer');
  footer.textContent = 'Computed in the browser from window.xscDataLayer — the same events sent to Adobe Analytics.';
  panel.append(footer);

  document.body.append(panel);
  refs = { panel, body, count };

  close.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('insights-open')) setOpen(false);
  });
}

let mounting = null;

async function mount() {
  if (refs) return;
  if (!mounting) {
    mounting = (async () => {
      const { loadCSS } = await import('./aem.js');
      await loadCSS(`${window.hlx.codeBasePath}/styles/insights.css`);
      // start passive signal observation as early as the panel exists, so the bot
      // assessment has real interaction history by the time it is first opened
      observeSignals();
      // identity capture is independent of the data layer — personal data must
      // not travel on the channel that forwards to Adobe (see identity.js)
      observeIdentity();
      build();
      subscribe((entry) => {
        record(entry);
        scheduleRender();
      });
      onIdentity((profile) => {
        state.identity = profile;
        scheduleRender();
      });
    })();
  }
  await mounting;
}

export const isOpen = () => !!refs?.panel.classList.contains('insights-open');

/** Opens or closes the panel, mounting it on first use. Called from the account menu. */
export async function toggleInsights(open = !isOpen()) {
  if (open) await mount();
  if (refs) setOpen(open);
}
