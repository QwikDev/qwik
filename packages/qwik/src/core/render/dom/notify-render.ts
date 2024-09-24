import { useLexicalScope } from '../../use/use-lexical-scope.public';
import { TaskFlags, type Task } from '../../use/use-task';
import { getDomContainer } from '../../v2/client/dom-container';
import type { VNode } from '../../v2/client/types';
import { ChoreType } from '../../v2/shared/scheduler';

/**
 * Low-level API used by the Optimizer to process `useTask$()` API. This method is not intended to
 * be used by developers.
 *
 * @internal
 */
export const _hW = () => {
  const [task] = useLexicalScope<[Task]>();
  const container = getDomContainer(task.$el$ as VNode);
  const type = task.$flags$ & TaskFlags.VISIBLE_TASK ? ChoreType.VISIBLE : ChoreType.TASK;
  container.$scheduler$(type, task);
};
