import './styles.css';

// iOS Safari ignores user-scalable=no: stop its page pinch/double-tap zoom so rapid taps (bead counting) don't zoom.
for (const ev of ['gesturestart', 'gesturechange', 'dblclick'] as const) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
import { settings } from './config/settings';
import { setLocale } from './i18n';
import { showEntry } from './ui/entry';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;

// The loading screen (in index.html): the ensō draws on as the temple loads, then fades to the start page.
const loader = document.getElementById('loader');
const progress = (p: number) => loader?.style.setProperty('--p', String(p));
await setLocale(settings.lang);
progress(0.2);
let game: Awaited<ReturnType<typeof import('./game').startGame>> | null = null;
const entry = showEntry(ui, (color) => game?.preview(color));
const { startGame } = await import('./game');
progress(0.55);
game = await startGame(app, ui);
progress(1);
setTimeout(() => {
  loader?.classList.add('done'); // the name fades, then the white
  setTimeout(() => loader?.remove(), 2200);
}, 900); // let the circle close first
entry.ready();
const { name, color, hall } = await entry.done;
game.enter(name, color, hall);
