/** Proximity-based interactables: the nearest one in range shows an [E] prompt. */

export interface Interactable {
  id: string;
  x: number;
  z: number;
  radius: number;
  /** Prompt text, or null when unavailable right now. `busy` = show greyed-out text. */
  prompt: () => { text: string; busy?: boolean } | null;
  onInteract: () => void;
}

export class InteractionSystem {
  private items: Interactable[] = [];
  current: Interactable | null = null;
  enabled = true;

  add(item: Interactable) {
    this.items.push(item);
  }

  /** Nearest item in range that currently has something to offer (null prompts are skipped). */
  update(x: number, z: number) {
    this.current = null;
    if (!this.enabled) return null;
    let best = Infinity;
    for (const it of this.items) {
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < it.radius && d < best && it.prompt()) {
        best = d;
        this.current = it;
      }
    }
    return this.current;
  }

  trigger() {
    const p = this.current?.prompt();
    if (this.current && p && !p.busy) this.current.onInteract();
  }
}
