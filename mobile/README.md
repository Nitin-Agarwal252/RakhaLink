# RakshaLink mobile

Expo Go compatible rider app for home, SOS/status, offline support, and crash response. Expo Audio, Expo Sensors, Expo Location, and AsyncStorage are included in Expo Go for this SDK. Monitoring is foreground-only.

## Run

1. Start the API from `../server` with `npm start` (`DEMO_MODE=true`, `PROVIDER=mock`).
2. Copy `.env.example` to `.env.local`. On a physical phone, set `EXPO_PUBLIC_API_BASE_URL` to the laptop's reachable LAN address, for example `http://192.168.1.20:3000`. `localhost` is suitable for a simulator on the same computer.
3. Run `npm install` and `npx expo start`; open the QR code in Expo Go.

The app offers the two API presets, four SOS categories, a live status poll, and a manual Call 112 button that opens the dialer only after a tap. Drive Mode supports a 20-second simulated countdown and a foreground sensor prototype that requires speed context, impact, and a sudden stop before starting the same cancellable countdown. Replayed sample traces show that a single spike is ignored. This prototype makes no accuracy claim and is not validated for real driving.

If SOS submission fails because the network is unreachable, the request is stored in local AsyncStorage. The offline screen shows a repeating screen-based Morse SOS pattern and retries the queued request. If the demo API provides a whitelisted team number, the app can open a prefilled SMS draft to that number; it never sends the SMS. No destination is configured in the current demo environment, so that action is unavailable. The Morse screen does not contact responders. Call 112 remains manual.

## Verification

Use `npx expo export --platform android` to check the app bundle and `node --test crashDetector.test.mjs` to validate trace rules. A physical-device workflow still needs the API LAN address, location permission, actual sensor exercise, audio and dialer checks; those have not been verified on a handset.
