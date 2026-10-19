import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const url=process.env.TEST_URL||'http://localhost:5173/';
await mkdir('output/hud',{recursive:true});
const browser=await chromium.launch(), context=await browser.newContext({viewport:{width:960,height:540}});
await context.addInitScript(()=>{
 window.requestAnimationFrame=()=>0;
 window.__hudPad={connected:false,id:'HUD controller',index:0,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
 Object.defineProperty(navigator,'getGamepads',{value:()=>window.__hudPad.connected?[window.__hudPad]:[]});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const advance=ms=>page.evaluate(ms=>window.advanceTime(ms),ms);
const state=()=>page.evaluate(()=>JSON.parse(window.render_game_to_text()));
async function ready(){await page.waitForFunction(()=>typeof window.render_game_to_text==='function'&&JSON.parse(window.render_game_to_text()).pokemon.status==='ready',undefined,{polling:50});await advance(0);}
try{
 await page.goto(url);await ready();
 assert.equal(await page.locator('#field-portrait img').evaluate(img=>img.naturalWidth),40);
 assert.equal(await page.locator('.combat-vitals').isVisible(),true);
 assert.deepEqual(await page.locator('.slot-key').allTextContents(),['J','K','L','I']);
 assert.equal(await page.locator('[data-slot]:disabled').count(),4);
 for(const [width,height]of[[1440,900],[960,540],[640,360],[390,844],[320,568]]){
  await page.setViewportSize({width,height});
  await page.waitForFunction(()=>{const c=document.querySelector('#game');return c.width===Math.round(c.clientWidth*Math.min(devicePixelRatio,2))&&c.height===Math.round(c.clientHeight*Math.min(devicePixelRatio,2));},undefined,{polling:50});
  await advance(0);
  const rects=await page.locator('.combat-vitals,.scene-label,#menu-toggle,[data-slot],.field-shoulders').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(const r of rects)assert.ok(r.x>=0&&r.y>=0&&r.right<=width+1&&r.bottom<=height+1,JSON.stringify({width,height,r}));
  assert.equal(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.id),'game');
  await page.screenshot({path:`output/hud/field-${width}.png`});
 }
 await page.setViewportSize({width:960,height:540});
 await page.evaluate(()=>{window.__hudPad.connected=true});await advance(0);
 assert.deepEqual(await page.locator('.slot-key').allTextContents(),['Y','X','A','B']);
 assert.equal(await page.locator('[data-action="aim"] kbd').textContent(),'L');
 await page.keyboard.press('Escape');await advance(0);await page.locator('[data-menu="combat"]').click();await advance(0);
 assert.equal(await page.locator('[data-slot="0"]').isEnabled(),true);
 await page.locator('[data-slot="0"]').click();await advance(100);
 assert.match(await page.locator('[data-slot="0"]').getAttribute('aria-label'),/Préparation/);
 assert.ok((await state()).combat.casts.length);
 await page.screenshot({path:'output/hud/controller-cast.png'});
 await advance(500);assert.match(await page.locator('[data-slot="0"] .slot-state').textContent(),/Récupération/);
 await advance(500);await page.keyboard.press('k');await advance(2000);
 assert.match(await page.locator('[data-slot="1"] .slot-state').textContent(),/\d,\d s/);
 await page.keyboard.press('Escape');await advance(0);
 const frozen=await page.locator('.combat-slots').innerHTML();await advance(1000);assert.equal(await page.locator('.combat-slots').innerHTML(),frozen);
 await page.locator('[data-menu="resume"]').click();await advance(0);
 const mapping=(await state()).mapping;mapping.attack1={type:'button',index:6};
 await page.evaluate(mapping=>localStorage.setItem('pmd-field-bindings-v1',JSON.stringify(mapping)),mapping);
 await page.reload();await ready();await page.evaluate(()=>{window.__hudPad.connected=true});await advance(0);assert.equal(await page.locator('[data-slot="0"] .slot-key').textContent(),'B6');
 await context.setOffline(true);await page.reload();await ready();
 assert.equal(await page.locator('#field-portrait img').evaluate(img=>img.naturalWidth),40);
 assert.equal(await page.locator('[data-slot="0"] img').evaluate(img=>img.naturalWidth),40);
 assert.equal(await page.locator('[data-slot="1"] img').evaluate(img=>img.naturalWidth),40);
 assert.deepEqual(errors,[]);
 await writeFile('output/hud/results.json',JSON.stringify({portrait:'alternate',viewports:5,remaps:true,castCooldown:true,offline:true,errors},null,2));
 console.log('PASS persistent HUD, alternate portrait, five viewports, live cast/cooldown, controller/remaps and first-visit offline icons');
}finally{await context.close();await browser.close();}
