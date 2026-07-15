import { EMPTY_NODES } from './consts';

export type NodeOutput = Node | readonly Node[];
export type MaybeNodeOutput = NodeOutput | null | undefined;

export function toNodes(output: MaybeNodeOutput): readonly Node[] {
  if (output == null) {
    return EMPTY_NODES;
  }
  return Array.isArray(output) ? output : [output as Node];
}
