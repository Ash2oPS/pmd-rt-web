import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultMapping } from '../src/platform/input/mapping.ts';
import type { PadLike } from '../src/platform/input/mapping.ts';
import { digitalMovement, padMovement, radialStick } from '../src/platform/input/movement.ts';
const pad = (axes: number[], buttons: number[] = []): PadLike => ({
  id: 'Analog', index: 0, axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })),
});
test('radial deadzone rejects drift while preserving arbitrary angle and proportional strength', () => {
  assert.deepEqual(radialStick(.1, .1), { x: 0, y: 0 });
  const low = radialStick(.4, .2), high = radialStick(.8, .4);
  assert.ok(Math.hypot(low.x, low.y) < Math.hypot(high.x, high.y));
  assert.ok(Math.abs(low.x / low.y - 2) < 1e-12);
  assert.ok(Math.abs(Math.hypot(radialStick(1, 1).x, radialStick(1, 1).y) - 1) < 1e-12);
  assert.deepEqual(radialStick(Number.NaN, 1), { x: 0, y: 0 });
  assert.deepEqual(radialStick(.2, 0, .25), { x: 0, y: 0 });
});
test('digital diagonals normalize and opposing buttons cancel', () => {
  assert.equal(Math.hypot(...Object.values(digitalMovement(new Set(['right', 'down'])))), 1);
  assert.deepEqual(digitalMovement(new Set(['left', 'right'])), { x: 0, y: 0 });
});
test('analog movement preserves custom buttons and axes without restoring disabled defaults', () => {
  const mapping = defaultMapping();
  assert.deepEqual(padMovement(pad([0, -1]), mapping), { x: 0, y: -1 });
  mapping.up = { type: 'button', index: 4 };
  assert.deepEqual(padMovement(pad([0, -1]), mapping), { x: 0, y: 0 });
  assert.deepEqual(padMovement(pad([0, -1], [4]), mapping), { x: 0, y: -1 });
  mapping.right = { type: 'axis', index: 3, sign: -1 };
  assert.ok(padMovement(pad([0, 0, 0, -.5]), mapping).x > 0);
  assert.deepEqual(padMovement(null, mapping), { x: 0, y: 0 });
});

test('a completely remapped analog stick still preserves its exact angle', () => {
  const mapping = defaultMapping();
  mapping.left = { type: 'axis', index: 2, sign: -1 };
  mapping.right = { type: 'axis', index: 2, sign: 1 };
  mapping.up = { type: 'axis', index: 3, sign: -1 };
  mapping.down = { type: 'axis', index: 3, sign: 1 };
  const vector = padMovement(pad([0, 0, .8, .4]), mapping);
  assert.ok(Math.abs(vector.y / vector.x - .5) < 1e-12);
});
