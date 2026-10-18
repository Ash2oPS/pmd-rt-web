import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {isPrecachedAsset} from './offline-assets.mts';

async function walk(directory:string):Promise<string[]>{
  const entries=await readdir(directory,{withFileTypes:true});
  const nested=await Promise.all(entries.map(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)]));
  return nested.flat();
}
const files=(await walk('dist')).filter(file=>!file.endsWith('.map')&&!file.endsWith('sw.js')).sort();
const hash=createHash('sha256');
for(const file of files)hash.update(file).update(await readFile(file));
const cache=`pmd-field-${hash.digest('hex').slice(0,12)}`;
const assets=['./',...files.map(file=>path.relative('dist',file).replaceAll('\\','/')).filter(isPrecachedAsset).map(file=>'./'+file)];
const template=await readFile('scripts/templates/service-worker.js','utf8');
await writeFile('dist/sw.js',template.replace('__CACHE__',JSON.stringify(cache)).replace('__ASSETS__',JSON.stringify(assets)));
console.log(`Offline cache ${cache}: ${assets.length} files`);
