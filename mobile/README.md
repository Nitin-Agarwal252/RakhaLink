# RakshaLink mobile

Expo Go compatible rider app for home, SOS/status, offline support, and crash response. Expo Audio, Expo Sensors, Expo Location, and AsyncStorage are included in Expo Go for this SDK. Monitoring is foreground-only.

## Run

1. Start the API from `../server` with `npm start` (`DEMO_MODE=true`, `PROVIDER=mock`).
2. Copy `.env.example` to `.env.local`. On a physical phone, set `EXPO_PUBLIC_API_BASE_URL` to the laptop's reachable LAN address, for example `http://192.168.1.20:3000`. `localhost` is suitable for a simulator on the same computer.
3. Run `npm install` and `npx expo start`; open the QR code in Expo Go.

The app offers the two API presets, four SOS categories, a live status poll, and a manual Call 112 button that opens the dialer only after a tap. Drive Mode supports a 20-second simulated countdown and a foreground sensor prototype that requires speed context, impact, and a sudden stop before starting the same cancellable countdown. Replayed sample traces show that a single spike is ignored. This prototype makes no accuracy claim and is not validated for real driving.

The supplied RakshaLink logo appears in the home, status, offline, and crash-countdown headers. The crash countdown is presented as a dedicated visual screen; its timer, cancel action, and mock Accident SOS behavior remain unchanged. No immediate-send action is shown.

The status screen has an optional **Share request update** action. It opens the operating system share sheet with the request category and current responder-reported state; it contains no location or responder token. The user must choose a destination before anything is shared. It does not contact responders or family on its own.

If SOS submission fails because the network is unreachable, the request is stored in local AsyncStorage. The offline screen shows a repeating, screen-only Morse SOS pattern for a nearby person to see; it does not contact responders. Retry sends the oldest queued request to the demo API. If the API provides whitelisted team numbers, the user selects a recipient and can open a prefilled SMS draft for the oldest queued request. The draft labels sample/demo locations and says it has not been sent. The user reviews it and sends it manually. The button is disabled when the server has no approved destinations. Call 112 remains manual.

## Verification

Use `npx expo export --platform android` to check the app bundle and `node --test crashDetector.test.mjs` to validate trace rules. A physical-device workflow still needs the API LAN address, location permission, actual sensor exercise, audio and dialer checks; those have not been verified on a handset.
