# Orbital Node Test 01

Quest 2 WebXR test derived from the supplied circular node reference.

## Visual / motion model

- Layered 3D spherical nodes with a visible black origin.
- Reference palette: blue, red, yellow, cream, white and black.
- Each sphere spins around its own tilted local axis; asymmetric surface markers make the spin visible.
- Child nodes orbit the exact parent origin in tilted 3D planes.
- Every parent-child relationship has a visible origin-to-origin connector.
- Hierarchy: central node -> six primary nodes -> 2–4 satellites each -> optional grandchildren.
- Orbit rings remain fixed in their own plane while child rotors move around them.
- The whole sculpture turns very slowly to make spatial depth easier to read.

## XR modes

- VR: light neutral background close to the supplied 2D reference.
- MR / AR: transparent background so the hierarchy floats in passthrough.
- Hand-tracking remains requested as an optional WebXR feature, but this first pass has no hand physics yet.

## Quest acceptance test

1. The hierarchy reads clearly as a 3D interpretation of the supplied circular system.
2. Parent and child origins remain visibly connected during orbit motion.
3. Spheres visibly spin independently from their orbital motion.
4. Multiple orbit planes clearly occupy different 3D orientations.
5. Quest 2 frame rate remains usable in both VR and MR / AR.

## Next iteration

Potential interaction layer: push a branch with the hand, pinch/grab an origin, and detach a child node with a sufficiently fast impact so it becomes a free-floating object.
