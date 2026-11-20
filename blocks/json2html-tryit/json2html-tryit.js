/*
 * json2html-tryit
 * Simulated, step-by-step walkthrough of turning an AEM Content Fragment into an
 * Edge Delivery page with JSON2HTML. Each row is a step:
 *   Step title | App name | Action label | Content (text, up to two code blocks)
 * The first code block is the "input", the second is revealed after the action runs.
 * If the content contains a link, the action fetches that page's .plain.html (live preview).
 */

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const PREVIEW_LOG = [
  'POST admin.hlx.page/preview/…/fragments/new-arrivals',
  'overlay → json2html.adobeaem.workers.dev',
  'GET  publish…/graphql/execute.json/global/xsc-fragment;path=…/new-arrivals',
  'GET  /templates/cf-fragment.html (Mustache)',
  'render JSON + template → HTML',
  'store in content bus → 200 OK',
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

async function runPreview(output, href) {
  const log = el('ol', 'json2html-tryit-log');
  output.append(log);
  // eslint-disable-next-line no-restricted-syntax
  for (const line of PREVIEW_LOG) {
    log.append(el('li', '', line));
    // eslint-disable-next-line no-await-in-loop
    await wait(350);
  }
  const frame = el('div', 'json2html-tryit-browser');
  const bar = el('div', 'json2html-tryit-urlbar', new URL(href, window.location).pathname);
  const body = el('div', 'json2html-tryit-page');
  frame.append(bar, body);
  output.append(frame);
  try {
    const resp = await fetch(`${new URL(href, window.location).pathname}.plain.html`);
    if (!resp.ok) throw new Error(resp.status);
    body.innerHTML = await resp.text();
  } catch (e) {
    body.textContent = `Could not load the published fragment (${e.message}).`;
  }
}

function buildStep(row, index, total, goTo) {
  const [titleCell, appCell, actionCell, contentCell] = [...row.children];
  const title = titleCell?.textContent.trim() || `Step ${index + 1}`;
  const app = appCell?.textContent.trim() || '';
  const action = actionCell?.textContent.trim() || 'Run';

  const panel = el('section', 'json2html-tryit-panel');
  panel.setAttribute('role', 'tabpanel');
  panel.id = `json2html-tryit-panel-${index}`;
  panel.hidden = index !== 0;

  const win = el('div', 'json2html-tryit-window');
  const chrome = el('div', 'json2html-tryit-chrome');
  chrome.append(el('span', 'json2html-tryit-dots'), el('span', 'json2html-tryit-app', app));
  const content = el('div', 'json2html-tryit-content');
  content.append(el('h3', '', title));

  const pres = contentCell ? [...contentCell.querySelectorAll('pre')] : [];
  const link = contentCell?.querySelector('a');
  const outputPre = pres[1];
  if (outputPre) outputPre.remove();
  if (link) link.closest('p')?.remove();
  if (contentCell) content.append(...contentCell.childNodes);

  const controls = el('div', 'json2html-tryit-controls');
  const runBtn = el('button', 'button primary', action);
  runBtn.type = 'button';
  const nextBtn = el('button', 'button secondary', index < total - 1 ? 'Next step →' : 'Start over');
  nextBtn.type = 'button';
  nextBtn.hidden = true;
  controls.append(runBtn, nextBtn);

  const output = el('div', 'json2html-tryit-output');
  output.hidden = true;

  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true;
    runBtn.classList.add('is-running');
    output.hidden = false;
    output.replaceChildren();
    await wait(600);
    if (link) await runPreview(output, link.getAttribute('href'));
    else if (outputPre) output.append(outputPre);
    else output.append(el('p', 'json2html-tryit-done', 'Done.'));
    runBtn.classList.remove('is-running');
    runBtn.disabled = false;
    nextBtn.hidden = false;
    panel.dataset.complete = 'true';
    goTo(index, true);
  });
  nextBtn.addEventListener('click', () => goTo(index < total - 1 ? index + 1 : 0));

  content.append(controls, output);
  win.append(chrome, content);
  panel.append(win);
  return { panel, title, app };
}

export default function decorate(block) {
  const rows = [...block.children];
  const nav = el('ol', 'json2html-tryit-steps');
  nav.setAttribute('role', 'tablist');
  const panels = el('div', 'json2html-tryit-panels');
  const tabs = [];

  const goTo = (i, markOnly = false) => {
    if (markOnly) {
      tabs[i].classList.add('is-complete');
      return;
    }
    tabs.forEach((tab, n) => {
      tab.setAttribute('aria-selected', n === i);
      panels.children[n].hidden = n !== i;
    });
  };

  rows.forEach((row, i) => {
    const { panel, title, app } = buildStep(row, i, rows.length, goTo);
    const li = el('li');
    const tab = el('button', 'json2html-tryit-tab');
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.setAttribute('aria-selected', i === 0);
    tab.append(el('span', 'json2html-tryit-num', String(i + 1)), el('span', 'json2html-tryit-label', title));
    if (app) tab.title = app;
    tab.addEventListener('click', () => goTo(i));
    li.append(tab);
    nav.append(li);
    tabs.push(tab);
    panels.append(panel);
  });

  block.replaceChildren(nav, panels);
}
