import { describe, expect, it } from 'vitest';
import { _deserialize, _serialize } from './standalone';
import { PropSource } from '../../component/props';
import { _noopQrl, _qrlWithChunk } from '../qrl/qrl';
import { isQrl } from '../qrl/qrl-utils';

describe('standalone serialization', () => {
  it('round-trips a plain payload', async () => {
    const data = { d: { query: '123', hash: 'NONE' } };

    expect(await _deserialize(await _serialize(data))).toEqual(data);
  });

  it('round-trips repeated values that dedupe into root-ref paths', async () => {
    const data = { d: { query: 'NONE', hash: 'NONE' } };

    expect(await _deserialize(await _serialize(data))).toEqual(data);
  });

  it('round-trips repeated values across arrays', async () => {
    const data = { arrayOld: ['0', '1'], arrayNew: ['0', '1'], people: [{ name: 'Fred' }] };

    expect(await _deserialize(await _serialize(data))).toEqual(data);
  });

  describe('a resolved segment body', () => {
    const body = () => 'segment body';
    const roundTrip = async (value: unknown) =>
      ((await _deserialize(await _serialize([value]))) as unknown[])[0];

    it('keeps the identity of a capture-less body', async () => {
      const qrl = _noopQrl<typeof body>('capture_less_hash');
      (qrl as unknown as { s: (ref: typeof body) => void }).s(body);

      expect(isQrl(await roundTrip(await qrl.resolve()))).toBe(true);
    });

    it('keeps the identity of a body bound to captures', async () => {
      const qrl = _noopQrl<typeof body>('captured_hash');
      (qrl as unknown as { s: (ref: typeof body) => void }).s(body);
      const bound = (qrl as unknown as { w: (c: unknown[]) => typeof qrl }).w(['a']);

      expect(isQrl(await roundTrip(await bound.resolve()))).toBe(true);
    });

    it('keeps the identity of a body that arrived through its chunk', async () => {
      const qrl = _qrlWithChunk<typeof body>(
        './chunk.js',
        () => Promise.resolve({ imported_hash: body }),
        'imported_hash'
      );

      expect(isQrl(await roundTrip(await qrl.resolve()))).toBe(true);
    });
  });

  it('round-trips a prop source bound to its record', async () => {
    const props = { title: 'Hello', items: [1, 2, 3] };
    const [restored, record] = (await _deserialize(
      await _serialize([new PropSource(props, 'title'), props])
    )) as [PropSource, typeof props];

    expect(restored).toBeInstanceOf(PropSource);
    expect(restored.props).toBe(record);
    expect(restored.v).toBe('Hello');
  });
});
