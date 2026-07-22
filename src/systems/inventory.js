import { ITEMS } from '../data/items.js';

// A slot holds { id, count, dur } where dur is remaining durability (for tools).
export class Container {
  constructor(size, label = '') {
    this.size = size;
    this.label = label;
    this.slots = new Array(size).fill(null);
  }
  maxStack(id) { return ITEMS[id]?.stack ?? 1; }

  // Add items, filling existing stacks first, then empty slots. Returns the
  // number that did NOT fit.
  add(id, count, dur) {
    const max = this.maxStack(id);
    for (let i = 0; i < this.size && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < max && dur === undefined) {
        const room = max - s.count;
        const take = Math.min(room, count);
        s.count += take; count -= take;
      }
    }
    for (let i = 0; i < this.size && count > 0; i++) {
      if (!this.slots[i]) {
        const take = Math.min(max, count);
        this.slots[i] = { id, count: take, dur: dur ?? (ITEMS[id]?.durability) };
        count -= take;
      }
    }
    return count;
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  has(id, n) { return this.count(id) >= n; }

  remove(id, n) {
    for (let i = this.size - 1; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) {
        const take = Math.min(s.count, n);
        s.count -= take; n -= take;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    return n === 0;
  }

  firstEmpty() { return this.slots.findIndex((s) => !s); }
  isFull() { return this.firstEmpty() === -1; }
}

// The player's inventory: a 6-slot hotbar + 24-slot backpack + wear slots.
export class Inventory {
  constructor() {
    this.hotbar = new Container(6, 'hotbar');
    this.main = new Container(24, 'main');
    this.wear = { chest: null, legs: null };
    this.selected = 0;              // active hotbar index
    this.onChange = () => {};
  }

  changed() { this.onChange(); }

  // Add across hotbar then backpack. Returns leftover count.
  add(id, count = 1, dur) {
    let left = this.hotbar.add(id, count, dur);
    if (left > 0) left = this.main.add(id, left, dur);
    this.changed();
    return left;
  }

  totalCount(id) { return this.hotbar.count(id) + this.main.count(id); }
  has(id, n) { return this.totalCount(id) >= n; }

  remove(id, n) {
    // Prefer backpack, then hotbar.
    const inMain = Math.min(n, this.main.count(id));
    this.main.remove(id, inMain);
    let rest = n - inMain;
    if (rest > 0) this.hotbar.remove(id, rest);
    this.changed();
    return this.totalCount(id) >= 0;
  }

  // Resolve a global slot index → its container + local index.
  resolve(kind, index) {
    if (kind === 'hotbar') return { c: this.hotbar, i: index };
    if (kind === 'main') return { c: this.main, i: index };
    return null;
  }

  selectedItem() { return this.hotbar.slots[this.selected]; }
  setSelected(i) { this.selected = (i + 6) % 6; this.changed(); }
}
