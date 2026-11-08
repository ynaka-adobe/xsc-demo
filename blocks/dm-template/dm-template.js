/*
 * dm-template: renders images from a Dynamic Media (Scene7) template.
 *
 * Authoring (one block table):
 *   | Template | CEM/xsc-offer-tile |          required, company/template
 *   | Server   | https://s7d9.scene7.com |     optional
 *   | Size     | 500x667 |                     optional, output wid x hei
 *   | Format   | png |                         optional, fmt=
 *   | Fallback | trp-offer |                   optional layered recipe used until
 *                                               the template is published (recipes.js)
 *   | $expiry  | 12.31.2026 |                  shared parameter (all tiles)
 *   | $line1 | $line2 | $discount1 | ... |     header row: parameter names
 *   | TRP Brake | Brake Chambers | 6 | ... |   one row per tile
 *
 * Without a header row the shared parameters render a single image.
 * Each tile builds: {server}/is/image/{template}?$name=value&...&wid=&hei=&fmt=
 */

import recipeURL from './recipes.js';

const CONFIG_KEYS = ['template', 'server', 'size', 'format', 'alt', 'fallback'];
const DEFAULT_SERVER = 'https://s7d9.scene7.com';

const cellText = (cell) => (cell?.textContent ?? '').trim();
const isParam = (text) => text.startsWith('$') && text.length > 1;
const dimensions = (size) => (size || '').split(/[x,×]/i).map((n) => parseInt(n, 10));

function parse(block) {
  const config = {
    template: '', server: DEFAULT_SERVER, size: '', format: 'png', alt: '', fallback: '',
  };
  const authored = [];
  const shared = {};
  let header = null;
  const tiles = [];

  [...block.children].forEach((row, index) => {
    const cells = [...row.children];
    const texts = cells.map(cellText);
    const key = texts[0].toLowerCase();
    if (header) {
      const link = row.querySelector('a[href]');
      const values = {};
      header.forEach((name, i) => {
        const text = cells[i] ? cellText(cells[i]) : '';
        const isLinkOnly = link && cells[i]?.contains(link) && text === link.textContent.trim();
        if (text && !isLinkOnly) values[name] = text;
      });
      tiles.push({ values, href: link?.href });
    } else if (cells.length === 2 && CONFIG_KEYS.includes(key)) {
      [, config[key]] = texts;
      authored.push(key);
    } else if (cells.length === 2 && isParam(texts[0]) && !isParam(texts[1])) {
      [, shared[texts[0].slice(1)]] = texts;
    } else if (texts.length > 1 && texts.every(isParam)) {
      header = texts.map((t) => t.slice(1));
    } else {
      // eslint-disable-next-line no-console
      console.warn(`dm-template: ignoring row ${index + 1} (${texts.join(' | ')})`);
    }
  });

  if (!tiles.length) tiles.push({ values: {} });
  return {
    config, authored, shared, header: header || [], tiles,
  };
}

export function buildURL(config, params) {
  const server = config.server.replace(/\/+$/, '');
  const template = config.template.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
  const query = Object.entries(params)
    .filter(([, value]) => value !== '')
    .map(([name, value]) => `$${encodeURIComponent(name)}=${encodeURIComponent(value)}`);
  const [wid, hei] = dimensions(config.size);
  if (wid) query.push(`wid=${wid}`);
  if (hei) query.push(`hei=${hei}`);
  if (config.format) query.push(`fmt=${encodeURIComponent(config.format)}`);
  return `${server}/is/image/${template}${query.length ? `?${query.join('&')}` : ''}`;
}

function fallback(params) {
  const box = document.createElement('div');
  box.className = 'dm-template-fallback';
  const dl = document.createElement('dl');
  Object.entries(params).forEach(([name, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = `$${name}`;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  });
  box.append(dl);
  return box;
}

function renderTile(li, config, params, href, index, state) {
  const [wid, hei] = dimensions(config.size);
  const recipe = () => recipeURL(config.fallback, config.server, params);
  const direct = state.templateMissing && recipe();
  const url = direct || buildURL(config, params);
  const img = document.createElement('img');
  const source = document.createElement('a');
  img.alt = config.alt || Object.values(params).find(Boolean) || config.template;
  img.loading = index < 3 ? 'eager' : 'lazy';
  if (wid) img.width = wid;
  if (hei) img.height = hei;
  let usedRecipe = Boolean(direct);
  img.addEventListener('error', function onError() {
    const alt = !usedRecipe && recipe();
    if (alt) {
      // eslint-disable-next-line no-console
      console.info(`dm-template: template unavailable, using "${config.fallback}" layered recipe for tile ${index + 1}.`);
      state.templateMissing = true;
      usedRecipe = true;
      img.src = alt;
      source.href = alt;
      return;
    }
    img.removeEventListener('error', onError);
    // eslint-disable-next-line no-console
    console.error(`dm-template: Dynamic Media could not render tile ${index + 1}: ${img.src}`);
    img.replaceWith(fallback(params));
  });
  img.src = url;

  let media = img;
  if (href) {
    media = document.createElement('a');
    media.href = href;
    media.append(img);
  }
  source.className = 'dm-template-url';
  source.href = url;
  source.target = '_blank';
  source.rel = 'noopener';
  source.textContent = 'View Dynamic Media URL';
  li.replaceChildren(media, source);
}

function section(title, ...content) {
  const wrap = document.createElement('section');
  wrap.className = 'dm-template-step';
  const h = document.createElement('h3');
  h.textContent = title;
  wrap.append(h, ...content);
  return wrap;
}

function daTable(config, authored, shared, header) {
  const cols = Math.max(2, header.length);
  const table = document.createElement('table');
  table.className = 'dm-template-da';
  const body = document.createElement('tbody');
  const row = (texts, isHead = false) => {
    const tr = document.createElement('tr');
    const cells = texts.map((text, i) => {
      const td = document.createElement(isHead ? 'th' : 'td');
      td.textContent = text;
      if (i === texts.length - 1 && texts.length < cols) td.colSpan = cols - texts.length + 1;
      return td;
    });
    tr.append(...cells);
    body.append(tr);
    return cells;
  };
  row(['dm-template (playground)'], true);
  CONFIG_KEYS.filter((key) => authored.includes(key)).forEach((key) => {
    row([key.charAt(0).toUpperCase() + key.slice(1), config[key]]);
  });
  const sharedCells = {};
  Object.entries(shared).forEach(([name, value]) => {
    [, sharedCells[name]] = row([`$${name}`, value]);
  });
  if (header.length) row(header.map((name) => `$${name}`));
  table.append(body);
  return { table, sharedCells, addTile: (values) => row(header.map((name) => values[name] || '')) };
}

function field(name, value, onInput) {
  const label = document.createElement('label');
  const span = document.createElement('span');
  span.textContent = `$${name}`;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.name = name;
  input.addEventListener('input', () => onInput(input.value));
  label.append(span, input);
  return label;
}

function fieldset(title, ...fields) {
  const set = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = title;
  set.append(legend, ...fields);
  return set;
}

function playground(block, {
  config, authored, shared, header, tiles,
}, list, items, state) {
  const { table, sharedCells, addTile } = daTable(config, authored, shared, header);
  const tileCells = tiles.map(({ values }) => addTile(values));
  const timers = [];
  const refresh = (indexes) => indexes.forEach((i) => {
    clearTimeout(timers[i]);
    timers[i] = setTimeout(() => {
      renderTile(items[i], config, { ...shared, ...tiles[i].values }, tiles[i].href, i, state);
    }, 400);
  });
  const all = tiles.map((_, i) => i);

  const form = document.createElement('form');
  form.className = 'dm-template-form';
  form.addEventListener('submit', (event) => event.preventDefault());
  if (Object.keys(shared).length) {
    const sharedSet = fieldset('All tiles', ...Object.keys(shared).map((name) => field(name, shared[name], (value) => {
      shared[name] = value;
      sharedCells[name].textContent = value;
      refresh(all);
    })));
    sharedSet.className = 'dm-template-shared';
    form.append(sharedSet);
  }
  tiles.forEach((tile, i) => {
    form.append(fieldset(`Tile ${i + 1}`, ...header.map((name, col) => field(name, tile.values[name] || '', (value) => {
      tile.values[name] = value;
      tileCells[i][col].textContent = value;
      refresh([i]);
    }))));
  });

  block.replaceChildren(
    section('1. Edit the offer', form),
    section('2. DA block table (updates as you type)', table),
    section('3. Dynamic Media output', list),
  );
}

export default function decorate(block) {
  const parsed = parse(block);
  const { config, shared, tiles } = parsed;
  if (!config.template) {
    // eslint-disable-next-line no-console
    console.error('dm-template: a "Template" row (company/template) is required.');
    return;
  }
  const state = { templateMissing: false };
  const list = document.createElement('ul');
  list.className = 'dm-template-output';
  const items = tiles.map(({ values, href }, index) => {
    const li = document.createElement('li');
    renderTile(li, config, { ...shared, ...values }, href, index, state);
    list.append(li);
    return li;
  });

  block.classList.toggle('dm-template-single', tiles.length === 1);
  if (block.classList.contains('playground')) playground(block, parsed, list, items, state);
  else block.replaceChildren(list);
}
