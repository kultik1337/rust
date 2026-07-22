import * as THREE from 'three';
import { MAT } from './materials.js';
import { makeRNG } from '../core/noise.js';

// --- helpers ---------------------------------------------------------------

// Randomly displace an icosahedron's vertices to make an organic boulder.
function deform(geo, amount, rng) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let d = seen.get(key);
    if (d === undefined) { d = 1 + (rng() - 0.5) * amount; seen.set(key, d); }
    v.multiplyScalar(d);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function shadowize(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

// --- Trees -----------------------------------------------------------------

export function makePineTree(seed = Math.random() * 1e9) {
  const rng = makeRNG(seed | 0);
  const g = new THREE.Group();
  const height = 9 + rng() * 7;
  const trunkR = 0.28 + rng() * 0.14;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkR * 0.6, trunkR, height, 8, 1),
    MAT.bark()
  );
  trunk.position.y = height / 2;
  g.add(trunk);

  // Stacked needle cones, largest at the bottom.
  const tiers = 4 + Math.floor(rng() * 3);
  const needleMat = MAT.pineNeedles();
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = (1 - t) * (2.2 + rng() * 0.6) + 0.35;
    const ch = height * 0.28;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, ch, 9), needleMat);
    cone.position.y = height * 0.32 + t * height * 0.62;
    cone.rotation.y = rng() * Math.PI;
    g.add(cone);
  }

  g.userData = {
    type: 'resource', resource: 'tree', kind: 'pine',
    tool: 'chop', yield: { wood: 40 }, health: 120,
    collider: { radius: trunkR + 0.15, height },
  };
  return shadowize(g);
}

export function makeBroadleafTree(seed = Math.random() * 1e9) {
  const rng = makeRNG(seed | 0);
  const g = new THREE.Group();
  const height = 7 + rng() * 5;
  const trunkR = 0.32 + rng() * 0.18;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(trunkR * 0.7, trunkR, height, 9),
    MAT.bark()
  );
  trunk.position.y = height / 2;
  // Slight lean for character.
  const lean = (rng() - 0.5) * 0.12;
  g.rotation.z = lean;
  g.add(trunk);

  // A few forking branches.
  const leafMat = MAT.leaves(0x3f6b2a);
  const branches = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < branches; i++) {
    const a = (i / branches) * Math.PI * 2 + rng();
    const bl = 1.4 + rng() * 1.4;
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, bl, 6), MAT.bark());
    br.position.set(Math.cos(a) * 0.4, height * (0.6 + rng() * 0.25), Math.sin(a) * 0.4);
    br.rotation.set(Math.PI / 2.6 * Math.cos(a), 0, -Math.PI / 2.6 * Math.sin(a));
    g.add(br);
  }

  // Canopy: overlapping deformed icospheres.
  const blobs = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < blobs; i++) {
    const r = 1.5 + rng() * 1.6;
    const geo = deform(new THREE.IcosahedronGeometry(r, 1), 0.5, rng);
    const blob = new THREE.Mesh(geo, leafMat);
    const a = rng() * Math.PI * 2, rad = rng() * 1.8;
    blob.position.set(Math.cos(a) * rad, height + 0.5 + (rng() - 0.3) * 2, Math.sin(a) * rad);
    g.add(blob);
  }

  g.userData = {
    type: 'resource', resource: 'tree', kind: 'broadleaf',
    tool: 'chop', yield: { wood: 55 }, health: 150,
    collider: { radius: trunkR + 0.15, height },
  };
  return shadowize(g);
}

export function makeDeadTree(seed = Math.random() * 1e9) {
  const rng = makeRNG(seed | 0);
  const g = new THREE.Group();
  const height = 5 + rng() * 4;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.34, height, 7),
    MAT.bark()
  );
  trunk.position.y = height / 2;
  g.add(trunk);
  const branches = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < branches; i++) {
    const bl = 1 + rng() * 2;
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.1, bl, 5), MAT.bark());
    const a = rng() * Math.PI * 2;
    br.position.set(0, height * (0.4 + rng() * 0.5), 0);
    br.rotation.set(Math.PI / 3 * Math.cos(a), a, Math.PI / 3 * Math.sin(a));
    g.add(br);
  }
  g.userData = {
    type: 'resource', resource: 'tree', kind: 'dead',
    tool: 'chop', yield: { wood: 25 }, health: 70,
    collider: { radius: 0.4, height },
  };
  return shadowize(g);
}

// --- Rocks & ore ----------------------------------------------------------

export function makeRock(seed = Math.random() * 1e9) {
  const rng = makeRNG(seed | 0);
  const g = new THREE.Group();
  const scale = 0.9 + rng() * 2.2;
  const geo = deform(new THREE.IcosahedronGeometry(scale, 1), 0.7, rng);
  const rock = new THREE.Mesh(geo, MAT.rock(0x8a8880));
  rock.position.y = scale * 0.45;
  rock.rotation.set(rng() * 0.4, rng() * Math.PI, rng() * 0.4);
  rock.scale.y = 0.7 + rng() * 0.3;
  g.add(rock);
  g.userData = {
    type: 'resource', resource: 'rock', kind: 'stone',
    tool: 'mine', yield: { stone: 45 }, health: 140,
    collider: { radius: scale * 0.9, height: scale },
  };
  return shadowize(g);
}

// An ore node: a boulder studded with coloured mineral crystals.
export function makeOreNode(type = 'metal', seed = Math.random() * 1e9) {
  const rng = makeRNG(seed | 0);
  const g = new THREE.Group();
  const scale = 1.2 + rng() * 1.4;
  const base = new THREE.Mesh(deform(new THREE.IcosahedronGeometry(scale, 1), 0.6, rng), MAT.rock(0x6f6c66));
  base.position.y = scale * 0.5;
  base.scale.y = 0.8;
  g.add(base);

  const veinColor = type === 'metal' ? 0xb7a98f : type === 'sulfur' ? 0xe8d24a : 0x9a9a9a;
  const crystalMat = new THREE.MeshStandardMaterial({
    color: veinColor, metalness: type === 'metal' ? 0.7 : 0.1,
    roughness: type === 'sulfur' ? 0.5 : 0.4, flatShading: true,
  });
  const specks = 10 + Math.floor(rng() * 8);
  for (let i = 0; i < specks; i++) {
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.12 + rng() * 0.16), crystalMat);
    const dir = new THREE.Vector3(rng() - 0.5, rng() * 0.7, rng() - 0.5).normalize();
    cr.position.copy(dir.multiplyScalar(scale * 0.9)).setY(scale * 0.5 + dir.y);
    cr.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    g.add(cr);
  }
  const yields = type === 'metal' ? { metalOre: 50, stone: 20 }
    : type === 'sulfur' ? { sulfurOre: 40, stone: 20 } : { stone: 60 };
  g.userData = {
    type: 'resource', resource: 'rock', kind: type,
    tool: 'mine', yield: yields, health: 200,
    collider: { radius: scale * 0.85, height: scale },
  };
  return shadowize(g);
}

// --- Bushes & plants ------------------------------------------------------

export function makeBush(seed = Math.random() * 1e9) {
  const rng = makeRNG(seed | 0);
  const g = new THREE.Group();
  const mat = MAT.leaves(0x395f24);
  const blobs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < blobs; i++) {
    const r = 0.5 + rng() * 0.6;
    const b = new THREE.Mesh(deform(new THREE.IcosahedronGeometry(r, 1), 0.5, rng), mat);
    b.position.set((rng() - 0.5) * 0.8, r * 0.7 + rng() * 0.3, (rng() - 0.5) * 0.8);
    g.add(b);
  }
  // Edible berries.
  const berryMat = new THREE.MeshStandardMaterial({ color: 0xb02a3a, roughness: 0.5 });
  for (let i = 0; i < 6; i++) {
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), berryMat);
    berry.position.set((rng() - 0.5) * 1.1, 0.5 + rng() * 0.6, (rng() - 0.5) * 1.1);
    g.add(berry);
  }
  g.userData = {
    type: 'resource', resource: 'bush', kind: 'berry',
    tool: 'gather', yield: { berries: 5, cloth: 2 }, health: 20,
    collider: { radius: 0, height: 1 },
  };
  return shadowize(g);
}

export function makeHemp(seed = Math.random() * 1e9) {
  const rng = makeRNG(seed | 0);
  const g = new THREE.Group();
  const mat = MAT.plant(0x5a7a2a);
  const stems = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < stems; i++) {
    const h = 0.6 + rng() * 0.7;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, h, 4), mat);
    const a = (i / stems) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 0.15, h / 2, Math.sin(a) * 0.15);
    leaf.rotation.z = Math.cos(a) * 0.3;
    leaf.rotation.x = Math.sin(a) * 0.3;
    g.add(leaf);
  }
  g.userData = {
    type: 'resource', resource: 'bush', kind: 'hemp',
    tool: 'gather', yield: { cloth: 10 }, health: 15,
    collider: { radius: 0, height: 1 },
  };
  return shadowize(g);
}
