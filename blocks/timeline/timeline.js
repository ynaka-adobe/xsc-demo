/**
 * Timeline block.
 * Each row: date | phase (optional) | description.
 * Phase labels Blocker, Win, Commercial and Pivot get accent colors.
 */
export default function decorate(block) {
  const list = document.createElement('ol');
  list.className = 'timeline-list';
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const [date, phase, body] = cells.length >= 3 ? cells : [cells[0], null, cells[1]];
    const li = document.createElement('li');
    li.className = 'timeline-item';
    const when = document.createElement('div');
    when.className = 'timeline-date';
    when.textContent = date?.textContent.trim() || '';
    const content = document.createElement('div');
    content.className = 'timeline-content';
    if (phase && phase.textContent.trim()) {
      const tag = document.createElement('span');
      const label = phase.textContent.trim();
      tag.className = 'timeline-phase';
      tag.dataset.phase = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      tag.textContent = label;
      content.append(tag);
    }
    if (body) content.append(...body.childNodes);
    li.append(when, content);
    list.append(li);
  });
  block.replaceChildren(list);
}
