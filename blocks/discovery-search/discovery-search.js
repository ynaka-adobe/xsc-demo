const SURESMILE = 'https://suresmile.ynaka-adobe.com';

function text(cell) {
  return cell?.textContent.trim() || '';
}

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function landingUrl(path, audience) {
  const url = new URL(path, SURESMILE);
  url.searchParams.set('demo_audience', audience);
  url.searchParams.set('demo_source', 'seo');
  return url.toString();
}

function resultItem({ org, title, description, href, image, featured }) {
  const item = el('li', `discovery-search-result${featured ? ' featured' : ''}`);
  const main = el('div', 'discovery-search-main');
  const site = el('div', 'discovery-search-site');
  site.append(el('span', 'discovery-search-favicon', org.charAt(0)), el('span', null, org));
  const heading = el('h3');
  const link = el('a', null, title);
  link.href = href;
  if (!featured) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  heading.append(link);
  main.append(site, heading, el('p', null, description));
  item.append(main);
  const img = image?.querySelector('img');
  if (img) {
    const thumb = el('div', 'discovery-search-thumb');
    thumb.append(img.cloneNode());
    item.append(thumb);
  }
  return item;
}

/**
 * Google-style simulated search results. One audience is shown at a time (?audience=implants).
 * Rows (first cell is the label): back | audience | featured | result.
 *  audience: id, label, query, AI overview text, landing path on the SureSmile site.
 *  featured: organization, title, description, (unused link cell), image.
 *  result: organization, title, description, link.
 */
export default function decorate(block) {
  const rows = [...block.children].map((row) => {
    const cells = [...row.children];
    return { kind: text(cells[0]).toLowerCase(), cells: cells.slice(1) };
  });
  const audiences = rows.filter((row) => row.kind === 'audience');
  const wanted = (new URLSearchParams(window.location.search).get('audience') || '').toLowerCase();
  const chosen = audiences.find((row) => text(row.cells[0]).toLowerCase() === wanted)
    || audiences[0];
  if (!chosen) return;
  const [id, , query, overview, landing] = chosen.cells;
  const audience = text(id).toLowerCase();
  const href = landingUrl(text(landing) || '/en-us/', audience);
  const back = rows.find((row) => row.kind === 'back')?.cells[0]?.querySelector('a');

  const shell = el('div', 'discovery-search-shell');
  const top = el('div', 'discovery-search-top');
  top.append(el('span', 'discovery-search-logo', 'Search'), el('div', 'discovery-search-box', text(query)));
  if (back) {
    const link = el('a', 'discovery-search-back', back.textContent);
    link.href = back.getAttribute('href');
    top.append(link);
  }
  const tabs = el('div', 'discovery-search-tabs');
  ['All', 'Images', 'Videos', 'News', 'More'].forEach((label, index) => {
    tabs.append(el('span', index === 0 ? 'active' : null, label));
  });
  const ai = el('div', 'discovery-search-ai');
  ai.append(el('div', 'discovery-search-ai-label', 'AI Overview'), el('p', null, text(overview)));
  const list = el('ol', 'discovery-search-results');
  rows.filter((row) => row.kind === 'featured').forEach((row) => {
    const [org, title, description, , image] = row.cells;
    list.append(resultItem({
      org: text(org), title: text(title), description: text(description), href, image, featured: true,
    }));
  });
  rows.filter((row) => row.kind === 'result').forEach((row) => {
    const [org, title, description, link] = row.cells;
    list.append(resultItem({
      org: text(org),
      title: text(title),
      description: text(description),
      href: link?.querySelector('a')?.href || '#',
    }));
  });
  shell.append(top, tabs, ai, list);
  shell.append(el('p', 'discovery-search-note', 'Illustrative simulation only. Not a live search result. No Google endorsement.'));
  block.replaceChildren(shell);
}
