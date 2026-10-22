/*
 * Page Access (Closed User Groups) — DA Prepare-menu plugin for xsc-demo.
 *
 * Same Apply / Remove behaviour as the shared aem-apps CUG plugin
 * (tools/plugins/cug), plus a rule builder that writes rows into the
 * `closed-user-groups` sheet, including attribute-based (ABAC) rules for
 * region (country) and company that the xsc-demo edge function enforces.
 *
 * Saving only edits the DA sheet. Apply pushes the sheet to the site's
 * headers.json (Config Service), which is what the CDN/edge function reads.
 */
// eslint-disable-next-line import/no-unresolved
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import {
  COMPANIES, COUNTRIES, buildAbacRule, normalisePath, parseAbacRule,
  removeRow, suggestPath, upsertRow,
} from './rules.js';

const DA_SOURCE_BASE = 'https://admin.da.live/source';
const ADMIN_API_BASE = 'https://admin.hlx.page';
const CUG_SHEET_PATH = 'closed-user-groups.json';
const HEADER_CUG_REQUIRED = 'x-aem-cug-required';
const HEADER_CUG_GROUPS = 'x-aem-cug-groups';
const HEADER_CUG_LOGIN_PATH = 'x-aem-cug-login-path';
const SHEET_COLUMNS = ['url', 'cug-required', 'cug-groups', 'cug-login-path'];

// ─── DOM helper ─────────────────────────────────────────────────────────────

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === false || value == null) return;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  });
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

// ─── DA sheet (source of truth for rules) ───────────────────────────────────

/**
 * Reads the sheet and remembers its envelope so saving preserves column
 * widths and single- vs multi-sheet shape. A missing sheet starts empty.
 */
async function readSheet(org, site, token) {
  const resp = await fetch(`${DA_SOURCE_BASE}/${org}/${site}/${CUG_SHEET_PATH}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 404) return { envelope: null, rows: [] };
  if (!resp.ok) throw new Error(`Failed to fetch CUG sheet: ${resp.status} ${resp.statusText}`);
  const json = await resp.json();
  if (json[':type'] === 'multi-sheet') {
    const name = (json[':names'] || [])[0] || 'data';
    const sheet = json[name] || {};
    return { envelope: json, sheetName: name, rows: Array.isArray(sheet.data) ? sheet.data : [] };
  }
  return { envelope: json, rows: Array.isArray(json.data) ? json.data : [] };
}

function toSheetJson(sheet, rows) {
  const data = rows.map((r) => Object.fromEntries(SHEET_COLUMNS.map((c) => [c, r[c] || ''])));
  const body = {
    total: data.length, limit: data.length, offset: 0, data,
  };
  const { envelope, sheetName } = sheet;
  if (envelope && envelope[':type'] === 'multi-sheet') {
    return { ...envelope, [sheetName]: { ...envelope[sheetName], ...body } };
  }
  return {
    ':colWidths': [180, 110, 260, 160],
    ...(envelope || {}),
    ...body,
    ':sheetname': (envelope && envelope[':sheetname']) || 'data',
    ':type': 'sheet',
  };
}

async function writeSheet(org, site, token, sheet, rows) {
  const form = new FormData();
  const json = JSON.stringify(toSheetJson(sheet, rows));
  form.append('data', new Blob([json], { type: 'application/json' }));
  const resp = await fetch(`${DA_SOURCE_BASE}/${org}/${site}/${CUG_SHEET_PATH}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!resp.ok) throw new Error(`Failed to save CUG sheet: ${resp.status} ${resp.statusText}`);
}

// ─── Config Service (what the edge reads) ───────────────────────────────────

const isCugHeader = (key) => [HEADER_CUG_REQUIRED, HEADER_CUG_GROUPS, HEADER_CUG_LOGIN_PATH]
  .includes(key);

/** Same transform as the shared plugin: first row per url wins. */
function transformToHeadersConfig(rows) {
  const config = {};
  rows.forEach((row) => {
    const path = (row.url || '').trim();
    if (!path.startsWith('/') || config[path]) return;
    const headers = [];
    const required = (row['cug-required'] || '').trim().toLowerCase();
    if (required === 'true' || required === 'false') {
      headers.push({ key: HEADER_CUG_REQUIRED, value: required });
    }
    const groups = (row['cug-groups'] || '').trim();
    if (groups) headers.push({ key: HEADER_CUG_GROUPS, value: groups });
    const loginPath = (row['cug-login-path'] || '').trim();
    if (loginPath) headers.push({ key: HEADER_CUG_LOGIN_PATH, value: loginPath });
    if (headers.length) config[path] = headers;
  });
  return config;
}

/** Keeps every non-CUG header so Apply/Remove never clobber unrelated config. */
async function fetchExistingNonCugHeaders(org, site, token) {
  const resp = await fetch(`${ADMIN_API_BASE}/config/${org}/aggregated/${site}.json`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 404) return {};
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Failed to read site config: ${resp.status} ${resp.statusText} ${body}`);
  }
  const existing = (await resp.json()).headers || {};
  const filtered = {};
  Object.entries(existing).forEach(([path, list]) => {
    const nonCug = Array.isArray(list) ? list.filter((h) => !isCugHeader(h.key)) : [];
    if (nonCug.length) filtered[path] = nonCug;
  });
  return filtered;
}

function mergeHeaders(nonCugHeaders, cugHeaders) {
  const merged = { ...nonCugHeaders };
  Object.entries(cugHeaders).forEach(([path, list]) => {
    merged[path] = [...(merged[path] || []), ...list];
  });
  return merged;
}

async function postHeaders(org, site, headersConfig, token) {
  const resp = await fetch(`${ADMIN_API_BASE}/config/${org}/sites/${site}/headers.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(headersConfig),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Config Service POST failed: ${resp.status} ${resp.statusText} — ${body}`);
  }
}

// ─── UI ─────────────────────────────────────────────────────────────────────

function select(name, options) {
  return el(
    'select',
    { name },
    el('option', { value: '' }, 'Any'),
    options.map((o) => el('option', { value: o.value }, o.label)),
  );
}

function renderApp(container, {
  org, site, token, pagePath,
}) {
  let sheet = { envelope: null, rows: [] };

  const status = el('div', { class: 'status', role: 'status' });
  const setStatus = (kind, text) => {
    status.className = `status ${kind}`;
    status.textContent = text;
  };

  // Rule builder
  const pathInput = el('input', {
    name: 'url', type: 'text', placeholder: '/regions/usa/**', value: suggestPath(pagePath),
  });
  const abacToggle = el('input', { type: 'checkbox', name: 'abac', checked: true });
  const countrySelect = select('country', COUNTRIES);
  const companySelect = select('company', COMPANIES);
  const groupsInput = el('input', { name: 'groups', type: 'text', placeholder: 'partners (empty = any signed-in user)' });
  const loginInput = el('input', { name: 'login', type: 'text', placeholder: 'optional, e.g. /customer-demo' });
  const preview = el('code', { class: 'rule-preview' });
  const abacFields = el(
    'div',
    { class: 'abac-fields' },
    el('label', {}, 'Region (country)', countrySelect),
    el('label', {}, 'Company', companySelect),
  );
  const groupsField = el('label', { class: 'groups-field' }, 'Groups', groupsInput);
  const saveBtn = el('button', { class: 'action-btn', type: 'submit' }, 'Save ABAC rule');

  const currentRule = () => (abacToggle.checked
    ? buildAbacRule({ country: countrySelect.value, company: companySelect.value })
    : groupsInput.value.trim());

  const refreshForm = () => {
    abacFields.hidden = !abacToggle.checked;
    groupsField.hidden = abacToggle.checked;
    saveBtn.textContent = abacToggle.checked ? 'Save ABAC rule' : 'Save rule';
    const rule = currentRule();
    preview.textContent = rule || (abacToggle.checked ? 'select a region and/or company' : '(any signed-in user)');
  };
  [abacToggle, countrySelect, companySelect].forEach((n) => n.addEventListener('change', refreshForm));
  groupsInput.addEventListener('input', refreshForm);

  // Rules table
  const tbody = el('tbody');
  const buttons = [];
  const setBusy = (busy) => [...buttons, ...tbody.querySelectorAll('button')]
    .forEach((b) => { b.disabled = busy; });

  const editRow = (row) => {
    pathInput.value = row.url || '';
    loginInput.value = row['cug-login-path'] || '';
    const abac = parseAbacRule(row['cug-groups']);
    abacToggle.checked = !!abac;
    countrySelect.value = abac ? abac.country : '';
    companySelect.value = abac ? abac.company : '';
    groupsInput.value = abac ? '' : row['cug-groups'] || '';
    refreshForm();
    pathInput.focus();
  };

  async function persist(rows, message) {
    setBusy(true);
    setStatus('loading', 'Saving sheet...');
    try {
      await writeSheet(org, site, token, sheet, rows);
      sheet = { ...sheet, rows };
      // eslint-disable-next-line no-use-before-define
      renderRows();
      setStatus('success', `${message} Click Apply Page Access to push it to the edge.`);
    } catch (err) {
      setStatus('error', `Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function renderRows() {
    tbody.replaceChildren(...(sheet.rows.length ? sheet.rows.map((row) => {
      const groups = row['cug-groups'] || '';
      const del = el('button', {
        class: 'link-btn danger',
        type: 'button',
        title: `Delete ${row.url}`,
        onclick: () => persist(removeRow(sheet.rows, row.url), `Deleted ${row.url}.`),
      }, 'Delete');
      return el(
        'tr',
        {},
        el('td', {}, el('code', {}, row.url || '')),
        el(
          'td',
          {},
          groups ? el('code', {}, groups) : el('em', {}, 'any signed-in user'),
          parseAbacRule(groups) ? el('span', { class: 'badge' }, 'ABAC') : null,
        ),
        el('td', {}, row['cug-login-path'] || ''),
        el(
          'td',
          { class: 'row-actions' },
          el('button', { class: 'link-btn', type: 'button', onclick: () => editRow(row) }, 'Edit'),
          del,
        ),
      );
    }) : [el('tr', {}, el('td', { colSpan: 4 }, el('em', {}, 'No rules yet.')))]));
  }

  const form = el(
    'form',
    {
      class: 'rule-form',
      onsubmit: (e) => {
        e.preventDefault();
        const url = normalisePath(pathInput.value);
        if (!url) { setStatus('error', 'Enter a site path such as /regions/usa/**.'); return; }
        const rule = currentRule();
        if (abacToggle.checked && !rule) { setStatus('error', 'Select a region, a company, or both.'); return; }
        const row = {
          url, 'cug-required': 'true', 'cug-groups': rule, 'cug-login-path': loginInput.value.trim(),
        };
        persist(upsertRow(sheet.rows, row), `Saved ${url} → ${rule || 'any signed-in user'}.`);
      },
    },
    el('label', {}, 'Path', pathInput),
    el('label', { class: 'toggle' }, abacToggle, 'Use ABAC based permission'),
    abacFields,
    groupsField,
    el('label', {}, 'Login path', loginInput),
    el('p', { class: 'preview-line' }, 'CUG rule: ', preview),
    el('div', { class: 'button-group' }, saveBtn),
  );

  // Apply / Remove (same behaviour as the shared plugin)
  const applyBtn = el('button', { class: 'action-btn', type: 'button' }, 'Apply Page Access');
  const removeBtn = el('button', { class: 'secondary-btn', type: 'button' }, 'Remove Page Access');
  buttons.push(saveBtn, applyBtn, removeBtn);

  applyBtn.addEventListener('click', async () => {
    setBusy(true);
    setStatus('loading', 'Applying Page Access...');
    try {
      ({ rows: sheet.rows } = await readSheet(org, site, token));
      renderRows();
      const cugHeaders = transformToHeadersConfig(sheet.rows);
      const merged = mergeHeaders(await fetchExistingNonCugHeaders(org, site, token), cugHeaders);
      await postHeaders(org, site, merged, token);
      setStatus('success', `Done — access restrictions applied to ${Object.keys(cugHeaders).length} restricted page(s) (${Object.keys(merged).length} total).`);
    } catch (err) {
      setStatus('error', `Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  });

  removeBtn.addEventListener('click', async () => {
    setBusy(true);
    setStatus('loading', 'Removing Page Access...');
    try {
      await postHeaders(org, site, await fetchExistingNonCugHeaders(org, site, token), token);
      setStatus('success', 'Done — all CUG headers removed.');
    } catch (err) {
      setStatus('error', `Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  });

  container.append(
    el('h2', {}, 'Page Access'),
    el('p', { class: 'description' }, 'Manage the access restrictions defined in the closed-user-groups sheet for your site.'),
    el('section', {}, el('h3', {}, 'Add or edit a rule'), form),
    el(
      'section',
      {},
      el('h3', {}, 'Rules in closed-user-groups'),
      el(
        'table',
        { class: 'rules' },
        el('thead', {}, el('tr', {}, ['Path', 'Groups / attributes', 'Login path', ''].map((h) => el('th', {}, h)))),
        tbody,
      ),
    ),
    el('div', { class: 'button-group' }, applyBtn, removeBtn),
    status,
  );

  refreshForm();
  setBusy(true);
  setStatus('loading', 'Loading rules...');
  readSheet(org, site, token)
    .then((loaded) => {
      sheet = loaded;
      renderRows();
      setStatus('', '');
    })
    .catch((err) => setStatus('error', `Error: ${err.message}`))
    .finally(() => setBusy(false));
}

(async function init() {
  const { context, token } = await DA_SDK;
  const { org, repo, path } = context;
  renderApp(document.body, {
    org, site: context.site || repo, token, pagePath: path,
  });
}());
