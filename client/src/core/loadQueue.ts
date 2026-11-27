import * as THREE from 'three';

/**
 * What you see first (the Milky Way, the flags' print) comes down before the big downloads (the statues' models,
 * ~90 MB) start, so it isn't left black for seconds while they share the line; those then come two at a time.
 */
const firsts: Promise<void>[] = [];

/** A texture to have first (and a promise kept for the gate below). */
export function firstTexture(url: string): THREE.Texture {
  let done!: () => void;
  firsts.push(new Promise<void>((r) => (done = r)));
  return new THREE.TextureLoader().load(url, () => done(), undefined, () => done());
}

let gate: Promise<void> | null = null;
/** Open once every first texture asked for while the world was built is in (or after 6 s, whatever happens). */
const opened = () =>
  (gate ??= new Promise<void>((r) => setTimeout(r, 0)).then(() =>
    Promise.race([Promise.all(firsts).then(() => {}), new Promise<void>((r) => setTimeout(r, 6000))]),
  ));

const queue: (() => Promise<void>)[] = [];
let running = 0;
const pump = () => {
  while (running < 2 && queue.length) {
    running++;
    queue.shift()!().finally(() => (running--, pump()));
  }
};
/** A big download, waiting its turn (resolve the promise when it's done, loaded or failed). */
export function queueLoad(run: () => Promise<void>) {
  queue.push(run);
  opened().then(pump);
}
