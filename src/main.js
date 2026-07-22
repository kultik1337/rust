import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { hashSeed } from './core/noise.js';
import { Terrain } from './world/world.js';
import { Ocean } from './world/water.js';
import { SkySystem } from './world/sky.js';
import { ResourceManager, findEntityRoot } from './world/resources.js';
import { PhysicsWorld } from './entities/physics.js';
import { Player } from './entities/player.js';
import { AnimalManager } from './entities/animals.js';
import { Viewmodel } from './models/viewmodel.js';
import { Inventory } from './systems/inventory.js';
import { Crafting } from './systems/crafting.js';
import { Survival } from './systems/survival.js';
import { DropManager } from './systems/drops.js';
import { DeployManager } from './systems/deployables.js';
import { BuildSystem } from './systems/building.js';
import { CombatSystem } from './systems/combat.js';
import { Particles } from './systems/particles.js';
import { AudioEngine } from './systems/audio.js';
import { Weather } from './systems/weather.js';
import { makeBeacon } from './models/landmark.js';
import { IconRenderer } from './ui/icons.js';
import { HUD } from './ui/hud.js';
import { ITEMS } from './data/items.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.engine = new Engine(this.canvas);
    this.input = new Input(this.canvas);
    this.clock = new THREE.Clock();
    this.playing = false;
    this._raycaster = new THREE.Raycaster();
    // Allow a fixed seed / start time via URL for reproducible screenshots.
    const params = new URLSearchParams(location.search);
    this.seed = params.has('seed') ? hashSeed(params.get('seed')) : 1337;
    this._forceTime = params.has('time') ? parseFloat(params.get('time')) : null;
    window.__GAME = this;
  }

  async build() {
    const scene = this.engine.scene;

    this.sky = new SkySystem(scene);
    if (this._forceTime !== null) { this.sky.setTime(this._forceTime); this.sky.paused = true; }
    this.terrain = new Terrain(scene, this.seed);
    this.ocean = new Ocean(scene);

    this.physics = new PhysicsWorld(this.terrain);
    this.resources = new ResourceManager(scene, this.terrain, this.physics, this.seed + 7);
    this.resources.populate();

    this.animals = new AnimalManager(scene, this.terrain);
    this.animals.populate(70);

    this.player = new Player(this.engine.camera, this.physics);
    const spawn = this.terrain.findSpawn();
    this.resources.clearAround(spawn, 5);
    this.player.teleport(spawn);
    this.player.takeDamage = (dmg, cause) => { this.survival.damage(dmg, cause); this.hud.hurtFlash(); this.audio?.hurt(); };

    this.viewmodel = new Viewmodel(this.engine);

    // Torch/held light that actually illuminates the world.
    this.playerLight = new THREE.PointLight(0xff9a4a, 0, 18, 2);
    scene.add(this.playerLight);

    this.inventory = new Inventory();
    this.survival = new Survival();
    this.survival.onDeath = (cause) => this._die(cause);

    this.crafting = new Crafting(this.inventory);
    this.drops = new DropManager(scene, this.terrain);
    this.deploy = new DeployManager(scene, this.terrain, this.physics);
    this.build = new BuildSystem(scene, this.terrain, this.physics, this.inventory);
    this.particles = new Particles(scene);
    this.audio = new AudioEngine();
    this.weather = new Weather(scene, this.sky, this.engine, this.audio);
    this._placeBeacon();

    this.icons = new IconRenderer();
    this.hud = new HUD({
      icons: this.icons,
      inventory: this.inventory,
      crafting: this.crafting,
      audio: this.audio,
      getStations: () => this.deploy.stationsNear(this.player.pos),
      onDropWorld: (stack) => this._dropStack(stack),
    });

    this.combat = new CombatSystem({
      scene, camera: this.engine.camera, viewmodel: this.viewmodel,
      resources: this.resources, animals: this.animals, drops: this.drops,
      inventory: this.inventory, terrain: this.terrain, ui: this.hud,
      particles: this.particles, audio: this.audio,
    });

    this._giveStartingKit();
    this._bindActions();

    // Warm up icon cache for starting items so the first frame has no hitch.
    for (const id of Object.keys(ITEMS)) { try { this.icons.get(id); } catch (e) {} }
    this.hud.renderHotbar();
  }

  _placeBeacon() {
    const T = this.terrain;
    // Find a prominent-ish spot a bit inland to host the landmark.
    let best = null;
    for (let i = 0; i < 3000; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * T.worldRadius * 0.45;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = T.heightAt(x, z), slope = T.slopeAt(x, z);
      if (h > 6 && slope < 0.3) { const s = h - r * 0.02; if (!best || s > best.score) best = { x, z, h, score: s }; }
    }
    const v = best || { x: 0, z: 0, h: Math.max(6, T.heightAt(0, 0)) };
    this.resources.clearAround(v, 6);
    const beacon = makeBeacon();
    beacon.position.set(v.x, v.h, v.z);
    this.engine.scene.add(beacon);
    this.beacon = beacon;
    this.physics.addCylinder(v.x, v.z, beacon.userData.collider.radius, v.h, beacon.userData.collider.height, 'beacon');
    // A reward cache at its base.
    const box = this.deploy.place('box', { x: v.x + 3, y: v.h, z: v.z }, 0);
    if (box?.container) { box.container.add('cloth', 40); box.container.add('metalFrag', 20); box.container.add('cookedMeat', 5); }
    this._beaconPos = new THREE.Vector3(v.x, v.h, v.z);
  }

  _giveStartingKit() {
    this.inventory.hotbar.slots[0] = { id: 'rock', count: 1, dur: ITEMS.rock.durability };
    this.inventory.hotbar.slots[1] = { id: 'torch', count: 1, dur: ITEMS.torch.durability };
    this.inventory.add('wood', 50);
    this.inventory.add('stone', 30);
    this.inventory.setSelected(0);
  }

  _bindActions() {
    const inp = this.input;
    inp.on('press', (code) => {
      if (!this.playing && code !== 'Escape') return;
      if (code >= 'Digit1' && code <= 'Digit6') this._select(parseInt(code.slice(5)) - 1);
      if (code === 'Tab') { this._toggleInventory(); }
      if (this.hud.open) return;   // below actions only when not in menus
      if (code === 'KeyE') this._interact();
      if (code === 'KeyG') this._dropSelectedOne();
      if (code === 'KeyR' && this._buildMode()) this.build.rotate();
      if (code === 'BracketLeft' && this._buildMode()) this.build.cyclePiece(-1);
      if (code === 'BracketRight' && this._buildMode()) this.build.cyclePiece(1);
    });
    inp.on('wheel', (dir) => { if (this.playing && !this.hud.open) this._select(this.inventory.selected + dir); });
    inp.on('down', (btn) => {
      if (!this.playing || this.hud.open) return;
      if (btn === 0) this._primaryDown();
      if (btn === 2) this._secondaryDown();
    });
    inp.on('up', (btn) => {
      if (btn === 2) this.viewmodel.aiming = false;
    });

    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.playing && !this.hud.open && this.survival.alive) {
        // Lost lock (Esc) → show resume overlay.
        this._showStart('Click to resume');
      }
    });
  }

  _select(i) {
    this.inventory.setSelected(i);
    this._syncBuildMode();
  }

  _buildMode() { return this.inventory.selectedItem()?.id === 'hammer'; }

  _syncBuildMode() {
    const on = this._buildMode();
    this.build.setActive(on);
  }

  _heldId() { return this.inventory.selectedItem()?.id || null; }

  _primaryDown() {
    const id = this._heldId();
    const def = id ? ITEMS[id] : null;
    if (def?.ranged) { if (this.viewmodel.aiming) this.combat.fireArrow(); return; }
    // Melee/gather handled continuously in update via button hold too.
    this.combat.usePrimary(this.viewmodel.aiming);
  }

  _secondaryDown() {
    const id = this._heldId();
    const def = id ? ITEMS[id] : null;
    if (!def) return;
    if (this._buildMode()) { if (this.build.tryPlace()) { this.hud.toast('Placed'); this.audio?.place(); } return; }
    if (def.category === 'deploy') return this._placeDeployable(id);
    if (def.ranged) { this.viewmodel.aiming = true; return; }
    if (def.category === 'food') return this._consumeSelected();
  }

  _placeDeployable(id) {
    const pt = this._aimGround(5.5);
    if (!pt) { this.hud.toast('No valid spot'); return; }
    this.deploy.place(id, pt, this.player.yaw);
    this.inventory.remove(id, 1);
    this.audio?.place();
    this.hud.toast(`Placed ${ITEMS[id].name}`);
  }

  _consumeSelected() {
    const s = this.inventory.selectedItem();
    if (!s) return;
    const def = ITEMS[s.id];
    if (!def?.eat) return;
    this.survival.eat(def);
    this.viewmodel.swing('gather');
    if (def.refillable) { this.hud.toast('Refreshing'); return; } // jug stays
    s.count -= 1;
    if (s.count <= 0) this.inventory.hotbar.slots[this.inventory.selected] = null;
    this.inventory.changed();
  }

  _dropSelectedOne() {
    const s = this.inventory.selectedItem();
    if (!s) return;
    this._dropStack({ id: s.id, count: 1, dur: s.dur });
    s.count -= 1;
    if (s.count <= 0) this.inventory.hotbar.slots[this.inventory.selected] = null;
    this.inventory.changed();
  }

  _dropStack(stack) {
    const dir = this.player.forwardVector(new THREE.Vector3());
    const pos = this.player.pos.clone().add(new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(1.2));
    pos.y = this.player.pos.y + 1;
    this.drops.spawn(stack.id, stack.count, pos, 0.2);
  }

  // Gather only nearby interactable roots so raycasts stay cheap.
  _nearbyInteractables(range) {
    const list = [];
    const p = this.player.pos; const r2 = range * range;
    for (const g of this.resources.resources) {
      if (!g.visible) continue;
      const dx = g.position.x - p.x, dz = g.position.z - p.z;
      if (dx * dx + dz * dz < r2) list.push(g);
    }
    for (const it of this.deploy.items) {
      const dx = it.group.position.x - p.x, dz = it.group.position.z - p.z;
      if (dx * dx + dz * dz < r2) list.push(it.group);
    }
    for (const a of this.animals.animals) {
      if (a.dead) continue;
      const dx = a.mesh.position.x - p.x, dz = a.mesh.position.z - p.z;
      if (dx * dx + dz * dz < r2) list.push(a.mesh);
    }
    return list;
  }

  // Ray-march the analytic terrain height instead of raycasting the mesh — the
  // terrain has ~166k triangles, so a mesh raycast every frame was a big cost.
  _aimGround(maxDist = 6) {
    const cam = this.engine.camera;
    const o = cam.position;
    const d = cam.getWorldDirection(new THREE.Vector3());
    const step = 0.3;
    for (let t = 0.3; t < maxDist; t += step) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (y <= this.terrain.heightAt(x, z)) {
        return new THREE.Vector3(x, this.terrain.heightAt(x, z), z);
      }
    }
    const p = o.clone().add(d.multiplyScalar(maxDist * 0.6));
    p.y = this.terrain.heightAt(p.x, p.z);
    return p;
  }

  _aimEntity(maxDist = 3.2) {
    const cam = this.engine.camera;
    this._raycaster.set(cam.position, cam.getWorldDirection(new THREE.Vector3()));
    this._raycaster.far = maxDist;
    const hits = this._raycaster.intersectObjects(this._nearbyInteractables(maxDist + 1), true);
    for (const h of hits) {
      const root = findEntityRoot(h.object);
      if (root && root.userData.type) return root;
    }
    return null;
  }

  _interact() {
    const ent = this._aimEntity(3.4);
    if (ent && ent.userData.type === 'deployable') {
      this.deploy.interact(ent, this.hud);
      if (this.deploy.instanceForGroup(ent)?.container) { /* opened container via hud */ }
    }
  }

  _toggleInventory() {
    if (this.hud.open) {
      this.hud.close();
      if (this.survival.alive) this.input.requestLock();
    } else {
      this.hud.openScreen();
      this.input.exitLock();
    }
  }

  // ---- Death / respawn ----
  _die(cause) {
    this.playing = false;
    this.input.exitLock();
    this.hud.close();
    this.hud.showDeath(cause);
  }
  respawn() {
    this.survival.reset();
    const sp = this.deploy.spawnPoint || this.terrain.findSpawn();
    this.player.teleport(sp.clone().setY(this.terrain.heightAt(sp.x, sp.z)));
    this.hud.hideDeath();
    this.playing = true;
    this.input.requestLock();
  }

  // ---- Loop ----
  start() {
    this.playing = true;
    this.clock.start();
    this._loop();
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    this.engine.render();
  }

  update(dt) {
    const playing = this.playing && this.input.locked && !this.hud.open;

    // Systems that run even when paused (so the world looks alive on the menu).
    this.sky.update(this._forceTime !== null ? 0 : dt, this.player?.pos);
    // Modulate exposure + bloom with daylight for a darker, moodier night.
    const day = this.sky.dayFactor ?? 1;
    this.engine.renderer.toneMappingExposure = 0.5 + day * 0.55;
    this.engine.bloom.strength = 0.35 + (1 - day) * 0.35;
    // Weather runs after the sky so it can darken fog/sun/exposure.
    this.weather.update(dt, this.engine.camera);
    // Beacon glows at night and its shards slowly orbit.
    if (this.beacon) {
      const bl = this.beacon.userData.beaconLight;
      bl.intensity = (2 + (1 - day) * 12) * (0.9 + Math.sin(performance.now() * 0.003) * 0.1);
      this.beacon.userData.crystal.material.emissiveIntensity = 2.5 + (1 - day) * 2.5;
      this.beacon.userData.shards.rotation.y += dt * 0.5;
    }
    this.ocean.update(dt, this.sky.sunDir, this.sky.sun.color);
    this.resources.update(dt, this.player?.pos);

    if (playing) {
      const exhausted = this.survival.hunger <= 0 || this.survival.thirst <= 0;
      const wasInWater = this.player.inWater;
      this.player.update(dt, this.input, { exhausted, lockSprint: exhausted });
      // Splash feedback when entering the water.
      if (this.player.inWater && !wasInWater) {
        const fp = this.player.pos.clone(); fp.y = 0.1;
        this.particles.splash(fp); this.audio?.splash();
      }

      // Continuous primary use (hold to keep chopping).
      if (this.input.isButton(0) && !ITEMS[this._heldId()]?.ranged) this.combat.usePrimary(this.viewmodel.aiming);

      this.animals.update(dt, this.player, (id, n, pos) => this.drops.spawn(id, n, pos));
      this.combat.update(dt);
      this.drops.update(dt, this.player, this.inventory, () => this.audio?.pickup());

      // Survival environment.
      const warmth = this.deploy.warmthAt(this.player.pos) + (this._heldId() === 'torch' ? 4 : 0);
      this.survival.update(dt, {
        ambientTemp: this.sky.ambientTemp,
        fireWarmth: warmth,
        wearWarmth: this.hud.wearWarmth(),
        sprinting: this.player.sprinting,
        moving: this.player.moving,
        inWater: this.player.inWater,
        wet: this.weather.wet,
      });

      // Interaction prompt is throttled — it doesn't need per-frame precision.
      this._promptTick = (this._promptTick || 0) + 1;
      if (this._promptTick % 4 === 0) this._updateInteractionPrompt();
      if (this._buildMode()) this.build.updateGhost(this._aimGround(6));
    }

    this.deploy.update(dt);
    this.particles.update(dt);

    // Rising embers from nearby fires.
    if (this.player) {
      for (const it of this.deploy.items) {
        if (!it.fire) continue;
        if (it.group.position.distanceTo(this.player.pos) < 34 && Math.random() < dt * 6) {
          const ep = it.group.position.clone(); ep.y += it.kind === 'furnace' ? 0.5 : 0.35;
          this.particles.ember(ep);
        }
      }
    }

    // Viewmodel: reflect selected item + animate.
    this._updateViewmodel(dt);

    // Ambient + positional audio.
    if (this.player) {
      const nearFire = this.deploy.warmthAt(this.player.pos) + (this._heldId() === 'torch' ? 4 : 0);
      this.audio.update(dt, {
        moving: playing && this.player.moving, grounded: this.player.grounded,
        speed: this.player.speed, nearFire, dayFactor: this.sky.dayFactor,
      });
      this.hud.setCompass(this.player.yaw);
    }

    // HUD.
    this.hud.renderVitals(this.survival);
    this.hud.setClock(`${this.sky.clockString()}   ${this.weather.label()}`);
  }

  _updateViewmodel(dt) {
    const id = this._heldId();
    const def = id ? ITEMS[id] : null;
    const showCats = ['tool', 'weapon', 'build', 'food'];
    const showId = (def && (showCats.includes(def.category) || def.category === 'deploy')) ? id : null;
    this.viewmodel.setTool(showId);

    this.viewmodel.update(dt, {
      moving: this.player?.moving,
      speed: this.player?.speed || 0,
      look: this.player?._lastLook || { x: 0, y: 0 },
    });

    // Torch world light.
    const holdingTorch = id === 'torch';
    if (holdingTorch) {
      const cam = this.engine.camera;
      const dir = cam.getWorldDirection(new THREE.Vector3());
      this.playerLight.position.copy(cam.position).add(dir.multiplyScalar(0.5)).add(new THREE.Vector3(0, -0.2, 0));
      const flick = 0.7 + Math.sin(performance.now() * 0.02) * 0.18 + Math.random() * 0.08;
      this.playerLight.intensity = 10 * flick;
    } else {
      this.playerLight.intensity = 0;
    }
  }

  _updateInteractionPrompt() {
    const id = this._heldId();
    const def = id ? ITEMS[id] : null;
    if (this._buildMode()) {
      this.hud.prompt(`<b>[RMB]</b> place ${this.build.piece} &nbsp; <b>[R]</b> rotate &nbsp; <b>[ [ / ] ]</b> piece`);
      return;
    }
    if (def?.category === 'deploy') { this.hud.prompt(`<b>[RMB]</b> place ${def.name}`); return; }
    if (def?.category === 'food') { this.hud.prompt(`<b>[RMB]</b> ${id === 'waterJug' ? 'drink' : 'eat'} ${def.name}`); return; }
    const ent = this._aimEntity(3.4);
    if (ent?.userData.type === 'deployable') {
      const k = ent.userData.deployable;
      const label = k === 'sleepingBag' ? 'set respawn' : k === 'box' ? 'open box' : k === 'furnace' ? 'use furnace' : 'use campfire';
      this.hud.prompt(`<b>[E]</b> ${label}`);
      return;
    }
    this.hud.hidePrompt();
  }

  _showStart(label = 'Click to play') {
    const start = document.getElementById('start-screen');
    const btn = document.getElementById('play-btn');
    document.getElementById('loading').classList.add('hidden');
    btn.textContent = label;
    btn.classList.remove('hidden');
    start.classList.remove('hidden');
  }
}

// ---- Bootstrap ----
async function boot() {
  const game = new Game();
  await game.build();

  const start = document.getElementById('start-screen');
  const btn = document.getElementById('play-btn');
  const play = () => {
    start.classList.add('hidden');
    game.audio?.init();
    game.input.requestLock();
    if (!game._started) { game._started = true; game.start(); }
    else game.playing = true;
  };
  btn.addEventListener('click', play);
  game._showStart('Click to play');

  document.getElementById('respawn-btn').addEventListener('click', () => game.respawn());

  // Signal for headless screenshot tooling.
  window.__READY = true;
}

boot();
