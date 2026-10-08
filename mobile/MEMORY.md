# Mobile build memory

## Gate G1 — rider home and SOS/status slice

- Added an Expo Go compatible React Native app using React Native core APIs and Expo Audio, Location, Sensors, plus AsyncStorage.
- Home renders four category actions with the requested category colors, preset selector for GNIT and NH-19 Durgapur, sample/demo labels, OSM attribution, Drive Mode and a manual Call 112 dialer button.
- SOS sends `POST /api/sos` with `category`, `trigger: manual`, coordinates, and `preset_id`. The status screen polls `GET /api/sos/:id` every two seconds and displays only server-reported status flags. It only says a responder accepted after the API reports acceptance. Unanswered requests show “No responder answered. Call 112.”
- Demo dispatch is visibly labelled `SIMULATED DISPATCH`; no automated calls or SMS were added.
- Configure `EXPO_PUBLIC_API_BASE_URL` via `.env.local`; use the laptop's LAN address for a physical Expo Go device.

### Verification

- `npm ci` — passed from `package-lock.json` (464 packages installed; npm reported 22 dependency advisories: 7 moderate, 15 high).
- `EXPO_HOME=.expo-home`, `TEMP=.tmp`, `TMP=.tmp`, `expo export --platform android` — passed; Android JavaScript bundle generated (1.4 MB).
- `expo install --check` — passed using Expo's local bundled dependency map. It reported the versions endpoint was unreachable, so the check was offline.
- Physical-device rendering, dialer launch, and live phone-to-laptop API flow are not verified in this environment.

### Gate status

Mobile G1 is complete. T1 mock integration is complete; a physical end-to-end run remains unverified.

## Overall T1 gate — 8 Oct 2026
- T1 mobile flow now includes Drive Mode crash simulation, a 20-second audible countdown, cancel, and automatic demo Accident SOS. Sensor-based crash detection is not implemented.
- Added desktop responder console and tokenized accept page integration; mock browser/API checks confirmed accepted and all-declined/unanswered paths.
- Verification: Android Expo bundle passed after audio dependency/assets were added; server triage tests passed (5/5). Physical-device rendering/audio, dialer launch, and phone-to-laptop rehearsal remain unverified.
- T1 code is complete for mock dispatch. Automatic escalation remains Tier 2; no real SMS or call was sent.

## T2 implementation — 8 Oct 2026
- Offline queue persists SOS payloads with AsyncStorage. The fallback screen shows a repeating screen Morse pattern, retry, and a prefilled SMS draft only when the API provides a DEMO_MODE whitelisted team destination. No whitelist is configured, so SMS draft action is disabled here. The app never sends automatically.
- Added an opt-in, foreground-only sensor prototype using location speed and accelerometer input; all three conditions (speed context, impact, sudden stop) must match before the 20-second countdown starts. No background monitoring or accuracy claim.
- Replayed traces verify complete sequence detection, isolated spike rejection, and missing speed-context rejection (3 tests passed). Expo Android bundle includes the new sensor/location/storage modules.
- Physical device permission prompts, sensor readings, alarm, dialer, offline persistence, and SMS composer remain unverified on a handset.
- Rider status shows the API-provided simulated family-alert state and states no contact was notified; no family destination is collected or messaged.
- Rider status labels an optional responder-provided `enroute` ETA as an estimate; no computed ETA is shown.
