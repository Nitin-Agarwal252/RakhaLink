# Safety and honesty

RakshaLink touches emergencies, so we hold ourselves to strict rules.

## What we promise
1. **No real emergency contact in demos.** Dispatch defaults to mock. Optional Twilio SMS is restricted to `DEMO_WHITELIST`. We never auto-dial 112, 100, or 108. The Call 112 button only opens the dialer when tapped.
2. **No false reassurance.** The rider is never told help is coming unless a responder accepted. If no one answers, the app says so and shows Call 112.
3. **Simulation is labelled.** Simulated dispatch and the demo responder network carry visible labels.
4. **No invented claims.** No made-up statistics, partnerships, response times, or accuracy numbers.
5. **Privacy by design.** Motion samples stay on the phone; only a short summary is sent if a crash SOS is submitted. Offline SOS drafts (category and location) are stored locally until retried or discarded. The family-alert slice is a local in-memory demo record only; contact payloads are rejected, no family contact is collected or stored, and no notification is sent.

## Known limitations
- Crash monitoring is an **unvalidated foreground prototype**. Unit tests cover three sample sequences; no real crash accuracy is claimed, and physical-device sensor behavior is unverified.
- Background sensing is not enabled. The prototype runs only while Drive Mode is open in the foreground.
- The screen Morse pattern may draw attention nearby; it does not reach a responder and does not use the phone torch.
- SMS opens a draft addressed only to an API-provided whitelisted team number. The user must tap Send. No whitelist is configured in this demo, so the SMS action is unavailable.
- Responder data comes from OpenStreetMap and may be incomplete. Real responder onboarding is future work.
- Family alert is simulated only and says “No contact was notified.” Real family notification remains unavailable because outbound destinations are limited to whitelisted team numbers and no family destination is approved.
- No real SMS was sent in the verified mock flows. Carrier rules can affect real SMS when a team later configures the Twilio provider.

## False alarms
Every simulated or sensor-triggered crash alert has a 20-second countdown with an alarm and a large cancel button. A production system would also call the rider first before alerting responders.
