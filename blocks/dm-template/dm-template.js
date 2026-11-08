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
  return { config, shared, tiles };
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

export default function decorate(block) {
  const { config, shared, tiles } = parse(block);
  if (!config.template) {
    // eslint-disable-next-line no-console
    console.error('dm-template: a "Template" row (company/template) is required.');
    return;
  }
  const [wid, hei] = dimensions(config.size);

  const list = document.createElement('ul');
  tiles.forEach(({ values, href }, index) => {
    const params = { ...shared, ...values };
    const url = buildURL(config, params);
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = url;
    img.alt = config.alt || Object.values(values)[0] || config.template;
    img.loading = index < 3 ? 'eager' : 'lazy';
    if (wid) img.width = wid;
    if (hei) img.height = hei;
    const source = document.createElement('a');
    img.addEventListener('error', function onError() {
      const recipe = recipeURL(config.fallback, config.server, params);
      if (recipe && img.src !== recipe) {
        // eslint-disable-next-line no-console
        console.info(`dm-template: template unavailable, using "${config.fallback}" layered recipe for tile ${index + 1}.`);
        img.src = recipe;
        source.href = recipe;
        return;
      }
      img.removeEventListener('error', onError);
      // eslint-disable-next-line no-console
      console.error(`dm-template: Dynamic Media could not render tile ${index + 1}: ${img.src}`);
      img.replaceWith(fallback(params));
    });

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
    li.append(media, source);
    list.append(li);
  });

  block.classList.toggle('dm-template-single', tiles.length === 1);
  block.replaceChildren(list);
}
