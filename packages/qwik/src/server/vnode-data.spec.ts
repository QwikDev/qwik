import { describe, expect, it } from 'vitest';
import { VNodeDataFlag } from './types';
import {
  vNodeData_addTextSize,
  vNodeData_closeFragment,
  vNodeData_createSsrNodeReference,
  vNodeData_incrementElementCount,
  vNodeData_openElement,
  vNodeData_openFragment,
  type VNodeData,
} from './vnode-data';

const createReference = (vNodeData: VNodeData) =>
  vNodeData_createSsrNodeReference(null, vNodeData, 0, [], null);

describe('vNodeData_createSsrNodeReference', () => {
  it('matches a fresh scan while siblings keep being appended', () => {
    const vNodeData: VNodeData = [VNodeDataFlag.NONE];
    for (let i = 0; i < 100; i++) {
      vNodeData_openFragment(vNodeData, {});
      const reference = createReference(vNodeData);
      const freshReference = createReference([...vNodeData] as VNodeData);
      expect(reference.id).toBe(freshReference.id);
      expect((reference as any).attributesIndex).toBe((freshReference as any).attributesIndex);

      vNodeData_openElement(vNodeData);
      vNodeData_incrementElementCount(vNodeData);
      // Reference taken while the trailing element count is still growing.
      expect(createReference(vNodeData).id).toBe(createReference([...vNodeData] as VNodeData).id);
      vNodeData_incrementElementCount(vNodeData);
      vNodeData_addTextSize(vNodeData, i % 3);
      vNodeData_closeFragment(vNodeData);
      vNodeData_incrementElementCount(vNodeData);
      expect(createReference(vNodeData).id).toBe(createReference([...vNodeData] as VNodeData).id);
    }
  });
});
