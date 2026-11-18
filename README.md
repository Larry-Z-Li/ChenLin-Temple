# 九宮寺 · Nine Palace Temple

A browser-based 3D temple where people can practise together online: walk the grounds, kneel on a cushion in silence, count prayer beads, read sutras, listen to chants, turn prayer wheels, offer incense and fruit, and do prostrations.

Live: https://nine-palace-temple.onrender.com (Render, see `render.yaml`).

This is a **graybox**: layout, systems and multiplayer are real; art is placeholder. Statues and thangkas are deliberately empty slots until real assets are added (see [docs/ASSETS.md](docs/ASSETS.md)).

## Run it

```bash
npm install
npm run dev          # client http://localhost:5173 + realtime server :8787
```

Open the URL in two browser windows to see multiplayer. If the server isn't running, the client runs in offline mode.

Production: `npm run build && npm start` serves everything from http://localhost:8787 (set `PORT` to change it).

## Controls

| | |
|---|---|
| WASD / arrows | walk (Shift = faster) |
| drag / scroll | look around / zoom |
| E | kneel on a cushion · sit on a bench · pick fruit · take / light / offer incense · offer fruit · tap repeatedly beside a prayer wheel to spin it faster |
| 1 / 2 / 3 | on a cushion: prayer beads · sutras · three prostrations. On a bench: 1 beads · 2 sutras |
| B | bow with palms together (合掌) |
| C | chants (listen anywhere, even while walking) |
| ← → | move prayer beads one bead |
| Esc | leave the current activity / stand up |
| M | map (drawn south-up) |
| Phone / tablet | joystick to walk · drag to look · pinch to zoom · tap the prompt to interact |

## Layout

All buildings and statues face south; players spawn in the south. The map is drawn south-up, so east appears on the left.

```
                 S  (spawn, mountain gate)
            [prayer wheels on the approach]
              SOUTH HALL: Mañjuśrī
              MARĪCĪ SHRINE  (+ prayer wheels)
 E  orchard    CENTER HALL: Five Tathāgatas    lotus pond  W
   NE: Daikokuten   N: Cundī   NW: Cintāmaṇicakra
                 ~ waterfall ~
                 N
```

Everything is data-driven from [client/src/config/layout.ts](client/src/config/layout.ts): move a hall, resize it, change seat counts or deity order there. Each hall has 40 kneeling cushions; the South and Center halls have front and back doors.

## Project structure

```
shared/protocol.ts      wire protocol (client ⇄ server)
server/src/index.ts     WebSocket server: presence, positions, cushion & wheel ownership
client/src/
  config/               layout, deities, theme, user settings
  i18n/                 t() + locales/en.ts (add languages here)
  world/                terrain, sky, vegetation, pond, waterfall
  buildings/            halls, cushions, offering tables, statue slots, thangka mounts, prayer wheels
  player/               avatar (posable), local player, camera
  activities/           seat session, prayer beads, sutra reader, chant panel
  audio/                ambient playlist, chant player, synthesized bead/bell sounds
  net/                  client connection, remote players
  ui/                   HUD, entry screen, minimap
client/public/assets/   your content (sutras, chants, ambient, thangkas, models)
```

## Languages

Default is Traditional Chinese (`zh-Hant`), with English selectable. Every UI string goes through `t('key')`. To add a language, copy `client/src/i18n/locales/zh-Hant.ts`, translate it, and register it in `LOCALES` in `client/src/i18n/index.ts`. Hall and gate plaques read right to left in Chinese, as traditional inscriptions do. Content manifests accept per-language titles and files.

## Practice features

- **Offerings:** pick fruit in the orchard (regrows after 10 min, carry up to 5). At any hall's table or the courtyard burner, one press offers incense (take, light, bow, plant; burns 30 min); offer fruit on the plates. Offerings are shared and clear at midnight in `TEMPLE_TZ` (default Asia/Taipei).
- **Prostrations:** on a cushion press 3: stand, palms to crown / mouth / heart, kneel, forehead to floor, palms up, rise; three times, then stay kneeling.
- **Soundscape:** wind, the waterfall and stream (louder as you approach), birdsong, an occasional wind chime, footsteps by surface, and a temple bell on the hour. Synthesized by default; drop recordings into `client/public/assets/sfx/index.json` to replace any of them.
- **Day & night:** the sky follows the temple's clock (`TEMPLE_TZ`): dawn and dusk glow, a moonlit night with stars, lanterns lit after dark, crickets instead of birds. ⚙ → *Always day* opts out.
- **Furnishings:** bronze incense burner, stone lanterns, red lanterns and wind bells on the eaves, column couplets (placeholder texts in `config/layout.ts`), stone tablet at the gate, arched bridge over the stream, koi, mani stones on the ridge, painted ceilings, canopies and water bowls in the halls, drifting leaves.
- **Cloud fast travel:** clouds by the gate and the Hall of Cundī fly you between them in ~5 s.
- **Graphics:** ⚙ settings has High / Low (Low is the default on phones), plus ambient and effects volume.

## Roadmap

- Real statues, thangkas, chants and recorded ambience (see docs/ASSETS.md)
- Group practice sessions, a personal practice log, server persistence, sharding past ~150 people
