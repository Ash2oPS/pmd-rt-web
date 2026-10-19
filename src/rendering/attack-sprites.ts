import type { EffectAsset } from '../content/visuals.ts';

/** Cached tint keeps source alpha and shading; each image retains at most 32 edited colors. */
export function createEffectSprites(assets: readonly EffectAsset[], getImage: (id: string) => CanvasImageSource | undefined) {
  const catalog = new Map(assets.map(asset => [asset.id, asset]));
  const tints = new WeakMap<object, Map<string, CanvasImageSource>>();
  function tinted(context: CanvasRenderingContext2D, image: CanvasImageSource, asset: EffectAsset, color: string): CanvasImageSource {
    if (color.toLowerCase() === '#ffffff') return image;
    let cache = tints.get(image);
    if (!cache) { cache = new Map(); tints.set(image, cache); }
    const cached = cache.get(color);
    if (cached) return cached;
    const width = asset.frameWidth * asset.frames, height = asset.frameHeight;
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height)
      : context.canvas.ownerDocument?.createElement('canvas');
    if (!canvas) return image;
    canvas.width = width; canvas.height = height;
    const tint = canvas.getContext('2d');
    if (!tint) return image;
    tint.drawImage(image, 0, 0);
    tint.globalCompositeOperation = 'multiply'; tint.fillStyle = color;
    tint.fillRect(0, 0, width, height);
    tint.globalCompositeOperation = 'destination-in'; tint.drawImage(image, 0, 0);
    if (cache.size >= 32) cache.clear();
    cache.set(color, canvas);
    return canvas;
  }
  return {
    draw(context: CanvasRenderingContext2D, assetId: string, color: string, x: number, y: number,
      size: number, age: number, loop: boolean): boolean {
      const asset = catalog.get(assetId), image = getImage(assetId);
      if (!asset || !image) return false;
      const tick = Math.floor(Math.max(0, age) / asset.frameSeconds);
      const frame = loop ? tick % asset.frames : Math.min(asset.frames - 1, tick);
      const height = size * asset.frameHeight / asset.frameWidth;
      context.imageSmoothingEnabled = false;
      context.drawImage(tinted(context, image, asset, color), frame * asset.frameWidth, 0, asset.frameWidth, asset.frameHeight,
        Math.round(x - size / 2), Math.round(y - height / 2), Math.max(1, Math.round(size)), Math.max(1, Math.round(height)));
      return true;
    },
  };
}
