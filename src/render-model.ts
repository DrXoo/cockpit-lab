// The whole scene as drawn for one configuration and view, ready for the Three.js adapter.
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { degToRad } from './geometry.ts';
import {
  drawDeskDimensions,
  drawLayoutSelection,
  drawRigDimensions,
  drawSetupLabels,
  type LayoutSelection,
} from './render-annotations.ts';
import { drawArmReach, drawDesk, drawMonitor, type ArmHandle } from './render-desk.ts';
import { createRenderList, ROOT, type Primitive, type SceneLabel } from './render-list.ts';
import { drawRig } from './render-rig.ts';
import { drawRoom } from './render-room.ts';

export interface RenderOptions extends LayoutSelection {
  /** Draws the seated person in the cockpit. */
  person: boolean;
}

export interface RenderModel {
  primitives: Primitive[];
  labels: SceneLabel[];
  armHandles: ArmHandle[];
}

export function renderModel(
  s: CockpitConfig,
  e: CockpitEvaluation,
  options: RenderOptions,
): RenderModel {
  const { view } = options;
  const r = createRenderList();
  const hasRig = s.cockpitEnabled !== false;
  const rig = r.group(
    ROOT,
    hasRig
      ? { position: [s.cockpitX, 0, s.cockpitZ], rotation: [0, degToRad(s.cockpitAngle), 0] }
      : {},
  );
  const dimensions = r.group(ROOT, {}, { role: 'dimensions' });
  drawRig(r, rig, s, e, { person: options.person });
  const desk = r.group(ROOT, {
    position: [s.deskX, 0, s.deskZ],
    rotation: [0, degToRad(s.deskAngle), 0],
  });
  drawDesk(r, desk, s, e);
  const armHandles = drawMonitor(r, ROOT, s, e, {
    showHandles:
      options.layoutEditing &&
      options.layoutTarget === 'arm' &&
      (view === 'top' || view === 'desk'),
  });
  drawArmReach(r, dimensions, s, e, { visible: view === 'top' });
  drawRigDimensions(r, dimensions, s, e, view);
  drawDeskDimensions(r, dimensions, s, e);
  drawSetupLabels(r, s, e);
  const room = r.group(ROOT, {}, { visible: s.roomEnabled !== false });
  drawRoom(r, room, dimensions, s, e);
  drawLayoutSelection(r, ROOT, s, e, options);
  return { primitives: r.primitives, labels: r.labels, armHandles };
}
