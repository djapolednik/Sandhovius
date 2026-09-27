---
name: Sandhovius
description: Calm, glanceable control for a home that runs itself locally.
colors:
  canal-cyan: "#0e7490"
  canal-cyan-hover: "#155e75"
  canal-cyan-contrast: "#ffffff"
  canal-cyan-dark: "#22d3ee"
  canal-cyan-hover-dark: "#67e8f9"
  canal-cyan-contrast-dark: "#0f1115"
  lamp-on-green: "#15803d"
  lamp-on-green-dark: "#22c55e"
  lamp-on-surface: "#ecf6ef"
  lamp-on-surface-dark: "#1a2b22"
  lamp-on-text: "#166534"
  lamp-on-text-dark: "#4ade80"
  resting-gray: "#6b7280"
  resting-gray-dark: "#6b7280"
  amber-notice: "#b45309"
  amber-notice-bg: "#fef3c7"
  amber-notice-dark: "#f59e0b"
  amber-notice-bg-dark: "#451a03"
  alarm-red: "#b91c1c"
  alarm-red-contrast: "#ffffff"
  alarm-red-bg: "#fee2e2"
  alarm-red-dark: "#f87171"
  alarm-red-contrast-dark: "#1a0505"
  alarm-red-bg-dark: "#450a0a"
  hallway-white: "#f5f5f7"
  card-white: "#ffffff"
  hairline-gray: "#e5e7eb"
  ink: "#111111"
  quiet-slate: "#5f6672"
  night-floor: "#0f1115"
  night-card: "#1c1f26"
  night-hairline: "#2a2e37"
  night-ink: "#f3f4f6"
  night-quiet: "#9ca3af"
  night-navy-bar: "#0f172a"
  night-navy-bar-fg: "#f1f5f9"
  night-navy-bar-fg-secondary: "#94a3b8"
  icon-light-bg: "#fef3c7"
  icon-light-fg: "#b45309"
  icon-switch-bg: "#dbeafe"
  icon-switch-fg: "#2563eb"
  icon-sensor-bg: "#ccfbf1"
  icon-sensor-fg: "#0d9488"
  icon-climate-bg: "#ffe4e6"
  icon-climate-fg: "#e11d48"
  icon-light-bg-dark: "#45330a"
  icon-light-fg-dark: "#fbbf24"
  icon-switch-bg-dark: "#1e3a5f"
  icon-switch-fg-dark: "#60a5fa"
  icon-sensor-bg-dark: "#0f3d38"
  icon-sensor-fg-dark: "#2dd4bf"
  icon-climate-bg-dark: "#4c1123"
  icon-climate-fg-dark: "#fb7185"
  temp-cold: "#2563eb"
  temp-hot: "#dc2626"
  temp-cold-dark: "#60a5fa"
  temp-hot-dark: "#f87171"
  toast-ink-bg: "#1f2430"
  toast-error-bg: "#b91c1c"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.8rem"
    fontWeight: 800
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    letterSpacing: "-0.015em"
  state:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 700
  reading:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 600
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 500
  meta:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    letterSpacing: "0.04em"
rounded:
  xs: "6px"
  sm: "8px"
  toast: "10px"
  card: "12px"
  modal: "16px"
  sheet: "20px"
  pill: "999px"
spacing:
  xs: "0.4rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.canal-cyan}"
    textColor: "{colors.canal-cyan-contrast}"
    rounded: "{rounded.sm}"
    padding: "0.75rem 1rem"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.canal-cyan-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.alarm-red}"
    textColor: "{colors.alarm-red-contrast}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
    height: "44px"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0.6rem 0.75rem"
  device-card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "0.85rem 0.9rem"
    minWidth: "10rem"
    height: "auto"
  device-card-on:
    backgroundColor: "{colors.lamp-on-surface}"
    textColor: "{colors.lamp-on-text}"
  room-tab:
    textColor: "{colors.quiet-slate}"
    typography: "{typography.body}"
    height: "44px"
  room-tab-active:
    textColor: "{colors.canal-cyan}"
  switch:
    backgroundColor: "{colors.resting-gray}"
    rounded: "{rounded.pill}"
    width: "44px"
    height: "24px"
  switch-on:
    backgroundColor: "{colors.lamp-on-green}"
  fab:
    backgroundColor: "{colors.canal-cyan}"
    textColor: "{colors.canal-cyan-contrast}"
    rounded: "{rounded.pill}"
    size: "48px"
  modal:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.modal}"
    padding: "1.25rem"
    width: "400px"
  sheet:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.sheet}"
    padding: "1.25rem"
    width: "100%"
---

# Design System: Sandhovius

## Overview

**Creative North Star: "The Light Switch by the Door"**

Every control in Sandhovius should be as obvious as the switch you reach for when you walk into a room. You know where it is, what it does, and whether it worked, and none of that takes a moment's thought. The app is a set of familiar household controls, arranged by room, that disappear into the routine of the house. The user should never feel they are "using a smart-home system". They are turning on the kitchen light.

The mood is soft and reassuring. Surfaces are softly layered and sit calmly on a pale hallway ground (or a deep night floor in dark mode). Each device is a single, generously sized card with one clear state and one obvious action. Motion confirms and never performs: cards compress slightly under the thumb, an "on" card fills with a soft green light from the inside, and a card that just changed pulses once in Canal Cyan. Settings sit behind the gear (or a long-press) in a sheet and never crowd the front of a card.

**The card is the state.** A light card that is on is unmistakably on from across the room: the whole surface turns Lamp-On green, the bulb icon lights up in its amber tint, and "Aan" is the largest word on the card, next to a small switch. Off is neutral: gray icon, "Uit", switch to the left.

This is explicitly **not** a Home Assistant dashboard, which is dense, entity-centric and built for power users. It is not a generic SaaS admin (sidebars, data tables, KPI tiles), and it is not a techy "smart home" console (neon glows, glassmorphism, sci-fi dark panels).

**Key Characteristics:**
- One card per device, as tall as its content: two compact columns on a phone, a thermostat spans two
- State is readable at a glance: a green card with "Aan" for on, a neutral card with "Uit" for off, text for offline, amber for attention
- Connection is always honest: "Verbonden met je huis" when everything works, a plain-language notice when it doesn't
- Softly layered depth: surfaces rest on gentle ambient shadow and lift further under interaction
- Light and dark themes are equal citizens and are both required
- System font stack; hierarchy comes from weight and size, not from typeface contrast
- Generous touch targets (44px minimum, 48px for primary actions)

## Colors

A restrained, cool-neutral palette with one clear voice (Canal Cyan) and a small, fixed vocabulary of state colors.

### Primary
- **Canal Cyan** (light `canal-cyan`, dark `canal-cyan-dark`): the single interactive voice. It is used for primary buttons, the active room tab, focus rings, input focus, the FAB and the "just changed" pulse. The name evokes clear Dutch city water: cool and local. In the light theme it is a deep cyan (white text 5.4:1) and hover darkens further; in dark mode it brightens and flips its contrast color to the night floor. Soft rings and the change pulse use per-theme `--accent-ring` / `--accent-pulse` tokens, never a hard-coded rgba.

### State colors
- **Lamp-On Green** (`lamp-on-green` / `-dark`): means "this device is on". It is used for the card's inner glow and border, the switch track and the house-summary chips. The on-card surface is **Lamp-On Surface** (`lamp-on-surface`), and "Aan" on it is **Lamp-On Text** (`lamp-on-text`, 6.4:1 light / 8.5:1 dark). It is never used for success messages, app settings or decoration: the dark-mode switch in Instellingen uses Canal Cyan, because a theme is not device state.
- **Resting Gray** (`resting-gray` / `-dark`): the off track of a switch.
- **Amber Notice** (`amber-notice` with `amber-notice-bg`): something needs attention but is not broken, for example sensor readings out of range or recoverable errors in banners.
- **Alarm Red** (`alarm-red` with `alarm-red-bg`): destructive actions and danger zones only.

### Device-type tints
Each device type owns a soft tinted circle behind its icon, with a paler background and a saturated foreground, redefined for dark mode: **light** (amber), **switch** (blue), **sensor** (teal) and **climate** (rose). The tints identify *kind*. The one exception is lights and switches: they show their tint **only when on** (a lit bulb), and a neutral gray circle when off or offline, so the icon never contradicts the state. **Temperature readings** use a per-theme cold→hot scale (`temp-cold`/`temp-hot`, mixed in OKLab by `lib/temperature.js`) so every point on the scale stays ≥4.5:1 as text on its card. There are no gradients inside the app; the old climate heat bar was removed because people read it as "how hot" rather than "how close to the target".

### Neutral
- **Hallway White** (`hallway-white`) / **Night Floor** (`night-floor`): the page ground.
- **Card White** (`card-white`) / **Night Card** (`night-card`): card, modal and input surfaces.
- **Hairline Gray** (`hairline-gray`) / **Night Hairline** (`night-hairline`): 1px borders and dividers.
- **Ink** (`ink`) / **Night Ink** (`night-ink`): primary text.
- **Quiet Slate** (`quiet-slate`) / **Night Quiet** (`night-quiet`): secondary text, meta, labels and inactive tabs.

### Provisional (current state, not a brand commitment)
- **Night Navy Bar** (`night-navy-bar` with its fg tokens): the header is a fixed dark bar in *both* themes. This is recorded as current state only. No brand identity exists yet (see PRODUCT.md), so do not treat it as a logo-grade commitment.
- **Login gradient** (navy `#0f172a` to `#0e7490` to `#06b6d4`, 120°): the full-bleed login background. It is provisional for the same reason.
- **Toast ink** (`toast-ink-bg`, `toast-error-bg` with white text): fixed high-contrast snackbars that are deliberately theme-independent.

### Named Rules
**The One Voice Rule.** Canal Cyan is the only interactive accent. If something needs to look tappable and important, it is cyan. If it is not the main action on the screen, it is not cyan.

**The State Means State Rule.** Green, gray, amber and red describe device or system state and nothing else. Never use them decoratively, and never use state alone as the signal: pair color with text (e.g. "Aan", "Offline") or an icon.

## Typography

**Body Font:** System UI stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`)

**Character:** A single native family that feels at home on every phone. The type is intentionally invisible, so hierarchy is carried entirely by weight (400 to 800) and a compact size ramp.

### Hierarchy
- **Display** (800, 1.8rem, −0.02em): the login title only.
- **Headline** (700, 1.5rem, −0.015em): the house name, which is the page's h1. The brand in the header bar is 1.1rem/700 and is not a heading.
- **State** (700, 1.6rem, −0.02em): "Aan"/"Uit" on light cards, the current temperature on sensor cards (2rem on the thermostat). The loudest text on a card.
- **Title** (700, 1.05rem): modal and sheet titles.
- **Reading** (600, 1.15rem): the thermostat target and secondary sensor values (motion).
- **Body** (500–600, 0.85–0.95rem): device names (600), status lines, tabs, buttons and inputs.
- **Meta** (400, 0.8–0.85rem): the connection line, "Laatst aan", relative times.
- **Label** (600, 0.72–0.78rem, uppercase, 0.03–0.04em): form labels and reading labels.

### Named Rules
**The Readings Are Loudest Rule.** On a device card the value a person came to check (on/off state, current temperature) is the heaviest and largest text. Device names come second, and meta and labels recede. Temperatures use the Dutch decimal comma with one decimal ("21,5°", `formatTemperature`).

**The Legibility Floor Rule.** Some users are older or have reduced sight. No text that carries information may go below 0.72rem. Meta text at that size must still meet 4.5:1 contrast.

## Layout

The layout is a single centered column. The container grows in steps: 640px on phones, 900px from 768px, 1100px from 1200px, 1500px from 1600px and 2200px from 2200px, with 1.5rem padding. The header bar spans the full width, and its inner content is capped at 1100px.

The main view reads top-down: the header bar, then the house name (h1) with the connection line or notice, then the house summary ("2 aan in [Woonkamer] [Keuken]", chips that jump to the room, or "Alle lampen en stopcontacten zijn uit"; hidden while the box is unreachable), then a horizontally scrolling room-tab strip (no visible scrollbar; the edge fades where more tabs are hidden; the active tab scrolls into view), then the device grid.

The device grid uses fluid columns of at least 10rem (`repeat(auto-fill, minmax(min(10rem, 100%), 1fr))`, `grid-auto-flow: dense`) with 0.75rem gaps: two columns on a phone, more on wider screens. Cards are as tall as their content (a light is compact, a sensor a little taller) and equally tall within a row. The thermostat spans two columns whenever two exist (a container query on the grid, so at 200% text it falls back to one full-width column instead of forcing a phantom column). The header content shares the page's max-width steps (`--content-max`), so the brand and avatar line up with the content at every width. The header, + button and toasts respect the safe-area insets for notches and home bars.

Overlays are centered modals (max 400px wide) on wide screens and **bottom sheets** on phones (≤480px: full width, 20px top corners, anchored to the bottom, safe-area padding), so forms sit in thumb reach. Toasts stack above the + button on phones and at the top right from 768px. A single FAB (add device) sits fixed 1.5rem from the bottom-right corner. While loading, four breathing card-shaped placeholders hold the grid.

Spacing rhythm is rem-based and runs xs 0.4rem, sm 0.75rem, md 1rem, lg 1.25rem, xl 1.5rem. Inside cards it is tighter (0.35–0.6rem gaps).

## Elevation & Depth

**Softly layered.** Surfaces rest on a gentle ambient shadow and lift further in response to interaction. Depth expresses closeness to the user's hand: page ground < resting card < hovered card < menu < modal < login card.

### Shadow Vocabulary
- **Resting card** (`0 1px 3px rgba(0,0,0,0.06)`): every card at rest. It is currently very faint. The chosen direction is a slightly more present ambient layer, still soft and diffuse.
- **Lifted card** (`0 12px 28px -10px rgba(0,0,0,0.28)` with `scale(1.01)`): hover on a clickable card.
- **On-glow** (Lamp-On Surface fill, `inset 0 0 22px -6px` Lamp-On Green, plus a green 1px border): the light comes from *inside* an "on" card, like a lit lamp shade. The fill and glow warm up over 0.4s.
- **Change pulse** (a Canal Cyan ring expanding 0 to 14px and fading over 1s): plays once when realtime state changes a card.
- **Menu** (`0 4px 12px rgba(0,0,0,0.2)`): dropdowns.
- **FAB** (`0 8px 24px -8px rgba(0,0,0,0.4)`).
- **Toast** (`0 8px 20px -6px rgba(0,0,0,0.35)`).
- **Modal** (`0 20px 48px -12px rgba(0,0,0,0.4)`) over a 50% black scrim.
- **Login card** (`0 30px 60px -20px rgba(0,0,0,0.5)`).

### Named Rules
**The Lamp Shade Rule.** "On" glows inward, never outward. Outer glows and neon halos are banned; they read as a techy console, not a lit room.

**The Offline Fade Rule.** An unreachable device stays in place and says so in text: "Offline" when the device itself is gone, "Niet bereikbaar" when the whole box is (with "Laatst aan/uit" or "· laatst bekend"). Only its icon fades (45% opacity, full grayscale); last-known readings stay at full contrast, because they are still information. It offers no toggle, because it cannot be controlled.

**The Not-Broken-Yet Rule.** A device added in this session shows "Wordt klaargezet" (dashed border, small spinner, "Dit duurt meestal een paar seconden.") until the box has provisioned it, never "Offline". One that never got provisioned says "Niet klaargezet" and what to do.

## Shapes

Softly rounded throughout. Corners get rounder as surfaces get larger and more "held": 6px for inline elements and compact banners, 8px for buttons, inputs and menus, 10px for toasts, 12px for cards, 16px for modals and 20px for the login card and the top corners of phone sheets. Pills (999px) are used for switches, the low-battery badge and the house-summary chips. Circles are used for device icons (44px), the thermostat −/+ buttons (48px), the avatar (44px) and the FAB (48px). New and not-yet-provisioned cards use a dashed hairline. Borders are always 1px hairlines. There are no thick outlines except the 2px focus ring and the 2px active-tab underline.

## Components

### Buttons
Soft and reassuring: generous, rounded, gently responsive.
- **Shape:** gently rounded (8px); minimum height 44px.
- **Primary:** Canal Cyan with its contrast text, full width in forms, 48px tall, weight 700, 1rem. Hover shifts to Canal Cyan Hover (darker in light, brighter in dark) and grows slightly (`scale(1.02)`).
- **Secondary:** transparent with a hairline border and Ink text.
- **Danger:** Alarm Red fill for confirmed destructive actions. **Danger text** is a red text-only button with an icon, for the first step of a destructive flow.
- **Icon:** a 44×44 square. All buttons share one 2px Canal Cyan focus ring with a 2px offset.
- **Plain:** a text-only Quiet Slate button that darkens to Ink on hover.
- **Disabled:** 60% opacity with no transform.

### Device Card (signature component)
The heart of the system. A card is at least 10rem wide and as tall as its content, with a 12px radius, a hairline border and resting shadow. The icon sits top-left, the gear (44px target) top-right, the name below the icon, and the state at the bottom. The whole card is one invisible action button (toggle for lights and switches, open details for sensors); the gear button sits beside it, never inside it.
- **Light / switch:** "Aan" or "Uit" at State size, with a visual switch (aria-hidden; the card button carries `aria-pressed`). On: Lamp-On surface, green border and inner glow, tinted icon. Off: neutral.
- **Thermostat:** spans two columns. A status line ("Verwarmt", "Op temperatuur", "Verwarming uit"), the current temperature at 2rem in the temperature scale, and the target between two 48px round −/+ buttons (0.5° steps). Taps are batched: one `set_temperature` command 800ms after the last tap, flushed if the card unmounts. A tap on the card itself does nothing; heating on/off is a switch in the settings sheet.
- **Sensor:** the temperature at State size; motion as plain text ("Nu beweging" / "Geen beweging", never amber); a low-battery badge only at ≤20%.
- **Settings:** the gear or a 500ms long-press opens a sheet (not a flip) with rename, room, heating on/off for thermostats, and delete with an inline confirmation.
- **States:** tap compresses the card (`scale(0.98)`), hover lifts it, "on" fills green, offline/unreachable says so in text and fades its icon, new cards say "Wordt klaargezet", and a realtime change pulses cyan. Focus shows a 2px Canal Cyan outline with a 2px offset.
- Long-press must not trigger text selection or the iOS callout.

### Switch
A 44×24 pill with an 18px white thumb that slides 20px over 0.2s. The track is Resting Gray when off and Lamp-On Green when on, for device state (the card indicator, heating on/off). App settings use the `switch-accent` variant (Canal Cyan when on).

### Inputs / Fields
- **Style:** Card surface, hairline border, 8px radius, 0.6rem 0.75rem padding, 0.95rem text.
- **Focus:** the border turns Canal Cyan with a soft 3px cyan halo (18% alpha). The native outline is replaced, never just removed.
- **Labels:** uppercase Label style in Quiet Slate, above the field.
- **Errors:** an Amber Notice banner above the form (8px radius); login errors are red text below the button.

### Navigation (room tabs)
Text tabs in a horizontally scrolling strip, each at least 44px tall. Inactive tabs are Quiet Slate at weight 500. The active tab is Canal Cyan at weight 700 with a 2px underline. Color transitions take 0.15s.

### Modals and sheets
A centered card surface, 16px radius, max 400px wide and 1.25rem padding; a bottom sheet on phones (see Layout). The title is on the left and the close button on the right, with 1px dividers between sections and actions right-aligned. Adding a device starts with four large type tiles (a radio group; the chosen tile gets a 2px cyan border and its icon lights up), then name and room; the room defaults to the one you were viewing.

### Connection line
Under the house name. Healthy: a quiet line with a check, "Verbonden met je huis". Phone ↔ Sandhovius lost: an Amber Notice, "Geen verbinding met Sandhovius…". Box silent for 90s (three missed 30s heartbeats on `houses.last_seen`) or stopped: an Amber Notice, "Je Sandhovius-box reageert niet sinds 14:02…". While either notice shows, cards show last-known state and cannot be toggled. On reconnect everything is re-fetched.

### Toasts
Fixed dark ink snackbars with white text, 10px radius, above the + button on phones and top right on wide screens. They are **not** confirmations of taps (the card is the confirmation); they appear only when a command is slow ("… reageert nog niet. Even geduld…" after 4s) or fails, and they hold for 3.5s (errors 6s, dismissible, in a separate `role="alert"` region). Errors turn toast-error red.

### FAB
A 48px Canal Cyan circle with a "+", fixed at the bottom right. There is only one FAB per screen.

## Do's and Don'ts

### Do:
- **Do** make every control reachable and obvious in one tap from the room view: toggling, reading and adjusting never require navigation.
- **Do** let cards be as tall as their content and let the grid decide the columns; give a device more width only when its control needs it (the thermostat).
- **Do** keep touch targets at 44px or more (48px for primary actions and the FAB).
- **Do** pair every state color with a word or an icon ("Aan", "Uit", "Offline", a battery %).
- **Do** design every screen in both themes; the dark-mode tokens are part of the spec, not an afterthought.
- **Do** keep motion confirming and brief (0.15–0.2s for state, 0.4s for a lamp's glow warming up, 0.25s for a sheet sliding up, 1s for the one-time change pulse). Exits are faster than entrances.
- **Do** give every animation a `prefers-reduced-motion` path that removes movement (scaling, sliding, growing rings, the loading breath) but keeps the state change visible, as a crossfade, a fade or a stationary ring.
- **Do** keep information-bearing text at 4.5:1 or better in both themes, and controls or icons at 3:1. The light theme uses a deeper step of each hue than the dark theme to get there. Check both themes whenever a token changes.

### Don't:
- **Don't** make it look like a Home Assistant dashboard: no dense entity lists, no tiny tiles, no power-user toggle walls.
- **Don't** make it look like a generic SaaS admin: no sidebars, data tables or KPI tiles.
- **Don't** make it look like a techy/neon smart-home console: no outer glows, glassmorphism, neon gradients or sci-fi dark panels.
- **Don't** introduce a second accent color; Canal Cyan is the only interactive voice.
- **Don't** use gradients inside the app. The login gradient is provisional.
- **Don't** show a toast for every tap, or make a tap on a thermostat change the heating.
- **Don't** treat the navy header bar or the login gradient as brand identity; they are current state until real brand assets exist.
- **Don't** hide offline or stale devices, or signal them with color alone.
