// The setting controls of the side panel: the sliders, numbers, toggles and selects that each
// change one setting of the active layout, named by their `data-key`.
import type { NumericField } from '../config.ts';
import {
  controlValue as controlValueOf,
  rangeHTML,
  selectHTML,
  toggleHTML,
  unitFor,
  type ControlTemplates,
} from './controls-view.ts';
import { $, $$ } from '../../ui/dom.ts';
import { booleanSetting, choiceSetting, numericField } from './dom-input.ts';
import { clamp, fieldSpec, round } from '../model.ts';
import { normalizeRoom } from '../room.ts';
import { applySetting, type SettingChange } from '../setting-change.ts';
import type { RoomEditorHost } from './host.ts';

/** The settings whose number re-applies even unchanged, as it takes the arm out of an automatic mode. */
const MANUAL_ARM_SETTINGS: readonly string[] = ['armBaseAngle', 'armElbowAngle', 'monitorYaw'];

/** Elements inside the settings panel, which is rebuilt on every render. */
export const controlsAll = <E extends Element = HTMLElement>(selector: string): E[] => [
  ...$('#controls').querySelectorAll<E>(selector),
];

/** Sets the fill of a range slider, as a percentage of its span. */
export const setRangeFill = (slider: HTMLInputElement, percent: number) =>
  slider.style.setProperty('--pct', `${percent}%`);

export class SettingControls {
  declare private readonly host: RoomEditorHost;

  constructor(host: RoomEditorHost) {
    this.host = host;
  }

  /** The templates of the controls, which read the active layout and its evaluation. */
  templates(): ControlTemplates {
    return {
      range: (key, label) => rangeHTML(this.view(), key, label),
      toggle: (key, label) => toggleHTML(this.view(), key, label),
      select: (key, label, options) => selectHTML(this.view(), key, label, options),
    };
  }

  /** The active layout and its evaluation, as the control templates read them. */
  view() {
    return { state: this.host.project.state, evaluation: this.host.evaluation() };
  }

  /** Applies a change of one setting, and shows it. */
  update(change: SettingChange) {
    const { project } = this.host;
    project.state = applySetting(project.state, change);
    if (change.key.startsWith('room')) project.state = normalizeRoom(project.state);
    project.saveSoon();
    this.host.refresh();
  }

  /** Binds the setting controls the side panel shows. */
  bind() {
    this.labelInches();
    controlsAll<HTMLInputElement>('input[type=range][data-key]').forEach((el) =>
      el.addEventListener('input', () => {
        const key = numericField(el.dataset.key);
        const val = Number(el.value);
        setRangeFill(el, ((val - Number(el.min)) / (Number(el.max) - Number(el.min))) * 100);
        $<HTMLInputElement>(`#${key}-number`).value = String(val);
        this.update({ kind: 'number', key, value: val });
      }),
    );
    controlsAll<HTMLInputElement>('input[data-number]').forEach((el) => this.bindNumber(el));
    controlsAll<HTMLInputElement>('input[type=checkbox]').forEach((el) =>
      el.addEventListener('change', () => {
        const key = booleanSetting(el.dataset.key);
        this.update({ kind: 'toggle', key, value: el.checked });
        if (key.endsWith('Enabled')) this.host.renderControls();
      }),
    );
    controlsAll<HTMLSelectElement>('select[data-key]').forEach((el) =>
      el.addEventListener('change', () => {
        const key = choiceSetting(el.dataset.key);
        this.update({ kind: 'choice', key, value: el.value });
        if (key === 'clampMount' || key === 'monitorMode') this.host.renderControls();
      }),
    );
  }

  /** Shows each setting control's limits and value, as the active layout has them now. */
  sync() {
    const state = this.host.project.state;
    controlsAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((el) => {
      if (!(el instanceof HTMLInputElement)) return;
      if (!el.matches('input[type=range]') && !el.hasAttribute('data-number')) return;
      const key = numericField(el.dataset.key);
      const [min, max, step] = fieldSpec(key, state);
      el.min = String(min);
      el.max = String(max);
      el.step = String(step);
      if (el.matches('input[type=range]')) {
        el.value = String(this.valueOf(key));
        setRangeFill(el, ((this.valueOf(key) - min) / (max - min)) * 100);
        const labels = el.closest('.control')!.querySelectorAll('.control-range-label span');
        labels[0].textContent = String(min);
        labels[1].textContent = `${max} ${unitFor(key)}`;
      } else if (el !== document.activeElement) el.value = String(round(this.valueOf(key), 1));
    });
  }

  private valueOf(key: NumericField): number {
    return controlValueOf(this.view(), key);
  }

  /** The screen diagonal is in inches rather than the cm of the other settings. */
  private labelInches() {
    for (const node of $$('[data-key="monitorInches"]')) {
      const wrap = node.closest('.control');
      if (wrap) {
        wrap.querySelector('.number-wrap span')!.textContent = '″';
        wrap.querySelector('.control-range-label span:last-child')!.textContent = '49 ″';
        node.setAttribute('aria-label', 'Screen diagonal in inches');
      }
    }
  }

  /** A typed number goes to its slider as it is typed, and is rounded to its step once done. */
  private bindNumber(el: HTMLInputElement) {
    const key = numericField(el.dataset.key);
    const applyNumber = (commit: boolean) => {
      const state = this.host.project.state;
      const [min, max, step] = fieldSpec(key, state);
      if (el.value.trim() === '' || !Number.isFinite(Number(el.value))) {
        if (commit) el.value = String(round(this.valueOf(key), 1));
        return;
      }
      const raw = Number(el.value);
      if (!commit && (raw < min || raw > max)) return;
      const val = round(clamp(Math.round(raw / step) * step, min, max));
      if (commit) el.value = String(val);
      const slider = $<HTMLInputElement>(`#${key}-range`);
      slider.value = String(val);
      setRangeFill(slider, ((val - min) / (max - min)) * 100);
      if (
        this.valueOf(key) !== val ||
        (MANUAL_ARM_SETTINGS.includes(key) && state.monitorMode !== 'manual')
      )
        this.update({ kind: 'number', key, value: val });
      if (commit) el.value = String(round(this.valueOf(key), 1));
    };
    el.addEventListener('input', () => applyNumber(false));
    el.addEventListener('change', () => applyNumber(true));
    el.addEventListener('blur', () => applyNumber(true));
  }
}
