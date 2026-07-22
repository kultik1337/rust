import { clamp, lerp } from '../core/noise.js';

// Tracks the four survival vitals and applies their interactions:
// starvation/dehydration drain health, cold causes hypothermia, and being
// well-fed + comfortable lets health regenerate.
export class Survival {
  constructor() {
    this.health = 100;
    this.hunger = 100;
    this.thirst = 100;
    this.temp = 65;          // comfort 0..100 (≈50-85 is comfortable)
    this.alive = true;
    this.onDeath = () => {};
    this.onDamage = () => {};
  }

  reset() {
    this.health = 100; this.hunger = 80; this.thirst = 80; this.temp = 65; this.alive = true;
  }

  damage(amount, cause = 'the wilds') {
    if (!this.alive) return;
    this.health = clamp(this.health - amount, 0, 100);
    this.onDamage(amount, cause);
    if (this.health <= 0) { this.alive = false; this.onDeath(cause); }
  }

  heal(a) { this.health = clamp(this.health + a, 0, 100); }

  eat(def) {
    if (!def?.eat) return;
    this.hunger = clamp(this.hunger + (def.eat.hunger || 0), 0, 100);
    this.thirst = clamp(this.thirst + (def.eat.thirst || 0), 0, 100);
    if (def.eat.health) this.health = clamp(this.health + def.eat.health, 0, 100);
  }

  update(dt, ctx) {
    if (!this.alive) return;
    const { ambientTemp = 15, fireWarmth = 0, wearWarmth = 0, sprinting = false, inWater = false, moving = false, wet = 0 } = ctx;

    // Metabolic drain (faster while exerting).
    const exert = sprinting ? 2.2 : moving ? 1.2 : 1.0;
    this.hunger = clamp(this.hunger - 0.22 * exert * dt, 0, 100);
    this.thirst = clamp(this.thirst - 0.32 * exert * dt - Math.max(0, this.temp - 85) * 0.01 * dt, 0, 100);

    // Temperature comfort tends toward a target set by environment + gear + fire.
    let target = 50 + (ambientTemp - 14) * 2.2 + fireWarmth * 2.4 + wearWarmth * 1.6;
    if (inWater) target -= 35;
    target -= wet * 22;                 // getting rained on chills you (unless near fire)
    target = clamp(target, -10, 105);
    this.temp = lerp(this.temp, target, clamp(0.35 * dt, 0, 1));

    // Consequences.
    if (this.hunger <= 0) this.damage(1.1 * dt, 'starvation');
    if (this.thirst <= 0) this.damage(1.4 * dt, 'dehydration');
    if (this.temp < 15) this.damage((15 - this.temp) * 0.09 * dt, 'the cold');
    if (this.temp > 99) this.damage(0.5 * dt, 'the heat');

    // Regeneration when comfortable and nourished.
    if (this.hunger > 45 && this.thirst > 45 && this.temp > 28 && this.temp < 92 && this.health < 100) {
      this.heal(0.7 * dt);
      this.hunger = clamp(this.hunger - 0.05 * dt, 0, 100);
    }
  }
}
