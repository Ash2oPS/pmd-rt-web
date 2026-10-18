export function isPrecachedAsset(relative:string):boolean {
  return !relative.endsWith('.map')&&!relative.endsWith('sw.js')&&(!relative.startsWith('pokemon/')||relative==='pokemon/manifest.json');
}
