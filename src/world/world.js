import * as THREE from 'three';
import { Noise, clamp, smoothstep, lerp } from '../core/noise.js';
import { makeGroundTextures } from './textures.js';

// The island terrain. Owns a height field that is both rendered as a mesh and
// sampled analytically by physics/placement so collisions match what you see.
export class Terrain {
  constructor(scene, seed = 1337) {
    this.scene = scene;
    this.noise = new Noise(seed);
    this.size = 720;                 // world extent (metres) on each axis
    this.segments = 288;             // grid resolution
    this.step = this.size / this.segments;
    this.half = this.size / 2;
    this.seaLevel = 0;
    this.worldRadius = 300;          // island radius; beyond this it becomes ocean

    const N = this.segments + 1;
    this.N = N;
    this.heights = new Float32Array(N * N);

    // Precompute the height field.
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -this.half + i * this.step;
        const z = -this.half + j * this.step;
        this.heights[j * N + i] = this._computeHeight(x, z);
      }
    }

    this._buildMesh();
  }

  // Analytic height used to fill the grid. Combines a continent shape, rolling
  // hills, and ridged mountains, then applies a radial island mask so the land
  // sinks into ocean toward the edges.
  _computeHeight(x, z) {
    const n = this.noise;
    const d = Math.hypot(x, z) / this.worldRadius;
    const mask = smoothstep(1.15, 0.32, d);

    const continent = n.fbm(x * 0.0055, z * 0.0055, 5);          // -1..1
    const hills = n.fbm(x * 0.02 + 20, z * 0.02 + 20, 4) * 0.5;
    const ridge = n.ridged(x * 0.011 + 50, z * 0.011 + 50, 5);   // 0..1
    const mountainMask = smoothstep(0.15, 0.7, continent);

    let h = continent * 15 + hills * 5 + ridge * mountainMask * 42;
    // Beaches: flatten a band just above sea level for nicer shorelines.
    h = lerp(h, h * 0.35, smoothstep(3.5, 0.5, Math.abs(h)) * 0.4);
    // Island falloff.
    h = (h + 7) * mask - 7;
    return h;
  }

  _biomeColor(h, slope, out) {
    // Colours chosen to read well under the ACES tonemapper.
    const sand = [0.76, 0.68, 0.48];
    const grass = [0.28, 0.42, 0.16];
    const grassDry = [0.42, 0.44, 0.2];
    const rock = [0.34, 0.32, 0.30];
    const snow = [0.92, 0.94, 0.98];
    const seabed = [0.34, 0.34, 0.28];

    let c;
    if (h < -0.6) c = seabed;
    else if (h < 1.6) c = sand;
    else if (h > 33) c = snow;
    else if (h > 21) c = rock;
    else {
      // Blend grass/dry by a low-frequency patchiness handled by caller noise.
      c = grass;
    }
    // Steep slopes always show rock regardless of height.
    const rockiness = smoothstep(0.55, 0.8, slope);
    out[0] = lerp(c[0], rock[0], rockiness);
    out[1] = lerp(c[1], rock[1], rockiness);
    out[2] = lerp(c[2], rock[2], rockiness);
  }

  _buildMesh() {
    const N = this.N, seg = this.segments, step = this.step, half = this.half;
    const pos = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 3);
    const uv = new Float32Array(N * N * 2);
    const tmp = [0, 0, 0];

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const x = -half + i * step;
        const z = -half + j * step;
        const y = this.heights[idx];
        pos[idx * 3] = x; pos[idx * 3 + 1] = y; pos[idx * 3 + 2] = z;
        // World-space UVs so the detail texture tiles at a fixed ~5 m scale
        // regardless of grid resolution (no stretching).
        const TILE = 5;
        uv[idx * 2] = x / TILE; uv[idx * 2 + 1] = z / TILE;

        // Slope from local gradient.
        const hL = this.heights[j * N + Math.max(0, i - 1)];
        const hR = this.heights[j * N + Math.min(N - 1, i + 1)];
        const hD = this.heights[Math.max(0, j - 1) * N + i];
        const hU = this.heights[Math.min(N - 1, j + 1) * N + i];
        const slope = Math.min(1, (Math.abs(hR - hL) + Math.abs(hU - hD)) / (step * 2) * 1.4);

        this._biomeColor(y, slope, tmp);
        // Add grass patchiness so the plains aren't flat green.
        if (y >= 1.6 && y <= 21 && slope < 0.55) {
          const patch = this.noise.fbm(x * 0.05, z * 0.05, 3) * 0.5 + 0.5;
          tmp[0] = lerp(tmp[0], 0.44, patch * 0.5);
          tmp[1] = lerp(tmp[1], 0.46, patch * 0.3);
          tmp[2] = lerp(tmp[2], 0.18, patch * 0.4);
        }
        col[idx * 3] = tmp[0]; col[idx * 3 + 1] = tmp[1]; col[idx * 3 + 2] = tmp[2];
      }
    }

    const indices = [];
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = j * N + i, b = j * N + i + 1, c = (j + 1) * N + i, d = (j + 1) * N + i + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();

    const tex = makeGroundTextures();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: tex.map,
      roughnessMap: tex.roughnessMap,
      normalMap: tex.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 1.0,
      metalness: 0.0,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'terrain';
    this.scene.add(this.mesh);
  }

  // Bilinear sample of the height field — matches the rendered mesh.
  heightAt(x, z) {
    const N = this.N;
    const fx = (x + this.half) / this.step;
    const fz = (z + this.half) / this.step;
    if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) {
      // Outside the island grid → deep ocean floor.
      return -8;
    }
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const h00 = this.heights[j * N + i];
    const h10 = this.heights[j * N + i + 1];
    const h01 = this.heights[(j + 1) * N + i];
    const h11 = this.heights[(j + 1) * N + i + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.step;
    const hL = this.heightAt(x - e, z), hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e), hU = this.heightAt(x, z + e);
    out.set(hL - hR, 2 * e, hD - hU).normalize();
    return out;
  }

  slopeAt(x, z) {
    const n = this.normalAt(x, z);
    return 1 - n.y; // 0 = flat, →1 = vertical
  }

  biomeAt(x, z) {
    const h = this.heightAt(x, z);
    const slope = this.slopeAt(x, z);
    if (h < this.seaLevel - 0.2) return 'water';
    if (h < 1.6) return 'beach';
    if (slope > 0.6 || h > 21) return 'rock';
    if (h > 33) return 'snow';
    return 'grass';
  }

  // Find a pleasant spawn: flat grass/beach a little inland from the shore.
  findSpawn(rng = Math.random) {
    for (let attempt = 0; attempt < 400; attempt++) {
      const a = rng() * Math.PI * 2;
      const r = 40 + rng() * (this.worldRadius * 0.6);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = this.heightAt(x, z);
      const slope = this.slopeAt(x, z);
      if (h > 2 && h < 14 && slope < 0.3) return new THREE.Vector3(x, h, z);
    }
    return new THREE.Vector3(0, Math.max(2, this.heightAt(0, 0)), 0);
  }
}
