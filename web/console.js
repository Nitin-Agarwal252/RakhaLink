const queueEl = document.querySelector('#queue');
const countEl = document.querySelector('#queue-count');
const connectionEl = document.querySelector('#connection');
const noticeEl = document.querySelector('#notice');
const viewAsEl = document.querySelector('#view-as');
const dutyToggleEl = document.querySelector('#duty-toggle');
const metricValueEl = document.querySelector('#metric-value');
const metricCountEl = document.querySelector('#metric-count');
const queueTabs = [...document.querySelectorAll('[data-queue-view]')];
const ops = {
  scope: document.querySelector('#ops-scope'),
  active: document.querySelector('#ops-active'),
  accepted: document.querySelector('#ops-accepted'),
  unanswered: document.querySelector('#ops-unanswered'),
  onDuty: document.querySelector('#ops-on-duty'),
};
const selectedMap = new Map();
let events = [];
let responders = [];
let currentRole = '';
let selectedId = null;
let queueView = 'active';
let eventSource;

const categories = {
  fuel: { label: 'Fuel', glyph: 'F', color: '#274706' },
  breakdown: { label: 'Breakdown', glyph: 'B', color: '#1B4D4F' },
  accident: { label: 'Accident', glyph: 'A', color: '#2B3A67' },
  medical: { label: 'Medical', glyph: 'M', color: '#5B1F2D' },
};
const readable = value => String(value || '').replaceAll('_', ' ');
const shortId = value => String(value || '').slice(0, 8).toUpperCase();
const matchLabel = value => ({ hospital: 'Hospital', police: 'Police', mechanic: 'Mechanic', fuel_pump: 'Fuel pump' }[value] || readable(value));

function setConnection(online) {
  connectionEl.classList.toggle('online', online);
  connectionEl.classList.toggle('offline', !online);
  connectionEl.lastChild.textContent = online ? 'Live updates' : 'Reconnecting';
}

function showNotice(message) {
  noticeEl.textContent = message;
  noticeEl.hidden = !message;
}

async function loadEvents(keepNotice = false) {
  try {
    const query = currentRole ? `?role=${encodeURIComponent(currentRole)}` : '';
    const response = await fetch(`/api/events${query}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const data = await response.json();
    events = Array.isArray(data) ? data : [];
    setConnection(true);
    if (!keepNotice) showNotice('');
    if (!events.some(item => item.id === selectedId)) selectedId = events[0]?.id || null;
    render();
    loadMetric();
  } catch (error) {
    setConnection(false);
    showNotice(`Cannot reach the RakshaLink API: ${error.message}. Start the server and refresh.`);
  }
}

async function loadMetric() {
  try {
    const response = await fetch('/api/metrics', { cache: 'no-store' });
    if (!response.ok) return;
    const metric = await response.json();
    metricCountEl.textContent = `Demo session · ${Number(metric.n) || 0} dispatched requests`;
    if (!Number(metric.n) || !Number.isFinite(metric.median_ms)) {
      metricValueEl.textContent = 'No dispatched alerts yet';
      return;
    }
    const seconds = Math.max(0, metric.median_ms / 1000);
    metricValueEl.textContent = seconds < 60 ? `${seconds.toFixed(1)} sec` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} sec`;
  } catch {}
}

async function loadResponders() {
  try {
    const response = await fetch('/api/responders', { cache: 'no-store' });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    responders = await response.json();
    const previous = currentRole;
    viewAsEl.replaceChildren(new Option('All responder roles', ''));
    for (const [type, label] of Object.entries({ hospital: 'Hospital', police: 'Police', mechanic: 'Mechanic', fuel_pump: 'Fuel pump' })) {
      const units = responders.filter(item => item.type === type);
      if (units.length) viewAsEl.add(new Option(`${label} role · ${units.filter(item => item.on_duty).length} on duty`, type));
    }
    if (['hospital', 'police', 'mechanic', 'fuel_pump'].includes(previous)) viewAsEl.value = previous;
    else currentRole = '';
    updateDutyToggle();
  } catch (error) {
    showNotice(`Could not load demo responder views: ${error.message}`);
  }
}

function updateDutyToggle() {
  const responder = responders.find(item => item.type === currentRole);
  dutyToggleEl.disabled = !responder;
  dutyToggleEl.classList.toggle('off-duty', Boolean(responder && !responder.on_duty));
  dutyToggleEl.textContent = responder?.on_duty ? 'On duty' : 'Off duty';
  dutyToggleEl.title = responder ? `${responder.on_duty ? 'Set off duty' : 'Set on duty'} for the ${matchLabel(responder.type)} demo representative` : 'Choose a demo responder role';
}

async function toggleDuty() {
  const responder = responders.find(item => item.type === currentRole);
  if (!responder) return;
  dutyToggleEl.disabled = true;
  try {
    const response = await fetch(`/api/responders/${encodeURIComponent(responder.id)}/duty`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on_duty: !responder.on_duty }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(readable(data.error || 'Could not update duty status'));
    showNotice(`${responder.name} is now ${data.on_duty ? 'on duty' : 'off duty'}.`);
    await loadResponders();
    await loadEvents(true);
  } catch (error) {
    showNotice(error.message);
  } finally { updateDutyToggle(); }
}

function render() {
  renderOperations();
  const closedStatuses = ['resolved', 'unanswered'];
  const visibleEvents = events.filter(item => queueView === 'history' ? closedStatuses.includes(item.status) : !closedStatuses.includes(item.status));
  countEl.textContent = String(visibleEvents.length);
  queueTabs.forEach(tab => {
    const selected = tab.dataset.queueView === queueView;
    tab.classList.toggle('selected', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  if (visibleEvents.length === 0) {
    const empty = queueView === 'history'
      ? makeEmpty('↺', 'No history yet', 'Resolved and unanswered alerts from this demo session will appear here.')
      : makeEmpty('✓', 'All clear', 'No active alerts are in the queue.');
    queueEl.replaceChildren(empty);
    renderDetails(null);
    return;
  }
  if (!visibleEvents.some(item => item.id === selectedId)) selectedId = visibleEvents[0].id;
  const fragment = document.createDocumentFragment();
  for (const item of visibleEvents) {
    const category = categories[item.category] || { label: 'Alert', glyph: '!', color: '#47584c' };
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.eventId = item.id;
    button.className = `queue-card${item.id === selectedId ? ' selected' : ''}${item.status === 'dispatched' ? ' incoming' : ''}`;
    button.setAttribute('aria-pressed', String(item.id === selectedId));
    const top = document.createElement('div'); top.className = 'queue-card-top';
    const title = document.createElement('span'); title.className = 'queue-title'; title.style.color = category.color; title.textContent = category.label;
    const id = document.createElement('span'); id.className = 'queue-id'; id.textContent = shortId(item.id);
    top.append(title, id);
    const meta = document.createElement('div'); meta.className = 'queue-meta';
    const preset = document.createElement('span'); preset.textContent = item.preset_label || 'Location label unknown';
    const dot = document.createElement('span'); dot.textContent = '·';
    const time = document.createElement('span'); time.textContent = formatAge(item.created_at);
    meta.append(preset, dot, time);
    const state = document.createElement('div'); state.className = 'queue-state'; state.textContent = readable(item.status || 'received');
    button.append(top, meta, state);
    button.addEventListener('click', () => { selectedId = item.id; render(); });
    fragment.append(button);
  }
  queueEl.replaceChildren(fragment);
  renderDetails(visibleEvents.find(item => item.id === selectedId) || null);
}

function renderOperations() {
  const closed = new Set(['resolved', 'unanswered']);
  const accepted = new Set(['accepted', 'enroute', 'arrived']);
  ops.scope.textContent = currentRole ? `${matchLabel(currentRole)} role view` : 'All responder roles';
  ops.active.textContent = String(events.filter(item => !closed.has(item.status)).length);
  ops.accepted.textContent = String(events.filter(item => accepted.has(item.status)).length);
  ops.unanswered.textContent = String(events.filter(item => item.status === 'unanswered').length);
  ops.onDuty.textContent = String(responders.filter(item => (!currentRole || item.type === currentRole) && item.on_duty).length);
}

function makeEmpty(icon, title, message) {
  const box = document.createElement('div'); box.className = 'empty-state';
  const mark = document.createElement('span'); mark.className = 'empty-icon'; mark.textContent = icon;
  const heading = document.createElement('strong'); heading.textContent = title;
  const detail = document.createElement('span'); detail.textContent = message;
  box.append(mark, heading, detail);
  return box;
}

function renderDetails(item) {
  const detail = document.querySelector('#detail');
  const empty = document.querySelector('#detail-empty');
  const pill = document.querySelector('#detail-status');
  const map = document.querySelector('#map');
  const mapEmpty = document.querySelector('#map-empty');
  if (!item) {
    detail.hidden = true; empty.hidden = false; pill.textContent = '—'; pill.className = 'status-pill';
    map.hidden = true; mapEmpty.hidden = false;
    document.querySelector('#coordinates').textContent = '—';
    document.querySelector('#map-label').textContent = 'Select an alert';
    return;
  }
  detail.hidden = false; empty.hidden = true;
  const category = categories[item.category] || { label: 'Alert', glyph: '!', color: '#47584c' };
  document.querySelector('#category-icon').textContent = category.glyph;
  document.querySelector('#category-icon').style.color = category.color;
  document.querySelector('#category-icon').style.backgroundColor = `${category.color}14`;
  document.querySelector('#category-name').textContent = category.label;
  document.querySelector('#alert-reference').textContent = `Alert ${shortId(item.id)}`;
  document.querySelector('#trigger').textContent = item.trigger === 'crash_auto' ? 'Simulated crash' : readable(item.trigger || 'manual');
  document.querySelector('#preset').textContent = item.preset_label || 'Location label unknown';
  document.querySelector('#created').textContent = formatDate(item.created_at);
  document.querySelector('#dispatch-label').textContent = item.dispatch_label || 'SIMULATED DISPATCH';
  document.querySelector('#dispatch-label').classList.toggle('real', item.dispatch_label && !item.dispatch_label.includes('SIMULATED'));
  const familyAlert = document.querySelector('#family-alert');
  familyAlert.hidden = item.family_alert?.status !== 'simulated';
  familyAlert.querySelector('strong').textContent = item.family_alert?.label || 'SIMULATED FAMILY ALERT';
  familyAlert.querySelector('span').textContent = item.family_alert?.detail || 'Demo record only. No contact was notified.';
  pill.textContent = readable(item.status || 'received');
  pill.className = `status-pill ${String(item.status || '').toLowerCase()}`;
  renderCountdown(item);
  renderMatches(item);
  document.querySelector('#match-count').textContent = String((item.matches || []).length);
  if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
    map.hidden = false; mapEmpty.hidden = true;
    document.querySelector('#coordinates').textContent = `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`;
    document.querySelector('#map-label').textContent = item.preset_label || 'Sample/demo location';
    const latPad = 0.025; const lngPad = 0.035;
    const bounds = `${item.lng - lngPad},${item.lat - latPad},${item.lng + lngPad},${item.lat + latPad}`;
    const source = new URL('https://www.openstreetmap.org/export/embed.html');
    source.searchParams.set('bbox', bounds);
    source.searchParams.set('layer', 'mapnik');
    source.searchParams.set('marker', `${item.lat},${item.lng}`);
    if (map.src !== source.href) map.src = source.href;
  } else {
    map.hidden = true; mapEmpty.hidden = false;
    document.querySelector('#coordinates').textContent = 'Location unavailable';
    document.querySelector('#map-label').textContent = 'Location unavailable';
  }
}

function renderCountdown(item) {
  const countdown = document.querySelector('#countdown');
  const note = document.querySelector('#window-note');
  const bar = document.querySelector('#window-progress');
  const accepted = ['accepted', 'enroute', 'arrived', 'resolved'].includes(item.status);
  const closed = ['unanswered', 'resolved'].includes(item.status);
  if (accepted) {
    countdown.textContent = item.status === 'accepted' ? 'Accepted' : readable(item.status);
    note.textContent = 'A responder accepted this alert; the response window has stopped.';
    bar.style.transform = 'scaleX(0)';
    return;
  }
  if (closed) {
    countdown.textContent = 'Closed';
    note.textContent = item.status === 'unanswered' ? 'No responder answered. Call 112.' : 'This alert is resolved.';
    bar.style.transform = 'scaleX(0)';
    return;
  }
  const windowSeconds = Number(item.response_window_s) || 20;
  const currentMatch = (item.matches || []).find(match => match.status === 'notified');
  const startAt = currentMatch?.notified_at || item.created_at;
  const startMs = Number.isFinite(startAt) ? startAt : Date.parse(startAt);
  const elapsed = Number.isFinite(startMs) ? Math.max(0, (Date.now() - startMs) / 1000) : 0;
  const remaining = Math.max(0, Math.ceil(windowSeconds - elapsed));
  countdown.textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  if (remaining > 0) {
    note.textContent = 'Waiting for this responder. The next on-duty match is notified if this window expires.';
    bar.style.transform = `scaleX(${Math.min(1, remaining / windowSeconds)})`;
  } else {
    note.textContent = 'Response window elapsed. Moving to the next on-duty match.';
    bar.style.transform = 'scaleX(0)';
  }
}

function renderMatches(item) {
  const root = document.querySelector('#matches');
  const matches = Array.isArray(item.matches) ? item.matches : [];
  if (!matches.length) {
    root.replaceChildren(makeEmpty('—', 'No match available', 'No responder matched this request. The rider should call 112.'));
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const match of matches) {
    const card = document.createElement('article'); card.className = 'match-card';
    const top = document.createElement('div'); top.className = 'match-top';
    const identity = document.createElement('div');
    const name = document.createElement('div'); name.className = 'match-name'; name.textContent = match.name || 'Responder name unknown';
    const type = document.createElement('div'); type.className = 'match-type'; type.textContent = `${matchLabel(match.type)} · SAMPLE / DEMO`;
    identity.append(name, type);
    const distance = document.createElement('span'); distance.className = 'match-distance'; distance.textContent = formatDistance(match.distance_m);
    top.append(identity, distance); card.append(top);
    const status = String(match.status || 'notified');
    const actions = document.createElement('div'); actions.className = 'match-actions';
    if (status === 'notified' && match.accept_url) {
      actions.append(makeAction('Accept', 'accept-button', () => responderAction(match.accept_url, 'accept')));
      actions.append(makeAction("Can't respond", 'decline-button', () => responderAction(match.accept_url, 'decline')));
    } else if (['accepted', 'enroute', 'arrived'].includes(status) && match.accept_url) {
      const nextStep = { accepted: 'enroute', enroute: 'arrived', arrived: 'resolved' }[status];
      const label = { enroute: 'On the way', arrived: 'Arrived', resolved: 'Resolved' }[nextStep];
      const progress = document.createElement('div'); progress.className = 'progress-actions';
      if (nextStep === 'enroute') {
        const etaLabel = document.createElement('label'); etaLabel.className = 'eta-entry'; etaLabel.textContent = 'Your estimate (min, optional)';
        const etaInput = document.createElement('input'); etaInput.type = 'number'; etaInput.min = '1'; etaInput.max = '1440'; etaInput.step = '1'; etaInput.inputMode = 'numeric'; etaInput.placeholder = 'e.g. 18'; etaInput.setAttribute('aria-label', 'Responder-entered estimate in minutes');
        etaLabel.append(etaInput); progress.append(etaLabel);
        progress.append(makeAction(label, 'progress-button', () => progressResponder(match.accept_url, nextStep, etaInput.value)));
      } else {
        progress.append(makeAction(label, 'progress-button', () => progressResponder(match.accept_url, nextStep)));
      }
      actions.append(progress);
      if (Number.isFinite(match.responder_eta_minutes)) {
        const eta = document.createElement('span'); eta.className = 'responder-progress'; eta.textContent = `Responder-entered estimate: ${match.responder_eta_minutes} min`;
        actions.append(eta);
      }
    } else if (status === 'resolved') {
      const resolved = document.createElement('span'); resolved.className = 'responder-progress'; resolved.textContent = 'Resolved by responder';
      actions.append(resolved);
    } else {
      const state = document.createElement('span'); state.className = 'match-status'; state.textContent = status === 'not_sent' ? 'Notification not sent' : readable(status);
      actions.append(state);
    }
    card.append(actions); fragment.append(card);
  }
  root.replaceChildren(fragment);
}

function makeAction(label, className, onClick) {
  const button = document.createElement('button'); button.type = 'button'; button.className = `action-button ${className}`; button.textContent = label;
  button.addEventListener('click', onClick); return button;
}

async function responderAction(acceptUrl, action) {
  const path = new URL(acceptUrl, location.href).pathname;
  const buttons = document.querySelectorAll('.match-actions button');
  buttons.forEach(button => { button.disabled = true; });
  try {
    const response = await fetch(`${path.replace(/\/$/, '')}/${action}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(readable(data.error || `Could not ${action} alert`));
    showNotice(action === 'accept' ? 'Alert accepted. The rider status will update.' : 'Marked as unable to respond.');
    await loadEvents(true);
  } catch (error) {
    showNotice(error.message);
    await loadEvents(true);
  }
}

async function progressResponder(acceptUrl, step, etaValue = '') {
  const path = new URL(acceptUrl, location.href).pathname;
  const etaMinutes = etaValue.trim() ? Number(etaValue) : null;
  if (etaValue.trim() && (!Number.isInteger(etaMinutes) || etaMinutes < 1 || etaMinutes > 1440)) {
    showNotice('Enter a whole-number estimate from 1 to 1440 minutes, or leave it blank.');
    return;
  }
  const buttons = document.querySelectorAll('.match-actions button');
  buttons.forEach(button => { button.disabled = true; });
  try {
    const response = await fetch(`${path.replace(/\/$/, '')}/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ step, ...(step === 'enroute' && etaMinutes != null ? { eta_minutes: etaMinutes } : {}) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(readable(data.error || 'Could not update responder status'));
    showNotice(`Responder marked ${readable(step)}.`);
  } catch (error) { showNotice(error.message); }
  await loadEvents(true);
}

function formatAge(value) {
  const ms = Date.now() - Date.parse(value);
  if (!Number.isFinite(ms) || ms < 0) return 'Time unknown';
  if (ms < 60000) return `${Math.floor(ms / 1000)} sec ago`;
  return `${Math.floor(ms / 60000)} min ago`;
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unknown' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}
function formatDistance(meters) {
  if (!Number.isFinite(Number(meters))) return 'Distance unknown';
  return `${(Number(meters) / 1000).toFixed(1)} km straight-line`;
}

viewAsEl.addEventListener('change', async () => {
  currentRole = viewAsEl.value;
  updateDutyToggle();
  selectedId = null;
  await loadEvents();
  eventSource?.close();
  eventSource = new EventSource(currentRole ? `/api/stream?role=${encodeURIComponent(currentRole)}` : '/api/stream');
  eventSource.onopen = () => setConnection(true);
  eventSource.onerror = () => setConnection(false);
  for (const type of ['alert', 'status', 'escalated', 'unanswered', 'reset', 'duty']) eventSource.addEventListener(type, () => { loadResponders(); loadEvents(); });
});
queueTabs.forEach(tab => tab.addEventListener('click', () => {
  queueView = tab.dataset.queueView;
  selectedId = null;
  render();
}));
dutyToggleEl.addEventListener('click', toggleDuty);
document.querySelector('#refresh').addEventListener('click', () => loadEvents());
loadResponders().then(loadEvents);
eventSource = new EventSource('/api/stream');
eventSource.onopen = () => setConnection(true);
eventSource.onerror = () => setConnection(false);
for (const type of ['alert', 'status', 'escalating', 'escalated', 'unanswered', 'reset', 'duty']) {
  eventSource.addEventListener(type, () => loadEvents());
}
setInterval(() => {
  const item = events.find(row => row.id === selectedId);
  if (item) renderCountdown(item);
  events = events.map(row => ({ ...row }));
  renderQueueAges();
}, 1000);
setInterval(() => loadEvents(true), 8000);
function renderQueueAges() {
  for (const button of queueEl.querySelectorAll('.queue-card')) {
    const item = events.find(row => row.id === button.dataset.eventId);
    const time = button.querySelector('.queue-meta span:last-child');
    if (item && time) time.textContent = formatAge(item.created_at);
  }
}
