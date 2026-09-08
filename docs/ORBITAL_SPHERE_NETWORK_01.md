# Orbital Sphere Network 01

Quest 2 WebXR visual experiment based on the user's circular reference images.

## Visual system
- 3D concentric sphere nodes using blue, red, yellow, cream, white and black.
- Thin black center-to-center links.
- Large root node with nested child and satellite hierarchy.
- White/off-white VR background; MR/AR uses passthrough.

## Motion
- Every sphere node rotates around its own randomly assigned axis.
- Every child branch pivots around the parent node origin.
- Child links rotate with the branch, preserving center-to-center attachment.
- Entire structure turns slowly as a field.
- Hand/controller proximity adds temporary rotational impulse to nearby nodes.

## Quest test criteria
1. Structure must read clearly as a true 3D hierarchy, not a flat diagram.
2. Parent-child links must remain attached at node centers during rotation.
3. Self-spin and orbital movement must be simultaneously visible.
4. MR/AR should allow walking around the structure.
5. Frame rate should remain usable on Quest 2.

Status: implementation ready for first device test; not yet device-confirmed.
