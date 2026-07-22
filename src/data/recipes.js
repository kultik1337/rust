// Crafting recipes. `station` (optional) requires being near a deployable of
// that kind. Recipes with no station can be crafted anywhere from the inventory.

export const RECIPES = [
  // Tools & weapons
  { id: 'hatchet', out: { hatchet: 1 }, cost: { wood: 60, stone: 40 } },
  { id: 'pickaxe', out: { pickaxe: 1 }, cost: { wood: 60, stone: 50 } },
  { id: 'spear',   out: { spear: 1 },   cost: { wood: 40, cloth: 5 } },
  { id: 'knife',   out: { knife: 1 },   cost: { wood: 10, stone: 20 } },
  { id: 'bow',     out: { bow: 1 },     cost: { wood: 80, cloth: 20 } },
  { id: 'arrow',   out: { arrow: 8 },   cost: { wood: 20, stone: 10 } },
  { id: 'torch',   out: { torch: 1 },   cost: { wood: 15, cloth: 8 } },
  { id: 'hammer',  out: { hammer: 1 },  cost: { wood: 40, stone: 20 } },

  // Building base pieces (placed via the hammer)
  // (walls/foundations are consumed directly from wood when placing; see build system)

  // Deployables
  { id: 'campfire',    out: { campfire: 1 },    cost: { wood: 40 } },
  { id: 'furnace',     out: { furnace: 1 },      cost: { stone: 120, wood: 30 } },
  { id: 'sleepingBag', out: { sleepingBag: 1 },  cost: { cloth: 40 } },
  { id: 'box',         out: { box: 1 },          cost: { wood: 100 } },

  // Refinement (needs a furnace nearby)
  { id: 'metalFrag',   out: { metalFrag: 25 },   cost: { metalOre: 25 }, station: 'furnace' },

  // Wearables
  { id: 'clothShirt',  out: { clothShirt: 1 },   cost: { cloth: 30, hide: 4 } },
  { id: 'clothPants',  out: { clothPants: 1 },   cost: { cloth: 25, hide: 3 } },
];
