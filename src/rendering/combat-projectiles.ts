import type { EncounterSnapshot } from '../domain/combat/types.ts';
import { combatRoot as root } from './combat-shapes.ts';

/** Water droplets follow physical projectiles; the telegraphed corridor never becomes a beam. */
export function drawCombatProjectiles(context: CanvasRenderingContext2D, snapshot: EncounterSnapshot): void {
  context.save();
  context.setLineDash([]);
  for (const projectile of snapshot.projectiles) {
    const x = root(projectile.position.x), y = root(projectile.position.y);
    const dx = projectile.position.x - projectile.previousPosition.x;
    const dy = projectile.position.y - projectile.previousPosition.y;
    const distance = Math.hypot(dx, dy);
    const size = Math.max(2, Math.min(6, Math.round(projectile.radius * 32)));
    if (distance > 0) {
      const trail = Math.min(9, distance * 32 * 3);
      context.globalAlpha = .65;
      context.strokeStyle = '#244a69';
      context.lineWidth = size + 2;
      context.beginPath();
      context.moveTo(Math.round(x - dx / distance * trail), Math.round(y - dy / distance * trail));
      context.lineTo(Math.round(x), Math.round(y));
      context.stroke();
      context.strokeStyle = '#68cce9';
      context.lineWidth = Math.max(1, size - 1);
      context.stroke();
    }
    context.globalAlpha = 1;
    const px = Math.round(x), py = Math.round(y);
    context.fillStyle = '#244a69';
    context.fillRect(px - size - 1, py - size + 1, size * 2 + 3, size * 2 - 1);
    context.fillRect(px - size + 1, py - size - 1, size * 2 - 1, size * 2 + 3);
    context.fillStyle = '#54bce4';
    context.fillRect(px - size, py - size + 1, size * 2 + 1, size * 2 - 1);
    context.fillRect(px - size + 1, py - size, size * 2 - 1, size * 2 + 1);
    context.fillStyle = '#d1f8ff';
    context.fillRect(px - size + 1, py - size + 1, Math.max(1, size - 1), 2);
  }
  context.restore();
}

export function drawSleepIndicators(context: CanvasRenderingContext2D, snapshot: EncounterSnapshot): void {
  context.save();
  context.globalAlpha = 1;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.font = 'bold 8px monospace';
  context.lineWidth = 2;
  for (const status of snapshot.statuses) {
    if (status.kind !== 'sleep') continue;
    const entity = status.entityId === 'player' ? snapshot.player : snapshot.actors.find(actor => actor.id === status.entityId);
    if (!entity || entity.defeated) continue;
    const drift = Math.floor(snapshot.time * 3) % 3;
    const x = Math.round(root(entity.x)) + 7, y = Math.round(root(entity.y)) - 28 - drift;
    context.strokeStyle = '#463859';
    context.fillStyle = '#e9dcff';
    context.strokeText('Z', x, y);
    context.fillText('Z', x, y);
  }
  context.restore();
}
