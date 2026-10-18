import test from 'node:test';
import assert from 'node:assert/strict';
import {createStorage} from '../src/platform/storage.ts';
const world={map:['#####','#...#','#...#','#####'],spawn:{x:1,y:1},collectibles:[{x:2,y:1}]};
test('a blocked localStorage getter cannot prevent starting the game',()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new DOMException('blocked','SecurityError');}});
  try{const session=createStorage(world);assert.equal(session.available,false);assert.equal(session.save(session.state),false);}
  finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else Reflect.deleteProperty(globalThis,'localStorage');}
});
test('existing browser save and custom mapping survive architecture migration',()=>{
  const legacy={version:1,player:{x:2,y:1},steps:12,collected:[0],facing:'right'};
  const data=new Map([['pmd-field-save-v1',JSON.stringify(legacy)]]);
  const storage={getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>{data.set(key,value);}};
  const session=createStorage(world,storage);
  assert.deepEqual(session.state,legacy);
  session.mapping.confirm={type:'button',index:3};session.saveMapping(session.mapping);
  assert.equal(createStorage(world,storage).mapping.confirm.index,3);
  assert.deepEqual(createStorage(world,storage).state,legacy);
});
test('unavailable storage and malformed imports cannot destroy live progress',()=>{
  const unavailable={getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('denied');}};
  const session=createStorage(world,unavailable);
  assert.equal(session.available,false);assert.equal(session.save(session.state),false);
  assert.deepEqual(session.state.player,world.spawn);
  const invalid=createStorage(world,{getItem:key=>key==='pmd-field-save-v1'?'bad JSON':null,setItem:()=>{}});
  assert.equal(invalid.invalidSave,true);
});
