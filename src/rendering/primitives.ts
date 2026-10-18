export type Rect = (x: number, y: number, width: number, height: number, color: string) => void;

export function createRect(ctx: CanvasRenderingContext2D): Rect {
  return function rect(x: number, y: number, w: number, h: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
}

export function hash(x: number, y: number) {
  return Math.abs(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
}
