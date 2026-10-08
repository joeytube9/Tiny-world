// Material palette. Densities are in game mass units per game volume unit.
// hardness: 0..1 resistance to hydraulic erosion of in-place material.
// perm: infiltration rate (fraction of a cell's soil capacity filled per sim second).
// porosity: soil water capacity as a fraction of a nominal 0.08-unit soil column.
// talus: max stable slope (rise/run) before thermal collapse moves loose material.

export const MAT = {
  ROCK: 0, // basalt
  GRANITE: 1,
  SAND: 2,
  SOIL: 3,
  CLAY: 4,
  IRON: 5,
  WATER: 6,
  ICE: 7,
  LAVA: 8,
  ATMOS: 9,
  ENVELOPE: 10,
  ORGANIC: 11,
};

export const MATERIALS = [
  { id: 0, key: 'rock', name: 'Basalt', density: 3.0, hardness: 0.85, perm: 0.01, porosity: 0.08, talus: 1.6, color: [0.36, 0.34, 0.33], fertility: 0.15, kind: 'solid', desc: 'Hard dark rock. Slow erosion, absorbs little water.' },
  { id: 1, key: 'granite', name: 'Granite', density: 2.7, hardness: 0.95, perm: 0.005, porosity: 0.05, talus: 2.2, color: [0.62, 0.55, 0.52], fertility: 0.1, kind: 'solid', desc: 'Very hard mountain rock with a pale speckled look.' },
  { id: 2, key: 'sand', name: 'Sand', density: 1.6, hardness: 0.08, perm: 0.6, porosity: 0.35, talus: 0.6, color: [0.86, 0.76, 0.52], fertility: 0.2, kind: 'solid', desc: 'Loose and permeable. Easily carried by water and wind.' },
  { id: 3, key: 'soil', name: 'Soil', density: 1.4, hardness: 0.25, perm: 0.25, porosity: 0.45, talus: 0.9, color: [0.40, 0.30, 0.19], fertility: 1.0, kind: 'solid', desc: 'Holds moisture and supports vegetation.' },
  { id: 4, key: 'clay', name: 'Clay', density: 1.8, hardness: 0.45, perm: 0.004, porosity: 0.15, talus: 1.1, color: [0.66, 0.42, 0.30], fertility: 0.45, kind: 'solid', desc: 'Nearly impermeable. Water puddles on top.' },
  { id: 5, key: 'iron', name: 'Iron', density: 7.9, hardness: 0.97, perm: 0.0, porosity: 0.0, talus: 2.5, color: [0.45, 0.40, 0.42], fertility: 0.0, kind: 'solid', desc: 'Very dense metal. Greatly increases body mass.' },
  { id: 6, key: 'water', name: 'Water', density: 1.0, kind: 'liquid', color: [0.1, 0.35, 0.75], desc: 'Liquid storage, runoff, oceans, evaporation, rain and ice.' },
  { id: 7, key: 'ice', name: 'Ice / Snow', density: 0.92, kind: 'solid', color: [0.92, 0.95, 1.0], desc: 'Cold deposits that melt back into conserved water.' },
  { id: 8, key: 'lava', name: 'Lava', density: 3.0, kind: 'liquid', color: [1.0, 0.35, 0.05], desc: 'Hot viscous flow. Damages life, boils water, cools into basalt.' },
  { id: 9, key: 'atmos', name: 'Atmospheric gas', density: 0.0, kind: 'gas', color: [0.55, 0.75, 1.0], desc: 'Atmosphere amount (bar). Drives weather and habitability.' },
  { id: 10, key: 'envelope', name: 'Gas-giant envelope', density: 0.25, kind: 'gas', color: [0.85, 0.7, 0.5], desc: 'Hydrogen/helium-like envelope that thickens a gas giant, not solid terrain.' },
  { id: 11, key: 'organic', name: 'Organic matter', density: 0.8, kind: 'solid', color: [0.22, 0.16, 0.08], desc: 'Improves soil fertility; decomposes into nutrients.' },
];

// Solid terrain inventory keys (volume stored in body.inv, geometry in terrain).
export const SOLID_KEYS = ['rock', 'granite', 'sand', 'soil', 'clay', 'iron'];
// All condensed recipe keys in the composition editor.
export const RECIPE_KEYS = ['rock', 'granite', 'sand', 'soil', 'clay', 'iron', 'water', 'ice', 'organic', 'lava'];
export const KEY_TO_MAT = { rock: 0, granite: 1, sand: 2, soil: 3, clay: 4, iron: 5, water: 6, ice: 7, lava: 8, organic: 11 };
export const DENSITY = Object.fromEntries(MATERIALS.map((m) => [m.key, m.density]));

// Soil column used to size absorption capacity (game units of depth).
export const SOIL_DEPTH = 0.08;
