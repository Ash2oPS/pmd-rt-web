import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  move,
  restore,
  decodePad,
  defaultMapping,
  validateMapping,
} from "../core.js";

test("explorer moves one tile and walls block movement", () => {
  const state = initialState();
  assert.equal(move(state, 1, 0), true);
  assert.deepEqual(state.player, { x: 4, y: 5 });
  state.player = { x: 1, y: 1 };
  assert.equal(move(state, -1, 0), false);
  assert.equal(state.steps, 1);
});
test("save roundtrip preserves progress; malformed saves are rejected", () => {
  const state = initialState();
  move(state, 1, 0);
  assert.deepEqual(restore(JSON.stringify(state)), state);
  for (const value of [
    "{}",
    "null",
    "{",
    JSON.stringify({ ...state, player: { x: 0, y: 0 } }),
    JSON.stringify({ ...state, steps: -1 }),
  ]) {
    assert.equal(restore(value), null);
  }
});
test("collectible is collected once", () => {
  const state = initialState();
  state.player = { x: 6, y: 5 };
  move(state, 1, 0);
  assert.equal(state.collected.length, 1);
  move(state, -1, 0);
  move(state, 1, 0);
  assert.equal(state.collected.length, 1);
});
test("standard controls, stick deadzone and remapping work", () => {
  const pad = {
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0.1, -0.1],
  };
  assert.deepEqual(decodePad(pad, defaultMapping()), []);
  pad.axes[0] = 0.8;
  assert.ok(decodePad(pad, defaultMapping()).includes("right"));
  pad.axes[0] = 0;
  pad.buttons[12].pressed = true;
  assert.ok(decodePad(pad, defaultMapping()).includes("up"));
  const map = defaultMapping();
  map.confirm = { type: "button", index: 3 };
  pad.buttons[3].pressed = true;
  assert.ok(decodePad(pad, map).includes("confirm"));
  assert.equal(validateMapping({}), false);
  assert.equal(validateMapping(map), true);
});
