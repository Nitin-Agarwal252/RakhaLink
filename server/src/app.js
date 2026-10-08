const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { findNearest, getResponders, haversineMeters } = require('./data/responder-store');
const { presets } = require('./data/presets');
const { responderTypesFor } = require('./triage/rules');
const { dispatchEvent, resolveToken, getDispatchLog, resetDispatch } = require('./dispatch');

const app = express();
const events = new Map();
const listeners = new Set();
const requests = new Map();
app.use(cors());
app.use(express.json({ limit: '32kb' }));

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
  const status = responder?.status || (event.status === 'unanswered' ? 'unanswered' : event.status);
  return {
    sent: Boolean(responder?.sent_at), notified: Boolean(responder?.notified_at),
    accepted: Boolean(responder?.accepted_at), enroute: Boolean(responder?.enroute_at),
    arrived: Boolean(responder?.arrived_at), resolved: Boolean(responder?.resolved_at),
    unanswered: status === 'unanswered'
  };
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
  if (body.contacts != null && (!Array.isArray(body.contacts) || body.contacts.length > 2 || body.contacts.some(c => typeof c?.phone !== 'string'))) return res.status(400).json({ error: 'invalid_contacts' });

  const selectedPreset = body.preset_id
    ? presets.find(preset => preset.id === body.preset_id)
    : [...presets].sort((a, b) => haversineMeters(body.lat, body.lng, a.lat, a.lng) - haversineMeters(body.lat, body.lng, b.lat, b.lng))[0];
  const nearestPresetDistance = haversineMeters(body.lat, body.lng, selectedPreset.lat, selectedPreset.lng);
  const preset = body.preset_id || nearestPresetDistance <= 30000 ? selectedPreset : null;
  const event = {
    id: crypto.randomUUID(), category: body.category, trigger: body.trigger || 'manual', client_id: body.client_id || null,
    created_at: new Date().toISOString(), created_ms: now, status: 'received', matches: [], responders: [],
    lat: body.lat, lng: body.lng, preset_id: preset?.id || null, preset_label: preset?.label || null,
    peak_g: body.trigger === 'crash_auto' ? body.peak_g : undefined,
    pre_impact_kmh: body.trigger === 'crash_auto' ? body.pre_impact_kmh : undefined
  };
  const types = responderTypesFor(body.category);
  const all = [];
  for (const type of types) all.push(...await findNearest([type], body.lat, body.lng, 3, preset?.id));
  all.sort((a, b) => a.distance_m - b.distance_m || String(a.id).localeCompare(String(b.id)));
  event.matches = all.map(row => ({
    responder_id: row.id, name: row.name, type: row.type, distance_m: row.distance_m,
    is_demo: true, is_sample: Boolean(row.is_sample), preset_id: row.preset_id, preset_label: row.preset_label,
    lat: row.lat, lng: row.lng
  }));
  event.responders = event.matches.map(row => ({ responder_id: row.responder_id, status: 'notified', sent_at: null, notified_at: null, accepted_at: null, enroute_at: null, arrived_at: null, resolved_at: null, responder_eta_minutes: null, declined_at: null }));
  const raw = all.map(row => ({ ...row, phone: getResponders().find(item => String(item.id) === String(row.id))?.phone || null }));
  const dispatch = await dispatchEvent(event, raw);
  for (const item of dispatch.filter(row => row.ok)) {
    const responder = event.responders.find(row => String(row.responder_id) === String(item.responder_id));
    if (responder) { responder.sent_at = now; responder.notified_at = now; }
  }
  const successful = dispatch.filter(row => row.ok);
  event.status = successful.length ? 'dispatched' : 'unanswered';
  event.responders = event.responders.filter(row => successful.some(item => String(item.responder_id) === String(row.responder_id)));
  events.set(event.id, event);
  for (const item of successful) publish('alert', { id: event.id, status: event.status, category: event.category, responder_id: item.responder_id });
  return res.status(201).json({ id: event.id, status: event.status, matches: event.matches.map(({ lat, lng, ...row }) => row), dispatch });
});

app.get('/api/sos/:id', (req, res) => {
  const event = events.get(req.params.id);
  if (!event) return res.status(404).json({ error: 'not_found' });
  const accepted = event.responders.find(r => r.accepted_at);
  const responderMatch = accepted && event.matches.find(m => String(m.responder_id) === String(accepted.responder_id));
  const primary = event.responders[0];
  return res.json({
    id: event.id, category: event.category, trigger: event.trigger, status: event.status,
    steps: flags(event, accepted || primary), responder_eta_minutes: accepted?.responder_eta_minutes ?? null,
    responders: responderMatch ? [{ name: responderMatch.name, type: responderMatch.type, distance_m: responderMatch.distance_m }] : []
  });
});

app.get('/api/events', (req, res) => {
  const responderId = req.query.responder_id;
  const result = [...events.values()].reverse().filter(event => !responderId || event.matches.some(row => String(row.responder_id) === String(responderId)));
  res.json(result.map(event => ({
    id: event.id, category: event.category, trigger: event.trigger, status: event.status,
    created_at: event.created_at, lat: event.lat, lng: event.lng, preset_id: event.preset_id, preset_label: event.preset_label,
    matches: event.matches.map(({ lat, lng, ...row }) => ({
      ...row,
      accept_url: getDispatchLog().find(log => log.sos_id === event.id && String(log.responder_id) === String(row.responder_id))?.message.match(/https?:\/\/\S+/)?.[0] || null
    }))
  })));
});

app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();
  res.write('retry: 3000\n\n');
  const responderId = req.query.responder_id;
  const wrapped = { write(packet) { if (!responderId || packet.includes(`"responder_id":"${responderId}"`) || packet.includes(`"responder_id":${responderId}`)) res.write(packet); } };
  listeners.add(wrapped);
  req.on('close', () => listeners.delete(wrapped));
});

app.post('/api/dev/reset', (_req, res) => {
  if (!config.demoMode) return res.status(403).json({ error: 'demo_mode_required' });
  events.clear(); requests.clear(); resetDispatch(); publish('reset', { ok: true });
  res.json({ ok: true });
});

app.get('/api/metrics', (_req, res) => {
  const durations = [...events.values()].filter(event => event.accepted_at).map(event => event.accepted_at - event.created_ms).sort((a, b) => a - b);
  const n = durations.length;
  const median = n ? (n % 2 ? durations[(n - 1) / 2] : (durations[n / 2 - 1] + durations[n / 2]) / 2) : null;
  res.json({ n, median_ms: median });
});

app.get('/r/:token', (req, res) => {
  const pair = eventForToken(req, res);
  if (!pair) return;
  const { event, responder } = pair;
  res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>RakshaLink responder</title></head><body><main><h1>RakshaLink alert</h1><p>${escapeHtml(event.category)} · ${escapeHtml(responder.name)}</p><p>${escapeHtml(event.preset_label || 'Location label unknown')}</p><p>Status: ${escapeHtml(event.status)}</p><button onclick="fetch(location.pathname+'/accept',{method:'POST'}).then(()=>location.reload())">Accept</button><button onclick="fetch(location.pathname+'/decline',{method:'POST'}).then(()=>location.reload())">Decline</button><footer>© OpenStreetMap contributors</footer></main></body></html>`);
});

app.post('/r/:token/accept', (req, res) => {
  const pair = eventForToken(req, res); if (!pair) return;
  const { event, responder } = pair;
  const row = event.responders.find(r => String(r.responder_id) === String(responder.responder_id));
  if (!row) return res.status(409).json({ error: 'not_available' });
  if (row.declined_at) return res.status(409).json({ error: 'declined' });
  if (row.accepted_at) return res.json({ ok: true, status: 'accepted' });
  row.accepted_at = Date.now(); row.status = 'accepted'; event.status = 'accepted'; event.accepted_at = row.accepted_at;
  publish('status', { id: event.id, status: 'accepted', responder_id: responder.responder_id });
  res.json({ ok: true, status: 'accepted' });
});

app.post('/r/:token/decline', (req, res) => {
  const pair = eventForToken(req, res); if (!pair) return;
  const { event, responder } = pair;
  const row = event.responders.find(r => String(r.responder_id) === String(responder.responder_id));
  if (row.accepted_at) return res.status(409).json({ error: 'already_accepted' });
  row.declined_at = Date.now(); row.status = 'declined';
  if (event.responders.every(r => r.declined_at)) { event.status = 'unanswered'; publish('unanswered', { id: event.id, status: event.status }); }
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
  if (req.body.eta_minutes != null && (!Number.isFinite(req.body.eta_minutes) || req.body.eta_minutes < 0 || req.body.eta_minutes > 1440)) return res.status(400).json({ error: 'invalid_eta' });
  row[timestamp] = Date.now(); row.status = step; event.status = step; event[timestamp] = row[timestamp];
  if (step === 'enroute' && req.body.eta_minutes != null) row.responder_eta_minutes = req.body.eta_minutes;
  publish('status', { id: event.id, status: step, responder_id: responder.responder_id });
  res.json({ ok: true, status: step });
});

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }

module.exports = app;
