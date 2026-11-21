// The whole scene as drawn for one configuration and view, ready for the Three.js adapter.
import type { RoomConfig } from '../room/config.ts';
import type { CockpitEvaluation } from '../room/evaluate.ts';
import { degToRad } from '../shared/geometry.ts';
import {
  drawDeskDimensions,
  drawLayoutSelection,
  type LayoutSelection,
} from '../room/render/annotations.ts';
import {
  drawCadProfiles,
  drawConnectors,
  drawPlateHoles,
  type CockpitDrawing,
} from '../cockpit/render/cad.ts';
import { drawPartLength, drawPlacementAlong, drawPlateSize } from '../cockpit/render/dimensions.ts';
import { drawMeasurement } from '../cockpit/render/measurement.ts';
import { drawDriver } from '../cockpit/render/driver.ts';
import { drawHandleStems, drawSnapGuide } from '../cockpit/render/handles.ts';
import { drawFrontArrow } from '../cockpit/render/front-arrow.ts';
import { drawCandidate } from '../cockpit/render/hover.ts';
import { drawArmReach, drawDesk, drawMonitor, type ArmHandle } from '../room/render/desk.ts';
import { designBounds } from './camera.ts';
import { createRenderList, ROOT, type Primitive, type SceneLabel } from './render-list.ts';
import { drawRoom } from '../room/render/room.ts';

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
      {
        fitting: options.cockpit.fitting ?? false,
        ghostId: options.cockpit.ghostPartId ?? null,
      },
    );
    drawConnectors(r, ROOT, options.cockpit.connectors ?? []);
    if (options.cockpit.resolved.size > 0)
      drawFrontArrow(r, ROOT, designBounds(options.cockpit.resolved));
    if (options.cockpit.plateHoles)
      drawPlateHoles(r, ROOT, options.cockpit.resolved, options.cockpit.plateHoles);
    if (options.cockpit.driver) drawDriver(r, ROOT, options.cockpit.driver);
    const { resolved, selectedPartId, placedPartId = null } = options.cockpit;
    for (const id of options.cockpit.secondCandidateIds ?? []) {
      const candidate = resolved.get(id);
      if (candidate) drawCandidate(r, ROOT, candidate);
    }
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
