/*
 * Pure helpers for the Page Access (CUG) plugin: building ABAC rules and
 * editing closed-user-groups sheet rows. No DOM or network, so they can be
 * exercised with plain Node.
 *
 * The rule syntax must match the edge function's parser
 * (AEM-p154856 edge-functions-xsc-demo/src/abac.js):
 *   comma = AND, `|` = OR, `country:XX`, `company:name`, `group:name`.
 */

// ─── ABAC vocabulary offered in the UI ──────────────────────────────────────

export const COUNTRIES = [
  { value: 'US', label: 'United States (US)' },
  { value: 'JP', label: 'Japan (JP)' },
  { value: 'DE', label: 'Germany (DE)' },
];

export const COMPANIES = [
  { value: 'adobe', label: 'Adobe' },
  { value: 'caterpillar', label: 'Caterpillar' },
  { value: 'perficient', label: 'Perficient' },
];

export const ATTR_LOGGED_IN = 'logged-in';

// ─── Rule building ──────────────────────────────────────────────────────────

/**
 * Translates the ABAC selection into a CUG Groups cell. Every rule starts with
 * `logged-in` so the intent reads naturally in the sheet; the edge function
 * requires a session regardless. Returns '' when nothing was selected, because
 * an attribute rule with no attributes would silently mean "any user".
 */
export function buildAbacRule({ country, company } = {}) {
  const parts = [];
  if (country) parts.push(`country:${String(country).trim().toUpperCase()}`);
  if (company) parts.push(`company:${String(company).trim().toLowerCase()}`);
  return parts.length ? [ATTR_LOGGED_IN, ...parts].join(', ') : '';
}

/**
 * Reads an existing Groups cell back into the ABAC selection, so editing a
 * saved row pre-fills the dropdowns. Returns null when the cell is not a
 * simple ABAC rule this UI can represent (e.g. groups or OR rules).
 */
export function parseAbacRule(cell) {
  const text = String(cell || '').trim();
  if (!text || text.includes('|')) return null;
  const selection = { country: '', company: '' };
  const ok = text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).every((t) => {
    if (t === ATTR_LOGGED_IN) return true;
    if (t.startsWith('country:')) { selection.country = t.slice(8).toUpperCase(); return true; }
    if (t.startsWith('company:')) { selection.company = t.slice(8); return true; }
    return false;
  });
  return ok && (selection.country || selection.company) ? selection : null;
}

// ─── Path handling ──────────────────────────────────────────────────────────

/**
 * Normalises an authored URL pattern: leading slash, no `.html`, collapsed
 * slashes. Returns '' for values that cannot be a site path.
 */
export function normalisePath(value) {
  let p = String(value || '').trim();
  if (!p) return '';
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/').replace(/\.html$/, '');
  return /^\/[\w\-./*]*$/.test(p) ? p : '';
}

/**
 * Suggests a folder rule for the page open in DA:
 * `/regions/usa/index` → `/regions/usa/**`, `/about` → `/about`.
 */
export function suggestPath(pagePath) {
  const p = normalisePath(pagePath);
  if (!p) return '';
  if (p.endsWith('/index')) return `${p.slice(0, -'index'.length)}**`;
  return p;
}

// ─── Sheet rows ─────────────────────────────────────────────────────────────

/**
 * Inserts or replaces the row for `row.url`. Matching the url keeps the sheet
 * consistent with the plugin's "first row per path wins" apply rule, so a
 * saved rule is never shadowed by an older duplicate.
 */
export function upsertRow(rows, row) {
  const next = rows.filter((r) => (r.url || '').trim() !== row.url);
  const index = rows.findIndex((r) => (r.url || '').trim() === row.url);
  next.splice(index === -1 ? next.length : index, 0, row);
  return next;
}

export function removeRow(rows, url) {
  return rows.filter((r) => (r.url || '').trim() !== url);
}
