# Content & assets guide

All content lives in `client/public/assets/`. Each folder has an `index.json` manifest; the temple works with empty manifests and picks up whatever you add (just refresh).

| Folder | Formats | Manifest entry |
|---|---|---|
| `sutras/` | `.md`, `.txt` | `{ "id", "title": {"en": "…"}, "file", "lang", "group" }` |
| `chants/` | `.mp3`, `.m4a`, `.ogg` | `{ "id", "title": {"en": "…"}, "file" }` |
| `ambient/` | `.mp3`, `.m4a`, `.ogg` | `{ "id", "title", "file" }` (shuffled, looped) |
| `thangkas/` | `.jpg`, `.webp`, `.png` (portrait, ≤ 2048 px tall) | `{ "file", "hall"? }`: `hall` pins it to one hall id |
| `models/` | `.glb` | `{ "manjushri": "manjushri.glb", … }` (deity id → file) |

Deity ids: `manjushri`, `cintamanicakra`, `cundi`, `daikokuten`, `marici`, `vairocana`, `akshobhya`, `ratnasambhava`, `amitabha`, `amoghasiddhi`. Hall ids: `south`, `marici`, `center`, `northwest`, `north`, `northeast`.

**Translations:** give the same sutra in several languages the same `group` and a different `lang` (e.g. `heart.en.md`, `heart.zh.md`). The reader picks the visitor's language and falls back to English.

---

## Statues (3D models)

No statues are drawn in code. Each altar shows a plain plinth with a name plate until you supply a model.

**Where to find them**
- **Sketchfab** (sketchfab.com): many photogrammetry scans of real Buddhist statues, some uploaded by museums. Filter by *Downloadable* and check each model's licence (CC-BY needs a credit; avoid NC if you'll ever charge). Download as glTF/GLB.
- **Scan the World / MyMiniFactory**: free scans of museum sculpture. These are usually STL with no colour; import into Blender, add a gold/bronze material, export GLB.
- **Smithsonian 3D** (3d.si.edu): a small CC0 collection, including some Asian art.
- **Commission a 3D artist** (ArtStation, Fiverr, Upwork): the best route for consistent style and correct iconography. Give them reference images, a target of < 100k triangles, and GLB output.

**Search tip:** Japanese and Chinese names find far more material. Cintāmaṇicakra = Nyoirin Kannon (如意輪観音), Cundī = Juntei Kannon (准胝観音), Marīcī = Marishiten (摩利支天), Mañjuśrī = Monju (文殊), Daikokuten (大黒天), Vairocana = Dainichi (大日如来).

**Technical:** GLB, facing +Z (the glTF default, which is south here), ideally < 10 MB. Compress with `npx @gltf-transform/cli optimize in.glb out.glb`. Models are auto-scaled to the heights in `client/src/config/deities.ts`.

## Thangkas & paintings (images)

Until images are supplied, each hanging is blank silk in a brocade mount.

**Free / public domain (CC0)**
- **The Met Open Access** (metmuseum.org/art/collection, tick "Open Access"): many Tibetan thangkas and Japanese Buddhist paintings.
- **Art Institute of Chicago** (artic.edu/collection): public-domain works are CC0.
- **Cleveland Museum of Art Open Access** (clevelandart.org/open-access): CC0.
- **Smithsonian Open Access** (si.edu/openaccess): includes the National Museum of Asian Art.

**Free with conditions**
- **Wikimedia Commons** (search "Category:Thangkas"): check each file's licence.
- **ColBase** (colbase.nich.go.jp): Japan's national museums. Strong on Shingon/esoteric paintings (Nyoirin, Juntei, Daikokuten). Free use with credit; check each item's terms.

**Reference only**
- **Himalayan Art Resources** (himalayanart.org): the best place to identify and verify iconography, but its images aren't freely licensed.

**Best for a practice space:** commission or buy high-resolution scans from a living thangka painter. Ask your teacher or lineage whether particular images are appropriate to display, and avoid AI-generated deity images.

## Sutra texts

- **CBETA** (cbeta.org): the Chinese Buddhist canon in Traditional Chinese, a natural fit since 繁體中文 is the default. Free for non-commercial use with credit; check their terms.
- **84000** (84000.co): English translations from the Tibetan canon. Creative Commons, non-commercial, with credit.
- **BDK English Tripiṭaka** (bdkamerica.org): English translations from the Chinese canon, with many free PDFs.
- Texts your own lineage uses, with permission.

Save as `.md` or `.txt` (UTF-8). Give each translation of a text the same `group` and set `"lang": "zh-Hant"` or `"en"`.

## Chants & ambient sound

- **Chants:** the best source is recordings from your own teacher or sangha, made with their permission. Commercial chant albums and YouTube rips are copyrighted.
- **Freesound** (freesound.org): field recordings of streams, birds, wind chimes, temple bells and wind. Filter by CC0 or CC-BY.
- **Pixabay** (pixabay.com/sound-effects, /music): royalty-free ambience and meditation music.
- **Internet Archive** (archive.org): some public-domain recordings; check each item.

Use `.mp3` or `.m4a` at about 128–192 kbps. Loop-friendly ambience tracks of 3–10 minutes work best.

## Nature & props (optional, to replace the low-poly placeholders)

- **Quaternius** (quaternius.com) and **Kenney** (kenney.nl): free CC0 stylized trees, rocks and props in glTF.
- **Poly Haven** (polyhaven.com): CC0 photoreal textures, HDRI skies and some models.

Keep a `CREDITS.md` with the source and licence of every file you add.
