import { generate } from './node-generate';

export { generate } from './node-generate';

/**
 * @alpha
 * @deprecated Please use the `generate()` export instead.
 */
const qwikCityGenerate = generate;

export { qwikCityGenerate };

export type { NodeStaticGeneratorOptions } from './types';
