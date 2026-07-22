import * as THREE from 'three';
import { buildItemModel } from '../models/items.js';

// Item drops that lie in the world and are picked up on proximity.
export class DropManager {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.drops = [];
  }

  spawn(id, count, pos, scatter = 0.6) {
    const model = buildItemModel(id);
    model.scale.setScalar(0.7);
    const x = pos.x + (Math.random() - 0.5) * scatter;
    const z = pos.z + (Math.random() - 0.5) * scatter;
    const y = Math.max(this.terrain.heightAt(x, z), 0) + 0.4;
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.add(model);
    holder.userData = { id, count, life: 120, spin: Math.random() * 6 };
    this.scene.add(holder);
    this.drops.push(holder);
  }

  update(dt, player, inventory, onPickup) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.userData.life -= dt;
      d.userData.spin += dt;
      d.rotation.y = d.userData.spin;
      d.position.y += Math.sin(d.userData.spin * 2) * 0.002;
      const dist = player.pos.distanceTo(d.position);
      if (dist < 1.8) {
        const left = inventory.add(d.userData.id, d.userData.count);
        if (left < d.userData.count) {
          onPickup?.(d.userData.id, d.userData.count - left);
          if (left === 0) { this.scene.remove(d); this.drops.splice(i, 1); continue; }
          d.userData.count = left;
        }
      }
      if (d.userData.life <= 0) { this.scene.remove(d); this.drops.splice(i, 1); }
    }
  }
}
