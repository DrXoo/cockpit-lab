// Public entry point of the room model. New code can import the focused modules directly.

export {
  clamp,
  round,
  transformPoint,
  inversePoint,
  rectangle,
  overlapDepth,
  polygonDistance,
} from './shared/geometry.ts';
export * from './config.ts';
export * from './layout.ts';
export * from './desk.ts';
export * from './field-spec.ts';
export * from './monitor-arm.ts';
export * from './parts.ts';
export * from './evaluate.ts';
