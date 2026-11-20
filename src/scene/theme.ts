// The colors of the scene's canvas: background, grid, floor light and room floor. They are
// CSS tokens in theme.css, so the canvas follows the interface theme and matches its panel.
// The colors of the parts themselves do not depend on the theme.

export interface SceneTheme {
  /** The canvas background, also used for the ground plane. */
  background: string;
  grid: string;
  gridCenter: string;
  /** The light bounced from the floor onto the parts. */
  groundLight: string;
  roomFloor: string;
}

export const SCENE_THEME_TOKENS: Record<keyof SceneTheme, string> = {
  background: '--scene-background',
  grid: '--scene-grid',
  gridCenter: '--scene-grid-center',
  groundLight: '--scene-ground-light',
  roomFloor: '--scene-room-floor',
};

/** Reads the scene colors with `read`, which returns a CSS custom property's value. */
export function readSceneTheme(read: (token: string) => string): SceneTheme {
  const color = (key: keyof SceneTheme) => {
    const token = SCENE_THEME_TOKENS[key];
    const value = read(token).trim();
    if (!value) throw new Error(`The stylesheet does not define ${token}`);
    return value;
  };
  return {
    background: color('background'),
    grid: color('grid'),
    gridCenter: color('gridCenter'),
    groundLight: color('groundLight'),
    roomFloor: color('roomFloor'),
  };
}
