/**
 * Loads the JSON manifests under /assets. Missing or broken manifests resolve to empty lists,
 * so the temple works before any content is imported.
 */
type LocalText = string | Record<string, string>;

export interface SutraEntry {
  id: string;
  title: LocalText;
  /** .md or .txt, relative to /assets/sutras/ */
  file: string;
  /** Language of this file; entries sharing a `group` are translations of one text. */
  lang?: string;
  group?: string;
}

export interface AudioEntry {
  id: string;
  title: LocalText;
  /** .mp3 / .ogg / .m4a, relative to the manifest's folder */
  file: string;
  lang?: string;
}

export interface ThangkaEntry {
  /** Image relative to /assets/thangkas/ (portrait, ~2:3, ≤ 2048px tall). */
  file: string;
  title?: LocalText;
  /** Restrict to one hall id (see config/layout.ts); omit to use anywhere. */
  hall?: string;
}

const cache = new Map<string, Promise<unknown>>();

async function getJson<T>(url: string, fallback: T): Promise<T> {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((r) => (r.ok ? r.json() : fallback))
        .catch(() => fallback),
    );
  }
  return cache.get(url) as Promise<T>;
}

const BASE = `${import.meta.env.BASE_URL}assets`;
/** The heavy folders, fetched from the CDN when there is one (see vite.config.ts); the rest from our own server. */
const CDN_FOLDERS = new Set(['models', 'chants']);
export const assetUrl = (folder: string, file: string) => (__ASSET_CDN__ && CDN_FOLDERS.has(folder) ? `${__ASSET_CDN__}/${folder}/${file}` : `${BASE}/${folder}/${file}`);
/** For a file that failed from the CDN: the same file from our own server (null if it wasn't a CDN one). */
export const ownServerUrl = (url: string) => (__ASSET_CDN__ && url.startsWith(__ASSET_CDN__) ? BASE + url.slice(__ASSET_CDN__.length) : null);

export const loadSutras = () => getJson<{ items: SutraEntry[] }>(`${BASE}/sutras/index.json`, { items: [] }).then((m) => m.items ?? []);
export const loadChants = () => getJson<{ items: AudioEntry[] }>(`${BASE}/chants/index.json`, { items: [] }).then((m) => m.items ?? []);
export const loadAmbient = () => getJson<{ items: AudioEntry[] }>(`${BASE}/ambient/index.json`, { items: [] }).then((m) => m.items ?? []);
export const loadThangkas = () => getJson<{ items: ThangkaEntry[] }>(`${BASE}/thangkas/index.json`, { items: [] }).then((m) => m.items ?? []);
/** deity id → .glb file in /assets/models/ */
export const loadModelMap = () => getJson<Record<string, string>>(`${BASE}/models/index.json`, {});
