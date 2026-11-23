export default function decorate(block) {
  const [story, preview] = block.firstElementChild?.children || [];

  if (story) {
    story.classList.add('showcase-story');
    const first = story.firstElementChild;
    if (first?.tagName === 'P' && first.nextElementSibling) first.classList.add('eyebrow');
    story.querySelector('ul')?.classList.add('showcase-stats');
  }

  if (preview) {
    preview.classList.add('showcase-browser');
    const firstP = preview.querySelector(':scope > p');
    const url = firstP && !firstP.querySelector('picture') ? firstP : null;
    const chrome = document.createElement('div');
    chrome.className = 'showcase-bar';
    chrome.innerHTML = '<span class="showcase-dots"><i></i><i></i><i></i></span><span class="showcase-url"></span>';
    chrome.querySelector('.showcase-url').textContent = url ? url.textContent.trim() : window.location.host;
    url?.remove();

    const page = document.createElement('div');
    page.className = 'showcase-page';
    page.append(...preview.childNodes);
    preview.append(chrome, page);
  }
}
