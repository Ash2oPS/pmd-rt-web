import type { Rect } from "./primitives.js";

export function drawTree(rect: Rect, x: number, y: number, seed: number) {
  rect(x + 3, y + 21, 28, 13, "#193e2d");
  rect(x + 14, y + 8, 7, 24, "#574d2d");
  rect(x + 16, y + 12, 3, 18, "#8b7542");
  rect(x - 3, y - 8, 38, 24, "#24563b");
  rect(x + 2, y - 17, 29, 15, "#2e6741");
  rect(x + 8, y - 23, 18, 11, "#377649");
  rect(x - 5, y - 4, 12, 15, "#2c6340");
  rect(x + 22, y - 7, 15, 17, "#234f36");
  rect(x + 4, y - 11, 11, 4, "#4e8551");
  rect(x + 9, y - 19, 10, 4, "#548c51");
  rect(x - 1, y + 1, 8, 4, "#3b7547");
  rect(x + 14, y - 3, 10, 4, "#427d49");
  rect(x + 23, y + 9, 9, 4, "#1b4933");
  if (seed > 0.5) rect(x + 6, y - 9, 3, 3, "#b7a860");
}
