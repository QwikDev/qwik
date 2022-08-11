import type { Render } from '@builder.io/qwik/server';
import type {
  Logger,
  NormalizedStaticGeneratorOptions,
  StaticWorkerRenderConfig,
  StaticWorkerRenderResult,
  System,
} from './types';

export async function workerRender(
  opts: NormalizedStaticGeneratorOptions,
  log: Logger,
  sys: System,
  render: Render,
  config: StaticWorkerRenderConfig
) {
  const res: StaticWorkerRenderResult = {
    anchorPathnames: [],
  };

  return res;
}
