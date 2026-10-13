# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: the homeowner who bought the Sandhovius box. They use the PWA every day for quick control (switching a light, checking a sensor, adjusting the thermostat), usually for a few seconds on a phone. They are also the person who sets up and manages the home: houses, rooms and adding devices. They are not technical and are not expected to know Home Assistant, Zigbee or MQTT.

Secondary users: other people in the household, who mostly just control devices.

Some users are older or have reduced sight, so legibility and ease of operation are core requirements.

## Product Purpose

Sandhovius is a plug-and-play smart-home appliance: an Intel N100 mini PC running a preconfigured local stack (Home Assistant, Mosquitto, Zigbee2MQTT and a Go agent), plus a PWA for control from anywhere. Success means a non-technical owner controls and manages their home with confidence. They should never need to understand the stack underneath, and it should keep working when the internet is down.

## Positioning

- **Local-first:** automations and control run on the box in the home and keep working without internet. The cloud is only there for convenient remote access.
- **Privacy:** sensor and device data stay in the home. There are no cloud logs.
- **Zero setup:** you plug in the box, create an account in the app and scan the QR code from the manual to link the box to your home. There is no Home Assistant configuration to do.
- **Calm, simple control:** Sandhovius deliberately offers fewer options than Home Assistant and is built for a household, not for power users.

## Operating Context

- Mostly used on a phone, in short one-handed sessions around the house. Remote use happens through an encrypted mesh tunnel (Headscale) with no exposed ports.
- Device state updates in real time (PocketBase realtime). A change made elsewhere, for example directly in Home Assistant, shows up in the app without a reload.
- Devices are grouped by house and room. Current device types are lights, climate/thermostats (target temperature) and sensors (temperature, motion, battery).

## Capabilities and Constraints

- Current features: create an account (with e-mail confirmation) and log in, password reset, linking a box by QR code or typed code (new house or replacing the box of an existing one), unlinking a box, multiple houses per account, rooms, favourites, small device tiles (lamp, plug, thermostat, sensor) with a detail sheet, adding devices, scenes and schedules, weather, "Alles uit", pull to refresh, toasts, and Opties with theme (Licht / Donker / Automatisch) and the language of account e-mails.
- Light and dark themes are both product requirements.
- The app and the account e-mails come in Dutch and English, one choice per account (Opties → Taal; before login the browser language). Names people type (houses, rooms, devices, scenes) are never translated. Dutch is the reference copy; English is British. Design: `docs/superpowers/specs/2026-10-13-app-language-design.md` (not built yet; until then the UI is Dutch only).
- The product is in development: Fase 2 (local stack, PWA, realtime commands, per-box identity, self-service linking) is done; Fase 3 (remote access via Headscale, PocketBase on a server, HTTPS, a real mail provider) is next. Until then everything runs locally. There is no webshop or marketing surface in this repo.

## Brand Commitments

The only fixed brand element is the name "Sandhovius". Owner: Colin Sanders. There is **no logo, wordmark or brand palette yet**, and future work must not invent or present any as established.

## Evidence on Hand

There are no testimonials, customer counts, benchmarks, pricing or press. Do not fabricate any. Technical documentation for the backend is in `backend_explained.md`.

## Product Principles

1. **Glanceable and quick.** The common action (seeing state, toggling, adjusting) takes seconds and needs no navigation.
2. **Hide the machinery.** Never make the user think about Home Assistant, Zigbee, MQTT or the cloud. Explain outages in household terms.
3. **Trust through honesty.** Show real connection and device state, including offline or stale state, clearly and calmly. Never pretend something succeeded.
4. **Less, on purpose.** When a capability would add complexity for the owner, leave it out. Power-user depth is not the goal.
5. **Local and private by default.** Nothing in the product should suggest that home data leaves the home.

## Accessibility & Inclusion

Some users are older or have reduced sight. Use large touch targets, strong contrast and legible type sizes in both the light and the dark theme. State must never depend on color alone.
