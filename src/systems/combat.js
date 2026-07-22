import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { findEntityRoot } from '../world/resources.js';
import { buildItemModel } from '../models/items.js';
import { MAT } from '../models/materials.js';

const REACH = 3.6;
const HAND = { chop: 2, mine: 2, gather: 3 };   // bare-hand gathering power

// Melee gathering/attacks (raycast from the crosshair) and bow projectiles.
export class CombatSystem {
  constructor({ scene, camera, viewmodel, resources, animals, drops, inventory, terrain, ui, particles, audio }) {
    Object.assign(this, { scene, camera, viewmodel, resources, animals, drops, inventory, terrain, ui, particles, audio });
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

  // Only nearby resources/animals are candidates — never raycast the whole
  // scene (the terrain alone is ~166k triangles).
  _candidates() {
    const list = [];
    const c = this.camera.position; const r2 = (REACH + 2) * (REACH + 2);
    for (const g of this.resources.resources) {
      if (!g.visible || g.userData.dead) continue;
      const dx = g.position.x - c.x, dz = g.position.z - c.z;
      if (dx * dx + dz * dz < r2) list.push(g);
    }
    for (const a of this.animals.animals) {
      if (a.dead) continue;
      const dx = a.mesh.position.x - c.x, dz = a.mesh.position.z - c.z;
      if (dx * dx + dz * dz < r2) list.push(a.mesh);
    }
    return list;
  }

  _resolveMelee(held) {
    const def = held?.def;
    this.ray.set(this.camera.position, this.camera.getWorldDirection(new THREE.Vector3()));
    const hits = this.ray.intersectObjects(this._candidates(), true);
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
          // Debris + sound cued to the resource kind.
          const color = cat === 'chop' ? 0x7a5230 : cat === 'mine' ? 0x8b877e : 0x4e7a2a;
          this.particles?.burst(h.point, color, 9, 3, 2.6);
          if (cat === 'chop') this.audio?.chop();
          else if (cat === 'mine') this.audio?.mine();
          else this.audio?.gather();
        }
        return;
      }
      if (type === 'animal') {
        const ent = root.userData.entity;
        if (ent && !ent.dead) {
          ent.hurt(def?.damage ?? 6);
          this._wearTool(held);
          this.ui.hitmarker(true);
          this.particles?.burst(h.point, 0xb0303a, 8, 3, 2.2);
          this.audio?.hitFlesh();
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
    this.audio?.bow();
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
