import type { InputOptions, PluginContext } from 'rollup';
import { qwikRollup, QwikRollupPlugin } from './rollup';

describe('rollup plugin', () => {
  let p: QwikRollupPlugin;
  let ctx: PluginContext;
  beforeEach(() => {
    ctx = {} as any;
  });

  it('error if no srcDir or src', async () => {
    p = qwikRollup();

    const inputOpts: InputOptions = {};

    try {
      const outputOpts = await p.outputOptions!.call(ctx, {} as any);
      throw new Error('should throw');
    } catch (e: any) {
      expect(e.message).toContain('Qwik plugin must have either a "srcDir" or "srcInputs" option.');
    }
  });

  it('error if no srcDir or srcInputs', async () => {
    p = qwikRollup();

    const inputOpts: InputOptions = {};

    try {
      const outputOpts = await p.buildStart!.call(ctx, {} as any);
      throw new Error('should throw');
    } catch (e: any) {
      expect(e.message).toContain('Qwik plugin must have either a "srcDir" or "srcInputs" option.');
    }
  });
});

export {};
