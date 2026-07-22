import { ITEMS } from '../data/items.js';

// All DOM/HUD state. Reads the inventory + survival models and paints the
// hotbar, vitals, crafting list, and the inventory/container screens. Also owns
// the click-to-move drag/drop between containers.
export class HUD {
  constructor({ icons, inventory, crafting, getStations, onDropWorld, audio }) {
    this.icons = icons;
    this.inv = inventory;
    this.crafting = crafting;
    this.audio = audio;
    this.getStations = getStations;      // () → Set of station kinds near player
    this.onDropWorld = onDropWorld;      // (stack) → void

    this.el = {
      hotbar: document.getElementById('hotbar'),
      vitals: document.querySelectorAll('#hud .vital .fill'),
      prompt: document.getElementById('prompt'),
      clock: document.getElementById('clock'),
      crosshair: document.getElementById('crosshair'),
      hurt: document.getElementById('hurt-flash'),
      invScreen: document.getElementById('inventory-screen'),
      invGrid: document.getElementById('inv-grid'),
      invHotbar: document.getElementById('inv-hotbar'),
      invWear: document.getElementById('inv-wear'),
      craftList: document.getElementById('craft-list'),
      craftTabs: document.getElementById('craft-tabs'),
      charStats: document.getElementById('char-stats'),
      tooltip: document.getElementById('tooltip'),
      extPanel: document.getElementById('ext-panel'),
      extGrid: document.getElementById('ext-grid'),
      extTitle: document.getElementById('ext-title'),
      cursor: document.getElementById('cursor-stack'),
      death: document.getElementById('death-screen'),
      deathCause: document.getElementById('death-cause'),
      compassBand: document.getElementById('compass-band'),
    };

    this.open = false;
    this.cursorStack = null;    // { id, count, dur }
    this.extInstance = null;    // deployable instance whose container is open
    this.craftFilter = 'All';
    this._toasts = [];

    this.inv.onChange = () => { this.renderHotbar(); if (this.open) this.renderScreen(); };

    document.addEventListener('mousemove', (e) => {
      if (this.cursorStack) {
        this.el.cursor.style.left = e.clientX + 'px';
        this.el.cursor.style.top = e.clientY + 'px';
      }
      this._updateTooltip(e);
    });
    this.el.invScreen.addEventListener('mousedown', (e) => this._onScreenClick(e));

    this._buildCraftListStructure();
    this._buildCompass();
    this.renderHotbar();
  }

  _buildCompass() {
    this.pxPerDeg = 300 / 90;                 // ~90° visible across the 300px window
    const band = this.el.compassBand;
    if (!band) return;
    band.style.width = (720 * this.pxPerDeg) + 'px';
    const card = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    band.innerHTML = '';
    for (let deg = 0; deg <= 720; deg += 15) {
      const d = ((deg % 360) + 360) % 360;
      const t = document.createElement('span');
      t.className = 'tick' + (card[d] ? ' card' : '');
      t.textContent = card[d] || '·';
      t.style.position = 'absolute';
      t.style.left = (deg * this.pxPerDeg) + 'px';
      t.style.transform = 'translateX(-50%)';
      band.appendChild(t);
    }
  }

  setCompass(yaw) {
    if (!this.el.compassBand) return;
    const bearing = (((-yaw * 180 / Math.PI) % 360) + 360) % 360;
    const offset = 150 - (bearing + 360) * this.pxPerDeg;
    this.el.compassBand.style.transform = `translateX(${offset}px)`;
  }

  // ---- Hotbar ----
  renderHotbar() {
    const el = this.el.hotbar;
    el.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const s = this.inv.hotbar.slots[i];
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === this.inv.selected ? ' active' : '');
      const key = document.createElement('span'); key.className = 'key'; key.textContent = i + 1;
      slot.appendChild(key);
      if (s) this._fillSlot(slot, s);
      el.appendChild(slot);
    }
  }

  _fillSlot(slot, s) {
    const img = document.createElement('img');
    img.src = this.icons.get(s.id);
    slot.appendChild(img);
    if ((ITEMS[s.id]?.stack ?? 1) > 1 || s.count > 1) {
      const c = document.createElement('span'); c.className = 'count'; c.textContent = s.count;
      slot.appendChild(c);
    }
    const def = ITEMS[s.id];
    if (def?.durability && s.dur !== undefined) {
      const dur = document.createElement('div'); dur.className = 'dur';
      const inner = document.createElement('i'); inner.style.width = (100 * s.dur / def.durability) + '%';
      dur.appendChild(inner); slot.appendChild(dur);
    }
  }

  // ---- Vitals ----
  renderVitals(sv) {
    const [h, hu, th, tp] = this.el.vitals;
    h.style.width = sv.health + '%';
    hu.style.width = sv.hunger + '%';
    th.style.width = sv.thirst + '%';
    tp.style.width = Math.max(0, Math.min(100, sv.temp)) + '%';
    // Temp bar turns blue when cold, red when hot.
    if (sv.temp < 25) tp.style.background = 'linear-gradient(#7fc8ff,#3a7fd0)';
    else if (sv.temp > 90) tp.style.background = 'linear-gradient(#ffae6a,#d0602a)';
    else tp.style.background = 'linear-gradient(#8fd8b0,#5aa070)';

    // Pulsing red vignette when badly hurt.
    if (sv.health < 30 && sv.alive) this.el.hurt.classList.add('lowhp');
    else this.el.hurt.classList.remove('lowhp');
  }

  setClock(str) { this.el.clock.textContent = str; }

  // ---- Prompts + feedback ----
  prompt(text) { this.el.prompt.innerHTML = text; this.el.prompt.classList.add('show'); }
  hidePrompt() { this.el.prompt.classList.remove('show'); }

  hitmarker(strong = false) {
    this.el.crosshair.classList.add('hit');
    setTimeout(() => this.el.crosshair.classList.remove('hit'), 90);
  }

  hurtFlash() {
    this.el.hurt.style.opacity = '0.9';
    setTimeout(() => { this.el.hurt.style.opacity = '0'; }, 60);
  }

  toast(text) {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = 'position:fixed;left:50%;top:38%;transform:translateX(-50%);background:rgba(0,0,0,0.6);padding:8px 16px;border-radius:5px;font-size:14px;transition:opacity 0.5s;z-index:30;';
    document.body.appendChild(div);
    setTimeout(() => { div.style.opacity = '0'; }, 1400);
    setTimeout(() => div.remove(), 2000);
  }

  // ---- Death ----
  showDeath(cause) {
    this.el.deathCause.textContent = 'You died from ' + cause + '.';
    this.el.death.classList.remove('hidden');
  }
  hideDeath() { this.el.death.classList.add('hidden'); }

  // ---- Inventory / crafting screen ----
  toggle() { this.open ? this.close() : this.openScreen(); }

  openScreen() {
    this.open = true;
    this.el.invScreen.classList.remove('hidden');
    this.renderScreen();
  }
  close() {
    this.open = false;
    this.el.invScreen.classList.add('hidden');
    this.el.extPanel.classList.add('hidden');
    this.el.tooltip.classList.add('hidden');
    this.extInstance = null;
    if (this.cursorStack) { this._returnCursorToInventory(); }
  }

  openContainer(instance) {
    this.extInstance = instance;
    this.el.extTitle.textContent = instance.kind === 'box' ? 'Storage Box'
      : instance.kind === 'campfire' ? 'Campfire' : instance.kind === 'furnace' ? 'Furnace' : 'Container';
    this.el.extPanel.classList.remove('hidden');
    this.openScreen();
  }

  renderScreen() {
    this._renderGrid(this.el.invGrid, this.inv.main, 'main');
    this._renderGrid(this.el.invHotbar, this.inv.hotbar, 'hotbar', true);
    this._renderWear();
    this._renderCharStats();
    if (this.extInstance) this._renderGrid(this.el.extGrid, this.extInstance.container, 'ext');
    this._renderCraftTabs();
    this.renderCrafting();
    this.renderHotbar();
  }

  _renderCharStats() {
    let armor = 0, warmth = 0;
    for (const s of Object.values(this.inv.wear)) if (s) { armor += ITEMS[s.id]?.armor || 0; warmth += ITEMS[s.id]?.warmth || 0; }
    this.el.charStats.innerHTML = `<div>Armor: <b>${armor}</b></div><div>Warmth: <b>+${warmth}</b></div>`;
  }

  _renderGrid(container, model, name, keyed = false) {
    container.innerHTML = '';
    for (let i = 0; i < model.size; i++) {
      const s = model.slots[i];
      const slot = document.createElement('div');
      slot.className = 'slot' + (keyed && i === this.inv.selected ? ' active' : '');
      slot.dataset.c = name; slot.dataset.i = i;
      if (keyed) { const k = document.createElement('span'); k.className = 'key'; k.textContent = i + 1; slot.appendChild(k); }
      if (s) this._fillSlot(slot, s);
      container.appendChild(slot);
    }
  }

  _renderWear() {
    const g = this.el.invWear;
    g.innerHTML = '';
    for (const slotName of ['chest', 'legs']) {
      const s = this.inv.wear[slotName];
      const slot = document.createElement('div');
      slot.className = 'slot'; slot.dataset.c = 'wear'; slot.dataset.i = slotName;
      if (s) this._fillSlot(slot, s);
      const label = document.createElement('span'); label.className = 'wlabel'; label.textContent = slotName;
      slot.appendChild(label);
      g.appendChild(slot);
    }
  }

  _buildCraftListStructure() { /* rebuilt each render */ }

  _recipeTab(recipe) {
    const cat = ITEMS[Object.keys(recipe.out)[0]]?.category;
    if (cat === 'tool' || cat === 'weapon' || cat === 'build' || cat === 'ammo') return 'Tools';
    if (cat === 'deploy') return 'Deploy';
    if (cat === 'wear') return 'Wear';
    return 'Misc';
  }

  _renderCraftTabs() {
    const tabs = ['All', 'Tools', 'Deploy', 'Wear', 'Misc'];
    this.el.craftTabs.innerHTML = '';
    for (const name of tabs) {
      const btn = document.createElement('button');
      btn.textContent = name;
      if (this.craftFilter === name) btn.classList.add('active');
      btn.addEventListener('mousedown', (e) => { e.stopPropagation(); this.craftFilter = name; this._renderCraftTabs(); this.renderCrafting(); });
      this.el.craftTabs.appendChild(btn);
    }
  }

  renderCrafting() {
    const list = this.el.craftList;
    list.innerHTML = '';
    const stations = this.getStations();
    for (const recipe of this.crafting.list()) {
      if (this.craftFilter !== 'All' && this._recipeTab(recipe) !== this.craftFilter) continue;
      const can = this.crafting.canAfford(recipe);
      const station = this.crafting.hasStation(recipe, stations);
      const row = document.createElement('div');
      row.className = 'recipe' + ((can && station) ? '' : ' locked');
      const outId = Object.keys(recipe.out)[0];
      const icon = document.createElement('div'); icon.className = 'ricon';
      const img = document.createElement('img'); img.src = this.icons.get(outId); img.style.width = '34px'; img.style.height = '34px';
      icon.appendChild(img);
      const meta = document.createElement('div'); meta.className = 'rmeta';
      const name = document.createElement('div'); name.className = 'rname';
      name.textContent = ITEMS[outId].name + (recipe.out[outId] > 1 ? ` ×${recipe.out[outId]}` : '');
      const cost = document.createElement('div'); cost.className = 'rcost';
      cost.innerHTML = Object.entries(recipe.cost).map(([id, n]) => {
        const miss = this.inv.totalCount(id) < n;
        return `<span class="${miss ? 'miss' : ''}"><b>${n}</b> ${ITEMS[id].name}</span>`;
      }).join(' · ') + (recipe.station ? ` · <span class="${stations.has(recipe.station) ? '' : 'miss'}">needs ${recipe.station}</span>` : '');
      meta.appendChild(name); meta.appendChild(cost);
      const btn = document.createElement('button'); btn.className = 'rcraft'; btn.textContent = 'Craft';
      btn.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        const r = this.crafting.craft(recipe, this.getStations());
        if (!r.ok) this.toast(r.reason === 'station' ? `Requires a ${recipe.station}` : 'Not enough materials');
        else { this.audio?.craft(); this.renderScreen(); }
      });
      row.appendChild(icon); row.appendChild(meta); row.appendChild(btn);
      list.appendChild(row);
    }
  }

  // ---- Drag / drop (click-to-move) ----
  _container(name) {
    if (name === 'main') return this.inv.main;
    if (name === 'hotbar') return this.inv.hotbar;
    if (name === 'ext') return this.extInstance?.container;
    return null;
  }

  _onScreenClick(e) {
    const slotEl = e.target.closest('.slot');
    if (!slotEl || !slotEl.dataset.c) {
      // Clicked empty space while holding → drop to world.
      if (this.cursorStack && !e.target.closest('.panel')) {
        this.onDropWorld(this.cursorStack); this.cursorStack = null; this._renderCursor();
      }
      return;
    }
    const name = slotEl.dataset.c;
    const idx = name === 'wear' ? slotEl.dataset.i : parseInt(slotEl.dataset.i, 10);
    const shift = e.shiftKey;

    if (name === 'wear') return this._clickWear(idx);
    const c = this._container(name);
    if (!c) return;

    if (shift) return this._quickMove(c, idx, name);

    const slot = c.slots[idx];
    if (!this.cursorStack) {
      if (slot) { this.cursorStack = slot; c.slots[idx] = null; }
    } else {
      if (!slot) { c.slots[idx] = this.cursorStack; this.cursorStack = null; }
      else if (slot.id === this.cursorStack.id && (ITEMS[slot.id]?.stack ?? 1) > 1) {
        const max = ITEMS[slot.id].stack;
        const room = max - slot.count;
        const take = Math.min(room, this.cursorStack.count);
        slot.count += take; this.cursorStack.count -= take;
        if (this.cursorStack.count <= 0) this.cursorStack = null;
      } else {
        c.slots[idx] = this.cursorStack; this.cursorStack = slot;
      }
    }
    this._renderCursor();
    this.renderScreen();
    this.inv.changed();
  }

  _quickMove(fromC, idx, name) {
    const slot = fromC.slots[idx];
    if (!slot) return;
    // main ↔ hotbar, and inventory ↔ ext.
    let targets;
    if (this.extInstance) targets = name === 'ext' ? [this.inv.main, this.inv.hotbar] : [this.extInstance.container];
    else targets = name === 'hotbar' ? [this.inv.main] : [this.inv.hotbar, this.inv.main];
    for (const t of targets) {
      const left = t.add(slot.id, slot.count, slot.dur);
      if (left === 0) { fromC.slots[idx] = null; break; }
      else slot.count = left;
    }
    this.renderScreen();
    this.inv.changed();
  }

  _clickWear(slotName) {
    const cur = this.inv.wear[slotName];
    if (!this.cursorStack) {
      if (cur) { this.cursorStack = cur; this.inv.wear[slotName] = null; }
    } else {
      const def = ITEMS[this.cursorStack.id];
      if (def?.category === 'wear' && def.slot === slotName) {
        const prev = cur; this.inv.wear[slotName] = this.cursorStack; this.cursorStack = prev;
      } else { this.toast("Can't wear that here"); }
    }
    this._renderCursor();
    this.renderScreen();
    this.inv.changed();
  }

  _returnCursorToInventory() {
    if (!this.cursorStack) return;
    const left = this.inv.add(this.cursorStack.id, this.cursorStack.count, this.cursorStack.dur);
    if (left > 0) this.onDropWorld({ ...this.cursorStack, count: left });
    this.cursorStack = null;
    this._renderCursor();
  }

  _renderCursor() {
    const el = this.el.cursor;
    if (!this.cursorStack) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = '';
    const img = document.createElement('img'); img.src = this.icons.get(this.cursorStack.id);
    img.style.width = '100%'; img.style.height = '100%';
    el.appendChild(img);
    if (this.cursorStack.count > 1) {
      const c = document.createElement('span'); c.className = 'count'; c.textContent = this.cursorStack.count;
      el.appendChild(c);
    }
  }

  _tooltipFor(id) {
    const d = ITEMS[id];
    if (!d) return '';
    const bits = [];
    if (d.gather) bits.push(`chop ${d.gather.chop} · mine ${d.gather.mine} · gather ${d.gather.gather}`);
    if (d.damage) bits.push(`damage ${d.damage}`);
    if (d.ranged) bits.push('ranged');
    if (d.eat) {
      const e = d.eat; const p = [];
      if (e.hunger) p.push(`${e.hunger > 0 ? '+' : ''}${e.hunger} food`);
      if (e.thirst) p.push(`${e.thirst > 0 ? '+' : ''}${e.thirst} water`);
      if (e.health) p.push(`${e.health > 0 ? '+' : ''}${e.health} hp`);
      bits.push(p.join(' · '));
    }
    if (d.warmth) bits.push(`+${d.warmth} warmth`);
    if (d.armor) bits.push(`${d.armor} armor`);
    if (d.places) bits.push('placeable');
    const desc = bits.length ? `<div class="tdesc">${bits.join('<br>')}</div>` : '';
    return `<div class="tname">${d.name}</div><div class="tcat">${d.category}</div>${desc}`;
  }

  _updateTooltip(e) {
    const tip = this.el.tooltip;
    if (!this.open) { tip.classList.add('hidden'); return; }
    const slotEl = e.target.closest?.('.slot');
    let id = null;
    if (slotEl && slotEl.dataset.c) {
      const name = slotEl.dataset.c;
      if (name === 'wear') id = this.inv.wear[slotEl.dataset.i]?.id;
      else { const c = this._container(name); id = c?.slots[parseInt(slotEl.dataset.i, 10)]?.id; }
    }
    if (!id || this.cursorStack) { tip.classList.add('hidden'); return; }
    tip.innerHTML = this._tooltipFor(id);
    tip.classList.remove('hidden');
    const pad = 14;
    let x = e.clientX + pad, y = e.clientY + pad;
    const r = tip.getBoundingClientRect();
    if (x + r.width > innerWidth) x = e.clientX - r.width - pad;
    if (y + r.height > innerHeight) y = e.clientY - r.height - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  wearWarmth() {
    let w = 0;
    for (const s of Object.values(this.inv.wear)) if (s) w += ITEMS[s.id]?.warmth || 0;
    return w;
  }
}
