import { defaultMapping } from './mapping.ts';
import type { Action, Mapping, PadLike } from './mapping.ts';

export const DEFAULT_DEADZONE = .18;
export interface MovementVector { x: number; y: number }
export function clampMovement(vector: MovementVector): MovementVector {
  const length = Math.hypot(vector.x, vector.y);
  if (!Number.isFinite(length) || !length) return { x: 0, y: 0 };
  return length > 1 ? { x: vector.x / length, y: vector.y / length } : vector;
}
export function digitalMovement(actions: ReadonlySet<Action>): MovementVector {
  return clampMovement({
    x: Number(actions.has('right')) - Number(actions.has('left')),
    y: Number(actions.has('down')) - Number(actions.has('up')),
  });
}
/** Circular deadzone preserves angle and proportional speed, including diagonals. */
export function radialStick(x: number, y: number, deadzone = DEFAULT_DEADZONE): MovementVector {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= deadzone) return { x: 0, y: 0 };
  const magnitude = Math.min(1, (length - deadzone) / (1 - deadzone));
  return { x: x / length * magnitude, y: y / length * magnitude };
}
function mappedMovement(pad: PadLike | null, mapping: Mapping, deadzone = DEFAULT_DEADZONE, ignoreButtons = false): MovementVector {
  if (!pad) return { x: 0, y: 0 };
  const device = pad;
  const { left, right, up, down } = mapping;
  if (left.type === 'axis' && right.type === 'axis' && up.type === 'axis' && down.type === 'axis'
    && left.index === right.index && left.sign === -right.sign
    && up.index === down.index && up.sign === -down.sign && right.index !== down.index) {
    return radialStick((device.axes[right.index] ?? 0) * right.sign,
      (device.axes[down.index] ?? 0) * down.sign, deadzone);
  }
  const defaults = defaultMapping();
  const stick = radialStick(device.axes[0] ?? 0, device.axes[1] ?? 0, deadzone);
  function strength(action: 'up' | 'down' | 'left' | 'right'): number {
    const binding = mapping[action];
    if (binding.type === 'axis') {
      const raw = (device.axes[binding.index] ?? 0) * binding.sign;
      if (!Number.isFinite(raw)) return 0;
      return Math.min(1, Math.max(0, (raw - deadzone) / (1 - deadzone)));
    }
    const analog = binding.index === defaults[action].index
      ? Math.max(0, action === 'up' ? -stick.y : action === 'down' ? stick.y : action === 'left' ? -stick.x : stick.x) : 0;
    if (Math.hypot(stick.x, stick.y) && binding.index === defaults[action].index) return analog;
    const button = ignoreButtons ? undefined : device.buttons[binding.index];
    return button?.pressed || (button?.value ?? 0) > .5 ? 1 : 0;
  }
  return clampMovement({ x: strength('right') - strength('left'), y: strength('down') - strength('up') });
}

export interface MovementSelection {
  vector: MovementVector;
  source: 'analog' | 'gamepad-digital' | 'local-digital' | 'none';
  rawMagnitude: number;
}
/** Ignore emulated digital duplicates while an enabled analog binding is active. */
export function samplePadMovement(pad: PadLike | null, mapping: Mapping, deadzone = DEFAULT_DEADZONE): MovementSelection {
  if (!pad) return { vector: { x: 0, y: 0 }, source: 'none', rawMagnitude: 0 };
  // Native Gamepad attributes live on its prototype; spreading it loses axes.
  const analog = mappedMovement(pad, mapping, deadzone, true);
  const analogActive = Math.hypot(analog.x, analog.y) > 0;
  const vector = mappedMovement(pad, mapping, deadzone);
  const defaults = defaultMapping();
  const enabledAxes = new Set<number>();
  for (const action of ['up', 'down', 'left', 'right'] as const) {
    const binding = mapping[action];
    if (binding.type === 'axis') enabledAxes.add(binding.index);
    else if (binding.index === defaults[action].index) enabledAxes.add(action === 'left' || action === 'right' ? 0 : 1);
  }
  const rawMagnitude = Math.hypot(...[...enabledAxes].map(index => Number.isFinite(pad.axes[index]) ? pad.axes[index]! : 0));
  return { vector, rawMagnitude, source: analogActive ? 'analog' : Math.hypot(vector.x, vector.y) ? 'gamepad-digital' : 'none' };
}
export function padMovement(pad: PadLike | null, mapping: Mapping, deadzone = DEFAULT_DEADZONE): MovementVector {
  return samplePadMovement(pad, mapping, deadzone).vector;
}
export function selectMovement(local: ReadonlySet<Action>, pad: MovementSelection): MovementSelection {
  if (pad.source === 'analog') return pad;
  const vector = digitalMovement(local);
  return Math.hypot(vector.x, vector.y) ? { ...pad, vector, source: 'local-digital' } : pad;
}
