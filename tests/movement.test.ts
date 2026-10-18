import test from 'node:test';
import assert from 'node:assert/strict';
import {canOccupy, facingFromVector, movePoint, moveContinuous} from '../src/domain/movement.ts';
import {createState} from '../src/domain/state.ts';
const open={map:['##########','#........#','#........#','#........#','#........#','##########'],spawn:{x:2,y:2},collectibles:[{x:4,y:2}]};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('continuous movement preserves analog magnitude and caps diagonal speed',()=>{
 const slow=createState(open);moveContinuous(slow,{x:.5,y:0},.2,open);near(slow.player.x,2.3);
 const full=createState(open);moveContinuous(full,{x:1,y:0},.2,open);near(full.player.x,2.6);
 const diagonal=createState(open);moveContinuous(diagonal,{x:1,y:1},.2,open);near(Math.hypot(diagonal.player.x-2,diagonal.player.y-2),.6);
 assert.equal(diagonal.facing,'down-right');
});
test('same elapsed movement is independent of frame rate and does not snap on release',()=>{
 const one=createState(open),many=createState(open);
 moveContinuous(one,{x:1,y:.2},.6,open);
 for(let i=0;i<60;i++)moveContinuous(many,{x:1,y:.2},.01,open);
 near(one.player.x,many.player.x);near(one.player.y,many.player.y);near(one.distance,many.distance);
 const stopped={...many.player};moveContinuous(many,{x:0,y:0},1,open);assert.deepEqual(many.player,stopped);
});
test('circle collision blocks walls, water, outside and narrow diagonal gaps',()=>{
 const world={map:['#####','#.~.#','##.##','#...#','#####']};
 assert.equal(canOccupy(world,{x:1,y:1}),true);
 assert.equal(canOccupy(world,{x:2,y:1}),false);
 assert.equal(canOccupy(world,{x:.55,y:1}),false);
 assert.equal(canOccupy(world,{x:-1,y:1}),false);
 const end=movePoint(world,{x:1,y:1},{x:4,y:4});
 assert.ok(end.x<1.4 && end.y<1.4);assert.ok(canOccupy(world,end));
});
test('large motion cannot tunnel across walls and glides along their edges',()=>{
 const world={map:['########','#..#...#','#..#...#','#..#...#','#..#...#','########']};
 const end=movePoint(world,{x:1,y:1},{x:6,y:2});
 assert.ok(end.x<2.29);assert.ok(end.y>2.9);assert.ok(canOccupy(world,end));
});
test('collection checks swept movement and counts actual distance once',()=>{
 const state=createState(open),result=moveContinuous(state,{x:1,y:0},1,open);
 assert.deepEqual(result.collected,[0]);assert.deepEqual(state.collected,[0]);near(state.distance,3);assert.equal(state.steps,3);
 moveContinuous(state,{x:-1,y:0},1,open);assert.deepEqual(state.collected,[0]);assert.equal(state.steps,6);
});
test('invalid input is inert and all eight directions have matching animation facing',()=>{
 const state=createState(open),before=structuredClone(state);
 for(const [v,dt] of [[{x:NaN,y:0},1],[{x:1,y:0},-1],[{x:1,y:0},Infinity]] as const)moveContinuous(state,v,dt,open);
 assert.deepEqual(state,before);
 assert.deepEqual([[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]].map(([x,y])=>facingFromVector({x,y})),['down','down-right','right','up-right','up','up-left','left','down-left']);
});
