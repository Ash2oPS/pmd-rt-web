export type EditorPath = (string | number)[];
export interface FieldContext { raw: unknown; change(path: EditorPath, value: unknown): void; remove(path: EditorPath): void }
export function at(value: unknown, path: readonly (string | number)[]): unknown {
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = Reflect.get(value, key);
  }
  return value;
}
export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
export function section(title: string, parent: HTMLElement): HTMLElement {
  const group = node('fieldset'); group.append(node('legend', title)); parent.append(group); return group;
}
export function action(text: string, run: () => void, disabled = false): HTMLButtonElement {
  const button = node('button', text); button.type = 'button'; button.disabled = disabled; button.addEventListener('click', run); return button;
}
const optionLabels: Record<string, string> = {
  sector: 'Cône / secteur', 'self-disk': 'Cercle autour du lanceur', 'target-disk': 'Cercle ciblé', projectile: 'Projectile', zones: 'Zones combinées',
  disk: 'Disque', ring: 'Anneau / arc', line: 'Ligne', caster: 'Sur le lanceur', target: 'Sur la cible', forward: 'Devant le lanceur',
  single: 'Une seule zone', offsets: 'Positions définies', 'random-disk': 'Positions aléatoires dans un disque', circle: 'Répartition en cercle',
  fixed: 'Immobile', orbit: 'Orbite', 'once-per-cast': 'Un coup par attaque', 'once-per-zone': 'Un coup par zone', periodic: 'Coups périodiques',
  damage: 'Dégâts', sleep: 'Sommeil', physical: 'Physique', special: 'Spéciale', status: 'Statut',
  prepare: 'Préparation', lock: 'Verrouillage', activate: 'Activation', hit: 'Impact', zone: 'Zone active', cancel: 'Annulation',
  sprite: 'Sprite animé', particles: 'Particules', trail: 'Traînée', ground: 'Au sol', overlay: 'Au-dessus des acteurs',
};
export function field(parent: HTMLElement, context: FieldContext, path: EditorPath, title: string, fallback: unknown,
  options?: readonly string[], write?: (value: unknown) => void): void {
  const raw = at(context.raw, path), value = raw === undefined ? fallback : raw;
  const label = node('label', title, 'editor-field');
  const control = options ? node('select') : node('input');
  control.dataset.editorPath = JSON.stringify(path);
  control.setAttribute('aria-label', title);
  if (control instanceof HTMLSelectElement) {
    for (const option of options ?? []) { const item = node('option', optionLabels[option] ?? option); item.value = option; control.append(item); }
    if (value !== undefined && !options?.includes(String(value))) control.append(node('option', String(value)));
    control.value = String(value ?? '');
  } else {
    control.type = typeof fallback === 'boolean' ? 'checkbox' : typeof fallback === 'number' ? 'number' : 'text';
    if (control.type === 'checkbox') control.checked = Boolean(value);
    else { control.value = typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''); control.step = 'any'; }
  }
  control.addEventListener(control instanceof HTMLSelectElement || typeof fallback === 'boolean' ? 'change' : 'input', () => {
    const value = control instanceof HTMLInputElement && control.type === 'checkbox' ? control.checked
      : typeof fallback === 'number' ? control.value === '' ? '' : Number(control.value) : control.value;
    if (write) write(value); else context.change(path, value);
  });
  label.append(control);
  if (path.at(-1) === 'color') {
    const picker = node('input'); picker.type = 'color'; picker.setAttribute('aria-label', 'Choisir la couleur');
    picker.value = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
    picker.addEventListener('change', () => write ? write(picker.value) : context.change(path, picker.value)); label.append(picker);
  }
  parent.append(label);
}
const labels: Record<string, string> = {
  id: 'Identifiant stable', label: 'Nom',
  preparationSeconds: 'Préparation (s)', trackingSeconds: 'Visée mobile (s)', activeSeconds: 'Durée active (s)',
  recoverySeconds: 'Récupération (s)', cooldownSeconds: 'Recharge (s)', movementDuringPreparation: 'Déplacement pendant la préparation (0–1)',
  radius: 'Rayon (cases)', innerRadius: 'Rayon intérieur (cases)', outerRadius: 'Rayon extérieur (cases)', range: 'Portée (cases)',
  angleDegrees: 'Angle (°)', width: 'Largeur (cases)', length: 'Longueur (cases)', speed: 'Vitesse (cases/s)',
  targetingRange: 'Portée de ciblage (cases)', distance: 'Distance (cases)', count: 'Nombre', x: 'Décalage X (cases)', y: 'Décalage Y (cases)',
  intervalSeconds: 'Intervalle (s)', maxHitsPerTarget: 'Coups maximum par cible', angularSpeedDegrees: 'Rotation (°/s)', followCaster: 'Suit le lanceur',
  durationSeconds: 'Durée (s)', wakeOnHit: 'Réveil à la réception de dégâts', damage: 'Dégâts', sizePixels: 'Taille (pixels)', color: 'Couleur',
  delaySeconds: 'Délai (s)', speedTilesPerSecond: 'Vitesse des particules (cases/s)', spreadDegrees: 'Dispersion (°)', trailLengthTiles: 'Longueur de traînée (cases)',
  layer: 'Couche', frameWidth: 'Largeur de frame (pixels)', frameHeight: 'Hauteur de frame (pixels)', frames: 'Nombre de frames',
  frameSeconds: 'Durée par frame (s)', path: 'Chemin local du sprite', credit: 'Crédit de l’artiste', license: 'Licence',
};
export function labelFor(key: string): string { return labels[key] ?? key; }
export function objectFields(parent: HTMLElement, context: FieldContext, path: EditorPath, value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'kind') continue;
    const childPath = [...path, key];
    if (Array.isArray(child)) {
      const group = section(key === 'offsets' ? 'Positions (cases)' : labelFor(key), parent);
      child.forEach((entry, index) => {
        const row = section(String(index + 1), group); objectFields(row, context, [...childPath, index], entry);
        row.append(action('Retirer', () => context.change(childPath, child.filter((_, current) => current !== index)), child.length <= 1));
      });
      group.append(action('Ajouter une position', () => context.change(childPath, [...child, { x: 0, y: 0 }]), child.length >= 16));
    } else if (child && typeof child === 'object') objectFields(section(labelFor(key), parent), context, childPath, child);
    else field(parent, context, childPath, labelFor(key), child);
  }
}
