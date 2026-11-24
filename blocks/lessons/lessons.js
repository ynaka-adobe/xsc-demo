export default function decorate(block) {
  const list = document.createElement('ol');
  [...block.children].forEach((row, i) => {
    const [body, time] = row.children;
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'lessons-num';
    num.textContent = i + 1;
    body.className = 'lessons-body';
    body.querySelectorAll('p').forEach((p) => {
      if (/^checkpoint:/i.test(p.textContent.trim())) p.className = 'lessons-check';
    });
    li.append(num, body);
    if (time && time.textContent.trim()) {
      time.className = 'lessons-time';
      li.append(time);
    }
    list.append(li);
  });
  block.replaceChildren(list);
}
