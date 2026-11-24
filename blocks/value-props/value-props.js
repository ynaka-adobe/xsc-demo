export default function decorate(block) {
  const list = document.createElement('ul');
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    if (cells.length < 2) {
      row.className = 'value-props-heading';
      return;
    }
    const li = document.createElement('li');
    const stat = document.createElement('p');
    stat.className = 'value-props-stat';
    stat.textContent = cells[0].textContent.trim();
    cells[1].className = 'value-props-body';
    li.append(stat, cells[1]);
    list.append(li);
    row.remove();
  });
  block.append(list);
}
