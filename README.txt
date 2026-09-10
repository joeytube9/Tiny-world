Tiny World V10.0.2 — FAST BRUSH & TREES

This hotfix targets lag while spawning Trees and other resources.

KEY FIX
Trees, Food, Stone, Iron, Gold, Rain, Drought, Fire and Lightning no longer
invalidate the expensive continuous terrain texture.

Only actual terrain-changing tools rebuild terrain:
Land, Water, Grassland, Forest, Sand, Snow, Mountain and Lava.

TREES
- Trees are now resources placed on Grass or Forest.
- The Trees tool no longer converts Grass cells into Forest biome cells.
- Dense tree artwork is pre-rendered into reusable canvas sprites.
- Pine, broadleaf and forest-clump sprites are reused each frame.
- Cheap whole-sprite sway keeps trees alive without redrawing all vector paths.
- Tree-density calculations no longer scan neighboring cells for every tree.

BRUSH
- Resource brushes stamp at a controlled rate.
- A new stamp also requires meaningful finger movement.
- This prevents a large brush from rewriting the same hundreds of cells many
  times per second while your finger barely moves.
- The final pointer-up stamp is preserved.

All V10.0.1 performance changes remain.
No V10.1 culture/religion expansion has been added yet.
