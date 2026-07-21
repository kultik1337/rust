import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { findEntityRoot } from '../world/resources.js';
import { buildItemModel } from '../models/items.js';
import { MAT } from '../models/materials.js';

const REACH = 3.6;
const HAND = { chop: 2, mine: 2, gather: 3 };   // bare-hand gathering power

// Melee gathering/attacks (raycast from the crosshair) and bow projectiles.
export class CombatSystem {
  constructor({ scene, camera, viewmodel, resources, animals, drops, inventory, terrain, ui }) {
    Object.assign(this, { scene, camera, viewmodel, resources, animals, drops, inventory, terrain, ui });
    this.ray = new THREE.Raycaster();
    this.ray.far = REACH;
    this.cooldown = 0;
    this.projectiles = [];
  }

  heldDef() {
    const s = this.inventory.selectedItem();
    return s ? { slot: s, def: ITEMS[s.id] } : null;
  }

  // Fired while the primary button is held. Respects a per-swing cooldown.
  usePrimary(aiming) {
    if (this.cooldown > 0) return;
    const held = this.heldDef();
    const def = held?.def;

    // Bow: only fires on release (handled by fireArrow); ignore here.
    if (def?.ranged) return;

    const swingKind = def?.swing || 'chop';
    if (!this.viewmodel.swing(swingKind)) return;
    this.cooldown = swingKind === 'attack' ? 0.34 : 0.42;

    // Resolve the hit slightly into the swing for feel.
    setTimeout(() => this._resolveMelee(held), 90);
  }

  _resolveMelee(held) {
    const def = held?.def;
    this.ray.set(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
    const hits = this.ray.intersectObjects(this.scene.children, true);
    for (const h of hits) {
      if (h.distance > REACH) break;
      const root = findEntityRoot(h.object);
      if (!root) continue;
      const type = root.userData.type;
      if (type === 'resource') {
        const cat = root.userData.tool; // chop|mine|gather
        const power = (def?.gather?.[cat]) ?? HAND[cat] ?? 2;
        const res = this.resources.hit(root, power);
        if (res) {
          for (const [id, n] of Object.entries(res.gained)) {
            const left = this.inventory.add(id, n);
            if (left > 0) this.drops.spawn(id, left, root.position);
          }
          this._wearTool(held);
          this.ui.hitmarker();
        }
        return;
      }
      if (type === 'animal') {
        const ent = root.userData.entity;
        if (ent && !ent.dead) {
          ent.hurt(def?.damage ?? 6);
          this._wearTool(held);
          this.ui.hitmarker(true);
        }
        return;
      }
    }
  }

  _wearTool(held) {
    if (!held || !held.def) return;
    const s = held.slot;
    if (s.dur !== undefined && ITEMS[s.id]?.durability) {
      s.dur -= 1;
      if (s.dur <= 0) {
        this.inventory.hotbar.slots[this.inventory.selected] = null;
        this.viewmodel.setTool(null);
        this.ui.toast(`${ITEMS[s.id].name} broke`);
      }
      this.inventory.changed();
    }
  }

  fireArrow() {
    const held = this.heldDef();
    if (!held?.def?.ranged) return false;
    if (!this.inventory.has('arrow', 1)) { this.ui.toast('No arrows'); return false; }
    this.inventory.remove('arrow', 1);
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const model = buildItemModel('arrow');
    const start = this.camera.position.clone().add(dir.clone().multiplyScalar(0.6));
    model.position.copy(start);
    model.lookAt(start.clone().add(dir));
    this.scene.add(model);
    this.projectiles.push({ mesh: model, vel: dir.multiplyScalar(48), life: 6 });
    this.viewmodel.swing('attack');
    this._wearTool(held);
    return true;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    const g = -18;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vel.y += g * dt;
      const step = p.vel.clone().multiplyScalar(dt);
      p.mesh.position.add(step);
      p.mesh.lookAt(p.mesh.position.clone().add(p.vel));

      // Animal hit test (cheap sphere check).
      let hitSomething = false;
      for (const a of this.animals.animals) {
        if (a.dead) continue;
        if (a.mesh.position.distanceTo(p.mesh.position) < 1.0) {
          a.hurt(ITEMS.bow.damage);
          this.ui.hitmarker(true);
          hitSomething = true;
          break;
        }
      }
      const groundY = this.terrain.heightAt(p.mesh.position.x, p.mesh.position.z);
      if (hitSomething || p.mesh.position.y <= groundY || p.life <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }
}
