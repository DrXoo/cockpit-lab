// The whole scene as drawn for one configuration and view, ready for the Three.js adapter.
import type { RoomConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { degToRad } from './shared/geometry.ts';
import {
  drawDeskDimensions,
  drawLayoutSelection,
  type LayoutSelection,
} from './render-annotations.ts';
import { drawCadProfiles, drawConnectors, type CockpitDrawing } from './render-cad.ts';
import { drawPartLength, drawPlacementAlong, drawPlateSize } from './render-cad-dimensions.ts';
import { drawMeasurement } from './render-measurement.ts';
import { drawDriver } from './render-driver.ts';
import { drawHandleStems, drawSnapGuide } from './render-handles.ts';
import { drawArmReach, drawDesk, drawMonitor, type ArmHandle } from './render-desk.ts';
import { createRenderList, ROOT, type Primitive, type SceneLabel } from './render-list.ts';
import { drawRoom } from './render-room.ts';

export interface RenderOptions extends LayoutSelection {
  /** The room floor follows the interface theme. */
  roomFloor: string;
  /** A cockpit design shown on its own, at the origin. */
  cockpit?: CockpitDrawing | null;
}

export interface RenderModel {
  primitives: Primitive[];
  labels: SceneLabel[];
  armHandles: ArmHandle[];
}

export function renderModel(
  s: RoomConfig,
  e: CockpitEvaluation,
  options: RenderOptions,
): RenderModel {
  const { view } = options;
  const r = createRenderList();
  const dimensions = r.group(ROOT, {}, { role: 'dimensions' });
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
  drawDeskDimensions(r, dimensions, s, e);
  const room = r.group(ROOT, {}, { visible: s.roomEnabled !== false });
  drawRoom(r, room, dimensions, s, e, options.roomFloor);
  drawLayoutSelection(r, ROOT, s, e, options);
  if (options.cockpit) {
    drawCadProfiles(
      r,
      ROOT,
      options.cockpit.resolved,
      options.cockpit.selectedPartId,
      options.cockpit.previewPartId ?? null,
      { fitting: options.cockpit.fitting ?? false },
    );
    drawConnectors(r, ROOT, options.cockpit.connectors ?? []);
    if (options.cockpit.driver) drawDriver(r, ROOT, options.cockpit.driver);
    const { resolved, selectedPartId, placedPartId = null } = options.cockpit;
    // While a part is placed on the selected profile, it is measured along it instead, and a
    // profile being placed shows its own length, whether dimensions are shown or not.
    const placingOnSelected = placedPartId !== null && placedPartId !== selectedPartId;
    if (!placingOnSelected) drawPartLength(r, dimensions, resolved, selectedPartId, view);
    const placedLength = placingOnSelected
      ? drawPartLength(r, ROOT, resolved, placedPartId, view)
      : null;
    if (placedLength) placedLength.alwaysShown = true;
    drawPlacementAlong(r, ROOT, resolved, placedPartId, view);
    drawPlateSize(r, dimensions, resolved, placedPartId ?? selectedPartId, view);
    if (options.cockpit.measure) drawMeasurement(r, ROOT, options.cockpit.measure);
    drawHandleStems(r, ROOT, options.cockpit.handles ?? []);
    if (options.cockpit.snapGuide) drawSnapGuide(r, ROOT, options.cockpit.snapGuide);
  }
  return { primitives: r.primitives, labels: r.labels, armHandles };
}
