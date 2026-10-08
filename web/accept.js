const tokenPath = location.pathname.replace(/\/$/, '');
const loading = document.querySelector('#loading');
const alertCard = document.querySelector('#alert');
const actions = document.querySelector('#actions');
const result = document.querySelector('#result');
let alertInfo = null;

const categories = {
  fuel: { label: 'Fuel', glyph: 'F', color: '#274706' },
  breakdown: { label: 'Breakdown', glyph: 'B', color: '#1B4D4F' },
  accident: { label: 'Accident', glyph: 'A', color: '#2B3A67' },
  medical: { label: 'Medical', glyph: 'M', color: '#5B1F2D' },
};
const readable = value => String(value || '').replaceAll('_', ' ');

function showResult(message, kind = '') {
  result.textContent = message;
  result.className = `result ${kind}`;
  result.hidden = false;
}

function draw(data) {
  alertInfo = data;
  const category = categories[data.category] || { label: 'Alert', glyph: '!', color: '#47584c' };
  document.querySelector('#category').textContent = category.label;
  document.querySelector('#category-mark').textContent = category.glyph;
  document.querySelector('#category-mark').style.color = category.color;
  document.querySelector('#category-mark').style.backgroundColor = `${category.color}14`;
  document.querySelector('#reference').textContent = `Alert ${String(data.event_id).slice(0, 8).toUpperCase()}`;
  document.querySelector('#location').textContent = data.preset_label || 'Location label unknown';
  document.querySelector('#responder').textContent = `${data.responder_name || 'Responder name unknown'} · ${readable(data.responder_type)}`;
  document.querySelector('#status').textContent = readable(data.status || 'notified');
  document.querySelector('#distance').textContent = Number.isFinite(Number(data.distance_m)) ? `${(Number(data.distance_m) / 1000).toFixed(1)} km straight-line` : 'Distance unknown';
  const dispatchLabel = data.simulated ? 'SIMULATED DISPATCH · DEMO MODE' : 'TEAM WHITELIST DISPATCH';
  document.querySelector('#dispatch-label').textContent = dispatchLabel;
  document.querySelector('#dispatch-label').classList.toggle('real', !data.simulated);
  loading.hidden = true;
  alertCard.hidden = false;
  if (data.status === 'accepted') {
    actions.hidden = true;
    showResult('This alert has already been accepted.', 'final');
  } else if (['declined', 'not_sent', 'unanswered', 'expired'].includes(data.status)) {
    actions.hidden = true;
    showResult(data.status === 'declined' ? 'You marked this alert as unable to respond.' : 'This alert is no longer available for response.', 'final');
  } else {
    actions.hidden = false;
  }
}

async function loadAlert() {
  try {
    const response = await fetch(`${tokenPath}/info`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'This responder link is invalid or expired.');
    draw(data);
  } catch (error) {
    loading.innerHTML = '';
    const p = document.createElement('p'); p.className = 'loading-error'; p.textContent = error.message;
    loading.append(p);
  }
}

async function respond(action) {
  const buttons = actions.querySelectorAll('button');
  buttons.forEach(button => { button.disabled = true; });
  result.hidden = true;
  try {
    const response = await fetch(`${tokenPath}/${action}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The action could not be saved.');
    if (action === 'accept') {
      alertInfo.status = 'accepted';
      draw(alertInfo);
      showResult('Accepted. The console and rider status are updated.', '');
    } else {
      alertInfo.status = 'declined';
      draw(alertInfo);
      showResult('Marked as unable to respond. No automatic escalation is enabled in T1.', 'final');
    }
  } catch (error) {
    buttons.forEach(button => { button.disabled = false; });
    showResult(readable(error.message), 'error');
    await loadAlert();
  }
}

document.querySelector('#accept').addEventListener('click', () => respond('accept'));
document.querySelector('#decline').addEventListener('click', () => respond('decline'));
loadAlert();
