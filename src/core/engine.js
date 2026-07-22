import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// The Engine owns the renderer, the two scenes (world + first-person viewmodel),
// the two cameras, and the post-processing composer. Everything else in the game
// adds objects to `scene` (world) or `vmScene` (weapon/hands overlay).
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // we use FXAA in post instead of MSAA (cheaper with HDR)
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // We draw the viewmodel manually after the composer, so disable auto-clear.
    this.renderer.autoClear = false;

    // World scene + main camera.
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, this._aspect(), 0.1, 3000);

    // Viewmodel scene: rendered on top with a cleared depth buffer and its own
    // camera/lighting so first-person hands never clip into world geometry.
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(58, this._aspect(), 0.01, 12);
    const vmKey = new THREE.DirectionalLight(0xffffff, 2.4);
    vmKey.position.set(-0.6, 1.2, 1.0);
    const vmFill = new THREE.HemisphereLight(0xbfd4ff, 0x40382c, 1.1);
    this.vmScene.add(vmKey, vmFill);
    this.vmLightKey = vmKey;
    this.vmLightFill = vmFill;

    // Post-processing chain.
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.42,   // strength
      0.6,    // radius
      0.9     // threshold — only bright highlights bloom (sun glints, fire)
    );
    this.composer.addPass(this.bloom);

    this.composer.addPass(new OutputPass());

    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);

    this._updateResolutionUniforms();
    window.addEventListener('resize', () => this.resize());
  }

  _aspect() { return window.innerWidth / window.innerHeight; }

  _updateResolutionUniforms() {
    const pr = this.renderer.getPixelRatio();
    const w = window.innerWidth * pr, h = window.innerHeight * pr;
    this.fxaa.material.uniforms['resolution'].value.set(1 / w, 1 / h);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
    this.bloom.setSize(w, h);
    this._updateResolutionUniforms();
  }

  render() {
    // World (with post-processing).
    this.renderer.clear();
    this.composer.render();
    // Viewmodel on top, sharing the pixel but with a fresh depth range.
    this.renderer.clearDepth();
    this.renderer.render(this.vmScene, this.vmCamera);
  }
}
