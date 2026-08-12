import { loadCSS, getMetadata } from './aem.js';

const RUNTIME_URL = 'https://332794-868ceruleanwhale.adobeioruntime.net/api/v1/web/default/target-activities';

async function runtimeFetch(params) {
  const url = `${RUNTIME_URL}?${new URLSearchParams(params)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Runtime error: ${resp.status}`);
  return resp.json();
}

/** Mbox names referenced on this page: the hero-mbox meta tag and any decorated target-offer blocks. */
function pageMboxNames() {
  const names = new Set();
  const heroMbox = getMetadata('target-mbox-hero')?.trim();
  if (heroMbox) names.add(heroMbox);
  document.querySelectorAll('[data-mbox-name]').forEach((el) => {
    const name = el.dataset.mboxName?.trim();
    if (name) names.add(name);
  });
  return [...names];
}

/** Audiences targeted by live (approved) activities whose mbox matches one of mboxNames. */
async function fetchAudiencesForMboxes(mboxNames) {
  if (!mboxNames.length) return [];

  const { activities } = await runtimeFetch({});
  const live = (activities ?? []).filter((a) => a.state === 'approved');

  const details = await Promise.all(
    live.map((a) => runtimeFetch({ resource: 'activity', type: a.type, id: a.id }).catch(() => null)),
  );

  const audienceIds = new Set();
  details.forEach((activity) => {
    const mboxes = activity?.locations?.mboxes ?? [];
    if (!mboxes.some((m) => mboxNames.includes(m.name))) return;
    (activity.experiences ?? []).forEach((exp) => {
      (exp.audienceIds ?? []).forEach((id) => audienceIds.add(id));
    });
  });

  const audiences = await Promise.all(
    [...audienceIds].map((id) => runtimeFetch({ resource: 'audience', id }).catch(() => null)),
  );
  return audiences.filter(Boolean);
}

function closeList() {
  document.querySelector('.audiences-list')?.remove();
  document.removeEventListener('click', onOutsideClick, true);
}

function onOutsideClick(e) {
  if (!e.target.closest('.audiences-list')) closeList();
}

/** Current audience selection, derived from the ?mode= query param (unset = "Default"). */
function activeMode() {
  return new URLSearchParams(window.location.search).get('mode');
}

function goToMode(mode) {
  const url = new URL(window.location.href);
  if (mode) url.searchParams.set('mode', mode);
  else url.searchParams.delete('mode');
  window.location.href = url.toString();
}

function renderList(audiences) {
  closeList();

  const list = document.createElement('ul');
  list.className = 'audiences-list';
  list.setAttribute('role', 'listbox');

  const current = activeMode();

  const addOption = (label, mode, selected) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', String(selected));
    if (selected) btn.classList.add('is-selected');
    btn.addEventListener('click', () => goToMode(mode));
    li.append(btn);
    list.append(li);
  };

  addOption('Default', null, !current);
  if (!audiences.length) {
    const li = document.createElement('li');
    li.className = 'audiences-list__empty';
    li.textContent = 'No active audiences for this page.';
    list.append(li);
  } else {
    audiences.forEach((a) => {
      addOption(a.name, a.name, current?.toLowerCase() === a.name.toLowerCase());
    });
  }

  document.body.append(list);
  // Defer so the click that opened the list doesn't immediately close it.
  setTimeout(() => document.addEventListener('click', onOutsideClick, true), 0);
}

export default async function showAudiences() {
  await loadCSS('/styles/audiences.css');

  if (document.querySelector('.audiences-list')) {
    closeList();
    return;
  }

  const list = document.createElement('ul');
  list.className = 'audiences-list';
  list.innerHTML = '<li class="audiences-list__empty">Loading…</li>';
  document.body.append(list);

  const mboxNames = pageMboxNames();
  try {
    const audiences = await fetchAudiencesForMboxes(mboxNames);
    renderList(audiences);
  } catch (err) {
    renderList([]);
    // eslint-disable-next-line no-console
    console.error('[audiences]', err);
  }
}
