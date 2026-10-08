const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { setResponders } = require('./data/responder-store');
const { presets } = require('./data/presets');

const cacheFile = path.resolve(__dirname, '..', 'data', 'osm-cache.json');
const types = ['hospital', 'police', 'mechanic', 'fuel_pump'];
const filters = {
  hospital: '[amenity=hospital]',
  police: '[amenity=police]',
  mechanic: '[shop=car_repair]',
  fuel_pump: '[amenity=fuel]'
};

function classify(tags = {}) {
  if (tags.amenity === 'hospital') return 'hospital';
  if (tags.amenity === 'police') return 'police';
  if (tags.amenity === 'fuel') return 'fuel_pump';
  if (tags.shop === 'car_repair') return 'mechanic';
  return null;
}

function normalize(element, preset) {
  const tags = element.tags || {};
  const type = classify(tags);
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!type || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: `${preset.id}-${element.type}-${element.id}`,
    osm_id: `${element.type}/${element.id}`,
    name: tags.name || `Unnamed ${type.replace('_', ' ')} from OpenStreetMap`,
    type, lat, lng, preset_id: preset.id, preset_label: preset.label,
    is_sample: preset.is_sample, source: 'openstreetmap', is_demo: true,
    phone: config.whitelist.length ? config.whitelist[(Number(element.id) || 0) % config.whitelist.length] : null
  };
}

async function fetchElements(preset, radiusKm, selectedTypes = types) {
  const radiusM = radiusKm * 1000;
  const filtersForQuery = selectedTypes.map(type => `nwr(around:${radiusM},${preset.lat},${preset.lng})${filters[type]};`).join('');
  const query = `[out:json][timeout:25];(${filtersForQuery});out center tags;`;
  let lastError;
  for (const endpoint of [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ]) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST', headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          'user-agent': 'RakshaLink-demo/1.0 (OpenStreetMap Overpass seed)'
        },
        body: `data=${encodeURIComponent(query)}`, signal: AbortSignal.timeout(30000)
      });
      if (!response.ok) { lastError = new Error(`Overpass HTTP ${response.status}`); continue; }
      const body = await response.json();
      return (body.elements || []).map(item => normalize(item, preset)).filter(Boolean);
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Overpass unavailable');
}

async function fetchPreset(preset, previous) {
  const rows15 = await fetchElements(preset, 15);
  const rows = rows15.slice();
  const searches = {};
  for (const type of types) {
    let count = rows15.filter(row => row.type === type).length;
    searches[type] = { radius_km: 15, count, widened: false, source: 'overpass' };
    if (count > 0) continue;
    try {
      const rows30 = await fetchElements(preset, 30, [type]);
      const widenedRows = rows30.filter(row => row.type === type);
      rows.push(...widenedRows);
      count = widenedRows.length;
      searches[type] = { radius_km: 30, count, widened: true, source: 'overpass' };
    } catch (error) {
      const cachedRows = (previous?.rows || []).filter(row => row.type === type);
      rows.push(...cachedRows);
      searches[type] = { radius_km: 30, count: cachedRows.length, widened: true, source: cachedRows.length ? 'cache' : 'unavailable', error: error.message };
    }
  }
  const unique = [...new Map(rows.map(row => [row.osm_id, row])).values()];
  return { fetched_at: new Date().toISOString(), preset: { ...preset }, type_searches: searches, rows: unique };
}

async function main() {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}
  for (const preset of presets) {
    try {
      cache[preset.id] = await fetchPreset(preset, cache[preset.id]);
      console.log(`${preset.label}: refreshed ${cache[preset.id].rows.length} OSM records`);
    } catch (error) {
      console.warn(`${preset.label}: Overpass unavailable (${error.message}); using cached data`);
      cache[preset.id] ??= { fetched_at: null, preset: { ...preset }, type_searches: {}, rows: [] };
    }
  }
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, `${JSON.stringify(cache, null, 2)}\n`);
  const rows = Object.values(cache).flatMap(entry => entry.rows || []);
  setResponders(rows);
  for (const preset of presets) {
    const entry = cache[preset.id] || { rows: [], type_searches: {} };
    const counts = Object.fromEntries(types.map(type => [type, (entry.rows || []).filter(row => row.type === type).length]));
    console.log(`${preset.label} (${preset.lat}, ${preset.lng}; sample/demo): ${JSON.stringify(counts)}`);
    console.log(`Search radii: ${JSON.stringify(Object.fromEntries(types.map(type => [type, entry.type_searches?.[type]?.radius_km ?? 'cached/unknown'])))}`);
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { classify, normalize, presets };
