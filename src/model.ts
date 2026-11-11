// Public entry point of the configurator model. New code can import the focused modules directly.

export {
  clamp,
  round,
  transformPoint,
  inversePoint,
  rectangle,
  overlapDepth,
  polygonDistance,
} from './geometry.ts';
export * from './config.ts';
export * from './rig.ts';
export * from './layout.ts';
export * from './desk.ts';
export * from './field-spec.ts';
export * from './monitor-arm.ts';
export * from './anatomy.ts';
export * from './parts.ts';
export * from './evaluate.ts';
