/**
 * Real-time visitor identity, ported from ynaka-adobe/3m (PR #47).
 *
 * When a visitor submits a Marketo form, or this site's own form block
 * (which dispatches `xsc:form-success`), the submitted values are captured
 * client-side.
 * This module keeps the latest submission in memory so the insights panel can
 * show what a first-party identity actually looks like at the moment it is
 * created, instead of describing it in the abstract.
 *
 * ── Why this is deliberately NOT on the data layer ────────────────────────
 * Everything pushed to `window.xscDataLayer` is forwarded verbatim to the
 * configured transport — AppMeasurement or Web SDK — and from there to Adobe.
 * Names, email addresses and phone numbers must not take that path: sending
 * direct identifiers into a report suite is a real compliance problem, not a
 * stylistic one, and it is not something a demo should model as acceptable.
 *
 * So identity travels on its own in-memory channel, read only by the panel.
 * `analytics.js` continues to emit `formSubmit` with the component and form
 * name and no field values, which is the event that reaches Adobe.
 *
 * ── Retention ─────────────────────────────────────────────────────────────
 * Memory only, for the life of the page. Nothing is written to localStorage,
 * sessionStorage or a cookie, and nothing is logged to the console. A reload
 * clears it.
 *
 * ── Demo mode only ────────────────────────────────────────────────────────
 * `observeIdentity` is called exclusively by the insights panel, which only an
 * employee can open from the account menu. A normal visitor never runs this.
 *
 * ── A note for anyone testing this ────────────────────────────────────────
 * Marketo will not accept a submission from an unrecognised origin, so on
 * localhost the POST never happens and `onSuccess` never fires — the form just
 * sits there. Verify on a deployed preview or on the live domain instead.
 */

/** Marketo plumbing that is not visitor-supplied and never worth showing. */
const SYSTEM_FIELDS = new Set([
  'formid', 'munchkinId', 'formVid', 'lpId', 'subId', 'kw', 'cr', 'searchstr',
  'queryStr', '_mkt_trk', 'returnLPId', 'retURL', 'mkt_tok',
]);

/**
 * Fields we treat as direct identifiers. They are still displayed — the point
 * of the card is to show a real identity forming — but they are flagged so the
 * panel can mark them, and so anyone reading this knows exactly which values
 * are sensitive if this module is ever reused.
 */
const DIRECT_IDENTIFIERS = new Set([
  'Email', 'Phone', 'FirstName', 'LastName',
  'email', 'phone', 'name', 'firstName', 'lastName', 'first-name', 'last-name',
]);

const listeners = new Set();
let current = null;
let hooked = false;

/** Tidies a Marketo label: "*Email Address:" → "Email Address". */
function cleanLabel(raw, fallback) {
  const text = (raw || '')
    .replace(/\s+/g, ' ')
    .replace(/^\*/, '')
    .replace(/:$/, '')
    .trim();
  return text || fallback;
}

/** Field name → readable title: "FirstName" → "First Name", "year" → "Year". */
function humanise(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Reads the visitor-supplied fields out of a Marketo form element.
 *
 * `form.vals()` only returns fields Marketo has mapped to lead attributes — on
 * the 3M quote form that is name, email and phone, but not the vehicle or
 * product fields the visitor also filled in. So the DOM is the source of truth
 * for what was typed, and `vals()` is merged over it for anything Marketo knows
 * about that is not rendered as an input.
 *
 * @param {Element} formEl the `<form>` element
 * @param {Object} vals Marketo's own value map
 * @returns {Array<{name: string, label: string, value: string, sensitive: boolean}>}
 */
function readFields(formEl, vals) {
  const byName = new Map();

  const put = (name, label, value, sensitive) => {
    if (!name || SYSTEM_FIELDS.has(name) || !value) return;
    byName.set(name, {
      name, label, value, sensitive,
    });
  };

  if (formEl) {
    formEl.querySelectorAll('input, select, textarea').forEach((input) => {
      const { name, type } = input;
      if (!name || type === 'hidden' || SYSTEM_FIELDS.has(name)) return;
      const label = cleanLabel(
        formEl.querySelector(`label[for="${input.id}"]`)?.textContent,
        name,
      );
      const sensitive = DIRECT_IDENTIFIERS.has(name);

      if (type === 'checkbox' || type === 'radio') {
        if (!input.checked) return;
        // Several checkboxes share one name (e.g. `product`), and each one's
        // label is the choice rather than the field. Collect the checked
        // labels into a single entry titled after the field itself.
        const existing = byName.get(name);
        put(
          name,
          humanise(name),
          existing ? `${existing.value}, ${label}` : label,
          sensitive,
        );
        return;
      }
      put(name, label, input.value.trim(), sensitive);
    });
  }

  Object.entries(vals || {}).forEach(([name, value]) => {
    if (byName.has(name)) return;
    put(name, humanise(name), typeof value === 'string' ? value.trim() : '', DIRECT_IDENTIFIERS.has(name));
  });

  return [...byName.values()];
}

/** Notifies the panel. Listener errors must not break form submission. */
function emit() {
  listeners.forEach((fn) => {
    try {
      fn(current);
    } catch (e) {
      /* a broken listener is not worth failing a lead capture over */
    }
  });
}

function store(formEl, fields, fallbackSource, formId) {
  if (!fields.length) return;
  current = {
    fields,
    source: formEl?.closest('[data-block-name]')?.dataset.blockName
      || (formEl?.closest('.modal, dialog') ? 'modal' : fallbackSource),
    formId,
    at: new Date(),
  };
  emit();
}

function capture(form) {
  const formEl = form.getFormElem?.()[0];
  store(formEl, readFields(formEl, form.vals?.()), 'marketo', form.getId?.() ?? null);
}

/**
 * Subscribes to identity updates. Fires immediately with the current profile
 * if one already exists, so a panel opened after a submission is not blank.
 *
 * @param {Function} fn receives the profile, or null when there is none
 * @returns {Function} unsubscribe
 */
export function onIdentity(fn) {
  listeners.add(fn);
  if (current) fn(current);
  return () => listeners.delete(fn);
}

/** @returns {Object|null} the current in-memory profile */
export function getIdentity() {
  return current;
}

/**
 * Starts listening for Marketo submissions. Safe to call more than once.
 *
 * Marketo loads asynchronously and may not be present at all on pages without
 * a form, so this polls briefly and then gives up rather than waiting forever.
 */
/**
 * Puts the submit button back the way Marketo found it.
 *
 * Marketo disables the button and swaps its label to "Please Wait" while the
 * submission is in flight, then relies on the follow-up navigation to clear
 * it. Since we cancel that navigation, nothing ever resets it and the form is
 * left looking permanently stuck.
 */
function restoreSubmitButton(formEl, label) {
  const btn = formEl?.querySelector('.mktoButton');
  if (!btn) return;
  btn.disabled = false;
  btn.removeAttribute('disabled');
  if (label) btn.textContent = label;
}

export function observeIdentity() {
  if (hooked) return;
  hooked = true;

  // This site's form block posts via fetch and announces success itself.
  document.addEventListener('xsc:form-success', (e) => {
    const formEl = e.target.closest?.('form') || e.target;
    store(formEl, readFields(formEl), 'form', null);
  });

  const hook = () => {
    if (!window.MktoForms2?.whenReady) return false;
    window.MktoForms2.whenReady((form) => {
      const formEl = form.getFormElem?.()[0];
      // read the label now, before Marketo overwrites it with "Please Wait"
      const label = formEl?.querySelector('.mktoButton')?.textContent;
      // `onSuccess` fires after Marketo has accepted the submission, so the
      // values are the ones actually taken, not an abandoned draft.
      form.onSuccess(() => {
        capture(form);
        restoreSubmitButton(formEl, label);
        // Returning false cancels Marketo's follow-up navigation. Without it
        // the page reloads immediately and the profile — which is held in
        // memory by design — is gone before anyone can look at it. The lead is
        // still saved; only the redirect is suppressed.
        //
        // This is safe to do unconditionally because `observeIdentity` is only
        // ever called by the insights panel, which only employees can open. A
        // normal visitor never reaches this code and still gets the redirect.
        return false;
      });
    });
    return true;
  };

  if (hook()) return;
  let attempts = 0;
  const poll = window.setInterval(() => {
    attempts += 1;
    if (hook() || attempts > 40) window.clearInterval(poll);
  }, 500);
}

export default observeIdentity;
