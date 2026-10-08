# Mobile build memory

## Gate G1 — rider home and SOS/status slice

- Added an Expo Go compatible React Native app using only core React Native APIs and Expo's existing status bar package.
- Home renders four category actions with the requested category colors, preset selector for GNIT and NH-19 Durgapur, sample/demo labels, OSM attribution, Drive Mode coming-soon label, and a manual Call 112 dialer button.
- SOS sends `POST /api/sos` with `category`, `trigger: manual`, coordinates, and `preset_id`. The status screen polls `GET /api/sos/:id` every two seconds and displays only server-reported status flags. It only says a responder accepted after the API reports acceptance. Unanswered requests show “No responder answered. Call 112.”
- Demo dispatch is visibly labelled `SIMULATED DISPATCH`; no automated calls or SMS were added.
- Configure `EXPO_PUBLIC_API_BASE_URL` via `.env.local`; use the laptop's LAN address for a physical Expo Go device.

### Verification

- `npm ci` — passed from `package-lock.json` (464 packages installed; npm reported 22 dependency advisories: 7 moderate, 15 high).
- `EXPO_HOME=.expo-home`, `TEMP=.tmp`, `TMP=.tmp`, `expo export --platform android` — passed; Android JavaScript bundle generated (1.4 MB).
- `expo install --check` — passed using Expo's local bundled dependency map. It reported the versions endpoint was unreachable, so the check was offline.
- Physical-device rendering, dialer launch, and live phone-to-laptop API flow are not verified in this environment.

### Gate status

Mobile G1 home and bundle check pass. Overall T1/G2 remains pending the desktop console and a physical end-to-end run. Drive Mode simulation/countdown remains for the next mobile slice.
