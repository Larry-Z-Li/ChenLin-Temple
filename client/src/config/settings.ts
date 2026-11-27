import { DEFAULT_LOCALE } from '../i18n';

/** Per-device user preferences, persisted to localStorage (best-effort). */
export interface Settings {
  name: string;
  color: string;
  lang: string;
  /** True once the visitor picks a language themselves; until then the default locale applies. */
  langChosen: boolean;
  /** 'auto' = low on phones/tablets, high elsewhere. */
  graphics: 'auto' | 'high' | 'low';
  /** Set when 'auto' found this device too slow for high (kept, so the next visit starts low). */
  autoLow: boolean;
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

const DEFAULTS: Settings = {
  name: '',
  color: '#8e2b1f',
  lang: DEFAULT_LOCALE,
  langChosen: false,
  graphics: 'auto',
  autoLow: false,
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

export function graphicsLevel(): 'high' | 'low' {
  // Auto stays low on phones: stepping down after the fact is too late if the first high pass OOMs the tab.
  return settings.graphics === 'auto' ? (isTouchDevice || settings.autoLow ? 'low' : 'high') : settings.graphics;
}
