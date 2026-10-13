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
  mist: "#f4f1ec"
  panel-white: "#ffffff"
  inset-mist: "#f3f3f4"
  hairline-gray: "#e4e4e7"
  ink-black: "#000000"
  quiet-slate: "#5e626b"
  night-black: "#100e0c"
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

The app is still a set of familiar household controls, arranged by room, and the user should never feel they are "using a smart-home system". They are turning on the kitchen light. The app is made for a phone or an iPad in the hand, so its navigation sits at the bottom, within reach of the thumb: **Home** (how the house is doing, favourites and the thermostat), **Kamers** (every device, room by room), **Scènes** and **Opties**. The screens are a bento of rounded panels, one tile per device, sized by how much control it needs; on Home a line under the greeting says how the house is doing. A lamp is a small, flat tile: its icon, its name and one big word ("Aan" or "Uit"). The thermostat is a compact panel with a dial. Motion confirms and never performs: tiles compress slightly under the thumb, a lamp's warm light swells up over about a second and dies away even more slowly. There is no extra "you tapped this" effect: the light that swells up or dies away is the confirmation, as with a real switch. Everything else about a device sits in a sheet behind a long-press (or a right-click) and never crowds a tile.

**The tile is the state.** A lamp that is on is unmistakable from across the room: warm light glows out from behind its icon, the icon itself lights up amber, and "Aan" is the largest word. Off is quiet: no glow, a gray icon, "Uit" in the secondary color.

This is explicitly **not** a Home Assistant dashboard, which is dense, entity-centric and built for power users. It is not a generic SaaS admin (sidebars, data tables, KPI tiles). And although it is dark, it is not a techy neon console: only real light sources glow, glassmorphism is banned, and there are no sci-fi decorations.

**Key Characteristics:**
- Navigation at the bottom, in thumb reach: Home, Kamers, +, Scènes, Opties, each tab with icon and word
- A bento of rounded panels (28px): small device tiles grouped per room, and a compact thermostat
- State is readable at a glance: a warmly lit lamp tile with "Aan" for on, a quiet tile with "Uit" for off, text for offline, amber for attention
- Only live energy glows: warm light from a lamp that is on, power blue from a plug that is on, Electric Blue from the thermostat while it heats
- Connection is always honest: a plain-language notice on Home when something is wrong, and "Verbonden met je huis" in Opties when everything works
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
- **Signal Green** (`signal-green`): means "this is on": the track of a device switch (such as the thermostat's Verwarming), with a black mark where one sits on it (`signal-green-contrast`, 10.8:1). On tiles, "Aan" is plain primary text; the light itself carries the state. It fails as text on white (1.9:1), so as text it is **Deep Leaf** (`deep-leaf`, 5.1:1+) in the light theme and Signal Green itself on black. It is never used for success messages, app settings or decoration: the dark-mode and "Op Home tonen" switches use Electric Blue, because a theme or a favourite is not device state.
- **Resting Gray** (`resting-gray` / `-dark`): the off track of a switch, and the dial's arc when heating is off.
- **Amber Notice** (`amber-notice` with `amber-notice-bg`): something needs attention but is not broken, such as the connection notices, recoverable errors in banners and the low-battery badge.
- **Alarm Red** (`alarm-red` with `alarm-red-bg`): destructive actions and danger zones only.

### Device icons and temperatures
Device icons are line icons in a neutral circle (`inset-mist` / `night-inset`, secondary color). There are no per-type color tints anymore: the kind of device is carried by the icon shape and the name, and color is kept for state. In the add-device tiles, the chosen type's icon circle turns Electric Blue. **Temperature readings** use a per-theme cold→hot scale (`temp-cold` / `temp-hot`, mixed in OKLab by `lib/temperature.js`) so every point stays ≥4.5:1 as text on its panel. The scale is for sensor readings; the thermostat's "Nu" stays neutral.

### Neutral
- **Mist** (`mist`, `#f4f1ec`) / **Night Black** (`night-black`, `#100e0c`): the page ground. Both are warm, deliberately: a warm off-white by day and a warm near-black at night, so the app feels like a room in a home rather than an office or a screen. (Until 2026-10-13 this was the brand sheet's cold `#f0f0f0` and true black `#000000`; the warmer ground was chosen to make Home feel welcoming.) Panels keep their own colours.
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
- **Page title** (600, 2rem, −0.03em): the h1 of each tab ("Goedenavond, David", "Kamers", "Scènes", "Opties"). On Home it is a greeting by the time of day (Goedemorgen from 6:00, Goedemiddag from 12:00, Goedenavond from 18:00, Goedenacht from 0:00) with the first word of the account name, or the greeting alone without a name (never the e-mail address); the date sits above it at 1rem/500 in Quiet Slate.
- **Headline** (600, 1.75rem, −0.02em): the room name on Kamers from 900px.
- **State** (600, 2.4rem, −0.02em): "Aan"/"Uit" on light tiles, in the primary text color ("Uit" in Quiet Slate). The sensor temperature is 2.75rem.
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

**Navigation** sits at the bottom: a floating pill bar (max 30rem wide, centered, above the safe area) with four tabs, **Home**, **Kamers**, **Scènes** and **Opties**, each an icon plus a word, and exactly in the middle a standalone round **+** (52px) that adds a device from any tab. The + sits inside the bar, and a 5px ring in the page's own color cuts a round gap around it, so the bar visibly runs around a standalone button. It is an action, not a tab: a white circle with a hairline in the light theme (Inset Mist in dark) and an Electric Blue plus, so the active tab stays the only blue fill; its name is "Apparaat toevoegen". A device added from Home that doesn't land on Home (it isn't the first favourite) takes you to its room on Kamers. The settings tab is called **Opties** so every label fits on one line in five slots (its hash stays `#instellingen`). At large text the bar becomes two columns with the + as a wide pill in the middle row (Home, Kamers / + / Scènes, Opties). **Scènes** is a bento of scene tiles (see Components). The tab lives in the URL hash (`#kamers`), so the phone's back button steps between tabs and a reload keeps your place.

**Page head:** each tab opens with a large title on the page itself (no colored bar) and at most one action on the right: "+ Toevoegen" on Kamers, **Alles uit** on Home. On Home the date sits above the greeting and the **Home line** under it (1.05rem/500, Quiet Slate): one sentence about the house and the weather now, "2 lampen aan, binnen 20,5°. Buiten helder, 9°" (see Home line). **Alles uit** is a secondary pill that switches off every lamp and plug that is on, with an undo toast; only while something is on and the box is reachable.

**Home:** only when something is wrong, a **notices panel** first: the connection notices (see Connection) and a **Let op** block when something needs the owner (a device offline, a battery at 20% or less, a setup that failed: Amber Notice, one line per device that opens its details; hidden while the box is unreachable and for devices still being set up). A healthy house shows nothing there. Then **Scènes** (every scene as a pill, see Scenes; only when the house has scenes), then **Favorieten** and **Staat nu aan** as two plain sections, no switch: Home shows the house, it is not a screen you configure. Favorieten shows the devices marked "Op Home tonen" ("Volgorde" beside the heading from two favourites); with none yet, a friendly card in its place (a bulb in a neutral circle, "Je vaste lampen komen hier" and one line on how: hold a lamp and choose "Op Home tonen"). **Staat nu aan** follows only when a lamp or plug is on that is not a favourite (the favourites are already in view); a tile you switch off there stays, showing "Uit", until you leave Home, so it never vanishes under your thumb; while the box is unreachable the section is not shown. Both sections are **grouped per room**, very quietly: the room name in Meta (0.85rem/600, Quiet Slate) above each group, rooms in their set order and "Geen kamer" last. The groups flow in columns as wide as a tile (CSS columns, a group never breaks), so small rooms sit side by side and Home stays low. Then **Temperatuur**: every thermostat, always shown. After a tap, a lamp or plug tile shows intent until the box confirms: "Aan…" or "Uit…" in the quiet color, with only a trace of the glow, which then swells up to full.

**No house yet:** an account without a house sees one quiet line on Home, Kamers and Scènes ("Er is nog geen huis aan je account gekoppeld. Zodra je Sandhovius-box aan je account gekoppeld is, verschijnt je huis hier.") with a primary "Box toevoegen" that opens the linking sheet (see Components). With an invitation waiting, the invitation cards take the place of that line, and "Box toevoegen" stays under them as a secondary pill.

**First run:** while a house has no devices, Home and Kamers show one panel in place of the sections: the four device types as unlit icon circles, "Voeg je eerste apparaat toe", and a full-width "Apparaat toevoegen" in thumb reach. Nothing glows, because nothing is on yet. As long as Home has no favourites, a new lamp, plug or sensor is added as a favourite, so the first device appears on Home and can be switched with one tap.

**Kamers:** on a phone, a horizontally scrolling row of filled room pills (no visible scrollbar; the edge fades where more pills are hidden; the active pill scrolls into view), then "N apparaten" with the **room switch** on the right ("2 van 3 aan" beside it), then that room's bento. From 900px it is master-detail, like Home's side column: a 15–20rem **rooms panel** on the left lists every room as a row (an icon circle, the name, the state in words: "Alles uit", "2 van 3 aan", "Alles aan", "Niet bereikbaar", "Nog leeg"), a quiet chevron that says the row opens (Electric Blue text on the selected row, nudging 2px on hover) and its room switch; a tap on the row shows that room beside it (the room name as a headline, "N apparaten" as meta, then the bento). The selected row sits on Inset with its name in Electric Blue text. The row's icon is a bulb that turns lamp amber when a lamp in the room is on (power blue for a plug only), with no glow: the tiles carry the light. The **room switch** controls the lamps and plugs the box can switch (online and set up): on when any of them is on; a tap turns those off, or, when none is on, turns all on, with an undo toast like Alles uit. It is device state, so Signal Green; disabled while the box is unreachable. Rooms with only sensors have no switch.

**Opties:** stacked panels (max 40rem): Huis (with more than one house: which house the app shows; then the row that opens house and rooms; then "Box toevoegen"), Huisgenoten, Weergave (Licht / Donker / Automatisch), Account (who is logged in, Taal van e-mails, Wachtwoord wijzigen, Uitloggen).

**Home on wide screens:** from 900px, a side column of 15–20rem on the left with the **weather card** (not sticky; without weather there is no side column) and the rest beside it. Once that area is at least 44rem wide it becomes two columns of its own: the devices in the middle, and a 19rem column on the right with the thermostat and the scenes under it (grid areas, so the phone keeps its order: scenes, devices, thermostat). The goal is a Home that fits a laptop screen without scrolling (checked at 1366×768, 1440×900 and 1920×1080): the page head is tighter from 768px, the space under the content only clears the one-row navigation (6rem), and below 820px of height the weather card drops its hour strip. With more than one house, the choice of house is in Opties → Huis.

**Device tiles** are small and lie flat: the icon on the left, the name and the state beside it, nothing else. Everything else about a device is in the detail sheet.

**Device grid:** fluid columns of at least 10.5rem, 12rem from 900px so a name like "Handdoekdroger" stays whole next to its icon (`repeat(auto-fill, minmax(min(var(--tile-min), 100%), 1fr))`), with 0.75rem gaps, which gives two columns on a phone. Tiles are 4.75rem tall. Thermostats get their own list (panels of at least 18rem) above the tiles, so a tall panel never makes a row of small tiles uneven. At 200% text the grid falls back to one full-width column.

**Large text (up to 200%):** nothing may overlap or spill, and names break at word boundaries (`overflow-wrap: break-word` with `hyphens: auto`; only e-mail addresses may break anywhere). Container queries in rem only fire when the text is large relative to the space:
- The page head wraps, so the action drops below the title.
- The dial's text scales with the dial (`cqi`), not only with the font size.
- Below 16rem the thermostat puts the dial above − and +.
- The navigation labels are capped at a third of the bar (`min(0.85rem, 4.2cqi)`).
- The house name is capped at `13cqi` so a street name stays whole.
- In Opties the decorative icon gives way below 18rem.

Icon circles grow moderately with the text (`clamp(44px, 2.75rem, 64px)`, a tile icon `clamp(44px, 3rem, 64px)`), and the symbol scales with its circle.

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
- **Login** (the house picture): in the dark theme, a night-colored panel of dark windows, one of which is lit with warm lamp light (the same radial glow as a lamp tile), while a second lamp walks through the house. It is a picture of your home with one lamp on, the image of the app icon; nothing else on the login glows. In the light theme it is the same house by day: a white panel with sky-blue glass and no lamps (lamps don't read in daylight). On load the blinds go all the way up, window by window, once. Logging in floods the windows with pale sunlight instead of lamp light.

### Named Rules
**The Real Light Rule.** Only something that is actually live may glow: a lamp that is on (warm, on its tile), a plug that is on (power blue) and the thermostat while it heats (Electric Blue). Sensors, buttons and panels never glow. A glow that stands for anything other than live energy turns the room into a neon console.

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
- **Touch:** every button compresses slightly on press (`scale(0.98)`, none with reduced motion). Hover styles only apply under `@media (hover: hover)`, so a tapped button never stays "hovered" on a phone, and there is no gray tap flash.

### Device tile (signature component)
The heart of the system, now small: a 28px panel at least 10.5rem wide (12rem on wide screens) and 4.75rem tall, lying flat. The whole tile is one invisible action button (toggle for lamps and plugs, open details for sensors and for a device whose setup failed).
- **Content:** the device icon in a 3rem Inset circle on the left, then the name (0.95rem/600, at most two lines, breaking only between words) and the state (1.25rem/600, the loudest text: "Aan", "Uit", "21,5°", "Beweging"). No caption, no Details chip, no battery badge: the room is the group label on Home, the rest is in the detail sheet and Let op.
- **Light / switch:** a lamp that is on lights up: the warm **tile glow** swells out from behind the icon (centered on it) and the bulb symbol turns amber; a plug does the same in power blue. "Aan" is primary text; "Uit" Quiet Slate. The button carries `aria-pressed`. A dimmable lamp says its level in the state ("Aan · 60%"), and the glow is the lamp's real light: the colour it is set to (a white lamp's colour temperature, mapped to a warm-to-cool white) and its strength follows the brightness. The bulb symbol takes that colour too; when the colour is too light or too dark for 3:1 against the icon circle it falls back to the amber `lamp-warm` icon colour, so the symbol stays readable. A lamp that cannot dim or colour behaves as before. It is still only drawn for a lamp that is on (Real Light Rule).
- **Sensor:** the reading as the state, the temperature in the cold→hot scale; offline it keeps the last reading with ", offline" after it.
- **Quiet states:** "Offline" / "Niet bereikbaar", "Wordt klaargezet" (with a small spinner, dashed border) and "Niet klaargezet" at 0.95rem/500 in Quiet Slate. Offline fades only the icon.
- **Details:** a 500ms long-press, a right-click or the context-menu key opens the **detail sheet**; a tap does so for a sensor and a failed setup. The sheet starts with how the device is now (a sensor's readings, or a "Stand" row), or, when setup failed, an Amber Notice "Het klaarzetten is niet gelukt." with **Opnieuw proberen**. Then the **Op Home tonen** switch, name and room, and delete with an inline confirmation. Everything saves itself; a quiet "Opgeslagen" confirms each save for 2s.

For a lamp that can dim or colour, the sheet carries the **light controls** under "Stand": a **Helderheid** slider with its percentage; for a lamp with both white and colour a two-way bar **Wit / Kleur**; for white, a **Wit** slider from warm to cool; for colour, six round swatches and a **Meer kleuren** button that opens the native colour picker. A control only appears for what the lamp can do (a lamp that only dims gets only Helderheid). Changes are sent while dragging, at most one every 400ms, and the last value is sent on release. On a lamp that is off, the brightness reads "Uit" and no swatch is selected; moving a slider or choosing a swatch turns it on with that value, while the **Wit / Kleur** bar only switches the view and never sends a command. The bar starts on the lamp's current mode (white when it is off and can do white). A lamp that is unavailable or unknown shows no light controls. For about a second after you move a control, incoming state is ignored, so the slider doesn't jump back to an older echo. No Save button: it saves itself like the rest of the sheet.
- **States:** tap compresses the tile (`scale(0.98)`), hover darkens the edge, focus shows a 2px Electric Blue outline with a 3px offset. Long-press must not trigger text selection or the iOS callout.

### Thermostat
A compact panel (at least 18rem wide): the name (itself the button to the details; no gear icon, buttons in the app never carry a gear), then a 270° **dial** (open at the bottom, up to 10rem) with the target as the value arc and a knob, a dot for the current temperature, and inside it the target (its text scales with the dial) and "Nu 21,0°". The two 52px round −/+ steps (0.5°) sit left and right of the dial. Below, one **Verwarming** row on Inset Mist: the word with the status under it ("Verwarmt" in blue, "Op temperatuur", "Verwarming uit", or offline) and a switch (device state, so Signal Green when on). With heating off: gray arc, no glow, −/+ disabled. Taps on −/+ are batched: one `set_temperature` command 800ms after the last tap, flushed if the panel unmounts. Screen readers hear the target once, when it settles. A tap on the name opens the details; a tap elsewhere on the panel does nothing; right-click opens the details, like a tile.

### Home line
The line under the greeting, kept quiet (1.05rem/500, Quiet Slate, a status for screen readers): **one sentence about the house** in plain words, "2 lampen aan, binnen 20,5°", "3 lampen en 1 stopcontact aan", "Alles is uit" (the temperature from the thermostat, else a temperature sensor), then the weather now, "Buiten half bewolkt, 26°". While the box is unreachable the house sentence is left out; stale weather is left out too (the card on wide screens says how old it is). Home has no house panel and no house name: the greeting is the welcome, and the warmth comes from the warm background, not from a glow.

### Weather
Filler, not information about the house: the box fetches the forecast from Home Assistant (Met.no) every 30 minutes and stores it on the house (`houses.weather`, `weather_updated`). It never glows (the sun is not a light that is on in the house), uses no state colors, and uses whole degrees ("26°"), because a forecast is not a measurement; sensors keep their decimal.
- **Phone (below 900px):** only the weather now, in the Home line under the greeting ("Buiten half bewolkt, 26°").
- **Wide (900px and up):** a **weather card** in the side column on the left. Now: a 3rem line icon, the temperature at State size and the condition. Then the coming 12 hours as a scrolling strip on Inset (time, icon, temperature; edge fade like the room pills), then 5 days as aligned rows (subgrid): name, icon, low, a thin bar showing where the day falls on the week's range (neutral Quiet Slate on Inset, never colored), high. At large text the bar gives way.
- **Honest about age:** "Met.no, bijgewerkt om 16:05" at the bottom. After 2 hours without an update (the box has no internet), that becomes an Amber Notice line, "Niet bijgewerkt sinds 14:05. Heeft je Sandhovius-box internet?", and the last-known weather stays. Hours that have passed drop out.

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
In Opties → Huis, under the house row: healthy, a quiet line with a green check, "Verbonden met je huis". On Home, in the notices panel at the top, only the notices below. Phone ↔ Sandhovius lost: an Amber Notice, "Geen verbinding met Sandhovius…". Box silent for 90s (three missed 30s heartbeats on `houses.last_seen`) or stopped: an Amber Notice, "Je Sandhovius-box reageert niet sinds 14:02…". No box linked (unlinked on purpose, `claimed_at` empty): an Amber Notice that says so, "Er is geen box aan dit huis gekoppeld." with the last-known state, never "reageert niet", because nothing is broken. While either notice shows, tiles show last-known state and cannot be toggled. On reconnect everything is re-fetched.

### Toasts
Fixed dark ink snackbars with white text, 18px radius, above the navigation on phones and at the top right on wide screens. They are **not** confirmations of taps (the tile is the confirmation). They appear only when a command is slow ("… reageert nog niet. Even geduld…" after 4s) or fails, and for the few actions that can be undone. They hold for 3.5s (errors 6s, dismissible, in a separate `role="alert"` region). Errors turn toast-error red.

A toast can carry one underlined action, **Ongedaan maken**, and then holds 6s. It follows Alles uit (the same set turns back on), switching the heating off, and deleting a device or a room. A delete hides the item at once and only really deletes after those 6s, so undo simply cancels it; closing the app within that window keeps the item, which is the safe side.

### Opties
Stacked panels with a quiet heading each. **Huis**: with more than one house, first the houses as rows (radio buttons underneath, the chosen one with a blue 2px border and a check, remembered per device); then one large row (icon, house name, "3 kamers. Naam en kamers wijzigen") that opens the house-and-rooms sheet, where rooms have ↑/↓ buttons to set their order (the room pills follow it). **Weergave** is a three-way bar, Licht / Donker / Automatisch (radio buttons under a pill bar on Inset Mist, the choice Electric Blue; stacked at large text); Automatisch follows the phone, also when it switches while the app is open. Under the house row a secondary pill **"Box toevoegen"** opens the linking sheet; the house-and-rooms sheet ends with **"Box ontkoppelen"** (only for a house with a linked box), confirmed inline: "Box ontkoppelen? Je huis en instellingen blijven bewaard. Je kunt later een box koppelen." **Account** has three groups with the same space between them (1.25rem): who is logged in ("Ingelogd als" in Quiet Slate, the address in Ink at 600), **Taal van e-mails** as a two-way bar (Nederlands / English, same pill bar as Weergave) with the hint "Voor de mails die je van Sandhovius krijgt. De app zelf blijft Nederlands.", then "Wachtwoord wijzigen" and "Uitloggen" as secondary pills. **Wachtwoord wijzigen** is a sheet in two groups split by a divider: the current password, then the new one twice. Every password field has an eye button (44px, inside the field on the right, `aria-pressed`, "Wachtwoord tonen") to show what you typed. Under the new password the requirements follow as you type, "Minstens 8 tekens" and "Twee keer hetzelfde": an empty ring and Quiet Slate text, or a check on Inset and Ink text when met (never green: this is not device state). Afterwards the sheet itself confirms, a check in an Inset circle, "Je wachtwoord is gewijzigd." and that other devices log in again, with a primary "Klaar"; no toast. Pending invitation rows put "Intrekken" flush on the right edge, in line with a member row's chevron.

### Huisgenoten
A panel in Opties under Huis. Every member is a row: the name (or e-mail) at 1.05rem/600 and, under it, the role in words ("Beheerder", "Huisgenoot", with ", jij" on your own row). Pending invitations follow as rows of their own: the address and "Uitgenodigd als huisgenoot, verloopt over 5 dagen" ("verloopt vandaag", "verloopt morgen", "verlopen"). Roles are words, never colours or badges.
- **Beheerder:** member rows are buttons with a quiet chevron that open the **member sheet** (the role as the same two-way bar as Weergave, **Huisgenoot / Beheerder**, saving itself on change; then "Uit het huis verwijderen", or "Huis verlaten" on your own row, as danger text with an inline confirmation). Invitation rows carry a plain "Intrekken". Under the list a secondary pill **"Iemand uitnodigen"** opens the **invite sheet**: E-mailadres, the role bar (Huisgenoot by default) with one line on what that role may do, and a primary "Uitnodiging versturen"; afterwards a toast "Uitnodiging verstuurd naar …".
- **Huisgenoot:** the list is read-only (housemates do not see pending invitations), with "Huis verlaten" as danger text, confirmed inline: "Huis verlaten? Je verliest de toegang tot Thuis."
- Removed by someone else: the app notices at the first refused action or when you come back to it after 30 s, says so calmly in a toast ("Je hebt geen toegang meer tot Thuis.") and moves on to the next house or the empty screen. Leaving yourself gives no toast.
- Errors from the server are shown as they come, in Dutch ("Er moet minstens één beheerder blijven", "Al lid van dit huis").
- Only a beheerder sees the house name field and the box block in the house sheet (a housemate's sheet is "Kamers wijzigen"), and only a beheerder's houses are offered as "Vervangt de box van …".

**Invitation card.** An invitation for you is a plain panel at the top of Home (above the dashboard) and on the empty screen: "Test nodigt je uit voor Thuis" (1.2rem/600), "Als huisgenoot, verloopt over 7 dagen." as meta, then a primary **Accepteren** and a secondary **Weigeren**. Accepting opens Home of that house. An expired one says "Deze uitnodiging is verlopen" with only **Weghalen**. It never glows: nothing is on yet. The link in the mail, `/uitnodiging`, simply opens the app; the invitation belongs to the e-mail address, not to the link.

### Scenes
The Scènes tab is the same bento as devices. A **scene tile** has the scenes icon in a neutral circle, the name (1.2rem, 600), and what it touches in words ("Leeslamp, Staande lamp en nog 2"), with "Wijzigen" at the bottom. A tap runs it on the box: the tile says "Wordt uitgevoerd" with a spinner and an Electric Blue icon circle, then "Klaar" with a check for 2s. It never glows: a scene is an instruction, not a light that is on. Failure is a toast that points to Let op. The last cell is a dashed **Nieuwe scène** tile; with no scenes, an intro panel with "Scène maken".

**On Home** every scene is a **scene pill** at the top (above Favorieten), in order: 52px tall, Panel White (Night Inset on black), a small icon circle and the name. A tap runs it; only the circle changes (Electric Blue with a spinner, then a check for 2s), so the pill never changes width. It scrolls sideways with the room pills' edge fade (on wide screens, under the thermostat, it wraps instead) and cannot run at 50% while the box is unreachable. A 500ms long-press, a right-click or the context-menu key opens the scene sheet to edit it, as on a device tile; that also works while the box is unreachable.

The **scene sheet** has a name and, per lamp, plug and thermostat, a three-way bar **Niet / Aan / Uit**; a thermostat set to Aan gets a −/+ temperature (0.5° steps). A lamp that can dim or colour gets a fourth choice, **Zoals nu**: on, with the brightness and colour the lamp has at that moment (stored in the step). It is offered only while such a lamp is on right now, or when the scene already holds a stored step for that lamp. The scene tile describes it in words: "Leeslamp (40%, warm wit)", "(40%, koel wit)" for a cooler white, or "(40%, kleur)" for any colour. It saves with one "Scène maken" / "Opslaan" button, unlike the detail sheet, because you compose several choices at once. Delete sits at the bottom with an inline confirmation and the usual undo toast.

**Vanzelf uitvoeren.** Below the devices, the scene sheet has one row per time on Inset Mist: a time field, a `switch-accent` (on/off), seven round day buttons (ma … zo, 44px, `aria-pressed`, Electric Blue when on), and the days in words ("Werkdagen", "Weekend", "Elke dag", "Maandag, woensdag en vrijdag") with a delete button. "Tijd toevoegen" adds a row at the next whole hour, every day. If a time did not run well last time, an Amber Notice line says when and points to Let op. Under the scene tiles, the Scènes tab has a **Vanzelf uitvoeren** section: every schedule of the house as a flat card (fluid columns of at least 18rem), sorted by time. A card has a clock icon circle, the time as its loudest text (1.5rem/600, Quiet Slate while off), the scene name, the days in words, an Amber Notice line "De laatste keer niet gelukt" when the last run failed, and a `switch-accent` on the right that switches the schedule on or off at once (reverted with an error toast if saving fails). A tap on the card opens the scene sheet. With no schedules, a hint says how to add one. On the scene tile, under the name, it says when the scene runs by itself ("Werkdagen om 07:00", or with several times "Om 07:00 en 22:00"). A schedule is an instruction, so nothing glows and there is no green.

### Pull to refresh
Only in the installed app (standalone): in a browser tab the phone has its own. At the top of the page, with no sheet open, a vertical pull brings down a 40px round panel (white in the light theme, Inset with a hairline in the dark) that follows the finger with rubber-band resistance (never further than 110px). Its arrow turns with the pull; at 60px it has turned to point up and is Electric Blue (with a short vibration on Android): let go now. On release it settles at 56px (250ms, `--ease-out`), spins while everything is fetched again (at least 0.6s, so it never just flashes), shows a check for 0.45s and slides back up. Released too early, it simply slides back. The transform is set directly while dragging (no transition, no re-render per move). Sideways drags (room pills, hour strip) are left alone. With reduced motion it follows the finger but fades instead of scaling. Screen readers hear "Bijwerken…" and "Bijgewerkt". Test it in a tab with `localStorage['sandhovius-pull-refresh'] = 'on'`.

### Ordering and recovery
Order is set with ↑/↓ icon buttons, never by dragging: one thumb, a keyboard and a screen reader all work, and nothing has to be discovered. **Favorieten** has a quiet "Volgorde" text button beside its heading (from two favourites) that opens a sheet with the list; a new favourite goes last. A device whose setup failed says "Niet klaargezet" on its tile; a tap opens the sheet with **Opnieuw proberen**, and the box retries.

### Login and the installed app
The login is the first bento: a **house picture** (your house at night: six dark windows of different sizes on a night wall, one lit warm; always night-colored, also in the light theme, because it is a picture and not a surface) and the **login panel** ("Sandhovius" at Display size, "Log in om je huis te bedienen.", the form). On a phone the house fills the top and the form sits at the bottom in thumb reach; from 56rem they sit side by side, the form aligned to the bottom of the house. On entry the windows rise in one by one (60ms apart), then the panel, then the lamp comes on over 1.4s like a lamp tile; with reduced motion only the light fades in (0.3s). After a confirmed login every window lights up, one after the other (150ms apart), then the house and the form fade out together and Home comes in (2.1s in all; with reduced motion 0.3s). The house does not travel into Home: Home has no house panel. The login panel has a quiet "Wachtwoord vergeten?" under the button, with "Account aanmaken" right under it as one pair (no extra gap between them); both are plain Quiet Slate text buttons, because blue belongs to "Inloggen" (The One Voice Rule). It swaps to one field and "Stuur resetlink"; the confirmation is the same whether or not the address has an account. Under the button sits a quiet **"Account aanmaken"** link that swaps the form in place (the lede becomes "Maak een account aan."): e-mail, password twice (at least 8 characters) and **Taal van e-mails** (Nederlands / English, preselected from the browser). After creating, the form gives way to the verify notice: "Kijk in je mail", the address it went to, and a secondary "Stuur de mail opnieuw". The mail links lead to two small standalone pages in the login style, **/bevestig** (confirms, then on to the app; an old or used link says "Deze link werkt niet meer.") and **/wachtwoord** ("Kies een nieuw wachtwoord.", the new password twice with the same eye buttons and live requirements as Wachtwoord wijzigen; afterwards "Je wachtwoord is gewijzigd." and on to the login). These pages are one login card of a fixed width (26rem, full width on a phone), centered on every screen. The app is installable: name Sandhovius, a placeholder icon (a house with one lit window on black, not a logo), standalone display, and a status bar that follows the phone's theme.

### Linking a box
A sheet opened by "Box toevoegen", in four steps that replace each other in place:
1. **Not verified yet:** the verify notice (see Login) with "Stuur de mail opnieuw"; the sheet carries on by itself once the address is confirmed, also when the code came in through a `/koppel` link.
2. **Code:** the camera view in a 28px-rounded frame on black ("Richt de camera op de QR-code op het blad bij je box.") with "Code overtikken" under it; or the two fields **Serienummer** and **Code** (case, spaces and dashes don't matter). Without a camera, without permission or on a connection that isn't secure the sheet opens on the fields with one plain line why ("De camera werkt alleen op een beveiligde verbinding. Tik de code over van het blad bij je box."), and "Scan de QR-code" is hidden.
3. **"Waar hoort deze box?"**: radio rows, **Nieuw huis** (with "Naam van je huis", default Thuis) or **Vervangt de box van …** for each of your houses ("Je kamers, apparaten en scènes blijven bewaard; de nieuwe box neemt het over.").
4. **Waiting:** "Wachten tot je box zich meldt…" with a small pulsing dot (no glow: nothing is live yet; static under reduced motion) and "Dit kan een paar minuten duren." (a box that is on reports within seconds; the minutes are for one still starting up); as soon as the box sends its first heartbeat the sheet closes and Home of that house opens.

Errors are plain Dutch text above the button ("Deze code klopt niet", "Deze box is al gekoppeld", "Bevestig eerst je e-mailadres", "Te veel pogingen, probeer het over een minuut opnieuw").

## Do's and Don'ts

### Do:
- **Do** make every control reachable and obvious in one tap from its room (and from Home once it is a favourite): toggling, reading and adjusting never require a deeper screen.
- **Do** keep primary navigation at the bottom, in thumb reach, with a word under every icon (the + is the one action in the bar and is named for screen readers).
- **Do** size a tile by the control it needs: small for a lamp, large for the thermostat. Let the bento decide the columns.
- **Do** keep touch targets at 44px or more (48px for room pills, 52px for primary actions and thermostat steps, 56px for navigation items).
- **Do** pair every state color with a word or an icon ("Aan", "Uit", "Offline", a battery %).
- **Do** design every screen in both themes: black with night panels, and mist with white panels. The dark-mode tokens are part of the spec, not an afterthought.
- **Do** keep motion confirming and brief: 0.15–0.2s for state, 0.35s for the dial moving to a new target, 1.2–1.4s for a lamp's or plug's glow swelling up and 1.8s for it dying away, 0.6s for the dial's glow fading in, 0.25s for a sheet sliding up, 0.3s for a tab coming in (fade plus 12px from the side it sits on in the navigation; the old tab leaves at once), 0.25s for the pull-to-refresh circle settling or sliding back. Exits are faster than entrances.
- **Do** give every animation a `prefers-reduced-motion` path that removes movement (scaling, sliding, growing rings, the dial sweep, the lamp's swell, the loading breath) but keeps the state change visible.
- **Do** keep information-bearing text at 4.5:1 or better in both themes, and controls or icons at 3:1. Where a brand color fails as text (Signal Green on white), use its deeper step as text and keep the bright color for fills.

### Don't:
- **Don't** make it look like a Home Assistant dashboard: no dense entity lists, no tiny tiles, no power-user toggle walls.
- **Don't** make it look like a generic SaaS admin: no sidebars, data tables or KPI tiles.
- **Don't** make it a neon console: nothing glows unless it is live (a lit lamp, a plug that is on, a heating thermostat); no glassmorphism, no neon gradients, no sci-fi decoration.
- **Don't** introduce a second accent color; Electric Blue is the only interactive voice.
- **Don't** show tiles for things the house can't do or data it doesn't have (music, energy, brightness) just because an inspiration board has them. Weather is the one exception, as quiet filler that always says how old it is (see Weather).
- **Don't** use uppercase labels, letter-spaced stamps or middle-dot meta strings.
- **Don't** show a toast for every tap, or make a tap on a thermostat change the heating.
- **Don't** hide offline or stale devices, or signal them with color alone.
