// What the room editor has selected, and how it is being edited. It belongs to the session and
// is never saved.

export interface RoomSelection {
  /**
   * The item selected in the plan or the panel: `desk`, `arm`, a desk item's id,
   * `feature:<id>` or `furniture:<id>`, or '' for none.
   */
  target: string;
  /** Whether dragging in the plan arranges the room and the desk. */
  editing: boolean;
  /**
   * The arm pose last chosen, saved or updated, or '' for none. A layout opens with the pose its
   * arm is in, so moving the arm afterwards shows that pose as changed.
   */
  armPose: string;
}

export const noRoomSelection = (): RoomSelection => ({ target: '', editing: false, armPose: '' });
