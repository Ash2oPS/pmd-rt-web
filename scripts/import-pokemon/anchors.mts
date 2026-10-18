export interface Point { x: number; y: number }

/** The white pixel is the shadow position, relative to the centered sprite root. */
export function readShadowOrigins(pixels: Uint8Array, width: number, height: number, frameWidth: number, frameHeight: number) {
  if (pixels.length !== width * height * 4 || width % frameWidth || height % frameHeight) throw new Error('Invalid shadow image dimensions');
  const columns = width / frameWidth, rows = height / frameHeight;
  const anchors: Point[][][] = Array.from({ length: rows }, () => Array.from({ length: columns }, () => []));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    if (pixels[offset] === 255 && pixels[offset + 1] === 255 && pixels[offset + 2] === 255 && pixels[offset + 3] > 0) {
      anchors[Math.floor(y / frameHeight)][Math.floor(x / frameWidth)].push({ x: x % frameWidth, y: y % frameHeight });
    }
  }
  return anchors.map((row, direction) => row.map((found, frame) => {
    if (found.length !== 1) throw new Error(`Shadow anchor count ${found.length} at direction ${direction}, frame ${frame}; expected exactly one`);
    return found[0];
  }));
}

/** PMD ShadowSize 0=small/green, 1=normal/red, 2=large/blue. */
export function shadowMaskPixels(pixels: Uint8Array, size: number) {
  const channel = [1, 0, 2][size];
  if (channel === undefined || pixels.length % 4) throw new Error('Unsupported PMD shadow size or RGBA data');
  const output = Buffer.alloc(pixels.length);
  for (let index = 0; index < pixels.length; index += 4) {
    output[index + 3] = Math.round(pixels[index + channel] * pixels[index + 3] / 255);
  }
  return output;
}
