# AEI Moverio Lab — Termux Bridge 01

## Goal

Build the Samsung A32 / Termux side first and use it as the local control and protocol bridge for Epson Moverio BT-350.

Initial architecture:

```
Control UI / OSC source
        |
        v
Samsung A32 / Termux
HTTP + WebSocket server
        |
        v
Wi-Fi LAN
        |
        v
Epson Moverio BT-350
browser / lightweight WebGL client
```

Later:

```
Resolume / Ableton / Pure Data
        |
       OSC
        |
Samsung A32 / Termux
        |
   WebSocket
        |
BT-350 wearable visualization
```

## Milestone 0.1 — Phone first

The first milestone does NOT require the BT-350.

Samsung A32 should run a local server that provides:

- WebSocket endpoint for visualization control
- lightweight browser control UI
- current shared state
- connection status
- basic protocol for future Moverio client

Controls:

- mode: NETWORK / ORBITAL / GRID / HYBRID
- node density
- connection radius
- movement speed
- color preset
- freeze / resume
- reset

## Privacy / security

- LAN only by default
- bind to a configurable local interface
- no cloud APIs
- no analytics
- no telemetry
- no automatic shell execution
- no root requirement
- no internet exposure
- OSC support will be added only after the local WebSocket path is verified

## Termux requirements

Target device:

- Samsung Galaxy A32 5G
- Android 13
- Termux
- Python 3

Python packages planned for milestone 0.1:

- aiohttp

Do not add unnecessary packages.

## Protocol

WebSocket messages are JSON.

Example state update:

```json
{
  "type": "state",
  "mode": "NETWORK",
  "nodeDensity": 24,
  "connectionRadius": 0.75,
  "movementSpeed": 1.0,
  "color": "cyan",
  "frozen": false
}
```

Client command:

```json
{
  "type": "set",
  "key": "mode",
  "value": "ORBITAL"
}
```

Reset:

```json
{
  "type": "reset"
}
```

## Run

On the Samsung A32 in Termux:

```bash
pkg update
pkg install python
python -m pip install aiohttp
cd moverio-termux-bridge/server
python server.py
```

Then open the phone's browser at:

```
http://127.0.0.1:8080/
```

Other devices on the same trusted Wi-Fi can later use:

```
http://PHONE_LAN_IP:8080/
```

Do not expose port 8080 to the public internet.

## Next

1. Verify server on Samsung A32.
2. Verify control UI locally on the phone.
3. Connect a second browser over trusted LAN.
4. Confirm real-time WebSocket state sync.
5. Test BT-350 browser as WebSocket client.
6. Add lightweight Moverio WebGL visualization.
7. Add optional OSC input into Termux.
8. Map OSC values to shared state.
9. Add authentication / pairing if needed for wider networks.
10. Only after physical BT-350 testing, add the experiment to the public AEI XR Lab launcher.
