import type { HitPolicy } from '../../content/zone-schema.ts';

/** A cast owns its ledger; repeated frames cannot manufacture extra contacts. */
export class HitLedger {
  private readonly hits = new Map<string, { count: number; lastTime: number }>();
  allow(policy: HitPolicy, zoneId: number, targetId: string, time: number): boolean {
    const key = policy.kind === 'once-per-zone' ? `${zoneId}:${targetId}` : targetId;
    const previous = this.hits.get(key);
    if (previous && (policy.kind !== 'periodic' || previous.count >= policy.maxHitsPerTarget
      || time - previous.lastTime < policy.intervalSeconds - 1e-9)) return false;
    this.hits.set(key, { count: (previous?.count ?? 0) + 1, lastTime: time });
    return true;
  }
}
