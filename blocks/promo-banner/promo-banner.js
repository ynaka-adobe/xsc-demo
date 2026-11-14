import { loadFragment } from '../fragment/fragment.js';

// ---------------------------------------------------------------------------
// Internal helpers (same logic as scripts/promo-scheduler.js but returns the
// chosen path rather than injecting HTML, so we can use loadFragment instead).
// ---------------------------------------------------------------------------

const DATE_KEY = 'url.date';

function getEffectiveDate() {
  const params = new URLSearchParams(window.location.search);
  const urlDate = params.get(DATE_KEY);
  if (urlDate) {
    sessionStorage.setItem(DATE_KEY, urlDate);
    return new Date(urlDate);
  }
  const stored = sessionStorage.getItem(DATE_KEY);
  if (stored) return new Date(stored);
  return new Date();
}

async function resolvePromoFragment(schedulerUrl) {
  let resp;
  try {
    resp = await fetch(schedulerUrl);
  } catch {
    return null;
  }
  if (!resp.ok) return null;

  const { data } = await resp.json();
  const now = getEffectiveDate();

  const rows = data
    .map((row) => ({
      start: row.start ? new Date(row.start) : null,
      end: row.end ? new Date(row.end) : null,
      // Support both "fragment URL" (current sheet header) and "fragment"
      fragment: row['fragment URL'] || row.fragment || '',
    }))
    .filter((row) => row.fragment);
  const match = rows.find(({ start, end }) => start && end && now >= start && now < end)?.fragment;
  const fallback = rows.find(({ start, end }) => !start && !end)?.fragment;

  return match || fallback || null;
}

export default async function decorate(block) {
  // The block contains a link to the promo-scheduler JSON, e.g.:
  //   /fragments/promo-scheduler.json
  // We read that URL, run the scheduler, then replace the block with
  // the winning fragment's decorated content.
  const link = block.querySelector('a');
  const schedulerUrl = link ? link.getAttribute('href') : block.textContent.trim();

  if (!schedulerUrl) return;

  const fragmentPath = await resolvePromoFragment(schedulerUrl);
  if (!fragmentPath) return;

  const fragment = await loadFragment(fragmentPath);
  if (fragment) {
    const fragmentSection = fragment.querySelector(':scope .section');
    if (fragmentSection) {
      block.closest('.section').classList.add(...fragmentSection.classList);
      block.closest('.promo-banner').replaceWith(...fragment.childNodes);
    }
  }
}
