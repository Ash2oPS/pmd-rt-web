import type { EncounterSnapshot } from '../domain/combat/types.ts';
import type { Move } from '../content/schemas.ts';
import { element } from './dom.ts';
import { createAttackSlots, hudBinding } from './attack-slots.ts';

export function createCombatHUD(playerLabel: string, attack: (slot: number) => void, retry: () => void, leave: () => void, maxHp: number) {
  const panel = document.createElement('section');
  panel.id = 'combat-hud'; panel.className = 'combat-hud';
  panel.setAttribute('aria-label', 'Capacités');
  panel.innerHTML = `<div class="combat-vitals"><div id="field-portrait" class="field-portrait"></div><div class="vitals-info"><span class="vitals-name"></span><div class="vitals-line"><small>PV</small><meter min="0" aria-label="Points de vie"></meter><strong></strong></div><span class="vitals-status"></span></div></div>
    <div class="combat-slots"></div>
    <div class="combat-result" hidden role="status"><strong></strong><button data-retry>Recommencer</button><button data-leave>Retour à l’exploration</button></div>`;
  document.querySelector('.game-frame')!.append(panel);
  const shoulders = document.createElement('div'); shoulders.className = 'combat-shoulders field-shoulders';
  shoulders.innerHTML = '<button data-action="aim" aria-label="Maintenir pour viser sans avancer"><kbd></kbd> Viser</button><button data-action="wait" aria-label="Maintenir pour attendre"><kbd></kbd> Attendre</button>';
  document.querySelector('.game-frame')!.append(shoulders);
  const updateSlots = createAttackSlots(panel.querySelector('.combat-slots')!, attack);
  panel.querySelector('[data-retry]')!.addEventListener('click', () => retry());
  panel.querySelector('[data-leave]')!.addEventListener('click', leave);
  const meter = panel.querySelector('meter')!, health = panel.querySelector('.vitals-line strong')!;
  panel.querySelector('.vitals-name')!.textContent = playerLabel;
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
    update(snapshot: EncounterSnapshot | null, moves: readonly (Move | null)[], bindings: readonly string[], labels: readonly string[] = ['L', 'R']) {
      shoulders.querySelector('[data-action="aim"] kbd')!.textContent = hudBinding(labels[0]!);
      shoulders.querySelector('[data-action="wait"] kbd')!.textContent = hudBinding(labels[1]!);
      const sleep = snapshot?.statuses.find(status => status.entityId === 'player' && status.kind === 'sleep');
      panel.querySelector('.vitals-status')!.textContent = sleep ? `Sommeil · ${sleep.remainingSeconds.toFixed(1)} s` : '';
      meter.max = snapshot?.player.maxHp ?? maxHp; meter.value = snapshot?.player.hp ?? maxHp;
      health.textContent = `${Math.ceil(meter.value)} / ${meter.max}`;
      updateSlots(snapshot, moves, bindings);
      result.hidden = !snapshot || snapshot.result === 'playing';
      if (snapshot && snapshot.result !== 'playing' && lastResult === 'playing') selectResult(0);
      lastResult = snapshot?.result ?? 'playing';
      result.querySelector('strong')!.textContent = snapshot?.result === 'won' ? 'Entraînement réussi !' : 'Rondoudou est K.O.';
      element('scene-status').textContent = !snapshot ? 'Exploration' : snapshot.result === 'playing' ? 'Combat d’entraînement' : 'Entraînement terminé';
    },
  };
}

/** Menu buttons reuse the pause menu's keyboard/gamepad navigation and confirmation. */
export function addEquipmentSlots() {
  const buttons = Array.from({ length: 4 }, (_, index) => {
    const button = document.createElement('button');
    button.dataset.menu = `combat-equip-${index}`;
    element('menu-main').append(button);
    return button;
  });
  return {
    update(moves: readonly (Move | null)[]) {
      buttons.forEach((button, index) => {
        button.textContent = `Capacité ${index + 1} · ${moves[index]?.label ?? 'Vide'} · changer`;
      });
    },
  };
}

export function addTrainingPartners(partners: readonly { id: string; label: string }[]) {
  const first = document.querySelector<HTMLButtonElement>('[data-menu="combat"]');
  if (first && partners[0]) first.textContent = `Entraînement · ${partners[0].label}`;
  for (const partner of partners.slice(1)) {
    const button = document.createElement('button');
    button.dataset.menu = `combat-${partner.id}`;
    button.textContent = `Entraînement · ${partner.label}`;
    element('menu-main').append(button);
  }
}
