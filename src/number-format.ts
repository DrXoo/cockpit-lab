// Number formatting for the interface, which is in US English.
const UI_LOCALE = 'en-US';

/** A number for display, with up to `maximumFractionDigits` decimals and no trailing zeros. */
export const formatNumber = (value: number, maximumFractionDigits = 3): string =>
  value.toLocaleString(UI_LOCALE, { maximumFractionDigits });
