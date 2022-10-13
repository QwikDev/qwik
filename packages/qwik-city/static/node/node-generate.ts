/* eslint-disable no-console */
import type { NodeStaticGeneratorOptions } from './types';
import { createNodeSystem } from './node-system';
import { staticGenerate } from '../generator/generate';

// @builder.io/qwik-city/static/node

/**
 * @alpha
 */
export async function generate(opts: NodeStaticGeneratorOptions) {
  try {
    const nodeSys = await createNodeSystem(opts);
    await staticGenerate(nodeSys);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
