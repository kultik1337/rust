import * as THREE from 'three';
import { ANIMAL_BUILDERS } from '../models/animals_models.js';
import { makeRNG, clamp } from '../core/noise.js';

// Per-species behaviour + stats. `temperament`:
//   prey     → wanders, flees when the player gets close
//   skittish → like prey but slower to spook
//   defensive→ neutral until hit, then attacks
//   predator → actively hunts the player within aggro range
const SPECIES = {
  deer:    { hp: 60,  speed: 5.6, temperament: 'prey',      aggro: 0, damage: 0,  fleeDist: 16, loot: { rawMeat: 18, hide: 8 } },
  chicken: { hp: 14,  speed: 3.2, temperament: 'prey',      aggro: 0, damage: 0,  fleeDist: 10, loot: { rawMeat: 4 } },
  boar:    { hp: 90,  speed: 4.8, temperament: 'defensive', aggro: 0, damage: 16, fleeDist: 8,  loot: { rawMeat: 24, hide: 10 } },
  wolf:    { hp: 75,  speed: 6.6, temperament: 'predator',  aggro: 22, damage: 18, fleeDist: 0,  loot: { rawMeat: 14, hide: 6 } },
  bear:    { hp: 210, speed: 5.4, temperament: 'predator',  aggro: 16, damage: 42, fleeDist: 0,  loot: { rawMeat: 40, hide: 22 } },
};

class Animal {
  constructor(species, mesh, terrain) {
    const s = SPECIES[species];
    this.species = species;
    this.def = s;
    this.mesh = mesh;
    this.terrain = terrain;
    this.hp = s.hp;
    this.maxHp = s.hp;
    this.state = 'wander';
    this.target = new THREE.Vector3();
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.phase = Math.random() * 10;
    this.retargetIn = 0;
    this.attackCd = 0;
    this.dead = false;
    this.deadTimer = 0;
    mesh.userData.entity = this;      // for combat raycasts
    mesh.userData.type = 'animal';
  }

  hurt(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    if (this.def.temperament === 'defensive') { this.state = 'chase'; this._angered = true; }
    else if (this.def.temperament === 'prey' || this.def.temperament === 'skittish') this.state = 'flee';
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.state = 'dead';
    this.deadTimer = 12;
    // Flop onto side.
    this.mesh.rotation.z = Math.PI / 2 * 0.8;
  }

  _pickWanderTarget() {
    const r = 8 + Math.random() * 18;
    const a = Math.random() * Math.PI * 2;
    let tx = this.mesh.position.x + Math.cos(a) * r;
    let tz = this.mesh.position.z + Math.sin(a) * r;
    // Keep inland: if target is in water, pull back toward origin.
    if (this.terrain.heightAt(tx, tz) < 1) {
      tx = this.mesh.position.x - Math.cos(a) * r;
      tz = this.mesh.position.z - Math.sin(a) * r;
    }
    this.target.set(tx, 0, tz);
    this.retargetIn = 3 + Math.random() * 4;
  }

  update(dt, player) {
    const pos = this.mesh.position;
    if (this.dead) {
      this.deadTimer -= dt;
      return;
    }

    const toPlayer = new THREE.Vector3().subVectors(player.pos, pos);
    const distToPlayer = toPlayer.length();

    // --- State transitions ---
    const s = this.def;
    if (s.temperament === 'predator') {
      if (distToPlayer < s.aggro) this.state = distToPlayer < 2.4 ? 'attack' : 'chase';
      else if (this.state !== 'wander') this.state = 'wander';
    } else if (s.temperament === 'prey' || s.temperament === 'skittish') {
      if (distToPlayer < s.fleeDist) this.state = 'flee';
      else if (this.state === 'flee' && distToPlayer > s.fleeDist * 1.6) this.state = 'wander';
    } else if (s.temperament === 'defensive' && this._angered) {
      this.state = distToPlayer < 2.4 ? 'attack' : (distToPlayer < 30 ? 'chase' : 'wander');
    }

    // --- Act ---
    let desiredSpeed = 0;
    let moveDir = null;
    this.retargetIn -= dt;
    if (this.state === 'wander') {
      if (this.retargetIn <= 0) this._pickWanderTarget();
      const d = new THREE.Vector3().subVectors(this.target, pos); d.y = 0;
      if (d.length() < 1.5) this.retargetIn = 0; else { moveDir = d.normalize(); desiredSpeed = s.speed * 0.35; }
    } else if (this.state === 'flee') {
      moveDir = toPlayer.clone().negate(); moveDir.y = 0; moveDir.normalize();
      desiredSpeed = s.speed;
    } else if (this.state === 'chase') {
      moveDir = toPlayer.clone(); moveDir.y = 0; moveDir.normalize();
      desiredSpeed = s.speed;
    } else if (this.state === 'attack') {
      desiredSpeed = 0;
      this.attackCd -= dt;
      if (this.attackCd <= 0) {
        this.attackCd = 1.1;
        if (distToPlayer < 2.8 && player.takeDamage) player.takeDamage(s.damage, `a ${this.species}`);
      }
      // Face the player.
      this.heading = Math.atan2(toPlayer.x, toPlayer.z);
    }

    // --- Move + terrain follow ---
    if (moveDir) {
      // Avoid walking into the sea.
      const nx = pos.x + moveDir.x * 2, nz = pos.z + moveDir.z * 2;
      if (this.terrain.heightAt(nx, nz) < 0.6) { this.retargetIn = 0; desiredSpeed = 0; }
      else this.heading = Math.atan2(moveDir.x, moveDir.z);
    }
    this.speed = clamp(this.speed + (desiredSpeed - this.speed) * clamp(4 * dt, 0, 1), 0, s.speed);
    pos.x += Math.sin(this.heading) * this.speed * dt;
    pos.z += Math.cos(this.heading) * this.speed * dt;
    pos.y = Math.max(this.terrain.heightAt(pos.x, pos.z), 0);
    // The model's "front" is +X, but our heading convention has forward at +Z,
    // so offset by -90° — otherwise animals appear to walk sideways.
    this.mesh.rotation.y = this.heading - Math.PI / 2;

    // --- Leg / head animation ---
    this.phase += dt * (2 + this.speed * 2.2);
    const rig = this.mesh.userData.rig;
    if (rig) {
      const amp = clamp(this.speed / s.speed, 0.1, 1) * 0.6;
      for (let i = 0; i < rig.legs.length; i++) {
        const sign = (i % 2 === 0) ? 1 : -1;
        const front = i < 2 ? 1 : -1;
        rig.legs[i].rotation.x = Math.sin(this.phase + (sign > 0 ? 0 : Math.PI)) * amp;
      }
      if (rig.head) rig.head.rotation.z = Math.sin(this.phase * 0.5) * 0.05 + (this.state === 'wander' ? Math.sin(this.phase * 0.2) * 0.1 : 0);
    }
  }
}

export class AnimalManager {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.animals = [];
  }

  spawn(species, x, z) {
    const build = ANIMAL_BUILDERS[species];
    if (!build) return null;
    const mesh = build((Math.random() * 1e9) | 0);
    mesh.position.set(x, Math.max(this.terrain.heightAt(x, z), 0), z);
    this.scene.add(mesh);
    const a = new Animal(species, mesh, this.terrain);
    this.animals.push(a);
    return a;
  }

  populate(count = 40) {
    const weights = [['deer', 0.32], ['chicken', 0.2], ['boar', 0.18], ['wolf', 0.2], ['bear', 0.1]];
    for (let i = 0; i < count; i++) {
      let x, z, tries = 0;
      do {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * (this.terrain.worldRadius * 0.85);
        x = Math.cos(a) * r; z = Math.sin(a) * r; tries++;
      } while (this.terrain.heightAt(x, z) < 2 && tries < 20);
      const roll = Math.random();
      let acc = 0, species = 'deer';
      for (const [sp, w] of weights) { acc += w; if (roll <= acc) { species = sp; break; } }
      this.spawn(species, x, z);
    }
  }

  update(dt, player, spawnDrop) {
    const cull2 = 230 * 230;
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      // Skip far animals entirely (both update + render) for performance.
      const dx = a.mesh.position.x - player.pos.x, dz = a.mesh.position.z - player.pos.z;
      const far = dx * dx + dz * dz > cull2;
      a.mesh.visible = !far;
      if (!far) a.update(dt, player);
      if (a.dead && a.deadTimer <= 0) {
        // Drop loot and despawn corpse.
        if (spawnDrop) for (const [id, n] of Object.entries(a.def.loot)) spawnDrop(id, n, a.mesh.position);
        this.scene.remove(a.mesh);
        this.animals.splice(i, 1);
      }
    }
    // Light respawn to keep the world alive.
    if (this.animals.length < 30 && Math.random() < dt * 0.2) {
      const a = Math.random() * Math.PI * 2;
      const r = player ? 60 + Math.random() * 40 : 100;
      const x = (player ? player.pos.x : 0) + Math.cos(a) * r;
      const z = (player ? player.pos.z : 0) + Math.sin(a) * r;
      if (this.terrain.heightAt(x, z) > 2) {
        const sp = Math.random() < 0.5 ? 'deer' : (Math.random() < 0.5 ? 'wolf' : 'boar');
        this.spawn(sp, x, z);
      }
    }
  }
}
