import * as THREE from 'three';
import {
  makeBarkTexture, makeRockTexture, makeMetalTexture, makeClothTexture,
} from '../world/textures.js';

// Lazily-built, shared PBR materials so we don't create thousands of duplicates
// (trees/rocks reuse the same material instances → far fewer draw-state changes).
class MaterialLibrary {
  constructor() { this._cache = {}; }
  _get(key, make) { return (this._cache[key] ||= make()); }

  bark() {
    return this._get('bark', () => {
      const t = makeBarkTexture();
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92, metalness: 0 });
    });
  }
  leaves(color = 0x3f6b2a) {
    return this._get('leaves_' + color, () => new THREE.MeshStandardMaterial({
      color, roughness: 0.82, metalness: 0, flatShading: true,
    }));
  }
  pineNeedles() { return this.leaves(0x2f5330); }
  rock(tint = 0x8a8880) {
    return this._get('rock_' + tint, () => {
      const t = makeRockTexture();
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, color: tint, roughness: 0.95, metalness: 0, flatShading: false });
    });
  }
  ore(tint) { return this.rock(tint); }
  wood(color = 0x9c6b3a) {
    return this._get('wood_' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 }));
  }
  metal(color = 0x9aa0a6) {
    return this._get('metal_' + color, () => {
      const t = makeMetalTexture();
      return new THREE.MeshStandardMaterial({ map: t.map, color, roughness: 0.42, metalness: 0.9 });
    });
  }
  darkMetal() { return this.metal(0x53585e); }
  cloth(color = 0x8a5a34) {
    return this._get('cloth_' + color, () => {
      const t = makeClothTexture();
      return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, color, roughness: 0.95, metalness: 0 });
    });
  }
  skin(color = 0xd8a56b) {
    return this._get('skin_' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0 }));
  }
  fur(color) {
    return this._get('fur_' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: true }));
  }
  emissive(color = 0xff7a1a, intensity = 3) {
    // Not cached — fire lights vary per instance.
    return new THREE.MeshStandardMaterial({ color: 0x120a05, emissive: color, emissiveIntensity: intensity, roughness: 1 });
  }
  plant(color = 0x4b7a2a) {
    return this._get('plant_' + color, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, flatShading: true }));
  }
}

export const MAT = new MaterialLibrary();
