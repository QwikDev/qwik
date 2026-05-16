import { describe, expect, test } from 'vitest';
import type { Container } from '../shared/types';
import { getEffectSerializationContainer } from './utils';

const createRoot = (): Container => {
  return {
    $rootContainer$: null,
    $isOutOfOrderSegment$: false,
  } as Container;
};

const createSegment = (root: Container, isOutOfOrderSegment = true): Container => {
  return {
    $rootContainer$: root,
    $isOutOfOrderSegment$: isOutOfOrderSegment,
  } as unknown as Container;
};

describe('getEffectSerializationContainer', () => {
  test('uses the render container when the owner container is not known yet', () => {
    const renderContainer = createRoot();

    expect(getEffectSerializationContainer(renderContainer, null)).toBe(renderContainer);
  });

  test('keeps the owner container when the render container belongs to a different root', () => {
    const owner = createRoot();
    const otherRoot = createRoot();

    expect(getEffectSerializationContainer(otherRoot, owner)).toBe(owner);
  });

  test('uses the render container when it is an out-of-order segment for the owner root', () => {
    const owner = createRoot();
    const segment = createSegment(owner);

    expect(getEffectSerializationContainer(segment, owner)).toBe(segment);
  });

  test('uses the render container when it is marked as an out-of-order segment', () => {
    const owner = createRoot();
    const otherRoot = createRoot();
    const segment = createSegment(otherRoot);

    expect(getEffectSerializationContainer(segment, owner)).toBe(segment);
  });

  test('keeps the owner container when the child container is not an out-of-order segment', () => {
    const owner = createRoot();
    const child = createSegment(owner, false);

    expect(getEffectSerializationContainer(child, owner)).toBe(owner);
  });
});
