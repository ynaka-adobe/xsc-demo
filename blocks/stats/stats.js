export default function decorate(block) {
  const list = document.createElement('dl');
  [...block.children].forEach((row) => {
    const [num, label] = row.children;
    if (!num || !label) return;
    const item = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = num.textContent.trim();
    dd.append(...label.childNodes);
    item.append(dt, dd);
    list.append(item);
  });
  block.replaceChildren(list);
}
