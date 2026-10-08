# Safety and honesty

RakshaLink touches emergencies, so we hold ourselves to strict rules.

## What we promise
1. **No real emergency contact in demos.** Demo mode sends alerts only to team-owned test numbers. We never auto-dial 112, 100, or 108. The Call 112 button only opens the dialer when tapped.
2. **No false reassurance.** The rider is never told help is coming unless a responder accepted. If no one answers, the app says so and shows Call 112.
3. **Simulation is labelled.** Simulated dispatch and the demo responder network carry visible labels.
4. **No invented claims.** No made-up statistics, partnerships, response times, or accuracy numbers.
5. **Privacy by design.** Motion data stays on the phone. We store category, location, and time. Family contacts, if used, are chosen by the user and are not stored on the server.

## Known limitations
- Crash detection is a **prototype heuristic**, tested on simulated traces only, not validated on real crashes.
- A phone in a pocket produces noisier data than a mounted phone. Two-wheeler riders are the hardest case.
- Background sensing is limited on mobile operating systems. The prototype runs as a foreground Drive Mode.
- Morse flashing alerts people nearby; it does not reach a responder.
- SMS fallback needs the user to tap Send. Phones do not allow silent background SMS.
- Responder data comes from OpenStreetMap and may be incomplete. Real responder onboarding is future work.
- Carrier rules (for example SMS registration in India) can delay real SMS delivery.

## False alarms
Every auto-alert has a 20-second countdown with an alarm and a large cancel button. A production system would also call the rider first before alerting responders.
