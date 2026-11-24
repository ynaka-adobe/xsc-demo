export default function decorate(block) {
  const list = document.createElement('dl');
  [...block.children].forEach((row) => {
    const [label, value] = row.children;
    if (!label || !value) return;
    const item = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label.textContent.trim();
    dd.append(...value.childNodes);
    item.append(dt, dd);
    list.append(item);
  });
  block.replaceChildren(list);
}
