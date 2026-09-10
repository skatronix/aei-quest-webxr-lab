# AEI Quest WebXR — Bubble Test 01.1

Quest 2 tuning pass after Bubble Test 01 was confirmed working on-device.

## Changes

- Lightweight custom soap-film shader with Fresnel rim, subtle iridescent colour bands and highlight.
- Contact now produces temporary non-uniform membrane deformation instead of moving a perfectly rigid sphere.
- Pop detection is directional: only the hand/controller velocity component moving into the bubble membrane is treated as impact.
- Fast tangential swipes should move/deform bubbles without popping as easily as a direct poke.
- HUD adds smoothed FPS and directional impact speed.

## Initial tuning

- Bubble count: 30
- Direct pop impact threshold: 0.95 m/s
- Input radius: 0.075 m
- Pop animation: 0.18 s
- Deformation decay: 6.5 / s

## Quest 2 test checklist

1. MR/AR + hand tracking starts normally.
2. Soap-film edge/rim remains visible against both bright and dark passthrough regions.
3. Slow finger contact visibly deforms and moves the bubble.
4. Fast sideways swipe can move the bubble without frequent false pops.
5. Fast direct poke pops the bubble and increments `popped`.
6. `impact` rises mainly on inward/direct movement.
7. FPS remains acceptably stable with 30 bubbles.
8. Repeat in VR and with Touch controllers.

Do not merge to main until this pass is verified on Quest 2.
