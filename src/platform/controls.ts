import type { Action } from "./input/mapping.ts";
const keyActions: Record<string, Action> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyZ: "up",
  KeyS: "down",
  KeyA: "left",
  KeyQ: "left",
  KeyD: "right",
  Enter: "confirm",
  Space: "confirm",
  Escape: "menu",
  KeyX: "back",
};
export function bindControls(callbacks: {
  paused(): boolean;
  capturing(): boolean;
  cancelCapture(): void;
  fullscreen(): void;
  touch(action: Action): void;
  recordKey(event: KeyboardEvent): void;
}) {
  const keys = new Set<Action>(),
    touch = new Set<Action>();
  const taps = new Map<Action, number>();
  document.addEventListener("keydown", (event) => {
    callbacks.recordKey(event);
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (event.target instanceof Element && event.target.matches("input"))
    )
      return;
    if (event.code === "KeyF" && !event.repeat) {
      event.preventDefault();
      callbacks.fullscreen();
      return;
    }
    const action = keyActions[event.code];
    if (!action) return;
    if (
      callbacks.paused() &&
      action === "confirm" &&
      event.target instanceof Element &&
      event.target.matches("button,summary") &&
      !callbacks.capturing()
    )
      return;
    event.preventDefault();
    keys.add(action);
    if (callbacks.capturing() && action === "menu") {
      callbacks.cancelCapture();
      keys.delete(action);
    }
  });
  document.addEventListener("keyup", (event) => {
    const action = keyActions[event.code];
    if (action) keys.delete(action);
  });
  document
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      const action = button.dataset.action as Action;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        callbacks.touch(action);
        touch.add(action);
        if (["up", "down", "left", "right"].includes(action))
          taps.set(action, performance.now() + 80);
      });
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
        button.addEventListener(event, () => touch.delete(action));
    });
  return {
    actions: () => new Set([...keys, ...touch, ...[...taps].filter(([, until]) => until > performance.now()).map(([action]) => action)]),
    clear() {
      keys.clear();
      touch.clear();
      taps.clear();
    },
  };
}
