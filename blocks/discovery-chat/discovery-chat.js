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

/** The SureSmile landing page for an audience, tagged so SureSmile analytics knows the channel. */
export function landingUrl(path, audience, source) {
  const url = new URL(path, SURESMILE);
  url.searchParams.set('demo_audience', audience);
  url.searchParams.set('demo_source', source);
  return url.toString();
}

function readRows(block) {
  return [...block.children].map((row) => {
    const cells = [...row.children];
    return { kind: text(cells[0]).toLowerCase(), cells: cells.slice(1) };
  });
}

function productCard(cells, featured, href) {
  const [name, maker, list, link, media] = cells;
  const card = el('li', `discovery-chat-product${featured ? ' featured' : ''}`);
  const image = media?.querySelector('img');
  if (image) {
    const thumb = el('div', 'discovery-chat-thumb');
    thumb.append(image.cloneNode());
    card.append(thumb);
  }
  const body = el('div', 'discovery-chat-product-body');
  const title = el('h3');
  const anchor = el('a', null, text(name));
  anchor.href = href || link?.querySelector('a')?.href || '#';
  if (!featured) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
  title.append(anchor);
  body.append(title, el('p', 'discovery-chat-maker', `Manufacturer: ${text(maker)}`));
  if (list?.querySelector('ul')) body.append(list.querySelector('ul').cloneNode(true));
  if (featured) {
    const cta = el('a', 'button', 'Explore SureSmile');
    cta.href = href;
    body.append(cta);
  }
  card.append(body);
  return card;
}

/**
 * ChatGPT-style simulated conversation. One audience is shown at a time (?audience=endodontic).
 * Rows (first cell is the label): back | audience | product | featured.
 *  audience: id, label, question, answer, landing path on the SureSmile site.
 */
export default function decorate(block) {
  const rows = readRows(block);
  const audiences = rows.filter((row) => row.kind === 'audience');
  const wanted = (new URLSearchParams(window.location.search).get('audience') || '').toLowerCase();
  const chosen = audiences.find((row) => text(row.cells[0]).toLowerCase() === wanted)
    || audiences[0];
  if (!chosen) return;
  const [id, , question, answer, landing] = chosen.cells;
  const audience = text(id).toLowerCase();
  const back = rows.find((row) => row.kind === 'back')?.cells[0]?.querySelector('a');

  const shell = el('div', 'discovery-chat-shell');
  const bar = el('div', 'discovery-chat-bar');
  bar.append(el('span', 'discovery-chat-brand', 'ChatGPT'), el('span', 'discovery-chat-sim', 'Simulation'));
  if (back) {
    const link = el('a', 'discovery-chat-back', back.textContent);
    link.href = back.getAttribute('href');
    bar.append(link);
  }
  const thread = el('div', 'discovery-chat-thread');
  thread.append(el('div', 'discovery-chat-user', text(question)));
  const reply = el('div', 'discovery-chat-reply');
  reply.append(el('p', null, text(answer)));
  reply.append(el('h2', null, 'Clear aligner offerings to explore'));
  const list = el('ol', 'discovery-chat-products');
  const href = landingUrl(text(landing) || '/en-us/', audience, 'chatgpt');
  rows.filter((row) => row.kind === 'product' || row.kind === 'featured').forEach((row) => {
    list.append(productCard(row.cells, row.kind === 'featured', row.kind === 'featured' ? href : null));
  });
  reply.append(list);
  thread.append(reply);
  const input = el('div', 'discovery-chat-input', 'Ask ChatGPT');
  input.setAttribute('aria-hidden', 'true');
  shell.append(bar, thread, input);
  shell.append(el('p', 'discovery-chat-note', 'Illustrative simulation only. Not a live ChatGPT response. No OpenAI endorsement.'));
  block.replaceChildren(shell);
}
