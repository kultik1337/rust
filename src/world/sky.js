import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep } from '../core/noise.js';

// Drives the whole day/night cycle: atmospheric sky shader, sun + moon
// directional lights, ambient hemisphere fill, fog colour, and a star field.
// Other systems read `sunDir`, `isNight`, and `ambientTemp` from here.
export class SkySystem {
  constructor(scene) {
    this.scene = scene;
    this.timeOfDay = 6.5;   // hours (0..24), start just after dawn
    this.dayLength = 600;   // real seconds for a full 24h cycle
    this.paused = false;

    // Atmospheric scattering dome.
    this.sky = new Sky();
    this.sky.scale.setScalar(8000);
    const u = this.sky.material.uniforms;
    u['turbidity'].value = 4.0;
    u['rayleigh'].value = 2.2;
    u['mieCoefficient'].value = 0.005;
    u['mieDirectionalG'].value = 0.8;
    scene.add(this.sky);

    // Sun: the main shadow-casting light.
    this.sun = new THREE.DirectionalLight(0xfff3e0, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 260;
    const s = 90;
    this.sun.shadow.camera.left = -s;
    this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;
    this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // Moon: soft cool fill at night, also casts (weaker) shadows.
    this.moon = new THREE.DirectionalLight(0x8fa6d4, 0.0);
    scene.add(this.moon, this.moon.target);

    // Ambient sky/ground bounce.
    this.hemi = new THREE.HemisphereLight(0x9fc0ff, 0x54492f, 0.6);
    scene.add(this.hemi);

    // Fog — colour animated with the time of day for depth + mood.
    this.fog = new THREE.FogExp2(0xbfd4e8, 0.0016);
    scene.fog = this.fog;

    // Visible sun disc (bright → blooms) and moon disc.
    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(40, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff0cc, fog: false })
    );
    this.moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(26, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xdfe6f2, fog: false })
    );
    scene.add(this.sunDisc, this.moonDisc);

    this._buildStars();
    this._buildClouds();

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.isNight = false;
    this.ambientTemp = 20; // °C, read by the survival system
  }

  _buildStars() {
    const count = 1400;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Distribute on the upper hemisphere of a large sphere.
      const u = Math.random(), v = Math.random() * 0.5;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(1 - v);
      const r = 4000;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.cos(phi);
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 11, sizeAttenuation: true, transparent: true,
      opacity: 0, depthWrite: false, fog: false, toneMapped: false,
    }));
    this.scene.add(this.stars);
  }

  _buildClouds() {
    // A drifting layer of soft, unlit cloud puffs. Each cloud is a few merged
    // deformed spheres → one draw call per cloud. Tinted by time of day.
    this.cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, fog: false, transparent: true, opacity: 0.85, depthWrite: false,
    });
    this.clouds = new THREE.Group();
    const N = 16;
    for (let i = 0; i < N; i++) {
      const geos = [];
      const puffs = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < puffs; j++) {
        const r = 18 + Math.random() * 26;
        const g = new THREE.SphereGeometry(r, 8, 6);
        g.scale(1.4, 0.5, 1.1);
        g.translate((Math.random() - 0.5) * 70, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 40);
        geos.push(g);
      }
      const merged = mergeGeometries(geos, false);
      const cloud = new THREE.Mesh(merged, this.cloudMat);
      const a = Math.random() * Math.PI * 2, rad = 200 + Math.random() * 1300;
      cloud.position.set(Math.cos(a) * rad, 150 + Math.random() * 90, Math.sin(a) * rad);
      cloud.userData.drift = 4 + Math.random() * 4;
      this.clouds.add(cloud);
    }
    this.scene.add(this.clouds);
  }

  setTime(h) { this.timeOfDay = ((h % 24) + 24) % 24; }
  update(dt, playerPos) {
    if (!this.paused) {
      this.timeOfDay = (this.timeOfDay + (dt / this.dayLength) * 24) % 24;
    }
    const t = this.timeOfDay;

    // Sun angle: rises ~6:00 (east), noon overhead, sets ~18:00 (west).
    const sunAngle = ((t - 6) / 24) * Math.PI * 2;
    const elev = Math.sin(sunAngle);                // -1..1 (>0 = above horizon)
    const azim = Math.cos(sunAngle);
    this.sunDir.set(azim * 0.7, elev, -0.35 - Math.abs(azim) * 0.2).normalize();

    // Daylight factor 0 (night) → 1 (day) with soft dawn/dusk transitions.
    const day = smoothstep(-0.06, 0.18, elev);
    this.dayFactor = day;
    this.isNight = elev < 0.02;

    // Dampen atmospheric scattering at night so the sky reads dark, not dusky.
    const u = this.sky.material.uniforms;
    u['rayleigh'].value = lerp(0.35, 2.4, day);
    u['turbidity'].value = lerp(0.8, 4.5, day);
    u['mieCoefficient'].value = lerp(0.002, 0.005, day);

    // Position discs + lights relative to the player so they feel infinitely far.
    const cx = playerPos ? playerPos.x : 0, cz = playerPos ? playerPos.z : 0;
    const cy = playerPos ? playerPos.y : 0;
    const R = 1600;
    this.sunDisc.position.set(cx + this.sunDir.x * R, cy + this.sunDir.y * R, cz + this.sunDir.z * R);
    const moonDir = this.sunDir.clone().negate();
    this.moonDisc.position.set(cx + moonDir.x * R, cy + moonDir.y * R, cz + moonDir.z * R);
    this.moonDisc.visible = moonDir.y > -0.1;

    // Sun light rig follows the player so shadow frustum stays centred.
    this.sun.position.set(cx + this.sunDir.x * 150, cy + this.sunDir.y * 150, cz + this.sunDir.z * 150);
    this.sun.target.position.set(cx, cy, cz);
    this.moon.position.set(cx + moonDir.x * 150, cy + moonDir.y * 150, cz + moonDir.z * 150);
    this.moon.target.position.set(cx, cy, cz);

    // Sky shader sun position.
    this.sky.material.uniforms['sunPosition'].value.copy(this.sunDir);

    // Light intensities + colours across the cycle.
    const sunSet = smoothstep(0.0, 0.25, elev) * (1 - smoothstep(0.85, 1.0, elev) * 0.0);
    this.sun.intensity = lerp(0.0, 3.2, sunSet);
    // Warm at horizon, neutral-white at noon.
    const warm = 1 - smoothstep(0.05, 0.45, elev);
    this.sun.color.setRGB(1.0, lerp(1.0, 0.62, warm), lerp(1.0, 0.38, warm));

    this.moon.intensity = lerp(0.35, 0.0, day);
    this.hemi.intensity = lerp(0.18, 0.75, day);
    this.hemi.color.setRGB(lerp(0.28, 0.62, day), lerp(0.34, 0.75, day), lerp(0.5, 1.0, day));
    this.hemi.groundColor.setRGB(0.33, 0.28, 0.19);

    // Fog colour: deep blue at night → hazy blue-white by day.
    const fr = lerp(0.05, 0.75, day), fg = lerp(0.07, 0.83, day), fb = lerp(0.13, 0.9, day);
    this.fog.color.setRGB(fr, fg, fb);
    this.sunDisc.material.color.setRGB(1.0, lerp(0.6, 0.94, day), lerp(0.3, 0.8, day));
    this.sunDisc.visible = this.sunDir.y > -0.15;

    // Stars fade in after dusk.
    this.stars.material.opacity = clamp(1 - day * 1.6, 0, 1);
    this.stars.position.set(cx, cy, cz);

    // Clouds drift and are tinted from moonlit-grey to sun-warmed white.
    for (const c of this.clouds.children) {
      c.position.x += c.userData.drift * dt;
      if (c.position.x > cx + 1500) c.position.x -= 3000;
    }
    this.cloudMat.color.setRGB(lerp(0.28, 1.0, day), lerp(0.31, 0.98, day), lerp(0.4, 0.95, day));
    this.cloudMat.opacity = lerp(0.55, 0.85, day);

    // Ambient temperature: warm midday, cold pre-dawn night.
    this.ambientTemp = lerp(4, 26, day) - 2 * Math.max(0, -elev);
  }

  clockString() {
    const h = Math.floor(this.timeOfDay);
    const m = Math.floor((this.timeOfDay - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
