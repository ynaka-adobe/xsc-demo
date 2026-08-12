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

function closePanel() {
  document.querySelector('.audiences-panel')?.remove();
}

function renderPanel(audiences, mboxNames) {
  closePanel();

  const overlay = document.createElement('div');
  overlay.className = 'audiences-panel';

  const panel = document.createElement('div');
  panel.className = 'audiences-panel__box';

  const header = document.createElement('div');
  header.className = 'audiences-panel__header';
  header.innerHTML = `<h3>Audiences${mboxNames.length ? ` — ${mboxNames.join(', ')}` : ''}</h3>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'audiences-panel__close';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closePanel);
  header.append(closeBtn);
  panel.append(header);

  if (!mboxNames.length) {
    panel.innerHTML += '<p class="audiences-panel__empty">No mbox found on this page.</p>';
  } else if (!audiences.length) {
    panel.innerHTML += '<p class="audiences-panel__empty">No active audiences found for this page\'s mbox(es).</p>';
  } else {
    const list = document.createElement('ul');
    list.className = 'audiences-panel__list';
    audiences.forEach((a) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = a.name;
      btn.addEventListener('click', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('mode', a.name);
        window.location.href = url.toString();
      });
      li.append(btn);
      list.append(li);
    });
    panel.append(list);
  }

  overlay.append(panel);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePanel(); });
  document.body.append(overlay);
}

export default async function showAudiences() {
  await loadCSS('/styles/audiences.css');

  const overlay = document.createElement('div');
  overlay.className = 'audiences-panel';
  overlay.innerHTML = '<div class="audiences-panel__box"><p class="audiences-panel__empty">Loading audiences…</p></div>';
  document.body.append(overlay);

  const mboxNames = pageMboxNames();
  try {
    const audiences = await fetchAudiencesForMboxes(mboxNames);
    renderPanel(audiences, mboxNames);
  } catch (err) {
    renderPanel([], mboxNames);
    // eslint-disable-next-line no-console
    console.error('[audiences]', err);
  }
}
