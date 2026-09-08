# AEI Quest WebXR — Bubble Test 01

Experimental WebXR interaction test for Meta Quest 2 without Developer Mode.

## Goal

Replace the single-cube interaction with a field of lightweight soap bubbles.

- Bubbles float and drift gently.
- Slow hand/controller contact pushes a bubble without breaking it.
- Fast contact or poking pops the bubble.
- Popping uses a short membrane-like expansion/fade rather than instant disappearance.
- Popped bubbles respawn so the field remains populated.
- HUD exposes live tuning data: bubble count, popped count, input speed, contact count and pop threshold.
- Hand tracking uses the index-finger tip pose when WebXR exposes it; controller mode falls back to controller pose.

## Initial tuning

- Bubble count: 30
- Pop speed threshold: 1.35 m/s
- Input contact radius: 0.075 m
- Pop animation: 0.16 s

The threshold is intentionally conservative to reduce false pops from Quest 2 hand-tracking jitter. Tune only after testing real slow pushes and deliberate fast pokes.

## Checkpoint policy

`main` remains the confirmed Demo 01.1 code checkpoint until Bubble Test 01 has been tested on Quest 2 in both VR and MR/AR. Bubble Test 01 lives in branch `bubble-test-01` until accepted.
