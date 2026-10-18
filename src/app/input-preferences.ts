import { element } from '../ui/dom.ts';
import type { GamepadController } from './gamepad.ts';

const KEY = 'pmd-input-preferences-v1';
const choices = [.10, .18, .25, .35];
/** Settings stay separate from legacy directional remaps and save data. */
export function setupInputPreferences(pad: GamepadController) {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof saved === 'number' && choices.includes(saved)) pad.deadzone = saved;
  } catch { /* Input remains usable when browser storage is unavailable. */ }
  const button = element<HTMLButtonElement>('stick-deadzone');
  function label() { button.textContent = `Zone morte du stick : ${Math.round(pad.deadzone * 100)} %`; }
  button.addEventListener('click', () => {
    pad.deadzone = choices[(choices.indexOf(pad.deadzone) + 1) % choices.length]!;
    pad.suppress();
    try { localStorage.setItem(KEY, JSON.stringify(pad.deadzone)); } catch { /* Session setting remains active. */ }
    label();
  });
  label();
}
