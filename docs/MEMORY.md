
## Gate G2/G3 — overall T1 integration (8 Oct 2026)

### Delivered
- Mobile rider app: four SOS categories, both sample presets, manual Call 112, API-backed status timeline, and Drive Mode crash simulation with a 20-second audible countdown, cancel action, then automatic Accident SOS. Crash simulation is explicitly a demo; no sensor-based crash detection is claimed.
- Desktop responder console: alert queue, OSM map with rider pin and attribution, request details, distance-sorted sample/demo matches, Accept and Can't respond actions, live SSE updates with polling fallback, and a visible response window. Expiry does not auto-escalate in T1; the UI says no next responder was notified.
- Tokenized responder accept page works on mobile web and shows only event/preset/responder details, straight-line distance, demo dispatch label, and Accept/Can't respond actions. No rider phone is shown.
- Server status and events reflect acceptance, decline, and unanswered outcomes. Competing accepts are rejected. When every match declines, the rider-facing response is “No responder answered. Call 112.”

### Verification
- Server triage test suite: 5 passed, 0 failed; `node --check` passed for server and both web scripts.
- Mock HTTP + browser flow: created medical/fuel/accident SOS events; accepted responders updated console and rider status; declining all three medical matches changed the event to UNANSWERED and displayed the required call-112 message.
- Console and accept page were opened and interacted with in the browser. OSM map embed and `© OpenStreetMap contributors` attribution appeared. No rider phone was included in the events payload.
- Android Expo bundle had previously passed after adding the alarm asset and audio package. Physical-device audio, dialer launch, and phone-to-laptop flow were not available for verification here.

### Gate result and boundaries
- T1 implementation and mock web/API integration are complete. Before a live demo, connect Expo Go using the laptop's LAN API URL and perform one physical phone-to-console rehearsal.
- Dispatch remains simulated; no real SMS/call was sent because no team whitelist was configured.
- Tier 2 features remain out of scope: automatic escalation, on-duty filtering, responder progression, and real crash detection.

## T2 implementation — 8 Oct 2026

### Delivered
- Sequential mock/provider dispatch: one nearest on-duty match is notified; timeout or decline advances to the next eligible match. Acceptance clears the escalation timer. Exhausted matches become unanswered.
- Responder duty state is persisted; off-duty responders are excluded from new matching. Console “View as” selects one of the four demo roles and scopes queue/events/SSE. The demo role toggle changes a representative unit's duty state.
- Console actions progress an accepted responder through On the way, Arrived, and Resolved using the responder token. Rider status remains API-backed and only advances when the responder acts.
- Offline SOS drafts persist in AsyncStorage. The offline screen has a repeating screen Morse signal, retry, discard, manual Call 112, and prefilled SMS draft to a DEMO_MODE whitelist destination only. No team whitelist exists in this environment, so the SMS draft action is disabled.
- Foreground crash-monitoring prototype reads location speed and accelerometer data; it requires a recent speed context, an impact, and a sudden speed drop before a 20-second countdown. Sample trace replay rejects an isolated spike. No accuracy claim or background monitoring.
- Console displays a median SOS-to-first-dispatch metric based on successful dispatches in the current in-memory demo session.
- SOS status and console now show an in-memory `SIMULATED FAMILY ALERT` record with `sent: false`, no destination, and the explicit message that no contact was notified. No family contact is collected, stored, or messaged.
- Began T3 responder-entered ETA: console has an optional whole-minute input on the On the way action, API events return the responder-supplied value, and the rider labels it as an estimate. No computed ETA is introduced.
- ETA mock integration passed: accepted a medical alert, recorded an 18-minute responder-entered estimate on `enroute`, and verified both rider status and console event API return 18; an ETA supplied on `arrived` was rejected (HTTP 400).
- T3 responder history view: console Active/History tabs split live statuses from resolved/unanswered alerts using the existing in-memory events feed. History is explicitly limited to this server session. Frontend-only change; no API or Expo process restart.

### Verification
- `npm test`: 5 passed, 0 failed; server and console JavaScript syntax checks passed.
- Crash sequence tests: 3 passed (single spike rejected, full sequence detected, no-speed context rejected).
- Expo offline dependency check passed using the bundled SDK map; Android export passed with 621 modules, a 1.6 MB bundle, and 44 KB alarm asset. Expo used the local SDK version map because the registry was unreachable.
- Loopback mock API: timeout advanced after the configured 3 seconds; decline advanced when another hospital match existed; off-duty match was excluded and restored afterward; hospital role filter returned no non-hospital matches.
- Direct localhost SSE probe confirmed the hospital role receives its duty-change event. `git diff --check` passed; the sample responder file was restored after the probe.
- Family-alert API verification: new SOS, rider status, and console events each return the same simulated-only record (`sent: false`, `destination: null`); a contact payload receives HTTP 400. Android export reran successfully with the family-alert UI (621 modules, 1.6 MB bundle, 44 KB alarm asset).
- Browser console: four-role selector showed only relevant events; duty toggle changed count and restored it; accepted alert progressed through all three responder states. `GET /api/sos/:id` showed accepted/enroute/arrived/resolved flags true.
- Physical handset verification remains pending for Expo permission prompts, live sensor stream, sound, dialer, queue restoration after process restart, and SMS composer. No real SMS/call occurred.

### Gate status and remaining boundary
- T2 demo flows are implemented and mock-verified. The family-alert UI is a simulation only; real family notification is unavailable under the project rule that outbound SMS/calls go only to whitelisted team numbers. Physical-device rehearsal is still pending.
- No real crash-sensor accuracy or response-time claim is made. Automatic escalation and metrics are in-memory demo behavior and reset when the server restarts.
