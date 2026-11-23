export default function decorate(block) {
  const cell = block.querySelector(':scope > div > div');
  if (!cell) return;
  cell.classList.add('paper-cta-inner');
  const link = cell.querySelector('a');
  if (link) {
    link.className = 'paper-btn paper-btn-accent';
    const p = link.closest('p');
    if (p) p.classList.add('paper-cta-action');
  }
}
