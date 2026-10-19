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
    <div class="combat-slots"><button data-slot="0"></button><button data-slot="1"></button><button data-slot="2"></button><button data-slot="3"></button>
      <div class="combat-shoulders"><button data-action="aim" aria-label="Maintenir pour viser sans avancer">L / Maj · Viser</button><button data-action="wait" aria-label="Maintenir pour attendre">R / Espace · Attendre</button></div></div>
    <div class="combat-result" hidden role="status"><strong></strong><button data-retry>Recommencer</button><button data-leave>Retour à l’exploration</button></div>`;
  document.querySelector('.game-frame')!.append(panel);
  const shoulders = panel.querySelector<HTMLElement>('.combat-shoulders')!;
  shoulders.classList.add('field-shoulders');
  document.querySelector('.touch-controls')!.append(shoulders);
  const slots = [...panel.querySelectorAll<HTMLButtonElement>('[data-slot]')];
  slots.forEach((button, index) => button.addEventListener('click', () => attack(index)));
  panel.querySelector('[data-retry]')!.addEventListener('click', () => retry());
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
    update(snapshot: EncounterSnapshot | null, moves: readonly (Move | null)[], bindings: readonly string[], shoulders: readonly string[] = ['L', 'R']) {
      panel.hidden = !snapshot;
      document.querySelector('[data-action="aim"]')!.textContent = `${shoulders[0]} · Viser`;
      document.querySelector('[data-action="wait"]')!.textContent = `${shoulders[1]} · Attendre`;
      if (!snapshot) return;
      const sleep = snapshot.statuses.find(status => status.entityId === 'player');
      panel.querySelector('.combat-vitals span')!.textContent = `${playerLabel.toLocaleUpperCase('fr')}${sleep ? ` · SOMMEIL ${sleep.remainingSeconds.toFixed(1)} s` : ''}`;
      meter.max = snapshot.player.maxHp;
      meter.value = snapshot.player.hp;
      health.textContent = `${Math.ceil(snapshot.player.hp)} / ${snapshot.player.maxHp}`;
      slots.forEach((button, index) => {
        const move = moves[index];
        button.hidden = false;
        if (!move) { button.disabled = true; button.textContent = `${['J', 'K', 'L', 'I'][index]} · Vide`; return; }
        const cooldown = snapshot.cooldowns[`player:${move.id}`] ?? 0;
        const casting = snapshot.casts.find(cast => cast.casterId === 'player');
        button.disabled = snapshot.result !== 'playing' || cooldown > 0 || !!casting || !!sleep;
        button.textContent = `${['J', 'K', 'L', 'I'][index]} · ${bindings[index]}  ${move.label}${casting?.moveId === move.id ? casting.phase === 'recovery' ? ' · Récupération' : ' · Préparation' : cooldown > 0 ? ` · ${cooldown.toFixed(1)} s` : ''}`;
      });
      result.hidden = snapshot.result === 'playing';
      if (snapshot.result !== 'playing' && lastResult === 'playing') selectResult(0);
      lastResult = snapshot.result;
      result.querySelector('strong')!.textContent = snapshot.result === 'won' ? 'Entraînement réussi !' : 'Rondoudou est K.O.';
      element('scene-status').textContent = snapshot.result === 'playing' ? 'Combat d’entraînement' : 'Entraînement terminé';
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
