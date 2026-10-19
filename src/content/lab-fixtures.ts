import rain from '../../content/lab-fixtures/lab-rain.json';
import orbit from '../../content/lab-fixtures/lab-orbit.json';
import ring from '../../content/lab-fixtures/lab-ring.json';
import arc from '../../content/lab-fixtures/lab-arc.json';
import waves from '../../content/lab-fixtures/lab-waves.json';
import cone from '../../content/lab-fixtures/lab-cone.json';
import line from '../../content/lab-fixtures/lab-line.json';
import { moveSchema } from './schemas.ts';

/** Validated technical demonstrations, intentionally outside the official move catalog. */
export const labFixtures = [rain, orbit, ring, arc, waves, cone, line].map(record => moveSchema.parse(record));
