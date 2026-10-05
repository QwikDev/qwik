import { describe, expect, it } from 'vitest';
import {
  createSsrOpenTag,
  _createSsrSlotMarker,
  createSsrEventAttr,
  createSsrNodeId,
  createSsrMarkup,
  createSsrRootRef,
  createSsrRootRefPath,
} from './output';
import { SsrOutputWriter } from './output-writer';

describe('SsrOutputWriter', () => {
  it.each([
    [undefined, '<!s=3>'],
    [0, '<!s=3,0>'],
    [7, '<!s=3,7>'],
  ])('writes a slot marker with optional projection root %s', (rootId, expected) => {
    const chunks: string[] = [];
    const writer = new SsrOutputWriter({ write: (chunk) => void chunks.push(chunk) });
    writer.finish(_createSsrSlotMarker(3, rootId));
    expect(chunks.join('')).toBe(expected);
  });

  it('omits null markup parts while preserving references and event attributes', () => {
    const chunks: string[] = [];
    const writer = new SsrOutputWriter({ write: (chunk) => void chunks.push(chunk) });

    writer.finish(
      createSsrMarkup(
        null,
        '<button q:id="',
        createSsrNodeId(0),
        '"',
        null,
        createSsrEventAttr('q-e:click', ['listener#handler#', createSsrRootRef(2)]),
        '>',
        null
      )
    );

    expect(chunks).toEqual(['<button q:id="0" q-e:click="listener#handler#2">']);
  });

  it('does not write empty or null-only markup records', () => {
    const chunks: string[] = [];
    const writer = new SsrOutputWriter({ write: (chunk) => void chunks.push(chunk) });

    writer.finish([createSsrMarkup(), createSsrMarkup(null), createSsrMarkup(null, null)]);

    expect(chunks).toEqual([]);
  });

  it('writes recursive output in order and materializes each record atomically', () => {
    const chunks: string[] = [];
    const writer = new SsrOutputWriter({ write: (chunk) => void chunks.push(chunk) });

    const result = writer.finish([
      'before',
      [createSsrMarkup('<!r=', createSsrNodeId(3), ' ', createSsrRootRef(7), '>')],
      createSsrRootRefPath([4, 2]),
      'after',
    ]);

    expect(result).toBeUndefined();
    expect(chunks).toEqual(['before', '<!r=3 7>', '4 2', 'after']);
  });

  it('writes the prefix while a nested output promise is pending', async () => {
    let resolve!: (output: string) => void;
    const pending = new Promise<string>((done) => (resolve = done));
    const chunks: string[] = [];
    const writer = new SsrOutputWriter({ write: (chunk) => void chunks.push(chunk) });

    const writing = writer.finish(['prefix', [pending], 'tail']);
    expect(chunks).toEqual(['prefix']);
    resolve('async');
    await writing;
    expect(chunks).toEqual(['prefix', 'async', 'tail']);
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

    await writer.finish(['first', createSsrMarkup('second-', createSsrNodeId(1)), 'third']);

    expect(chunks).toEqual(['first', 'second-1', 'third']);
    expect(maxWritesInFlight).toBe(1);
  });

  it('materializes a typed event attribute in the element record write', () => {
    const chunks: string[] = [];
    const writer = new SsrOutputWriter({ write: (chunk) => void chunks.push(chunk) });

    writer.finish(
      createSsrOpenTag(
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
