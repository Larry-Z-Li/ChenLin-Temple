/** Keyboard state + key-press subscriptions. Ignores keys while typing in inputs. */

type Handler = (e: KeyboardEvent) => boolean | void;

export class Input {
  private down = new Set<string>();
  private handlers: Handler[] = [];

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.down.add(e.code);
      // Later subscribers (e.g. open panels) get first pick.
      for (let i = this.handlers.length - 1; i >= 0; i--) {
        if (this.handlers[i](e) === true) {
          e.preventDefault();
          break;
        }
      }
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(...codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  /** Return true from the handler to consume the event. */
  onKey(h: Handler) {
    this.handlers.push(h);
    return () => {
      this.handlers = this.handlers.filter((x) => x !== h);
    };
  }
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}
