/**
 * Visitor personalize block: tailors content to the visitor's country and city.
 *
 * Location comes from the edge function's /auth/geo (an IP lookup at the CDN);
 * the time zone comes from the browser. Nothing is stored or sent anywhere.
 * Copy stays in the page's language, so translated pages keep working.
 *
 * Rows (first cell is the row type; the first matching rule wins, top to bottom):
 *   rule | condition | headline | body | CTA link (optional)
 *
 * Conditions, combined with "&" (all must match):
 *   city: San Francisco   city name(s), comma separated
 *   country: JP           ISO country code(s), comma separated
 *   region: CA            state / province code (as reported by the IP lookup)
 *   continent: EU         two-letter continent code
 *   default               always matches (put it last)
 *
 * Tokens usable in headline and body: {city} {region} {country}
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

// presenter simulator: city, region, country code, continent, time zone
const SIM_LOCATIONS = {
  'san-francisco': ['San Francisco', 'CA', 'US', 'NA', 'America/Los_Angeles'],
  'new-york': ['New York', 'NY', 'US', 'NA', 'America/New_York'],
  chicago: ['Chicago', 'IL', 'US', 'NA', 'America/Chicago'],
  toronto: ['Toronto', 'ON', 'CA', 'NA', 'America/Toronto'],
  'mexico-city': ['Mexico City', 'CMX', 'MX', 'NA', 'America/Mexico_City'],
  london: ['London', 'ENG', 'GB', 'EU', 'Europe/London'],
  munich: ['Munich', 'BY', 'DE', 'EU', 'Europe/Berlin'],
  paris: ['Paris', 'IDF', 'FR', 'EU', 'Europe/Paris'],
  tokyo: ['Tokyo', '', 'JP', 'AS', 'Asia/Tokyo'],
  sydney: ['Sydney', 'NSW', 'AU', 'OC', 'Australia/Sydney'],
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
    // no edge function on this host (aem.page, localhost)
    return { countryCode: '', source: 'Unavailable on this host' };
  }
}

const LOCALE = document.documentElement.lang || 'en';

function buildProfile(network, simKey) {
  const sim = SIM_LOCATIONS[simKey];
  const countryCode = sim ? sim[2] : network.countryCode || '';
  const country = countryCode
    ? new Intl.DisplayNames([LOCALE, 'en'], { type: 'region' }).of(countryCode)
    : '';
  const timeZone = sim ? sim[4] : Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 18) greeting = 'Good afternoon';
  return {
    city: sim ? sim[0] : titleCase(network.city),
    region: sim ? sim[1] : network.region || '',
    continent: sim ? sim[3] : network.continent || '',
    countryCode,
    country,
    timeZone,
    greeting,
    localTime: now.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit', timeZone }),
    date: now.toLocaleDateString(LOCALE, {
      weekday: 'long', month: 'long', day: 'numeric', timeZone,
    }),
    source: sim ? 'Simulated' : network.source,
  };
}

function matches(rule, p) {
  const actual = {
    city: p.city, country: p.countryCode, region: p.region, continent: p.continent,
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
    ['Local time', `${p.localTime} · ${p.timeZone}`],
    ['Location source', p.source],
    ['Matched rule', rule.condition],
  ];
  const dl = el('dl', 'visitor-personalize-facts');
  rows.forEach(([k, v]) => dl.append(el('div', null, el('dt', null, k), el('dd', null, v || '—'))));
  return el('aside', 'visitor-personalize-profile', el('h3', null, 'Why you are seeing this'), dl);
}

function locationSelect(value, onChange) {
  const s = el('select');
  const options = [['', 'My location'], ...Object.entries(SIM_LOCATIONS)
    .map(([key, [city, , cc]]) => [key, `${city}, ${cc}`])];
  options.forEach(([v, name]) => {
    const o = el('option', null, name);
    o.value = v;
    o.selected = v === value;
    s.append(o);
  });
  s.addEventListener('change', () => onChange(s.value));
  return el('label', null, el('span', null, 'Location'), s);
}

export default async function decorate(block) {
  const rules = parseRules(block);
  block.textContent = '';
  const params = new URLSearchParams(window.location.search);
  let simKey = params.get('location') || '';
  if (!SIM_LOCATIONS[simKey]) simKey = '';

  const stage = el('div', 'visitor-personalize-stage');
  const controls = el('div', 'visitor-personalize-controls');
  block.append(controls, stage);
  stage.append(el('p', 'visitor-personalize-loading', 'Reading your visitor profile…'));

  const network = await lookupNetwork();

  const render = () => {
    const p = buildProfile(network, simKey);
    const rule = rules.find((r) => matches(r, p)) || rules[rules.length - 1];
    stage.replaceChildren(
      rule ? renderExperience(rule, p) : el('p', null, 'No rules authored.'),
      rule ? renderProfile(rule, p) : '',
    );
    const url = new URL(window.location.href);
    url.searchParams.delete('location');
    if (simKey) url.searchParams.set('location', simKey);
    window.history.replaceState(null, '', url);
  };

  const reset = el('button', 'visitor-personalize-reset', 'Reset to my profile');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    simKey = '';
    controls.querySelector('select').value = '';
    render();
  });
  controls.append(
    el('span', 'visitor-personalize-label', 'Simulate a visitor'),
    locationSelect(simKey, (v) => { simKey = v; render(); }),
    reset,
  );
  render();
}
