const VIDEO_RE = /\.(mp4|webm)(\?|#|$)/i;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FADE_MS = REDUCED_MOTION ? 0 : 350;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function buildVideo(src) {
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.src = src;
  if (!REDUCED_MOTION) {
    video.autoplay = true;
    video.setAttribute('autoplay', '');
  }
  return video;
}

async function swap(from, to) {
  from.classList.add('hero-leave');
  await wait(FADE_MS);
  from.hidden = true;
  from.classList.remove('hero-leave');
  to.classList.remove('hero-enter');
  to.hidden = false;
  // restart the entrance animation
  // eslint-disable-next-line no-unused-expressions
  to.offsetWidth;
  to.classList.add('hero-enter');
}

function buildJourneysPanel(source) {
  const panel = document.createElement('div');
  panel.className = 'hero-journeys';
  panel.hidden = true;

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'hero-back';
  back.setAttribute('aria-label', 'Back');
  back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  panel.append(back);

  panel.append(...source.children);
  panel.querySelectorAll('.cards.journeys li').forEach((li, i) => {
    li.style.setProperty('--i', i);
    li.querySelectorAll('.button-container, .button').forEach((el) => el.classList.remove('button-container', 'button', 'primary', 'secondary'));
  });
  source.remove();
  return { panel, back };
}

function setupJourneys(block, card) {
  const source = document.querySelector('main .cards.journeys')?.closest('.section');
  const links = [...card.querySelectorAll('a[href]')];
  const cta = links[links.length - 1];
  if (!source || !cta) return;
  source.classList.add('hero-journeys-source');

  const preload = () => source.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
  cta.addEventListener('pointerenter', preload, { once: true });
  cta.addEventListener('focus', preload, { once: true });

  let journeys;
  cta.addEventListener('click', async (e) => {
    if (!journeys && source.dataset.sectionStatus !== 'loaded') return;
    e.preventDefault();
    if (!journeys) {
      preload();
      journeys = buildJourneysPanel(source);
      block.append(journeys.panel);
      journeys.back.addEventListener('click', async () => {
        block.classList.remove('journeys-open');
        await swap(journeys.panel, card);
        cta.focus({ preventScroll: true });
      });
    }
    block.classList.add('journeys-open');
    await swap(card, journeys.panel);
    journeys.back.focus({ preventScroll: true });
  });
}

export default function decorate(block) {
  const link = [...block.querySelectorAll('a')].find((a) => VIDEO_RE.test(a.getAttribute('href')));
  if (!link) return;

  block.classList.add('video');
  const bg = document.createElement('div');
  bg.className = 'hero-video-bg';
  bg.append(buildVideo(link.href));

  const holder = link.closest('p, .button-container') || link;
  holder.remove();

  const card = document.createElement('div');
  card.className = 'hero-card';
  [...block.children].forEach((row) => {
    [...row.children].forEach((cell) => card.append(...cell.childNodes));
    row.remove();
  });
  block.append(bg, card);
  setupJourneys(block, card);
}
