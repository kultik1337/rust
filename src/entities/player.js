import * as THREE from 'three';
import { clamp, lerp } from '../core/noise.js';

// First-person character controller. Owns position/velocity and drives the main
// camera. Movement is intentionally snappy (near-instant horizontal control)
// which suits a survival/action game.
export class Player {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.pos = new THREE.Vector3(0, 20, 0);   // feet position
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.radius = 0.35;
    this.standHeight = 1.8;
    this.eyeStand = 1.66;
    this.eyeCrouch = 1.05;
    this.eyeHeight = this.eyeStand;

    this.walk = 4.4; this.sprint = 7.6; this.crouchSpeed = 2.1; this.swimSpeed = 3.2;
    this.gravity = 22; this.jumpSpeed = 7.2;

    this.grounded = false;
    this.inWater = false;
    this.submerged = false;
    this.crouching = false;
    this.sprinting = false;
    this.moving = false;
    this.speed = 0;
    this.sensitivity = 0.0022;

    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  teleport(v) { this.pos.copy(v); this.vel.set(0, 0, 0); }

  update(dt, input, opts = {}) {
    // --- Look ---
    const look = input.consumeLook();
    this.yaw -= look.x * this.sensitivity;
    this.pitch -= look.y * this.sensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    this._lastLook = look;

    // --- Desired movement direction (relative to yaw) ---
    let ix = 0, iz = 0;
    if (input.isDown('KeyW')) iz -= 1;
    if (input.isDown('KeyS')) iz += 1;
    if (input.isDown('KeyA')) ix -= 1;
    if (input.isDown('KeyD')) ix += 1;
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }

    this.crouching = input.isDown('ControlLeft') || input.isDown('KeyC');
    this.sprinting = input.isDown('ShiftLeft') && iz < 0 && !this.crouching && !opts.lockSprint;

    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    // Forward is -Z at yaw 0.
    const fx = -sinY, fz = -cosY;
    const rx = cosY, rz = -sinY;
    const wx = fx * -iz + rx * ix;
    const wz = fz * -iz + rz * ix;

    let targetSpeed = this.walk;
    if (this.inWater) targetSpeed = this.swimSpeed;
    else if (this.sprinting) targetSpeed = this.sprint;
    else if (this.crouching) targetSpeed = this.crouchSpeed;
    if (opts.exhausted) targetSpeed *= 0.6;

    this.moving = len > 0;
    const desiredVX = wx * targetSpeed * (len > 0 ? 1 : 0);
    const desiredVZ = wz * targetSpeed * (len > 0 ? 1 : 0);

    // Snappy on ground, a bit floaty in air/water.
    const accel = this.grounded ? 18 : (this.inWater ? 6 : 4);
    this.vel.x = lerp(this.vel.x, desiredVX, clamp(accel * dt, 0, 1));
    this.vel.z = lerp(this.vel.z, desiredVZ, clamp(accel * dt, 0, 1));

    // --- Vertical ---
    const seaLevel = this.physics.terrain.seaLevel;
    const eyeY = this.pos.y + this.eyeHeight;
    this.inWater = this.pos.y < seaLevel - 0.1;
    this.submerged = eyeY < seaLevel;

    if (this.inWater) {
      // Buoyancy floats the body toward the surface; swim up with jump.
      const targetFloat = seaLevel - 0.6;
      const buoy = (targetFloat - this.pos.y) * 6;
      this.vel.y = lerp(this.vel.y, clamp(buoy, -2, 3), clamp(4 * dt, 0, 1));
      if (input.isDown('Space')) this.vel.y = 3.2;
      if (this.crouching) this.vel.y = -3.0;
    } else {
      this.vel.y -= this.gravity * dt;
      if (this.grounded && input.isDown('Space')) {
        this.vel.y = this.jumpSpeed;
        this.grounded = false;
      }
    }

    // --- Integrate + collide ---
    const wasGrounded = this.grounded;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const headY = this.pos.y + this.standHeight;
    this.physics.resolveHorizontal(this.pos, this.radius, this.pos.y, headY);

    this.pos.y += this.vel.y * dt;
    const ground = this.physics.supportHeight(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y <= ground) {
      const impact = -this.vel.y;             // downward speed at the moment of landing
      this.pos.y = ground;
      if (this.vel.y < 0) this.vel.y = 0;
      // Fall damage above a safe threshold (never in water).
      if (!wasGrounded && !this.inWater && impact > 16 && this.takeDamage) {
        this.takeDamage((impact - 16) * 3.5, 'the fall');
      }
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // --- Camera ---
    this.eyeHeight = lerp(this.eyeHeight, this.crouching ? this.eyeCrouch : this.eyeStand, clamp(10 * dt, 0, 1));
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.quaternion.copy(q);

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this._forward.set(fx, 0, fz);
  }

  forwardVector(out = new THREE.Vector3()) {
    return this.camera.getWorldDirection(out);
  }
}
