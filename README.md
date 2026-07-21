# Rustlike — a from-scratch browser survival game

A single-page, **no-build** survival game inspired by the *genre* of Rust, written
from scratch with [Three.js](https://threejs.org/). Everything — the world, the
physics, the rendering pipeline and **every 3D model** (including the first-person
hands and tools) — is generated procedurally in code. No external art, and no
assets from Rust or any other commercial game.

![Day](docs/shots/day.png)
![Night](docs/shots/night.png)

## Features

- **Procedural island world** — heightmap terrain with beaches, plains, forests,
  rock and snow biomes; a reflective ocean; and a full day/night sky.
- **Realistic-leaning rendering** — PBR materials, ACES tonemapping, soft
  shadows, bloom, FXAA, exponential fog, animated water with sun glints, and an
  atmospheric-scattering sky with sun, moon and stars.
- **First-person controller** — walk/sprint/crouch/jump, swimming, and a
  first-person **viewmodel** (arms + held tool) with idle bob and swing animation.
- **Survival** — health, hunger, thirst and temperature, with starvation,
  dehydration, hypothermia and regeneration.
- **Gathering & crafting** — chop trees, mine rocks/ore, gather plants; craft
  tools, weapons, deployables and clothing; smelt ore in a furnace.
- **Building** — grid-snapped foundations, walls, doorways, windows, floors and
  stairs, with real collision.
- **Deployables** — campfire (warmth + cooking), furnace (smelting), sleeping bag
  (respawn point) and storage box.
- **Animals with AI** — deer, boar, chickens, wolves and bears with wander / flee
  / chase / attack behaviours; melee and bow combat.

## Running

There is **no build step**. Serve the folder with any static file server:

```bash
# from the repository root
python3 -m http.server 8080
# then open http://localhost:8080/
```

Click **Play** to lock the pointer and start.

### Controls

| Input | Action |
| --- | --- |
| `WASD` | Move · `Shift` sprint · `Ctrl` crouch · `Space` jump/swim up |
| Mouse | Look · `LMB` use/attack (hold to keep chopping) · `RMB` context (place / aim / eat) |
| `1`–`6` / Wheel | Select hotbar slot |
| `Tab` | Inventory + crafting |
| `E` | Interact (open box, use furnace, set respawn) |
| `G` | Drop one of the selected item |
| Hammer + `RMB` | Place building piece · `R` rotate · `[` / `]` change piece |

### URL parameters (handy for testing)

- `?seed=<text>` — choose the world seed.
- `?time=<0..24>` — freeze the clock at a time of day (used for screenshots).

## Project layout

```
index.html            # import map + HUD markup (no bundler)
vendor/three/          # vendored Three.js core + the addons we use
src/
  core/                # engine (renderer/post), input, noise/math
  world/               # terrain, sky, ocean, procedural textures, resources
  entities/            # physics, player controller, animal AI
  models/              # procedural models: nature, animals, items, viewmodel, buildings, deployables
  systems/             # inventory, crafting, building, combat, survival, deployables, drops
  ui/                  # HUD, inventory/crafting screen, 3D item-icon renderer
  data/                # item + recipe tables
docs/EXPLAINER.md      # deep-dive write-up with code walkthrough + screenshots
```

See [docs/EXPLAINER.md](docs/EXPLAINER.md) for the full design write-up.
