# Vajra Temple (working title)

A browser-based 3D temple where people can practise together online: walk the grounds, kneel on a cushion, sit in silence, count prayer beads, read sutras, listen to chants, and turn prayer wheels.

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
| E | kneel on a cushion · sit on a bench · tap repeatedly beside a prayer wheel to spin it faster |
| 1 / 2 / 3 | on a cushion: silence · prayer beads · sutras. On a bench: 3 = sutras |
| C | chants (listen anywhere, even while walking) |
| ← → | move prayer beads one bead |
| Esc | leave the current activity / stand up |
| M | map (drawn south-up) |

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

## Roadmap (planned hooks already in place)

- **Fruit picking:** orchard fruits have stable ids (`buildVegetation()` returns `FruitSpot[]`).
- **Offerings:** every hall has an offering table with an incense bowl, a stack of incense, candles and empty fruit plates (`ctx.offeringTables[].slots`). Next: take incense, light it at a candle, place it in the bowl; offer picked fruit (with an error if you have none), persisted until the end of the day (needs a server-side day clock).
- **Prostrations (key 5):** the avatar's pose system blends named poses (`player/avatar.ts`). Add keyframes for hands at crown → mouth → heart → kneel → forehead to floor → rise, played 3×.
- Touch controls, chat or quiet gestures, server persistence, sharding past ~150 people per instance.
