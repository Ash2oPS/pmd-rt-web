import test from 'node:test';
import assert from 'node:assert/strict';
import {createState, move, restore} from '../src/domain/state.ts';
const world = {map:['#####','#...#','#.#.#','#...#','#####'], spawn:{x:1,y:1},collectibles:[{x:2,y:1}]};
test('world data controls spawn, collision and collection', () => {
  const state=createState(world);
  assert.equal(move(state,-1,0,world),false);
  assert.equal(move(state,1,0,world),true);
  assert.deepEqual(state.collected,[0]);
  assert.equal(move(state,0,1,world),false);
  assert.equal(state.steps,1);
});
test('legacy v1 saves restore and invalid/future saves are rejected', () => {
  const state=createState(world);move(state,1,0,world);
  assert.deepEqual(restore(JSON.stringify(state),world),state);
  for(const raw of ['null','{}','{',JSON.stringify({...state,version:99}),JSON.stringify({...state,player:{x:2,y:2}}),JSON.stringify({...state,collected:[0,0]})]) assert.equal(restore(raw,world),null);
});
