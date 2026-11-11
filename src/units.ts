// Length units. The configurator model works in cm; cut lists and the future CAD model use mm.
// The brands exist only for the type checker: they stop a cm value from being passed where mm
// is expected without an explicit conversion. At runtime both are plain numbers.

declare const unit: unique symbol;

/** A length in centimetres. */
export type Cm = number & { readonly [unit]: 'cm' };
/** A length in millimetres. */
export type Mm = number & { readonly [unit]: 'mm' };

export const MM_PER_CM = 10;

export const cmToMm = (length: number): Mm => (length * MM_PER_CM) as Mm;

export const mmToCm = (length: Mm): Cm => (length / MM_PER_CM) as Cm;

/** Cut lengths are given in whole millimetres. */
export const roundMm = (length: Mm): Mm => Math.round(length) as Mm;
