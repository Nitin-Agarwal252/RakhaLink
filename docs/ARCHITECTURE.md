# Architecture

```text
Rider app (Expo)  ->  API (Express)  ->  Triage  ->  Match (haversine)  ->  Dispatch (mock / whitelisted SMS)  ->  Responder
                                                                                   |
                                  Responder Console (web) <-- live updates (SSE) ---+
```

## Triage (deterministic, unit-tested)

| Emergency | Dispatched to |
|---|---|
| medical | nearest hospital |
| accident | nearest hospital **and** nearest police |
| breakdown | nearest mechanic |
| fuel | nearest fuel pump |

The mapping lives in one file. A voice transcript classifier is not implemented. Accident matches include both hospitals and police and are notified sequentially by distance.

## Data model (core tables)

```sql
responders(id, name, type, phone, geom GEOGRAPHY(Point,4326), source, osm_id, is_demo)
sos_events(id, category, trigger, channel, geom, status, created_at, peak_g, pre_impact_kmh, accepted_by)
dispatch_log(id, sos_id, responder_id, method, ok, token_hash, accepted_at, declined_at, escalation_level, at)
```

The current app uses in-memory haversine distance and sample/demo OSM rows. PostGIS is not configured. Off-duty responders are omitted from new matches.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/sos` | Create an alert from the app (category, location, trigger) |
| `GET /api/sos/:id` | Real status flags: sent, notified, accepted, unanswered |
| `GET /api/stream` | Server-Sent Events for the Responder Console |
| `GET /r/:token`, `POST /r/:token/accept` or `decline` | Mobile accept page opened from the SMS link |
| `GET /api/metrics` | Median time-to-dispatch with sample size |

## Dispatch and escalation

Dispatch sits behind a `PROVIDER` switch: `mock` labels each notification **SIMULATED DISPATCH**; optional Twilio SMS may send only to configured `DEMO_WHITELIST` numbers. Accept links use random tokens, stored only as hashes, and expire. The nearest on-duty match is notified first. If they decline or do not accept within `ESCALATE_AFTER_S`, the next on-duty match is contacted. When eligible matches are exhausted, the alert becomes `unanswered` and the rider is told to call 112. The flow is in-memory and resets when the server restarts.

## Drive Mode (crash detection)

A foreground prototype checks for a speed sample of at least 25 km/h within 3 seconds before an impact of at least 3 g, followed within 2 seconds by a drop of at least 25 km/h and speed at or below `max(10 km/h, 35% of pre-impact speed)`. A single spike or missing speed context is ignored. A match starts a 20-second countdown. Motion samples stay on the phone; the event summary and current coordinates are sent only if the countdown completes. Unit tests cover three sample traces; these thresholds are not validated on real crashes and no accuracy claim is made.

## Offline ladder

1. Data available: submit the SOS to the API.
2. No data: retain the request in local AsyncStorage. When the API has whitelisted team targets configured, open a prefilled SMS draft to one of them; the rider must review and send it. No target is configured in the current demo.
3. No signal: show a repeating screen Morse SOS and keep the request in the persisted queue for manual retry after connectivity returns. Screen Morse does not reach a responder and does not activate the torch.

## Security basics

Hashed accept tokens, rate limiting on `POST /api/sos`, strict input validation, no secrets in the repo, a demo-only reset endpoint that is disabled outside demo mode.

## Responder workflow

The DEMO-only console has an **on duty** switch; off-duty responders are not matched. A responder moves an accepted alert through `enroute`, `arrived`, `resolved` using their tokenized accept link; the rider sees only actual steps. No ETA input is implemented in this phase. Distances are straight-line, with no computed driving ETA. Role views filter the console: hospital sees medical and accident, police sees accident, mechanic sees breakdown, fuel pump sees fuel. Family notification is not implemented because outbound contacts are restricted to approved team numbers.
