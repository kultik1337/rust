import * as THREE from 'three';
import { MAT } from './materials.js';

// Building pieces snap to a 3-metre grid. Each returns a Group carrying:
//   userData.aabbs      → solid boxes (local space) used for player collision
//   userData.platforms  → horizontal surfaces the player can stand on
//   userData.snapType   → 'foundation' | 'wall' | 'floor' | 'stairs'
// Placement/rotation happens in 90° steps so axis-aligned boxes stay valid.

export const GRID = 3;         // footprint size
export const WALL_H = 3;       // wall height
const SLAB_H = 0.3;

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function tierMat(tier) {
  if (tier === 'stone') return MAT.rock(0x9a958c);
  if (tier === 'metal') return MAT.metal(0x8b9096);
  return MAT.wood(0x8a5f30);
}

export function makeFoundation(tier = 'wood') {
  const g = new THREE.Group();
  const mat = tierMat(tier);
  const slab = box(GRID, SLAB_H, GRID, mat);
  slab.position.y = SLAB_H / 2;
  g.add(slab);
  // Corner posts to suggest structure.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = box(0.28, 0.5, 0.28, mat);
    post.position.set(sx * (GRID / 2 - 0.2), SLAB_H + 0.2, sz * (GRID / 2 - 0.2));
    g.add(post);
  }
  g.userData = {
    type: 'build', snapType: 'foundation', tier,
    platforms: [{ cx: 0, cz: 0, hx: GRID / 2, hz: GRID / 2, top: SLAB_H }],
    aabbs: [],
    height: SLAB_H,
  };
  return g;
}

export function makeWall(tier = 'wood') {
  const g = new THREE.Group();
  const mat = tierMat(tier);
  const wall = box(GRID, WALL_H, 0.16, mat);
  wall.position.y = WALL_H / 2;
  g.add(wall);
  g.userData = {
    type: 'build', snapType: 'wall', tier,
    aabbs: [{ cx: 0, cy: WALL_H / 2, cz: 0, hx: GRID / 2, hy: WALL_H / 2, hz: 0.12 }],
    platforms: [],
    height: WALL_H,
  };
  return g;
}

export function makeDoorway(tier = 'wood') {
  const g = new THREE.Group();
  const mat = tierMat(tier);
  const sideW = 0.6, gap = GRID - sideW * 2;
  for (const s of [-1, 1]) {
    const post = box(sideW, WALL_H, 0.16, mat);
    post.position.set(s * (GRID / 2 - sideW / 2), WALL_H / 2, 0);
    g.add(post);
  }
  const lintelH = 0.6;
  const lintel = box(gap, lintelH, 0.16, mat);
  lintel.position.set(0, WALL_H - lintelH / 2, 0);
  g.add(lintel);
  g.userData = {
    type: 'build', snapType: 'wall', tier,
    aabbs: [
      { cx: -(GRID / 2 - sideW / 2), cy: WALL_H / 2, cz: 0, hx: sideW / 2, hy: WALL_H / 2, hz: 0.12 },
      { cx: (GRID / 2 - sideW / 2), cy: WALL_H / 2, cz: 0, hx: sideW / 2, hy: WALL_H / 2, hz: 0.12 },
      { cx: 0, cy: WALL_H - lintelH / 2, cz: 0, hx: gap / 2, hy: lintelH / 2, hz: 0.12 },
    ],
    platforms: [],
    height: WALL_H,
  };
  return g;
}

export function makeWindow(tier = 'wood') {
  const g = new THREE.Group();
  const mat = tierMat(tier);
  // Bottom, top, and two side segments leaving a central window gap.
  const gapW = 1.4, gapY0 = 1.1, gapY1 = 2.1;
  const bottom = box(GRID, gapY0, 0.16, mat); bottom.position.y = gapY0 / 2; g.add(bottom);
  const top = box(GRID, WALL_H - gapY1, 0.16, mat); top.position.y = (WALL_H + gapY1) / 2; g.add(top);
  for (const s of [-1, 1]) {
    const side = box((GRID - gapW) / 2, gapY1 - gapY0, 0.16, mat);
    side.position.set(s * (GRID / 2 - (GRID - gapW) / 4), (gapY0 + gapY1) / 2, 0);
    g.add(side);
  }
  g.userData = {
    type: 'build', snapType: 'wall', tier,
    aabbs: [
      { cx: 0, cy: gapY0 / 2, cz: 0, hx: GRID / 2, hy: gapY0 / 2, hz: 0.12 },
      { cx: 0, cy: (WALL_H + gapY1) / 2, cz: 0, hx: GRID / 2, hy: (WALL_H - gapY1) / 2, hz: 0.12 },
      { cx: -(GRID / 2 - (GRID - gapW) / 4), cy: (gapY0 + gapY1) / 2, cz: 0, hx: (GRID - gapW) / 4, hy: (gapY1 - gapY0) / 2, hz: 0.12 },
      { cx: (GRID / 2 - (GRID - gapW) / 4), cy: (gapY0 + gapY1) / 2, cz: 0, hx: (GRID - gapW) / 4, hy: (gapY1 - gapY0) / 2, hz: 0.12 },
    ],
    platforms: [],
    height: WALL_H,
  };
  return g;
}

export function makeFloor(tier = 'wood') {
  const g = new THREE.Group();
  const mat = tierMat(tier);
  const slab = box(GRID, 0.18, GRID, mat);
  slab.position.y = WALL_H;      // sits on top of walls
  g.add(slab);
  // Support beams under the slab.
  for (const sx of [-1, 1]) {
    const beam = box(0.2, 0.2, GRID, mat);
    beam.position.set(sx * (GRID / 2 - 0.15), WALL_H - 0.18, 0);
    g.add(beam);
  }
  g.userData = {
    type: 'build', snapType: 'floor', tier,
    platforms: [{ cx: 0, cz: 0, hx: GRID / 2, hz: GRID / 2, top: WALL_H + 0.09 }],
    aabbs: [],
    height: WALL_H + 0.18,
  };
  return g;
}

export function makeStairs(tier = 'wood') {
  const g = new THREE.Group();
  const mat = tierMat(tier);
  const steps = 6;
  const platforms = [];
  for (let i = 0; i < steps; i++) {
    const h = (i + 1) / steps * WALL_H;
    const d = GRID / steps;
    const s = box(GRID, h, d, mat);
    const z = GRID / 2 - d / 2 - i * d;
    s.position.set(0, h / 2, z);
    g.add(s);
    platforms.push({ cx: 0, cz: z, hx: GRID / 2, hz: d / 2, top: h });
  }
  g.userData = {
    type: 'build', snapType: 'floor', tier, isRamp: true,
    platforms,
    aabbs: [],
    height: WALL_H,
  };
  return g;
}

export const BUILD_MODELS = {
  foundation: makeFoundation,
  wall: makeWall,
  doorway: makeDoorway,
  window: makeWindow,
  floor: makeFloor,
  stairs: makeStairs,
};
