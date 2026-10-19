import type { EncounterSnapshot } from '../domain/combat/types.ts';
import type { CollisionWorld } from '../domain/movement.ts';
import { attackPath, combatRoot as root } from './combat-shapes.ts';

function hostile(snapshot: EncounterSnapshot, casterId: string): boolean {
  return snapshot.actors.some(actor => actor.id === casterId && actor.team === 'hostile');
}

/** Pending ground hints never use the opaque highlight reserved for a damaging zone. */
export function drawZoneGround(context: CanvasRenderingContext2D, snapshot: EncounterSnapshot, world?: CollisionWorld): void {
  context.save();
  for (const zone of snapshot.zones) {
    if (zone.occluded) continue;
    const active = zone.phase === 'active';
    const enemy = hostile(snapshot, zone.casterId);
    const justActivated = active && snapshot.time - zone.activationTime < .1;
    context.fillStyle = justActivated ? '#fff2bd' : enemy ? active ? '#ef7350' : '#f6be57' : active ? '#98e8df' : '#78c9d5';
    context.globalAlpha = justActivated ? .42 : active ? .3 : .1;
    attackPath(context, zone.geometry, world);
    // Ring/arc centers stay transparent, including terrain-clipped contours.
    context.fill('evenodd');
  }
  context.restore();
}

export function drawZoneOverlay(context: CanvasRenderingContext2D, snapshot: EncounterSnapshot, world?: CollisionWorld): void {
  context.save();
  const trajectories = new Set<string>();
  for (const zone of snapshot.zones) {
    if (!zone.trajectory) continue;
    const key = `${zone.castId}:${JSON.stringify(zone.trajectory)}`;
    if (trajectories.has(key)) continue;
    trajectories.add(key);
    context.globalAlpha = zone.phase === 'pending' ? .45 : .22;
    context.setLineDash([2, 5]);
    context.lineWidth = 1;
    context.strokeStyle = hostile(snapshot, zone.casterId) ? '#f1be7a' : '#98e0dd';
    attackPath(context, zone.trajectory, world);
    context.stroke();
  }
  for (const zone of snapshot.zones) {
    const active = zone.phase === 'active';
    if (zone.occluded) continue;
    const enemy = hostile(snapshot, zone.casterId);
    context.globalAlpha = active ? .95 : .8;
    context.setLineDash(active ? [] : [3, 2]);
    context.lineWidth = active ? 2 : 1;
    context.strokeStyle = active ? enemy ? '#ffe1ac' : '#d6fff0' : enemy ? '#f6bf6b' : '#9ee5dc';
    attackPath(context, zone.geometry, world);
    context.stroke();
    if (active && zone.trajectory && zone.geometry.kind === 'disk') {
      // The moving object is bright; its faint, unfilled trajectory is never a damaging ring.
      context.fillStyle = '#fff2c9';
      context.fillRect(Math.round(root(zone.geometry.origin.x)) - 1, Math.round(root(zone.geometry.origin.y)) - 1, 3, 3);
    }
  }
  context.restore();
}
