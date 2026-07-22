import * as THREE from 'three';

// A tiny pooled particle system for hit debris (wood chips / stone shards) and
// rising campfire embers. Particles fade by shrinking so we can share materials
// and keep everything cheap.
export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.max = 260;
    this.chipGeo = new THREE.TetrahedronGeometry(0.055);
    this.emberGeo = new THREE.SphereGeometry(0.035, 5, 4);
    this.mats = {};
  }

  _mat(color, emissive) {
    const key = color + (emissive ? 'e' : '');
    return (this.mats[key] ||= new THREE.MeshStandardMaterial({
      color, emissive: emissive ? color : 0x000000, emissiveIntensity: emissive ? 4 : 0,
      roughness: 0.85, metalness: 0, toneMapped: !emissive,
    }));
  }

  _spawn(geo, mat, pos, vel, life, grav, spin) {
    if (this.items.length >= this.max) {
      const old = this.items.shift(); this.scene.remove(old.m);
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos);
    m.scale.setScalar(0.6 + Math.random() * 0.8);
    this.scene.add(m);
    this.items.push({ m, v: vel, life, maxLife: life, grav, spin });
  }

  burst(pos, color, count = 8, speed = 3, up = 2.4) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * speed, up * (0.4 + Math.random()), (Math.random() - 0.5) * speed);
      this._spawn(this.chipGeo, this._mat(color, false), pos, v, 0.5 + Math.random() * 0.5, -12,
        new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8));
    }
  }

  ember(pos) {
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 0.5);
    this._spawn(this.emberGeo, this._mat(0xff7a26, true), pos, v, 0.9 + Math.random() * 0.8, 1.5, null);
  }

  splash(pos) {
    for (let i = 0; i < 6; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2);
      this._spawn(this.emberGeo, this._mat(0x9fd0e8, false), pos, v, 0.5, -10, null);
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) { this.scene.remove(p.m); this.items.splice(i, 1); continue; }
      p.v.y += p.grav * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.spin) { p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt; }
      const t = p.life / p.maxLife;
      p.m.scale.setScalar(Math.max(0.02, t) * (0.6 + 0.4));
    }
  }
}
