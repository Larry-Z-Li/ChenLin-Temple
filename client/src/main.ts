import './styles.css';

// iOS Safari ignores user-scalable=no: stop its page pinch/double-tap zoom so rapid taps (bead counting) don't zoom.
for (const ev of ['gesturestart', 'gesturechange', 'dblclick'] as const) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
import { settings } from './config/settings';
import { setLocale } from './i18n';
import { showEntry } from './ui/entry';
import { h } from './ui/dom';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;

await setLocale(settings.lang);
// Start in white; the mountain intro fades in once the world is built.
const white = h('div', { class: 'whiteout' });
document.body.append(white);
let game: Awaited<ReturnType<typeof import('./game').startGame>> | null = null;
const entry = showEntry(ui, (color) => game?.preview(color));
const { startGame } = await import('./game');
game = await startGame(app, ui);
requestAnimationFrame(() => setTimeout(() => {
  white.classList.add('out');
  setTimeout(() => white.remove(), 3200);
}, 300));
entry.ready();
const { name, color, hall } = await entry.done;
game.enter(name, color, hall);
