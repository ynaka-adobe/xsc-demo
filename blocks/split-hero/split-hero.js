function markEyebrow(cell) {
  const first = cell.firstElementChild;
  if (first?.tagName === 'P' && /^H[1-6]$/.test(first.nextElementSibling?.tagName)) {
    first.classList.add('eyebrow');
  }
}

export default function decorate(block) {
  const [lead, aside] = block.firstElementChild?.children || [];
  if (lead) {
    lead.classList.add('split-hero-lead');
    markEyebrow(lead);
  }
  if (aside) {
    aside.classList.add('split-hero-aside');
    const links = [...aside.querySelectorAll('a')];
    if (links.length) {
      const actions = document.createElement('p');
      actions.className = 'split-hero-actions';
      links.forEach((a, i) => {
        a.className = i === 0 ? 'pill-button' : 'text-link';
        const parent = a.closest('p');
        actions.append(a);
        if (parent && !parent.textContent.trim()) parent.remove();
      });
      aside.append(actions);
    }
  }
}
