import type { Optimizer } from '../types';
import type { InputOption, OutputOptions, RollupOptions } from 'rollup';
import { clientRollupPlugin, serverRollupPlugin } from './plugins';

export async function createRollupOptions(optimizer: Optimizer) {
  const rollupOptions: RollupOptions = {
    input: await createClientRollupInputs(optimizer),
    output: [await createClientRollupOutput(optimizer), await createServerRollupOutput(optimizer)],
  };
  return rollupOptions;
}

export async function createClientRollupInputs(optimizer: Optimizer) {
  await optimizer.getTsconfig();
  const rollupInputs: InputOption = {};
  return rollupInputs;
}

export async function createClientRollupOutput(optimizer: Optimizer) {
  const clientOutput: OutputOptions = {
    plugins: [clientRollupPlugin(optimizer)],
  };

  return clientOutput;
}

export async function createServerRollupOutput(optimizer: Optimizer) {
  const serverOutput: OutputOptions = {
    plugins: [serverRollupPlugin(optimizer)],
  };

  return serverOutput;
}
