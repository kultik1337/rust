// Deterministic noise + PRNG utilities used across world and model generation.
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

// mulberry32: tiny, fast, seedable PRNG. Returns floats in [0, 1).
export function makeRNG(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string to a 32-bit integer seed.
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A SimplexNoise wrapper that accepts a seed so worlds are reproducible.
export class Noise {
  constructor(seed = 1337) {
    const rng = makeRNG(seed);
    this.simplex = new SimplexNoise({ random: rng });
  }
  // 2D simplex in [-1, 1]
  n2(x, y) { return this.simplex.noise(x, y); }
  n3(x, y, z) { return this.simplex.noise3d(x, y, z); }

  // Fractal Brownian motion: sum of octaves. Returns roughly [-1, 1].
  fbm(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
    let amp = 0.5, freq = 1.0, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.simplex.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  // Ridged multifractal — gives sharp mountain ridges.
  ridged(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
    let amp = 0.5, freq = 1.0, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.simplex.noise(x * freq, y * freq));
      sum += amp * n * n;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
