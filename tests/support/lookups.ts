// Lookups that fail the test with a message when what they look for is missing or of another
// kind, so a test reads the value it expects instead of guarding against undefined.
import assert from 'node:assert/strict';

/** `value`, failing the test when it is missing. */
export function present<T>(value: T | undefined | null, what: string): NonNullable<T> {
  assert.ok(value !== undefined && value !== null, `${what} is missing.`);
  return value;
}

type OfKind<T, K> = Extract<T, { kind: K }>;

const isOfKind = <T extends { kind: string }, K extends T['kind']>(
  value: T,
  kind: K,
): value is OfKind<T, K> => value.kind === kind;

/** The values of `kind`, in their order. */
export const allOfKind = <T extends { kind: string }, K extends T['kind']>(
  values: readonly T[],
  kind: K,
): OfKind<T, K>[] => values.filter((value) => isOfKind(value, kind));

/** `value`, failing the test when it is missing or not of `kind`. */
export function ofKind<T extends { kind: string }, K extends T['kind']>(
  value: T | undefined,
  kind: K,
): OfKind<T, K> {
  assert.ok(value !== undefined, `A ${kind} is missing.`);
  assert.ok(isOfKind(value, kind), `Expected a ${kind}, found a ${value.kind}.`);
  return value;
}
