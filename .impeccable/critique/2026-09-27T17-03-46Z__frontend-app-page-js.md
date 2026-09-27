---
target: dashboard (frontend/app/page.js)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Projects\\Sandhovius\\sandhovius\\frontend\\app\\page.js"
target_fingerprint: "sha256:6243877e04a6773c414eff42c83e50182a6f1a7b8f622a70b90dfdac6b6a6e7b"
target_path: "C:\\Projects\\Sandhovius\\sandhovius\\frontend\\app\\page.js"
timestamp: 2026-09-27T17-03-46Z
slug: frontend-app-page-js
closed: true
---
Method: dual-agent (A: design review · B: detector). Browser inspection unavailable in both (Chrome extension not connected, Playwright Chrome not installed); source-only review, key claims spot-checked.

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | "Laatste update" = last event, not connection; disconnect only console.warn (page.js:26-28) |
| 2 | Match System / Real World | 3 | Good Dutch; "Beweging: Ja" amber, abstract heat bar, tap = heating on/off |
| 3 | User Control and Freedom | 3 | Toggles reversible; each ± fires a command |
| 4 | Consistency and Standards | 2 | Tap means toggle/hvac/details per type; two dark-mode controls; green settings switch |
| 5 | Error Prevention | 2 | Stray tap turns heating off; add-device yields "Offline" card |
| 6 | Recognition Rather Than Recall | 2 | Long-press undiscoverable; 16px gear; rooms behind "Huis wijzigen" |
| 7 | Flexibility and Efficiency | 2 | No house overview / "alles uit" |
| 8 | Aesthetic and Minimalist Design | 3 | Calm; 300px cards mostly empty; toast per tap |
| 9 | Error Recovery | 3 | errors.js good; session-expired lacks login action |
| 10 | Help and Documentation | 1 | No first-run, no long-press hint |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict
Calm and competent but category-interchangeable (icon-circle tile). North Star not visible: light on/off is the smallest, grayest text (violates Readings Are Loudest). Character lives only in details (glow, honest "wordt …" toasts, household error copy). Detector: 0 findings (exit 0) on frontend/app + frontend/components. No overlays (browser unavailable).

## Priority Issues
- [P1] Connection status not honest — track link state + gateway heartbeat; "Verbonden met je huis" / "Verbinding kwijt sinds …"; mark cards "laatst bekend". (/impeccable harden)
- [P1] Thermostat backwards — climate in TOGGLEABLE_TYPES (DeviceCard.js:10) so tap turns heating off; target temp hidden on back; each ± a command. Stepper on front, 48px, debounce ~800ms. (/impeccable shape, layout)
- [P1] Glanceability lost to geometry — min(13.75rem) column + min-height 300px (devices.css:110,152) → 1 column, ~2 cards/screen on phone; no house summary. Two compact columns + summary line. (/impeccable layout)
- [P2] On/off & offline legibility — amber tint when off; offline opacity .45 + grayscale (devices.css:80-81) drops readings <4.5:1. "Aan"/"Uit" at reading size, neutral icon when off, fade icon only. (/impeccable typeset + colorize)
- [P2] Add-device follows system model — online:false (page.js:365) → "Offline"; defaults "Geen kamer". Default selected room, "Wacht op koppelen", type tiles. (/impeccable onboard)

## Persona Red Flags
- Jordan: long-press unknown, taps thermostat → heating off, "Offline" after add, "Huis wijzigen" ambiguous.
- Sam: aria-live polite wrapping role=alert (ToastContainer.js:15,20) double announce; heat bar no text alt; menu items ~40px, no menu semantics/focus style; 200% zoom → 1 card/screen.
- Casey: room tabs top, hidden scrollbar; toasts top-right over header on every tap; 500ms long-press vs scroll.
- Riet (74, low vision): off vs on unreadable; last-known temps fade; 0.78rem status; amber "Beweging: Ja".

## Minor Observations
Two dark-mode controls (settings switch green); toast per successful toggle; unlabeled heat bar; no battery threshold; no loading skeleton, "nog niet verbonden"; session-expired no login action (errors.js:18); possible reconcile flicker at 1.5s.

## Questions to Consider
- Why is on/off the quietest text on a light card? What if the card were the state?
- Should the thermostat card be a thermostat?
- Can one screen answer "is everything off?" at bedtime?
- When the box loses power, what does Riet see, where, in which words?
