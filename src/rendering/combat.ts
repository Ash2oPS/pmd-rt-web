import type { AttackGeometry, CombatEvent, EncounterSnapshot } from '../domain/combat/types.ts';
import { sectorOutline } from '../domain/combat/geometry.ts';
import type { CollisionWorld, Point } from '../domain/movement.ts';

const TILE = 32;
const root = (coordinate: number): number => coordinate * TILE + TILE / 2;
const outlines = new WeakMap<readonly string[], Map<string, readonly Point[]>>();

function clippedOutline(world: CollisionWorld, geometry: AttackGeometry): readonly Point[] {
  let cache = outlines.get(world.map);
  if (!cache) { cache = new Map(); outlines.set(world.map, cache); }
  const key = [geometry.origin.x, geometry.origin.y, geometry.angleRadians, geometry.range, geometry.angleDegrees].join(':');
  const cached = cache.get(key);
  if (cached) return cached;
  const points = sectorOutline(world, geometry);
  if (cache.size >= 32) cache.clear();
  cache.set(key, points);
  return points;
}

/** Ground danger uses the exact geometry used for contact, in world pixel roots. */
function sector(context: CanvasRenderingContext2D, geometry: AttackGeometry, world?: CollisionWorld): void {
  const x = root(geometry.origin.x), y = root(geometry.origin.y);
  const half = geometry.angleDegrees * Math.PI / 360;
  const segments = Math.max(4, Math.ceil(geometry.angleDegrees / 8));
  context.beginPath();
  context.moveTo(Math.round(x), Math.round(y));
  if (world) {
    for (const point of clippedOutline(world, geometry)) context.lineTo(Math.round(root(point.x)), Math.round(root(point.y)));
    context.closePath();
    return;
  }
  for (let i = 0; i <= segments; i++) {
    const angle = geometry.angleRadians - half + half * 2 * i / segments;
    context.lineTo(Math.round(x + Math.cos(angle) * geometry.range * TILE),
      Math.round(y + Math.sin(angle) * geometry.range * TILE));
  }
  context.closePath();
}

function hostileCaster(snapshot: EncounterSnapshot, casterId: string): boolean {
  return snapshot.actors.some(actor => actor.id === casterId && actor.team === 'hostile');
}

/** Flat translucent fills sit below sprites; amber tracking becomes solid red at lock. */
export function drawCombatGround(context: CanvasRenderingContext2D, snapshot: EncounterSnapshot, world?: CollisionWorld): void {
  context.save();
  for (const cast of snapshot.casts) {
    if (cast.phase === 'recovery') continue;
    const hostile = hostileCaster(snapshot, cast.casterId);
    const locked = cast.phase === 'locked';
    const active = cast.phase === 'active';
    context.fillStyle = active ? '#fff1bf' : hostile ? locked ? '#e35c35' : '#f6be57' : '#78d9d4';
    context.globalAlpha = active ? .32 : locked ? .27 : .14;
    sector(context, cast.geometry, world);
    context.fill();
    // Sparse direction marks distinguish the aiming phase without obscuring terrain.
    if (cast.phase === 'tracking') {
      context.save();
      context.clip();
      const { geometry } = cast;
      context.globalAlpha = .7;
      for (let distance = .35; distance < geometry.range; distance += .3) {
        context.fillRect(Math.round(root(geometry.origin.x) + Math.cos(geometry.angleRadians) * distance * TILE) - 1,
          Math.round(root(geometry.origin.y) + Math.sin(geometry.angleRadians) * distance * TILE) - 1, 2, 2);
      }
      context.restore();
    }
  }
  context.restore();
}

function dangerOutline(context: CanvasRenderingContext2D, snapshot: EncounterSnapshot, world?: CollisionWorld): void {
  for (const cast of snapshot.casts) {
    if (cast.phase === 'recovery') continue;
    const hostile = hostileCaster(snapshot, cast.casterId);
    const tracking = cast.phase === 'tracking';
    const active = cast.phase === 'active';
    context.setLineDash(tracking ? [3, 3] : []);
    context.lineWidth = tracking ? 1 : 2;
    context.globalAlpha = tracking ? .65 : 1;
    context.strokeStyle = active ? '#fff5d5' : hostile ? tracking ? '#f6c66b' : '#ff9959' : '#a4f3e3';
    sector(context, cast.geometry, world);
    context.stroke();
    if (!tracking && !active) {
      // A small lock diamond is distinct from the moving dashed tracking outline.
      const { geometry } = cast;
      const outline = world ? clippedOutline(world, geometry) : null;
      const center = outline?.[Math.floor(outline.length / 2)];
      const x = Math.round(center ? root(center.x) : root(geometry.origin.x) + Math.cos(geometry.angleRadians) * geometry.range * TILE);
      const y = Math.round(center ? root(center.y) : root(geometry.origin.y) + Math.sin(geometry.angleRadians) * geometry.range * TILE);
      const size = Math.floor(snapshot.time * 6) % 2 ? 2 : 3;
      context.fillStyle = context.strokeStyle;
      context.fillRect(x - size, y - 1, size * 2 + 1, 3);
      context.fillRect(x - 1, y - size, 3, size * 2 + 1);
    }
  }
  context.setLineDash([]);
  context.globalAlpha = 1;
}

function healthBars(context: CanvasRenderingContext2D, snapshot: EncounterSnapshot): void {
  for (const actor of snapshot.actors) {
    if (actor.defeated || actor.team !== 'hostile') continue;
    const x = Math.round(root(actor.x)) - 10, y = Math.round(root(actor.y)) - 24;
    context.fillStyle = '#182728';
    context.fillRect(x - 1, y - 1, 22, 5);
    context.fillStyle = '#744d41';
    context.fillRect(x, y, 20, 3);
    context.fillStyle = '#f38b68';
    context.fillRect(x, y, Math.ceil(20 * Math.max(0, Math.min(1, actor.hp / actor.maxHp))), 3);
  }
}

function impact(context: CanvasRenderingContext2D, event: CombatEvent, age: number): void {
  const defeated = event.type === 'defeat';
  const lifetime = defeated ? .55 : .36;
  if (age < 0 || age > lifetime) return;
  const progress = age / lifetime;
  const x = root(event.position.x), y = root(event.position.y) - 6;
  context.globalAlpha = 1 - progress;
  for (let index = 0; index < 6; index++) {
    const angle = index * Math.PI / 3 + event.id * .7;
    const distance = (defeated ? 5 : 3) + progress * (defeated ? 15 : 10);
    const px = Math.round(x + Math.cos(angle) * distance);
    const py = Math.round(y + Math.sin(angle) * distance - progress * 4);
    context.fillStyle = '#563e39';
    context.fillRect(px - 1, py - 1, 4, 4);
    context.fillStyle = defeated ? '#f8d989' : index % 2 ? '#fff4d4' : '#f7bd64';
    context.fillRect(px, py, 2, 2);
  }
  if (!defeated && event.amount !== undefined) {
    const label = String(Math.round(event.amount));
    context.font = 'bold 8px monospace';
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.lineWidth = 2;
    context.strokeStyle = '#302a29';
    context.strokeText(label, Math.round(x), Math.round(y - 10 - progress * 12));
    context.fillStyle = '#fff4d4';
    context.fillText(label, Math.round(x), Math.round(y - 10 - progress * 12));
  }
}

/** Bright outlines remain legible above canopies. Presentation time also freezes in pause. */
export function drawCombatOverlay(context: CanvasRenderingContext2D, snapshot: EncounterSnapshot,
  events: readonly CombatEvent[] = [], world?: CollisionWorld, presentationTime = snapshot.time): void {
  context.save();
  context.lineJoin = 'round';
  dangerOutline(context, snapshot, world);
  healthBars(context, snapshot);
  // Root retains a bounded event ledger; this further bounds decorative work per frame.
  for (const event of events.slice(-48)) {
    if (event.type === 'hit' || event.type === 'defeat') impact(context, event, presentationTime - event.time);
  }
  context.restore();
}
