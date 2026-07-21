import { RECIPES } from '../data/recipes.js';

// Pure crafting logic: decide affordability and apply the transaction. Station
// proximity is passed in from the deployables system.
export class Crafting {
  constructor(inventory) { this.inv = inventory; }

  canAfford(recipe) {
    for (const [id, n] of Object.entries(recipe.cost)) {
      if (this.inv.totalCount(id) < n) return false;
    }
    return true;
  }

  hasStation(recipe, stations) {
    if (!recipe.station) return true;
    return stations.has(recipe.station);
  }

  craft(recipe, stations) {
    if (!this.canAfford(recipe)) return { ok: false, reason: 'materials' };
    if (!this.hasStation(recipe, stations)) return { ok: false, reason: 'station' };
    for (const [id, n] of Object.entries(recipe.cost)) this.inv.remove(id, n);
    for (const [id, n] of Object.entries(recipe.out)) this.inv.add(id, n);
    return { ok: true };
  }

  list() { return RECIPES; }
}
