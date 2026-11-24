/* by-product variant: rows are product | list of feature demo links */
function decorateByProduct(block) {
  const grid = document.createElement('div');
  grid.className = 'feature-index-products';
  [...block.children].forEach((row) => {
    const [name, links] = row.children;
    const col = document.createElement('div');
    col.className = 'feature-index-product';
    const h = document.createElement('h3');
    h.textContent = name?.textContent.trim() || '';
    const list = document.createElement('ul');
    links?.querySelectorAll('a').forEach((a) => {
      const li = document.createElement('li');
      li.append(a);
      list.append(li);
    });
    col.append(h, list);
    grid.append(col);
  });
  block.replaceChildren(grid);
}

export default function decorate(block) {
  if (block.classList.contains('by-product')) {
    decorateByProduct(block);
    return;
  }
  const rows = [...block.children];
  const [intro, ...items] = rows;
  intro.classList.add('feature-index-intro');
  const introCell = intro.firstElementChild;
  const first = introCell?.firstElementChild;
  if (first?.tagName === 'P' && /^H[1-6]$/.test(first.nextElementSibling?.tagName)) {
    first.classList.add('eyebrow');
  }

  const list = document.createElement('ol');
  list.className = 'feature-index-list';
  items.forEach((row, i) => {
    const [titleCell, descCell] = row.children;
    const link = row.querySelector('a');
    const li = document.createElement('li');
    const item = document.createElement(link ? 'a' : 'div');
    item.className = 'feature-index-item';
    if (link) item.href = link.href;
    const title = (link ? link.textContent : titleCell?.textContent || '').trim();
    item.innerHTML = '<span class="feature-index-num"></span><span class="feature-index-body"><strong></strong><span></span></span><span class="feature-index-arrow" aria-hidden="true">↗</span>';
    item.querySelector('.feature-index-num').textContent = String(i + 1).padStart(2, '0');
    item.querySelector('strong').textContent = title;
    item.querySelector('.feature-index-body > span').textContent = descCell?.textContent.trim() || '';
    li.append(item);
    list.append(li);
    row.remove();
  });
  block.append(list);
}
