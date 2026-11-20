// What marks the part or face under the pointer, drawn apart from the design so marking another
// part redraws only the mark.
import * as T from 'three';
import type { Face, ResolvedPart } from '../cockpit/cad/parts/assembly.ts';
import { drawHover } from '../cockpit/render/hover.ts';
import { createRenderList, ROOT } from './render-list.ts';
import { addPrimitives, disposeDrawing, type Palette } from './three-adapter.ts';

/** A part to mark, and the face of it a click would choose, if any. */
export interface Mark {
  resolved: ResolvedPart;
  face: Face | null;
}

export class HoverMark {
  declare private readonly scene: T.Scene;
  declare private readonly palette: Palette;
  declare private root: T.Group | null;

  constructor(scene: T.Scene, palette: Palette) {
    this.scene = scene;
    this.palette = palette;
    this.root = null;
  }

  get shown(): boolean {
    return this.root !== null;
  }

  /** Marks a part, or nothing (null), in place of what was marked. */
  show(mark: Mark | null) {
    if (this.root) {
      disposeDrawing(this.root, this.palette);
      this.scene.remove(this.root);
      this.root = null;
    }
    if (!mark) return;
    const list = createRenderList();
    drawHover(list, ROOT, mark.resolved, mark.face);
    const group = new T.Group();
    addPrimitives(list.primitives, group, this.palette);
    this.scene.add(group);
    this.root = group;
  }
}
