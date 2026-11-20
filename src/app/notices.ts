// Short notices to the user: a toast that fades by itself, and how saving went.
import { $ } from '../ui/dom.ts';
import type { SaveStatus } from '../project-session.ts';

/** How long a toast stays before it fades. */
const TOAST_SHOWN_MS = 3000;

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Shows `message` for a moment, replacing any toast still shown. */
export function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), TOAST_SHOWN_MS);
}

/** Shows how saving in this browser went, beside the project's file buttons. */
export function showSaveStatus(message: string, status: SaveStatus = 'ok') {
  $('#saveStatus').textContent = message;
  $('.save-info').dataset.state = status;
}
