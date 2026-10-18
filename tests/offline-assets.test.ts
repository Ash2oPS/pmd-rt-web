import test from 'node:test';
import assert from 'node:assert/strict';
import {isPrecachedAsset} from '../scripts/offline-assets.mts';
test('sprite sheets are cached on demand while manifest and credits remain available offline',()=>{
  assert.equal(isPrecachedAsset('pokemon/pikachu/Idle-Anim.png'),false);
  assert.equal(isPrecachedAsset('pokemon/pikachu/Attack-Anim.png'),false);
  assert.equal(isPrecachedAsset('pokemon/manifest.json'),true);
  assert.equal(isPrecachedAsset('credits/pokemon.json'),true);
  assert.equal(isPrecachedAsset('assets/index-abc.js'),true);
  assert.equal(isPrecachedAsset('assets/index-abc.js.map'),false);
});
