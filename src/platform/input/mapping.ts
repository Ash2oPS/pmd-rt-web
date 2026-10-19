export const ACTIONS = ['up', 'down', 'left', 'right', 'confirm', 'back', 'menu', 'attack1', 'attack2'] as const;
export type Action = (typeof ACTIONS)[number];
export type Binding = { type: 'button'; index: number } | { type: 'axis'; index: number; sign: 1 | -1 };
export type Mapping = Record<Action, Binding>;
export interface PadLike {
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly axes: readonly number[];
  readonly index: number;
  readonly id: string;
  readonly connected?: boolean;
  readonly mapping?: string;
  readonly timestamp?: number;
}

export function defaultMapping(): Mapping {
  return {
    up: { type: 'button', index: 12 }, down: { type: 'button', index: 13 },
    left: { type: 'button', index: 14 }, right: { type: 'button', index: 15 },
    // Thor uses Nintendo labels: east A confirms, south B returns.
    confirm: { type: 'button', index: 1 }, back: { type: 'button', index: 0 },
    menu: { type: 'button', index: 9 },
    attack1: { type: 'button', index: 2 }, attack2: { type: 'button', index: 3 },
  };
}

function isBinding(value: unknown): value is Binding {
  if (typeof value !== 'object' || value === null || !('index' in value) || !('type' in value)) return false;
  return typeof value.index === 'number' && Number.isInteger(value.index) && value.index >= 0 && value.index < 64 &&
    (value.type === 'button' || (value.type === 'axis' && 'sign' in value && (value.sign === 1 || value.sign === -1)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function validateMapping(value: unknown): value is Mapping {
  if (!isRecord(value)) return false;
  return ACTIONS.every(action => isBinding(value[action]));
}

/** Preserve all legacy remaps and fill only newly introduced combat actions. */
export function restoreMapping(value: unknown): Mapping | null {
  if (!isRecord(value)) return null;
  const original = ['up', 'down', 'left', 'right', 'confirm', 'back', 'menu'] as const;
  if (!original.every(action => isBinding(value[action]))) return null;
  const result = defaultMapping();
  for (const action of ACTIONS) {
    if (value[action] === undefined && !original.includes(action as typeof original[number])) continue;
    const binding = value[action];
    if (!isBinding(binding)) return null;
    result[action] = { ...binding };
  }
  return result;
}

const stickDirections: Partial<Record<Action, { index: number; sign: 1 | -1 }>> = {
  up: { index: 1, sign: -1 }, down: { index: 1, sign: 1 },
  left: { index: 0, sign: -1 }, right: { index: 0, sign: 1 },
};

export function decodePad(pad: PadLike | null, mapping: Mapping): Action[] {
  if (!pad) return [];
  const defaults = defaultMapping();
  return ACTIONS.filter(action => {
    const binding = mapping[action];
    if (binding.type === 'axis') return (pad.axes[binding.index] ?? 0) * binding.sign > 0.5;
    const button = pad.buttons[binding.index];
    if (button?.pressed || (button?.value ?? 0) > 0.5) return true;
    if (binding.index !== defaults[action].index) return false;
    const stick = stickDirections[action];
    return stick ? (pad.axes[stick.index] ?? 0) * stick.sign > 0.25 : false;
  });
}

export function rawSignals(pad: PadLike | null): Binding[] {
  const signals: Binding[] = [];
  pad?.buttons.forEach((button, index) => {
    if (button.pressed || button.value > 0.5) signals.push({ type: 'button', index });
  });
  pad?.axes.forEach((axis, index) => {
    if (Math.abs(axis) > 0.6) signals.push({ type: 'axis', index, sign: axis > 0 ? 1 : -1 });
  });
  return signals;
}

export function bindingLabel(binding: Binding): string {
  return binding.type === 'button' ? `Bouton ${binding.index}` : `Axe ${binding.index} ${binding.sign > 0 ? '+' : '−'}`;
}
