export default function decorate(block) {
  const cell = block.querySelector(':scope > div > div');
  if (!cell) return;
  cell.classList.add('cta-banner-inner');
  const link = cell.querySelector('a');
  if (link) {
    link.className = 'pill-button accent';
    const p = link.closest('p');
    if (p) p.classList.add('cta-banner-action');
  }
}
