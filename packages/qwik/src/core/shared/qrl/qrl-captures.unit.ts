import { afterEach, describe, expect, it } from 'vitest';
import { _capturesObj, invokeCaptured, setCaptures, withCaptures } from './qrl-captures';

afterEach(() => setCaptures(null));

describe('invokeCaptured', () => {
  it('keeps captures separate from arguments and preserves the receiver', () => {
    const captures = ['scope'];
    const receiver = { name: 'receiver' };
    const fn = function (this: typeof receiver, value: number) {
      expect(_capturesObj._).toBe(captures);
      expect(this).toBe(receiver);
      return value + 1;
    };

    expect(invokeCaptured(fn, captures, receiver, [7])).toBe(8);
  });

  it('leaves ambient captures untouched when no captures are supplied', () => {
    const captures = ['outer'];
    setCaptures(captures);
    expect(invokeCaptured(() => _capturesObj._, undefined, undefined, [])).toBe(captures);
    expect(invokeCaptured(() => _capturesObj._, null, undefined, [])).toBe(captures);
  });

  it('returns promises unchanged and propagates exceptions', () => {
    const pending = Promise.resolve('done');
    expect(invokeCaptured(() => pending, [], undefined, [])).toBe(pending);
    const failure = new Error('expression failed');
    expect(() =>
      invokeCaptured(
        () => {
          throw failure;
        },
        [],
        undefined,
        []
      )
    ).toThrow(failure);
  });

  it('keeps independently bound functions callable with their own captures', () => {
    const body = () => _capturesObj._?.[0];
    const first = withCaptures(body, ['first']);
    const second = withCaptures(body, ['second']);

    expect(first()).toBe('first');
    expect(second()).toBe('second');
    expect(first()).toBe('first');
    expect(first).not.toBe(second);
  });
});
