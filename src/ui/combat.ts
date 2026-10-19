import type { EncounterSnapshot } from '../domain/combat/types.ts';
import type { Move } from '../content/schemas.ts';
import { element } from './dom.ts';

export function createCombatHUD(playerLabel: string, attack: (slot: number) => void, retry: () => void, leave: () => void) {
  const panel = document.createElement('section');
  panel.id = 'combat-hud';
  panel.className = 'combat-hud';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Combat d’entraînement');
  panel.innerHTML = `<div class="combat-vitals"><span>RONDOUDOU</span><meter min="0" max="100" value="100" aria-label="Points de vie"></meter><strong></strong></div>
    <div class="combat-slots"><button data-slot="0"></button><button data-slot="1"></button></div>
    <div class="combat-result" hidden role="status"><strong></strong><button data-retry>Recommencer</button><button data-leave>Retour à l’exploration</button></div>`;
  document.querySelector('.game-frame')!.append(panel);
  const slots = [...panel.querySelectorAll<HTMLButtonElement>('[data-slot]')];
  slots.forEach((button, index) => button.addEventListener('click', () => attack(index)));
  panel.querySelector('[data-retry]')!.addEventListener('click', retry);
  panel.querySelector('[data-leave]')!.addEventListener('click', leave);
  const meter = panel.querySelector('meter')!;
  panel.querySelector('.combat-vitals span')!.textContent = playerLabel.toLocaleUpperCase('fr');
  const health = panel.querySelector('.combat-vitals strong')!;
  const result = panel.querySelector<HTMLElement>('.combat-result')!;
  const resultButtons = [...result.querySelectorAll<HTMLButtonElement>('button')];
  let resultIndex = 0, lastResult = 'playing';
  function selectResult(index: number) {
    resultIndex = (index + resultButtons.length) % resultButtons.length;
    resultButtons.forEach((button, i) => button.classList.toggle('selected', i === resultIndex));
    resultButtons[resultIndex]!.focus({ preventScroll: true });
  }
  resultButtons.forEach((button, index) => button.addEventListener('focus', () => { resultIndex = index; }));
  return {
    navigateResult(delta: number) { selectResult(resultIndex + delta); },
    confirmResult() { resultButtons[resultIndex]!.click(); },
    update(snapshot: EncounterSnapshot | null, moves: readonly Move[], bindings: readonly string[]) {
      panel.hidden = !snapshot;
      if (!snapshot) return;
      meter.max = snapshot.player.maxHp;
      meter.value = snapshot.player.hp;
      health.textContent = `${Math.ceil(snapshot.player.hp)} / ${snapshot.player.maxHp}`;
      slots.forEach((button, index) => {
        const move = moves[index];
        button.hidden = !move;
        if (!move) return;
        const cooldown = snapshot.cooldowns[`player:${move.id}`] ?? 0;
        const casting = snapshot.casts.find(cast => cast.casterId === 'player');
        button.disabled = snapshot.result !== 'playing' || cooldown > 0 || !!casting;
        button.textContent = `${index ? 'K' : 'J'} · ${bindings[index]}  ${move.label}${cooldown > 0 ? ` · ${cooldown.toFixed(1)} s` : casting?.moveId === move.id ? ' · Préparation' : ''}`;
      });
      result.hidden = snapshot.result === 'playing';
      if (snapshot.result !== 'playing' && lastResult === 'playing') selectResult(0);
      lastResult = snapshot.result;
      result.querySelector('strong')!.textContent = snapshot.result === 'won' ? 'Entraînement réussi !' : 'Rondoudou est K.O.';
      element('scene-status').textContent = snapshot.result === 'playing' ? 'Combat d’entraînement' : 'Entraînement terminé';
    },
  };
}
