# AEI Quest WebXR Lab

Privacy-first WebXR experiments for **Meta Quest 2**, developed on **MBP M1** and run in **Meta Quest Browser** without Meta Developer Mode or Persona/ID verification.

## Current branch

`control-demo-01-xr-osc-fader`

Base checkpoint: `ui-demo-01-spatial-panel` (confirmed controller ray + trigger/select and hand fingertip + pinch input).

Do not merge this branch until the Quest 2 end-to-end test is confirmed.

## Control Demo 01 — XR OSC Fader

Goal:

`Quest Browser / WebXR -> secure WebSocket -> MBP M1 bridge -> OSC UDP -> test receiver / AV application`

Control:

- world-locked 3D panel
- one vertical fader
- normalized value `0.0 ... 1.0`
- controller ray + trigger drag
- direct hand fingertip + pinch drag
- live numeric value
- OSC address `/aei/fader/1`
- OSC argument: float
- WebSocket ACK used for simple round-trip latency display
- control traffic limited to about 30 Hz for the first test

## First end-to-end test on MBP M1

Checkout this branch and build the WebXR app:

```bash
git fetch origin
git switch control-demo-01-xr-osc-fader
npm install
npm run build
```

Install the bridge dependencies:

```bash
cd bridge
npm install
```

Find the Mac LAN IPv4 address. For Wi-Fi this is often:

```bash
ipconfig getifaddr en0
```

If that returns nothing, inspect interfaces with:

```bash
ifconfig | grep "inet "
```

Create a short-lived local TLS certificate using the actual LAN IP:

```bash
zsh gen-cert.sh 192.168.X.X
```

Start the OSC test receiver in one terminal:

```bash
cd bridge
npm run receiver
```

Start the HTTPS/WebSocket/OSC bridge in another terminal:

```bash
cd bridge
npm start
```

The bridge prints one or more URLs. Use the LAN interface that the Quest 2 can reach, for example:

```text
https://192.168.X.X:8443
```

Open that HTTPS URL in Quest Browser. The local certificate is self-signed, so Quest Browser may show a certificate warning; accept it for this local test if the displayed IP matches the Mac. The same origin serves the built XR UI and `wss://` endpoint, avoiding HTTPS -> insecure `ws://` mixed-content blocking.

On the landing page enter:

```text
wss://192.168.X.X:8443
```

Press **CONNECT BRIDGE**, then **ENTER VR** or **ENTER MR / AR**.

Expected result while moving the fader:

Bridge terminal:

```text
[OSC] /aei/fader/1 0.537
```

OSC receiver terminal:

```text
... /aei/fader/1  0.537
```

Quest panel:

- numeric value follows the fader
- `WS CONNECTED`
- round-trip latency appears when ACK packets return

## Why local HTTPS is used for the first OSC test

GitHub Pages serves the WebXR page over HTTPS. Modern browsers do not allow an HTTPS page to open an insecure `ws://` WebSocket, so a LAN bridge must use `wss://`. This branch therefore includes a local HTTPS + WSS bridge that can also serve the built XR app from the Mac. This keeps the first end-to-end traffic on the LAN and avoids depending on Meta Developer Mode.

GitHub Pages build for this branch currently succeeds, but deployment is blocked by the repository's existing Pages environment/branch policy. The local HTTPS path is therefore the test deployment for Control Demo 01; do not change old checkpoints just to bypass that protection.

## Project sequence

1. **Control Demo 01 — XR OSC Fader** (current; awaiting Quest 2 validation)
2. Lock working checkpoint after user validation
3. Expand OSC controls only after the fader path is proven
4. MIDI after OSC
5. DMX / Art-Net / sACN later

No Meta SDK, analytics, or custom telemetry is included.
