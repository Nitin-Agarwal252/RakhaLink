# Demo guide

## What you will see (about four minutes)
1. Introduce the problem with one cited MoRTH statistic.
2. **Medical SOS** on the phone: the alert appears on the Responder Console with the mock dispatch label. A team SMS is not configured in this environment.
3. **Accept** on the console, then mark **On the way**, **Arrived**, and **Resolved**: the rider timeline updates from server status.
4. **Simulate crash:** 20-second alarm countdown, then a demo accident SOS; show hospital and police matches.
5. **Ignore an alert:** timeout advances to the next on-duty responder. Alternatively, use **Can't respond** to advance immediately.
6. **Offline ladder:** show the persisted queue and screen Morse signal, then restore signal and retry manually. The SMS draft is available only if a whitelisted team destination is configured; no destination is configured now.
7. Show the rider status and console `SIMULATED FAMILY ALERT` record; both state that no contact was notified.

## What is real and what is simulated
| Part | Status |
|---|---|
| Responder locations | Real (OpenStreetMap) |
| Responder phone numbers | Not configured in this environment |
| Responder network on the console | Sample/demo OSM rows and mock dispatch |
| SMS and voice | Mock only; Twilio SMS requires configured whitelisted team numbers. Voice is not implemented. |
| Crash detection | Foreground sensor prototype and replayed sample traces; not validated on a handset or real crashes |
| Family alert | In-app demo record only; no destination or real notification |
| Location in the demo | Sample presets for manual requests; sensor prototype uses foreground device GPS when enabled |

_Screenshots and the video link are added at submission._
