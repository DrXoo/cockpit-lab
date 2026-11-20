// The icons drawn inline in the markup, as `<i data-icon="name"></i>`, from 18 × 18 paths.
const ICON_PATHS: Record<string, string> = {
  lock: 'M6 9V6a3 3 0 0 1 6 0v3M4 9h10v7H4z',
  export: 'M10 3h5v5M15 3 8 10M6 4H3v11h11v-3',
  download: 'M9 2v10m-4-4 4 4 4-4M3 13v3h12v-3',
  upload: 'M9 12V2m-4 4 4-4 4 4M3 13v3h12v-3',
  wheel: 'M15.5 9A6.5 6.5 0 1 1 2.5 9a6.5 6.5 0 0 1 13 0ZM3 7l4 1 2 6 2-6 4-1M7 8h4',
  frame: 'M3 14V4h12v10M1 14h16M7 4v10M11 4v10M3 8h12',
  seat: 'M5 2v7l4 3h6v3H8l-5-4V3M7 15v2m7-2v2M12 4v5h4',
  desk: 'M2 5h14v3H2zM4 8v8m10-8v8M4 12h10',
  help: 'M9 16A7 7 0 1 0 9 2a7 7 0 0 0 0 14ZM7 6a2 2 0 1 1 3 2c-1 1-1 1-1 2M9 13h.01',
  reset: 'M3 6a6 6 0 1 1-1 5M3 2v4h4',
  ruler: 'M2 13 13 2l3 3L5 16ZM5 10l2 2m1-5 2 2m1-5 2 2',
  measure: 'M2 4v10m14-10v10M2 9h14M5 7 2 9l3 2m8-4 3 2-3 2',
  person: 'M11.5 4a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM4 16v-4a5 5 0 0 1 10 0v4',
  expand: 'M6 2H2v4m10-4h4v4M2 12v4h4m6 0h4v-4',
  rotate: 'M3 6a6 6 0 1 1 0 7M3 2v4h4M9 5v8m-3-4h6',
  info: 'M9 16A7 7 0 1 0 9 2a7 7 0 0 0 0 14ZM9 8v5M9 5h.01',
  parts: 'M3 3h5v5H3zm7 7h5v5h-5zM3 10h5v5H3zm7-7h5v5h-5z',
  arrow: 'M3 9h12m-5-5 5 5-5 5',
  close: 'm4 4 10 10M14 4 4 14',
  print: 'M5 6V2h8v4M5 13H2V7h14v6h-3M5 10h8v6H5zM13 8h.01',
  themeSystem: 'M9 16A7 7 0 1 0 9 2a7 7 0 0 0 0 14ZM9 2v14M9 5h4M9 9h7M9 13h4',
  themeLight:
    'M12 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 1.5v2m0 11v2M1.5 9h2m11 0h2M3.7 3.7l1.4 1.4m7.8 7.8 1.4 1.4M3.7 14.3l1.4-1.4m7.8-7.8 1.4-1.4',
  themeDark: 'M15.5 11.3A6.5 6.5 0 0 1 6.7 2.5a6.5 6.5 0 1 0 8.8 8.8Z',
  layers: 'M9 2 2 5.5 9 9l7-3.5ZM2 9l7 3.5L16 9M2 12.5 9 16l7-3.5',
  copy: 'M6 6h9v9H6zM3 12V3h9',
  edit: 'M3 15l.8-3.6L12 3.2 14.8 6l-8.2 8.2ZM10.5 4.7l2.8 2.8',
  trash: 'M3 5h12M7 5V3h4v2M5 5l.8 11h6.4L13 5M7.5 8v5m3-5v5',
  undo: 'M6 3 2 7l4 4M2 7h8.5a4.5 4.5 0 0 1 0 9H7',
  redo: 'm12 3 4 4-4 4m4-4H7.5a4.5 4.5 0 0 0 0 9H11',
  plus: 'M9 3v12M3 9h12',
  // A profile with another growing up out of it.
  grow: 'M2 12h14v3H2ZM9 12V3M6 6l3-3 3 3',
  // A plate seen from above and to one side, with its thickness.
  plate: 'M2 10.5 6.5 7H16l-4.5 3.5ZM2 10.5V12h9.5l4.5-3.5V7',
  // A leveling foot: its threaded stem, its pad and the floor.
  foot: 'M9 2v8M5.5 10h7l1.5 3h-10ZM2 16h14',
  // Three pedals standing on their base.
  pedals: 'M2 15h14M4 15l1-8h2l-1 8M8 15l1-8h2l-1 8M12 15l1-8h2l-1 8',
  // A round knob on a lever standing out of its base.
  shifter: 'M11 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 6v7M4 13h10v3H4z',
  // A lever leaning back from its base, with a handle across its top.
  handbrake: 'M2 13h14v3H2zM6 13l6-8M10.5 3.5l3 3',
  // A tall grip on a stick out of a low base.
  centerStick: 'M7 2h4v6H7zM9 8v6M4 14h10v2H4z',
  // A short stick on a base fixed to the side of the cockpit.
  sideStick: 'M6 4h4v5H6zM8 9v4M3 13h10v3H3zM15 2v14',
  // A handle across the top of a lever out of a tall base.
  throttle: 'M3 11h12v5H3zM9 11V6M5 4h8v2H5z',
};
/** Draws every icon inside `root`; an unknown name draws the info icon. */
export function drawIcons(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLElement>('i[data-icon]')
    .forEach(
      (i) =>
        (i.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true"><path d="${(i.dataset.icon && ICON_PATHS[i.dataset.icon]) || ICON_PATHS.info}"/></svg>`),
    );
}
