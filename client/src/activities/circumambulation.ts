import { STUPA_COURT } from '../config/layout';

/**
 * 繞塔: walking round the great stupa inside its court walls, clockwise (keeping it on your right). Each full lap
 * earns merit; from the first lap on you leave a trail of light, stronger at 5, 10 and 15 laps. Going the other way
 * unwinds the lap in progress. The light shows only inside the walls; outside them your laps fade away (two seconds
 * each), and the lap in progress starts again.
 */
export class Circumambulation {
  /** Laps circled on autopilot (fractional while fading outside the walls); laps walked on foot don't count. */
  laps = 0;
  /** A lap was completed: the new count. */
  onLap: (laps: number, auto: boolean) => void = () => {};
  private turned = 0;
  private prev: number | null = null;
  private inside = false;

  /** How strong the trail of light is: 0 (none, or outside the walls) … 4. */
  get strength() {
    if (!this.inside) return 0;
    const l = Math.floor(this.laps + 1e-6);
    return l >= 15 ? 4 : l >= 10 ? 3 : l >= 5 ? 2 : l >= 1 ? 1 : 0;
  }

  update(dt: number, x: number, z: number, auto = false) {
    const dx = x - STUPA_COURT.x, dz = z - STUPA_COURT.z, h = STUPA_COURT.half - 0.4;
    if (Math.abs(dx) > h || Math.abs(dz) > h) { // outside the walls: progress fades
      this.inside = false;
      this.prev = null;
      this.turned = 0;
      this.laps = Math.max(0, this.laps - dt * 0.5);
      return;
    }
    this.inside = true;
    const b = Math.atan2(dx, -dz); // bearing from the stupa: north 0, east π/2 … (clockwise, seen from above, adds)
    if (this.prev !== null && auto) { // (only the way round on autopilot counts: on foot, nothing)
      let d = b - this.prev;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      this.turned += d;
    }
    this.prev = b;
    if (this.turned >= Math.PI * 2) {
      this.turned -= Math.PI * 2;
      this.laps = Math.floor(this.laps + 1e-6) + 1;
      this.onLap(this.laps, true);
    }
  }
}
