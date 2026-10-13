/*
 * Secure Assets: Dynamic Media secure delivery demo.
 *
 * Authoring: one row per asset.
 *   | Secure Assets |                                   |                  |
 *   | urn:aaid:aem:… (or delivery URL) | Title           | Partners / Public |
 *
 * Gets a delivery token for the signed-in user from /auth/dm-token (edge
 * function, groups from Okta) and appends ?token=sd:… to each asset URL.
 * Assets the user's groups can't access return 404 and show as locked.
 */
const DELIVERY = 'https://delivery-p154856-e1944736.adobeaemcloud.com';

async function getJson(url) {
  try {
    const resp = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!resp.headers.get('content-type')?.includes('json')) return null;
    return { status: resp.status, data: await resp.json() };
  } catch {
    return null;
  }
}

function assetUrl(ref, delivery, token) {
  const urn = ref.match(/urn:aaid:aem:[0-9a-f-]+/i)?.[0];
  if (!urn) return null;
  const url = new URL(`${delivery}/adobe/assets/${urn}/as/preview.webp`);
  url.searchParams.set('width', '640');
  if (token) url.searchParams.set('token', token);
  return url.href;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function statusPanel(me, tokenInfo) {
  const panel = el('div', 'secure-assets-status');
  const returnTo = encodeURIComponent(window.location.pathname);
  if (!me) {
    panel.append(el('p', null, 'Sign-in is only available on xsc-demo.ynaka-adobe.com. Showing anonymous delivery.'));
    return panel;
  }
  if (!me.authenticated) {
    const p = el('p', null, 'You are not signed in, so only public assets are delivered. ');
    const a = el('a', 'button', 'Sign in with Okta');
    a.href = `/auth/login?returnTo=${returnTo}`;
    panel.append(p, a);
    return panel;
  }
  const who = el('p');
  who.append('Signed in as ', el('strong', null, me.email || me.name || 'user'));
  const groups = el('ul', 'secure-assets-groups');
  (me.groups || []).forEach((g) => groups.append(el('li', null, g)));
  panel.append(who, el('p', 'secure-assets-label', 'Okta groups sent to the token API'), groups);
  if (tokenInfo?.token) {
    const exp = tokenInfo.expiryTime ? new Date(tokenInfo.expiryTime).toLocaleTimeString() : '';
    const t = el('p', 'secure-assets-token');
    t.append('Delivery token ', el('code', null, `${tokenInfo.token.slice(0, 24)}…`), exp ? ` expires ${exp}` : '');
    panel.append(t);
  } else if (tokenInfo?.error) {
    panel.append(el('p', 'secure-assets-error', `Could not get a delivery token: ${tokenInfo.error}`));
  }
  const out = el('a', 'button secondary', 'Sign out');
  out.href = '/auth/logout';
  panel.append(out);
  return panel;
}

function card({
  ref, title, access,
}, delivery, token) {
  const li = el('li', 'secure-assets-card');
  const gated = /partner|private|gated|restricted/i.test(access);
  li.dataset.access = gated ? 'gated' : 'public';
  const media = el('div', 'secure-assets-media');
  const body = el('div', 'secure-assets-body');
  const badge = el('span', 'secure-assets-badge', access || (gated ? 'Partners' : 'Public'));
  const state = el('p', 'secure-assets-state', 'Loading…');
  body.append(badge, el('p', 'secure-assets-title', title), state);
  li.append(media, body);

  const src = assetUrl(ref, delivery, token);
  if (!src) {
    state.textContent = 'Missing asset URN';
    return li;
  }
  const img = new Image();
  img.alt = title;
  img.loading = 'lazy';
  img.onload = () => {
    li.classList.add('is-delivered');
    state.textContent = gated ? 'Delivered: your groups match this asset' : 'Delivered: public asset';
  };
  img.onerror = () => {
    li.classList.add('is-locked');
    img.remove();
    media.append(el('span', 'secure-assets-lock', '🔒'));
    state.textContent = token
      ? 'Locked: 404 for your groups'
      : 'Locked: sign in with an allowed group';
  };
  img.src = src;
  media.append(img);
  return li;
}

export default async function decorate(block) {
  const items = [...block.children].map((row) => {
    const cols = [...row.children].map((c) => c.textContent.trim());
    const link = row.querySelector('a')?.href;
    return { ref: link || cols[0] || '', title: cols[1] || '', access: cols[2] || '' };
  }).filter((i) => i.ref);
  block.textContent = '';

  const meResp = await getJson('/auth/me');
  const me = meResp?.data || null;
  let tokenInfo = null;
  if (me?.authenticated) {
    const t = await getJson('/auth/dm-token');
    tokenInfo = t?.data || { error: 'no response' };
  }
  const delivery = tokenInfo?.delivery || DELIVERY;

  const grid = el('ul', 'secure-assets-grid');
  items.forEach((i) => grid.append(card(i, delivery, tokenInfo?.token)));
  block.append(statusPanel(me, tokenInfo), grid);
}
