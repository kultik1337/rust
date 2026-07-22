import * as THREE from 'three';
import { DEPLOYABLE_MODELS } from '../models/deployables.js';
import { Container } from './inventory.js';
import { ITEMS } from '../data/items.js';

const SMELT = { metalOre: 'metalFrag' };   // ore → refined, in a furnace

// Owns every placed campfire/furnace/box/sleeping-bag: their colliders, their
// fire flicker, and the cooking/smelting that turns raw inputs into outputs.
export class DeployManager {
  constructor(scene, terrain, physics) {
    this.scene = scene;
    this.terrain = terrain;
    this.physics = physics;
    this.items = [];         // { group, kind, container, cookTimer, spawn }
    this.spawnPoint = null;  // set by sleeping bags
    this._id = 1;
  }

  place(itemId, aimPoint, yaw = 0) {
    const def = ITEMS[itemId];
    if (!def?.places) return null;
    const kind = def.places;
    const group = DEPLOYABLE_MODELS[kind]();
    const y = Math.max(this.terrain.heightAt(aimPoint.x, aimPoint.z), 0);
    group.position.set(aimPoint.x, y, aimPoint.z);
    group.rotation.y = yaw;
    const id = 'dep' + (this._id++);
    group.userData.id = id;
    group.traverse((o) => { o.userData.root = group; });
    this.scene.add(group);

    // Colliders.
    for (const b of group.userData.aabbs || []) {
      this.physics.addBox(
        new THREE.Vector3(aimPoint.x + b.cx - b.hx, y + b.cy - b.hy, aimPoint.z + b.cz - b.hz),
        new THREE.Vector3(aimPoint.x + b.cx + b.hx, y + b.cy + b.hy, aimPoint.z + b.cz + b.hz), id);
    }

    const inst = {
      group, kind, id,
      container: group.userData.slots ? new Container(group.userData.slots, kind) : null,
      cookTimer: 0,
      warmth: group.userData.warmth || 0,
      warmthRadius: group.userData.warmthRadius || 0,
      fire: group.userData.fire || null,
    };
    if (kind === 'sleepingBag') { this.spawnPoint = group.position.clone(); inst.spawn = true; }
    this.items.push(inst);
    return inst;
  }

  instanceForGroup(group) { return this.items.find((it) => it.group === group); }

  // Set of station kinds within `range` (for crafting requirements).
  stationsNear(pos, range = 4.5) {
    const set = new Set();
    for (const it of this.items) {
      if (it.group.position.distanceTo(pos) < range) set.add(it.kind);
    }
    return set;
  }

  warmthAt(pos) {
    let w = 0;
    for (const it of this.items) {
      if (!it.warmth) continue;
      const d = it.group.position.distanceTo(pos);
      if (d < it.warmthRadius) w += it.warmth * (1 - d / it.warmthRadius);
    }
    return w;
  }

  interact(group, ui) {
    const it = this.instanceForGroup(group);
    if (!it) return;
    if (it.kind === 'sleepingBag') {
      this.spawnPoint = it.group.position.clone();
      ui.toast('Respawn point set');
      return;
    }
    if (it.container) ui.openContainer(it);
  }

  update(dt) {
    for (const it of this.items) {
      // Fire flicker.
      if (it.fire) {
        const flick = 0.7 + Math.sin(performance.now() * 0.02 + it.id.length) * 0.15 + Math.random() * 0.08;
        it.fire.light.intensity = (it.kind === 'furnace' ? 5 : 8) * flick;
        for (const f of it.fire.flames) {
          f.material.emissiveIntensity = 3.4 * flick;
          f.scale.y = 0.85 + flick * 0.3;
        }
      }
      // Cooking / smelting.
      if (it.container && (it.kind === 'campfire' || it.kind === 'furnace')) {
        it.cookTimer += dt;
        if (it.cookTimer >= 3) {
          it.cookTimer = 0;
          for (let i = 0; i < it.container.size; i++) {
            const s = it.container.slots[i];
            if (!s) continue;
            const def = ITEMS[s.id];
            let out = null;
            if (def?.cookInto) out = def.cookInto;                       // meat, any fire
            else if (it.kind === 'furnace' && SMELT[s.id]) out = SMELT[s.id]; // ore, furnace only
            if (out) {
              s.count -= 1;
              if (s.count <= 0) it.container.slots[i] = null;
              it.container.add(out, 1);
              break; // one conversion per tick keeps it visible
            }
          }
        }
      }
    }
  }
}
