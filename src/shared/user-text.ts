// Names that users type into their designs, cleaned before they are stored or shown.

/**
 * Removes markup and control characters, trims and limits the length. Anything that is not a
 * string, or is empty once cleaned, becomes the fallback.
 */
export function cleanUserText(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  return (
    value
      .replace(/[<>\x00-\x1f]/g, '')
      .trim()
      .slice(0, maxLength) || fallback
  );
}
