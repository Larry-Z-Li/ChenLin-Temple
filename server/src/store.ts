import fs from 'node:fs';
import path from 'node:path';

/**
 * Where lasting things (the wish lanterns, the address-hash salt) are kept.
 *
 * - With UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN set: in Upstash Redis, over its REST API
 *   (plain fetch, no extra packages). This survives redeploys and restarts on hosts whose disk doesn't
 *   last, like Render's free plan.
 * - Otherwise: as files in `dataDir` (fine locally, or on a host with a persistent disk).
 */
export interface Store {
  readonly kind: string;
  /** The stored value, or null if there's none yet. Throws if the store can't be reached. */
  load(key: string): Promise<string | null>;
  save(key: string, value: string): Promise<void>;
}

export function openStore(dataDir: string): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, ''), token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const call = async (cmd: string, key: string, body?: string) => {
      const res = await fetch(`${url}/${cmd}/${encodeURIComponent('temple:' + key)}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { authorization: `Bearer ${token}` },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`upstash ${cmd} ${res.status}`);
      return ((await res.json()) as { result: string | null }).result;
    };
    return {
      kind: 'Upstash Redis',
      load: (key) => call('get', key),
      save: async (key, value) => void (await call('set', key, value)),
    };
  }
  const file = (key: string) => path.join(dataDir, key);
  return {
    kind: `files in ${dataDir}`,
    load: async (key) => {
      try {
        return fs.readFileSync(file(key), 'utf8');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw e;
      }
    },
    save: async (key, value) => {
      fs.mkdirSync(dataDir, { recursive: true });
      await fs.promises.writeFile(file(key), value);
    },
  };
}
