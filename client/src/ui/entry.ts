import { sanitizeName } from '../../../shared/protocol';
import { unlockAudio } from '../audio/sfx';
import { saveSettings, settings } from '../config/settings';
import { AVATAR_COLORS } from '../config/theme';
import { t } from '../i18n';
import { h } from './dom';

/**
 * The entry panel (left, over a grey tint on the mountain intro): the temple's name and motto, then your name
 * and robe colour. `onRobe` recolours the pacing monk as you choose; `done` resolves on Enter (the
 * click that also unlocks audio). Enter stays disabled until `ready()` — the world is still loading.
 */
export function showEntry(parent: HTMLElement, onRobe: (color: string) => void) {
  let resolve!: (v: { name: string; color: string; hall?: string }) => void;
  const done = new Promise<{ name: string; color: string; hall?: string }>((r) => (resolve = r));
  const name = h('input', { class: 'text-input', maxlength: '20', value: settings.name, 'data-i18n-placeholder': 'entry.namePlaceholder', autocomplete: 'nickname' }) as HTMLInputElement;
  name.placeholder = t('entry.namePlaceholder');
  let color = settings.color;
  const swatches = h(
    'div',
    { class: 'swatches' },
    ...AVATAR_COLORS.map((c) => {
      const b = h('button', { class: `swatch${c === color ? ' active' : ''}`, style: `background:${c}`, 'aria-label': c });
      b.addEventListener('click', () => {
        color = c;
        swatches.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s === b));
        onRobe(c);
      });
      return b;
    }),
  );
  const enter = h('button', { class: 'entry-go', disabled: true }, h('span', { i18n: 'entry.enter' }), h('span', { class: 'entry-arrow' }, '→')) as HTMLButtonElement;
  // Or fly straight to one of the gate halls instead of the front gate.
  const hallBtns = ([['caishen', '生門院'], ['yangsheng', '休門院'], ['guanyin', '開門院'], ['guoxue', '景門院']] as const).map(([id, label]) => {
    const b = h('button', { class: 'entry-hall', disabled: true }, label) as HTMLButtonElement;
    b.addEventListener('click', () => go(id));
    return b;
  });
  const halls = h('div', { class: 'entry-halls' }, ...hallBtns);
  const panel = h(
    'div',
    { class: 'entry-panel' },
    h('div', { class: 'entry-kicker', i18n: 'entry.kicker' }),
    h('h1', { class: 'entry-title', i18n: 'app.title' }),
    h('div', { class: 'entry-sub', i18n: 'app.subtitle' }),
    h('label', { class: 'entry-field' }, h('span', { i18n: 'entry.name' }), name),
    h('div', { class: 'entry-field' }, h('span', { i18n: 'entry.robe' }), swatches),
    enter,
    halls,
    h('div', { class: 'entry-hint', i18n: 'entry.hint' }),
  );
  const overlay = h('div', { class: 'entry' }, panel);
  parent.append(overlay);

  let ready = false;
  const go = (hall?: string) => {
    if (!ready) return;
    unlockAudio();
    settings.name = sanitizeName(name.value || name.placeholder);
    settings.color = color;
    saveSettings();
    // The grey tint lifts first, then he sets off.
    ready = false;
    overlay.classList.add('out');
    setTimeout(() => {
      overlay.remove();
      resolve({ name: settings.name, color, hall });
    }, 1000);
  };
  enter.addEventListener('click', () => go());
  name.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  return {
    done,
    ready() {
      ready = true;
      enter.disabled = false;
      hallBtns.forEach((b) => (b.disabled = false));
    },
  };
}
