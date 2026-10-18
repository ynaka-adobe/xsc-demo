// Customer demo access: guest code form, granted demos for guests, and the full
// demo/code list for employees. Backed by the xsc-demo-cug edge function.

const AUTH_ORIGIN = 'https://xsc-demo.ynaka-adobe.com';
const CODES_SHEET = 'https://da.live/sheet#/ynaka-adobe/xsc-demo/internal/demo-codes';
const ERRORS = {
  missing: 'Please enter your access code.',
  invalid: "That code wasn't recognized. Check it and try again.",
  expired: 'That code has expired. Contact your Adobe team for a new one.',
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  node.append(...children);
  return node;
}

const authBase = () => (window.location.origin === AUTH_ORIGIN ? '' : AUTH_ORIGIN);

async function fetchDemos() {
  try {
    const resp = await fetch('/auth/demos', { credentials: 'same-origin', cache: 'no-store' });
    if (!resp.ok || !resp.headers.get('content-type')?.includes('json')) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function safeReturnTo(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '';
}

function buildForm(params, compact) {
  const returnTo = safeReturnTo(params.get('returnTo'));
  const error = ERRORS[params.get('error')];
  const input = el('input', {
    type: 'text',
    name: 'code',
    id: 'demo-access-code',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    required: '',
    placeholder: 'e.g. ABCD-123456',
  });
  if (params.get('code')) input.value = params.get('code');
  if (error) {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'demo-access-error');
  }
  const form = el(
    'form',
    { class: 'demo-access-form', method: 'post', action: `${authBase()}/auth/code` },
    el('label', { for: 'demo-access-code' }, compact ? 'Have another code?' : 'Access code'),
    el('div', { class: 'demo-access-row' }, input, el('button', { type: 'submit', class: 'button' }, 'View demo')),
  );
  if (returnTo) form.append(el('input', { type: 'hidden', name: 'returnTo', value: returnTo }));
  if (error) form.append(el('p', { class: 'demo-access-error', id: 'demo-access-error', role: 'alert' }, error));
  return form;
}

function buildEmployeeSignIn(params) {
  const returnTo = safeReturnTo(params.get('returnTo')) || '/customer-demo';
  return el(
    'p',
    { class: 'demo-access-employee' },
    'Adobe employee? ',
    el('a', { href: `${authBase()}/auth/login?returnTo=${encodeURIComponent(returnTo)}` }, 'Sign in'),
    ' to see every demo.',
  );
}

function buildGuestList(demos) {
  const list = el('ul', { class: 'demo-access-list' });
  demos.forEach((d) => list.append(el('li', {}, el('a', { href: d.path, class: 'button' }, d.customer))));
  return el('div', { class: 'demo-access-granted' }, el('h3', {}, 'Your demos'), list);
}

function buildEmployeeTable(demos) {
  const tbody = el('tbody');
  demos.forEach((d) => {
    const status = d.active ? 'Active' : 'Expired';
    tbody.append(el(
      'tr',
      {},
      el('td', {}, el('a', { href: d.path }, d.customer)),
      el('td', {}, el('code', {}, d.code)),
      el('td', {}, d.expires || 'No expiry'),
      el('td', {}, el('span', { class: `demo-access-status ${status.toLowerCase()}` }, status)),
      el('td', {}, d.notes || ''),
    ));
  });
  const headings = ['Customer', 'Code', 'Expires', 'Status', 'Notes'].map((h) => el('th', {}, h));
  const table = el('table', {}, el('thead', {}, el('tr', {}, ...headings)), tbody);
  return el(
    'div',
    { class: 'demo-access-employee-view' },
    el('h3', {}, 'All customer demos'),
    el(
      'p',
      {},
      "You're signed in as an Adobe employee, so every demo is open to you. Share a code to give a customer access to their demo. ",
      el('a', { href: CODES_SHEET, target: '_blank', rel: 'noopener' }, 'Manage codes'),
    ),
    el('div', { class: 'demo-access-table' }, table),
  );
}

export default async function decorate(block) {
  const intro = el('div', { class: 'demo-access-intro' });
  [...block.children].forEach((row) => intro.append(...row.querySelectorAll(':scope > div > *')));
  block.replaceChildren(intro);

  const params = new URLSearchParams(window.location.search);
  const panel = el('div', { class: 'demo-access-panel' });
  block.append(panel);

  const data = await fetchDemos();
  const role = data?.role || 'anonymous';
  block.dataset.role = role;

  if (role === 'employee') {
    panel.append(buildEmployeeTable(data.demos || []));
    return;
  }
  if (role === 'guest' && data.demos?.length) {
    panel.append(buildGuestList(data.demos), buildForm(params, true));
    return;
  }
  panel.append(buildForm(params, false), buildEmployeeSignIn(params));
}
