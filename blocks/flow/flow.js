/* Architecture flow: rows are label | title | description. Bold title marks the key node. */
export default function decorate(block) {
  const list = document.createElement('ol');
  [...block.children].forEach((row) => {
    const [label, title, desc] = [...row.children].map((c) => c.textContent.trim());
    const li = document.createElement('li');
    if (row.querySelector('strong')) li.className = 'flow-key';
    li.innerHTML = '<span class="flow-label"></span><h3></h3><span class="flow-desc"></span>';
    li.querySelector('.flow-label').textContent = label || '';
    li.querySelector('h3').textContent = title || '';
    li.querySelector('.flow-desc').textContent = desc || '';
    list.append(li);
  });
  block.replaceChildren(list);
}
