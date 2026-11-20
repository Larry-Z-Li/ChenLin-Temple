import './styles.css';

// iOS Safari ignores user-scalable=no: stop its page pinch/double-tap zoom so rapid taps (bead counting) don't zoom.
for (const ev of ['gesturestart', 'gesturechange', 'dblclick'] as const) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
import { settings } from './config/settings';
import { setLocale } from './i18n';
import { showEntry } from './ui/entry';

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;

await setLocale(settings.lang);
const { name, color } = await showEntry(ui);
// Load the 3D world only after the entry click (also satisfies browser autoplay rules).
const { startGame } = await import('./game');
await startGame(app, ui, name, color);
