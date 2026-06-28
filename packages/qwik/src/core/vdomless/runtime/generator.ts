import type { CollectorSubscriber } from './subscriber';
import { runWithCollector } from '../reactive/tracking';

export async function drainGenerator(
  collector: CollectorSubscriber,
  generator: Generator<unknown>
): Promise<unknown> {
  let input: unknown;
  let rejected = false;
  while (true) {
    let step: IteratorResult<unknown>;
    try {
      step = runWithCollector(collector, () =>
        rejected ? generator.throw!(input) : generator.next(input)
      );
    } catch (error) {
      await closeGenerator(generator);
      throw error;
    }

    if (step.done) {
      return step.value;
    }

    try {
      input = await step.value;
      rejected = false;
    } catch (error) {
      if (typeof generator.throw !== 'function') {
        throw error;
      }
      input = error;
      rejected = true;
    }
  }
}

async function closeGenerator(generator: Generator<unknown>): Promise<void> {
  if (typeof generator.return !== 'function') {
    return;
  }
  await generator.return(undefined);
}
