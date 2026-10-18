import type { GameState, Point } from "../domain/state.js";
import { hash, type Rect } from "./primitives.js";

export function drawScenery(rect: Rect, map: readonly string[]): void {
  // A soft, worn path leads the eye through the clearing.
  for (let x = 1; x < Math.min(23, (map[5]?.length ?? 0) - 1); x++) {
    if (map[5]?.[x] === "~") continue;
    rect(x * 32, 5 * 32 + 7, 32, 21, "#8b955a");
    rect(x * 32 + 4, 5 * 32 + 10, 8, 2, "#a2a46b");
    rect(x * 32 + 20, 5 * 32 + 24, 5, 2, "#747e4c");
  }
  for (let y = 1; y < Math.min(13, map.length - 1); y++) {
    if (!map[y]?.[15] || map[y]?.[15] === "~") continue;
    rect(15 * 32 + 5, y * 32, 21, 32, "#8b955a");
    if (y % 2 === 0) rect(15 * 32 + 9, y * 32 + 4, 3, 7, "#a0a266");
  }
  // Fallen log and tufts are scenery; the collision grid remains authoritative.
  // Only use this obstacle decoration when the supplied collision grid supports it.
  if (![6, 7].every((y) => [11, 12, 13].every((x) => map[y]?.[x] === "#"))) return;
  rect(11 * 32 + 4, 6 * 32 + 8, 82, 40, "#3c5634");
  rect(11 * 32 + 6, 6 * 32 + 6, 76, 30, "#7b6c41");
  rect(11 * 32 + 9, 6 * 32 + 10, 70, 5, "#9d8750");
  rect(11 * 32 + 12, 6 * 32 + 24, 63, 4, "#5c5435");
  rect(11 * 32 + 4, 6 * 32 + 7, 10, 30, "#b3995c");
  rect(11 * 32 + 7, 6 * 32 + 13, 4, 19, "#7a6c42");
  rect(12 * 32 + 20, 6 * 32 + 4, 18, 6, "#426b3b");
  rect(11 * 32 + 18, 6 * 32 + 5, 24, 4, "#5f8645");
}

export function drawCollectibles(ctx: CanvasRenderingContext2D, rect: Rect, collectibles: readonly Point[], state: GameState, reducedMotion: boolean, t: number): void {
  for (let i = 0; i < collectibles.length; i++)
    if (!state.collected.includes(i)) {
      const c = collectibles[i];
      if (!c) continue;
      const
        cx = c.x * 32 + 16,
        cy = c.y * 32 + 13 + (reducedMotion ? 0 : Math.sin(t * 2.3 + i) * 2);
      rect(cx - 5, cy + 11, 12, 3, "#5a7342");
      ctx.fillStyle = "#f0d88c";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx + 6, cy);
      ctx.lineTo(cx, cy + 8);
      ctx.lineTo(cx - 6, cy);
      ctx.fill();
      rect(cx - 1, cy - 3, 2, 5, "#fff1bf");
      rect(cx - 11, cy - 8, 2, 2, "#d8c581");
      rect(cx + 9, cy + 5, 2, 2, "#d8c581");
    }
}

export function drawForeground(ctx: CanvasRenderingContext2D, rect: Rect, reducedMotion: boolean, t: number, worldWidth: number, worldHeight: number): void {
  // Small sunlit leaves, flowers, and a trail marker.
  rect(2 * 32 + 7, 4 * 32 - 3, 5, 28, "#544c31");
  rect(2 * 32 - 1, 4 * 32 - 1, 25, 11, "#c1a66a");
  rect(2 * 32 + 5, 4 * 32 + 3, 12, 2, "#78653e");
  for (let i = 0; i < 18; i++) {
    const x = hash(i, 77) * worldWidth,
      y = hash(i, 23) * worldHeight;
    rect(
      x + (reducedMotion ? 0 : Math.sin(t * 0.5 + i) * 5),
      y + (reducedMotion ? 0 : Math.cos(t * 0.7 + i) * 4),
      2,
      2,
      i % 3 === 0 ? "#e1d58c" : "#a8b770",
    );
  }
  ctx.fillStyle = "#c7d5990a";
  ctx.beginPath();
  ctx.moveTo(worldWidth * 220 / 768, 0);
  ctx.lineTo(worldWidth * 310 / 768, 0);
  ctx.lineTo(worldWidth * 540 / 768, worldHeight);
  ctx.lineTo(worldWidth * 370 / 768, worldHeight);
  ctx.fill();
}
