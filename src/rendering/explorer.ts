import type { GameState, Point } from "../domain/state.js";
import type { Rect } from "./primitives.js";

export function drawExplorer(rect: Rect, state: GameState, visual: Point, t: number, x: number, y: number) {
  const moving =
    Math.abs(visual.x - state.player.x) + Math.abs(visual.y - state.player.y) >
    0.05;
  const bob = moving ? Math.sin(t * 22) * 1.2 : 0;
  y += bob;
  rect(x - 9, y + 9, 21, 5, "#23432b");
  rect(x - 7, y - 19, 5, 13, "#403b29");
  rect(x + 6, y - 20, 5, 14, "#403b29");
  rect(x - 7, y - 14, 5, 13, "#efc45e");
  rect(x + 6, y - 15, 5, 13, "#efc45e");
  rect(x - 9, y - 5, 22, 16, "#edc05b");
  rect(x - 5, y + 10, 6, 4, "#c49a43");
  rect(x + 6, y + 10, 6, 4, "#c49a43");
  rect(x - 6, y - 7, 16, 4, "#f6d77c");
  if (state.facing !== "up") {
    rect(x - 5 + (state.facing === "right" ? 3 : 0), y - 1, 3, 4, "#25382a");
    rect(x + 5 + (state.facing === "left" ? -3 : 0), y - 1, 3, 4, "#25382a");
    rect(x - 8, y + 4, 4, 3, "#d78251");
    rect(x + 9, y + 4, 3, 3, "#d78251");
    rect(x + 1, y + 5, 3, 2, "#92683a");
  }
  rect(x - 9, y + 8, 22, 4, "#c86c4e");
  rect(x + 8, y + 11, 5, 8, "#db8158");
  if (state.facing === "up") {
    rect(x - 5, y + 3, 12, 10, "#8b7045");
    rect(x - 3, y + 4, 8, 3, "#b59b5e");
  } else {
    rect(x - 11, y + 2, 4, 9, "#927444");
    rect(x - 12, y + 4, 3, 5, "#b19a5c");
  }
}
