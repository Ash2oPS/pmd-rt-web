import { hash, type Rect } from "./primitives.js";

function grassColor(n: number): string {
  const palette = ["#6b8750", "#718c54", "#68844c", "#759057"];
  return palette[Math.floor(n * 4)] ?? "#6b8750";
}

export function drawTerrain(rect: Rect, map: readonly string[], reducedMotion: boolean, t: number): void {
  for (let y = 0; y < map.length; y++)
    for (let x = 0; x < (map[y]?.length ?? 0); x++) {
      const px = x * 32,
        py = y * 32,
        n = hash(x, y),
        tile = map[y]?.[x];
      rect(
        px,
        py,
        32,
        32,
        tile === "~"
          ? "#528c7c"
          : grassColor(n),
      );
      if (tile === "~") {
        rect(
          px + 3,
          py + 7 + (reducedMotion ? 0 : Math.floor(Math.sin(t * 1.4 + x) * 2)),
          12,
          2,
          "#7eaf94",
        );
        rect(px + 15, py + 22, 9, 2, "#3e7b70");
        if (map[y - 1]?.[x] !== "~") rect(px, py, 32, 5, "#9aaa70");
      } else {
        for (let i = 0; i < 4; i++) {
          const a = hash(x + i * 3, y + 2),
            b = hash(x + 6, y + i * 5);
          rect(
            px + Math.floor(a * 28),
            py + Math.floor(b * 28),
            2,
            2,
            n > 0.5 ? "#84995e" : "#5e7b48",
          );
        }
        if (n > 0.82) {
          rect(px + 9, py + 17, 2, 5, "#496d43");
          rect(px + 7, py + 16, 3, 2, "#a7b471");
          rect(px + 11, py + 14, 2, 2, "#d4c78b");
        }
      }
    }
}
