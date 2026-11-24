function decorateItem(li) {
  const link = li.querySelector('a');
  if (!link) return;
  const desc = [...li.childNodes]
    .filter((n) => n !== link && !n.contains?.(link))
    .map((n) => n.textContent)
    .join('')
    .replace(/^[\s\-–—:]+/, '')
    .trim();
  const title = document.createElement('span');
  title.className = 'demo-paths-title';
  title.textContent = link.textContent.trim();
  link.replaceChildren(title);
  if (desc) {
    const sub = document.createElement('span');
    sub.className = 'demo-paths-desc';
    sub.textContent = desc;
    link.append(sub);
  }
  li.replaceChildren(link);
}

export default function decorate(block) {
  const cells = [...block.querySelectorAll(':scope > div > div')];
  const row = document.createElement('div');
  row.className = 'demo-paths-row';
  cells.forEach((cell, i) => {
    cell.className = `demo-paths-panel ${i % 2 ? 'demo-paths-dark' : 'demo-paths-light'}`;
    const first = cell.firstElementChild;
    if (first?.tagName === 'P' && /^H[1-6]$/.test(first.nextElementSibling?.tagName)) {
      first.classList.add('demo-paths-eyebrow');
    }
    cell.querySelectorAll('li').forEach(decorateItem);
    row.append(cell);
  });
  block.replaceChildren(row);
}
