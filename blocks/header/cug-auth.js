// Header sign-in widget for Closed User Groups. The /auth/* routes are served by the
// xsc-demo-cug edge function, which only runs on AUTH_ORIGIN.

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  node.append(...children);
  return node;
}

function initials(user) {
  const source = (user.name || user.email || '?').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

async function fetchSession() {
  try {
    const resp = await fetch('/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!resp.ok || !resp.headers.get('content-type')?.includes('json')) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function buildSignIn(origin = '') {
  const returnTo = `${window.location.pathname}${window.location.search}`;
  return el('a', {
    class: 'cug-auth-signin',
    href: `${origin}/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
  }, 'Sign in');
}

// Employee-only links, authored in DA at /internal/menu. Guests and anonymous users
// can't read /internal, so the fetch fails and the section is skipped.
async function buildInternalLinks(user) {
  if (user.guest) return null;
  try {
    const resp = await fetch('/internal/menu.plain.html', { credentials: 'same-origin' });
    if (!resp.ok) return null;
    const doc = new DOMParser().parseFromString(await resp.text(), 'text/html');
    const links = [...doc.querySelectorAll('a[href]')];
    if (!links.length) return null;
    const list = el('ul', { class: 'cug-auth-internal', 'aria-label': 'Internal' });
    links.forEach((a) => {
      const external = /^https?:/.test(a.getAttribute('href'));
      const attrs = { href: a.getAttribute('href') };
      if (external) Object.assign(attrs, { target: '_blank', rel: 'noopener' });
      list.append(el('li', {}, el('a', attrs, a.textContent.trim())));
    });
    return [el('p', { class: 'cug-auth-label' }, 'Internal'), list];
  } catch {
    return null;
  }
}

function buildAccountMenu(user) {
  const wrapper = el('div', { class: 'cug-auth-account' });

  const trigger = el(
    'button',
    {
      type: 'button',
      class: 'cug-auth-trigger',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      'aria-controls': 'cug-auth-panel',
    },
    el('span', { class: 'cug-auth-avatar', 'aria-hidden': 'true' }, initials(user)),
    el('span', { class: 'cug-auth-name' }, user.name || user.email || 'Account'),
  );

  const label = user.guest ? 'Demo access' : 'Groups';
  const groups = el('ul', { class: 'cug-auth-groups', 'aria-label': label });
  (user.groups || []).forEach((g) => groups.append(el('li', {}, g)));
  if (!groups.children.length) groups.append(el('li', { class: 'empty' }, 'No groups'));

  const panel = el(
    'div',
    { id: 'cug-auth-panel', class: 'cug-auth-panel', hidden: '' },
    el(
      'div',
      { class: 'cug-auth-identity' },
      el('span', { class: 'cug-auth-avatar large', 'aria-hidden': 'true' }, initials(user)),
      el(
        'div',
        {},
        el('p', { class: 'cug-auth-fullname' }, user.name || 'Signed in'),
        el('p', { class: 'cug-auth-email' }, user.guest ? 'Access code' : user.email || ''),
      ),
    ),
    el('p', { class: 'cug-auth-label' }, label),
    groups,
    el(
      'ul',
      { class: 'cug-auth-links' },
      el('li', {}, el('a', { href: '/auth/logout', class: 'cug-auth-signout' }, 'Sign out')),
    ),
  );

  const setOpen = (open) => {
    trigger.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) setOpen(false);
  });
  wrapper.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !panel.hidden) {
      e.stopPropagation();
      setOpen(false);
      trigger.focus();
    }
  });

  wrapper.append(trigger, panel);
  buildInternalLinks(user).then((nodes) => {
    if (nodes) panel.querySelector('.cug-auth-links').before(...nodes);
  });
  return wrapper;
}

// Where login actually runs (the edge function is only routed for this domain).
const AUTH_ORIGIN = 'https://xsc-demo.ynaka-adobe.com';

/**
 * Builds the sign-in / account widget. Where /auth/me is unavailable (e.g. *.aem.page,
 * *.aem.live, localhost), shows a Sign in button that goes to AUTH_ORIGIN instead.
 */
export default async function buildAuthWidget() {
  const session = await fetchSession();
  const container = el('div', { class: 'cug-auth' });
  if (!session) container.append(buildSignIn(AUTH_ORIGIN));
  else container.append(session.authenticated ? buildAccountMenu(session) : buildSignIn());
  return container;
}
