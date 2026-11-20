// The shared materials the drawings are made of, and the picture on the monitor's screen.
import * as T from 'three';
import type { Palette } from './three-adapter.ts';

export function createPalette(vectorFallback: boolean): Palette {
  const screen = new T.MeshBasicMaterial({ map: screenTexture() });
  if (vectorFallback) screen.color.set('#253d33');
  return {
    silver: new T.MeshStandardMaterial({ color: 0xb8beb7, metalness: 0.7, roughness: 0.38 }),
    edge: new T.LineBasicMaterial({ color: 0x7e8b77, transparent: true, opacity: 0.55 }),
    dark: new T.MeshStandardMaterial({ color: 0x252d2a, metalness: 0.25, roughness: 0.7 }),
    seat: new T.MeshStandardMaterial({ color: 0x303936, roughness: 0.95 }),
    fabric: new T.MeshStandardMaterial({ color: 0x404b43, roughness: 1 }),
    orange: new T.MeshStandardMaterial({ color: 0xca6036, metalness: 0.2, roughness: 0.65 }),
    rubber: new T.MeshStandardMaterial({ color: 0x222a23, roughness: 1 }),
    groove: new T.MeshStandardMaterial({ color: 0x7e887c, metalness: 0.5, roughness: 0.7 }),
    wood: new T.MeshStandardMaterial({ color: 0xc3ad87, roughness: 0.75 }),
    desk: new T.MeshStandardMaterial({ color: 0xe1e4dc, roughness: 0.6, metalness: 0.25 }),
    blue: new T.MeshStandardMaterial({
      color: 0x8b9da7,
      transparent: true,
      opacity: 0.6,
      roughness: 1,
    }),
    dim: new T.LineBasicMaterial({ color: 0x9ba78d, transparent: true, opacity: 0.85 }),
    arm: new T.MeshStandardMaterial({ color: 0x4f5951, metalness: 0.6, roughness: 0.4 }),
    screen,
    selected: new T.MeshStandardMaterial({ color: 0xca6036, metalness: 0.45, roughness: 0.45 }),
    preview: new T.MeshStandardMaterial({
      color: 0xca6036,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      roughness: 0.6,
    }),
    // Blue, apart from the accent of the selection, so a hovered face shows on a selected part.
    hover: new T.MeshBasicMaterial({
      color: 0x2f7fd0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
    ghost: new T.MeshStandardMaterial({
      color: 0xca6036,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      roughness: 1,
    }),
    reference: new T.MeshStandardMaterial({
      color: 0x8f968f,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      roughness: 1,
    }),
  };
}

/** A sim racing screen drawn on a canvas, so the viewer needs no image files. */
function screenTexture(): T.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 440;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is needed to draw the monitor screen');
  const g = ctx.createLinearGradient(0, 0, 0, 440);
  g.addColorStop(0, '#253b36');
  g.addColorStop(1, '#172b26');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 440);
  ctx.strokeStyle = '#506453';
  ctx.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 80 - 400, 440);
    ctx.lineTo(512 + (i * 80 - 400 - 512) * 0.12, 150);
    ctx.stroke();
  }
  for (let y = 170; y < 440; y += y / 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c47b48';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(430, 440);
  ctx.bezierCurveTo(700, 290, 300, 290, 530, 158);
  ctx.stroke();
  ctx.fillStyle = '#aabb9b';
  ctx.font = '500 16px monospace';
  ctx.fillText('COCKPIT LAB', 35, 43);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8eaa91';
  ctx.fillText('SIMULATION / READY', 35, 67);
  ctx.fillStyle = '#d49262';
  ctx.fillRect(943, 30, 45, 3);
  ctx.font = '70px monospace';
  ctx.fillStyle = '#c5d0b6';
  ctx.fillText('N', 40, 370);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#99ab8d';
  ctx.fillText('000 KM/H', 40, 400);
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
