/*
 * Picker backend location. Resolution order: ?api= param, localStorage override, then default.
 * Endpoints are `${base}/browse`, `${base}/resolve`, `${base}/thumb`, `${base}/campaign-push`.
 */
const DEPLOYED = ''; // set to the deployed App Builder web-action base once published
const LOCAL = 'http://localhost:3100/api';

export default function apiBase() {
  try {
    const q = new URLSearchParams(window.location.search).get('api');
    if (q && /^https?:\/\//.test(q)) return q.replace(/\/$/, '');
    const saved = window.localStorage.getItem('xsc-picker-api');
    if (saved && /^https?:\/\//.test(saved)) return saved.replace(/\/$/, '');
  } catch { /* storage blocked */ }
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  return (local || !DEPLOYED ? LOCAL : DEPLOYED).replace(/\/$/, '');
}
