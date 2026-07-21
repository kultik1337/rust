import * as THREE from 'three';

// Lightweight collision world. The player is a vertical capsule approximated as
// a circle in XZ plus a [feet, head] vertical span. Static geometry is stored as
// cylinders (trees/rocks), axis-aligned boxes (walls/deployables) and horizontal
// platforms (foundations/floors/stairs) that can be stood on.
export class PhysicsWorld {
  constructor(terrain) {
    this.terrain = terrain;
    this.cylinders = [];   // { x, z, r, baseY, topY, id }
    this.boxes = [];       // { minX,minY,minZ, maxX,maxY,maxZ, id }
    this.platforms = [];   // { x0,x1,z0,z1, top, id }
    this.stepHeight = 0.65;
  }

  addCylinder(x, z, r, baseY, height, id) {
    this.cylinders.push({ x, z, r, baseY, topY: baseY + height, id });
  }
  addBox(min, max, id) {
    this.boxes.push({ minX: min.x, minY: min.y, minZ: min.z, maxX: max.x, maxY: max.y, maxZ: max.z, id });
  }
  addPlatform(x0, x1, z0, z1, top, id) {
    this.platforms.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), top, id });
  }
  removeById(id) {
    this.cylinders = this.cylinders.filter((c) => c.id !== id);
    this.boxes = this.boxes.filter((b) => b.id !== id);
    this.platforms = this.platforms.filter((p) => p.id !== id);
  }

  // Highest standable surface under (x,z) that isn't higher than feet+step.
  supportHeight(x, z, feetY) {
    let g = this.terrain.heightAt(x, z);
    const tol = feetY + this.stepHeight + 0.05;
    for (const p of this.platforms) {
      if (x >= p.x0 - 0.05 && x <= p.x1 + 0.05 && z >= p.z0 - 0.05 && z <= p.z1 + 0.05) {
        if (p.top <= tol && p.top > g) g = p.top;
      }
    }
    for (const b of this.boxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
        if (b.maxY <= tol && b.maxY > g) g = b.maxY;
      }
    }
    return g;
  }

  // Resolve horizontal overlaps for a player circle at [feetY, headY].
  resolveHorizontal(pos, r, feetY, headY) {
    // Cylinders (trees / rocks): push radially out.
    for (const c of this.cylinders) {
      if (headY < c.baseY || feetY > c.topY) continue;
      let dx = pos.x - c.x, dz = pos.z - c.z;
      let d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d < min && d > 1e-5) {
        const push = (min - d);
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      } else if (d <= 1e-5) {
        pos.x += min; // degenerate: nudge
      }
    }
    // Boxes (walls / deployables): circle-vs-AABB in XZ with vertical overlap check.
    for (const b of this.boxes) {
      if (headY < b.minY + 0.05 || feetY > b.maxY - 0.05) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      let dx = pos.x - cx, dz = pos.z - cz;
      let d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-5) {
          const push = r - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // Center inside the box → push out on the axis of least penetration.
          const penX = Math.min(pos.x - b.minX, b.maxX - pos.x);
          const penZ = Math.min(pos.z - b.minZ, b.maxZ - pos.z);
          if (penX < penZ) pos.x += (pos.x - (b.minX + b.maxX) / 2 > 0 ? 1 : -1) * (penX + r);
          else pos.z += (pos.z - (b.minZ + b.maxZ) / 2 > 0 ? 1 : -1) * (penZ + r);
        }
      }
    }
  }
}
