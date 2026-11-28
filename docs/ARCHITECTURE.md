# Architecture

How the temple codebase is organised, and how a session starts. Paths are from the repo root unless noted.

For content (sutras, models, chants), see [ASSETS.md](./ASSETS.md).

---

## Top level

```
shared/           Types and protocol shared by client and server
server/src/       Node HTTP + WebSocket game server
client/src/       Browser Three.js app
client/public/    Static assets (served as-is)
docs/             Human docs (this file, assets guide, …)
scripts/          Build/tour/optimize helpers
```

| Piece | Role |
|-------|------|
| `shared/protocol.ts` | WebSocket message types (`ClientMsg` / `ServerMsg`), wish/player shapes, constants |
| `shared/moderation.ts` | Word filter for lantern wishes |
| `shared/greatWheel.ts` | Great prayer-wheel state math |
| `shared/flagRing.ts` | Prayer-flag ring layout helpers |
| `server/src/index.ts` | Serves the built client, `/ws`, `/api/*`, realtime game logic |
| `server/src/store.ts` | Wish/flag persistence (Upstash Redis or local files) |

---

## Boot sequence (client)

```
index.html
  → src/main.ts          load CSS, locale, entry UI; dynamic-import game
    → src/game.ts        startGame(): build world, systems, render loop
      → src/ui/entry.ts  start page; on Enter → game.enter(name, color, hall?)
```

1. **`main.ts`** — sets locale, shows the entry screen, starts `startGame`, then waits for the player to enter.
2. **`game.ts`** — creates renderer/scene/camera, builds the world, wires HUD/net/player, runs `setAnimationLoop`.
3. **`game.enter(...)`** — cloud flight (or gallery test names), then WebSocket `join` so others see you.

---

## `client/src/` by folder

### Orchestration

| File | Role |
|------|------|
| `game.ts` | World build, systems, input hooks, merit, animation loop, `window.temple` debug handle |
| `main.ts` | App entry: loader progress, entry screen, call into `game` |

### `config/`

Data and user prefs (little logic).

| File | Role |
|------|------|
| `layout.ts` | Hall positions/sizes/`HALLS`, spawn, travel spots, landmark coords |
| `deities.ts` | Deity ids, name keys, statue heights |
| `theme.ts` | Shared colours/materials |
| `settings.ts` | LocalStorage: name, robe colour, graphics, volume, merit, language |

### `core/`

Engine plumbing used everywhere.

| File | Role |
|------|------|
| `context.ts` | `WorldContext`: scene, collisions, ground, seats, updaters, … |
| `collisions.ts` | Walk collision world |
| `ground.ts` | Height pads/ramps |
| `input.ts` | Keyboard / pointer input |
| `interaction.ts` | “Press E” prompts near objects |
| `interiorCull.ts` | Don’t draw hall interiors when far away |
| `farCull.ts` | Distance culling for heavy props |
| `staticMerge.ts` | Merge static meshes (fewer draw calls) |
| `loadQueue.ts` | Prioritised asset loading (sky before statues) |
| `math.ts` | Damping, RNG, helpers |
| `textures.ts` | Canvas textures (plaques, glow sprites) |

### `content/`

| File | Role |
|------|------|
| `manifest.ts` | Load `assets/*/index.json` (models, sutras, chants, thangkas, ambient) |

### `world/`

Outdoor / sky / living world (built from `game.ts`).

Examples: `terrain.ts`, `sky.ts`, `water.ts`, `vegetation.ts`, `gardens.ts`, `wildlife.ts`, `lanterns.ts`, `lightPool.ts`, `intro.ts` (start-page mountain path), `modelGallery.ts`.

### `buildings/`

Architecture and fixtures.

| File | Role |
|------|------|
| `hall.ts` | `buildHall` — shell, roof, altar, cushions, calls statue/furnishings |
| `statue.ts` | `buildStatueSlot` — plinth + GLB (+ optional halo) |
| `hallFurnishings.ts` | Instruments, rugs, extra hall props |
| `prayerWheels.ts` / `greatWheel.ts` | Small and great prayer wheels |
| `offeringTable.ts`, `stupas.ts`, `hut.ts`, `pagodas.ts`, … | Other structures |

### `player/`

| File | Role |
|------|------|
| `avatar.ts` | Procedural monk mesh + poses + walk cycle |
| `localPlayer.ts` | Your character: movement modes, owns an `Avatar` |
| `cameraRig.ts` | Third-person follow / look (orbit around player) |

### `activities/`

Gameplay interactions (usually constructed in `game.ts`).

Seat/prostration, mala beads, sutra reader, chant panel, offerings, hall lantern walls / blessing, instruments, cloud travel, circumambulation, Garuda flags, Bodhi bell, …

### `audio/`

Ambient playlist, chant player, SFX / soundscape.

### `net/`

| File | Role |
|------|------|
| `netClient.ts` | WebSocket client, send/receive protocol messages |
| `remotePlayers.ts` | Other people’s avatars from snapshots |

### `ui/`

HUD, entry/start page, minimap/big map, touch joystick, icons.

### `i18n/`

`t('key')` + `locales/en.ts`, `locales/zh-Hant.ts`.

### `dev/`

Mock/preview pages (not the live temple path).

---

## How a hall appears (example)

```
game.ts
  loadModelMap() / loadThangkas()     content/manifest.ts
  HALLS.forEach(buildHall)            config/layout.ts → buildings/hall.ts
    buildStatueSlot(id, …, models[id])  buildings/statue.ts
      GLTFLoader → assets/models/*.glb
    buildCushions / furnishHall         hall.ts / hallFurnishings.ts
```

---

## Client ⇄ server

```
Browser                         Node (server/src/index.ts)
────────                        ─────────────────────────
netClient  ──WebSocket /ws──►   presence, move, wish, bless, wheels, …
           ◄── snapshots ──     broadcast join/leave/snap/wishAdded/…
fetch /api/status               headcount JSON
POST /api/remove-wish           admin (ADMIN_KEY)
store.ts                        wishes.json key → Redis or disk
```

Message shapes live in `shared/protocol.ts`. The server keeps authoritative seats, wheels, wishes, offerings; the client predicts locally where it must feel snappy (e.g. own wheel push) then corrects from echoes.

---

## Mental model

| Layer | Responsibility |
|-------|----------------|
| **Config + assets** | What exists (halls, deities, files) |
| **World / buildings** | Static 3D place |
| **Player / camera / input** | You moving through it |
| **Activities + UI** | Rituals and chrome |
| **Net + shared protocol** | Shared live state with others |
| **`game.ts`** | Wires all of the above and renders each frame |

If you are new: read `main.ts` → skim `startGame` in `game.ts` → pick one vertical (e.g. `hall.ts` + `statue.ts`, or `avatar.ts` + `localPlayer.ts`).
