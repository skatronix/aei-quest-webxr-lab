# AEI Moverio Lab — Milestone 0.2

Status: VERIFIED ON REAL HARDWARE

Verified chain:

```
MacBook Pro controller UI
        |
     WebSocket
        |
Samsung A32 hotspot + Termux server
        |
     WebSocket
        |
Epson Moverio BT-350 browser client
```

Verified in practice:
- Samsung A32 can host the local HTTP/WebSocket bridge.
- MacBook Pro can use the controller UI through the A32 hotspot.
- Epson Moverio BT-350 can load the visualization through the same hotspot.
- BT-350 reacts in real time to controller changes.
- NETWORK / ORBITAL / GRID / HYBRID state path is operational.
- Color, movement, density, freeze/reset state path is operational.

This branch is retained as the stable phone-first WebSocket milestone.

Next development continues in:
`moverio-bt350-sensor-field-02`
