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

/* walkthrough variant: numbered steps (step | link to the feature demo) */
function decorateWalkthrough(block) {
  const list = document.createElement('ol');
  [...block.children].forEach((row, i) => {
    const [step, link] = row.children;
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'demo-paths-num';
    num.textContent = i + 1;
    step.className = 'demo-paths-step';
    li.append(num, step);
    const a = link?.querySelector('a');
    if (a) {
      a.className = 'demo-paths-link';
      li.append(a);
    }
    list.append(li);
  });
  block.replaceChildren(list);
}

export default function decorate(block) {
  if (block.classList.contains('walkthrough')) {
    decorateWalkthrough(block);
    return;
  }
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
