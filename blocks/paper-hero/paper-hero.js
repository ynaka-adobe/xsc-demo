function markEyebrow(cell) {
  const first = cell.firstElementChild;
  if (first?.tagName === 'P' && /^H[1-6]$/.test(first.nextElementSibling?.tagName)) {
    first.classList.add('paper-eyebrow');
  }
}

export default function decorate(block) {
  const [lead, aside] = block.firstElementChild?.children || [];
  if (lead) {
    lead.classList.add('paper-hero-lead');
    markEyebrow(lead);
  }
  if (aside) {
    aside.classList.add('paper-hero-aside');
    const links = [...aside.querySelectorAll('a')];
    if (links.length) {
      const actions = document.createElement('p');
      actions.className = 'paper-hero-actions';
      links.forEach((a, i) => {
        a.className = i === 0 ? 'paper-btn' : 'paper-link';
        const parent = a.closest('p');
        actions.append(a);
        if (parent && !parent.textContent.trim()) parent.remove();
      });
      aside.append(actions);
    }
  }
}
