# RakshaLink mobile

Expo Go compatible rider app for the T1 home, SOS, and status flow. It uses React Native core components and `fetch`; it adds no custom native modules.

## Run

1. Start the API from `../server` with `npm start` (`DEMO_MODE=true`, `PROVIDER=mock`).
2. Copy `.env.example` to `.env.local`. On a physical phone, set `EXPO_PUBLIC_API_BASE_URL` to the laptop's reachable LAN address, for example `http://192.168.1.20:3000`. `localhost` is suitable for a simulator on the same computer.
3. Run `npm install` and `npx expo start`; open the QR code in Expo Go.

The app offers the two API presets, four SOS categories, a live status poll, and a manual Call 112 button that opens the dialer only after a tap. Demo dispatch is labelled. The responder locations are demo data; the attribution shown is © OpenStreetMap contributors. Drive Mode crash simulation is clearly marked as coming soon until its next build phase.

## Verification

Use `npx expo export --platform android` to check the app bundle. A physical-device workflow still needs the API LAN address and has not been claimed verified unless run on the device.
