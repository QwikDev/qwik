import { EMPTY_NODES } from './consts';
import { isPromise } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';

export type NodeOutput = Node | readonly Node[];
export type MaybeNodeOutput = NodeOutput | null | undefined;

export function toNodes(output: MaybeNodeOutput): readonly Node[] {
  if (output == null) {
    return EMPTY_NODES;
  }
  return Array.isArray(output) ? output : [output as Node];
}

/** Swaps a placeholder for an output's nodes once the output settles. */
export function replaceMarker(
  marker: ChildNode,
  output: ValueOrPromise<MaybeNodeOutput>
): ValueOrPromise<void> {
  if (isPromise(output)) {
    return output.then((nodes) => replaceMarker(marker, nodes));
  }
  marker.replaceWith(...toNodes(output));
}
