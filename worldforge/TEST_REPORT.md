# WORLDFORGE — Test report

Date: 2026-10-08 · Build: `worldforge/` on branch `claude/worldforge-planet-sandbox-nkrjag`

## Test environment

| | |
|---|---|
| Machine | Cloud Linux container, Intel Xeon @ 2.10 GHz, 4 vCPU, no GPU |
| Node | v22.22.0 |
| Browser | Chromium (Playwright 1.56.1), headless, **SwiftShader software WebGL** |
| Viewports | 390×844 portrait and 844×390 landscape, `isMobile`, `hasTouch`, DPR 2 |

**No physical iPhone was available.** Desktop or headless viewport emulation does **not** prove iPhone performance or iOS Safari behaviour. The software WebGL renderer is much slower than any phone GPU, so the frame rates below are not phone frame rates. They show only that the full scene renders and runs without errors. A real-device checklist is at the end of this report.

Commands used:
- `npm test` → 29 automated simulation tests.
- `npm run build` then `npm run e2e` → 36 automated browser checks. The report is written to `test-results/e2e-report.json` with screenshots alongside.

---

## A. Automated checks

### A1. Simulation tests (`npm test`): **29 / 29 passed**

The tests drive the real simulation code in `src/sim/`. The values below are copied from the test diagnostics of the final run.

| # | Required scenario | Result | Measured |
|---|---|---|---|
| 2 | 99 % rock / 1 % water → 1 % rock / 99 % water via the recipe editor | ✅ | Start: ocean coverage 36 %, land 64 %. End: coverage 100 %. Solid core Rs 9.97 → 2.15 u. Mean water surface 10.000 u vs. volume-equivalent radius 10.000 u. Terrain integral matches inventory to ~1e-15. Draining afterwards re-exposes >90 % land. Pause and cancel leave inventories valid. |
| 3 | Pours on opposite sides fall to the centre, pool locally, flow downhill, flood higher terrain | ✅ | 40 packets in flight, each counted exactly once. Both antipodal sites receive water, with <15 % arriving anywhere else after landing. The water-weighted mean ground radius falls over time. More volume raises flooded area and maximum wet elevation. Water conserved to <1e-5. |
| 4 | Draining reveals the submerged terrain | ✅ | Terrain change under the drained flood: <1e-5 u. Land reappears, and drained ground stays wet for a while. |
| — | Basin connectivity | ✅ | The adjacent basin stays dry until the source basin fills to the saddle, then receives water. |
| 5 | Freeze → melt on a cold world; rain, evaporation and absorption conserve water | ✅ | At −70 °C bias: ice 2.78 / liquid 4.60. At +45 °C: ice 0, liquid 5.25. Ledger error 2e-16. On Earth over 60 s at ×4: 2509 raining cells, soil water present, ledger error 2e-15. |
| 6 | Heavy runoff makes a persistent channel and downstream sediment; hard rock changes less than soil | ✅ | Accelerated experiment, maximum incision every 10 real seconds: **0.058, 0.112, 0.167, 0.225, 0.284, 0.345 u**. 1058 cells received deposits. Solid conservation error 4e-15. The channel persists after the flow stops. Same flow on different rock: granite 0.0065 u, soil 1.10 u, sand 1.10 u. At normal settings, bedrock incision stays under 0.01 u. |
| 7a | A moving tornado leaves damage and moves sediment | ✅ | Moved 4.5 u along the surface. 32 cells on the damage path. 4.7e-2 u³ of sediment moved. Vegetation damage 29. |
| 7b | Hurricane: wind, rain, surge and flooding, then weakening in unsuitable conditions | ✅ | Natural mode over warm ocean: intensity 0.50 → 1.10, peak wind 8.0 u/s, rain moisture 1.2 u³, surge 2.6 mu. Over land it weakens and dissipates. The surge creates no water. Natural spawning is refused over cold water and on slowly spinning planets. Forced mode is labelled. |
| — | Other weather tools | ✅ | A blizzard accumulates snow-ice. A heatwave raises temperature by more than 5 °C. Fire spread stays bounded (≤400 cells) and dies out. An airless Moon refuses natural rain and names the atmosphere as the reason. |
| 8 | Vegetation and animals: move, feed, reproduce within the cap, respond to habitat loss and storms, stay attached to terrain | ✅ | Seeded grass 10.5 → 18.5 in 60 s. Rabbits: 6 → 14 visible (the species cap) plus 235 aggregated, 72 births. Never above the cap. Flood plus tornado: 12 land animals → 0. Fish on land are refused with a reason; the override is labelled. Spin and tilt never move organisms relative to terrain cells. |
| 9 | Earth–Moon orbit bounded over multiple orbits; a velocity change changes the path | ✅ | Period 144.5 orbit-s. Distance stays within [60.00, 60.01] over 5 orbits. A +12 % prograde burn gives e = 0.254 and the Moon reaches 101 u half an orbit later. |
| 10 | Sun–Earth–Moon nested orbits; no hidden duplicates after switching presets | ✅ | Over 2 years (755 orbit-s each): Earth–Sun distance 998–1017 u, Moon–Earth 37.2–42.6 u, Moon stays bound. Switching solar → Earth–Moon → blank leaves 7 → 2 → 0 bodies. |
| — | Collision merge | ✅ | Mass relative error 1e-16, momentum error 6e-17. Inventories transferred. A spawned moon gets radius clearance. |
| — | Mass edits perturb orbits; re-stabilise | ✅ | Making Earth heavier makes the Moon's orbit eccentric. Re-stabilise returns it to e < 0.01 and logs the intervention. |
| 11 | Save → JSON → load preserves state; import validation | ✅ | Every surface field, inventories, agents, storms, reserves, positions and velocities are bit-identical after the round trip. The save is 1663 KB. Rejected inputs: wrong format, non-JSON, future version, NaN, out-of-range position, truncated array. Oversized populations are capped into the reserve. A failed import leaves the world intact. |
| 12 | Pause, step, accelerated time and resume | ✅ | Paused: no change. Step: exactly 1 surface-second and 0.5 orbit-seconds. A 3600 s gap is clamped to 0.1 s with no launch. Surface time per frame is bounded. |
| — | Cube-sphere grid N = 12, 24, 32 | ✅ | Σ solid angle = 4π (<1e-6). The flood fill reaches all cells across all seams. Cell-area ratio is 1.05–1.6 and areas are tracked per cell. |

### A2. Browser end-to-end (`npm run e2e`, production build): **36 / 36 passed**

| Check | Result / measurement |
|---|---|
| Fresh launch opens Earth–Moon | ✅ Loaded in 744 ms. Tutorial shown on first launch. |
| Touch: 1-finger orbit, pinch zoom | ✅ Real CDP touch events: yaw 0.60 → 1.26, distance 62 → 24. |
| Mouse: drag orbit, wheel zoom | ✅ |
| Tap selects a body | ✅ Tapping the Moon in system view selects it. Small bodies get a 24 px tap radius. |
| Brush mode distinction | ✅ The banner reads "1 finger applies · 2 fingers move camera". A one-finger drag poured 9.9 u³. A two-finger pinch zoomed and poured nothing. |
| Quick return to View | ✅ |
| Weather tap | ✅ A forced tornado spawns on the tapped surface point. |
| Organism dropper | ✅ Animals released. The habitat warning (no food plants) is reported. |
| Orbits: add moon | ✅ |
| All 8 panels; 135 non-destructive controls clicked | ✅ No console errors, no exceptions. |
| Layout, portrait and landscape | ✅ No horizontal overflow. Tab bar on screen. |
| Composition editor 1 %/99 % | ✅ Transition starts and renders (screenshot). |
| All 8 scenes load with exactly the expected bodies and views | ✅ 2, 3, 4, 7, 2, 1, 1, 0. No leftover GPU views. |
| Save → reload page → Load | ✅ Terrain, inventories, storms, agents and time are identical. |
| Export JSON → Import JSON | ✅ |
| Invalid import | ✅ Rejected with a message; world untouched. |
| Offline | ✅ Service worker active; the page reloads and runs with the network disabled. |
| Assets | ✅ All 10 files served from the local bundle. No external requests. |
| Background/resume | ✅ After a simulated 1-hour gap: +0.2 orbit-s, Moon moved 0.5 u. No launch. |
| Console errors | ✅ None in either session. |

### A3. Mixed stress scene (automated, measured)

Scene contents:
- Earth plus Moon plus 3 extra moons (5 bodies).
- A forced hurricane and a moving tornado.
- A continuous spring creating flowing water.
- Population at the cap (160 explicit animals plus aggregated reserve).
- Surface time ×2.

| | Low quality | Medium quality |
|---|---|---|
| Earth surface cells | 3 456 | 6 144 |
| Triangles / draw calls | 300 k / 84 | 612 k / 84 |
| Plants drawn / particles | 705 / 297 | 1 405 / 310 |
| **JS per frame, GPU draw excluded** (sim + mesh/life/particle updates, 180 frames at dt = 1/60) | **2.5 ms mean, p50 1.9, p95 8.4** | **4.1 ms mean, p50 3.4, p95 10.3** |
| Frame rate on **software** WebGL (SwiftShader, CPU rasterised) | 9.5 FPS | 1.8 FPS |
| Water conservation error | 8e-10 | 1.5e-10 |

What this shows:
- The game's own JavaScript fits comfortably inside a 33 ms (30 FPS) frame on this x86 core, even in the stress scene.
- The low frame rates come from CPU-based software rasterisation of 0.3–0.6 M triangles at a 1–1.5 pixel ratio. That says nothing about an iPhone GPU.
- **Actual iPhone frame rates are unmeasured.** Use the checklist below. The diagnostics overlay (Inspect → Diagnostics) shows live FPS, frame time, draw calls, triangles, cells, populations, particles and conservation errors on the device.

Optimisations made because of profiling:
- Replaced Three's generic `computeVertexNormals` with a grid central-difference pass. That cost had been ~40 % of frame JS.
- The selected body's surface meshes refresh one face per frame, and back-facing faces refresh at a quarter of that rate.
- Plant mesh triangles were cut by 40–50 %.
- The water pass is skipped on bodies that have no liquid water.

---

## B. Manual / visual checks (screenshots inspected by me, not automated assertions)

| Check | Observation |
|---|---|
| Earth–Moon launch, portrait and landscape | Planet fits the narrow screen axis. Continents, oceans, clouds, atmosphere rim, polar ice. The Moon labelled "coarse", Earth "detailed". |
| Surface view | Coastline with sea-level shoreline cut by the terrain. Surf foam. Deer-like grazers on land with visible legs, antlers and gait animation. Conifers, broadleaf trees and shrubs. Fish visible at the sea surface. |
| Hurricane from space | Spiral bands with an eye, rotating, plus a simulated cloud field and a track line. |
| Tornado close-up | Funnel, spiralling debris, waterspout tint over water. |
| Saturn | Banded envelope. Rings in the equatorial plane with gap and planet shadow. |
| Cutaway of the ocean world | Blue water envelope over a rock mantle and iron core. |
| Terraform Mars | Red terrain, polar ice, thin atmosphere. Goals pill ("Goals 0/7"). |
| Lava world | Glowing flows with darkening crust. |
| Flood Lab experiment | A spring on the highest daylit peak. Channel and deposits visible with the sediment overlay. |
| Panels, portrait | Materials, Water, Weather, Life, Orbits, Inspect and Presets are scrollable, with no clipping. Touch targets are at least 36–40 px. |

Visual problems I found and fixed during these checks:
- Water bled over beaches.
- Fish were invisible under deep water.
- Sun glare was too large.
- Clouds were too heavy.
- The camera was too close in portrait.
- Mars was frozen over.
- Toasts overlapped the goals card.

---

## C. Defects found by testing and fixed

| Defect | How it was found | Fix |
|---|---|---|
| Erosion cut to the bedrock floor in any material, even at ×1 | erosion tests | New capacity model (slope × velocity × volume) and calibrated rates |
| 1 % water flooded 54 % of the surface | composition test | Broader hypsometry (97th-percentile normalisation), higher default relief |
| Solid-volume drift ~1e-4 | composition test | Float64 reservoirs; `Rs` solve excludes suspended load; relief rescale based on volume ratio |
| Settling deleted suspended sediment | conservation check | Sediment redistributed with the water |
| Runaway glaciation on Earth | long-run climate check | Sea-ice insulation, calving, margin ablation |
| Mass not conserved in merges | collision test | Atmosphere mass per bar made constant; lava density equals basalt; ice counted as water-equivalent mass |
| Animals never reached breeding energy | life test | Foraging hysteresis |
| A NaN target direction could poison the water arrays | e2e stress run | Input validation in `pour`, `applyBrush` and `tapTool` |
| The dropper said "cannot thrive" when the population cap was the real reason | e2e | Honest cap message; extra animals go to the aggregated population |
| Tiny bodies were hard to tap | e2e | 24 px screen-space tap tolerance |

---

## D. Remaining limitations (honest)

- **No real-device iPhone test.** Frame rate, thermal behaviour, Safari's IndexedDB quota and eviction, and the Add-to-Home-Screen offline launch are all unverified on hardware.
- **iOS gesture edge cases** are unverified on a real touchscreen: system edge swipes and Safari bars in non-standalone mode. Pointer, touch and pinch handling are verified only with CDP-synthesised touches.
- **Audio** is procedural noise only (wind, rain, pour, thunder). It was not listened to in this environment.
- **Climate is stylised.** Earth settles at about 11 °C and 59 % ocean coverage after 1600 surface-seconds rather than staying at its 14 °C start. Mars needed a +22 °C bias to match its preset mood.
- **Ecology is lightweight.** Long-run species balance depends on the population cap. Starvation and old age dominate the death causes.
- **Antialiasing** can only change after a reload. Other quality changes apply live.
- **Rings** are a rendered disc, not particles. Gas-giant storms are shader vortices, not a simulated envelope.
- **Scales are gameplay values.** See the README "Units and scales" table.
- **Deployment.** No authorised hosting capability was available in this environment, so the game is **not deployed**. No URL exists. Host `dist/` yourself as described in the README.

---

## E. Real-iPhone test checklist (please run on a physical device)

1. Host `dist/` over HTTPS. Open it in Safari: the Earth–Moon scene loads and the tutorial appears.
2. One-finger drag orbits, pinch zooms, two-finger drag pans. Rotating the phone keeps the UI inside the safe areas, in both portrait and landscape.
3. Water → Pour water. One finger pours and two fingers move the camera. Water falls, pools and flows.
4. Weather → Hurricane (Forced) and Tornado: tap the planet. Both storms are visible from space and up close.
5. Life → drop animals on green land. Zoom in with Surface view: the animals walk and graze.
6. Orbits → add a moon. Turn on trails and the predicted path.
7. Open Inspect → Diagnostics and record FPS and frame time at **Low** and **Medium** in Earth–Moon and in a stress setup: add 3 moons, a hurricane and a tornado. Target: about 30 FPS at Low or Medium.
8. Presets → Save. Close the tab, reopen it, and Load. Then Export JSON and Import it back.
9. Share → Add to Home Screen. Launch once online. Enable Airplane Mode and launch again: it should start offline.
10. Switch to another app for a minute and return: no jump in orbits and the world is intact.
11. Settings → Audio on. Sound starts only after a tap.
