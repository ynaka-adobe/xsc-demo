export default function decorate(block) {
  const [lead, media] = block.firstElementChild?.children || [];
  if (lead) {
    lead.classList.add('demo-hero-lead');
    const tags = lead.querySelector(':scope > ul');
    if (tags) tags.classList.add('demo-hero-tags');
    const links = [...lead.querySelectorAll(':scope > p a')];
    if (links.length) {
      const actions = document.createElement('p');
      actions.className = 'demo-hero-actions';
      links.forEach((a, i) => {
        a.className = i === 0 ? 'demo-hero-primary' : 'demo-hero-secondary';
        const parent = a.closest('p');
        actions.append(a);
        if (parent && !parent.textContent.trim()) parent.remove();
      });
      lead.append(actions);
    }
  }
  if (media) {
    media.classList.add('demo-hero-media');
    const pic = media.querySelector('picture');
    const caption = document.createElement('div');
    caption.className = 'demo-hero-caption';
    [...media.children].forEach((el) => {
      if (!el.contains(pic)) caption.append(el);
    });
    const link = caption.querySelector('a');
    if (link) link.classList.add('demo-hero-caption-link');
    if (caption.children.length) media.append(caption);
  }
}
