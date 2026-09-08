# AEI Quest WebXR Lab

Privacy-first WebXR experiments for **Meta Quest 2**, developed on **Apple Silicon Mac** and run in **Meta Quest Browser**.

## Checkpoint

Quest 2 #01 has been taken into use and basic hardware has been tested. Developer Mode is intentionally **not enabled** because the current Meta developer path requested Persona/admin identity verification. The current development path therefore starts with browser-based WebXR and does not require APK sideloading.

## Demo 01

The first demo tests:

- immersive WebXR support
- headset 6DoF tracking
- Touch input-source detection
- trigger/select events
- WebXR hand-input detection when the browser exposes it
- optional `immersive-ar` / passthrough mode when available
- an in-world diagnostic HUD

No Meta SDK is included. The application contains no analytics or custom telemetry.

## Development

```bash
npm install
npm run dev
```

The Vite development server is useful for desktop iteration. Quest WebXR testing should use an HTTPS origin; the first deployment target is GitHub Pages.

Build locally:

```bash
npm run build
npm run preview
```

## GitHub Pages

A workflow is included in `.github/workflows/pages.yml`.

After creating the repository and pushing `main`, set **Settings → Pages → Source → GitHub Actions** if GitHub has not enabled it automatically. The deployed project-site URL will normally be:

`https://<github-user>.github.io/aei-quest-webxr-lab/`

Open that URL in Meta Quest Browser and press **ENTER VR**. If **ENTER MR / AR** is enabled, test passthrough WebXR as well.

## Planned sequence

1. Demo 01 — WebXR diagnostics
2. Demo 02 — Quest → WebSocket → MBP
3. Demo 03 — WebSocket bridge → OSC / MIDI
4. Processing / Ableton / Unity / MadMapper integration
5. Local-LAN HTTPS deployment so runtime traffic can stay off third-party hosting
6. Re-evaluate native OpenXR / Unity APK development only if the benefit justifies Meta developer verification

See [`docs/QUEST_2_INVENTORY.md`](docs/QUEST_2_INVENTORY.md).
