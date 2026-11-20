// Helpers for building HTML strings safely.

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for use inside HTML content or a quoted attribute. */
export const escapeHTML = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (char) => ENTITIES[char]);
