# RakshaLink server

Node.js and Express API for the demo. It binds to `0.0.0.0:${PORT}` (default `3000`), loads the repository `.env`, enables CORS, and defaults to `DEMO_MODE=true` and `PROVIDER=mock`.

## Run

```powershell
cd server
npm install
npm start
```

The same server hosts the responder console at `http://localhost:3000/` and serves the tokenized mobile accept page at `/r/:token`. Check `GET /health` for `{"ok":true}`. Use `npm test` for deterministic triage rule tests.

## OSM seed and matching

`npm run seed` fetches OSM hospital, police, fuel and car-repair features within 15 km of GNIT (`22.6951, 88.3788`) and the sample preset `NH-19 sample point (Durgapur area)` (`23.5500, 87.3200`). If a type has no result at 15 km, only that type is queried again at 30 km. Search radii and counts are recorded in `data/osm-cache.json`; the active demo responder list is written to `data/responders.json`. If Overpass is unavailable, the last cache is reused. Responder phones are assigned only from `DEMO_WHITELIST`; with an empty whitelist, phones remain null. Every record is marked `is_demo: true` and `is_sample: true`.

The API accepts the optional `preset_id` values `gnit` and `nh19-durgapur`. When it is omitted, a request within 30 km of a preset is matched against that preset only.

Matching uses the `findNearest(types, lat, lng, limit, presetId)` interface with in-memory haversine distances. Docker is not installed in the development environment, so PostGIS is not configured. The NH-19 preset is pending the sample coordinate from the project owner.

## Dispatch and safety

`PROVIDER=mock` records the would-be SMS, token hash, and `SIMULATED DISPATCH` label in the in-memory dispatch log. Random accept tokens are indexed by SHA-256 hash and expire after 24 hours. `PROVIDER=twilio` sends SMS only when Twilio credentials are configured and the recipient exactly matches `DEMO_WHITELIST`. The development smoke checks used mock mode and did not contact external numbers. Contacts from an SOS request are validated but not stored.

The API has the shared endpoints in [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md), including SOS creation/status, responder accept/decline/status actions, events, SSE, metrics, and demo-only reset. The console shows a response-window countdown but does not auto-escalate when it expires; automatic escalation, responder duty, and role filters remain Tier 2.
