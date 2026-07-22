import * as THREE from 'three';
import { MAT } from './materials.js';
import { buildItemModel } from './items.js';
import { clamp, lerp } from '../core/noise.js';

// First-person hands + held item. Lives in the Engine's separate `vmScene`, so
// it renders on top of the world with its own cleared depth buffer (never clips
// into terrain). The camera for this scene sits at the origin looking down -Z;
// everything here is authored in that view space and animated locally.
export class Viewmodel {
  constructor(engine) {
    this.engine = engine;
    this.root = new THREE.Group();
    engine.vmScene.add(this.root);

    this.time = 0;
    this.swingT = -1;        // -1 = idle, else 0..1 progress
    this.swingDur = 0.34;
    this.swingKind = 'chop';
    this.aiming = false;
    this._bobPhase = 0;
    this._sway = new THREE.Vector2();

    this.rightArm = this._makeArm(1);
    this.rightArm.position.set(0.34, -0.42, -0.5);
    this.root.add(this.rightArm);

    this.leftArm = this._makeArm(-1);
    this.leftArm.position.set(-0.34, -0.46, -0.55);
    this.root.add(this.leftArm);

    this.toolHolder = new THREE.Group();
    this.rightArm.add(this.toolHolder);
    this.toolHolder.position.set(0.02, 0.16, -0.02);

    this.currentTool = null;
    this.currentId = null;
  }

  _makeArm(side) {
    const arm = new THREE.Group();
    const skin = MAT.skin(0xc98d5a);
    const sleeve = MAT.cloth(0x6a5330);

    // Forearm (rolled sleeve) angled forward toward the camera.
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.26, 5, 10), sleeve);
    forearm.position.set(0, -0.03, 0.12);
    forearm.rotation.x = 1.2;
    arm.add(forearm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.05, 10), sleeve);
    cuff.position.set(0, 0.02, 0.0); cuff.rotation.x = 1.2;
    arm.add(cuff);

    // Hand assembly (built pointing up out of the wrist, then rotated to grip).
    const hand = new THREE.Group();
    hand.position.set(0, 0.1, -0.02);

    // Palm: a rounded box (bevelled by a squashed sphere on top).
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.045, 0.075), skin);
    palm.position.y = 0.02;
    const palmTop = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), skin);
    palmTop.scale.set(0.9, 0.42, 0.78); palmTop.position.y = 0.035;
    hand.add(palm, palmTop);

    // A curled finger: two tapered segments with a knuckle bend.
    const makeFinger = (x, len, r, spread, curl) => {
      const base = new THREE.Group();
      base.position.set(x, 0.05, 0.02);
      base.rotation.z = spread;
      base.rotation.x = -0.5 - curl;                 // first knuckle bend
      const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), skin);
      seg1.position.y = len / 2; base.add(seg1);
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 6, 5), skin);
      knuckle.position.y = len; base.add(knuckle);
      const tip = new THREE.Group();
      tip.position.y = len; tip.rotation.x = -0.9 - curl; // second joint curls further
      const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.82, len * 0.8, 4, 8), skin);
      seg2.position.y = (len * 0.8) / 2; tip.add(seg2);
      base.add(tip);
      return base;
    };

    // Four fingers fanned across the front of the palm, curling into a grip.
    const fx = [-0.03, -0.01, 0.012, 0.032];
    const flen = [0.055, 0.062, 0.058, 0.05];
    for (let i = 0; i < 4; i++) hand.add(makeFinger(fx[i], flen[i], 0.011, (i - 1.5) * 0.06, 0.15 * i * 0.1));

    // Thumb: comes off the side, wraps toward the grip.
    const thumb = new THREE.Group();
    thumb.position.set(-0.045, 0.0, 0.02);
    thumb.rotation.set(-0.3, 0, 0.9);
    const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.045, 4, 8), skin);
    t1.position.y = 0.022; thumb.add(t1);
    const tt = new THREE.Group(); tt.position.y = 0.045; tt.rotation.x = -0.7;
    const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.035, 4, 8), skin);
    t2.position.y = 0.017; tt.add(t2); thumb.add(tt);
    hand.add(thumb);

    // Tilt the whole hand so the palm faces the grip axis.
    hand.rotation.x = 0.5;
    arm.add(hand);

    arm.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    arm.scale.x = side; // mirror for the left arm
    return arm;
  }

  setTool(id) {
    if (id === this.currentId) return;
    this.currentId = id;
    if (this.currentTool) { this.toolHolder.remove(this.currentTool); this.currentTool = null; }
    if (this.torchLight) { this.torchLight = null; }
    if (!id) return;
    const model = buildItemModel(id);
    // Scale held items down a touch and orient the handle through the fist.
    model.scale.setScalar(0.82);
    model.rotation.set(-0.5, 0.15, 0.1);
    const grip = model.userData.grip;
    if (grip) model.position.sub(grip.clone().multiplyScalar(0.82));
    this.toolHolder.add(model);
    this.currentTool = model;
    // Torch carries its own point light in the world scene.
    if (id === 'torch' && model.userData.light) {
      this.torchLight = model.userData.light;
    }
  }

  swing(kind = 'chop') {
    if (this.swingT >= 0) return false;
    this.swingKind = kind;
    this.swingDur = kind === 'attack' ? 0.28 : kind === 'gather' ? 0.4 : 0.34;
    this.swingT = 0;
    return true;
  }

  isMidSwing() { return this.swingT >= 0.28 && this.swingT <= 0.55; }

  update(dt, state) {
    this.time += dt;
    const moving = state?.moving || false;
    const speed = state?.speed || 0;
    const look = state?.look || { x: 0, y: 0 };

    // Weapon sway follows (lagged) mouse movement.
    this._sway.x = lerp(this._sway.x, clamp(-look.x * 0.0008, -0.06, 0.06), 0.15);
    this._sway.y = lerp(this._sway.y, clamp(-look.y * 0.0008, -0.06, 0.06), 0.15);

    // Walk/idle bob.
    this._bobPhase += dt * (moving ? 8 + speed : 2.2);
    const bobAmp = moving ? 0.02 + speed * 0.004 : 0.006;
    const bobX = Math.cos(this._bobPhase) * bobAmp;
    const bobY = Math.abs(Math.sin(this._bobPhase)) * bobAmp;

    this.root.position.set(this._sway.x + bobX, this._sway.y - bobY, 0);
    this.root.rotation.z = this._sway.x * 1.2;
    this.root.rotation.x = -this._sway.y;

    // Base arm pose.
    let armRotX = 0, armPosZ = 0, holderRotX = 0;

    // Aiming (bow): bring hands up and center.
    const aimBlend = this.aiming ? 1 : 0;
    this.rightArm.position.x = lerp(0.34, 0.12, aimBlend);
    this.rightArm.position.y = lerp(-0.42, -0.30, aimBlend);

    // Swing animation.
    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur;
      const t = this.swingT;
      if (this.swingKind === 'attack') {
        // Forward thrust (spear/melee).
        const p = Math.sin(clamp(t, 0, 1) * Math.PI);
        armPosZ = -p * 0.28;
        armRotX = -p * 0.5;
      } else {
        // Overhead chop / swing arc.
        const p = Math.sin(clamp(t, 0, 1) * Math.PI);
        armRotX = -p * 1.5;
        holderRotX = -p * 0.6;
      }
      if (this.swingT >= 1) this.swingT = -1;
    }

    this.rightArm.rotation.x = armRotX;
    this.rightArm.position.z = -0.5 + armPosZ;
    this.toolHolder.rotation.x = holderRotX;

    // Torch flame flicker.
    if (this.currentId === 'torch' && this.currentTool) {
      const f = this.currentTool.userData.flame;
      const l = this.currentTool.userData.light;
      const flick = 0.75 + Math.sin(this.time * 22) * 0.15 + Math.sin(this.time * 7.3) * 0.1;
      if (f) f.material.emissiveIntensity = 3.5 * flick;
      if (l) l.intensity = 6 * flick;
    }
  }
}
