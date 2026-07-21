import * as THREE from 'three';
import { BUILD_MODELS, GRID, WALL_H } from '../models/buildings.js';

const PIECES = ['foundation', 'wall', 'doorway', 'window', 'floor', 'stairs'];
const COST = { foundation: 50, wall: 25, doorway: 30, window: 30, floor: 20, stairs: 25 };

// Handles the building placement loop: snapping a ghost preview to a 3 m grid
// (foundations) or to foundation edges (walls), validating the spot, then
// spawning the real piece and registering its colliders.
export class BuildSystem {
  constructor(scene, terrain, physics, inventory) {
    this.scene = scene;
    this.terrain = terrain;
    this.physics = physics;
    this.inventory = inventory;
    this.active = false;
    this.pieceIndex = 0;
    this.rot = 0;                 // 0..3 → *90°
    this.ghost = null;
    this.valid = false;
    this.placed = [];

    this.foundations = new Map(); // "i,j" → { top }
    this.edges = new Set();       // "i,j,e"
    this.floors = new Set();      // "i,j"
    this.stairsSet = new Set();
  }

  get piece() { return PIECES[this.pieceIndex]; }

  setActive(on) {
    this.active = on;
    if (!on && this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    if (on) this._rebuildGhost();
  }

  cyclePiece(dir = 1) {
    this.pieceIndex = (this.pieceIndex + dir + PIECES.length) % PIECES.length;
    this._rebuildGhost();
  }
  rotate() { this.rot = (this.rot + 1) % 4; }

  _rebuildGhost() {
    if (this.ghost) { this.scene.remove(this.ghost); this.ghost = null; }
    const model = BUILD_MODELS[this.piece]('wood');
    // Replace materials with a translucent overlay for the preview.
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false; o.receiveShadow = false;
        o.material = new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.4, depthWrite: false });
      }
    });
    model.userData.def = BUILD_MODELS[this.piece]('wood').userData; // keep collider spec
    this.ghost = model;
    this.scene.add(model);
  }

  _cellCenter(i, j) { return { x: i * GRID, z: j * GRID }; }
  _cellOf(x, z) { return { i: Math.round(x / GRID), j: Math.round(z / GRID) }; }

  // Compute the snapped transform + validity given the point the player looks at.
  _snap(aimPoint) {
    const piece = this.piece;
    const t = { x: 0, y: 0, z: 0, ry: this.rot * Math.PI / 2, ok: false, reason: '' };
    if (!aimPoint) return t;

    if (piece === 'foundation') {
      const { i, j } = this._cellOf(aimPoint.x, aimPoint.z);
      const c = this._cellCenter(i, j);
      const h = this.terrain.heightAt(c.x, c.z);
      t.x = c.x; t.z = c.z; t.y = h;
      t.cell = { i, j };
      const ok = !this.foundations.has(`${i},${j}`) && h > 0.5 && this.terrain.slopeAt(c.x, c.z) < 0.55;
      t.ok = ok; t.ry = this.rot * Math.PI / 2;
      return t;
    }

    if (piece === 'wall' || piece === 'doorway' || piece === 'window') {
      // Snap to the nearest edge of the foundation cell under the aim point.
      const { i, j } = this._cellOf(aimPoint.x, aimPoint.z);
      const key = `${i},${j}`;
      const f = this.foundations.get(key);
      if (!f) { t.reason = 'need foundation'; return t; }
      const c = this._cellCenter(i, j);
      const dx = aimPoint.x - c.x, dz = aimPoint.z - c.z;
      let e, ex = c.x, ez = c.z, ry;
      if (Math.abs(dx) > Math.abs(dz)) {
        e = dx > 0 ? 'E' : 'W'; ex = c.x + (dx > 0 ? GRID / 2 : -GRID / 2); ry = Math.PI / 2;
      } else {
        e = dz > 0 ? 'S' : 'N'; ez = c.z + (dz > 0 ? GRID / 2 : -GRID / 2); ry = 0;
      }
      t.x = ex; t.z = ez; t.y = f.top; t.ry = ry;
      t.edge = { i, j, e };
      t.ok = !this.edges.has(`${i},${j},${e}`);
      if (!t.ok) t.reason = 'occupied';
      return t;
    }

    if (piece === 'floor') {
      const { i, j } = this._cellOf(aimPoint.x, aimPoint.z);
      const key = `${i},${j}`;
      const f = this.foundations.get(key);
      if (!f) { t.reason = 'need foundation'; return t; }
      const c = this._cellCenter(i, j);
      t.x = c.x; t.z = c.z; t.y = f.top + WALL_H - (WALL_H); // model already offsets to WALL_H
      t.y = f.top; // floor model sits WALL_H above its origin
      t.cell = { i, j };
      t.ok = !this.floors.has(key);
      if (!t.ok) t.reason = 'occupied';
      return t;
    }

    if (piece === 'stairs') {
      const { i, j } = this._cellOf(aimPoint.x, aimPoint.z);
      const key = `${i},${j}`;
      const f = this.foundations.get(key);
      if (!f) { t.reason = 'need foundation'; return t; }
      const c = this._cellCenter(i, j);
      t.x = c.x; t.z = c.z; t.y = f.top; t.ry = this.rot * Math.PI / 2;
      t.cell = { i, j };
      t.ok = !this.stairsSet.has(key);
      return t;
    }
    return t;
  }

  updateGhost(aimPoint) {
    if (!this.active || !this.ghost) return;
    const t = this._snap(aimPoint);
    this.valid = t.ok && this.inventory.totalCount('wood') >= COST[this.piece];
    this._lastSnap = t;
    this.ghost.position.set(t.x, t.y, t.z);
    this.ghost.rotation.y = t.ry;
    const color = this.valid ? 0x55ff88 : 0xff5555;
    this.ghost.traverse((o) => { if (o.isMesh) o.material.color.setHex(color); });
  }

  // Register a placed piece's colliders/platforms, accounting for Y rotation.
  _registerColliders(group, t) {
    const def = BUILD_MODELS[this.piece]('wood').userData;
    const cos = Math.cos(t.ry), sin = Math.sin(t.ry);
    const rotXZ = (x, z) => ({ x: x * cos + z * sin, z: -x * sin + z * cos });
    const swap = Math.abs(Math.sin(t.ry)) > 0.5;
    const id = group.userData.id;
    for (const b of def.aabbs || []) {
      const rc = rotXZ(b.cx, b.cz);
      const hx = swap ? b.hz : b.hx, hz = swap ? b.hx : b.hz;
      const cx = t.x + rc.x, cz = t.z + rc.z, cy = t.y + b.cy;
      this.physics.addBox(
        new THREE.Vector3(cx - hx, cy - b.hy, cz - hz),
        new THREE.Vector3(cx + hx, cy + b.hy, cz + hz), id);
    }
    for (const p of def.platforms || []) {
      const rc = rotXZ(p.cx, p.cz);
      const hx = swap ? p.hz : p.hx, hz = swap ? p.hx : p.hz;
      const cx = t.x + rc.x, cz = t.z + rc.z;
      this.physics.addPlatform(cx - hx, cx + hx, cz - hz, cz + hz, t.y + p.top, id);
    }
  }

  tryPlace() {
    if (!this.active || !this.valid) return false;
    const t = this._lastSnap;
    if (!this.inventory.remove('wood', COST[this.piece])) return false;

    const group = BUILD_MODELS[this.piece]('wood');
    group.position.set(t.x, t.y, t.z);
    group.rotation.y = t.ry;
    group.userData.id = 'build' + (this.placed.length + 1) + '_' + Date.now();
    this.scene.add(group);
    this.placed.push(group);
    this._registerColliders(group, t);

    // Update occupancy bookkeeping.
    if (this.piece === 'foundation') this.foundations.set(`${t.cell.i},${t.cell.j}`, { top: t.y + group.userData.height });
    else if (this.piece === 'floor') this.floors.add(`${t.cell.i},${t.cell.j}`);
    else if (this.piece === 'stairs') this.stairsSet.add(`${t.cell.i},${t.cell.j}`);
    else if (t.edge) this.edges.add(`${t.edge.i},${t.edge.j},${t.edge.e}`);
    return true;
  }
}

export { COST as BUILD_COST, PIECES };
