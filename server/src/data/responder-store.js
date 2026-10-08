const fs = require('node:fs');
const path = require('node:path');

const DATA_FILE = path.resolve(__dirname, '..', '..', 'data', 'responders.json');
let responders = [];
try {
  responders = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch {}

function setResponders(rows) {
  responders = rows.map(row => ({ ...row, is_demo: true }));
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(responders, null, 2)}\n`);
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearest(types, lat, lng, limit = 3, presetId) {
  const allowed = new Set(types);
  return responders
    .filter(row => allowed.has(row.type) && (!presetId || row.preset_id === presetId))
    .map(row => ({ ...row, distance_m: Math.round(haversineMeters(lat, lng, row.lat, row.lng)) }))
    .sort((a, b) => a.distance_m - b.distance_m || Number(a.id) - Number(b.id))
    .slice(0, Math.max(0, limit));
}

function getResponders() { return responders.map(row => ({ ...row, on_duty: row.on_duty !== false })); }

function setOnDuty(id, onDuty) {
  const responder = responders.find(row => String(row.id) === String(id));
  if (!responder) return null;
  responder.on_duty = onDuty;
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(responders, null, 2)}\n`);
  return { id: responder.id, responder_id: responder.id, responder_type: responder.type, on_duty: responder.on_duty };
}

module.exports = { findNearest, getResponders, setResponders, setOnDuty, haversineMeters };
