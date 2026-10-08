# Server memory

## Current phase — NH-19 Durgapur seed (8 Oct 2026)

### Done
- Added the demo preset `NH-19 sample point (Durgapur area)` at `23.5500, 87.3200`, marked `is_sample: true` and `is_demo: true`.
- Seed queries cover OSM `amenity=hospital`, `amenity=police`, `amenity=fuel`, and `shop=car_repair` within 15 km. A type with zero results is queried again at 30 km; the selected radius and count are stored per preset and per type.
- Both preset results are cached in `data/osm-cache.json`; active responders are written to `data/responders.json`. No prohibited Stitch values or labels are present in the server implementation.
- Matching infers a known preset from a location within 30 km of its anchor when `preset_id` is omitted. The mock responder page includes the exact OSM attribution `© OpenStreetMap contributors`.

### Verification (real output)
- `npm run seed`:
  - GNIT: hospital 197, police 25, mechanic 1, fuel pump 53; all searches 15 km.
- NH-19 Durgapur: hospital 22, police 1, mechanic 0, fuel pump 4; mechanic widened to 30 km and a successful Overpass query confirmed 0 results. The seed retries three documented global Overpass instances and records unavailable results distinctly from confirmed zero counts.
- Cache validation: 276 GNIT rows, 27 Durgapur rows; zero rows missing `is_demo`/`is_sample` or with a mismatched preset id.
- Haversine cache audit: zero rows outside their recorded query radius. Maximum Durgapur distances were 14,410 m (hospital), 13,149 m (police), and 14,270 m (fuel pump); the mechanic result count is zero after the 30 km query.
- `npm test`: 5 passed, 0 failed.
- `node --check src/app.js` and `node --check src/seed.js`: passed.
- Local `curl` at Durgapur: medical dispatched with 3 hospital matches; accident dispatched with 4 matches (hospital and police); breakdown returned `unanswered` with 0 matches; fuel dispatched with 3 fuel-pump matches. Returned matches were sorted and labelled `NH-19 sample point (Durgapur area)`; all were sample/demo rows.
- Generated `GET /r/:token` page check: preset label and exact `© OpenStreetMap contributors` attribution both present.

### Known limits / handoff
- `DEMO_WHITELIST` is empty in this environment, so seeded rows have no phone numbers and mock dispatch is the only mode exercised. No real messages were sent.
- There are no OSM car-repair results within 30 km of the Durgapur preset; breakdown therefore has no match and returns `unanswered` honestly.
- Mobile’s location-card label and the web console’s map attribution belong to Roles C/D and were not edited under the `/server` scope. The server API exposes the preset label and its responder page shows the OSM attribution.
- T1 integration passed in mock mode. T2 implementation is underway.

## Backend gates completed previously
- G0 server: Express binds to `0.0.0.0:PORT`, CORS and root `.env` loading; `curl /health` returned `{"ok":true}`.
- Data: Docker is unavailable in this environment; nearest matching uses the in-memory haversine interface.
- Triage/API: deterministic category rules and four category POST smoke checks passed.
- Dispatch/status: mock dispatch, hashed random accept tokens, accept/decline/status endpoints, real step flags, events, SSE, metrics, and demo-only reset are implemented. A complete responder status flow was smoke-checked; ETA was retained only after responder entry.

## T2 implementation verification — 8 Oct 2026
- Mock API starts with exactly one on-duty match. With a 3-second response window, timeout marked the first match no-response and notified the next match. Declining the first of multiple hospital matches advanced immediately.
- Off-duty toggle returned `false`, that responder was excluded from the next medical match, then it was restored `true`. Role API filtering returned no matches outside the selected responder type.
- Browser console accepted an alert and set responder-owned states On the way → Arrived → Resolved. The rider API returned all corresponding step flags true.
- Metric now records actual SOS-to-first-successful-dispatch duration for the in-memory demo session. No performance claim is made from the smoke run.
- No team whitelist is configured, so only mock dispatch was exercised. Family notification is not implemented: there is no approved family channel, and outbound contact is restricted to whitelisted team destinations.

## Overall T1 integration — 8 Oct 2026
- Static desktop console and tokenized responder accept page are served by Express; both use API data, explicit demo dispatch labeling, and OpenStreetMap attribution.
- Browser/API verification covered acceptance, event status propagation, all-declined → unanswered, and the required “No responder answered. Call 112.” message.
- Current limitation: no team whitelist, so only mock dispatch was exercised. Physical mobile-to-console rehearsal remains pending. Automatic escalation is Tier 2.
