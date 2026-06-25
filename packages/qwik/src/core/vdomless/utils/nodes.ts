export type NodeOutput = Node | readonly Node[];
export type MaybeNodeOutput = NodeOutput | null | undefined;

export const EMPTY_NODES: readonly Node[] = [];

export function toNodes(output: MaybeNodeOutput): readonly Node[] {
  if (output == null) {
    return EMPTY_NODES;
  }
  return Array.isArray(output) ? output : [output as Node];
}
