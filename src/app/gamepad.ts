import {
  ACTIONS,
  defaultMapping,
  decodePad,
  rawSignals,
  bindingLabel,
} from "../platform/input/mapping.ts";
import type {
  Action,
  Mapping,
  PadLike,
  Binding,
} from "../platform/input/mapping.ts";
import { createGamepadReader } from "../platform/input/devices.ts";
import { createInputDiagnostics } from "../platform/input/diagnostics.ts";
export class GamepadController {
  mapping: Mapping;
  current: PadLike | null = null;
  capture: Action | null = null;
  private baseline = new Set<string>();
  private ready = false;
  private needsRelease = false;
  readonly diagnostics;
  private reader;
  constructor(
    build: string,
    mapping: Mapping,
    private callbacks: {
      disconnect(): void;
      captured(action: Action, binding: Binding): void;
      persist(mapping: Mapping): void;
    },
  ) {
    this.mapping = mapping;
    this.diagnostics = createInputDiagnostics(build);
    this.reader = createGamepadReader(this.diagnostics);
    window.addEventListener("gamepaddisconnected", (event) => {
      if (event.gamepad.index === this.current?.index) {
        this.current = null;
        callbacks.disconnect();
      }
    });
  }
  poll(): Action[] {
    const pads = this.reader.read(),
      pad =
        pads.find((p) => p.index === this.current?.index) || pads[0] || null;
    if (!pad && this.current) this.callbacks.disconnect();
    this.current = pad;
    const signals = rawSignals(pad);
    if (this.capture && pad) {
      if (!signals.length) this.ready = true;
      const fresh = signals.find((s) => !this.baseline.has(JSON.stringify(s)));
      if (this.ready && fresh) {
        const action = this.capture;
        this.mapping[action] = fresh;
        this.capture = null;
        this.callbacks.persist(this.mapping);
        this.needsRelease = true;
        this.callbacks.captured(action, fresh);
      }
      return [];
    }
    if (this.needsRelease) {
      if (!signals.length) this.needsRelease = false;
      return [];
    }
    return decodePad(pad, this.mapping);
  }
  start(action: Action): boolean {
    if (!this.current) return false;
    this.capture = action;
    this.ready = false;
    this.baseline = new Set(
      rawSignals(this.current).map((s) => JSON.stringify(s)),
    );
    return true;
  }
  reset() {
    this.mapping = defaultMapping();
    this.callbacks.persist(this.mapping);
  }
  cancel() {
    this.capture = null;
  }
  get signalLabel() {
    return rawSignals(this.current).map(bindingLabel).join(" · ");
  }
  suppress() {
    this.needsRelease = true;
  }
}
