import { describe, expect, it } from 'vitest';
import type { ISsrNode } from './qwik-types';
import { VNodeDataFlag } from './types';
import {
  vNodeData_addTextSize,
  vNodeData_closeFragment,
  vNodeData_createSsrNodeReference,
  vNodeData_incrementElementCount,
  vNodeData_insertEmptyAttributes,
  vNodeData_openFragment,
  type VNodeData,
} from './vnode-data';

const reference = (vNodeData: VNodeData) =>
  vNodeData_createSsrNodeReference(null, vNodeData, 7, [], null);

/** A copy is a new array, so its reference comes from a full scan from index 1 */
const expectSameAsFullScan = (node: ISsrNode, vNodeData: VNodeData) => {
  const fullScan = reference(vNodeData.slice() as VNodeData);
  expect(node.id).toBe(fullScan.id);
  expect((node as any).attributesIndex).toBe((fullScan as any).attributesIndex);
};

describe('vNodeData_createSsrNodeReference', () => {
  it('returns the same reference as a full scan for many sibling fragments', () => {
    // `<div>{items.map((i) => <Inline>{i}</Inline>)} tail</div>` with `Inline` rendering `<b>`
    const vNodeData: VNodeData = [VNodeDataFlag.NONE];
    for (let i = 0; i < 100; i++) {
      vNodeData_openFragment(vNodeData, {});
      expectSameAsFullScan(reference(vNodeData), vNodeData);
      vNodeData_incrementElementCount(vNodeData);
      vNodeData_closeFragment(vNodeData);
      // a plain element between fragments grows the trailing element count in place
      vNodeData_incrementElementCount(vNodeData);
      expectSameAsFullScan(reference(vNodeData), vNodeData);
      vNodeData_incrementElementCount(vNodeData);
      expectSameAsFullScan(reference(vNodeData), vNodeData);
      if (i % 10 === 0) {
        vNodeData_addTextSize(vNodeData, 3);
        expectSameAsFullScan(reference(vNodeData), vNodeData);
      }
    }
  });

  it('reads only the new entries for the next sibling fragment', () => {
    let reads = 0;
    const vNodeData = new Proxy([VNodeDataFlag.NONE] as VNodeData, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) {
          reads++;
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const addInlineComponent = () => {
      vNodeData_openFragment(vNodeData, {});
      reads = 0;
      reference(vNodeData);
      vNodeData_incrementElementCount(vNodeData);
      vNodeData_closeFragment(vNodeData);
    };
    for (let i = 0; i < 1000; i++) {
      addInlineComponent();
    }
    // a full scan would read about 4,000 entries, the cursor a fixed few per sibling
    expect(reads).toBeLessThan(20);
  });

  it('scans from the start again after attributes are inserted', () => {
    const vNodeData: VNodeData = [VNodeDataFlag.NONE];
    for (let i = 0; i < 20; i++) {
      vNodeData_addTextSize(vNodeData, 1);
      vNodeData_incrementElementCount(vNodeData);
    }
    reference(vNodeData);
    vNodeData_insertEmptyAttributes(vNodeData);
    vNodeData_openFragment(vNodeData, {});
    expectSameAsFullScan(reference(vNodeData), vNodeData);
  });
});
