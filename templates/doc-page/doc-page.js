const slug = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const samePath = (href) => {
  const strip = (p) => p.replace(/(\.html|\/)$/, '') || '/';
  return strip(new URL(href, window.location.origin).pathname) === strip(window.location.pathname);
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  node.append(...children);
  return node;
}

/* Left menu: the top-nav section (L1) that contains the current page. */
async function buildSideNav(aside) {
  const resp = await fetch('/nav.plain.html');
  if (!resp.ok) return;
  const nav = el('div');
  nav.innerHTML = await resp.text();
  const l1 = [...nav.querySelectorAll(':scope > div > ul > li')]
    .find((li) => [...li.querySelectorAll('a')].some((a) => samePath(a.href)));
  if (!l1) {
    aside.remove();
    return;
  }
  const title = l1.querySelector(':scope > p, :scope > a');
  const list = el('ul');
  l1.querySelectorAll(':scope > ul > li').forEach((group) => {
    const label = group.querySelector(':scope > p');
    const links = [...group.querySelectorAll('a')];
    if (label) list.append(el('li', { class: 'doc-sidenav-group' }, [label.textContent]));
    links.forEach((a) => {
      const link = el('a', { href: new URL(a.href).pathname }, [a.textContent]);
      if (samePath(a.href)) link.setAttribute('aria-current', 'page');
      list.append(el('li', {}, [link]));
    });
  });
  aside.append(el('p', { class: 'doc-sidenav-title' }, [title?.textContent || '']), list);
}

/* Right menu: this page's h1/h2 headings, highlighted while scrolling. */
function buildToc(aside, body) {
  const headings = [...body.querySelectorAll('h1, h2')];
  if (headings.length < 2) {
    aside.remove();
    return;
  }
  const links = headings.map((h) => {
    if (!h.id) h.id = slug(h.textContent);
    return el('a', { href: `#${h.id}` }, [h.textContent]);
  });
  aside.append(
    el('p', { class: 'doc-toc-title' }, ['On this page']),
    el('ul', {}, links.map((a) => el('li', {}, [a]))),
  );
  const observer = new IntersectionObserver((entries) => {
    entries.filter((e) => e.isIntersecting).forEach((e) => {
      links.forEach((a) => a.classList.toggle('active', a.hash === `#${e.target.id}`));
    });
  }, { rootMargin: '0px 0px -70% 0px' });
  headings.forEach((h) => observer.observe(h));
}

/* L3 header: breadcrumb (Portfolio / Product / Feature demos) and meta line from page metadata. */
function buildHeader(body) {
  const meta = (name) => document.head.querySelector(`meta[name="${name}"]`)?.content?.trim();
  const h1 = body.querySelector('h1');
  if (!h1) return;
  const crumbs = [meta('portfolio'), meta('product'), meta('type') && `${meta('type')} demos`].filter(Boolean);
  if (crumbs.length) {
    h1.before(el('ol', { class: 'doc-crumb', 'aria-label': 'Breadcrumb' }, crumbs.map((c) => el('li', {}, [c]))));
  }
  const facts = [meta('type') && `${meta('type')} demo`, meta('duration'), meta('level')].filter(Boolean);
  if (facts.length) {
    const lead = h1.nextElementSibling?.tagName === 'P' ? h1.nextElementSibling : h1;
    lead.after(el('ul', { class: 'doc-meta' }, facts.map((f) => el('li', {}, [f]))));
  }
}

export default function decorate(main) {
  buildHeader(main);
  const body = el('div', { class: 'doc-body' }, [...main.children]);
  const sidenav = el('nav', { class: 'doc-sidenav', 'aria-label': 'Section' });
  const toc = el('aside', { class: 'doc-toc', 'aria-label': 'On this page' });
  main.append(el('div', { class: 'doc-layout' }, [sidenav, body, toc]));
  buildToc(toc, body);
  buildSideNav(sidenav);
}
