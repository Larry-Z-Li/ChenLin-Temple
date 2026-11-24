import * as THREE from 'three';
import { ANIMS, FLAG_CLOUD, FLAG_GLOW_SHIFT, FLAG_INCENSE, FLAG_INCENSE_LIT, FLAG_LANTERN, FLAG_LISTENING, type PlayerInfo, type Transform } from '../../../shared/protocol';
import { BLESS_GLOW } from '../activities/lanternBlessing';
import { damp, dampAngle } from '../core/math';
import { Avatar } from '../player/avatar';

interface Remote {
  info: PlayerInfo;
  avatar: Avatar;
  target: Transform;
  yaw: number;
  speed: number;
}

/** Other players: smooth toward the latest snapshot. */
export class RemotePlayers {
  readonly map = new Map<string, Remote>();

  /** `groundAt`: our own ground and floors; nobody is drawn sunk below them (another player's game may be
   * a different version, with a hall or path where ours has none). */
  constructor(private scene: THREE.Scene, private groundAt: (x: number, z: number) => number = () => -Infinity) {}

  get count() {
    return this.map.size;
  }

  reset(list: (PlayerInfo & { tr: Transform })[]) {
    for (const id of [...this.map.keys()]) this.remove(id);
    list.forEach((p) => this.add(p));
  }

  add(p: PlayerInfo & { tr: Transform }) {
    if (this.map.has(p.id)) this.remove(p.id);
    const avatar = new Avatar(p.color, p.name);
    avatar.root.position.set(p.tr[0], p.tr[1], p.tr[2]);
    this.scene.add(avatar.root);
    this.map.set(p.id, { info: p, avatar, target: p.tr, yaw: p.tr[3], speed: 0 });
  }

  remove(id: string) {
    const r = this.map.get(id);
    if (!r) return;
    this.scene.remove(r.avatar.root);
    r.avatar.dispose();
    this.map.delete(id);
  }

  applySnapshot(tr: Record<string, Transform>) {
    for (const id in tr) {
      const r = this.map.get(id);
      if (r) r.target = tr[id];
    }
  }

  /** The colour of the lantern a player is carrying to bless (set by the game). */
  lanternOf: (id: string) => number | null = () => null;
  /** …and whether it's a lantern or a butter lamp. */
  lampKindOf: (id: string) => 'lantern' | 'chalice' = () => 'lantern';

  update(dt: number, camera: THREE.Camera) {
    for (const [id, r] of this.map) {
      const p = r.avatar.root.position, [x, y, z, yaw, a] = r.target;
      const dist = Math.hypot(x - p.x, z - p.z);
      if (dist > 25) p.set(x, Math.max(y, this.groundAt(x, z)), z); // teleport (e.g. just sat down far away)
      else {
        const nx = damp(p.x, x, 9, dt), nz = damp(p.z, z, 9, dt);
        r.speed = damp(r.speed, Math.hypot(nx - p.x, nz - p.z) / Math.max(dt, 1e-4), 6, dt);
        p.set(nx, Math.max(damp(p.y, y, 12, dt), this.groundAt(nx, nz)), nz);
      }
      r.yaw = dampAngle(r.yaw, yaw, 10, dt);
      r.avatar.root.rotation.y = r.yaw;
      r.avatar.anim = ANIMS[a] ?? 'idle';
      const flags = r.target[5];
      r.avatar.setListening((flags & FLAG_LISTENING) !== 0);
      r.avatar.setIncense(flags & FLAG_INCENSE ? (flags & FLAG_INCENSE_LIT ? 2 : 1) : 0);
      r.avatar.setCloud((flags & FLAG_CLOUD) !== 0);
      r.avatar.holdLantern(flags & FLAG_LANTERN ? (this.lanternOf(id) ?? 0xffc46a) : null, 1 + ((flags >> FLAG_GLOW_SHIFT) & 3) * ((BLESS_GLOW - 1) / 3), undefined, flags & FLAG_LANTERN ? this.lampKindOf(id) : 'lantern');
      r.avatar.setTagVisible(camera.position.distanceTo(p) < 28);
      r.avatar.update(dt, r.speed);
    }
  }

  positions() {
    return [...this.map.values()].map((r) => r.avatar.root.position);
  }
}
