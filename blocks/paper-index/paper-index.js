export default function decorate(block) {
  const rows = [...block.children];
  const [intro, ...items] = rows;
  intro.classList.add('paper-index-intro');
  const introCell = intro.firstElementChild;
  const first = introCell?.firstElementChild;
  if (first?.tagName === 'P' && /^H[1-6]$/.test(first.nextElementSibling?.tagName)) {
    first.classList.add('paper-eyebrow');
  }

  const list = document.createElement('ol');
  list.className = 'paper-index-list';
  items.forEach((row, i) => {
    const [titleCell, descCell] = row.children;
    const link = row.querySelector('a');
    const li = document.createElement('li');
    const item = document.createElement(link ? 'a' : 'div');
    item.className = 'paper-index-item';
    if (link) item.href = link.href;
    const title = (link ? link.textContent : titleCell?.textContent || '').trim();
    item.innerHTML = '<span class="paper-index-num"></span><span class="paper-index-body"><strong></strong><span></span></span><span class="paper-index-arrow" aria-hidden="true">↗</span>';
    item.querySelector('.paper-index-num').textContent = String(i + 1).padStart(2, '0');
    item.querySelector('strong').textContent = title;
    item.querySelector('.paper-index-body > span').textContent = descCell?.textContent.trim() || '';
    li.append(item);
    list.append(li);
    row.remove();
  });
  block.append(list);
}
