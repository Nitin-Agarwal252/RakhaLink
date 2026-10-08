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
  "transcript": null }
```
`peak_g`, `pre_impact_kmh` only for `crash_auto`. `transcript` only for `voice`. Contact payloads are rejected and never stored.
Response `201`:
```json
{ "id": "e1", "status": "dispatched",
  "family_alert": { "status": "simulated", "label": "SIMULATED FAMILY ALERT", "destination": null, "sent": false, "detail": "Demo record only. No contact was notified." },
  "matches": [ { "responder_id": 12, "name": "Sample District Hospital", "type": "hospital", "distance_m": 4200, "is_demo": true },
               { "responder_id": 31, "name": "Sample Highway Police Station", "type": "police", "distance_m": 3800, "is_demo": true } ],
  "dispatch": [ { "responder_id": 12, "method": "sms", "simulated": true } ] }
```
Errors: `400 {"error":"invalid_category"}`, `400 {"error":"invalid_location"}`, `400 {"error":"contacts_not_supported_in_demo"}`, `429 {"error":"rate_limited"}`. Contact payloads are rejected and never stored.

## `GET /api/sos/:id` (rider status screen)
```json
{ "id": "e1", "category": "accident", "trigger": "crash_auto", "status": "accepted",
  "steps": { "sent": true, "notified": true, "accepted": true, "enroute": false, "arrived": false, "resolved": false, "unanswered": false },
  "responder_eta_minutes": null,
  "responders": [ { "name": "Sample District Hospital", "type": "hospital", "distance_m": 4200 } ] }
```
`responder_eta_minutes` is non-null only if the responder typed it. The app never shows an ETA the system computed.
`family_alert` is a local in-memory demo record, never an outbound notification. The mobile status screen and responder console label it simulated and state that no contact was notified. No contact data is accepted or stored.

## Responder actions (same token as the SMS link; the console uses the same calls)
- `GET /r/:token` mobile accept page (HTML)
- `GET /r/:token/info` private alert and responder details for the accept page; returns no phone number
- `POST /r/:token/accept` returns `{ "ok": true, "status": "accepted" }`
- `POST /r/:token/decline` returns `{ "ok": true }`; a decline immediately notifies the next on-duty match. If none remain, status becomes `unanswered`.
- `POST /r/:token/status` body `{ "step": "enroute" | "arrived" | "resolved", "eta_minutes": 18 }` (`eta_minutes` optional; responder-entered integer from 1–1440, accepted with the `enroute` step). Steps must go in order.
- `GET /api/responders` returns sample/demo responder role and duty fields, without phone numbers.
- `POST /api/responders/:id/duty` (DEMO_MODE only) body `{ "on_duty": false }`; off-duty responders are excluded from new matching.

## Console data
- `GET /api/events?responder_id=12` returns alerts for that responder; `?role=hospital|police|mechanic|fuel_pump` returns role-scoped alerts. Rows include `response_window_s`, `dispatch_label`, match `status`, `notified_at`, `simulated`, and `accept_url` fields. Matched locations are sample/demo OSM points; distances are straight-line.
- `GET /api/stream?responder_id=12` or `?role=hospital` (Server-Sent Events). Event names include `alert`, `status`, `escalating`, `escalated`, `unanswered`, `duty`, and `reset`.
- Only the nearest on-duty match is notified initially. If the response window expires or the responder declines, the next on-duty match is notified. Acceptance stops escalation. The console displays this response window and each real responder-entered status step.

## Other
- `GET /api/metrics` returns `{ "n": 0, "median_ms": null }`; with successful dispatches it reports the count and median SOS-to-first-dispatch duration for this in-memory demo session.
- `GET /api/offline-config` returns `demo_mode` and configured whitelisted `sms_targets`; the rider app uses a returned target only to open a prefilled draft and never sends automatically.
- `POST /api/dev/reset` (DEMO_MODE only) returns `{ "ok": true }`
- `GET /health` returns `{ "ok": true }`
