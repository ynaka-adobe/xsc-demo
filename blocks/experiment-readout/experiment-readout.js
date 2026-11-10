const label = (s) => String(s || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function simLink(text, param, value, active) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set(param, value);
  const a = document.createElement('a');
  a.href = url.toString();
  a.textContent = text;
  if (active) a.setAttribute('aria-current', 'true');
  return a;
}

function row(title, value, links) {
  const li = document.createElement('li');
  li.className = 'experiment-readout-row';
  const name = document.createElement('span');
  name.className = 'experiment-readout-name';
  name.textContent = title;
  const val = document.createElement('strong');
  val.className = 'experiment-readout-value';
  val.textContent = value;
  const nav = document.createElement('span');
  nav.className = 'experiment-readout-links';
  nav.append(...links);
  li.append(name, val, nav);
  return li;
}

export default function decorate(block) {
  const intro = block.querySelector(':scope > div > div');
  block.textContent = '';
  if (intro) {
    intro.className = 'experiment-readout-intro';
    block.append(intro);
  }

  const ns = window.aem || window.hlx || {};
  const list = document.createElement('ul');
  list.className = 'experiment-readout-list';

  (ns.experiments || []).forEach(({ config }) => {
    if (!config) return;
    const current = config.selectedVariant;
    list.append(row(
      `A/B test: ${config.label || label(config.id)}`,
      label(current),
      (config.variantNames || []).map((v) => simLink(label(v), 'experiment', `${config.id}/${v}`, v === current)),
    ));
  });

  (ns.audiences || []).forEach(({ config }) => {
    if (!config) return;
    const current = config.selectedAudience || 'default';
    const options = Object.keys(config.configuredAudiences || {});
    list.append(row(
      'Audience',
      label(current),
      options.map((a) => simLink(label(a), 'audience', a, a === current)),
    ));
  });

  if (!list.children.length) {
    const li = document.createElement('li');
    li.className = 'experiment-readout-row';
    li.textContent = 'No experiment or audience is configured on this page.';
    list.append(li);
  }
  block.append(list);

  const usp = new URLSearchParams(window.location.search);
  if (usp.has('experiment') || usp.has('audience')) {
    const reset = document.createElement('a');
    reset.className = 'experiment-readout-reset';
    reset.href = window.location.pathname;
    reset.textContent = 'Clear simulation';
    block.append(reset);
  }
}
