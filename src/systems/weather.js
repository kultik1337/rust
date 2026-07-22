import * as THREE from 'three';

// Dynamic weather: cycles clear → cloudy → rain → storm and back. Drives rain
// particles (one instanced draw call), darkens the sky/fog, and in storms fires
// lightning flashes with delayed thunder. Exposes `intensity` (0..1) and `wet`
// so survival can make the player cold when caught in the rain.
const STATES = {
  clear:  { rain: 0.0, next: ['clear', 'cloudy', 'cloudy'] },
  cloudy: { rain: 0.0, next: ['clear', 'rain', 'clear'] },
  rain:   { rain: 0.6, next: ['cloudy', 'storm', 'cloudy'] },
  storm:  { rain: 1.0, next: ['rain', 'rain'] },
};

export class Weather {
  constructor(scene, sky, engine, audio) {
    this.scene = scene; this.sky = sky; this.engine = engine; this.audio = audio;
    this.state = 'clear';
    this.intensity = 0;      // smoothed rain amount 0..1
    this.wet = 0;            // how wet/cold the player is getting
    this.timer = 20 + Math.random() * 30;

    // Rain as one InstancedMesh of thin streaks.
    this.count = 1500;
    const geo = new THREE.BoxGeometry(0.02, 0.7, 0.02);
    const mat = new THREE.MeshBasicMaterial({ color: 0xaebfd0, transparent: true, opacity: 0.45, fog: false });
    this.rain = new THREE.InstancedMesh(geo, mat, this.count);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
    this._dummy = new THREE.Object3D();
    this.px = new Float32Array(this.count);
    this.py = new Float32Array(this.count);
    this.pz = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.px[i] = (Math.random() - 0.5) * 70;
      this.py[i] = Math.random() * 45;
      this.pz[i] = (Math.random() - 0.5) * 70;
    }

    // Lightning: a bright sky-coloured directional flash.
    this.flash = new THREE.DirectionalLight(0xcfe6ff, 0);
    this.flash.position.set(30, 120, 20);
    this.scene.add(this.flash, this.flash.target);
    this._flash = 0;
    this._thunderIn = -1;
    this._boltIn = 3;
  }

  _transition() {
    const opts = STATES[this.state].next;
    this.state = opts[Math.floor(Math.random() * opts.length)];
    this.timer = (this.state === 'storm' ? 20 : 30) + Math.random() * 40;
  }

  update(dt, camera) {
    this.timer -= dt;
    if (this.timer <= 0) this._transition();

    const target = STATES[this.state].rain;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.4);
    this.wet = this.intensity;

    // Rain particles.
    const raining = this.intensity > 0.03;
    this.rain.visible = raining;
    if (raining) {
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const fall = 32, wind = 4;
      const active = Math.floor(this.count * this.intensity);
      for (let i = 0; i < this.count; i++) {
        if (i < active) {
          this.py[i] -= fall * dt;
          this.px[i] += wind * dt;
          if (this.py[i] < -20 || Math.abs(this.px[i]) > 38 || Math.abs(this.pz[i]) > 38) {
            this.px[i] = (Math.random() - 0.5) * 70;
            this.py[i] = 25 + Math.random() * 20;
            this.pz[i] = (Math.random() - 0.5) * 70;
          }
          this._dummy.position.set(cx + this.px[i], cy + this.py[i] - 10, cz + this.pz[i]);
          this._dummy.rotation.set(0, 0, 0.12);
          this._dummy.scale.set(1, 1, 1);
        } else {
          this._dummy.position.set(0, -9999, 0);
        }
        this._dummy.updateMatrix();
        this.rain.setMatrixAt(i, this._dummy.matrix);
      }
      this.rain.instanceMatrix.needsUpdate = true;
    }
    this.audio?.setRain(this.intensity);

    // Environment darkening — applied after sky.update in the main loop.
    if (this.intensity > 0.01) {
      const k = this.intensity;
      this.sky.fog.density = this.sky.fog.density * (1 + k * 1.2);
      this.sky.fog.color.multiplyScalar(1 - k * 0.35);
      this.sky.sun.intensity *= (1 - k * 0.7);
      this.sky.hemi.intensity *= (1 - k * 0.35);
      this.engine.renderer.toneMappingExposure *= (1 - k * 0.3);
      if (this.sky.cloudMat) this.sky.cloudMat.opacity = Math.min(1, this.sky.cloudMat.opacity + k * 0.4);
    }

    // Lightning in storms.
    if (this._flash > 0) {
      this._flash -= dt;
      this.flash.intensity = Math.max(0, this._flash) * 22;
    } else {
      this.flash.intensity = 0;
    }
    if (this.state === 'storm') {
      this._boltIn -= dt;
      if (this._boltIn <= 0) {
        this._boltIn = 4 + Math.random() * 9;
        this._flash = 0.18;
        this.flash.position.set(camera.position.x + (Math.random() - 0.5) * 200, 140, camera.position.z + (Math.random() - 0.5) * 200);
        this._thunderIn = 0.4 + Math.random() * 2.4;   // sound arrives after the light
      }
    }
    if (this._thunderIn > 0) { this._thunderIn -= dt; if (this._thunderIn <= 0) this.audio?.thunder(); }
  }

  label() {
    return this.intensity > 0.5 ? (this.state === 'storm' ? '⛈ Storm' : '🌧 Rain')
      : this.state === 'cloudy' ? '☁ Cloudy' : '☀ Clear';
  }
}
