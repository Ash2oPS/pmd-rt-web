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
  Escape: "menu",
  KeyX: "back",
  KeyJ: "attack1",
  KeyK: "attack2",
  KeyL: "attack3",
  KeyI: "attack4",
  ShiftLeft: "aim",
  ShiftRight: "aim",
};
export function bindControls(callbacks: {
  paused(): boolean;
  capturing(): boolean;
  cancelCapture(): void;
  fullscreen(): void;
  touch(action: Action): void;
  recordKey(event: KeyboardEvent): void;
}) {
  const keys = new Map<string, Action>(), touch = new Set<Action>();
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
    const resultButton = event.target instanceof Element && !!event.target.closest('.combat-result');
    const action = event.code === 'Space' ? callbacks.paused() || resultButton ? 'confirm' : 'wait' : keyActions[event.code];
    if (!action) return;
    if (event.repeat && (action.startsWith('attack') || action === 'confirm')) { event.preventDefault(); return; }
    if (
      (callbacks.paused() || (event.target instanceof Element && !!event.target.closest('.combat-result'))) &&
      action === "confirm" &&
      event.target instanceof Element &&
      event.target.matches("button,summary") &&
      !callbacks.capturing()
    )
      return;
    event.preventDefault();
    keys.set(event.code, action);
    if (!event.repeat && !['up', 'down', 'left', 'right'].includes(action)) callbacks.touch(action);
    if (callbacks.capturing() && action === "menu") {
      callbacks.cancelCapture();
      keys.delete(event.code);
    }
  });
  document.addEventListener("keyup", (event) => {
    keys.delete(event.code);
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
    actions: () => new Set([...keys.values(), ...touch, ...[...taps].filter(([, until]) => until > performance.now()).map(([action]) => action)]),
    clear() {
      keys.clear();
      touch.clear();
      taps.clear();
    },
  };
}
