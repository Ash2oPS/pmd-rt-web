import type { AttackVisual } from '../content/visual-schema.ts';

type AttackSound = NonNullable<AttackVisual['sound']>;
const MUTE_KEY = 'pmd-attack-audio-muted-v1';

/** Optional short synthesized cues. Only a trusted gesture may unlock browser audio. */
export function createAttackAudio() {
  let context: AudioContext | undefined;
  let muted = false;
  const voices = new Set<() => void>();
  try { muted = localStorage.getItem(MUTE_KEY) === 'true'; } catch { /* Storage is optional. */ }
  function reset(): void { for (const stop of [...voices]) stop(); }
  function unlock(event: Event): void {
    if (!event.isTrusted || muted || typeof AudioContext === 'undefined') return;
    try {
      context ??= new AudioContext();
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
    } catch { /* Missing or blocked audio must never interrupt the game. */ }
  }
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  function play(sound: AttackSound): void {
    if (muted || !context || context.state !== 'running' || sound.gain <= 0) return;
    while (voices.size >= 8) voices.values().next().value?.();
    const audio = context;
    let oscillator: OscillatorNode | undefined, gain: GainNode | undefined;
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true; voices.delete(stop);
      if (oscillator) {
        oscillator.onended = null;
        try { oscillator.stop(); } catch { /* Already finished. */ }
        oscillator.disconnect();
      }
      gain?.disconnect();
    };
    try {
      const start = audio.currentTime, duration = Math.max(.01, Math.min(2, sound.durationSeconds));
      oscillator = audio.createOscillator(); gain = audio.createGain();
      oscillator.type = sound.waveform;
      oscillator.frequency.setValueAtTime(sound.frequencyHz, start);
      oscillator.frequency.exponentialRampToValueAtTime(sound.endFrequencyHz, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(Math.min(.5, sound.gain), start + Math.min(.01, duration / 3));
      gain.gain.linearRampToValueAtTime(0, start + duration);
      oscillator.connect(gain); gain.connect(audio.destination);
      voices.add(stop); oscillator.onended = stop;
      oscillator.start(start); oscillator.stop(start + duration);
    } catch { stop(); }
  }
  return {
    play, reset,
    get muted() { return muted; },
    toggleMute(): boolean {
      muted = !muted;
      if (muted) reset();
      try { localStorage.setItem(MUTE_KEY, String(muted)); } catch { /* Storage is optional. */ }
      return muted;
    },
    suspend(): void {
      reset();
      if (context && context.state === 'running') void context.suspend().catch(() => undefined);
    },
  };
}
