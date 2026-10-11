const VIDEO_RE = /\.(mp4|webm)(\?|#|$)/i;

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
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.autoplay = true;
    video.setAttribute('autoplay', '');
  }
  return video;
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
}
