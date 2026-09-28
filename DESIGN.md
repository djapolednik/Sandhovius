---
name: Sandhovius
description: Calm, glanceable control for a home that runs itself locally.
colors:
  electric-blue: "#0066ff"
  electric-blue-hover: "#0052cc"
  electric-blue-hover-dark: "#1a75ff"
  electric-blue-contrast: "#ffffff"
  electric-blue-text: "#0066ff"
  electric-blue-text-dark: "#4d94ff"
  signal-green: "#04d800"
  signal-green-contrast: "#000000"
  signal-green-surface: "#eaf9e6"
  signal-green-surface-dark: "#122413"
  deep-leaf: "#027a00"
  lamp-warm: "#ffaa3c"
  lamp-icon: "#c96f00"
  lamp-icon-dark: "#ffb020"
  power-blue: "#2896ff"
  power-icon: "#0a74f0"
  power-icon-dark: "#3aa0ff"
  resting-gray: "#8a8f98"
  resting-gray-dark: "#5b6069"
  amber-notice: "#b45309"
  amber-notice-bg: "#fef3c7"
  amber-notice-dark: "#f59e0b"
  amber-notice-bg-dark: "#3a2305"
  alarm-red: "#b91c1c"
  alarm-red-contrast: "#ffffff"
  alarm-red-bg: "#fee2e2"
  alarm-red-dark: "#f87171"
  alarm-red-contrast-dark: "#1a0505"
  alarm-red-bg-dark: "#3b0d0d"
  mist: "#f0f0f0"
  panel-white: "#ffffff"
  inset-mist: "#f3f3f4"
  hairline-gray: "#e4e4e7"
  ink-black: "#000000"
  quiet-slate: "#5e626b"
  night-black: "#000000"
  night-panel: "#17191d"
  night-inset: "#22252a"
  night-hairline: "#2a2d33"
  night-ink: "#ffffff"
  night-quiet: "#a1a5ad"
  temp-cold: "#0066ff"
  temp-hot: "#dc2626"
  temp-cold-dark: "#4d94ff"
  temp-hot-dark: "#f87171"
  toast-ink-bg: "#1f2126"
  toast-error-bg: "#b91c1c"
typography:
  display:
    fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.03em"
  dial:
    fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "3.4rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  state:
    fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
  meta:
    fontFamily: "Urbanist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 500
rounded:
  control: "14px"
  tile: "18px"
  panel: "28px"
  pill: "999px"
spacing:
  xs: "0.4rem"
  sm: "0.6rem"
  md: "0.9rem"
  lg: "1.25rem"
  xl: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.electric-blue-contrast}"
    rounded: "{rounded.pill}"
    padding: "0.8rem 1.25rem"
    height: "52px"
  button-primary-hover:
    backgroundColor: "{colors.electric-blue-hover}"
  button-secondary:
    backgroundColor: "{colors.inset-mist}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.pill}"
    padding: "0.55rem 1.15rem"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.alarm-red}"
    textColor: "{colors.alarm-red-contrast}"
    rounded: "{rounded.pill}"
    padding: "0.55rem 1.15rem"
    height: "44px"
  input:
    backgroundColor: "{colors.inset-mist}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.control}"
    padding: "0.65rem 0.9rem"
    height: "48px"
  panel:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.panel}"
  device-tile:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.panel}"
    padding: "1rem 0.9rem 1.1rem 1rem"
    height: "12rem"
  lamp-visual:
    backgroundColor: "{colors.inset-mist}"
    textColor: "{colors.quiet-slate}"
    rounded: "{rounded.pill}"
    size: "72px"
  lamp-visual-lit:
    backgroundColor: "{colors.inset-mist}"
    textColor: "{colors.lamp-icon}"
  climate-mode:
    backgroundColor: "{colors.inset-mist}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.tile}"
    height: "72px"
  climate-mode-active:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.electric-blue-contrast}"
  climate-step:
    backgroundColor: "{colors.inset-mist}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.pill}"
    size: "52px"
  room-tab:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.ink-black}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    height: "48px"
  room-tab-active:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.electric-blue-contrast}"
  switch:
    backgroundColor: "{colors.resting-gray}"
    rounded: "{rounded.pill}"
    width: "48px"
    height: "28px"
  switch-on:
    backgroundColor: "{colors.signal-green}"
  bottom-nav:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.quiet-slate}"
    rounded: "{rounded.pill}"
    height: "64px"
  bottom-nav-active:
    backgroundColor: "{colors.electric-blue}"
    textColor: "{colors.electric-blue-contrast}"
  details-chip:
    backgroundColor: "{colors.inset-mist}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.pill}"
    height: "44px"
  modal:
    backgroundColor: "{colors.panel-white}"
    rounded: "{rounded.panel}"
    padding: "1.35rem"
    width: "420px"
  sheet:
    backgroundColor: "{colors.panel-white}"
    rounded: "{rounded.panel}"
    padding: "1.35rem"
    width: "100%"
---

# Design System: Sandhovius

## Overview

**Creative North Star: "The Lit Room at Night"**

Walk into a dark house in the evening and you know at once what is on: the lamp that glows, the thermostat's small light, everything else resting in the dark. Sandhovius works the same way. The surfaces are calm and quiet: black at night, soft mist by day. Only the things that are on light up: a lamp that is on fills its tile with warm light, a plug that is on with a cool power blue, and the thermostat's dial glows Electric Blue while it heats. You never have to read to know the state of the house; you see it, the way you see a lit window from the street.

The app is still a set of familiar household controls, arranged by room, and the user should never feel they are "using a smart-home system". They are turning on the kitchen light. The app is made for a phone or an iPad in the hand, so its navigation sits at the bottom, within reach of the thumb: **Home** (how the house is doing, favourites and the thermostat), **Kamers** (every device, room by room), **Scènes** and **Opties**. The screens are a bento of rounded panels: a house panel that says how the home is doing, and one tile per device, sized by how much control it needs. A lamp is a small tile with a large lamp icon and one big word ("Aan" or "Uit"). The thermostat is a large panel with a dial. Motion confirms and never performs: tiles compress slightly under the thumb, a lamp's warm light swells up over about a second and dies away even more slowly. There is no extra "you tapped this" effect: the light that swells up or dies away is the confirmation, as with a real switch. Everything else about a device sits behind "Details" (or a long-press) in a sheet and never crowds a tile.

**The tile is the state.** A lamp that is on is unmistakable from across the room: warm light glows out from behind its icon, the icon itself lights up amber, and "Aan" is the largest word. Off is quiet: no glow, a gray icon, "Uit" in the secondary color.

This is explicitly **not** a Home Assistant dashboard, which is dense, entity-centric and built for power users. It is not a generic SaaS admin (sidebars, data tables, KPI tiles). And although it is dark, it is not a techy neon console: only real light sources glow, glassmorphism is banned, and there are no sci-fi decorations.

**Key Characteristics:**
- Navigation at the bottom, in thumb reach: Home, Kamers, +, Scènes, Opties, each tab with icon and word
- A bento of rounded panels (28px): a house panel plus one tile per device, sized by the control it needs
- State is readable at a glance: a warmly lit lamp tile with "Aan" for on, a quiet tile with "Uit" for off, text for offline, amber for attention
- Only live energy glows: warm light from a lamp that is on, power blue from a plug that is on, Electric Blue from the thermostat while it heats
- Connection is always honest: "Verbonden met je huis" when everything works, a plain-language notice when it doesn't
- Light and dark themes are equal citizens: black with dark panels at night, mist with white panels by day
- One friendly geometric family (Urbanist), sentence case throughout, never uppercase labels
- Generous touch targets (44px minimum, 48px for room pills, 52px for primary actions and thermostat steps, 56px for the navigation items)

## Colors

A black-and-mist palette from the brand sheet, with one interactive voice (Electric Blue), one "on" signal (Signal Green) and a small, fixed vocabulary of state colors.

### Primary
- **Electric Blue** (`electric-blue`): the single interactive voice. It is used for primary buttons, the active thermostat mode, the dial's value arc and knob, focus rings, input focus, the active room pill, the active navigation item, and "Toevoegen". White text on it is 4.8:1. As *text* it stays `electric-blue-text` in the light theme and lightens to `electric-blue-text-dark` on black (5.9:1 on a night panel). Soft focus rings use the per-theme `--accent-ring` token; the dial's glow uses `--glow`. None of them are hard-coded rgba.

### State colors
- **Lamp Warm** (`lamp-warm`, as a translucent `--lamp-glow` per theme): the light of a lamp that is on. It glows out from behind the lamp icon with a strong core (`--lamp-glow`) and a softer middle (`--lamp-glow-mid`), and the lamp symbol itself turns amber with a small glow of its own (`lamp-icon`, 3.3:1 light, 8.4:1 dark on its circle). The circle stays the neutral inset surface: the symbol is the light, not the circle. It only ever means "this lamp gives light", never decoration.
- **Power Blue** (`power-blue`, as a translucent `--power-glow` per theme): the same glow for a plug that is on, with the socket symbol turning power blue (`power-icon`, 4.0:1 light, 5.6:1 dark on its circle; icons need 3:1). Lighter and cooler than Electric Blue, so a live plug never reads as a button or as heating.
- **Signal Green** (`signal-green`): means "this is on" in the house summary: the count and the count badges on the room chips (with a black number, `signal-green-contrast`, 10.8:1). On tiles, "Aan" is plain primary text; the light itself carries the state. It fails as text on white (1.9:1), so as text it is **Deep Leaf** (`deep-leaf`, 5.1:1+) in the light theme and Signal Green itself on black. It is never used for success messages, app settings or decoration: the dark-mode and "Op Home tonen" switches use Electric Blue, because a theme or a favourite is not device state.
- **Resting Gray** (`resting-gray` / `-dark`): the off track of a switch, and the dial's arc when heating is off.
- **Amber Notice** (`amber-notice` with `amber-notice-bg`): something needs attention but is not broken, such as the connection notices, recoverable errors in banners and the low-battery badge.
- **Alarm Red** (`alarm-red` with `alarm-red-bg`): destructive actions and danger zones only.

### Device icons and temperatures
Device icons are line icons in a neutral circle (`inset-mist` / `night-inset`, secondary color). There are no per-type color tints anymore: the kind of device is carried by the icon shape and the name, and color is kept for state. In the add-device tiles, the chosen type's icon circle turns Electric Blue. **Temperature readings** use a per-theme cold→hot scale (`temp-cold` / `temp-hot`, mixed in OKLab by `lib/temperature.js`) so every point stays ≥4.5:1 as text on its panel. The scale is for sensor readings; the thermostat's "Nu" stays neutral.

### Neutral
- **Mist** (`mist`) / **Night Black** (`night-black`): the page ground. It is true black, not a tinted near-black, as the brand sheet specifies.
- **Panel White** (`panel-white`) / **Night Panel** (`night-panel`): panels, tiles, modals and sheets.
- **Inset Mist** (`inset-mist`) / **Night Inset** (`night-inset`): surfaces *inside* a panel, such as inputs, secondary buttons, thermostat steps and modes, the "Details" chip, icon circles (including an unlit lamp) and summary chips.
- **Hairline Gray** (`hairline-gray`) / **Night Hairline** (`night-hairline`): dividers, and the 1px border that dark panels need.
- **Ink Black** (`ink-black`) / **Night Ink** (`night-ink`): primary text.
- **Quiet Slate** (`quiet-slate`) / **Night Quiet** (`night-quiet`): secondary text, labels, inactive tabs, "Uit".

### Provisional (current state, not a brand commitment)
- **Toast ink** (`toast-ink-bg`, `toast-error-bg` with white text): fixed high-contrast snackbars that are deliberately theme-independent.

### Named Rules
**The One Voice Rule.** Electric Blue is the only interactive accent. If something needs to look tappable and important, it is blue. If it is not the main action on the screen, it is not blue.

**The State Means State Rule.** Green, gray, amber and red describe device or system state and nothing else. Never use them decoratively, and never use state alone as the signal: pair color with text (e.g. "Aan", "Offline") or an icon.

## Typography

**Font:** Urbanist (OFL), self-hosted through `next/font` (no request to Google at runtime; it works without internet), falling back to the system stack. It is an open stand-in for Lufga from the brand sheet and can be swapped for Lufga with a license in `app/layout.js`.

**Character:** Friendly and geometric, with round bowls and open shapes, calm at large sizes. One family carries everything. Hierarchy comes from size and a narrow weight range (400 to 700, mostly 500 and 600), with tighter tracking as size grows.

### Hierarchy
- **Display** (600, 2.5rem, −0.03em): the login title only.
- **Dial** (600, 3.4rem, −0.04em): the thermostat target inside the dial, the largest number in the app.
- **Page title** (600, 2rem, −0.03em): the h1 of each tab ("Welkom thuis", "Kamers", "Scènes", "Opties"). On Home the date sits above it at 1rem/500 in Quiet Slate.
- **Headline** (600, 1.75rem, −0.02em): the house name in the house panel (an h2).
- **State** (600, 2.4rem, −0.02em): "Aan"/"Uit" on light tiles, in the primary text color ("Uit" in Quiet Slate). The sensor temperature is 2.75rem, the house-summary count 2rem.
- **Title** (600, 1.35rem): modal and sheet titles.
- **Section** (600, 1.15rem): section headings on Home ("Favorieten", "Temperatuur") and the "N apparaten" count on Kamers.
- **Body** (500–600, 0.95–1.05rem): tile names (600, 1rem), room pills, buttons, inputs, status lines.
- **Meta** (500, 0.85–0.95rem): the connection line, labels, tile captions, navigation labels, "Laatst aan", dial scale and "Nu".

### Named Rules
**The Readings Are Loudest Rule.** On a tile, the value a person came to check (on/off state, temperature, the thermostat target) is the heaviest and largest text. Device names come second, and meta and labels recede. Temperatures use the Dutch decimal comma with one decimal ("21,5°", `formatTemperature`).

**The Sentence Case Rule.** Labels, buttons and headings are written as sentences ("Wat voeg je toe?", "Naam"), never in uppercase or with letter-spaced stamps. Meta is written as sentences too ("Offline, laatst bekende stand"), not as strings joined with middle dots.

**The Legibility Floor Rule.** Some users are older or have reduced sight. No text that carries information may go below 0.85rem. Meta text at that size must still meet 4.5:1 contrast.

## Layout

The page is centered on `--content-max` (640px on phones, 1000px from 768px, 1240px from 1200px, 1480px from 1600px) with 1rem side padding (1.5rem from 768px), extra room at the bottom for the navigation, and safe-area insets.

**Navigation** sits at the bottom: a floating pill bar (max 30rem wide, centered, above the safe area) with four tabs, **Home**, **Kamers**, **Scènes** and **Opties**, each an icon plus a word, and exactly in the middle a standalone round **+** (52px) that adds a device from any tab. The + sits inside the bar, and a 5px ring in the page's own color cuts a round gap around it, so the bar visibly runs around a standalone button. It is an action, not a tab: a white circle with a hairline in the light theme (Inset Mist in dark) and an Electric Blue plus, so the active tab stays the only blue fill; its name is "Apparaat toevoegen". A device added from Home that doesn't land on Home (it isn't the first favourite) takes you to its room on Kamers. The settings tab is called **Opties** so every label fits on one line in five slots (its hash stays `#instellingen`). At large text the bar becomes two columns with the + as a wide pill in the middle row (Home, Kamers / + / Scènes, Opties). **Scènes** is a "komen eraan" screen for now: one panel that says what a scene will do, with no controls that don't work yet. The tab lives in the URL hash (`#kamers`), so the phone's back button steps between tabs and a reload keeps your place.

**Page head:** each tab opens with a large title on the page itself (no colored bar) and at most one action on the right: the date above "Welkom thuis" on Home, "+ Toevoegen" on Kamers.

**Home:** the house panel, then **Favorieten** (devices marked "Op Home tonen", with their room as the caption; a short hint when there are none), then **Staat aan** (every lamp or plug that is on and is not a favourite, so the tile is the state and Home never only shows a count), then **Temperatuur** (every thermostat, always shown). Favourites come first because they are the quick switches; the thermostat panel is tall. After a tap, a lamp or plug tile shows intent until the box confirms (the command is executed or the new state arrives, usually well under a second): "Aan…" or "Uit…" in the quiet color, with only a trace of the glow, which then swells up to full. A tile you switch off in "Staat aan" stays there, showing "Uit", until you leave Home, so it never vanishes under your thumb. The row is hidden while the box is unreachable.

**First run:** while a house has no devices, Home and Kamers show one panel in place of the sections: the four device types as unlit icon circles, "Voeg je eerste apparaat toe", and a full-width "Apparaat toevoegen" in thumb reach. Nothing glows, because nothing is on yet. As long as Home has no favourites, a new lamp, plug or sensor is added as a favourite, so the first device appears on Home and can be switched with one tap.

**Kamers:** a horizontally scrolling row of filled room pills (no visible scrollbar; the edge fades where more pills are hidden; the active pill scrolls into view), "N apparaten", then that room's bento.

**Opties:** stacked panels (max 40rem): Huis (with more than one house: which house the app shows; then the row that opens house and rooms), Weergave (Licht / Donker / Automatisch), Account (who is logged in, Wachtwoord wijzigen, Uitloggen).

**Home on wide screens:** from 900px (iPad landscape and up), a two-column grid with the house panel as a fixed (sticky) column of 15–18rem on the left and the sections beside it; the device area always takes the right column, even while the house panel is still loading. Below 900px they stack, with the house panel first. The house panel stands in for the weather tile in the inspiration, but carries real information: the house name, the connection line or notice, a **Let op** block when something needs the owner (a device offline, a battery at 20% or less, a setup that failed: Amber Notice, one line per device that opens its details; hidden while the box is unreachable and for devices still being set up), and the house summary ("1 lamp staat aan", "2 lampen en 1 stopcontact staan aan", with room chips that jump to the room and an **Alles uit** secondary pill that switches off every lamp and plug that is on, or "Alle lampen en stopcontacten zijn uit"; hidden while the box is unreachable). With more than one house, "Ander huis" under the name leads to the choice in Opties. When the dashboard is at least 68rem wide (a desktop at normal text size), Favorieten (with Staat aan below it) and Temperatuur sit side by side instead of stacked. The favourites column is as wide as its tiles (at least two), and the thermostat gets a fixed 28rem column right next to it, so any empty space falls at the end of the row rather than between the sections.

**Lamp and plug tiles:** the icon sits at the top. Name, state and caption form one tight group at the bottom, just above "Details". The free space falls between the light and the text, never between a name and its state.

**Device bento:** fluid columns of at least 10.5rem (`repeat(auto-fill, minmax(min(10.5rem, 100%), 1fr))`, `grid-auto-flow: dense`) with 0.9rem gaps, which gives two columns on a phone. Tiles are at least 12rem tall and equally tall within a row. The thermostat spans two columns once there are two (container query at 21.9rem), and also two rows once there are three columns (33.3rem). The container queries mean that at 200% text it falls back to one full-width column instead of forcing a phantom column.

**Large text (up to 200%):** nothing may overlap or spill, and names break at word boundaries (`overflow-wrap: break-word` with `hyphens: auto`; only e-mail addresses may break anywhere). Container queries in rem only fire when the text is large relative to the space:
- The page head wraps, so the action drops below the title.
- The dial's text scales with the dial (`cqi`), not only with the font size.
- Below 17rem the thermostat puts its status on its own line above − and +, and stacks the modes.
- The navigation labels are capped at a third of the bar (`min(0.85rem, 4.2cqi)`).
- The house name is capped at `13cqi` so a street name stays whole.
- In Opties the decorative icon gives way below 18rem.

Icon circles grow moderately with the text (`clamp(44px, 2.75rem, 64px)`, a lamp `clamp(72px, 4.5rem, 104px)`), and the symbol scales with its circle.

Overlays are centered modals (max 420px wide) on wide screens and **bottom sheets** on phones (≤480px: full width, 28px top corners, anchored to the bottom, safe-area padding), so forms sit in thumb reach. Toasts stack above the navigation on phones and at the top right from 768px. While loading, four breathing tile-shaped placeholders hold the grid, the first shaped like the thermostat.

Spacing rhythm is rem-based: xs 0.4rem, sm 0.6rem, md 0.9rem (the bento gap), lg 1.25rem, xl 1.5rem.

## Elevation & Depth

**Surface steps, real light.** Depth comes from surface steps rather than shadows: page < panel < inset. In the light theme panels rest on a soft, diffuse shadow (`--shadow-panel`). On black there are no shadows at all; dark panels carry a 1px hairline instead. The only light effects come from things that are actually live: a lamp or plug that is on, and the thermostat while it heats.

### Shadow Vocabulary
- **Panel** (light only: `0 1px 2px rgba(0,0,0,0.04), 0 14px 32px -20px rgba(0,0,0,0.16)`): every panel, tile and inactive room pill at rest.
- **Dial glow** (a blurred disc of `--glow` behind the dial, `blur(32px)`, fading in over 0.6s): only while heating is on.
- **Tile glow** (a radial gradient centered on the device icon, filling the tile to 70%): `--lamp-glow` while a lamp is on, `--power-glow` while a plug is on. On: it swells from 92% to full size and fades in over 1.2–1.4s with a slow start (`cubic-bezier(0.3, 0, 0.2, 1)`), like a filament warming up. Off: it dies away over 1.8s (`ease-in`). With reduced motion it simply fades in 0.3s.
- **Navigation** (`0 12px 36px -14px rgba(0,0,0,0.35)`; on black a hairline with a deeper shadow): the bottom bar floats above the content.
- **Toast** (`0 12px 28px -10px rgba(0,0,0,0.45)`).
- **Modal / sheet** (`0 24px 56px -16px rgba(0,0,0,0.45)`) over a 55% black scrim.
- **Login** (a large blurred Electric Blue disc behind the login panel, 35% light / 45% dark): the brand sheet's glow as the first thing you see.

### Named Rules
**The Real Light Rule.** Only something that is actually live may glow: a lamp that is on (warm), a plug that is on (power blue) and the thermostat while it heats (Electric Blue). Sensors, buttons and panels never glow. A glow that stands for anything other than live energy turns the room into a neon console.

**The Offline Fade Rule.** An unreachable device stays in place and says so in text: "Offline" when the device itself is gone, "Niet bereikbaar" when the whole box is (with "Laatst aan/uit" or "…, laatst bekende stand"). Only its icon fades (45% opacity); last-known readings stay at full contrast, because they are still information. It offers no toggle, because it cannot be controlled.

**The Not-Broken-Yet Rule.** A device added in this session shows "Wordt klaargezet" (dashed border, small spinner, "Dit duurt meestal een paar seconden.") until the box has provisioned it, never "Offline". One that never got provisioned says "Niet klaargezet" and what to do.

## Shapes

Rounded, and rounder as surfaces get larger and more "held": 14px for inputs and menu items, 18px for surfaces inside a panel (thermostat modes, type tiles, notices, danger zone, toasts), and 28px for panels, tiles, modals, sheets and the login panel. Everything you press that isn't a tile is fully round: buttons are pills, and the lamp icon circle, thermostat steps, room pills, "Details", summary chips and the navigation bar and its items are circles or pills. Dark panels have a 1px hairline; light panels have none. New and not-yet-provisioned tiles use a dashed hairline. The only thick outline is the 2px focus ring.

## Components

### Buttons
Round and confident: pills, generous, gently responsive.
- **Shape:** pill (999px); minimum height 44px.
- **Primary:** Electric Blue with white text, full width in forms, 52px tall, weight 600, 1.05rem. Hover darkens (light) or brightens (dark); press compresses slightly (`scale(0.98)`).
- **Secondary:** an Inset Mist pill with Ink text; hover steps to the hairline color.
- **Danger:** Alarm Red fill for confirmed destructive actions. **Danger text** is a red text-only button with an icon, for the first step of a destructive flow.
- **Icon:** 44×44. All buttons share one 2px Electric Blue focus ring with a 2px offset.
- **Plain:** a text-only Quiet Slate button that darkens to Ink on hover.
- **Disabled:** 50% opacity with no transform.

### Device tile (signature component)
The heart of the system. A tile is a 28px panel, at least 10.5rem wide and 12rem tall. The thermostat's gear floats top-right, and its name wraps around it on its first line and uses the full width after that, so names never break mid-word. The whole tile is one invisible action button (toggle for lights and switches, open details for sensors); "Details" and the gear sit beside it, never inside it.
- **Light / switch:** a large device icon in a 72px circle at the top (a light bulb for a lamp, a Dutch wall socket for a plug), the name, "Aan" or "Uit" at State size, a caption (the type, or the room on Home), and a **Details** chip at the bottom. The tile is one button carrying `aria-pressed`. A lamp that is on lights up: the warm **tile glow** fills the tile from behind the icon and the bulb symbol turns amber (the circle stays neutral). A plug that is on does the same in power blue. "Aan" stays in the primary text color. Off: no glow, a gray icon, "Uit" in Quiet Slate.
- **Thermostat** (spans two columns, and two rows on wide grids): a 270° **dial** (open at the bottom) with the target as the value arc and a knob, a dot on the arc for the current temperature, and min/max at the arc ends. Inside it are "Doel" and the target at Dial size, with "Nu 21,0°" below in neutral text (the cold→hot tint next to the target read as an alert). Under the dial are two 52px round −/+ steps (0.5°) with the status between them ("Verwarmt" in blue, "Op temperatuur", "Verwarming uit"), then one **Verwarming** row on Inset Mist with a switch (a device-state switch, so Signal Green when on). With heating off the panel is quiet: gray arc, no glow, −/+ disabled with "Verwarming uit" between them, and no blue fill anywhere. Offline, the switch stays focusable (`aria-disabled`) so its state can still be read. At large text (the dial's container under 17rem) "Nu" and the 15°/25° scale leave the dial, and "Nu 21,0°" appears under it in text that grows. Taps on −/+ are batched: one `set_temperature` command 800ms after the last tap, flushed if the tile unmounts. Screen readers hear the target once, when it settles, not every 0.5° step. A tap on the panel itself does nothing. With heating off, the arc turns Resting Gray and the glow goes out.
- **Sensor:** the name, the temperature at 2.75rem in the temperature scale, motion as a plain sentence ("Er is nu beweging" / "Geen beweging", never amber), the caption, and a low-battery badge only at ≤20%. A tap opens the details.
- **Details:** "Details", the thermostat's gear, a tap on a sensor or a 500ms long-press opens one **detail sheet**. It starts with how the device is now: a sensor's readings (with "Laatst bijgewerkt"), or a "Stand" row for a lamp, plug or thermostat ("Aan", "Verwarming uit", "Offline, laatst aan"), because the sheet covers the tile on a phone. Then come the **Op Home tonen** switch (favourite, Electric Blue), name and room, and delete with an inline confirmation. Everything saves itself, with no "Opslaan": the switch and the room as soon as you change them, and the name when you leave the field or close the sheet. An emptied name reverts instead of saving. A quiet "Opgeslagen" line confirms each save for 2s, and a save that fails after the sheet has closed (the name on close) becomes an error toast. The sheet itself takes focus on open (no focus ring on the close button); Tab goes to the close button next.
- **States:** tap compresses the tile (`scale(0.98)`), hover darkens the edge, a lamp or plug that is on glows, offline/unreachable says so in text, fades the icon and shows no glow (the state is not certain), new tiles say "Wordt klaargezet", and there is no tap ring or pulse: the glow is the feedback. On a lit tile the caption switches from Quiet Slate to the primary text color, because gray is too weak on colored light. Focus shows a 2px Electric Blue outline with a 3px offset.
- Long-press must not trigger text selection or the iOS callout.

### House panel
The first panel on Home: the house name (Headline, an h2), the connection line, a divider, then the summary. That is either what is on, with the first count at State size in green ("2 lampen en 1 stopcontact staan aan"), and room chips (Inset Mist pills whose count sits in a small Signal Green badge, with the same ↗ arrow as "Details"), or the quiet sentence "Alle lampen en stopcontacten zijn uit". A room chip opens that room on the Kamers tab.

### Switch
A 48×28 pill with a 22px white thumb that slides 20px over 0.2s. The track is Resting Gray when off and Signal Green when on, for device state. App settings use the `switch-accent` variant (Electric Blue when on).

### Inputs / Fields
- **Style:** an Inset Mist field with a hairline border, 14px radius, 48px tall, 1rem text.
- **Focus:** the border turns Electric Blue with a soft 3px blue halo. The native outline is replaced, never just removed.
- **Labels:** sentence case in Quiet Slate, 0.9rem/500, above the field.
- **Errors:** an Amber Notice banner (18px radius); login errors are red text above the button.

### Navigation bar
Three items in a floating pill at the bottom: an icon above a word (0.85rem/600), each at least 56px tall. Inactive items are Quiet Slate; the active one is an Electric Blue pill with white icon and word, marked `aria-current="page"`. Always words as well as icons: people who do not live in apps should not have to guess.

### Room pills
Filled pills on the Kamers tab, 48px tall. Inactive pills are a Panel White pill with Ink text (Night Inset on black); the active pill is Electric Blue with white text at weight 600. Color transitions take 0.15s.

### Modals and sheets
A 28px panel, max 420px wide, with 1.35rem padding; a bottom sheet on phones (see Layout). The title is on the left and the close button on the right, with 1px dividers between sections and actions right-aligned. Adding a device starts with four large type tiles (a radio group on Inset Mist; the chosen tile gets a 2px blue border and its icon circle turns blue), then name and room; the room defaults to the one you were viewing.

### Connection line
In the house panel, under the name. Healthy: a quiet line with a green check, "Verbonden met je huis". Phone ↔ Sandhovius lost: an Amber Notice, "Geen verbinding met Sandhovius…". Box silent for 90s (three missed 30s heartbeats on `houses.last_seen`) or stopped: an Amber Notice, "Je Sandhovius-box reageert niet sinds 14:02…". While either notice shows, tiles show last-known state and cannot be toggled. On reconnect everything is re-fetched.

### Toasts
Fixed dark ink snackbars with white text, 18px radius, above the navigation on phones and at the top right on wide screens. They are **not** confirmations of taps (the tile is the confirmation). They appear only when a command is slow ("… reageert nog niet. Even geduld…" after 4s) or fails, and for the few actions that can be undone. They hold for 3.5s (errors 6s, dismissible, in a separate `role="alert"` region). Errors turn toast-error red.

A toast can carry one underlined action, **Ongedaan maken**, and then holds 6s. It follows Alles uit (the same set turns back on), switching the heating off, and deleting a device or a room. A delete hides the item at once and only really deletes after those 6s, so undo simply cancels it; closing the app within that window keeps the item, which is the safe side.

### Opties
Stacked panels with a quiet heading each. **Huis**: with more than one house, first the houses as rows (radio buttons underneath, the chosen one with a blue 2px border and a check, remembered per device); then one large row (icon, house name, "3 kamers. Naam en kamers wijzigen") that opens the house-and-rooms sheet, where rooms have ↑/↓ buttons to set their order (the room pills follow it). **Weergave** is a three-way bar, Licht / Donker / Automatisch (radio buttons under a pill bar on Inset Mist, the choice Electric Blue; stacked at large text); Automatisch follows the phone, also when it switches while the app is open. **Account** says who is logged in, with "Wachtwoord wijzigen" (a sheet: current password, the new one twice, at least 8 characters; you stay logged in) and "Uitloggen" as secondary pills.

### Ordering and recovery
Order is set with ↑/↓ icon buttons, never by dragging: one thumb, a keyboard and a screen reader all work, and nothing has to be discovered. **Favorieten** has a quiet "Volgorde" text button beside its heading (from two favourites) that opens a sheet with the list; a new favourite goes last. A device whose setup failed says "Het klaarzetten is niet gelukt" with **Opnieuw proberen** in the accent color next to Details; the box retries and the tile shows "Wordt klaargezet" meanwhile.

### Login and the installed app
The login card has a quiet "Wachtwoord vergeten?" under the button. It swaps to one field and "Stuur resetlink"; the confirmation is the same whether or not the address has an account. The app is installable: name Sandhovius, a placeholder icon (a house with one lit window on black, not a logo), standalone display, and a status bar that follows the phone's theme.

## Do's and Don'ts

### Do:
- **Do** make every control reachable and obvious in one tap from its room (and from Home once it is a favourite): toggling, reading and adjusting never require a deeper screen.
- **Do** keep primary navigation at the bottom, in thumb reach, with a word under every icon (the + is the one action in the bar and is named for screen readers).
- **Do** size a tile by the control it needs: small for a lamp, large for the thermostat. Let the bento decide the columns.
- **Do** keep touch targets at 44px or more (48px for room pills, 52px for primary actions and thermostat steps, 56px for navigation items).
- **Do** pair every state color with a word or an icon ("Aan", "Uit", "Offline", a battery %).
- **Do** design every screen in both themes: black with night panels, and mist with white panels. The dark-mode tokens are part of the spec, not an afterthought.
- **Do** keep motion confirming and brief: 0.15–0.2s for state, 0.35s for the dial moving to a new target, 1.2–1.4s for a lamp's or plug's glow swelling up and 1.8s for it dying away, 0.6s for the dial's glow fading in, 0.25s for a sheet sliding up. Exits are faster than entrances.
- **Do** give every animation a `prefers-reduced-motion` path that removes movement (scaling, sliding, growing rings, the dial sweep, the lamp's swell, the loading breath) but keeps the state change visible.
- **Do** keep information-bearing text at 4.5:1 or better in both themes, and controls or icons at 3:1. Where a brand color fails as text (Signal Green on white), use its deeper step as text and keep the bright color for fills.

### Don't:
- **Don't** make it look like a Home Assistant dashboard: no dense entity lists, no tiny tiles, no power-user toggle walls.
- **Don't** make it look like a generic SaaS admin: no sidebars, data tables or KPI tiles.
- **Don't** make it a neon console: nothing glows unless it is live (a lit lamp, a plug that is on, a heating thermostat); no glassmorphism, no neon gradients, no sci-fi decoration.
- **Don't** introduce a second accent color; Electric Blue is the only interactive voice.
- **Don't** show tiles for things the house can't do or data it doesn't have (weather, music, energy, brightness) just because an inspiration board has them. Scènes are the next feature; until then their tab says honestly that they are coming.
- **Don't** use uppercase labels, letter-spaced stamps or middle-dot meta strings.
- **Don't** show a toast for every tap, or make a tap on a thermostat change the heating.
- **Don't** hide offline or stale devices, or signal them with color alone.
