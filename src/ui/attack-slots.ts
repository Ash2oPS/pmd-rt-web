import type { EncounterSnapshot } from '../domain/combat/types.ts';
import type { Move } from '../content/schemas.ts';

const symbols: Partial<Record<Move['type'], string>> = { water: '≋', electric: 'ϟ', grass: '❧' };
const faceLabels = ['B', 'A', 'Y', 'X', 'L', 'R'];
export function hudBinding(label: string): string {
  const button = /^Bouton (\d+)$/.exec(label);
  return button ? faceLabels[Number(button[1])] ?? `B${button[1]}` : label;
}

/** Stable DOM keeps touch targets and focus intact while cast progress changes. */
export function createAttackSlots(parent: HTMLElement, attack: (slot: number) => void) {
  const buttons = Array.from({ length: 4 }, (_, index) => {
    const button = document.createElement('button');
    button.dataset.slot = String(index);
    button.innerHTML = '<span class="slot-key"></span><span class="slot-face"><img alt="" draggable="false"><span class="slot-symbol"></span><span class="slot-name"></span><span class="slot-state"></span></span>';
    button.addEventListener('click', () => attack(index)); parent.append(button);
    return { button, key: button.querySelector('.slot-key')!, image: button.querySelector('img')!,
      symbol: button.querySelector('.slot-symbol')!, name: button.querySelector('.slot-name')!, state: button.querySelector('.slot-state')! };
  });
  return (snapshot: EncounterSnapshot | null, moves: readonly (Move | null)[], bindings: readonly string[]) => {
    const cast = snapshot?.casts.find(cast => cast.casterId === 'player');
    const sleep = snapshot?.statuses.some(status => status.entityId === 'player' && status.kind === 'sleep');
    buttons.forEach(({ button, key, image, symbol, name, state }, index) => {
      const move = moves[index], cooldown = move ? snapshot?.cooldowns[`player:${move.id}`] ?? 0 : 0;
      key.textContent = hudBinding(bindings[index] ?? ['J', 'K', 'L', 'I'][index]!);
      button.classList.toggle('slot-empty', !move);
      button.dataset.type = move?.type ?? 'empty';
      const ownCast = !!cast && cast.moveId === move?.id;
      const phase = ownCast ? cast.phase === 'recovery' ? 'Récupération' : cast.phase === 'active' ? 'Impact' : 'Préparation' : '';
      state.textContent = phase || (cooldown > 0 ? `${cooldown.toFixed(1).replace('.', ',')} s` : '');
      name.textContent = move?.label ?? '—';
      const icon = move?.id === 'pound' ? 'punch' : move?.id === 'sing' ? 'sound' : null;
      image.hidden = !icon;
      if (icon && image.dataset.icon !== icon) { image.src = `${import.meta.env.BASE_URL}ui/${icon}.png`; image.dataset.icon = icon; }
      symbol.textContent = icon || !move ? '' : (symbols[move.type] ?? '✦');
      button.disabled = !move || !snapshot || snapshot.result !== 'playing' || cooldown > 0 || !!cast || !!sleep;
      const status = !move ? 'Emplacement vide' : !snapshot ? 'Disponible en entraînement' : sleep ? 'Sommeil' : phase || (cooldown > 0 ? 'Recharge' : 'Prête');
      button.setAttribute('aria-label', `${key.textContent} · ${move?.label ?? 'Vide'} · ${status}`);
      button.title = `${move?.label ?? 'Emplacement vide'} · ${bindings[index]} / ${['J', 'K', 'L', 'I'][index]} · ${status}`;
      const duration = ownCast ? move?.combat?.preparationSeconds ?? 1 : move?.combat?.cooldownSeconds ?? 1;
      const fraction = ownCast ? Math.min(1, cast.elapsedSeconds / duration) : cooldown > 0 ? Math.min(1, cooldown / duration) : 0;
      button.style.setProperty('--progress', `${fraction * 360}deg`);
      button.classList.toggle('slot-busy', ownCast || cooldown > 0);
    });
  };
}
