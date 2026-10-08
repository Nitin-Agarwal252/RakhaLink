const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { findNearest, getResponders, setOnDuty, haversineMeters } = require('./data/responder-store');
const { presets } = require('./data/presets');
const { responderTypesFor } = require('./triage/rules');
const { dispatchEvent, resolveToken, getDispatchLog, resetDispatch } = require('./dispatch');

const app = express();
const events = new Map();
const listeners = new Set();
const requests = new Map();
const escalationTimers = new Map();
app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.resolve(__dirname, '..', '..', 'web')));

function publish(name, data) {
  const packet = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const response of listeners) response.write(packet);
}
function eventForToken(req, res) {
  const record = resolveToken(req.params.token);
  const event = record && events.get(record.eventId);
  if (!event) { res.status(404).json({ error: 'invalid_or_expired_token' }); return null; }
  const match = event.matches.find(row => String(row.responder_id) === String(record.responderId));
  if (!match) { res.status(404).json({ error: 'invalid_or_expired_token' }); return null; }
  return { event, responder: match };
}
function flags(event, responder) {
  return {
    sent: Boolean(responder?.sent_at), notified: Boolean(responder?.notified_at),
    accepted: Boolean(responder?.accepted_at), enroute: Boolean(responder?.enroute_at),
    arrived: Boolean(responder?.arrived_at), resolved: Boolean(responder?.resolved_at),
    unanswered: event.status === 'unanswered'
  };
}

const roleTypes = { hospital: ['hospital'], police: ['police'], mechanic: ['mechanic'], fuel_pump: ['fuel_pump'] };
function eventMatchesRole(event, role) {
  return !role || Boolean(roleTypes[role]?.length && event.matches.some(match => roleTypes[role].includes(match.type)));
}

function clearEscalation(eventId) {
  const timer = escalationTimers.get(eventId);
  if (timer) clearTimeout(timer);
  escalationTimers.delete(eventId);
}

async function dispatchNext(event, escalated = false) {
  clearEscalation(event.id);
  while (event.nextMatchIndex < event.matches.length) {
    const match = event.matches[event.nextMatchIndex++];
    const raw = getResponders().find(row => String(row.id) === String(match.responder_id));
    if (!raw || raw.on_duty === false) {
      match.status = 'off_duty';
      continue;
    }
    const [delivery] = await dispatchEvent(event, [raw]);
    event.dispatch.push(delivery);
    if (!delivery?.ok) {
      match.status = 'not_sent';
      continue;
    }
    match.status = 'notified';
    const responder = {
      responder_id: match.responder_id, status: 'notified', sent_at: Date.now(), notified_at: Date.now(),
      accepted_at: null, enroute_at: null, arrived_at: null, resolved_at: null,
      responder_eta_minutes: null, declined_at: null
    };
    event.responders.push(responder);
    event.status = 'dispatched';
    event.first_dispatched_ms ??= Date.now();
    if (escalated) publish('escalated', { id: event.id, status: 'dispatched', responder_id: match.responder_id });
    publish('alert', { id: event.id, status: event.status, category: event.category, responder_id: match.responder_id });
    const timer = setTimeout(() => {
      if (!events.has(event.id) || event.accepted_at || responder.status !== 'notified') return;
      responder.status = 'no_response';
      responder.no_response_at = Date.now();
      match.status = 'no_response';
      event.status = 'escalating';
      publish('escalating', { id: event.id, status: event.status, responder_id: match.responder_id });
      dispatchNext(event, true);
    }, Math.max(1, event.response_window_s) * 1000);
    escalationTimers.set(event.id, timer);
    return true;
  }
  event.status = 'unanswered';
  event.unanswered_at = Date.now();
  publish('unanswered', { id: event.id, status: event.status });
  return false;
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/sos', async (req, res) => {
  const now = Date.now();
  const key = String(req.ip || 'unknown');
  const prior = (requests.get(key) || []).filter(ts => now - ts < 60000);
  if (prior.length >= 30) return res.status(429).json({ error: 'rate_limited' });
  prior.push(now); requests.set(key, prior);
  const body = req.body || {};
  if (!['fuel', 'breakdown', 'accident', 'medical'].includes(body.category)) return res.status(400).json({ error: 'invalid_category' });
  if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng) || body.lat < -90 || body.lat > 90 || body.lng < -180 || body.lng > 180) return res.status(400).json({ error: 'invalid_location' });
  if (body.preset_id && !presets.some(preset => preset.id === body.preset_id)) return res.status(400).json({ error: 'invalid_preset' });
  if (!['manual', 'voice', 'crash_auto'].includes(body.trigger || 'manual')) return res.status(400).json({ error: 'invalid_trigger' });
  if (body.trigger === 'crash_auto' && (!Number.isFinite(body.peak_g) || body.peak_g < 0 || !Number.isFinite(body.pre_impact_kmh) || body.pre_impact_kmh < 0)) return res.status(400).json({ error: 'invalid_crash_summary' });
  if (body.trigger === 'voice' && body.transcript != null && typeof body.transcript !== 'string') return res.status(400).json({ error: 'invalid_transcript' });
  if (body.contacts != null) return res.status(400).json({ error: 'contacts_not_supported_in_demo' });

  const selectedPreset = body.preset_id
    ? presets.find(preset => preset.id === body.preset_id)
    : [...presets].sort((a, b) => haversineMeters(body.lat, body.lng, a.lat, a.lng) - haversineMeters(body.lat, body.lng, b.lat, b.lng))[0];
  const nearestPresetDistance = haversineMeters(body.lat, body.lng, selectedPreset.lat, selectedPreset.lng);
  const preset = body.preset_id || nearestPresetDistance <= 30000 ? selectedPreset : null;
  const event = {
    id: crypto.randomUUID(), category: body.category, trigger: body.trigger || 'manual', client_id: body.client_id || null,
    created_at: new Date().toISOString(), created_ms: now, status: 'received', matches: [], responders: [],
    family_alert: { status: 'simulated', label: 'SIMULATED FAMILY ALERT', destination: null, sent: false, detail: 'Demo record only. No contact was notified.' },
    lat: body.lat, lng: body.lng, preset_id: preset?.id || null, preset_label: preset?.label || null,
    response_window_s: config.escalateAfterS,
    peak_g: body.trigger === 'crash_auto' ? body.peak_g : undefined,
    pre_impact_kmh: body.trigger === 'crash_auto' ? body.pre_impact_kmh : undefined
  };
  const types = responderTypesFor(body.category);
  const all = [];
  for (const type of types) all.push(...await findNearest([type], body.lat, body.lng, 3, preset?.id));
  const onDutyIds = new Set(getResponders().filter(row => row.on_duty !== false).map(row => String(row.id)));
  const eligible = all.filter(row => onDutyIds.has(String(row.id)));
  eligible.sort((a, b) => a.distance_m - b.distance_m || String(a.id).localeCompare(String(b.id)));
  event.matches = eligible.map(row => ({
    responder_id: row.id, name: row.name, type: row.type, distance_m: row.distance_m,
    is_demo: true, is_sample: Boolean(row.is_sample), preset_id: row.preset_id, preset_label: row.preset_label,
    lat: row.lat, lng: row.lng, status: 'queued'
  }));
  event.responders = [];
  event.dispatch = [];
  event.nextMatchIndex = 0;
  events.set(event.id, event);
  await dispatchNext(event);
  return res.status(201).json({ id: event.id, status: event.status, family_alert: event.family_alert, matches: event.matches.map(({ lat, lng, ...row }) => row), dispatch: event.dispatch });
});

app.get('/api/sos/:id', (req, res) => {
  const event = events.get(req.params.id);
  if (!event) return res.status(404).json({ error: 'not_found' });
  const accepted = event.responders.find(r => r.accepted_at);
  const responderMatch = accepted && event.matches.find(m => String(m.responder_id) === String(accepted.responder_id));
  const primary = event.responders[0];
  return res.json({
    id: event.id, category: event.category, trigger: event.trigger, status: event.status,
    family_alert: event.family_alert,
    steps: flags(event, accepted || primary), responder_eta_minutes: accepted?.responder_eta_minutes ?? null,
    responders: responderMatch ? [{ name: responderMatch.name, type: responderMatch.type, distance_m: responderMatch.distance_m }] : []
  });
});

app.get('/api/events', (req, res) => {
  const responderId = req.query.responder_id;
  const role = req.query.role;
  const result = [...events.values()].reverse().filter(event =>
    (!responderId || event.matches.some(row => String(row.responder_id) === String(responderId))) && eventMatchesRole(event, role)
  );
  res.json(result.map(event => ({
    id: event.id, category: event.category, trigger: event.trigger, status: event.status,
    family_alert: event.family_alert,
    created_at: event.created_at, lat: event.lat, lng: event.lng, preset_id: event.preset_id, preset_label: event.preset_label,
    response_window_s: event.response_window_s,
    dispatch_label: event.dispatch?.some(row => row.simulated) ? 'SIMULATED DISPATCH' : event.dispatch?.some(row => row.ok) ? 'TEAM WHITELIST DISPATCH' : 'NO DISPATCH',
    matches: event.matches.filter(row => !role || roleTypes[role]?.includes(row.type)).map(row => {
      const current = event.responders.find(responder => String(responder.responder_id) === String(row.responder_id));
      const delivery = event.dispatch?.find(dispatchRow => String(dispatchRow.responder_id) === String(row.responder_id));
      const log = getDispatchLog().find(item => item.sos_id === event.id && String(item.responder_id) === String(row.responder_id));
      const status = event.accepted_at && !current?.accepted_at
        ? 'closed'
        : current?.status || row.status || (delivery?.ok ? 'notified' : 'not_sent');
      return {
        ...row,
        status,
        responder_eta_minutes: current?.responder_eta_minutes ?? null,
        notified_at: current?.notified_at ? new Date(current.notified_at).toISOString() : null,
        simulated: delivery?.simulated ?? true,
        accept_url: delivery?.accept_url || log?.message.match(/https?:\/\/\S+/)?.[0] || null
      };
    })
  })));
});

app.get('/api/responders', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getResponders().map(({ id, name, type, is_demo, is_sample, preset_id, preset_label, on_duty }) => ({ id, name, type, is_demo, is_sample, preset_id, preset_label, on_duty })));
});

app.get('/api/offline-config', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ demo_mode: config.demoMode, sms_targets: config.demoMode ? config.whitelist : [] });
});

app.post('/api/responders/:id/duty', (req, res) => {
  if (!config.demoMode) return res.status(403).json({ error: 'demo_mode_required' });
  if (typeof req.body?.on_duty !== 'boolean') return res.status(400).json({ error: 'invalid_duty_state' });
  const updated = setOnDuty(req.params.id, req.body.on_duty);
  if (!updated) return res.status(404).json({ error: 'responder_not_found' });
  publish('duty', updated);
  res.json({ ok: true, ...updated });
});

app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');
  const responderId = req.query.responder_id;
  const role = req.query.role;
  const wrapped = { write(packet) {
    if (packet.includes('event: reset')) return res.write(packet);
    const kind = packet.match(/^event: (.+)$/m)?.[1];
    const raw = packet.match(/data: (.+)\n/);
    let payload;
    try { payload = raw && JSON.parse(raw[1]); } catch {}
    if (kind === 'duty') {
      const responderMatches = !responderId || String(payload?.responder_id) === String(responderId);
      const roleMatches = !role || roleTypes[role]?.includes(payload?.responder_type);
      if (responderMatches && roleMatches) res.write(packet);
      return;
    }
    const event = payload?.id && events.get(payload.id);
    const responderMatches = !responderId || String(payload?.responder_id) === String(responderId) || Boolean(event?.responders.some(row => String(row.responder_id) === String(responderId)));
    if (responderMatches && eventMatchesRole(event || { matches: [] }, role)) res.write(packet);
  } };
  listeners.add(wrapped);
  req.on('close', () => listeners.delete(wrapped));
});

app.post('/api/dev/reset', (_req, res) => {
  if (!config.demoMode) return res.status(403).json({ error: 'demo_mode_required' });
  for (const timer of escalationTimers.values()) clearTimeout(timer);
  escalationTimers.clear();
  events.clear(); requests.clear(); resetDispatch(); publish('reset', { ok: true });
  res.json({ ok: true });
});

app.get('/api/metrics', (_req, res) => {
  const durations = [...events.values()].filter(event => Number.isFinite(event.first_dispatched_ms)).map(event => event.first_dispatched_ms - event.created_ms).sort((a, b) => a - b);
  const n = durations.length;
  const median = n ? (n % 2 ? durations[(n - 1) / 2] : (durations[n / 2 - 1] + durations[n / 2]) / 2) : null;
  res.json({ n, median_ms: median });
});

app.get('/r/:token/info', (req, res) => {
  const pair = eventForToken(req, res);
  if (!pair) return;
  const { event, responder } = pair;
  const current = event.responders.find(row => String(row.responder_id) === String(responder.responder_id));
  const delivery = event.dispatch?.find(row => String(row.responder_id) === String(responder.responder_id));
  let status = current?.status || (delivery?.ok ? 'notified' : 'not_sent');
  if (event.accepted_at && !current?.accepted_at) status = 'accepted';
  if (current?.declined_at) status = 'declined';
  res.set('Cache-Control', 'no-store');
  res.json({
    event_id: event.id,
    category: event.category,
    status,
    preset_label: event.preset_label,
    responder_id: responder.responder_id,
    responder_name: responder.name,
    responder_type: responder.type,
    distance_m: responder.distance_m,
    simulated: delivery?.simulated ?? true
  });
});

app.get('/r/:token', (req, res) => {
  if (!resolveToken(req.params.token)) return res.status(404).json({ error: 'invalid_or_expired_token' });
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.resolve(__dirname, '..', '..', 'web', 'accept.html'));
});

app.post('/r/:token/accept', (req, res) => {
  const pair = eventForToken(req, res); if (!pair) return;
  const { event, responder } = pair;
  const row = event.responders.find(r => String(r.responder_id) === String(responder.responder_id));
  if (!row) return res.status(409).json({ error: 'not_available' });
  if (row.declined_at) return res.status(409).json({ error: 'declined' });
  if (row.accepted_at) return res.json({ ok: true, status: 'accepted' });
  if (row.status !== 'notified') return res.status(409).json({ error: 'response_window_expired' });
  if (event.responders.some(candidate => candidate.accepted_at && candidate !== row)) return res.status(409).json({ error: 'already_accepted' });
  clearEscalation(event.id);
  row.accepted_at = Date.now(); row.status = 'accepted'; event.status = 'accepted'; event.accepted_at = row.accepted_at;
  const acceptedMatch = event.matches.find(match => String(match.responder_id) === String(responder.responder_id));
  if (acceptedMatch) acceptedMatch.status = 'accepted';
  publish('status', { id: event.id, status: 'accepted', responder_id: responder.responder_id });
  res.json({ ok: true, status: 'accepted' });
});

app.post('/r/:token/decline', (req, res) => {
  const pair = eventForToken(req, res); if (!pair) return;
  const { event, responder } = pair;
  const row = event.responders.find(r => String(r.responder_id) === String(responder.responder_id));
  if (!row) return res.status(409).json({ error: 'not_available' });
  if (row.accepted_at) return res.status(409).json({ error: 'already_accepted' });
  if (row.status !== 'notified') return res.status(409).json({ error: 'response_window_expired' });
  row.declined_at = Date.now(); row.status = 'declined';
  const declinedMatch = event.matches.find(match => String(match.responder_id) === String(responder.responder_id));
  if (declinedMatch) declinedMatch.status = 'declined';
  publish('status', { id: event.id, status: 'declined', responder_id: responder.responder_id });
  event.status = 'escalating';
  dispatchNext(event, true);
  res.json({ ok: true });
});

app.post('/r/:token/status', (req, res) => {
  const pair = eventForToken(req, res); if (!pair) return;
  const { event, responder } = pair;
  const row = event.responders.find(r => String(r.responder_id) === String(responder.responder_id));
  const steps = { enroute: 'accepted', arrived: 'enroute', resolved: 'arrived' };
  const step = req.body?.step;
  if (!steps[step]) return res.status(400).json({ error: 'invalid_step' });
  const required = `${steps[step]}_at`;
  if (!row?.[required]) return res.status(409).json({ error: 'steps_must_be_in_order' });
  const timestamp = `${step}_at`;
  if (row[timestamp]) return res.status(409).json({ error: 'step_already_set' });
  if (req.body.eta_minutes != null && (step !== 'enroute' || !Number.isInteger(req.body.eta_minutes) || req.body.eta_minutes < 1 || req.body.eta_minutes > 1440)) return res.status(400).json({ error: 'invalid_eta' });
  row[timestamp] = Date.now(); row.status = step; event.status = step; event[timestamp] = row[timestamp];
  const progressedMatch = event.matches.find(match => String(match.responder_id) === String(responder.responder_id));
  if (progressedMatch) progressedMatch.status = step;
  if (step === 'enroute' && req.body.eta_minutes != null) row.responder_eta_minutes = req.body.eta_minutes;
  publish('status', { id: event.id, status: step, responder_id: responder.responder_id });
  res.json({ ok: true, status: step });
});

module.exports = app;
