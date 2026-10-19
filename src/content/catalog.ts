import { rawContent } from './manifest.ts';
import { validateContent } from './validate.ts';

export const content = validateContent(rawContent);
const playableField = content.dungeons.find((dungeon) => dungeon.id === 'awakening-woods');
if (!playableField) throw new Error('Missing required dungeon: awakening-woods');
export const field = playableField;
export const movementSettings = content.settings[0]!;
export { validateContent } from './validate.ts';
export type { Content, Species, Move, Ability, Item, Dungeon } from './schemas.ts';
