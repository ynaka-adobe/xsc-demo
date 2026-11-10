/**
 * Visitor personalize block: tailors content to the visitor's location and language.
 *
 * Location comes from the edge function's /auth/geo (an IP lookup at the CDN);
 * language and time zone come from the browser. Nothing is stored or sent anywhere.
 *
 * Rows (first cell is the row type; the first matching rule wins, top to bottom):
 *   rule | condition | headline | body | CTA link (optional)
 *
 * Conditions, combined with "&" (all must match):
 *   country: JP      ISO country code(s), comma separated
 *   region: CA       state / province code (as reported by the IP lookup)
 *   continent: EU    two-letter continent code
 *   language: fr     primary browser language
 *   default          always matches (put it last)
 *
 * Tokens usable in headline and body: {city} {region} {country} {language}
 * {greeting} {localTime} {date}
 */

const el = (tag, cls, ...kids) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  kids.flat().forEach((k) => k != null && k !== '' && e.append(k));
  return e;
};
const text = (cell) => (cell ? cell.textContent.trim() : '');
const titleCase = (v) => String(v || '').replace(/\b\p{L}/gu, (c) => c.toUpperCase());

const SIM_COUNTRIES = {
  '': 'Your location',
  US: 'United States',
  CA: 'Canada',
  MX: 'Mexico',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  JP: 'Japan',
  AU: 'Australia',
};
const SIM_CITIES = {
  US: ['New York', 'NY', 'NA'],
  CA: ['Toronto', 'ON', 'NA'],
  MX: ['Mexico City', 'CMX', 'NA'],
  GB: ['London', 'ENG', 'EU'],
  DE: ['Munich', 'BY', 'EU'],
  FR: ['Paris', 'IDF', 'EU'],
  JP: ['Tokyo', '13', 'AS'],
  AU: ['Sydney', 'NSW', 'OC'],
};
const SIM_LANGUAGES = {
  '': 'Your browser',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ja: '日本語',
};

function parseRules(block) {
  return [...block.children].map((row) => {
    const cells = [...row.children];
    if (text(cells[0]).toLowerCase() !== 'rule') return null;
    const condition = text(cells[1]);
    return {
      condition,
      tests: condition.toLowerCase() === 'default' ? [] : condition.split('&').map((part) => {
        const [key, values] = part.split(':').map((s) => s.trim());
        return { key: key.toLowerCase(), values: (values || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean) };
      }),
      headline: text(cells[2]),
      body: text(cells[3]),
      cta: cells[4]?.querySelector('a'),
    };
  }).filter(Boolean);
}

async function lookupNetwork() {
  try {
    const resp = await fetch('/auth/geo', { cache: 'no-store', credentials: 'same-origin' });
    if (!resp.ok) throw new Error(resp.status);
    const geo = await resp.json();
    if (!geo.countryCode) throw new Error('no country');
    return { ...geo, source: 'CDN (IP lookup)' };
  } catch {
    // no edge function here (aem.page, localhost): fall back to the browser's locale
    const [, country = ''] = (navigator.language || '').split('-');
    return { countryCode: country.toUpperCase(), source: 'Browser locale (no edge lookup on this host)' };
  }
}

function buildProfile(network, sim) {
  const lang = (sim.language || navigator.language || 'en').toLowerCase();
  const [primary] = lang.split('-');
  const simCountry = sim.country && SIM_CITIES[sim.country];
  const countryCode = sim.country || network.countryCode || '';
  const country = countryCode
    ? new Intl.DisplayNames([primary, 'en'], { type: 'region' }).of(countryCode)
    : '';
  const languageName = new Intl.DisplayNames([primary, 'en'], { type: 'language' }).of(primary);
  const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
  const now = new Date();
  const hour = now.getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 18) greeting = 'Good afternoon';
  return {
    city: simCountry ? simCountry[0] : titleCase(network.city),
    region: simCountry ? simCountry[1] : network.region || '',
    continent: simCountry ? simCountry[2] : network.continent || '',
    countryCode,
    country,
    language: primary,
    languageName,
    locale: lang,
    timeZone,
    greeting,
    localTime: now.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }),
    date: now.toLocaleDateString(lang, { weekday: 'long', month: 'long', day: 'numeric' }),
    source: simCountry ? 'Simulated' : network.source,
    simulated: !!(sim.country || sim.language),
  };
}

function matches(rule, p) {
  const actual = {
    country: p.countryCode, region: p.region, continent: p.continent, language: p.language,
  };
  return rule.tests.every(({ key, values }) => values.includes(String(actual[key] || '').toLowerCase()));
}

function fill(template, p) {
  return template.replace(/\{(\w+)\}/g, (m, key) => (p[key] != null && p[key] !== '' ? p[key] : m))
    // drop a dangling separator when a token was empty, e.g. "in {city}, {country}"
    .replace(/\{\w+\},?\s?/g, '');
}

function renderExperience(rule, p) {
  const card = el('div', 'visitor-personalize-experience');
  card.lang = p.language;
  card.append(el('p', 'visitor-personalize-eyebrow', [p.city, p.country].filter(Boolean).join(', ') || 'Welcome'));
  card.append(el('h2', null, fill(rule.headline, p)));
  if (rule.body) card.append(el('p', null, fill(rule.body, p)));
  if (rule.cta) {
    const a = rule.cta.cloneNode(true);
    a.className = 'button';
    card.append(el('p', 'button-container', a));
  }
  return card;
}

function renderProfile(rule, p) {
  const rows = [
    ['City', [p.city, p.region].filter(Boolean).join(', ')],
    ['Country', p.country ? `${p.country} (${p.countryCode})` : ''],
    ['Language', `${p.languageName} (${p.locale})`],
    ['Local time', `${p.localTime} · ${p.timeZone}`],
    ['Location source', p.source],
    ['Matched rule', rule.condition],
  ];
  const dl = el('dl', 'visitor-personalize-facts');
  rows.forEach(([k, v]) => dl.append(el('div', null, el('dt', null, k), el('dd', null, v || '—'))));
  return el('aside', 'visitor-personalize-profile', el('h3', null, 'Why you are seeing this'), dl);
}

function select(label, options, value, onChange) {
  const s = el('select');
  Object.entries(options).forEach(([v, name]) => {
    const o = el('option', null, name);
    o.value = v;
    o.selected = v === value;
    s.append(o);
  });
  s.addEventListener('change', () => onChange(s.value));
  return el('label', null, el('span', null, label), s);
}

export default async function decorate(block) {
  const rules = parseRules(block);
  block.textContent = '';
  const params = new URLSearchParams(window.location.search);
  const sim = { country: (params.get('country') || '').toUpperCase(), language: params.get('lang') || '' };
  if (!SIM_COUNTRIES[sim.country]) sim.country = '';
  if (!SIM_LANGUAGES[sim.language]) sim.language = '';

  const stage = el('div', 'visitor-personalize-stage');
  const controls = el('div', 'visitor-personalize-controls');
  block.append(controls, stage);
  stage.append(el('p', 'visitor-personalize-loading', 'Reading your visitor profile…'));

  const network = await lookupNetwork();

  const render = () => {
    const p = buildProfile(network, sim);
    const rule = rules.find((r) => matches(r, p)) || rules[rules.length - 1];
    stage.replaceChildren(
      rule ? renderExperience(rule, p) : el('p', null, 'No rules authored.'),
      rule ? renderProfile(rule, p) : '',
    );
    const url = new URL(window.location.href);
    ['country', 'lang'].forEach((k) => url.searchParams.delete(k));
    if (sim.country) url.searchParams.set('country', sim.country);
    if (sim.language) url.searchParams.set('lang', sim.language);
    window.history.replaceState(null, '', url);
  };

  const reset = el('button', 'visitor-personalize-reset', 'Reset to my profile');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    sim.country = '';
    sim.language = '';
    controls.querySelectorAll('select').forEach((s) => { s.value = ''; });
    render();
  });
  controls.append(
    el('span', 'visitor-personalize-label', 'Simulate a visitor'),
    select('Country', SIM_COUNTRIES, sim.country, (v) => { sim.country = v; render(); }),
    select('Language', SIM_LANGUAGES, sim.language, (v) => { sim.language = v; render(); }),
    reset,
  );
  render();
}
