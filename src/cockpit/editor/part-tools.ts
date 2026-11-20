// What the selected step offers, apart from its inspector: the tools of the view's toolbar and
// what the Delete key does to it. Both depend on whether the design is being fitted.
import { makesAPart, makesAProfile, type Operation } from '../cad/history/history.ts';

/** An action on the selected part, from the toolbar of the view. */
export type PartTool =
  'grow' | 'plate' | 'foot' | 'remove' | 'mount-seat' | 'mount-wheel-base' | 'mount-pedals';

/** Whether the design is being fitted to the driver, in the Fit mode of the view. */
export interface Mode {
  fitting?: boolean;
}

export const isAPeripheral = (operation: Operation) => operation.kind === 'mount-peripheral';

/**
 * The tools the view offers for the selected step. Designing, a profile grows a profile, takes a
 * plate and a foot, and any part of the frame can be removed. Fitting, a profile or a plate
 * takes a peripheral, and a peripheral can be removed. A failed step, or one that makes no part,
 * has none.
 */
export function partToolsOf(
  operation: Operation | undefined,
  failure?: string,
  { fitting = false }: Mode = {},
): PartTool[] {
  if (!operation || failure !== undefined || !makesAPart(operation)) return [];
  if (isAPeripheral(operation)) return fitting ? ['remove'] : [];
  if (fitting)
    return makesAProfile(operation) || operation.kind === 'add-plate'
      ? ['mount-seat', 'mount-wheel-base', 'mount-pedals']
      : [];
  return makesAProfile(operation) ? ['grow', 'plate', 'foot', 'remove'] : ['remove'];
}

/**
 * What the Delete key does to the selected step, as its inspector offers it: remove the part it
 * made from the history marker on, or, for a failed step or one that makes no part, delete it.
 * Fitting, the frame is locked; designing, a peripheral is only a reference: both are left alone.
 */
export function deleteKeyAction(
  operation: Operation | undefined,
  failure?: string,
  { fitting = false }: Mode = {},
): 'remove-part' | 'delete-step' | null {
  if (!operation || fitting !== isAPeripheral(operation)) return null;
  return makesAPart(operation) && failure === undefined ? 'remove-part' : 'delete-step';
}
