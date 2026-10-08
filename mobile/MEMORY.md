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
- T3 share update: the rider status screen can open the platform share sheet with only the request category and current responder-reported state. It excludes coordinates and responder tokens; nothing is shared until the user selects a destination. This does not send an automatic family or responder notification.
- Verification for T3 share update: `npx expo export --platform android --output-dir .tmp\\t3-share-final` passed (622 modules; 1.6 MB Hermes bundle). Expo's default temp path was blocked by the sandbox, so the successful rerun used a workspace-local temp directory. Phone share-sheet interaction still needs an Android handset.
- Offline fallback polish: queue cards now show preset names instead of internal IDs. Morse copy explains that the repeating optical pattern is screen-only and must be shown to someone nearby. The SMS draft recipient is selectable from the approved team list (masked to its last four digits); the draft is for the oldest queued item, uses readable category/preset labels, marks sample coordinates as SAMPLE · DEMO, says it was not sent, and says to call 112 for urgent help. The three-member team whitelist is staged in the ignored root `.env`; the active API needs a restart before the picker appears.
- Verification: Android Expo export passed (622 modules, 1.6 MB Hermes bundle). The live responder console remained open in the browser; no API code changed and no API restart was performed. SMS composer and Morse visibility need a handset check.
- Team recipient selection added for all three approved numbers, displaying names with masked last-four digits. Local API config validation passed with three whitelist entries, DEMO_MODE enabled, and mock provider; Android export passed again. Recipient picker appearance depends on the active API being restarted to reload `.env`; handset compose-flow remains unverified.
