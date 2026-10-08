# Design language

Calm under stress. Big, clear, friendly. Usable by anyone, including people who are not comfortable with technology.

## Colour: each emergency owns one colour everywhere
| Role | Colour |
|---|---|
| Fuel | forest green `#274706` |
| Breakdown | teal `#1B4D4F` |
| Accident | navy `#2B3A67` |
| Medical SOS | maroon `#5B1F2D` |
| Call 112 | red `#BA1A1A` |
| Voice / AI | purple `#3D2A5C` |
| Accent | amber `#D9B25C`, cream `#F5F3EA`, background `#EFEBDD`, surface `#FBF9F2` |

## Type
Noto Serif (600) for the name and big titles, DM Sans for everything else. Full token list: [DESIGN_TOKENS.md](DESIGN_TOKENS.md).

## Rules
- Tap targets at least 56 px. Icon plus label, always.
- One main action per screen. Plain short words.
- Colour is never the only signal.
- The Call 112 button is visible on every screen and only opens the dialer on tap.

## Logo
A shield (Raksha, protection) inside a gold mandala, with an orbit linking two nodes (Link: rider and responder) and a spark of help. Files in `assets/`.

## Responder Console (desktop)
Three columns (alert queue, map, alert detail), a deep-green top bar with the organisation, role and On duty toggle, and one dominant element per state: the active alert and its Accept button. States: empty, incoming (pulsing, countdown), accepted (four-step progress), resolved, off duty. The workflow is inspired by driver apps; the visual identity is RakshaLink's own.
