# Architecture

```text
Rider app (Expo)  ->  API (Express)  ->  Triage  ->  Match (PostGIS)  ->  Dispatch (SMS/voice)  ->  Responder
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

The mapping lives in one file. If a voice transcript is classified by a model, the output must be one of these four values or it is discarded and the user is asked to confirm.

## Data model (core tables)

```sql
responders(id, name, type, phone, geom GEOGRAPHY(Point,4326), source, osm_id, is_demo)
sos_events(id, category, trigger, channel, geom, status, created_at, peak_g, pre_impact_kmh, accepted_by)
dispatch_log(id, sos_id, responder_id, method, ok, token_hash, accepted_at, declined_at, escalation_level, at)
```

Nearest match: `ORDER BY geom <-> point LIMIT 3` filtered by the needed responder types. If PostGIS is unavailable, an in-memory haversine search returns the same results.

## API

| Endpoint | Purpose |
|---|---|
| `POST /api/sos` | Create an alert from the app (category, location, trigger) |
| `GET /api/sos/:id` | Real status flags: sent, notified, accepted, unanswered |
| `GET /api/stream` | Server-Sent Events for the Responder Console |
| `GET /r/:token`, `POST /r/:token/accept` or `decline` | Mobile accept page opened from the SMS link |
| `POST /api/sms/inbound` | Compact SMS fallback payload, same pipeline |
| `GET /api/metrics` | Median time-to-dispatch with sample size |

## Dispatch and escalation

Dispatch sits behind a `PROVIDER` switch: `mock` records what would be sent and labels it **SIMULATED DISPATCH**; `twilio` sends to whitelisted demo numbers. Accept links use random tokens, stored only as hashes, and expire. If no responder accepts within `ESCALATE_AFTER_S`, the next-nearest responder of the needed type is contacted. After three attempts per type, the alert becomes `unanswered` and the rider is told to call 112.

## Drive Mode (crash detection)

A pure state machine: `Idle -> Armed -> Verifying -> Countdown -> SOS`. It arms on sustained driving speed, reacts to an impact spike, and requires a sharp speed drop or stillness within a few seconds. A spike where speed continues is discarded. Thresholds live in one config file and are starting values, not validated on real crashes. Motion data never leaves the phone; only a summary is sent when an alert fires. Tested with synthetic traces: crash, speed breaker, pothole, stationary drop, hard braking.

## Offline ladder

1. Data available: call the API.
2. No data but SMS works: open a prefilled SMS with a compact payload; the gateway runs the same triage.
3. No signal: Morse SOS (torch and speaker) for people nearby, and the alert is queued until signal returns. Morse does not reach a responder by itself, and the SMS fallback needs a tap on Send.

## Security basics

Hashed accept tokens, rate limiting on `POST /api/sos`, strict input validation, no secrets in the repo, a demo-only reset endpoint that is disabled outside demo mode.

## Responder workflow

Responders have an **on duty** switch (off-duty responders are never matched or contacted) and move an alert through `accepted`, `enroute`, `arrived`, `resolved`. Each step is set only by the responder through the same tokenised link used for accepting. The rider sees only real steps. An ETA appears only if the responder typed it, labelled as the responder's estimate. Distances are straight-line, with no computed driving ETA. Role views filter the console: hospital sees medical and accident, police sees accident, mechanic sees breakdown, fuel pump sees fuel.
