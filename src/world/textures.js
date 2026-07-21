import * as THREE from 'three';
import { Noise, clamp } from '../core/noise.js';

// All textures in the game are generated procedurally on <canvas> at load time.
// No external image files are used anywhere.

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Build a height field (Float array) on a tiling grid using fbm, then reuse it
// for albedo / roughness / normal so they stay consistent.
function tileHeight(size, noise, scale, octaves) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sample on a torus so the texture tiles seamlessly.
      const a = (x / size) * Math.PI * 2, b = (y / size) * Math.PI * 2;
      const nx = Math.cos(a) * scale, ny = Math.sin(a) * scale;
      const nz = Math.cos(b) * scale, nw = Math.sin(b) * scale;
      let amp = 0.5, freq = 1, sum = 0, norm = 0;
      for (let o = 0; o < octaves; o++) {
        // 4D simplex sampled on a torus → seamlessly tileable in 2D.
        sum += amp * noise.simplex.noise4d(nx * freq, ny * freq, nz * freq, nw * freq);
        norm += amp; amp *= 0.5; freq *= 2;
      }
      h[y * size + x] = sum / norm; // ~ -1..1
    }
  }
  return h;
}

// Derive a tangent-space normal map from a height field.
function normalFromHeight(h, size, strength = 2.0) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nz = 1.0;
      const len = Math.hypot(dx, dy, nz);
      const i = (y * size + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / len) * 0.5 * 255 + 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTexture(c, repeat = 1, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// --- Ground detail (used by the terrain material) ---
export function makeGroundTextures() {
  const size = 256;
  const noise = new Noise(9911);
  const h = tileHeight(size, noise, 3.0, 5);

  // Roughness: rougher in crevices, slightly smoother on bumps.
  const rc = canvas(size), rctx = rc.getContext('2d');
  const rimg = rctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = clamp(0.82 + h[i] * 0.12, 0, 1) * 255;
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = v;
    rimg.data[i * 4 + 3] = 255;
  }
  rctx.putImageData(rimg, 0, 0);

  // Subtle albedo grain to break up flat vertex colours.
  const ac = canvas(size), actx = ac.getContext('2d');
  const aimg = actx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = clamp(0.86 + h[i] * 0.14, 0, 1) * 255;
    aimg.data[i * 4] = aimg.data[i * 4 + 1] = aimg.data[i * 4 + 2] = v;
    aimg.data[i * 4 + 3] = 255;
  }
  actx.putImageData(aimg, 0, 0);

  const normal = normalFromHeight(h, size, 2.6);
  return {
    map: toTexture(ac, 40, true),
    roughnessMap: toTexture(rc, 40),
    normalMap: toTexture(normal, 40),
  };
}

// --- Bark ---
export function makeBarkTexture() {
  const size = 256, noise = new Noise(4242);
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Vertical fibrous streaks + noise.
      const streak = Math.sin(x * 0.28 + noise.n2(x * 0.05, y * 0.02) * 4) * 0.5 + 0.5;
      const n = noise.fbm(x * 0.04, y * 0.02, 4) * 0.5 + 0.5;
      const v = clamp(0.28 + streak * 0.22 + n * 0.28, 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = v * 120 + 40;
      img.data[i + 1] = v * 85 + 26;
      img.data[i + 2] = v * 55 + 16;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const h = tileHeight(size, noise, 4, 4);
  return { map: toTexture(c, 1, true), normalMap: toTexture(normalFromHeight(h, size, 3.2), 1) };
}

// --- Rock ---
export function makeRockTexture() {
  const size = 256, noise = new Noise(7321);
  const h = tileHeight(size, noise, 3.5, 5);
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = clamp(0.45 + h[i] * 0.35, 0, 1);
    img.data[i * 4] = v * 150 + 40;
    img.data[i * 4 + 1] = v * 145 + 40;
    img.data[i * 4 + 2] = v * 140 + 42;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c, 1, true), normalMap: toTexture(normalFromHeight(h, size, 3.0), 1) };
}

// --- Brushed metal ---
export function makeMetalTexture() {
  const size = 256, noise = new Noise(5150);
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const brush = Math.sin(y * 0.9) * 0.04 + noise.n2(x * 0.02, y * 0.2) * 0.06;
      const rust = clamp(noise.fbm(x * 0.03, y * 0.03, 4), 0, 1);
      const v = clamp(0.55 + brush, 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (v * 150 + rust * 60) ;
      img.data[i + 1] = (v * 150 + rust * 20);
      img.data[i + 2] = (v * 155);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { map: toTexture(c, 1, true) };
}

// --- Cloth / fabric ---
export function makeClothTexture() {
  const size = 128, noise = new Noise(2024);
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const weave = (Math.sin(x * 0.9) * Math.sin(y * 0.9)) * 0.12;
      const n = noise.fbm(x * 0.06, y * 0.06, 3) * 0.1;
      const v = clamp(0.6 + weave + n, 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = v * 120 + 40;
      img.data[i + 1] = v * 95 + 30;
      img.data[i + 2] = v * 70 + 22;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const h = tileHeight(size, noise, 5, 3);
  return { map: toTexture(c, 1, true), normalMap: toTexture(normalFromHeight(h, size, 1.5), 1) };
}

// A shared water normal map for the Water object.
export function makeWaterNormals() {
  const size = 256, noise = new Noise(1234);
  const h = tileHeight(size, noise, 4, 4);
  const t = toTexture(normalFromHeight(h, size, 1.6), 1);
  return t;
}
