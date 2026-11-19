import { bell, drum, purr, woodFish } from '../audio/sfx';
import type { Instrument, WorldContext } from '../core/context';
import { t, type I18nKey } from '../i18n';
import type { NetClient } from '../net/netClient';
import type { LocalPlayer } from '../player/localPlayer';

const PROMPT: Record<Instrument['kind'], I18nKey> = {
  bowl: 'prompt.strikeBowl',
  woodfish: 'prompt.strikeWoodfish',
  drum: 'prompt.beatDrum',
  bell: 'prompt.strikeBell',
  cat: 'prompt.petCat',
};
const RADIUS: Record<Instrument['kind'], number> = { bowl: 1.15, woodfish: 1.15, drum: 1.5, bell: 1.5, cat: 1.6 };
/** How far each instrument carries (metres until silent). */
const REACH: Record<Instrument['kind'], number> = { bowl: 45, woodfish: 30, drum: 80, bell: 90, cat: 15 };

/** Bowl bells, wooden fish, the drum, the bell and the cat: anyone nearby hears them. */
export class Instruments {
  private byId = new Map<string, Instrument>();
  private last = 0;

  constructor(ctx: WorldContext, private net: NetClient, private player: LocalPlayer) {
    for (const ins of ctx.instruments) {
      this.byId.set(ins.id, ins);
      ctx.interactions.add({
        id: ins.id, x: ins.x, z: ins.z, radius: RADIUS[ins.kind],
        prompt: () => ({ text: t(PROMPT[ins.kind]) }),
        onInteract: () => this.strike(ins),
      });
    }
    net.on('strike', (id, by) => {
      const ins = this.byId.get(id);
      if (ins && by !== net.id) this.sound(ins);
    });
  }

  private strike(ins: Instrument) {
    const now = performance.now();
    if (now - this.last < 320) return; // matches the server's rate limit
    this.last = now;
    const p = this.player;
    p.yaw = Math.atan2(-(ins.x - p.pos.x), -(ins.z - p.pos.z)); // face it
    p.gesture('reach', 0.45);
    this.sound(ins);
    this.net.strike(ins.id);
  }

  private sound(ins: Instrument) {
    ins.onStrike();
    const d = Math.hypot(ins.x - this.player.pos.x, ins.z - this.player.pos.z);
    const vol = Math.max(0, 1 - d / REACH[ins.kind]) ** 1.6;
    if (vol < 0.02) return;
    switch (ins.kind) {
      case 'bowl': return bell(330, 7, vol);
      case 'bell': return bell(118, 10, vol * 1.3);
      case 'drum': return drum(vol);
      case 'woodfish': return woodFish(vol);
      case 'cat': return purr(vol);
    }
  }
}
