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
test('legacy v1 saves explicitly migrate to continuous v2 without losing progress', () => {
  const legacy={version:1,player:{x:2,y:1},steps:17,collected:[0],facing:'right'};
  const migrated=restore(JSON.stringify(legacy),world);
  assert.deepEqual(migrated,{...legacy,version:2,distance:17});
  assert.deepEqual(restore(JSON.stringify(migrated),world),migrated);
  assert.equal(restore(JSON.stringify({...legacy,player:{x:1.2,y:1}}),world),null);
  assert.equal(restore(JSON.stringify({...legacy,facing:'down-right'}),world),null);
});
test('v2 saves preserve fractional positions, distance and diagonal facing', () => {
  const state={...createState(world),player:{x:1.12,y:1.1},distance:3.37,steps:3,facing:'down-right'};
  assert.deepEqual(restore(JSON.stringify(state),world),state);
});
test('invalid, embedded-wall, inconsistent and future saves are rejected', () => {
  const state=createState(world);
  for(const raw of ['null','{}','{',JSON.stringify({...state,version:99}),JSON.stringify({...state,player:{x:2,y:2}}),JSON.stringify({...state,player:{x:.51,y:1}}),JSON.stringify({...state,collected:[0,0]}),JSON.stringify({...state,distance:-1}),JSON.stringify({...state,distance:1.5}),JSON.stringify({...state,facing:'unknown'})]) assert.equal(restore(raw,world),null);
});
