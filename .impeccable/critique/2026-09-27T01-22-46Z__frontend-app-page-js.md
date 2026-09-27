---
target: critique (main app surface)
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Projects\\Sandhovius\\sandhovius\\frontend\\app\\page.js"
target_fingerprint: "sha256:6243877e04a6773c414eff42c83e50182a6f1a7b8f622a70b90dfdac6b6a6e7b"
target_path: "C:\\Projects\\Sandhovius\\sandhovius\\frontend\\app\\page.js"
timestamp: 2026-09-27T01-22-46Z
slug: frontend-app-page-js
---
Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | "Laatste update: zojuist" reflects the subscription, not the data. A sensor shows "Online" while its last reading is 7 hours old. The toast "wordt uitgeschakeld" never resolves. |
| 2 | Match System / Real World | 3 | Good Dutch household copy. "Huis wijzigen" reads as "switch house", and the heat bar is full when current = target, which reads as "heating flat out". |
| 3 | User Control and Freedom | 2 | No undo after a toggle or a device delete. Flipping a card back silently discards unsaved edits. |
| 4 | Consistency and Standards | 2 | Three save patterns (Opslaan on the card back, ✓ inline for rooms, a separate Opslaan for the house name). The theme toggle exists twice. Tapping a card toggles everything except sensors. |
| 5 | Error Prevention | 2 | The whole thermostat card toggles the heating off, so one stray tap means a cold house. Add-device ignores the current room. |
| 6 | Recognition Rather Than Recall | 3 | The target temperature and room rename are hidden behind a gear or long-press, or an unstyled button. |
| 7 | Flexibility and Efficiency | 2 | Long-press is the only accelerator. No "alles uit", no house overview, no in-place target adjustment. |
| 8 | Aesthetic and Minimalist Design | 2 | Cards 220×300+ with lots of empty space: two devices per phone screen, and the desktop grid is off-center. |
| 9 | Error Recovery | 3 | `describeError` gives Dutch messages with a next step. |
| 10 | Help and Documentation | 1 | No help. First run is one line of text. |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment:** category-interchangeable. A centered card with a tinted icon circle, the name and a status word, under a navy app bar with a cyan accent and a login card on a gradient, is the Google Home / SmartThings / generic-SaaS default. The product's real proposition (local-first, private, a box in the house that keeps working without internet) is nowhere visible. "The Light Switch by the Door" (DESIGN.md) is not yet visible in the composition. The lamp icon is identical on and off.

**Deterministic scan:** the CLI detector found 0 findings (`frontend/app`, `frontend/components`). The browser overlay (5 views) found 3 anti-patterns:
- `ai-color-palette` on the login gradient (login.css:7): **true positive**, and it matches the design review's "generic SaaS login". DESIGN.md already marks it provisional.
- `dark-glow` + `gpt-thin-border-wide-shadow` on `.card-on` (devices.css:60–64): the same rule counted twice. True by the rule's definition, but it is the deliberately sanctioned inward "on" glow (DESIGN.md, Lamp Shade rule). It's a design decision, not a defect.
- `ai-color-palette` on `.heat-bar-fill` (devices.css:322): **false positive**. It's a 6px data scale, the one gradient DESIGN.md explicitly allows.

The static CLI misses the tokenized (`var()`) and page-level patterns that the overlay does catch.

**Visual overlays:** injection worked in all 5 views, but in a headless browser. No overlay is visible to the user.

## Overall Impression
Technically solid after the hardening pass: honest copy, good states, both themes designed. The experience is still a generic card dashboard, though, not "the switch by the door". The biggest opportunity: make the primary action of every card the everyday action (temperature, not on/off, for a thermostat), and make the box status and "werkt ook zonder internet" visible as reassurance.

## What's Working
- Honest household copy: "X wordt ingeschakeld" instead of fake success, and "X reageerde niet. Controleer of het apparaat stroom heeft…". This serves "Trust through honesty".
- Inline flip settings with a delete confirmation that keeps the card height. The user never leaves the room, and delete takes two deliberate steps.
- State never relies on colour alone (Ingeschakeld/Uitgeschakeld/Offline · laatst bekend). The inward glow is calm, and both themes are genuinely composed.

## Priority Issues
1. **[P1] The thermostat's main tap does the wrong thing.** The card toggles the heating on/off (DeviceCard.js:10, :107). The everyday action, warmer or cooler, is hidden behind the gear or a 500ms long-press, and a stray tap gives a cold house. Fix: a large −/+ stepper around "Doel" on the card front, card body not a toggle for climate, on/off moved to the back. → /impeccable shape, then /impeccable layout
2. **[P1] Status signals contradict each other.** "Laatste update: zojuist" (set on subscribe) versus a sensor that is "Online" with its last reading 7 hours ago. Fix: a per-card "Gemeten 7 uur geleden" in amber past a threshold. Replace the global line with box and connection status in household terms, including "internet weg, thuis werkt alles". → /impeccable clarify + /impeccable harden
3. **[P2] Card composition wastes the phone screen.** A 13.75rem card, 300px tall, centered: two devices per screen, and the state word is small ("Readings Are Loudest" is broken). The desktop grid starts at x≈182 while the content starts at x≈114. Fix: on phones, full-width row cards or a compact 2-column grid, the state or reading as the largest text, the grid aligned with the content edge. → /impeccable layout / /impeccable distill
4. **[P2] Add-device breaks the mental model.** It asks for a name and type, pairs nothing, ignores the current room tab (AddDeviceModal.js:17), and yields a permanently offline card (page.js:365) with no explanation. Fix: preselect the current room and say what happens next, and longer term lead with pairing. → /impeccable onboard + /impeccable clarify
5. **[P2] Management IA is fragmented.** "Huis wijzigen" hides room management, the rename affordance is invisible, and Instellingen contains one toggle that duplicates the moon icon. Fix: "Huis en kamers", a pencil icon on room rows, one theme control, one save pattern. → /impeccable distill

## Persona Red Flags
- **Casey (one-handed):**
  - The toast lands top-right, over the avatar.
  - The user menu is at the top.
  - Temperature takes gear → flip → stepper, when it should be one tap.
  - A palm tap on the thermostat turns the heating off.
- **Jordan (first-timer):**
  - "Huis wijzigen" is ambiguous.
  - Gear and long-press are undiscoverable, with no hint that cards flip.
  - A new device is a permanently offline card with no guidance.
  - The empty house is one grey sentence.
- **Sam (keyboard/screen reader):**
  - The room-rename button has no visual "edit" cue.
  - Confirmations vanish after 2s with no persistent state.
  - The heat bar has no text equivalent.
- **Riet (74, reduced sight, owner):**
  - "Laatste update" is tiny.
  - The current temperature is shown in a muted mauve that reads as disabled.
  - The thermostat icon looks like a clock.
  - The lamp icon doesn't change when off.
  - Two cards per screen means a lot of scrolling.

## Minor Observations
- The heat bar at 100% when current = target is semantically inverted.
- There is no undo after deleting a device.
- The desktop FAB sits far from a left-clustered grid.
- The login has no password recovery or brand voice.
- There is no low-battery emphasis on the front of a sensor card.
- The sensor name "Temperatuur" doubles with the label "Temperatuur".

## Questions to Consider
- What if the home screen opened on "Thuis": a house summary (lights on, temperature, box status) before rooms?
- Should a thermostat card ever toggle, or is temperature its only real verb?
- What if "werkt ook zonder internet" were a visible, reassuring state instead of an invisible property?
- Does a household app need a card flip at all, or is a bottom sheet more discoverable for Riet and Jordan?
- What would the lamp card look like if it looked like a lamp?
