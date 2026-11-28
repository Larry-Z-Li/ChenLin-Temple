import { DEFAULT_LOCALE } from '../i18n';

/** Per-device user preferences, persisted to localStorage (best-effort). */
export interface Settings {
  name: string;
  color: string;
  lang: string;
  /** True once the visitor picks a language themselves; until then the default locale applies. */
  langChosen: boolean;
  /**
   * 'auto' = phones boot low (then may probe up to high); desktop starts high and may fall to low.
   * Manual 'high' / 'low' skip the probe.
   */
  graphics: 'auto' | 'high' | 'low';
  /** Set when 'auto' found this device too slow for high (kept, so it won't probe again). */
  autoLow: boolean;
  /** Set when a phone's high probe settled successfully (next visit still boots low, then promotes sooner). */
  autoHigh: boolean;
  /** Frame rate and draw calls under the headcount (also `?fps` in the address). */
  showFps: boolean;
  /** 'temple' = sky follows the temple's clock (day and night); 'day' = always daytime. */
  timeOfDay: 'temple' | 'day' | 'night';
  musicOn: boolean;
  musicVolume: number;
  chantVolume: number;
  sfxVolume: number;
  beadRounds: number;
  /** 功德: one for each full turn of a prayer wheel you set turning (kept on this device). */
  merit: number;
}

const KEY = 'temple.settings.v1';
/** Session flag: high probe started but not settled — if the tab dies, next boot sticks to low. */
const PROBE_KEY = 'temple.highProbe';

const DEFAULTS: Settings = {
  name: '',
  color: '#8e2b1f',
  lang: DEFAULT_LOCALE,
  langChosen: false,
  graphics: 'auto',
  autoLow: false,
  autoHigh: false,
  showFps: false,
  timeOfDay: 'temple',
  musicOn: true,
  musicVolume: 0.5,
  chantVolume: 0.8,
  sfxVolume: 0.6,
  beadRounds: 0,
  merit: 0,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s: Settings = { ...DEFAULTS, ...JSON.parse(raw) };
      if (!s.langChosen) s.lang = DEFAULTS.lang;
      return s;
    }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

export const settings: Settings = load();

let saveTimer = 0;
export function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, 300);
}

export const isTouchDevice = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** This visit only: after a successful/failed probe, or cleared on manual High/Low. */
let sessionLevel: 'high' | 'low' | null = null;

export function setSessionGraphics(level: 'high' | 'low' | null) {
  sessionLevel = level;
}

/** Last visit died mid-probe → remember low and don't try high again. */
(function reclaimFailedHighProbe() {
  try {
    if (sessionStorage.getItem(PROBE_KEY) !== '1') return;
    sessionStorage.removeItem(PROBE_KEY);
    settings.autoHigh = false;
    settings.autoLow = true;
    saveSettings();
  } catch {
    /* sessionStorage blocked */
  }
})();

/** Call just before enabling high on a phone so a tab kill sticks to low next time. */
export function beginHighProbe() {
  try {
    sessionStorage.setItem(PROBE_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Probe finished without a kill: persist the outcome and clear the crash flag. */
export function endHighProbe(ok: boolean) {
  try {
    sessionStorage.removeItem(PROBE_KEY);
  } catch {
    /* ignore */
  }
  settings.autoHigh = ok;
  settings.autoLow = !ok;
  saveSettings();
}

export function graphicsLevel(): 'high' | 'low' {
  if (settings.graphics === 'high') return 'high';
  if (settings.graphics === 'low') return 'low';
  if (sessionLevel) return sessionLevel;
  // Auto: phones always boot low (OOM-safe); desktop starts high unless a past visit stuck autoLow.
  if (settings.autoLow || isTouchDevice) return 'low';
  return 'high';
}
