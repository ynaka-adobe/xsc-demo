export default function decorate(block) {
  const [story, preview] = block.firstElementChild?.children || [];

  if (story) {
    story.classList.add('paper-showcase-story');
    const first = story.firstElementChild;
    if (first?.tagName === 'P' && first.nextElementSibling) first.classList.add('paper-eyebrow');
    story.querySelector('ul')?.classList.add('paper-showcase-stats');
  }

  if (preview) {
    preview.classList.add('paper-showcase-browser');
    const firstP = preview.querySelector(':scope > p');
    const url = firstP && !firstP.querySelector('picture') ? firstP : null;
    const chrome = document.createElement('div');
    chrome.className = 'paper-browser-bar';
    chrome.innerHTML = '<span class="paper-browser-dots"><i></i><i></i><i></i></span><span class="paper-browser-url"></span>';
    chrome.querySelector('.paper-browser-url').textContent = url ? url.textContent.trim() : window.location.host;
    url?.remove();

    const page = document.createElement('div');
    page.className = 'paper-browser-page';
    page.append(...preview.childNodes);
    preview.append(chrome, page);
  }
}
