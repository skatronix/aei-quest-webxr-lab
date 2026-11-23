# AEI Air Harp 0.1 — Quest first test

Target: Meta Quest 2 / Quest Browser / WebXR.

Milestone 0.1 is intentionally small:
- five fixed spatial strings
- WebXR immersive-ar and immersive-vr entry
- hand tracking preferred
- index fingertip proximity crossing triggers pluck
- Touch controller position is a fallback
- WebAudio tone per string
- visible vibration and glow response

Not included yet:
- drawing new strings
- string editing/tuning UI
- WebSocket / OSC / MIDI
- Resolume / MadMapper output
- Moverio client
- projection mapping

Suggested branch name:
`air-harp-spatial-01`

Suggested base:
`demo-01.1-spatial-input`

Quest test:
1. Serve over HTTPS.
2. Open in Quest Browser.
3. Enter MR/AR.
4. Enable hand tracking.
5. Move index fingertip through the strings.
6. Confirm sound + vibration/glow.
