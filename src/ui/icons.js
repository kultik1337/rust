import * as THREE from 'three';
import { buildItemModel } from '../models/items.js';

// Renders each item's 3D model once to a small transparent canvas and caches the
// resulting data URL, so inventory/hotbar slots show real 3D icons.
export class IconRenderer {
  constructor(size = 88) {
    this.size = size;
    this.cache = new Map();
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(size, size);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xffffff, 3.0); key.position.set(2, 3, 2);
    const fill = new THREE.HemisphereLight(0xbfd4ff, 0x40382c, 1.6);
    this.scene.add(key, fill);

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  }

  get(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const model = buildItemModel(id);

    // Center + scale to fit the frame.
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    model.position.sub(center);
    const holder = new THREE.Group();
    holder.add(model);
    holder.rotation.set(0.35, -0.7, 0);
    this.scene.add(holder);

    const r = sphere.radius || 0.3;
    const dist = r / Math.sin((this.camera.fov * Math.PI / 180) / 2) * 1.15;
    this.camera.position.set(dist * 0.5, dist * 0.5, dist);
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(holder);
    this.cache.set(id, url);
    return url;
  }
}
