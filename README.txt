Tiny World V10.0.1 — PERFORMANCE CORE

This is a dedicated optimization release. It intentionally does not add the
next V10 culture/religion expansion yet.

MAIN PERFORMANCE CHANGES

AI / SIMULATION
- Cached food, tree, ore and water targets so workers do not rescan large
  sections of the map every simulation tick.
- Cached danger checks.
- Social AI searches the local settlement rather than every citizen in the world.
- Person/building/settlement data is indexed and reused.
- Rewrote job assignment to avoid the old repeated best-person/best-job search.
- Partner matching is grouped by settlement.
- Emotional updates are distributed across citizens rather than firing all at once.
- Relationships, jobs, village planning, politics, expansion, culture, faith and
  economy updates are intentionally scheduled on different frames.
- Removed duplicate V10 updates from the political update.

MAJOR SPIKE FIX
- Ordinary food/tree regrowth used to set the entire terrain renderer dirty.
- On a large world that could trigger a multi-million-pixel terrain rebuild even
  though terrain had not changed.
- V10.0.1 removes that unnecessary rebuild.

RENDERING
- Adaptive detail based on visible world area and real frame time.
- Large zoomed-out views render fewer decorative samples while keeping the
  underlying world simulation completely intact.
- People, animals and buildings are culled to the visible camera region.
- Static building draw order is cached.
- Atlas/minimap refresh is throttled.
- HUD updates are throttled during simulation.
- Dynamic particle budget.
- Reduced offscreen terrain texture memory, especially for 300×300 and 500×500 worlds.

AUTO PERFORMANCE
- Enabled by default.
- Found under World → Settings.
- It only adjusts decorative rendering density. It does NOT remove citizens,
  simplify AI history, disable wars, delete culture/religion data or change world size.
- It automatically returns toward full detail when frame time improves.

All V10.0 gameplay remains.
