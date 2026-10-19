import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
let version=1;
const template=await readFile('scripts/templates/service-worker.js','utf8');
const server=createServer((req,res)=>{
 if(req.url==='/game/sw.js') {res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-cache'});res.end(template.replace('__CACHE__',JSON.stringify('pmd-field-test-'+version)).replace('__ASSETS__',JSON.stringify(['./','./version-'+version+'.js'])));}
 else if(req.url==='/game/') {res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'public,max-age=3600'});res.end(`<html><body><script src="version-${version}.js"></script><script>navigator.serviceWorker.register('sw.js')</script></body></html>`);}
 else if(req.url===`/game/version-${version}.js`) {res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'public,max-age=3600'});res.end(`document.body.dataset.version='${version}';`);}
 else{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/game/`;
const browser=await chromium.launch(), context=await browser.newContext();
try{
 let page=await context.newPage();await page.goto(url);await page.waitForFunction(()=>navigator.serviceWorker.controller);
 assert.equal(await page.locator('body').getAttribute('data-version'),'1');
 version=2;await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
 assert.equal(await page.locator('body').getAttribute('data-version'),'1');
 await page.close();await new Promise(resolve=>setTimeout(resolve,1000));
 page=await context.newPage();await page.goto(url);await page.waitForTimeout(500);
 const info=await page.evaluate(async()=>({version:document.body.dataset.version,html:document.documentElement.outerHTML,caches:await caches.keys(),active:(await navigator.serviceWorker.getRegistration()).active.state}));console.log(JSON.stringify(info));
 assert.equal(info.version,'2');
 console.log('PASS HTTP-cached old HTML cannot contaminate a new offline installation');
}finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
