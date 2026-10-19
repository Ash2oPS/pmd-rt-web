import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultMapping, validateMapping, restoreMapping, decodePad, rawSignals, bindingLabel, type PadLike } from '../src/platform/input/mapping.ts';
import { createInputDiagnostics } from '../src/platform/input/diagnostics.ts';
import { createGamepadReader } from '../src/platform/input/devices.ts';

function pad(axes: number[] = [], active: number[] = []): PadLike {
  return { id: 'Thor', index: 0, connected: true, mapping: 'standard', timestamp: 10,
    axes, buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: active.includes(index), value: active.includes(index) ? 1 : 0 })) };
}

test('combat bindings upgrade legacy mappings without replacing any customized action', () => {
  const current = defaultMapping();
  const { attack1, attack2, ...legacy } = current;
  legacy.confirm = { type: 'button', index: 5 };
  const upgraded = restoreMapping(legacy)!;
  assert.deepEqual(upgraded.confirm, legacy.confirm);
  assert.deepEqual(upgraded.attack1, attack1);
  assert.deepEqual(upgraded.attack2, attack2);
  assert.deepEqual(restoreMapping(upgraded), upgraded);
  assert.equal(restoreMapping({ ...legacy, attack1: { type: 'button', index: -1 } }), null);
  assert.deepEqual(decodePad(pad([], [2, 3]), upgraded), ['attack1', 'attack2']);
});

test('Thor face buttons confirm east and return south; custom directions disable stick fallback', () => {
  const mapping = defaultMapping();
  assert.deepEqual(decodePad(pad([], [1]), mapping), ['confirm']);
  assert.deepEqual(decodePad(pad([], [0]), mapping), ['back']);
  assert.deepEqual(decodePad(pad([0.26, -0.26]), mapping), ['up', 'right']);
  assert.deepEqual(decodePad(pad([0.25, -0.25]), mapping), []);
  mapping.up = { type: 'button', index: 4 };
  assert.deepEqual(decodePad(pad([0, -1]), mapping), []);
  mapping.up = { type: 'axis', index: 3, sign: -1 };
  assert.deepEqual(decodePad(pad([0, 0, 0, -0.51]), mapping), ['up']);
  assert.deepEqual(decodePad(null, mapping), []);
});

test('mapping validation rejects malformed persisted bindings without losing valid remaps', () => {
  assert.equal(validateMapping(defaultMapping()), true);
  for (const bad of [null, [], {}, { ...defaultMapping(), up: { type: 'axis', index: 0, sign: 0 } },
    { ...defaultMapping(), back: { type: 'button', index: 64 } },
    { ...defaultMapping(), menu: { type: 'button', index: 1.5 } }]) assert.equal(validateMapping(bad), false);
  assert.equal(validateMapping({ ...defaultMapping(), up: { type: 'axis', index: 63, sign: -1 } }), true);
});

test('raw capture uses deliberate axis threshold and labels negative axes', () => {
  assert.deepEqual(rawSignals(pad([0.6, -0.61], [1])), [{ type: 'button', index: 1 }, { type: 'axis', index: 1, sign: -1 }]);
  assert.deepEqual(rawSignals(null), []);
  assert.equal(bindingLabel({ type: 'axis', index: 1, sign: -1 }), 'Axe 1 −');
  assert.equal(bindingLabel({ type: 'button', index: 1 }), 'Bouton 1');
});

test('diagnostics preserve observed controls and disconnect history across reads', () => {
  const diagnostics = createInputDiagnostics('0.2.0', { apiAvailable: true, secureContext: true, focused: () => true, browser: 'test browser' });
  diagnostics.record([pad([-0.8, 0.2], [1])]);
  diagnostics.record([pad([0.4, -0.6], [2])]);
  assert.deepEqual(diagnostics.snapshot.devices[0]?.seenButtons, [1, 2]);
  assert.deepEqual(diagnostics.snapshot.devices[0]?.axisRanges, [{ min: -0.8, max: 0.4 }, { min: -0.6, max: 0.2 }]);
  diagnostics.record([]);
  assert.equal(diagnostics.snapshot.devices[0]?.connected, false);
  assert.deepEqual(diagnostics.snapshot.devices[0]?.activeButtons, []);
  diagnostics.snapshot.lastKey = { code: 'ArrowUp', key: 'ArrowUp' };
  diagnostics.snapshot.wheelEvents++;
  const report: unknown = JSON.parse(diagnostics.report(defaultMapping()));
  assert.ok(typeof report === 'object' && report !== null && 'build' in report && report.build === '0.2.0');
  assert.match(diagnostics.report(defaultMapping()), /test browser/);
});

test('reader excludes disconnected pads, reports API denial, and clears recovered errors', () => {
  const diagnostics = createInputDiagnostics('0.2.0');
  let deny = false;
  const reader = createGamepadReader(diagnostics, () => {
    if (deny) throw new DOMException('blocked', 'SecurityError');
    return [null, pad(), { ...pad(), index: 1, connected: false }];
  });
  assert.equal(reader.read().length, 1);
  deny = true;
  assert.deepEqual(reader.read(), []);
  assert.equal(diagnostics.snapshot.error, 'SecurityError: blocked');
  assert.equal(diagnostics.snapshot.devices[0]?.connected, false);
  deny = false;
  reader.read();
  assert.equal(diagnostics.snapshot.error, null);
});
