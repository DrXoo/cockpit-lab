// The renderer of the 3D view: WebGL 2 when the browser has it, the SVG renderer otherwise.
import * as T from 'three';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';

const MAX_PIXEL_RATIO = 2;

export interface SceneRenderer {
  renderer: T.WebGLRenderer | SVGRenderer;
  /** Whether the scene is drawn as SVG, which has no lights, shadows or textures to speak of. */
  vectorFallback: boolean;
}

export function createRenderer(background: string): SceneRenderer {
  const canvas = document.createElement('canvas');
  let context: WebGL2RenderingContext | null = null;
  try {
    context = canvas.getContext('webgl2', { antialias: true, alpha: false });
  } catch {
    // Without WebGL 2 the scene falls back to the SVG renderer.
  }
  if (!context) {
    const renderer = new SVGRenderer();
    renderer.setQuality('high');
    setVectorBackground(renderer, background);
    return { renderer, vectorFallback: true };
  }
  const renderer = new T.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  return { renderer, vectorFallback: false };
}

/** The SVG renderer draws its clear color, not the scene's background. */
export function setVectorBackground(renderer: T.WebGLRenderer | SVGRenderer, background: string) {
  // The SVG renderer ignores the alpha.
  if (renderer instanceof SVGRenderer) renderer.setClearColor(new T.Color(background), 1);
}
