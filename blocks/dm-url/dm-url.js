/*
 * dm-url: renders Dynamic Media URLs live, side by side.
 *   | Label | https://s7d9.scene7.com/is/image/CEM/asset | Note (optional) |
 * Images load straight from Dynamic Media (not copied into Edge Delivery media).
 */

const cellText = (cell) => (cell?.textContent ?? '').trim();

export default function decorate(block) {
  const list = document.createElement('ul');
  [...block.children].forEach((row) => {
    const [labelCell, urlCell, noteCell] = row.children;
    const url = urlCell?.querySelector('a')?.href || cellText(urlCell);
    if (!url) return;
    const li = document.createElement('li');

    const label = document.createElement('h3');
    label.textContent = cellText(labelCell);

    const frame = document.createElement('div');
    frame.className = 'dm-url-frame';
    const img = document.createElement('img');
    img.src = url.includes('?') ? url : `${url}?wid=800`;
    img.alt = cellText(labelCell);
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      frame.classList.add('dm-url-error');
      frame.textContent = 'Not available';
    });
    frame.append(img);

    const link = document.createElement('a');
    link.className = 'dm-url-link';
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    const code = document.createElement('code');
    code.textContent = url;
    link.append(code);

    li.append(label, frame, link);
    if (noteCell && cellText(noteCell)) {
      const note = document.createElement('p');
      note.className = 'dm-url-note';
      note.append(...noteCell.childNodes);
      li.append(note);
    }
    list.append(li);
  });
  block.replaceChildren(list);
}
