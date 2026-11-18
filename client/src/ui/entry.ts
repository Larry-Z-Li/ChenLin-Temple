import { sanitizeName } from '../../../shared/protocol';
import { saveSettings, settings } from '../config/settings';
import { AVATAR_COLORS } from '../config/theme';
import { t } from '../i18n';
import { h } from './dom';

/** Name + robe colour picker. Resolves on the click that also unlocks audio. */
export function showEntry(parent: HTMLElement): Promise<{ name: string; color: string }> {
  return new Promise((resolve) => {
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
        });
        return b;
      }),
    );
    const enter = h('button', { class: 'primary-btn', i18n: 'entry.enter' });
    const card = h(
      'div',
      { class: 'entry-card' },
      h('div', { class: 'entry-title', i18n: 'app.title' }),
      h('div', { class: 'entry-sub', i18n: 'app.subtitle' }),
      h('label', { class: 'field' }, h('span', { i18n: 'entry.name' }), name),
      h('div', { class: 'field' }, h('span', { i18n: 'entry.robe' }), swatches),
      enter,
      h('div', { class: 'entry-hint', i18n: 'entry.hint' }),
    );
    const overlay = h('div', { class: 'entry' }, card);
    parent.append(overlay);
    name.focus();

    const go = () => {
      settings.name = sanitizeName(name.value || name.placeholder);
      settings.color = color;
      saveSettings();
      overlay.classList.add('out');
      setTimeout(() => overlay.remove(), 700);
      resolve({ name: settings.name, color });
    };
    enter.addEventListener('click', go);
    name.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  });
}
