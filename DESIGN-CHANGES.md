# Design and accessibility pass on the PWA (2026-09-26)

> Historical record of one design pass. Much of the UI has changed since (small device tiles instead of flip cards, bottom navigation, scenes, linking a box); the current state is in `DESIGN.md`.

This file summarises what changed in `frontend/` during the Impeccable run (`init` → `document` → `audit` → `harden` → `colorize` → `clarify` → `adapt` → `animate` → `optimize` → `polish`). It was committed on 2026-09-27 together with the dashboard redesign that followed it (commit d20d385).

## Outcome

- **Audit score before the fixes:** 14/20. There were 7 major (P1), 7 minor (P2) and 3 polish (P3) issues. Accessibility was the weakest area.
- **Checks after the fixes, in Edge (Playwright) at 320, 390, 1280 and 1920px, light and dark theme:**
  - 0 contrast failures across all visible text, including the login page.
  - No interactive element smaller than 44×44px.
  - No horizontal overflow, also at 200% text size.
  - Correct focus handling (modals, card flip, user menu).
  - A clean console.
  - `next build` passes.
- **Performance:** with 40 simulated devices, device-card re-renders during 16s of idle time went from **240 to 0**.

## New files

| File | What |
|---|---|
| `PRODUCT.md` | Product context: users, positioning, principles, accessibility requirements |
| `DESIGN.md` | Design system: tokens, named rules, components, do's and don'ts. Up to date with every change below. |
| `.impeccable/design.json` | Machine-readable sidecar to DESIGN.md (tonal ramps, shadows, motion, component snippets) |
| `.impeccable/config.json` | Impeccable design hook turned on. `config.local.json` is excluded via `.git/info/exclude`. |
| `frontend/lib/errors.js` | `describeError(what, err)` turns PocketBase errors into Dutch user-facing messages |
| `frontend/lib/useNow.js` | Clock hook for relative times, used as low in the component tree as possible |
| `frontend/components/RealtimeStatus.js` | The "Laatste update" line with its own clock |

## What changed, by step

### harden: robustness and accessibility
- **Device card structure.** The card is no longer a single `div role="button"` with the gear button nested inside it. The main action is a real `<button>` stretched over the whole card (`aria-pressed` for on/off), and the gear sits next to it. The face you can't see is `inert`, and focus follows the flip.
- **Offline.** An offline card now says "Offline" (or "Offline · laatst bekend") in text. It can't be toggled, and only its icon and readings fade, not its name. `toggleDevice` refuses offline devices.
- **Modals.** These now use the native `<dialog>` with `showModal()`, which gives focus trapping, the dialog role and Escape. Clicking the backdrop still closes it, and focus returns to what opened it. This also works under React StrictMode.
- **Toasts.** The toast container is always present as a live region. Error toasts use `role="alert"`, stay for 6s instead of 2s, and have a close button.
- **Semantics.** The dark-mode switch has a name. Room tabs sit in `<nav aria-label="Kamers">` with `aria-current`. Room inputs have labels, and Escape closes the user menu.
- **Edge cases.** Long names wrap. An empty room and "no house yet" each show a message. Loading errors show a retry button. The + button is hidden when there's no house (it used to crash on `house.id`).
- **Also fixed.** A hydration warning on `<html data-theme>` (`suppressHydrationWarning`, needed because of the no-flash theme script).

### colorize: contrast
- **Light-theme tokens use a darker step of the same hue.**

  | Token | Old | New | Contrast now |
  |---|---|---|---|
  | accent | `#0891b2` | `#0e7490` | 5.4:1 |
  | on | `#16a34a` | `#15803d` | 5.0:1 |
  | warning | `#d97706` | `#b45309` | 4.5:1 |
  | danger | `#dc2626` | `#b91c1c` | 5.3:1 |
  | text-secondary | `#6b7280` | `#5f6672` | — |
  | off | `#9ca3af` | `#6b7280` | — |

  Hover on the primary button now goes darker instead of lighter. The dark theme was already fine and only got a more visible switch track.
- **New tokens.** `--accent-ring` / `--accent-pulse` per theme replace the hard-coded `rgba(8,145,178,…)` for the focus halo and the change pulse.
- **Temperature readings.** These use `--temp-cold` / `--temp-hot` per theme, mixed in OKLab (`lib/temperature.js`). In dark mode 21°C went from **2.5:1 to 6.2:1**.

### clarify: copy
- **One term throughout:** "apparaat" instead of "device".
- **Login.** Visible labels, `autoComplete`, "Bezig met inloggen…" instead of "Authenticating...", and a specific message for a wrong email and password combination.
- **Errors.** No more raw English PocketBase messages. `describeError` says what failed and what to do. Agent errors on commands go to the console; the user sees "X reageerde niet. …".
- **Honest optimistic toasts.** "X wordt ingeschakeld" / "wordt op 21°C gezet" instead of "X aan", because the command hasn't been confirmed yet. Each error appears once, as a toast, not also in the banner.
- **Delete confirmations.** The room confirmation names the consequence ("Apparaten … komen onder "Overig"") and uses "Annuleren" / "Kamer verwijderen" instead of "Nee" / "Ja".
- **Other copy.** "Nog geen meetwaarden ontvangen", "Sensorgegevens", theme button "… inschakelen", a `<main>` landmark, and the house name as `<h2>`.
- **Fixed along the way.** `.btn-danger-text` had no `background` set, so a browser-gray block showed behind "Kamer verwijderen".

### adapt: phone, touch and text size
- **Card height.** Both card faces share one grid cell, so the card is as tall as its tallest face and grows with the text. The fixed 300px box used to overflow with large text. Cards in the same row are always equally tall.
- **Card width.** `min(13.75rem, 100%)` instead of a fixed 220px, so it grows with the system text size and never gets wider than the screen.
- **44px touch targets everywhere.** The thermostat stepper was 32px and the compact controls 34px. The switch gets a larger invisible hit area. Delete moved to a trash icon in the back's header so the back still fits.
- **Hover-only effects.** Hover lift and scaling only apply on devices that can hover (`@media (hover: hover)`), so nothing gets stuck after a tap.
- **Safe areas.** `viewport-fit=cover` plus safe-area insets for the header, the + button and toasts. Extra bottom space means the last card no longer disappears under the + button.
- **Header alignment.** The header shares the page's max-width steps (`--content-max`), so the brand and avatar line up with the content, and it may wrap at very large text.

### animate: motion
- **Faster return.** Flipping back takes 0.45s (out is 0.6s), because exits should be faster than entrances.
- **Lamp glow.** An "on" card's glow comes up in 0.4s, like a lamp warming up.
- **Entrances.** The menu and modals get a short entrance (fade plus minimal scale, 150–220ms).
- **Explicit transitions.** `transition: all` is replaced by explicit properties.
- **`prefers-reduced-motion`.** The flip becomes a crossfade, and the pulse ring fades in place instead of growing. Scaling and sliding are removed. Every state change stays visible.

### optimize: performance
- **Clock.** The 5s clock moved out of the page into `RealtimeStatus` and `SensorDetailModal`, via `useNow`.
- **Memoised cards.** `DeviceCard` is wrapped in `memo`, with stable handlers (the latest-ref pattern in `page.js`, `cardHandlers`) and a memoised `roomsInHouse`.
- **Heat bar.** It animates `clip-path` instead of `width`, so there's no layout work per frame and the `background-size` trick is no longer needed.

### polish: finishing
- **Icons.** SVG `PlusIcon` / `MinusIcon` replace the text characters "+" and "−" on the + button and the stepper.
- **`color-scheme`** per theme, so native select dropdowns and scrollbars follow dark mode.
- **Browser surfaces.** `accent-color` and `caret-color`, text selection in the accent color, and tabular numbers for readings.
- **DESIGN.md.** Updated with the final values (card width, compact = still 44px, motion rules, reduced motion).

## How it was verified

- **Browser runs.** Edge driven by Playwright against `next dev` on port 3001, logged in as the test user. Your Docker frontend on :3000 was left alone.
- **Nothing was changed in PocketBase.**
  - *Offline and long-name cases:* the device list was rewritten in the browser only.
  - *Toggle test:* the command request was intercepted and answered with a fake response, so no lamp was switched.
  - *Delete room:* only the confirmation was opened, then Annuleren.
- **Not tested:**
  - long-press on a real phone (only emulated taps)
  - a real screen reader (roles, names and live regions were checked in the DOM)
  - Safari/iOS
  - the empty state and the retry button against real conditions
  - the "Sandhovius is nu niet bereikbaar" message for a real network failure

## Open points and decisions for you

Resolved on 2026-09-28:

1. **"No house" copy.** It was not true: a box registers its house without a `user`, so it never appears for a customer by itself. The text now says the house appears once the box *is linked to your account*, which will be true with the claim flow (CLAUDE.md, next steps).
2. **Delete device.** It only deletes the PocketBase record; the agent leaves the HA helper alone. The copy ("verdwijnt uit de app; je kunt het later opnieuw toevoegen") is correct as is. The HA helper stays behind as an orphan; clean up in the agent when that matters.
3. **Desktop grid.** Obsolete: the bento uses `auto-fill` with `1fr` columns, so tiles fill the width from the left.
4. **`frontend/CLAUDE.md`.** Committed.
5. **Docker image.** The frontend container is rebuilt after every frontend change.
6. **Leftover file.** `frontend/app/globals.css.bak` deleted.

## Suggested next steps

- `/impeccable critique frontend/app`: a UX review now that the technical basis is solid.
- `/impeccable onboard`: the first-run flow (no house yet, no devices yet) now only has a plain text line. *Update 2026-10-06: an account without a house now gets "Box toevoegen" and the linking sheet (claim flow); a house without devices has the first-run panel. See DESIGN.md.*
