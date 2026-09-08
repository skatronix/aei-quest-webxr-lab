# AEI Web Terminal 01 — Quest 2 checkpoint

Confirmed working on 2026-09-08.

## Architecture

Quest 2 Browser → local Wi-Fi/LAN → `ttyd` on MacBook Pro → `zsh` → AEI Quest WebXR repository.

## Working endpoint during the first test

- MacBook LAN address: `192.168.1.113`
- ttyd port used after Basic Auth cache troubleshooting: `7682`
- Working directory: `~/Desktop/Coding/aei-quest-webxr-lab`
- One client maximum.
- Writable terminal.
- Basic Authentication enabled.

## Security boundary

This first checkpoint uses plain HTTP on a trusted local network only. Basic Auth credentials are not encrypted in transit. Do not expose the port to the public internet or use this setup on an untrusted/public Wi-Fi. A later checkpoint can add local HTTPS/TLS.

## Result

The Quest 2 Browser successfully displayed and interacted with the MacBook `zsh` terminal. `pwd` and `git status` were run from inside the headset.
