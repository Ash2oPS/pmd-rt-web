/** Presentation-only zoom; time is supplied by the app so pauses freeze transitions. */
export const CAMERA_ZOOM = { exploration: 1.25, action: 1.42, responseSeconds: 0.18 } as const;

export function createCameraZoom(reducedMotion = false) {
  let zoom: number = CAMERA_ZOOM.exploration;
  let target: number = zoom;
  return {
    get zoom() { return zoom; },
    get target() { return target; },
    setZoom(value: number) {
      if (!Number.isFinite(value)) return;
      target = Math.max(1, Math.min(2, value));
      if (reducedMotion) zoom = target;
    },
    update(dt: number) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      zoom += (target - zoom) * (1 - Math.exp(-dt / CAMERA_ZOOM.responseSeconds));
      if (Math.abs(target - zoom) < 0.0001) zoom = target;
    },
  };
}
