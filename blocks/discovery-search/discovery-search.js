function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  node.append(...children.flat());
  return node;
}

function icon(name) {
  const paths = {
    search: 'M15 15l6 6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    mic: 'M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM6 10v1a6 6 0 0 0 12 0v-1M12 17v4',
    lens: 'M8 3H4v4M16 3h4v4M20 17v4h-4M8 21H4v-4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    settings: 'M5 7h14M5 17h14M9 4v6M15 14v6',
    apps: 'M5 5h1M11 5h1M17 5h1M5 11h1M11 11h1M17 11h1M5 17h1M11 17h1M17 17h1',
    sparkle: 'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
    down: 'M6 9l6 6 6-6',
  };
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.8',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }).forEach(([key, value]) => svg.setAttribute(key, value));
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}

function disabledControl(label, iconName) {
  return el('button', {
    type: 'button',
    disabled: '',
    title: `${label} is unavailable in this simulation`,
    'aria-label': label,
  }, icon(iconName));
}

function parse(block) {
  const data = { audiences: [], results: [], back: null };
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const text = (i) => cells[i]?.textContent.trim() || '';
    const type = text(0);
    if (type === 'back') data.back = cells[1]?.querySelector('a');
    if (type === 'audience') {
      data.audiences.push({
        key: text(1), label: text(2), query: text(3), overview: text(4), detail: text(5),
      });
    }
    if (type === 'result' || type === 'featured') {
      data.results.push({
        featured: type === 'featured',
        site: text(1),
        title: text(2),
        snippet: text(3),
        link: cells[4]?.querySelector('a'),
        image: cells[5]?.querySelector('img'),
      });
    }
  });
  if (!data.back || !['endodontic', 'implants'].every((key) => data.audiences
    .some((a) => a.key === key && a.query && a.overview))
    || !data.results.some((r) => r.featured) || data.results.some((r) => !r.link)) {
    throw new Error('discovery-search: missing audience, result, or navigation content');
  }
  return data;
}

function resultUrl(result, audience) {
  const url = new URL(result.link.href);
  if (result.featured) {
    url.search = '';
    url.searchParams.set('demo_audience', audience.key);
    url.searchParams.set('demo_source', 'seo');
  }
  return url.href;
}

function thumbnail(result) {
  if (!result.image) return el('span', { class: 'discovery-search-source-tile', 'aria-hidden': 'true' }, result.site[0]);
  const image = result.image.cloneNode();
  image.alt = '';
  image.loading = 'lazy';
  image.width = 100;
  image.height = 100;
  return image;
}

export default function decorate(block) {
  const data = parse(block);
  const audience = data.audiences.find((a) => a.key === new URLSearchParams(window.location.search).get('audience'));
  document.body.classList.add('discovery-search-page');
  block.replaceChildren();
  if (!audience) {
    block.append(el(
      'div',
      { class: 'discovery-search-choose' },
      el('h1', {}, 'Choose a discovery journey'),
      ...data.audiences.map((a) => {
        const url = new URL(window.location.pathname, window.location.origin);
        url.searchParams.set('audience', a.key);
        return el('p', {}, el('a', { href: url.href }, a.label));
      }),
      el('p', {}, data.back.cloneNode(true)),
    ));
    return;
  }

  const wordmark = el(
    'a',
    {
      href: data.back.href, class: 'discovery-search-wordmark', 'aria-label': 'Google simulation - return to customer demo',
    },
    ...[...'Google'].map((letter) => el('span', { 'aria-hidden': 'true' }, letter)),
    el('span', { class: 'discovery-search-demo-badge' }, 'Demo'),
  );
  const input = el('input', {
    type: 'search',
    readonly: '',
    'aria-label': 'Prepared search query',
    title: 'Prepared query. This simulation does not submit searches to Google.',
  });
  input.value = audience.query;
  const search = el('button', { type: 'submit', 'aria-label': 'Replay these simulated results' }, icon('search'));
  const form = el('form', {
    class: 'discovery-search-query', role: 'search', 'aria-label': 'Simulated search',
  }, input, disabledControl('Voice search', 'mic'), disabledControl('Image search', 'lens'), search);
  const status = el('span', { role: 'status', class: 'discovery-search-status' });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    status.textContent = 'Prepared results shown. No search was sent to Google.';
    block.querySelector('h1').focus();
  });
  const top = el(
    'div',
    { class: 'discovery-search-top' },
    wordmark,
    form,
    el(
      'div',
      { class: 'discovery-search-account' },
      disabledControl('Settings', 'settings'),
      disabledControl('Google apps', 'apps'),
      el('button', {
        type: 'button', disabled: '', title: 'Sign in is unavailable in this simulation',
      }, 'Sign in'),
    ),
  );
  const resultsUrl = new URL(window.location.pathname, window.location.origin);
  resultsUrl.searchParams.set('audience', audience.key);
  resultsUrl.hash = 'discovery-search-results';
  const tabs = el(
    'nav',
    { class: 'discovery-search-tabs', 'aria-label': 'Search categories' },
    el('a', { href: resultsUrl.href, 'aria-current': 'page' }, 'All'),
    ...['AI Mode', 'Shopping', 'Images', 'Videos', 'Forums', 'More', 'Tools'].map((label) => el('button', {
      type: 'button', disabled: '', title: 'Not available in this simulation',
    }, label)),
    el('a', { href: data.back.href, class: 'discovery-search-back' }, 'Back to customer demo'),
  );

  const featured = data.results.find((r) => r.featured);
  const others = data.results.filter((r) => !r.featured);
  const overviewList = el(
    'ul',
    {},
    el(
      'li',
      {},
      el('strong', {}, 'SureSmile'),
      ' by Dentsply Sirona: clear aligner information. ',
      el('a', { href: resultUrl(featured, audience), class: 'discovery-search-inline-source' }, 'Dentsply Sirona'),
    ),
    ...others.map((r) => el(
      'li',
      {},
      el('strong', {}, r.site),
      ': ',
      el('a', { href: resultUrl(r, audience), class: 'discovery-search-inline-source' }, r.title),
    )),
  );
  const detail = el('div', {
    id: 'discovery-search-details', class: 'discovery-search-detail', hidden: '',
  }, el('p', {}, audience.detail), el('p', {}, 'Examples, not a ranking. Visit each manufacturer for product information.'));
  const expand = el('button', {
    type: 'button',
    class: 'discovery-search-expand',
    'aria-expanded': 'false',
    'aria-controls': detail.id,
  }, 'Show more', icon('down'));
  expand.addEventListener('click', () => {
    const open = expand.getAttribute('aria-expanded') !== 'true';
    detail.hidden = !open;
    expand.setAttribute('aria-expanded', String(open));
    expand.replaceChildren(open ? 'Show less' : 'Show more', icon('down'));
  });
  const sourceCards = el('aside', {
    class: 'discovery-search-sources', 'aria-label': 'Source websites',
  }, ...[featured, ...others.slice(0, 1)].map((r) => el(
    'a',
    {
      href: resultUrl(r, audience), class: 'discovery-search-source-card',
    },
    el(
      'div',
      {},
      el('span', { class: 'discovery-search-source-name' }, r.site),
      el('strong', {}, r.title),
      el('p', {}, r.snippet),
    ),
    thumbnail(r),
  )));
  const overview = el(
    'section',
    { class: 'discovery-search-overview', 'aria-label': 'Simulated AI overview' },
    el('h1', { tabindex: '-1' }, icon('sparkle'), 'AI Overview'),
    el(
      'div',
      { class: 'discovery-search-overview-grid' },
      el(
        'div',
        { class: 'discovery-search-overview-copy' },
        el('p', {}, audience.overview),
        overviewList,
        detail,
        expand,
      ),
      sourceCards,
    ),
  );

  const organic = el('section', {
    id: 'discovery-search-results', class: 'discovery-search-results', 'aria-label': 'Simulated organic results',
  }, ...[featured, ...others].map((r) => {
    const url = resultUrl(r, audience);
    return el(
      'article',
      { class: 'discovery-search-result' },
      el(
        'div',
        { class: 'discovery-search-result-copy' },
        el(
          'div',
          { class: 'discovery-search-site' },
          el('span', { class: 'discovery-search-favicon', 'aria-hidden': 'true' }, r.featured ? 'DS' : r.site[0]),
          el(
            'div',
            {},
            el('span', {}, r.site),
            el('span', { class: 'discovery-search-breadcrumb' }, new URL(url).hostname),
          ),
        ),
        el('h2', {}, el('a', { href: url }, r.title)),
        el('p', {}, r.snippet),
      ),
      ...(r.image ? [el('a', { href: url, 'aria-label': r.title }, thumbnail(r))] : []),
    );
  }));
  block.append(
    top,
    tabs,
    el(
      'div',
      { class: 'discovery-search-content' },
      overview,
      organic,
      el(
        'p',
        { class: 'discovery-search-disclosure' },
        'Simulated results and AI overview. No Google endorsement.',
      ),
      el(
        'p',
        { class: 'discovery-search-bottom-back' },
        el('a', { href: data.back.href }, 'Back to customer demo'),
      ),
    ),
    status,
  );
}
