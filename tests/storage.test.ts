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
  const migrated={...legacy,version:2,distance:legacy.steps};
  assert.deepEqual(session.state,migrated);
  assert.equal(session.save(session.state),true);
  assert.equal(JSON.parse(data.get('pmd-field-save-v1')!).version,2);
  session.mapping.confirm={type:'button',index:3};session.saveMapping(session.mapping);
  assert.equal(createStorage(world,storage).mapping.confirm.index,3);
  assert.deepEqual(createStorage(world,storage).state,migrated);
});
test('unavailable storage and malformed imports cannot destroy live progress',()=>{
  const unavailable={getItem:()=>{throw new Error('denied');},setItem:()=>{throw new Error('denied');}};
  const session=createStorage(world,unavailable);
  assert.equal(session.available,false);assert.equal(session.save(session.state),false);
  assert.deepEqual(session.state.player,world.spawn);
  const invalid=createStorage(world,{getItem:key=>key==='pmd-field-save-v1'?'bad JSON':null,setItem:()=>{}});
  assert.equal(invalid.invalidSave,true);
});

test('rejected saves survive automatic and manual saves until an explicit valid import',()=>{
  for (const original of ['bad JSON', JSON.stringify({version:3,progress:'future data'})]) {
    const data=new Map([['pmd-field-save-v1',original]]);
    const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);}};
    const session=createStorage(world,storage);
    assert.equal(session.invalidSave,true);
    assert.equal(session.available,false);
    for (let attempt=0;attempt<3;attempt++) assert.equal(session.save(session.state),false);
    assert.equal(session.saveMapping(session.mapping),true);
    assert.equal(data.get('pmd-field-save-v1'),original);
    assert.equal(createStorage(world,storage).invalidSave,true);
    assert.equal(session.save(session.state,{replaceInvalid:true}),true);
    assert.equal(session.invalidSave,false);
    assert.equal(session.available,true);
    assert.equal(session.save(session.state),true);
    assert.deepEqual(createStorage(world,storage).state,session.state);
  }
});

test('failed reads and failed replacements preserve the original save protection',()=>{
  let writes=0;
  const unreadable=createStorage(world,{getItem:()=>{throw new Error('read denied');},setItem:()=>{writes++;}});
  assert.equal(unreadable.save(unreadable.state),false);
  assert.equal(unreadable.save(unreadable.state,{replaceInvalid:true}),false);
  assert.equal(writes,0);
  const rejected=createStorage(world,{getItem:key=>key==='pmd-field-save-v1'?'bad JSON':null,setItem:()=>{throw new Error('write denied');}});
  assert.equal(rejected.save(rejected.state,{replaceInvalid:true}),false);
  assert.equal(rejected.invalidSave,true);
  assert.equal(rejected.available,false);
});
