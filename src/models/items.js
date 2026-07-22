import * as THREE from 'three';
import { MAT } from './materials.js';

// Procedural models for every tool, weapon, resource and food item. The same
// builder is reused for: the held first-person viewmodel, the dropped world
// item, and the rendered inventory icon. Origin is the grip point for tools so
// the hand can hold them naturally.

const stoneHeadMat = () => new THREE.MeshStandardMaterial({ color: 0x8b877e, roughness: 0.9, metalness: 0.0, flatShading: true });
const bindingMat = () => new THREE.MeshStandardMaterial({ color: 0x5a4326, roughness: 0.95 });

function handle(len = 0.9, r = 0.028) {
  const h = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, len, 8), MAT.wood(0x7a5230));
  h.castShadow = true;
  return h;
}

export function buildHatchet() {
  const g = new THREE.Group();
  const h = handle(0.9, 0.028);
  h.position.y = 0.12;
  g.add(h);
  // Head near the top: a poll block + a triangular stone blade.
  const head = new THREE.Group();
  head.position.set(0, 0.52, 0);
  const poll = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.07), stoneHeadMat());
  head.add(poll);
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.135, 0.26, 3), stoneHeadMat());
  blade.rotation.z = -Math.PI / 2;       // lay the wedge along +X
  blade.scale.set(1, 1, 0.42);           // flatten into a blade
  blade.position.set(0.13, 0, 0);
  head.add(blade);
  head.rotation.z = -0.22;
  g.add(head);
  const bind = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.09, 8), bindingMat());
  bind.position.y = 0.5;
  g.add(bind);
  g.userData.grip = new THREE.Vector3(0, 0.08, 0);
  return g;
}

export function buildPickaxe() {
  const g = new THREE.Group();
  const h = handle(0.98, 0.03);
  h.position.y = 0.1;
  g.add(h);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.5, 5), stoneHeadMat());
  head.rotation.z = Math.PI / 2;
  head.position.y = 0.56;
  head.geometry.scale(1, 1, 0.6);
  g.add(head);
  // curve the two tips down a bit
  const tipA = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 5), stoneHeadMat());
  tipA.position.set(0.26, 0.52, 0); tipA.rotation.z = Math.PI / 2 + 0.5;
  const tipB = tipA.clone(); tipB.position.x = -0.26; tipB.rotation.z = Math.PI / 2 - 0.5;
  g.add(tipA, tipB);
  const bind = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8), bindingMat());
  bind.position.y = 0.56;
  g.add(bind);
  g.userData.grip = new THREE.Vector3(0, 0.05, 0);
  return g;
}

export function buildSpear() {
  const g = new THREE.Group();
  const shaft = handle(1.5, 0.024);
  shaft.position.y = 0.35;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 6), stoneHeadMat());
  tip.position.y = 1.24;
  g.add(tip);
  const bind = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), bindingMat());
  bind.position.y = 1.06;
  g.add(bind);
  g.userData.grip = new THREE.Vector3(0, 0.2, 0);
  return g;
}

export function buildBow() {
  const g = new THREE.Group();
  const mat = MAT.wood(0x6d4a24);
  // Bow limb as a curved tube.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.6, 0.18),
    new THREE.Vector3(0, -0.3, 0.02),
    new THREE.Vector3(0, 0, -0.04),
    new THREE.Vector3(0, 0.3, 0.02),
    new THREE.Vector3(0, 0.6, 0.18),
  ]);
  const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.02, 6), mat);
  limb.castShadow = true;
  g.add(limb);
  // String.
  const string = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, 1.2, 4),
    new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.8 })
  );
  string.position.z = 0.18;
  g.add(string);
  g.userData.grip = new THREE.Vector3(0, 0, 0);
  return g;
}

export function buildTorch() {
  const g = new THREE.Group();
  const stick = handle(0.6, 0.022);
  stick.position.y = 0.0;
  g.add(stick);
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.16, 8), MAT.cloth(0x3a2a18));
  wrap.position.y = 0.34;
  g.add(wrap);
  // Flame (emissive) + point light. The light is toggled by the holder.
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.24, 8),
    new THREE.MeshStandardMaterial({ color: 0x120a05, emissive: 0xff7a1a, emissiveIntensity: 4, roughness: 1 })
  );
  flame.position.y = 0.5;
  g.add(flame);
  const light = new THREE.PointLight(0xff8a3a, 6, 16, 2);
  light.position.y = 0.5;
  g.add(light);
  g.userData.grip = new THREE.Vector3(0, -0.25, 0);
  g.userData.flame = flame;
  g.userData.light = light;
  return g;
}

export function buildHammer() {
  const g = new THREE.Group();
  const h = handle(0.5, 0.026);
  g.add(h);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.1), MAT.wood(0x8a5f30));
  head.position.y = 0.26;
  g.add(head);
  g.userData.grip = new THREE.Vector3(0, -0.05, 0);
  return g;
}

export function buildRockTool() {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), stoneHeadMat());
  rock.scale.set(1, 0.8, 0.7);
  rock.castShadow = true;
  g.add(rock);
  g.userData.grip = new THREE.Vector3(0, 0, 0);
  return g;
}

export function buildBoneKnife() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.34, 5), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6 }));
  blade.position.y = 0.24; blade.rotation.x = Math.PI; blade.scale.set(1, 1, 0.4);
  g.add(blade);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.16, 7), bindingMat());
  grip.position.y = 0.0;
  g.add(grip);
  g.userData.grip = new THREE.Vector3(0, 0, 0);
  return g;
}

// --- Resource / food / misc item models (used for drops + icons) -----------

export function buildWood() {
  const g = new THREE.Group();
  const mat = MAT.wood(0x6f4a24);
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8), mat);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, 0.06 + (i % 2) * 0.1, (i - 1) * 0.1);
    g.add(log);
  }
  return g;
}

export function buildStone() {
  const g = new THREE.Group();
  const mat = stoneHeadMat();
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08 + Math.random() * 0.05), mat);
    c.position.set((Math.random() - 0.5) * 0.2, 0.06 + Math.random() * 0.06, (Math.random() - 0.5) * 0.2);
    c.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    g.add(c);
  }
  return g;
}

export function buildOre(color = 0xb7a98f, metalness = 0.7) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness, flatShading: true });
  const stone = stoneHeadMat();
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09), stone);
    c.position.set((Math.random() - 0.5) * 0.22, 0.06 + Math.random() * 0.05, (Math.random() - 0.5) * 0.22);
    g.add(c);
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), mat);
    cr.position.copy(c.position).y += 0.05;
    g.add(cr);
  }
  return g;
}

export function buildCloth() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.24), MAT.cloth(0xbfa980));
  m.position.y = 0.05;
  g.add(m);
  return g;
}

export function buildMeat(cooked = false) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: cooked ? 0x7a4a2a : 0xb0464e, roughness: 0.6 });
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat);
  m.scale.set(1.2, 0.7, 0.9); m.position.y = 0.08;
  g.add(m);
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0xe8e2d0 }));
  bone.rotation.z = Math.PI / 2.4; bone.position.set(0.12, 0.1, 0);
  g.add(bone);
  return g;
}

export function buildBerries() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xb02a3a, roughness: 0.4 });
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 6), mat);
    b.position.set((Math.random() - 0.5) * 0.2, 0.06 + Math.random() * 0.05, (Math.random() - 0.5) * 0.2);
    g.add(b);
  }
  return g;
}

export function buildWaterJug(filled = true) {
  const g = new THREE.Group();
  const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.28, 10), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.7 }));
  jug.position.y = 0.16;
  g.add(jug);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8), jug.material);
  neck.position.y = 0.33;
  g.add(neck);
  if (filled) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x2a80b0, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }));
    w.position.y = 0.14;
    g.add(w);
  }
  g.userData.grip = new THREE.Vector3(0, 0.1, 0);
  return g;
}

export function buildArrow() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.6, 5), MAT.wood(0x7a5230));
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 5), stoneHeadMat());
  tip.rotation.x = Math.PI / 2; tip.position.z = 0.32;
  g.add(tip);
  const fletch = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  fletch.position.z = -0.26;
  g.add(fletch);
  return g;
}

// Registry: item id → builder. Anything not here falls back to a generic cube.
export const ITEM_MODELS = {
  hatchet: buildHatchet,
  pickaxe: buildPickaxe,
  spear: buildSpear,
  bow: buildBow,
  torch: buildTorch,
  hammer: buildHammer,
  rock: buildRockTool,
  knife: buildBoneKnife,
  wood: buildWood,
  stone: buildStone,
  metalOre: () => buildOre(0xb7a98f, 0.7),
  metalFrag: () => buildOre(0xcfc3a3, 0.9),
  sulfurOre: () => buildOre(0xe8d24a, 0.1),
  cloth: buildCloth,
  rawMeat: () => buildMeat(false),
  cookedMeat: () => buildMeat(true),
  berries: buildBerries,
  waterJug: () => buildWaterJug(true),
  arrow: buildArrow,
};

export function buildItemModel(id) {
  const b = ITEM_MODELS[id];
  if (b) return b();
  // Generic fallback.
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), MAT.wood(0x888888)));
  return g;
}
