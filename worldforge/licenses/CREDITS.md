# Credits and licenses

## Runtime code bundled into the production build
| Component | Version | License | Source |
|---|---|---|---|
| three.js | 0.169.0 | MIT (see `three.js-LICENSE.txt`) | https://github.com/mrdoob/three.js |

## Build / test tools (not shipped to players)
| Tool | Version | License |
|---|---|---|
| Vite | 5.4.21 | MIT |
| Playwright | 1.56.1 | Apache-2.0 |

## Art assets
WORLDFORGE ships **no third-party art files**. Every visual is generated at runtime
or at build time by code in this repository:

- Planet terrain, water, clouds, atmospheres, gas-giant bands, rings, stars,
  storms and the sky: procedural geometry + GLSL shaders in `src/render/`.
- Plants (grass, flowering plants, shrubs, conifers, broadleaf trees, fungi) and
  animals (grazer, fox, hopper, bird, fish, butterfly swarm): procedural
  multi-part meshes in `src/render/models.js`.
- App icons: rendered procedurally by `scripts/make-icons.mjs`.

No models, textures, fonts or sounds are hotlinked or downloaded during play.
Audio is synthesised with the Web Audio API (`src/audio.js`).

WORLDFORGE source code: original work in this repository.
