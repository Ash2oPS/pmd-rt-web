import test from 'node:test';
import assert from 'node:assert/strict';
import { movementSettings } from '../src/content/catalog.ts';
import { movementSettingsSchema } from '../src/content/schemas.ts';
import { relativeMovementSpeed } from '../src/domain/speed.ts';
import { Runtime } from '../src/app/runtime.ts';

const settings = { ...movementSettings, playerMaxSpeed: 3 };
test('relative speed uses attenuated stat ratios, clamps and behavior independently from player input', () => {
  assert.equal(relativeMovementSpeed(100, 100, settings), 3);
  assert.ok(Math.abs(relativeMovementSpeed(25, 100, settings) - 1.8) < 1e-12);
  assert.ok(Math.abs(relativeMovementSpeed(999, 1, settings) - 4.8) < 1e-12);
  assert.ok(Math.abs(relativeMovementSpeed(200, 100, settings) - 3 * Math.sqrt(2)) < 1e-12);
  assert.equal(relativeMovementSpeed(100, 100, settings, .25), .75);
  assert.equal(relativeMovementSpeed(100, 100, settings, settings.pursuitMultiplier), 3);
  assert.throws(() => relativeMovementSpeed(1, 0, settings));
});
test('player maximum is independent of species and proportional input only affects player movement', () => {
  const world = { map: ['########', '#......#', '#......#', '########'], spawn: { x: 2, y: 1 }, collectibles: [] };
  const full = new Runtime(world, undefined, 3), half = new Runtime(world, undefined, 3);
  full.advance({ x: 1, y: 0 }, .25);
  half.advance({ x: .5, y: 0 }, .25);
  assert.equal(full.state.player.x - 2, 2 * (half.state.player.x - 2));
  assert.equal(full.maxSpeed, half.maxSpeed);
  assert.equal(relativeMovementSpeed(100, 100, settings), 3);
});
test('movement settings reject inverted ratios and invalid speeds', () => {
  assert.equal(movementSettingsSchema.safeParse({ ...settings, maxSpeedRatio: .1 }).success, false);
  assert.equal(movementSettingsSchema.safeParse({ ...settings, playerMaxSpeed: 0 }).success, false);
});
