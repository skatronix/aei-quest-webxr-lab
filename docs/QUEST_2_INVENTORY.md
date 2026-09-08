# AEI XR Inventory — Quest 2 #01

Status checkpoint: 2026-09-08

## Hardware / state

- Device: Meta Quest 2
- Storage class: 64 GB
- Free storage observed: 51.54 GB
- Display: tested OK
- Head tracking: tested OK
- Black-and-white passthrough: tested OK
- Touch controllers: both detected; fresh AA batteries installed
- Hand tracking: tested OK
- Quest Browser: operational
- Wi-Fi: operational
- Meta Horizon pairing: completed during initial setup
- System update status: reported "Up to date" during setup

## Privacy / developer-mode decision

Developer Mode was not enabled. Meta Horizon Developer Dashboard led to Organization/Admin Verification through Persona. The user does not want to submit identity-document or equivalent personal verification data for this experiment.

Current development constraint: **no native APK sideloading / USB-debug development path for now**.

## Selected development path

**MBP M1 → Git/GitHub → HTTPS WebXR → Quest Browser**

The first phase uses standard web technology rather than Meta's native SDK. Runtime/application telemetry is not added by this project.

## Next technical targets

- verify immersive-vr in Quest Browser
- identify whether immersive-ar/passthrough is exposed on this software/browser build
- inspect controller input sources and handedness
- inspect hand-tracking input sources
- add Quest → MBP WebSocket transport
- translate sensor/input data to OSC and MIDI
