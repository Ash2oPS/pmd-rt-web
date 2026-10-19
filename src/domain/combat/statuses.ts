import type { StatusSnapshot } from './types.ts';

interface SleepState { remainingSeconds: number; wakeOnHit: boolean }
export class Statuses {
  private readonly sleep = new Map<string, SleepState>();
  isSleeping(entityId: string): boolean { return this.sleep.has(entityId); }
  applySleep(entityId: string, durationSeconds: number, wakeOnHit: boolean): void {
    this.sleep.set(entityId, { remainingSeconds: durationSeconds, wakeOnHit });
  }
  wakeOnDamage(entityId: string): boolean {
    return this.sleep.get(entityId)?.wakeOnHit ? this.sleep.delete(entityId) : false;
  }
  update(dt: number): string[] {
    const expired: string[] = [];
    for (const [id, status] of this.sleep) {
      status.remainingSeconds = Math.max(0, status.remainingSeconds - dt);
      if (status.remainingSeconds <= 1e-9) { this.sleep.delete(id); expired.push(id); }
    }
    return expired;
  }
  clear(): void { this.sleep.clear(); }
  snapshot(): StatusSnapshot[] {
    return [...this.sleep].map(([entityId, status]) => ({ entityId, kind: 'sleep', remainingSeconds: status.remainingSeconds }));
  }
}
