import { describe, it, expect } from 'vitest';
import { splitVNodeData } from './vnode-utils';

describe('splitVNodeData', () => {
  it('should split DOM element vNodeData and virtual element vNodeData', () => {
    const input = '||=6`4||2{J=7`3|q:type|S}';
    const { elementVNodeData, virtualVNodeData } = splitVNodeData(input);
    expect(elementVNodeData).toBe('=6`4');
    expect(virtualVNodeData).toBe('2{J=7`3|q:type|S}');
  });

  it('should handle escaped characters in custom block for DOM element', () => {
    const input =
      '|||aria\\-labelledby|34`32=82||{{1||13A`33=5@i8_1<35[36^37||q:type|C}E|q:type|P?10AB~}';
    const { elementVNodeData, virtualVNodeData } = splitVNodeData(input);
    expect(elementVNodeData).toBe('|aria\\-labelledby|34`32=82');
    expect(virtualVNodeData).toBe('{{1||13A`33=5@i8_1<35[36^37||q:type|C}E|q:type|P?10AB~}');
  });
});
