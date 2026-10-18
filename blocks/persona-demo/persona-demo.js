/**
 * Persona demo block: an interactive B2B persona + region personalization simulator.
 * Rows (first cell is the row type):
 *   persona | key | label | short description
 *   banner  | persona key or "default" | headline | body | CTA link
 *   card    | persona keys (comma separated, or "all") | content type | title | summary
 *   region  | key ("global" is the root fallback) | label | fragment content (blank = use global)
 */
const STORAGE_KEY = 'xsc-demo-persona';

const el = (tag, cls, ...kids) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  kids.flat().forEach((k) => k != null && e.append(k));
  return e;
};
const text = (cell) => (cell ? cell.textContent.trim() : '');

function parse(block) {
  const data = {
    personas: [], banners: {}, cards: [], regions: [],
  };
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const type = text(cells[0]).toLowerCase();
    if (type === 'persona') {
      data.personas.push({ key: text(cells[1]), label: text(cells[2]), desc: text(cells[3]) });
    } else if (type === 'banner') {
      data.banners[text(cells[1]).toLowerCase()] = {
        headline: text(cells[2]), body: text(cells[3]), cta: cells[4]?.querySelector('a'),
      };
    } else if (type === 'card') {
      data.cards.push({
        personas: text(cells[1]).toLowerCase().split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        kind: text(cells[2]),
        title: text(cells[3]),
        summary: text(cells[4]),
      });
    } else if (type === 'region') {
      data.regions.push({
        key: text(cells[1]).toLowerCase(), label: text(cells[2]), content: cells[3],
      });
    }
  });
  return data;
}

export default function decorate(block) {
  const data = parse(block);
  const params = new URLSearchParams(window.location.search);
  const state = {
    persona: params.get('persona') || localStorage.getItem(STORAGE_KEY) || '',
    region: params.get('region') || 'global',
    query: '',
  };
  if (!data.personas.some((p) => p.key === state.persona)) state.persona = '';
  const labelOf = (key) => data.personas.find((p) => p.key === key)?.label || key;
  const matches = (card) => !state.persona
    || card.personas.includes('all') || card.personas.includes(state.persona);

  // controls
  const chips = el('div', 'persona-demo-chips');
  const allPersonas = [{ key: '', label: 'No persona', desc: 'Anonymous first visit: default experience, nothing filtered.' }, ...data.personas];
  allPersonas.forEach((p) => {
    const b = el('button', 'persona-demo-chip', p.label);
    b.type = 'button';
    b.dataset.key = p.key;
    b.title = p.desc;
    chips.append(b);
  });
  const regionSel = el('select', 'persona-demo-region');
  data.regions.forEach((r) => {
    const o = el('option', null, r.label);
    o.value = r.key;
    regionSel.append(o);
  });
  const personaDesc = el('p', 'persona-demo-desc');
  const controls = el(
    'div',
    'persona-demo-controls',
    el('div', 'persona-demo-control', el('span', 'persona-demo-label', 'Visitor profile'), chips),
    data.regions.length ? el('label', 'persona-demo-control persona-demo-region-wrap', el('span', 'persona-demo-label', 'Region'), regionSel) : null,
    personaDesc,
  );

  // stage
  const banner = el('div', 'persona-demo-banner');
  const cardsHead = el('div', 'persona-demo-section-head');
  const cardsGrid = el('ul', 'persona-demo-cards');
  const search = el('input', 'persona-demo-search');
  search.type = 'search';
  search.placeholder = 'Search the content library';
  const resultsHead = el('div', 'persona-demo-section-head');
  const results = el('ol', 'persona-demo-results');
  const fragment = el('div', 'persona-demo-fragment');

  const stage = el(
    'div',
    'persona-demo-stage',
    el('div', 'persona-demo-layer', el('span', 'persona-demo-layer-tag', '1 · Banner + CTA'), banner),
    el('div', 'persona-demo-layer', el('span', 'persona-demo-layer-tag', '2 · Persona-filtered cards'), cardsHead, cardsGrid),
    el('div', 'persona-demo-layer', el('span', 'persona-demo-layer-tag', '2 · Persona-filtered search results'), search, resultsHead, results),
    data.regions.length ? el('div', 'persona-demo-layer', el('span', 'persona-demo-layer-tag', '3 · Region vs. global fragment'), fragment) : null,
  );

  const tagPills = (card) => el(
    'span',
    'persona-demo-tags',
    ...card.personas.map((k) => el('span', 'persona-demo-tag', k === 'all' ? 'All personas' : labelOf(k))),
  );

  function render() {
    chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === state.persona)));
    personaDesc.textContent = allPersonas.find((p) => p.key === state.persona)?.desc || '';
    block.dataset.persona = state.persona || 'none';

    const bn = data.banners[state.persona] || data.banners.default || {};
    const cta = bn.cta ? el('a', 'button primary', bn.cta.textContent) : null;
    if (cta) cta.href = bn.cta.href;
    banner.replaceChildren(
      el('p', 'persona-demo-eyebrow', state.persona ? `Personalized for ${labelOf(state.persona)}` : 'Default experience'),
      el('h3', null, bn.headline || ''),
      el('p', null, bn.body || ''),
      cta ? el('p', 'button-container', cta) : null,
    );

    const shown = data.cards.filter(matches);
    cardsHead.textContent = state.persona
      ? `Showing ${shown.length} of ${data.cards.length} tagged pages for ${labelOf(state.persona)}`
      : `Showing all ${data.cards.length} pages (no persona filter)`;
    cardsGrid.replaceChildren(...shown.slice(0, 6).map((c) => el(
      'li',
      'persona-demo-card',
      el('span', 'persona-demo-kind', c.kind),
      el('strong', null, c.title),
      el('p', null, c.summary),
      tagPills(c),
    )));

    const q = state.query.toLowerCase();
    const hits = data.cards.filter((c) => !q || `${c.title} ${c.summary} ${c.kind}`.toLowerCase().includes(q));
    const ranked = state.persona
      ? [...hits.filter(matches), ...hits.filter((c) => !matches(c))]
      : hits;
    resultsHead.textContent = state.persona
      ? `${ranked.filter(matches).length} results match ${labelOf(state.persona)}; others shown below the line`
      : `${ranked.length} results`;
    results.replaceChildren(...ranked.map((c) => el(
      'li',
      `persona-demo-result${matches(c) ? '' : ' is-muted'}`,
      el('strong', null, c.title),
      el('span', 'persona-demo-kind', c.kind),
      tagPills(c),
    )));

    if (data.regions.length) {
      regionSel.value = state.region;
      const region = data.regions.find((r) => r.key === state.region) || data.regions[0];
      const global = data.regions.find((r) => r.key === 'global') || data.regions[0];
      const own = region.content && region.content.textContent.trim();
      const src = own ? region : global;
      const body = el('div', 'persona-demo-fragment-body');
      body.innerHTML = src.content ? src.content.innerHTML : '';
      fragment.replaceChildren(
        el('p', 'persona-demo-fragment-src', el('code', null, `/fragments/${src.key}/trademarks`), own && region.key !== 'global'
          ? ` regional include for ${region.label}`
          : ` global root include${region.key !== 'global' ? ` (no ${region.label} override)` : ''}`),
        body,
      );
    }
  }

  chips.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state.persona = b.dataset.key;
    if (state.persona) localStorage.setItem(STORAGE_KEY, state.persona);
    else localStorage.removeItem(STORAGE_KEY);
    render();
  });
  regionSel.addEventListener('change', () => { state.region = regionSel.value; render(); });
  search.addEventListener('input', () => { state.query = search.value; render(); });

  block.replaceChildren(controls, stage);
  render();
}
