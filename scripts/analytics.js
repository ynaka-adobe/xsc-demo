/*
 * Adobe Analytics (direct AppMeasurement), per docs/xsc-demo-analytics-tagging-spec.md.
 *
 * initDataLayer()  - lazy phase: stamps blocks and starts listeners that push to
 *                    window.xscDataLayer (cheap, so early clicks are not lost).
 * loadAnalytics()  - delayed phase: loads AppMeasurement, fires the page view and
 *                    drains the data layer into s.t() / s.tl() calls.
 *
 * Beacons are only sent on production hosts. Elsewhere, or with ?analytics=debug,
 * hits are logged to the console instead.
 */
import { getMetadata } from './aem.js';

const CONFIG = {
  account: 'acsmarketingxsc-demo',
  trackingServer: 'acsmarketing.sc.omtrdc.net',
  visitorNamespace: 'adobe',
  productionHosts: ['xsc-demo.ynaka-adobe.com', 'xsc-demo.adobe.com'],
  downloadTypes: ['pdf', 'zip', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'mp4'],
  scrollMilestones: [25, 50, 75, 100],
};

const DL = 'xscDataLayer';
const dataLayer = () => {
  window[DL] = window[DL] || [];
  return window[DL];
};
const push = (entry) => dataLayer().push(entry);

const isDebug = () => {
  try {
    const p = new URLSearchParams(window.location.search).get('analytics');
    if (p === 'debug') localStorage.setItem('xsc-analytics-debug', '1');
    if (p === 'off') localStorage.removeItem('xsc-analytics-debug');
    return !!localStorage.getItem('xsc-analytics-debug');
  } catch {
    return false;
  }
};
const isProduction = () => CONFIG.productionHosts.includes(window.location.hostname);
const isDisabled = () => getMetadata('analytics').toLowerCase() === 'off';

/* ---------- access code (raw code stays in sessionStorage; only a hash is sent) ---------- */

const CODE_KEY = 'xsc-access-code';
const normalizeCode = (code) => (code || '').trim().toUpperCase();

function rememberCode(code) {
  const value = normalizeCode(code);
  if (!value) return;
  try {
    sessionStorage.setItem(CODE_KEY, value);
  } catch {
    // storage unavailable
  }
}

function captureCodeParam() {
  rememberCode(new URLSearchParams(window.location.search).get('code'));
}

export async function codeAlias(code) {
  const value = normalizeCode(code);
  if (!value || !window.crypto?.subtle) return '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `ac-${hex.slice(0, 10)}`;
}

function storedCode() {
  try {
    return sessionStorage.getItem(CODE_KEY) || '';
  } catch {
    return '';
  }
}

/* ---------- component context ---------- */

function stampComponents(main) {
  const sections = [...main.querySelectorAll(':scope > .section')];
  const counts = {};
  main.querySelectorAll('.block[data-block-name]').forEach((block) => {
    if (block.dataset.componentId) return;
    const name = block.dataset.blockName;
    counts[name] = (counts[name] || 0) + 1;
    const section = sections.indexOf(block.closest('.section')) + 1;
    block.dataset.componentId = `${name}-${section}-${counts[name]}`;
    block.dataset.componentPosition = counts[name];
    block.dataset.componentSection = section;
  });
}

function componentFor(el) {
  const block = el.closest('[data-component-id]');
  if (block) {
    return {
      id: block.dataset.componentId,
      blockName: block.dataset.blockName,
      position: Number(block.dataset.componentPosition),
      sectionIndex: Number(block.dataset.componentSection),
    };
  }
  const section = el.closest('.section');
  if (!section) return null;
  const index = [...section.parentElement.children].indexOf(section) + 1;
  return {
    id: `content-${index}`, blockName: 'content', position: 1, sectionIndex: index,
  };
}

/* ---------- listeners (lazy phase) ---------- */

function fileOf(url) {
  const ext = url.pathname.split('.').pop().toLowerCase();
  return CONFIG.downloadTypes.includes(ext) ? url.pathname.split('/').pop() : '';
}

function onClick(e) {
  const a = e.target.closest('a[href], button');
  if (!a || !a.closest('main') || a.matches('button[type="submit"]')) return;
  const component = componentFor(a);
  const text = (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 100);
  const href = a.getAttribute('href');
  let url;
  try {
    url = href ? new URL(href, window.location.href) : null;
  } catch {
    url = null;
  }
  const blockName = component ? component.blockName : 'page';
  const file = url ? fileOf(url) : '';
  if (file) {
    push({
      event: 'download',
      link: { text, url: url.href, regionLinkType: `${blockName}:download` },
      file,
    });
    return;
  }
  const isCta = a.classList.contains('button') || (component && component.blockName !== 'content');
  if (!isCta || (url && url.hash && url.pathname === window.location.pathname)) return;
  push({
    event: 'ctaClick',
    component,
    link: { text, url: url ? url.href : '', regionLinkType: `${blockName}:cta` },
  });
}

const formName = (form) => form.getAttribute('name') || form.id
  || form.closest('[data-block-name]')?.dataset.blockName || 'form';

function watchForms(main) {
  const started = new WeakSet();
  main.addEventListener('focusin', (e) => {
    const form = e.target.closest('form');
    if (!form || started.has(form)) return;
    started.add(form);
    push({ event: 'formStart', form: { name: formName(form) } });
  });
  // Forms that handle their own fetch dispatch xsc:form-success on success;
  // native-post forms (e.g. demo access code) count on submit.
  main.addEventListener('xsc:form-success', (e) => {
    push({ event: 'formSubmit', form: { name: formName(e.target) } });
  });
  main.addEventListener('submit', (e) => {
    const codeInput = e.target.querySelector('input[name="code"]');
    if (codeInput) rememberCode(codeInput.value);
    if (e.target.dataset.action) return;
    push({ event: 'formSubmit', form: { name: formName(e.target) } });
  });
}

function watchScroll() {
  const hit = new Set();
  let ticking = false;
  const check = () => {
    ticking = false;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const pct = max <= 0 ? 100 : Math.round((window.scrollY / max) * 100);
    CONFIG.scrollMilestones.forEach((m) => {
      if (pct >= m && !hit.has(m)) {
        hit.add(m);
        push({ event: 'scrollMilestone', scroll: { depth: m } });
      }
    });
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(check);
    }
  }, { passive: true });
}

function watchImpressions(main) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      // 50% of the block, or half the viewport for blocks taller than 2x the viewport.
      const seen = entry.intersectionRatio >= 0.5
        || entry.intersectionRect.height >= window.innerHeight * 0.5;
      if (!entry.isIntersecting || !seen) return;
      io.unobserve(entry.target);
      push({ event: 'componentImpression', component: componentFor(entry.target) });
    });
  }, { threshold: [0, 0.1, 0.25, 0.5] });
  main.querySelectorAll('[data-component-id]').forEach((b) => io.observe(b));
}

let initialized = false;
export function initDataLayer() {
  if (initialized) return;
  initialized = true;
  if (isDisabled()) return;
  captureCodeParam();
  dataLayer();
  const main = document.querySelector('main');
  if (!main) return;
  stampComponents(main);
  main.addEventListener('click', onClick);
  watchForms(main);
  watchScroll();
  watchImpressions(main);
}

/* ---------- AppMeasurement (delayed phase) ---------- */

async function sessionTier() {
  try {
    const resp = await fetch('/auth/me', { credentials: 'same-origin', cache: 'no-store' });
    if (!resp.ok || !resp.headers.get('content-type')?.includes('json')) return '';
    const me = await resp.json();
    if (!me.authenticated) return '';
    return me.guest ? 'customer-guest' : 'employee';
  } catch {
    return '';
  }
}

/**
 * eVar15 precedence: access-tier metadata, then the signed-in session (/auth/me),
 * then a redeemed access code (customer-guest), otherwise unknown.
 */
async function accessContext() {
  const code = storedCode();
  const tier = getMetadata('access-tier')
    || await sessionTier()
    || (code ? 'customer-guest' : 'unknown');
  return { tier, alias: await codeAlias(code) };
}

function pageContext(access) {
  const slug = window.location.pathname.replace(/^\/|\/$/g, '').replace(/\//g, ':') || 'home';
  return {
    path: window.location.pathname,
    template: getMetadata('template') || 'default',
    locale: document.documentElement.lang || 'en',
    demoId: getMetadata('demo-id') || slug,
    accessTier: access.tier,
    accessCode: access.alias,
  };
}

const HIT_VARS = ['eVar3', 'eVar4', 'eVar5', 'eVar6', 'eVar10', 'eVar11', 'eVar12', 'eVar13', 'eVar14',
  'prop3', 'prop4', 'prop10', 'events', 'linkTrackVars', 'linkTrackEvents'];

function toHit(entry) {
  const c = entry.component || {};
  const l = entry.link || {};
  const comp = {
    eVar3: c.id, eVar4: c.blockName, eVar5: String(c.position ?? ''), eVar6: String(c.sectionIndex ?? ''), prop3: c.id, prop4: c.blockName,
  };
  switch (entry.event) {
    case 'componentImpression':
      return {
        name: 'Component Impression', type: 'o', events: 'event1', vars: comp,
      };
    case 'ctaClick':
      return {
        name: 'CTA Click',
        type: 'o',
        events: 'event2',
        vars: {
          ...comp, eVar10: l.text, eVar11: l.url, prop10: l.regionLinkType,
        },
      };
    case 'download':
      return {
        name: entry.file,
        type: 'd',
        events: 'event3',
        vars: {
          eVar10: l.text, eVar11: l.url, eVar12: entry.file, prop10: l.regionLinkType,
        },
      };
    case 'formStart':
      return {
        name: 'Form Start', type: 'o', events: 'event4', vars: { eVar14: entry.form.name },
      };
    case 'formSubmit':
      return {
        name: 'Form Submit', type: 'o', events: 'event5', vars: { eVar14: entry.form.name },
      };
    case 'scrollMilestone':
      return {
        name: 'Scroll Milestone', type: 'o', events: 'event6', vars: { eVar13: `${entry.scroll.depth}%` },
      };
    default:
      return null;
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

export async function loadAnalytics() {
  if (isDisabled()) return;
  initDataLayer();
  const debug = isDebug();
  const send = isProduction();
  // eslint-disable-next-line no-console
  const log = (...args) => debug && console.log('[analytics]', ...args);

  const page = pageContext(await accessContext());
  dataLayer().unshift({ event: 'page', page });

  let s = null;
  if (send) {
    try {
      await loadScript(`${window.hlx.codeBasePath}/scripts/appmeasurement.min.js`);
      s = window.s_gi(CONFIG.account);
      s.trackingServer = CONFIG.trackingServer;
      s.trackingServerSecure = CONFIG.trackingServer;
      s.visitorNamespace = CONFIG.visitorNamespace;
      s.trackDownloadLinks = false; // downloads are tracked explicitly as event3
      s.trackExternalLinks = true;
      s.linkInternalFilters = [window.location.hostname, ...CONFIG.productionHosts].join(',');
      s.useBeacon = true;
      s.debugTracking = debug;
    } catch (e) {
      log('AppMeasurement failed to load', e);
      s = null;
    }
  }

  const handle = (entry) => {
    if (entry.event === 'page') {
      const p = entry.page;
      const vars = {
        pageName: p.path,
        eVar1: p.template,
        eVar2: p.locale,
        eVar15: p.accessTier,
        eVar16: p.accessCode,
        eVar17: p.demoId,
        prop1: p.path,
        campaign: new URLSearchParams(window.location.search).get('cid') || undefined,
      };
      log('s.t()', vars);
      if (s) {
        Object.assign(s, vars);
        s.t();
      }
      return;
    }
    const hit = toHit(entry);
    if (!hit) return;
    log(`s.tl(${hit.type}, ${hit.name})`, hit.events, hit.vars);
    if (!s) return;
    Object.assign(s, hit.vars, {
      events: hit.events,
      linkTrackVars: [...Object.keys(hit.vars), 'events'].join(','),
      linkTrackEvents: hit.events,
    });
    s.tl(true, hit.type, hit.name);
    HIT_VARS.forEach((k) => { s[k] = undefined; });
  };

  const dl = dataLayer();
  dl.forEach(handle);
  dl.push = (...entries) => {
    entries.forEach(handle);
    return Array.prototype.push.apply(dl, entries);
  };
}
