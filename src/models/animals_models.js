import * as THREE from 'three';
import { MAT } from './materials.js';

// Low-poly but properly-proportioned animals. Each builder returns a Group whose
// userData.rig exposes the head and the four legs so the AI/animation code can
// make them walk. Legs are child groups pivoting at the hip.

function leg(mat, len, thick, x, z) {
  const pivot = new THREE.Group();
  pivot.position.set(x, 0, z);
  const seg = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.8, thick, len, 6), mat);
  seg.position.y = -len / 2;
  seg.castShadow = true;
  pivot.add(seg);
  // Little hoof/paw.
  const foot = new THREE.Mesh(new THREE.SphereGeometry(thick * 1.05, 6, 5), mat);
  foot.position.y = -len;
  foot.scale.set(1, 0.6, 1.2);
  pivot.add(foot);
  return pivot;
}

function quadruped(cfg) {
  const {
    bodyColor, bodyLen = 1.6, bodyR = 0.5, legLen = 1.0, legThick = 0.12,
    headR = 0.4, neckLen = 0.5, neckAngle = 0.7, tail = true,
    antlers = false, ears = true, snout = true, hump = false, scale = 1,
  } = cfg;
  const mat = MAT.fur(bodyColor);
  const g = new THREE.Group();

  const bodyH = legLen + bodyR * 0.6;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(bodyR, bodyLen, 4, 10), mat);
  body.rotation.z = Math.PI / 2;
  body.position.y = bodyH;
  body.castShadow = true;
  g.add(body);

  if (hump) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(bodyR * 0.9, 8, 6), mat);
    h.position.set(bodyLen * 0.28, bodyH + bodyR * 0.5, 0);
    h.scale.set(1.1, 0.8, 1);
    g.add(h);
  }

  // Neck + head at the +X front.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(bodyR * 0.5, bodyR * 0.65, neckLen, 8), mat);
  const frontX = bodyLen * 0.5 + bodyR * 0.3;
  neck.position.set(frontX, bodyH + neckLen * 0.35, 0);
  neck.rotation.z = neckAngle;
  g.add(neck);

  const headPivot = new THREE.Group();
  headPivot.position.set(frontX + Math.sin(neckAngle) * neckLen * 0.6, bodyH + neckLen * 0.7, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 10, 8), mat);
  head.scale.set(1.2, 1, 1);
  head.castShadow = true;
  headPivot.add(head);
  if (snout) {
    const sn = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.4, headR * 0.55, headR * 0.9, 7), mat);
    sn.rotation.z = -Math.PI / 2;
    sn.position.set(headR * 0.9, -headR * 0.15, 0);
    headPivot.add(sn);
  }
  if (ears) {
    const earMat = mat;
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(headR * 0.28, headR * 0.7, 5), earMat);
      ear.position.set(-headR * 0.2, headR * 0.7, s * headR * 0.5);
      headPivot.add(ear);
    }
  }
  if (antlers) {
    const antlerMat = MAT.bark();
    for (const s of [-1, 1]) {
      const main = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.7, 5), antlerMat);
      main.position.set(-headR * 0.1, headR * 0.9, s * headR * 0.35);
      main.rotation.x = s * 0.3;
      headPivot.add(main);
      for (let i = 0; i < 2; i++) {
        const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 4), antlerMat);
        tine.position.set(-headR * 0.1, headR * 0.9 + 0.2 + i * 0.18, s * (headR * 0.35 + 0.12 + i * 0.05));
        tine.rotation.x = s * 0.9;
        headPivot.add(tine);
      }
    }
  }
  // Eyes.
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.13, 6, 5), eyeMat);
    eye.position.set(headR * 0.6, headR * 0.15, s * headR * 0.45);
    headPivot.add(eye);
  }
  g.add(headPivot);

  if (tail) {
    const t = new THREE.Mesh(new THREE.ConeGeometry(bodyR * 0.3, bodyR * 1.2, 6), mat);
    t.position.set(-bodyLen * 0.5 - bodyR * 0.2, bodyH + bodyR * 0.2, 0);
    t.rotation.z = Math.PI / 2 + 0.5;
    g.add(t);
  }

  const lx = bodyLen * 0.32, lz = bodyR * 0.7;
  const legs = [
    leg(mat, legLen, legThick, lx, lz), leg(mat, legLen, legThick, lx, -lz),
    leg(mat, legLen, legThick, -lx, lz), leg(mat, legLen, legThick, -lx, -lz),
  ];
  for (const l of legs) { l.position.y = bodyH; g.add(l); }

  g.scale.setScalar(scale);
  g.userData.rig = { head: headPivot, legs, bodyH: bodyH * scale };
  return g;
}

export function makeDeer(seed) {
  const g = quadruped({
    bodyColor: 0x9a6b3f, bodyLen: 1.5, bodyR: 0.42, legLen: 1.15, legThick: 0.1,
    headR: 0.32, neckLen: 0.7, neckAngle: 0.55, antlers: true, scale: 1,
  });
  g.userData.species = 'deer';
  return g;
}

export function makeWolf(seed) {
  const g = quadruped({
    bodyColor: 0x6d6d70, bodyLen: 1.5, bodyR: 0.38, legLen: 0.9, legThick: 0.1,
    headR: 0.34, neckLen: 0.35, neckAngle: 0.2, snout: true, scale: 1,
  });
  g.userData.species = 'wolf';
  return g;
}

export function makeBoar(seed) {
  const g = quadruped({
    bodyColor: 0x4a3b2e, bodyLen: 1.3, bodyR: 0.5, legLen: 0.7, legThick: 0.12,
    headR: 0.36, neckLen: 0.25, neckAngle: 0.15, hump: true, snout: true, scale: 1,
  });
  g.userData.species = 'boar';
  return g;
}

export function makeBear(seed) {
  const g = quadruped({
    bodyColor: 0x3b2a1c, bodyLen: 1.9, bodyR: 0.62, legLen: 1.0, legThick: 0.17,
    headR: 0.46, neckLen: 0.3, neckAngle: 0.2, hump: true, snout: true, scale: 1.15,
  });
  g.userData.species = 'bear';
  return g;
}

export function makeChicken(seed) {
  const g = new THREE.Group();
  const mat = MAT.fur(0xece7dc);
  const bodyH = 0.32;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), mat);
  body.scale.set(1.1, 0.9, 0.9);
  body.position.y = bodyH;
  body.castShadow = true;
  g.add(body);
  const headPivot = new THREE.Group();
  headPivot.position.set(0.22, bodyH + 0.22, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat);
  headPivot.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 5), new THREE.MeshStandardMaterial({ color: 0xd8a13a, roughness: 0.5 }));
  beak.rotation.z = -Math.PI / 2; beak.position.set(0.16, 0, 0);
  headPivot.add(beak);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0xc0303a, roughness: 0.6 }));
  comb.position.set(0, 0.14, 0);
  headPivot.add(comb);
  g.add(headPivot);
  const legMat = new THREE.MeshStandardMaterial({ color: 0xd8a13a, roughness: 0.6 });
  const legs = [];
  for (const s of [-1, 1]) {
    const l = leg(legMat, 0.28, 0.03, 0, s * 0.1);
    l.position.y = bodyH - 0.04;
    legs.push(l); g.add(l);
  }
  g.userData.species = 'chicken';
  g.userData.rig = { head: headPivot, legs, bodyH };
  return g;
}

export const ANIMAL_BUILDERS = {
  deer: makeDeer, wolf: makeWolf, boar: makeBoar, bear: makeBear, chicken: makeChicken,
};
