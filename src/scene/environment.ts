// The surroundings of every drawing: the lights, the ground and the grid, which do not depend on
// what is drawn. The ground and the grid sit at the floor of what the scene shows, and their
// colors follow the theme.
import * as T from 'three';
import type { SceneTheme } from './theme.ts';

/** The ground sits just under the grid, so the grid lines stay on top of it. */
const GROUND_BELOW_GRID_CM = -0.25;

/** The parts of the surroundings whose colors follow the theme. */
export interface Environment {
  hemisphere: T.HemisphereLight;
  ground: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial | T.MeshStandardMaterial>;
  grid: T.GridHelper;
}

/** Adds the ground, the grid and the lights to the scene. */
export function addEnvironment(
  scene: T.Scene,
  vectorFallback: boolean,
  theme: SceneTheme,
): Environment {
  const hemisphere = new T.HemisphereLight(0xffffff, theme.groundLight, vectorFallback ? 0 : 2.5);
  scene.add(hemisphere);
  const sun = new T.DirectionalLight(0xffffff, vectorFallback ? 0.65 : 3.2);
  sun.position.set(-150, 300, 100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -280,
    right: 280,
    top: 280,
    bottom: -280,
    near: 1,
    far: 800,
  });
  sun.shadow.normalBias = 0.4;
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(new T.AmbientLight(0xffffff, vectorFallback ? 0.7 : 0.3));
  const ground = new T.Mesh(
    new T.PlaneGeometry(1500, 1500),
    vectorFallback
      ? new T.MeshBasicMaterial({ color: theme.background })
      : new T.MeshStandardMaterial({ color: theme.background, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_BELOW_GRID_CM;
  ground.receiveShadow = true;
  if (!vectorFallback) scene.add(ground);
  const grid = createGrid(theme);
  scene.add(grid);
  return { hemisphere, ground, grid };
}

/** Repaints the surroundings in the colors of `theme`; the grid is made again in them. */
export function rethemeEnvironment(
  scene: T.Scene,
  environment: Environment,
  theme: SceneTheme,
): Environment {
  const { hemisphere, ground, grid } = environment;
  hemisphere.groundColor.set(theme.groundLight);
  ground.material.color.set(theme.background);
  scene.remove(grid);
  grid.dispose();
  const next = createGrid(theme);
  scene.add(next);
  return { hemisphere, ground, grid: next };
}

/** Puts the ground and the grid at the floor. */
export function placeFloor(environment: Environment, floorCm: number) {
  environment.grid.position.y = floorCm;
  environment.ground.position.y = floorCm + GROUND_BELOW_GRID_CM;
}

function createGrid(theme: SceneTheme): T.GridHelper {
  const grid = new T.GridHelper(800, 80, theme.gridCenter, theme.grid);
  grid.position.set(0, 0, 50);
  grid.material.transparent = true;
  grid.material.opacity = 0.65;
  grid.renderOrder = -1;
  return grid;
}
