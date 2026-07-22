// Master item table. `icon`/held model defaults to the item id (see items.js
// model registry). Everything a player can hold, carry, eat, place or wear.

export const ITEMS = {
  // --- Tools & weapons ---
  rock:    { name: 'Rock',            stack: 1,  category: 'tool',   gather: { chop: 3, mine: 4, gather: 2 }, damage: 8,  durability: 200, swing: 'chop' },
  hatchet: { name: 'Stone Hatchet',   stack: 1,  category: 'tool',   gather: { chop: 14, mine: 3, gather: 4 }, damage: 18, durability: 260, swing: 'chop' },
  pickaxe: { name: 'Stone Pickaxe',   stack: 1,  category: 'tool',   gather: { chop: 3, mine: 15, gather: 2 }, damage: 16, durability: 260, swing: 'chop' },
  spear:   { name: 'Wooden Spear',    stack: 1,  category: 'weapon', gather: { chop: 2, mine: 1, gather: 3 }, damage: 35, durability: 180, swing: 'attack' },
  knife:   { name: 'Bone Knife',      stack: 1,  category: 'weapon', gather: { chop: 2, mine: 1, gather: 12 }, damage: 22, durability: 200, swing: 'attack' },
  bow:     { name: 'Hunting Bow',     stack: 1,  category: 'weapon', ranged: true, damage: 45, durability: 150, swing: 'attack', ammo: 'arrow' },
  torch:   { name: 'Torch',           stack: 1,  category: 'tool',   gather: { chop: 1, mine: 1, gather: 1 }, damage: 6, light: true, swing: 'attack' },
  hammer:  { name: 'Building Hammer', stack: 1,  category: 'build',  damage: 5, swing: 'chop' },

  // --- Resources ---
  wood:      { name: 'Wood',          stack: 1000, category: 'resource' },
  stone:     { name: 'Stone',         stack: 1000, category: 'resource' },
  metalOre:  { name: 'Metal Ore',     stack: 1000, category: 'resource' },
  metalFrag: { name: 'Metal Fragments', stack: 1000, category: 'resource' },
  sulfurOre: { name: 'Sulfur Ore',    stack: 1000, category: 'resource' },
  cloth:     { name: 'Cloth',         stack: 1000, category: 'resource' },
  arrow:     { name: 'Arrow',         stack: 64,  category: 'ammo' },

  // --- Food & water ---
  berries:    { name: 'Berries',      stack: 20, category: 'food', eat: { hunger: 8,  thirst: 4,  health: 2 } },
  rawMeat:    { name: 'Raw Meat',     stack: 20, category: 'food', eat: { hunger: 6,  thirst: -2, health: -4 }, cookInto: 'cookedMeat' },
  cookedMeat: { name: 'Cooked Meat',  stack: 20, category: 'food', eat: { hunger: 26, thirst: -3, health: 6 } },
  waterJug:   { name: 'Water Jug',    stack: 1,  category: 'food', eat: { hunger: 0,  thirst: 40, health: 0 }, refillable: true },

  // --- Deployables (placed into the world) ---
  campfire:    { name: 'Campfire',     stack: 5, category: 'deploy', places: 'campfire' },
  furnace:     { name: 'Furnace',      stack: 3, category: 'deploy', places: 'furnace' },
  sleepingBag: { name: 'Sleeping Bag', stack: 3, category: 'deploy', places: 'sleepingBag' },
  box:         { name: 'Wood Box',     stack: 5, category: 'deploy', places: 'box' },

  // --- Wearables ---
  hide:        { name: 'Animal Hide',  stack: 1000, category: 'resource' },
  clothShirt:  { name: 'Hide Shirt',   stack: 1, category: 'wear', slot: 'chest', armor: 6, warmth: 6 },
  clothPants:  { name: 'Hide Pants',   stack: 1, category: 'wear', slot: 'legs',  armor: 5, warmth: 5 },
};

// Which gather stat a resource responds to, and the best tool category.
export const RESOURCE_TOOL = {
  tree: 'chop',
  rock: 'mine',
  bush: 'gather',
};

export function itemDef(id) { return ITEMS[id]; }
