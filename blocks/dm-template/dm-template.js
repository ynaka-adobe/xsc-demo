/*
 * dm-template: renders images from a Dynamic Media (Scene7) template.
 *
 * Compact authoring (recommended), one row per tile:
 *   | dm-template |                                          |
 *   | CEM/trp-brake-product | line1: TRP Brake Chambers         |
 *   |                       | line2: Installation of ...        |
 *   |                       | discount1: 6  discount2: 25 ...   |
 * The first cell is the product image ($product); the second holds one
 * "name: value" per line. A single pipe-delimited line is also accepted
 * (cards-offers style) and mapped to PIPE_ORDER.
 *
 * Optional setting rows override DEFAULTS:
 *   | Template | CEM/xsc-offer-tile |   | Server | https://s7d9.scene7.com |
 *   | Size | 500x667 |   | Format | png |   | Alt | ... |   | Fallback | trp-offer |
 *   | $expiry | 12.31.2026 |            shared parameter (all tiles)
 *
 * Column authoring is still supported: a row of $names, then one row per tile.
 * Each tile builds: {server}/is/image/{template}?$name=value&...&wid=&hei=&fmt=
 */

import recipeURL from './recipes.js';

const CONFIG_KEYS = ['template', 'server', 'size', 'format', 'alt', 'fallback'];
const DEFAULTS = {
  template: 'CEM/xsc-offer-tile',
  server: 'https://s7d9.scene7.com',
  size: '500x667',
  format: 'png',
  alt: '',
  fallback: 'trp-offer',
  image: 'product',
  order: ['line1', 'discount1', 'expiry'],
};
// cards-offers pipe format: line1 | line2 | discount1 | discount2 | expiry
const PIPE_ORDER = ['line1', 'line2', 'discount1', 'discount2', 'expiry'];
const PAIR = /^\$?([\w-]+)\s*:\s*(.*)$/;

const cellText = (cell) => (cell?.textContent ?? '').trim();
const isParam = (text) => text.startsWith('$') && text.length > 1;
const dimensions = (size) => (size || '').split(/[x,×]/i).map((n) => parseInt(n, 10));

function cellLines(cell) {
  const copy = cell.cloneNode(true);
  copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
  copy.querySelectorAll('p, li').forEach((p) => p.append('\n'));
  return copy.textContent.split('\n').map((line) => line.trim()).filter(Boolean);
}

function cellValues(cell) {
  const lines = cellLines(cell);
  if (lines.length && lines.every((line) => PAIR.test(line))) {
    return Object.fromEntries(lines.map((line) => line.match(PAIR).slice(1, 3)));
  }
  const parts = lines.join(' | ').split('|').map((part) => part.trim());
  return Object.fromEntries(PIPE_ORDER.map((name, i) => [name, parts[i] || '']).filter(([, v]) => v));
}

function parse(block) {
  const config = { ...DEFAULTS };
  const authored = [];
  const shared = {};
  let header = null;
  const tiles = [];

  [...block.children].forEach((row, index) => {
    const cells = [...row.children];
    const texts = cells.map(cellText);
    const key = texts[0].toLowerCase();
    const link = row.querySelector('a[href]');
    if (header) {
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
    } else if (cells.length === 2 && texts[0] && texts[1]) {
      const values = { [DEFAULTS.image]: texts[0], ...cellValues(cells[1]) };
      tiles.push({ values, href: link?.href });
    } else {
      // eslint-disable-next-line no-console
      console.warn(`dm-template: ignoring row ${index + 1} (${texts.join(' | ')})`);
    }
  });

  const compact = !header;
  if (compact) {
    const names = new Set([DEFAULTS.image, ...DEFAULTS.order]);
    tiles.forEach(({ values }) => Object.keys(values).forEach((name) => names.add(name)));
    header = [...names].filter((name) => !(name in shared));
  }
  if (!tiles.length) tiles.push({ values: {} });
  return {
    config, authored, shared, header, tiles, compact,
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

function editable(value, onInput) {
  const span = document.createElement('span');
  span.className = 'dm-template-edit';
  span.contentEditable = 'true';
  span.spellcheck = false;
  span.textContent = value;
  span.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      span.blur();
    }
  });
  span.addEventListener('input', () => onInput(span.textContent.trim()));
  return span;
}

function daTable({
  config, authored, shared, header, tiles, compact,
}, onEdit) {
  const cols = compact ? 2 : Math.max(2, header.length);
  const table = document.createElement('table');
  table.className = 'dm-template-da';
  const body = document.createElement('tbody');
  const tr = (...cells) => {
    const row = document.createElement('tr');
    row.append(...cells);
    body.append(row);
  };
  const td = (content, span = 1) => {
    const cell = document.createElement('td');
    if (span > 1) cell.colSpan = span;
    cell.append(content);
    return cell;
  };
  const key = (text) => {
    const label = document.createElement('span');
    label.className = 'dm-template-key';
    label.textContent = text;
    return label;
  };

  const th = document.createElement('th');
  th.colSpan = cols;
  th.textContent = 'dm-template';
  tr(th);
  CONFIG_KEYS.filter((name) => authored.includes(name)).forEach((name) => {
    tr(td(name.charAt(0).toUpperCase() + name.slice(1)), td(config[name], cols - 1));
  });
  Object.keys(shared).forEach((name) => {
    tr(td(`$${name}`), td(editable(shared[name], (v) => onEdit(null, name, v)), cols - 1));
  });
  if (!compact) {
    tr(...header.map((name) => td(`$${name}`)));
    tiles.forEach(({ values }, i) => tr(...header.map((name) => td(
      editable(values[name] || '', (v) => onEdit(i, name, v)),
    ))));
  } else {
    tiles.forEach(({ values }, i) => {
      const text = document.createElement('td');
      header.filter((name) => name !== DEFAULTS.image).forEach((name) => {
        const line = document.createElement('div');
        line.append(key(`${name}: `), editable(values[name] || '', (v) => onEdit(i, name, v)));
        text.append(line);
      });
      const { image } = DEFAULTS;
      tr(td(editable(values[image] || '', (v) => onEdit(i, image, v))), text);
    });
  }
  table.append(body);
  return table;
}

function playground(block, parsed, list, items, state) {
  const { config, shared, tiles } = parsed;
  const timers = [];
  const refresh = (indexes) => indexes.forEach((i) => {
    clearTimeout(timers[i]);
    timers[i] = setTimeout(() => {
      renderTile(items[i], config, { ...shared, ...tiles[i].values }, tiles[i].href, i, state);
    }, 400);
  });
  const table = daTable(parsed, (i, name, value) => {
    if (i === null) {
      shared[name] = value;
      refresh(tiles.map((_, n) => n));
    } else {
      tiles[i].values[name] = value;
      refresh([i]);
    }
  });
  const hint = document.createElement('p');
  hint.className = 'dm-template-hint';
  hint.textContent = 'Click any value in the table to edit it, the way an author would in DA.';

  block.replaceChildren(
    section('Author view: DA block table', hint, table),
    section('End-user view: live output', list),
  );
}

export default function decorate(block) {
  const parsed = parse(block);
  const { config, shared, tiles } = parsed;
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
