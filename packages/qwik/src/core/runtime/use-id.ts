import { getActiveInvokeContextOrNull } from './invoke-context';

/**
 * A unique id per render environment: the server counts per request, the client per container, and
 * the prefix keeps the two apart after resume.
 *
 * @public
 */
export const useId = (): string => {
  const context = getActiveInvokeContextOrNull();
  if (context?.ids !== undefined) {
    return 's' + (context.ids.next++).toString(36);
  }
  const state = context?.container?.state;
  if (state === undefined) {
    throw new Error('useId() must be called while a component renders.');
  }
  state.nextUseId ??= 0;
  return 'c' + (state.nextUseId++).toString(36);
};
