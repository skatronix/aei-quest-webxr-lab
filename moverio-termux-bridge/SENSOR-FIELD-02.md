# AEI Moverio Lab 02 — Sensor Field

## Architecture

```
Samsung A32 sensors
        |
 DeviceOrientation
        |
 browser controller UI
        |
   WebSocket
        |
 A32 / Termux state server
        |
   WebSocket
        |
 Epson Moverio BT-350
 Spatial Signal Garden
```

Optional external path:

```
Resolume / Ableton / Pure Data
        |
       OSC
        |
 A32 / Termux osc_bridge.py
        |
   WebSocket
        |
 BT-350
```

## Sensor behavior

The phone does not attempt world tracking.

Orientation is deliberately mapped as a subtle visual-field transform:

- yaw -> horizontal parallax
- pitch -> vertical parallax
- roll -> small field rotation

This avoids pretending that the phone provides spatial anchoring or SLAM.

## Safety / privacy

- Sensors start only after an explicit button press.
- No sensor data is stored.
- No cloud endpoint is used.
- No analytics or telemetry.
- OSC bridge is disabled unless manually launched.
- Services are intended for a trusted local hotspot/LAN only.

## BT-350 optical profile

The BT350 profile keeps:
- black background
- sparse geometry
- brighter cyan signal lines
- larger HUD text
- low scene density
- no post processing
- no WebXR dependency

## Test order

1. Start Termux server.
2. Open controller UI on A32.
3. Open /moverio/ on BT-350.
4. Enable PHONE SENSORS on A32.
5. Rotate A32 slowly left/right.
6. Tilt A32 slowly up/down.
7. Roll A32 a few degrees.
8. Confirm BT-350 field reacts with restrained parallax.
9. Verify freeze/reset still work.
10. Only then test optional OSC bridge.
