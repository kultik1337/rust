import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { makeWaterNormals } from './textures.js';

// A large reflective ocean plane at sea level. Uses three's Water object, which
// renders a live reflection of the scene and adds animated normal-map ripples
// plus a specular sun glint (which blooms in post).
export class Ocean {
  constructor(scene, size = 6000) {
    const normals = makeWaterNormals();
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;

    const geo = new THREE.PlaneGeometry(size, size);
    this.water = new Water(geo, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: new THREE.Vector3(0, 1, 0),
      sunColor: 0xffffff,
      waterColor: 0x2b4b63,
      distortionScale: 2.8,
      fog: scene.fog !== undefined,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0.0;
    scene.add(this.water);
  }

  update(dt, sunDir, sunColor) {
    const u = this.water.material.uniforms;
    u['time'].value += dt * 0.55;
    if (sunDir) u['sunDirection'].value.copy(sunDir).normalize();
    if (sunColor) u['sunColor'].value.copy(sunColor);
  }
}
