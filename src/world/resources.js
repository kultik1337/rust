import * as THREE from 'three';
import { makeRNG } from '../core/noise.js';
import { mergeByMaterial } from '../models/merge.js';
import {
  makePineTree, makeBroadleafTree, makeDeadTree, makeRock, makeOreNode, makeBush, makeHemp,
} from '../models/nature.js';

// Scatters harvestable resources across the island by biome and registers their
// trunk/boulder colliders with the physics world. Each resource tracks health;
// hitting it yields a proportional amount of materials until it's depleted.
export class ResourceManager {
  constructor(scene, terrain, physics, seed = 20240) {
    this.scene = scene;
    this.terrain = terrain;
    this.physics = physics;
    this.rng = makeRNG(seed);
    this.resources = [];
    this._id = 1;
  }

  _place(group, x, z) {
    group = mergeByMaterial(group);       // collapse to 1 mesh per material
    const y = this.terrain.heightAt(x, z);
    group.position.set(x, y, z);
    group.rotation.y = this.rng() * Math.PI * 2;
    const id = 'res' + (this._id++);
    group.userData.id = id;
    group.userData.maxHealth = group.userData.health;
    // Backreference so raycasts on child meshes can find the resource root.
    group.traverse((o) => { o.userData.root = group; });
    const col = group.userData.collider;
    if (col && col.radius > 0) {
      this.physics.addCylinder(x, z, col.radius, y, col.height || 3, id);
    }
    this.scene.add(group);
    this.resources.push(group);
    return group;
  }

  populate() {
    const T = this.terrain, rng = this.rng;
    const R = T.worldRadius;

    const tries = 12000;
    let trees = 0, rocks = 0, ore = 0, bushes = 0, hemp = 0, dead = 0;
    const LIMITS = { trees: 760, rocks: 300, ore: 80, bushes: 320, hemp: 90, dead: 80 };

    for (let i = 0; i < tries; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * R * 1.05;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = T.heightAt(x, z);
      const slope = T.slopeAt(x, z);
      if (h < 1.4) continue;                    // below beach → skip

      const biome = T.biomeAt(x, z);
      const roll = rng();

      if (biome === 'grass' && slope < 0.45) {
        if (roll < 0.66 && trees < LIMITS.trees) {
          const cold = h > 15;
          this._place(cold ? makePineTree(rng() * 1e9) : makeBroadleafTree(rng() * 1e9), x, z);
          trees++;
        } else if (roll < 0.82 && bushes < LIMITS.bushes) {
          this._place(makeBush(rng() * 1e9), x, z); bushes++;
        } else if (roll < 0.9 && hemp < LIMITS.hemp) {
          this._place(makeHemp(rng() * 1e9), x, z); hemp++;
        } else if (roll < 0.95 && rocks < LIMITS.rocks) {
          this._place(makeRock(rng() * 1e9), x, z); rocks++;
        }
      } else if (biome === 'rock' || h > 21) {
        if (roll < 0.5 && rocks < LIMITS.rocks) { this._place(makeRock(rng() * 1e9), x, z); rocks++; }
        else if (roll < 0.72 && ore < LIMITS.ore) {
          const t = rng() < 0.5 ? 'metal' : (rng() < 0.6 ? 'sulfur' : 'stone');
          this._place(makeOreNode(t, rng() * 1e9), x, z); ore++;
        } else if (roll < 0.82 && trees < LIMITS.trees && slope < 0.5) {
          this._place(makePineTree(rng() * 1e9), x, z); trees++;
        } else if (roll < 0.9 && dead < LIMITS.dead) {
          this._place(makeDeadTree(rng() * 1e9), x, z); dead++;
        }
      } else if (biome === 'beach') {
        if (roll < 0.12 && rocks < LIMITS.rocks) { this._place(makeRock(rng() * 1e9), x, z); rocks++; }
      }
    }
  }

  // Remove resources within `r` of a point (used to clear the spawn area).
  clearAround(pos, r = 5) {
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const g = this.resources[i];
      const dx = g.position.x - pos.x, dz = g.position.z - pos.z;
      if (dx * dx + dz * dz < r * r) {
        this.physics.removeById(g.userData.id);
        this.scene.remove(g);
        this.resources.splice(i, 1);
      }
    }
  }

  // Apply a harvest hit. Returns { gained: {id:n}, depleted: bool } or null.
  hit(group, gatherPower) {
    const ud = group.userData;
    if (ud.dead) return null;
    const dmg = Math.max(4, gatherPower * 4);
    ud.health -= dmg;
    const frac = Math.min(1, dmg / ud.maxHealth);
    const gained = {};
    for (const [id, total] of Object.entries(ud.yield)) {
      gained[id] = Math.max(1, Math.round(total * frac));
    }
    // Small "shake" feedback.
    group.userData._shake = 0.12;

    if (ud.health <= 0) {
      ud.dead = true;
      this._fall(group);
      return { gained, depleted: true };
    }
    return { gained, depleted: false };
  }

  _fall(group) {
    // Remove collider immediately, then animate a quick topple + sink.
    this.physics.removeById(group.userData.id);
    group.userData._falling = 2.0;
    group.userData._fallAxis = Math.random() * Math.PI * 2;
  }

  update(dt, playerPos) {
    // Distance culling: hide resources beyond view, and only let nearby ones
    // cast shadows. This is the main runtime cost saver in dense forest.
    const cull2 = 210 * 210, shadow2 = 75 * 75;
    for (let i = this.resources.length - 1; i >= 0; i--) {
      const g = this.resources[i];
      const ud = g.userData;
      if (playerPos) {
        const dx = g.position.x - playerPos.x, dz = g.position.z - playerPos.z;
        const d2 = dx * dx + dz * dz;
        const vis = d2 < cull2;
        if (g.visible !== vis) g.visible = vis;
        if (vis) {
          const cast = d2 < shadow2;
          if (ud._cast !== cast) { ud._cast = cast; g.traverse((o) => { if (o.isMesh) o.castShadow = cast; }); }
        }
      }
      if (ud._shake > 0) {
        ud._shake -= dt * 0.6;
        g.rotation.z = Math.sin(performance.now() * 0.05) * ud._shake * 0.3;
      }
      if (ud._falling > 0) {
        ud._falling -= dt;
        g.rotation.z += dt * 1.5;
        g.position.y -= dt * (2.0 - ud._falling) * 1.5;
        if (ud._falling <= 0) {
          this.scene.remove(g);
          this.resources.splice(i, 1);
        }
      }
    }
  }
}

// Walk up the parent chain to find the entity root (resource/animal/etc.).
export function findEntityRoot(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData.type) return o;
    if (o.userData && o.userData.root) return o.userData.root;
    o = o.parent;
  }
  return null;
}
