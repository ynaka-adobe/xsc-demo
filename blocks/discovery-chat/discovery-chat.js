const ICONS = {
  menu: 'M4 5h16M4 12h16M4 19h16',
  new: 'M12 5H5v14h14v-7M15 3l6 6M10 14l2-5 6-6 3 3-6 6z',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M8 8h.01',
  plugins: 'M8 4h8v4h4v8h-4v4H8v-4H4V8h4z',
  help: 'M9 8a3 3 0 0 1 6 0c0 3-3 2-3 5M12 17h.01',
  settings: 'M5 7h14M5 17h14M9 4v6M15 14v6',
  plus: 'M12 5v14M5 12h14',
  mic: 'M9 4a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0zM6 10v1a6 6 0 0 0 12 0v-1M12 17v4M9 21h6',
  send: 'M12 19V5M6 11l6-6 6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  node.append(...children.flat());
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.6',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }).forEach(([key, value]) => svg.setAttribute(key, value));
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

function button(label, iconName, className = '', disabled = false) {
  const node = el('button', { type: 'button', class: className }, icon(iconName), label);
  if (disabled) {
    node.disabled = true;
    node.title = 'Not available in this scripted simulation';
  }
  return node;
}

function parse(block) {
  const data = { audiences: [], products: [], back: null };
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const text = (i) => cells[i]?.textContent.trim() || '';
    const type = text(0);
    if (type === 'back') data.back = cells[1]?.querySelector('a');
    if (type === 'audience') {
      data.audiences.push({
        key: text(1), label: text(2), prompt: text(3), intro: text(4),
      });
    }
    if (type === 'product' || type === 'featured') {
      data.products.push({
        featured: type === 'featured',
        name: text(1),
        manufacturer: text(2),
        bullets: [...(cells[3]?.querySelectorAll('li') || [])].map((li) => li.textContent),
        website: cells[4]?.querySelector('a'),
        image: cells[5]?.querySelector('img'),
      });
    }
  });
  if (!data.back || !['endodontic', 'implants'].every((key) => data.audiences
    .some((audience) => audience.key === key && audience.prompt && audience.intro))
    || !data.products.length || !data.products.some((p) => p.featured)
    || data.products.some((p) => !p.website)) {
    throw new Error('discovery-chat: missing audience, recommendation, or navigation content');
  }
  return data;
}

function journeyUrl(key) {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set('audience', key);
  return url.href;
}

function productCard(product, audience) {
  const destination = new URL(product.website.href);
  if (product.featured) {
    destination.search = '';
    destination.searchParams.set('demo_audience', audience.key);
    destination.searchParams.set('demo_source', 'chatgpt');
  }
  const thumbnail = el('div', {
    class: `discovery-chat-thumbnail${product.featured ? ' is-featured' : ''}`,
    'aria-hidden': 'true',
  });
  if (product.image) {
    const image = product.image.cloneNode();
    image.alt = '';
    image.loading = 'lazy';
    image.width = 82;
    image.height = 82;
    thumbnail.append(image);
  } else {
    thumbnail.append(el('span', {}, product.name.split(/\s+/).map((w) => w[0]).join('')));
  }
  const headingLink = el('a', { href: destination.href }, product.name);
  const citation = el(
    'a',
    { href: destination.href, class: 'discovery-chat-citation' },
    product.featured ? 'Explore SureSmile' : destination.hostname.replace(/^www\./, ''),
    el('span', { 'aria-hidden': 'true' }, ' \u2197'),
  );
  return el(
    'li',
    { class: 'discovery-chat-product' },
    thumbnail,
    el(
      'div',
      { class: 'discovery-chat-product-copy' },
      el('h2', {}, headingLink),
      el('p', {}, `Manufacturer: ${product.manufacturer}`),
      el('ul', {}, product.bullets.map((text) => el('li', {}, text))),
      citation,
    ),
  );
}

export default function decorate(block) {
  const data = parse(block);
  const key = new URLSearchParams(window.location.search).get('audience');
  const audience = data.audiences.find((a) => a.key === key);
  document.body.classList.add('discovery-chat-page');
  block.replaceChildren();

  if (!audience) {
    block.append(el(
      'div',
      { class: 'discovery-chat-choose' },
      el('h1', {}, 'Choose a discovery journey'),
      el('p', {}, 'A simulated ChatGPT conversation about clear aligners.'),
      ...data.audiences.map((a) => el(
        'p',
        {},
        el('a', { href: journeyUrl(a.key) }, a.label),
      )),
      el('p', {}, data.back.cloneNode(true)),
    ));
    return;
  }

  const mobile = window.matchMedia('(max-width: 700px)');
  const sidebar = el('aside', { class: 'discovery-chat-sidebar', 'aria-label': 'Demo navigation' });
  const toggle = button('', 'menu', 'discovery-chat-toggle');
  toggle.setAttribute('aria-label', 'Toggle sidebar');
  sidebar.id = 'discovery-chat-sidebar';
  toggle.setAttribute('aria-controls', sidebar.id);
  const backdrop = el('button', {
    class: 'discovery-chat-backdrop', type: 'button', 'aria-label': 'Close sidebar',
  });
  const setSidebar = (open) => {
    sidebar.hidden = !open;
    backdrop.hidden = !open || !mobile.matches;
    block.dataset.sidebarOpen = String(open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => setSidebar(sidebar.hidden));
  backdrop.addEventListener('click', () => setSidebar(false));
  block.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobile.matches && !sidebar.hidden) {
      setSidebar(false);
      toggle.focus();
    }
  });
  mobile.addEventListener('change', () => setSidebar(!mobile.matches));
  setSidebar(!mobile.matches);

  const journeys = el(
    'details',
    { class: 'discovery-chat-journeys' },
    el('summary', {}, 'ChatGPT', el('span', { class: 'discovery-chat-demo-badge' }, 'Demo')),
    ...data.audiences.map((a) => el('a', {
      href: journeyUrl(a.key), 'aria-current': a.key === key ? 'page' : 'false',
    }, a.label)),
  );
  const newChat = button('New chat', 'new', 'discovery-chat-nav-item');
  const back = el(
    'a',
    { href: data.back.href, class: 'discovery-chat-back' },
    icon('back'),
    'Back to customer demo',
  );
  sidebar.append(
    journeys,
    el(
      'nav',
      { 'aria-label': 'Conversation tools' },
      newChat,
      ...[['Images', 'image'], ['Plugins', 'plugins'], ['Help', 'help'], ['Settings', 'settings']]
        .map(([label, name]) => button(label, name, 'discovery-chat-nav-item', true)),
    ),
    el(
      'div',
      { class: 'discovery-chat-sidebar-bottom' },
      back,
      el('strong', {}, 'Explore the conversation'),
      el('p', {}, 'No account needed for this demo.'),
      el('button', {
        type: 'button', disabled: '', title: 'Not available in this scripted simulation',
      }, 'Log in'),
    ),
  );

  const prompt = el(
    'p',
    { class: 'discovery-chat-prompt', 'aria-label': 'Your question' },
    audience.prompt,
  );
  const answer = el(
    'article',
    { class: 'discovery-chat-answer', 'aria-label': 'Scripted response' },
    el('p', {}, audience.intro),
    el('h1', { tabindex: '-1' }, 'Clear aligner manufacturers'),
    el('p', { class: 'discovery-chat-order-note' }, 'Examples, not a ranking.'),
    el(
      'ol',
      { class: 'discovery-chat-products' },
      data.products.map((product) => productCard(product, audience)),
    ),
  );
  const start = el(
    'div',
    { class: 'discovery-chat-start', hidden: '' },
    el('h1', {}, 'What would you like to explore?'),
    el('p', {}, audience.label),
    el('button', { type: 'button', class: 'discovery-chat-suggestion' }, audience.prompt),
  );
  const thread = el(
    'div',
    { class: 'discovery-chat-thread', tabindex: '0', 'aria-label': 'Conversation' },
    el('div', { class: 'discovery-chat-column' }, prompt, answer, start),
  );
  const status = el('span', { class: 'discovery-chat-status', role: 'status' });
  const input = el('input', {
    type: 'text',
    readonly: '',
    'aria-label': 'Prepared example question',
    placeholder: 'Replay this example',
    title: 'This demo replays a prepared question; it does not send messages to ChatGPT.',
  });
  const send = button('', 'send', 'discovery-chat-send');
  send.type = 'submit';
  send.setAttribute('aria-label', 'Show scripted response');
  const form = el(
    'form',
    { class: 'discovery-chat-composer', 'aria-label': 'Scripted conversation' },
    button('', 'plus', 'discovery-chat-icon-button', true),
    input,
    button('', 'mic', 'discovery-chat-icon-button', true),
    send,
  );
  form.querySelectorAll('.discovery-chat-icon-button').forEach((b, i) => {
    b.setAttribute('aria-label', i ? 'Voice input unavailable in demo' : 'Attachments unavailable in demo');
  });
  const replay = () => {
    prompt.hidden = false;
    answer.hidden = false;
    start.hidden = true;
    input.value = '';
    thread.scrollTop = 0;
    status.textContent = 'Prepared response shown. No message was sent to ChatGPT.';
    answer.querySelector('h1').focus({ preventScroll: true });
    if (mobile.matches) setSidebar(false);
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    replay();
  });
  start.querySelector('button').addEventListener('click', replay);
  newChat.addEventListener('click', () => {
    prompt.hidden = true;
    answer.hidden = true;
    start.hidden = false;
    input.value = audience.prompt;
    status.textContent = 'New demo conversation. Send the prepared question to replay the example.';
    if (mobile.matches) setSidebar(false);
    input.focus();
  });

  block.append(
    backdrop,
    sidebar,
    el(
      'div',
      { class: 'discovery-chat-workspace' },
      el(
        'div',
        { class: 'discovery-chat-toolbar' },
        toggle,
        el('span', { class: 'discovery-chat-context' }, audience.label),
        el(
          'div',
          { class: 'discovery-chat-account' },
          el('button', {
            type: 'button', disabled: '', title: 'Not available in this scripted simulation',
          }, 'Log in'),
          el('button', {
            type: 'button', disabled: '', title: 'Not available in this scripted simulation',
          }, 'Sign up for free'),
        ),
      ),
      thread,
      el(
        'div',
        { class: 'discovery-chat-composer-wrap' },
        form,
        el(
          'p',
          { class: 'discovery-chat-disclosure' },
          'Simulated conversation. Scripted responses; no OpenAI endorsement.',
        ),
        status,
      ),
    ),
  );
}
