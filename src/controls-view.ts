// Templates of the setting controls. They read the state and evaluation they are given, so the
// same markup can be produced and tested outside the browser.
import { round } from './geometry.ts';
import type { CockpitConfig, NumericField } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { fieldSpec } from './field-spec.ts';
import { wrapAngle } from './monitor-arm.ts';
import { floorHeight, isRigHeightKey } from './rig.ts';

export interface ControlView {
  state: CockpitConfig;
  evaluation: CockpitEvaluation;
}

export type BooleanSetting = {
  [K in keyof CockpitConfig]: CockpitConfig[K] extends boolean ? K : never;
}[keyof CockpitConfig];
export type ChoiceSetting = {
  [K in keyof CockpitConfig]: CockpitConfig[K] extends string ? K : never;
}[keyof CockpitConfig];

/** The control templates bound to a state, as the editors receive them. */
export interface ControlTemplates {
  range(key: NumericField, label: string): string;
  toggle(key: BooleanSetting, label: string): string;
  select(key: ChoiceSetting, label: string, options: [value: string, text: string][]): string;
}

const ANGLE_SETTINGS: readonly string[] = ['recline', 'wheelTilt', 'pedalTilt', 'monitorYaw'];

export const unitFor = (key: string): string =>
  key === 'monitorInches'
    ? '″'
    : key === 'armSplit'
      ? '%'
      : ANGLE_SETTINGS.includes(key) || key.endsWith('Angle')
        ? '°'
        : 'cm';

/**
 * The value a control shows: rig heights from the floor, and the arm angles as currently
 * evaluated (they follow the monitor mode unless the arm is in manual mode).
 */
export function controlValue({ state, evaluation }: ControlView, key: NumericField): number {
  if (isRigHeightKey(key)) return floorHeight(state, key);
  if (key === 'armBaseAngle') return evaluation.armPose.baseAngle;
  if (key === 'armElbowAngle') return evaluation.armPose.elbowAngle;
  if (key === 'monitorYaw') return wrapAngle(evaluation.monitorAngle - state.deskAngle);
  return state[key];
}

export function rangeHTML(view: ControlView, key: NumericField, label: string): string {
  const [min, max, step] = fieldSpec(key, view.state),
    value = round(controlValue(view, key), 1);
  return `<div class="control"><div class="control-top"><label for="${key}-range">${label}</label><div class="number-wrap"><input id="${key}-number" type="number" data-key="${key}" data-number min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}, valor en ${unitFor(key)}"><span>${unitFor(key)}</span></div></div><input id="${key}-range" type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}" style="--pct:${((value - min) / (max - min)) * 100}%"><div class="control-range-label"><span>${min}</span><span>${max} ${unitFor(key)}</span></div></div>`;
}

export function toggleHTML(view: ControlView, key: BooleanSetting, label: string): string {
  return `<div class="toggle-control"><label for="${key}">${label}</label><label class="switch"><input type="checkbox" id="${key}" data-key="${key}" ${view.state[key] ? 'checked' : ''} aria-label="${label}"><span class="switch-track"></span></label></div>`;
}

export function selectHTML(
  view: ControlView,
  key: ChoiceSetting,
  label: string,
  options: [value: string, text: string][],
): string {
  return `<div class="select-control"><label for="${key}">${label}</label><select id="${key}" data-key="${key}">${options.map(([value, text]) => `<option value="${value}" ${view.state[key] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></div>`;
}

export const groupHTML = (title: string, html: string, hint = ''): string =>
  `<div class="control-group"><h3 class="group-title">${title}${hint ? `<span>${hint}</span>` : ''}</h3>${html}</div>`;
