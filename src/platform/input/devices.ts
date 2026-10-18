import type { InputDiagnostics } from './diagnostics';
import type { PadLike } from './mapping';

type GamepadSource = () => readonly (PadLike | null)[];

function browserPads(): readonly (PadLike | null)[] {
  return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
}

export function createGamepadReader(diagnostics: InputDiagnostics, source: GamepadSource = browserPads): { read(): PadLike[] } {
  return {
    read() {
      let pads: PadLike[] = [];
      try {
        pads = source().filter((pad): pad is PadLike => pad !== null && pad.connected !== false);
        diagnostics.snapshot.error = null;
      } catch (error: unknown) {
        diagnostics.snapshot.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      }
      diagnostics.record(pads);
      return pads;
    },
  };
}
