import { describe, expect, it } from 'vitest';
import {
  createSsrElementRecord,
  createSsrEventAttr,
  createSsrNodeId,
  createSsrRecord,
  createSsrRootRef,
  createSsrRootRefPath,
} from './output';
import { SsrOutputWriter } from './output-writer';

describe('SsrOutputWriter', () => {
  it('writes recursive output in order and materializes each record atomically', () => {
    const chunks: string[] = [];
    const writer = new SsrOutputWriter({ write: (chunk) => void chunks.push(chunk) });

    const result = writer.finish([
      'before',
      [createSsrRecord('<!r=', createSsrNodeId(3), ' ', createSsrRootRef(7), '>')],
      createSsrRootRefPath([4, 2]),
      'after',
    ]);

    expect(result).toBeUndefined();
    expect(chunks).toEqual(['before', '<!r=3 7>', '4 2', 'after']);
  });

  it('waits for each sink write before starting the next one', async () => {
    const chunks: string[] = [];
    let writesInFlight = 0;
    let maxWritesInFlight = 0;
    const writer = new SsrOutputWriter({
      write(chunk) {
        chunks.push(chunk);
        writesInFlight++;
        maxWritesInFlight = Math.max(maxWritesInFlight, writesInFlight);
        return Promise.resolve().then(() => {
          writesInFlight--;
        });
      },
    });

    await writer.finish(['first', createSsrRecord('second-', createSsrNodeId(1)), 'third']);

    expect(chunks).toEqual(['first', 'second-1', 'third']);
    expect(maxWritesInFlight).toBe(1);
  });

  it('materializes a typed event attribute in the element record write', () => {
    const chunks: string[] = [];
    const writer = new SsrOutputWriter({ write: (chunk) => void chunks.push(chunk) });

    writer.finish(
      createSsrElementRecord(
        'button',
        '<button',
        createSsrEventAttr('q-e:click', ['listener#handler#', createSsrRootRef(2)]),
        '>'
      )
    );

    expect(chunks).toEqual(['<button q-e:click="listener#handler#2">']);
  });

  it('stops after a rejected sink write', async () => {
    const error = new Error('sink failed');
    const chunks: string[] = [];
    const writer = new SsrOutputWriter({
      write(chunk) {
        chunks.push(chunk);
        return Promise.reject(error);
      },
    });

    await expect(writer.finish(['first', 'second'])).rejects.toBe(error);
    expect(chunks).toEqual(['first']);
  });
});
