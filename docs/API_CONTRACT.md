# API contract (shared by server, mobile and web)

All bodies are JSON. Times are ISO 8601. IDs are strings. Sample values only.

## Enums
- `category`: `fuel` | `breakdown` | `accident` | `medical`
- `trigger`: `manual` | `voice` | `crash_auto`
- `status`: `received` | `dispatched` | `accepted` | `enroute` | `arrived` | `resolved` | `escalating` | `unanswered` | `failed`
- responder `type`: `hospital` | `police` | `mechanic` | `fuel_pump`
- Role views: hospital sees medical + accident, police sees accident, mechanic sees breakdown, fuel_pump sees fuel.

## `POST /api/sos`
```json
{ "category": "accident", "trigger": "crash_auto", "lat": 22.6951, "lng": 88.3788,
  "client_id": "c0ffee-1", "client_ts": "2026-10-08T10:42:00+05:30",
  "peak_g": 8.4, "pre_impact_kmh": 72,
  "transcript": null, "contacts": [{ "phone": "+910000000000" }] }
```
`peak_g`, `pre_impact_kmh` only for `crash_auto`. `transcript` only for `voice`. `contacts` optional, max 2, not stored.
Response `201`:
```json
{ "id": "e1", "status": "dispatched",
  "matches": [ { "responder_id": 12, "name": "Sample District Hospital", "type": "hospital", "distance_m": 4200, "is_demo": true },
               { "responder_id": 31, "name": "Sample Highway Police Station", "type": "police", "distance_m": 3800, "is_demo": true } ],
  "dispatch": [ { "responder_id": 12, "method": "sms", "simulated": true } ] }
```
Errors: `400 {"error":"invalid_category"}`, `400 {"error":"invalid_location"}`, `429 {"error":"rate_limited"}`.

## `GET /api/sos/:id` (rider status screen)
```json
{ "id": "e1", "category": "accident", "trigger": "crash_auto", "status": "accepted",
  "steps": { "sent": true, "notified": true, "accepted": true, "enroute": false, "arrived": false, "resolved": false, "unanswered": false },
  "responder_eta_minutes": null,
  "responders": [ { "name": "Sample District Hospital", "type": "hospital", "distance_m": 4200 } ] }
```
`responder_eta_minutes` is non-null only if the responder typed it. The app never shows an ETA the system computed.

## Responder actions (same token as the SMS link; the console uses the same calls)
- `GET /r/:token` mobile accept page (HTML)
- `POST /r/:token/accept` returns `{ "ok": true, "status": "accepted" }`
- `POST /r/:token/decline` returns `{ "ok": true }` and triggers escalation
- `POST /r/:token/status` body `{ "step": "enroute" | "arrived" | "resolved", "eta_minutes": 8 }` (`eta_minutes` optional). Steps must go in order.
- `POST /api/responders/:id/duty` body `{ "on_duty": false }`

## Console data
- `GET /api/events?responder_id=12` returns alerts for that responder, filtered by role.
- `GET /api/stream?responder_id=12` (Server-Sent Events). Event names: `alert`, `status`, `escalated`, `unanswered`. Each `data:` is JSON such as `{ "id": "e1", "status": "accepted" }`.

## Other
- `POST /api/sms/inbound` compact payload `RL1|<M|A|B|F>|<lat>,<lng>|<unix_ts>` (add `|C` for crash)
- `GET /api/metrics` returns `{ "n": 0, "median_ms": null }`
- `POST /api/dev/reset` (DEMO_MODE only) returns `{ "ok": true }`
- `GET /health` returns `{ "ok": true }`
