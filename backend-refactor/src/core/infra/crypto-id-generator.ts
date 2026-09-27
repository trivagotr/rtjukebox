import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '../ports/id-generator.port.js';

export const cryptoIdGenerator: IdGenerator = { generate: randomUUID };
