import type { MovementSelection } from './movement';
import type { Mapping, PadLike } from './mapping';

export interface DeviceDiagnostic {
  id: string;
  index: number;
  connected: boolean;
  mapping: string | undefined;
  timestamp: number | undefined;
  axes: number[];
  buttonsCount: number;
  activeButtons: number[];
  seenButtons: number[];
  axisRanges: { min: number; max: number }[];
}
export interface DiagnosticSnapshot {
  build: string;
  apiAvailable: boolean;
  secureContext: boolean;
  error: string | null;
  devices: DeviceDiagnostic[];
  lastKey: { key: string; code: string } | null;
  wheelEvents: number;
  movement?: MovementSelection & { resolvedSpeed: number; maxSpeed: number };
}
export interface DiagnosticEnvironment {
  apiAvailable: boolean;
  secureContext: boolean;
  focused: () => boolean;
  browser: string;
}
export interface InputDiagnostics {
  snapshot: DiagnosticSnapshot;
  record(pads: readonly PadLike[]): void;
  report(mapping: Mapping): string;
}

function browserEnvironment(): DiagnosticEnvironment {
  return {
    apiAvailable: typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function',
    secureContext: typeof window !== 'undefined' && window.isSecureContext,
    focused: () => typeof document !== 'undefined' && document.hasFocus(),
    browser: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}

export function createInputDiagnostics(build: string, environment: DiagnosticEnvironment = browserEnvironment()): InputDiagnostics {
  const snapshot: DiagnosticSnapshot = {
    build, apiAvailable: environment.apiAvailable, secureContext: environment.secureContext,
    error: null, devices: [], lastKey: null, wheelEvents: 0,
  };
  const observed = new Map<string, DeviceDiagnostic>();
  return {
    snapshot,
    record(pads) {
      for (const pad of pads) {
        const key = `${pad.index}:${pad.id}`;
        const previous = observed.get(key);
        const axes = [...pad.axes];
        const activeButtons = pad.buttons.flatMap((button, index) => button.pressed || button.value > 0.1 ? [index] : []);
        observed.set(key, {
          id: pad.id, index: pad.index, connected: pad.connected !== false,
          mapping: pad.mapping, timestamp: pad.timestamp, axes,
          buttonsCount: pad.buttons.length, activeButtons,
          seenButtons: [...new Set([...(previous?.seenButtons ?? []), ...activeButtons])].sort((a, b) => a - b),
          axisRanges: axes.map((value, index) => ({
            min: Math.min(previous?.axisRanges[index]?.min ?? 0, value),
            max: Math.max(previous?.axisRanges[index]?.max ?? 0, value),
          })),
        });
      }
      for (const device of observed.values()) {
        if (!pads.some(pad => pad.index === device.index && pad.id === device.id)) {
          device.connected = false;
          device.activeButtons = [];
        }
      }
      snapshot.devices = [...observed.values()];
    },
    report(mapping) {
      return JSON.stringify({ ...snapshot, focused: environment.focused(), browser: environment.browser, mapping }, null, 2);
    },
  };
}
