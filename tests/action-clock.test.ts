import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveActionClock } from '../src/domain/action-clock.ts';
import type { ActionClockInput } from '../src/domain/action-clock.ts';
import { Runtime } from '../src/app/runtime.ts';

const idle: ActionClockInput = { movement: { x: 0, y: 0 }, aimOnly: false, wait: false, playerBusy: false, paused: false };
const world = { map: ['########', '#......#', '#......#', '########'], spawn: { x: 2, y: 1 }, collectibles: [] };

test('idle freezes world time while movement intent uses full time at every analog magnitude', () => {
  assert.equal(resolveActionClock(idle, .25).worldDt, 0);
  for (const magnitude of [.01, .5, 1]) {
    const clock = resolveActionClock({ ...idle, movement: { x: magnitude, y: 0 } }, .25);
    assert.equal(clock.worldDt, .25);
    assert.deepEqual(clock.movement, { x: magnitude, y: 0 });
    assert.equal(clock.facing, 'right');
  }
});

test('aim-only updates facing without translation or time, and pause blocks all intents', () => {
  const aimed = resolveActionClock({ ...idle, movement: { x: -.5, y: -.5 }, aimOnly: true }, .25);
  assert.equal(aimed.facing, 'up-left');
  assert.equal(aimed.worldDt, 0);
  assert.deepEqual(aimed.movement, { x: 0, y: 0 });
  const paused = resolveActionClock({ ...idle, movement: { x: 1, y: 0 }, wait: true, playerBusy: true, paused: true }, .25);
  assert.deepEqual(paused, { worldDt: 0, movement: { x: 0, y: 0 }, facing: null });
});

test('waiting and every busy-player phase advance time even while the stick is released or only aiming', () => {
  assert.equal(resolveActionClock({ ...idle, wait: true }, .25).worldDt, .25);
  for (const phase of ['tracking', 'locked', 'active', 'recovery']) {
    const input = { ...idle, phase, playerBusy: true };
    assert.equal(resolveActionClock(input, .25).worldDt, .25);
    assert.equal(resolveActionClock({ ...input, aimOnly: true, movement: { x: 1, y: 0 } }, .25).worldDt, .25);
  }
});

test('enemy casts, projectiles and cooldown activity cannot start the clock', () => {
  const input = { ...idle, enemyBusy: true, projectileCount: 4, enemyCooldown: .5 };
  assert.equal(resolveActionClock(input, .25).worldDt, 0);
});

test('zero, invalid and negative durations never corrupt or advance world time', () => {
  for (const dt of [0, -.5, NaN, Infinity]) {
    assert.equal(resolveActionClock({ ...idle, wait: true }, dt).worldDt, 0);
  }
  assert.equal(resolveActionClock({ ...idle, movement: { x: NaN, y: 1 } }, .25).worldDt, 0);
});

test('Runtime advance at frozen time clears residual velocity without movement, pickups or elapsed time', () => {
  const runtime = new Runtime(world);
  runtime.advance({ x: 1, y: 0 }, .1);
  assert.ok(runtime.velocity.x > 0);
  const before = structuredClone(runtime.state), time = runtime.time;
  for (const dt of [0, -1, NaN, Infinity]) {
    const result = runtime.advance({ x: 1, y: 0 }, dt);
    assert.deepEqual(result, { moved: false, distance: 0, collected: [] });
    assert.deepEqual(runtime.state, before);
    assert.deepEqual(runtime.velocity, { x: 0, y: 0 });
    assert.deepEqual(runtime.visual, before.player);
    assert.equal(runtime.time, time);
  }
});

test('pushing a wall advances normal world time even when no translation succeeds', () => {
  const runtime = new Runtime(world);
  runtime.advance({ x: 0, y: -1 }, 1);
  const before = { ...runtime.state.player }, time = runtime.time;
  const clock = resolveActionClock({ ...idle, movement: { x: 0, y: -1 } }, .25);
  const result = runtime.advance(clock.movement, clock.worldDt);
  assert.equal(result.moved, false);
  assert.ok(Math.hypot(runtime.state.player.x - before.x, runtime.state.player.y - before.y) < .00001);
  assert.equal(runtime.time, time + .25);
});

test('composition can rotate an idle explorer without advancing its movement or animation clock', () => {
  const runtime = new Runtime(world);
  const before = { ...runtime.state.player };
  const clock = resolveActionClock({ ...idle, movement: { x: 1, y: -1 }, aimOnly: true }, .25);
  if (clock.facing) runtime.state.facing = clock.facing;
  runtime.advance(clock.movement, clock.worldDt);
  assert.equal(runtime.state.facing, 'up-right');
  assert.deepEqual(runtime.state.player, before);
  assert.equal(runtime.time, 0);
});
