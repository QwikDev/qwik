/* eslint-disable no-console */
import type { Render } from '@builder.io/qwik/server';
import type { NodeStaticGeneratorOptions } from './types';
import { createNodeSystem } from './node-system';
import { staticGenerate } from '../generator/generate';

// @builder.io/qwik-city/static/node

/**
 * @alpha
 */
export async function qwikCityGenerate(render: Render, opts: NodeStaticGeneratorOptions) {
  try {
    const nodeSys = await createNodeSystem(opts);
    await staticGenerate(nodeSys, render);
  } catch (e) {
    console.error(e);
  }
}
