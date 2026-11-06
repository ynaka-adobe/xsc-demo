/*
 * OTP login block
 * Demo of a one-time password flow backed by Adobe App Builder actions.
 * SMS/email delivery is mocked: the message appears as an on-screen
 * notification and in the App Builder activation log.
 *
 * Authoring (optional): a row "Endpoint | <App Builder package URL>" overrides
 * the default endpoint.
 */

const DEFAULT_ENDPOINT = 'https://332794-xscotpdemo-stage.adobeioruntime.net/api/v1/web/otp';

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

async function call(endpoint, action, body) {
  const resp = await fetch(`${endpoint}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return { status: resp.status, data };
}

/* -------------------------------------------------------------------------- */
/* Rendering helpers                                                          */
/* -------------------------------------------------------------------------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  });
  children.flat().filter((c) => c !== null && c !== undefined && c !== '').forEach((c) => {
    node.append(c instanceof Node ? c : document.createTextNode(c));
  });
  return node;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function decodeToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/**
 * Shows the mocked SMS or email as a device-style notification.
 * @param {object} message mockDelivery payload from the request action
 */
function notify(message) {
  let tray = document.querySelector('.otp-login-tray');
  if (!tray) {
    tray = el('div', { class: 'otp-login-tray', 'aria-live': 'polite' });
    document.body.append(tray);
  }
  const isSms = message.channel === 'sms';
  const card = el(
    'div',
    { class: `otp-notice otp-notice-${message.channel}`, role: 'status' },
    el(
      'div',
      { class: 'otp-notice-head' },
      el('span', { class: 'otp-notice-app' }, isSms ? 'Messages' : 'Mail'),
      el('span', { class: 'otp-notice-mock' }, 'Simulated'),
      el('button', {
        class: 'otp-notice-close', type: 'button', 'aria-label': 'Dismiss', onclick: () => card.remove(),
      }, '×'),
    ),
    el('div', { class: 'otp-notice-from' }, isSms ? 'XSC Demo' : 'XSC Demo <no-reply@xsc-demo>'),
    el('div', { class: 'otp-notice-to' }, `To: ${message.to}`),
    message.subject ? el('div', { class: 'otp-notice-subject' }, message.subject) : null,
    el('div', { class: 'otp-notice-body' }, message.body),
  );
  tray.prepend(card);
  setTimeout(() => card.remove(), 60000);
}

/* -------------------------------------------------------------------------- */
/* Steps                                                                      */
/* -------------------------------------------------------------------------- */

export default function decorate(block) {
  const config = Object.fromEntries([...block.children].map((row) => [
    row.children[0]?.textContent.trim().toLowerCase(),
    row.children[1]?.textContent.trim(),
  ]));
  const endpoint = (config.endpoint || DEFAULT_ENDPOINT).replace(/\/$/, '');
  const state = { channel: 'sms', to: '' };

  const status = el('p', { class: 'otp-status', 'aria-live': 'polite' });
  const setStatus = (text, kind = '') => {
    status.textContent = text;
    status.className = `otp-status${kind ? ` otp-status-${kind}` : ''}`;
  };

  const panel = el('div', { class: 'otp-panel' });
  const show = (...nodes) => {
    panel.replaceChildren(...nodes, status);
  };

  let renderRequest;

  function renderSuccess(data) {
    const claims = decodeToken(data.token) || {};
    show(
      el('h3', {}, 'Verified'),
      el('p', {}, `${data.to} is confirmed. The verify action issued a signed session token:`),
      el(
        'dl',
        { class: 'otp-claims' },
        el('dt', {}, 'Subject'),
        el('dd', {}, claims.sub || ''),
        el('dt', {}, 'Method'),
        el('dd', {}, (claims.amr || []).join(' + ')),
        el('dt', {}, 'Expires'),
        el('dd', {}, claims.exp ? new Date(claims.exp * 1000).toLocaleString() : ''),
      ),
      el('button', { type: 'button', class: 'button secondary', onclick: () => renderRequest() }, 'Start over'),
    );
    setStatus('');
  }

  function renderVerify(sent) {
    const input = el('input', {
      type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]{6}', required: '', 'aria-label': 'Verification code', placeholder: '••••••',
    });
    const submit = el('button', { type: 'submit', class: 'button' }, 'Verify');
    const form = el(
      'form',
      {
        class: 'otp-form',
        onsubmit: async (e) => {
          e.preventDefault();
          submit.disabled = true;
          setStatus('Checking…');
          const { status: code, data } = await call(endpoint, 'verify', { ...state, code: input.value });
          submit.disabled = false;
          if (code === 200) {
            renderSuccess(data);
          } else if (code === 401) {
            setStatus(`${data.error} ${data.attemptsLeft} attempt${data.attemptsLeft === 1 ? '' : 's'} left.`, 'error');
            input.select();
          } else if (code === 423) {
            setStatus(`Locked until ${formatTime(data.lockedUntil)} after too many failed attempts.`, 'error');
            submit.disabled = true;
          } else {
            setStatus(data.error || 'Something went wrong.', 'error');
          }
        },
      },
      el('label', {}, `Enter the 6-digit code sent to ${sent.to}`, input),
      el('div', { class: 'otp-actions' }, submit, el('button', {
        type: 'button', class: 'button secondary', onclick: () => renderRequest(),
      }, 'Use a different address')),
    );
    show(el('h3', {}, 'Check your messages'), form);
    setStatus(`Code expires at ${formatTime(sent.expiresAt)}. You have ${sent.maxAttempts} attempts.`);
    input.focus();
  }

  renderRequest = () => {
    const toInput = el('input', { type: 'text', required: '', 'aria-label': 'Phone number or email' });
    const setChannel = (channel) => {
      state.channel = channel;
      toInput.type = channel === 'email' ? 'email' : 'tel';
      toInput.placeholder = channel === 'email' ? 'name@company.com' : '+1 415 555 0123';
      toInput.autocomplete = channel === 'email' ? 'email' : 'tel';
    };
    const radio = (value, label) => el(
      'label',
      { class: 'otp-choice' },
      el('input', {
        type: 'radio', name: 'otp-channel', value, ...(state.channel === value ? { checked: '' } : {}), onchange: () => setChannel(value),
      }),
      label,
    );
    setChannel(state.channel);

    const submit = el('button', { type: 'submit', class: 'button' }, 'Send code');
    const form = el(
      'form',
      {
        class: 'otp-form',
        onsubmit: async (e) => {
          e.preventDefault();
          submit.disabled = true;
          setStatus('Sending…');
          state.to = toInput.value;
          const { status: code, data } = await call(endpoint, 'request', state);
          submit.disabled = false;
          if (code === 200) {
            notify(data.mockDelivery);
            renderVerify(data);
          } else if (code === 423) {
            setStatus(`Locked until ${formatTime(data.lockedUntil)} after too many failed attempts.`, 'error');
          } else {
            setStatus(data.error || 'Something went wrong.', 'error');
          }
        },
      },
      el('fieldset', {}, el('legend', {}, 'Send my code by'), radio('sms', 'Text message'), radio('email', 'Email')),
      el('label', {}, 'Phone number or email', toInput),
      el('div', { class: 'otp-actions' }, submit),
    );
    show(el('h3', {}, 'Sign in with a one-time code'), form);
    setStatus('');
  };

  block.replaceChildren(panel);
  renderRequest();
}
