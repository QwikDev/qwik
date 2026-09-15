import { describe, expect, it } from 'vitest';
import { _deserialize, _serialize } from './standalone';
import { PropSource } from '../../component/props';

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
