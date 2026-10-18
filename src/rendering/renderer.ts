import type { GameState, Point } from "../domain/state.js";
import { createRect, hash } from "./primitives.js";
import { drawTree } from "./tree.js";
import { drawExplorer } from "./explorer.js";
import { drawTerrain } from "./terrain.js";
import { drawCollectibles, drawForeground, drawScenery } from "./decorations.js";

export interface RenderWorld {
  map: readonly string[];
  collectibles: readonly Point[];
  tileSize: number;
}

export interface Camera {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

function contextFor(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D rendering is unavailable.");
  context.imageSmoothingEnabled = false;
  return context;
}

/** Pixel artwork uses 32-unit tiles; the supplied tile size sets world scale. */
export function createRenderer(
  canvas: HTMLCanvasElement,
  world: RenderWorld,
  reducedMotion: boolean,
) {
  const columns = Math.max(0, ...world.map.map((row) => row.length));
  if (!columns || !world.map.length || !Number.isFinite(world.tileSize) || world.tileSize <= 0)
    throw new Error("Renderer requires a nonempty map and a positive tile size.");
  const screen = contextFor(canvas);
  const scene = canvas.ownerDocument.createElement("canvas");
  const worldWidth = columns * world.tileSize;
  const worldHeight = world.map.length * world.tileSize;
  scene.width = Math.ceil(worldWidth);
  scene.height = Math.ceil(worldHeight);
  const context = contextFor(scene);
  const rect = createRect(context);
  const camera: Camera = { x: 0, y: 0, width: worldWidth, height: worldHeight, scale: 1 };
  const view = canvas.ownerDocument.defaultView;
  let disposed = false;

  function resize(): void {
    if (disposed) return;
    const ratio = Math.min(view?.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      screen.imageSmoothingEnabled = false;
    }
  }

  function draw(state: GameState, visual: Point, time: number): void {
    if (disposed) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, scene.width, scene.height);
    const artScale = world.tileSize / 32;
    context.scale(artScale, artScale);
    camera.scale = Math.max(canvas.width / worldWidth, canvas.height / worldHeight);
    camera.width = canvas.width / camera.scale;
    camera.height = canvas.height / camera.scale;
    camera.x = Math.max(0, Math.min(worldWidth - camera.width,
      (visual.x + 0.5) * world.tileSize - camera.width / 2));
    camera.y = Math.max(0, Math.min(worldHeight - camera.height,
      (visual.y + 0.5) * world.tileSize - camera.height / 2));
    drawTerrain(rect, world.map, reducedMotion, time);
    drawScenery(rect, world.map);
    drawCollectibles(context, rect, world.collectibles, state, reducedMotion, time);
    // Row ordering lets nearby tree canopies overlap the explorer naturally.
    for (let y = 0; y < world.map.length; y++) {
      if (Math.floor(visual.y) === y)
        drawExplorer(rect, state, visual, time, visual.x * 32 + 16, visual.y * 32 + 16);
      const row = world.map[y] ?? "";
      for (let x = 0; x < row.length; x++)
        if (row[x] === "#") drawTree(rect, x * 32, y * 32, hash(x, y));
    }
    drawForeground(context, rect, reducedMotion, time, columns * 32, world.map.length * 32);
    // Scale the completed pixel scene once to avoid seams between tiles.
    screen.imageSmoothingEnabled = false;
    screen.drawImage(scene, camera.x, camera.y, camera.width, camera.height,
      0, 0, canvas.width, canvas.height);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  view?.addEventListener("resize", resize);
  resize();

  function dispose(): void {
    disposed = true;
    observer.disconnect();
    view?.removeEventListener("resize", resize);
  }

  return { camera, resize, draw, dispose };
}
