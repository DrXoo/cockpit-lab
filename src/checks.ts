/** Severity of a geometric check. The UI shows it with text and a symbol, not only color. */
export type CheckLevel = 'ok' | 'warning' | 'error';

export interface Check {
  id: string;
  label: string;
  value: string;
  level: CheckLevel;
  detail: string;
  /** The things the check found, such as the parts it names, for the user to look through. */
  items?: readonly string[];
}
