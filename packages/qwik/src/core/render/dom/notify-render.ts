import { _getContainerState, type ContainerState } from '../../container/container';
import { resumeIfNeeded } from '../../container/resume';
import { assertDefined, assertTrue } from '../../error/assert';
import { getPlatform, isServerPlatform } from '../../platform/platform';
import type { SubscriberSignal, Subscriptions } from '../../state/common';
import { HOST_FLAG_DIRTY, getContext, type QContext } from '../../state/context';
import { getWrappingContainer } from '../../use/use-core';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import {
  TaskFlagsIsDirty,
  TaskFlagsIsResource,
  TaskFlagsIsTask,
  TaskFlagsIsVisibleTask,
  isSubscriberDescriptor,
  runSubscriber,
  type SubscriberEffect,
} from '../../use/use-task';
import { getDocument } from '../../util/dom';
import { logError, logWarn } from '../../util/log';
import { QStyle } from '../../util/markers';
import { maybeThen } from '../../util/promises';
import { qDev } from '../../util/qdev';
import type { ValueOrPromise } from '../../util/types';
import { isDomContainer } from '../../v2/client/dom-container';
import type { VirtualVNode } from '../../v2/client/types';
import { vnode_isVNode } from '../../v2/client/vnode';
import type { Container2 } from '../../v2/shared/types';
import { createRenderContext } from '../execute-component';
import { directGetAttribute } from '../fast-calls';
import type { RenderContext } from '../types';
import { appendChild, printRenderStats } from './operations';
import { renderComponent } from './render-dom';
import { executeSignalOperation } from './signals';
import { getRootNode, type QwikElement } from './virtual-element';
import { IS_HEAD, IS_SVG, SVG_NS, executeContextWithScrollAndTransition } from './visitor';

export const notifyChange = (subAction: Subscriptions, containerState: ContainerState) => {
  if (subAction[0] === 0) {
    const host = subAction[1];
    if (isSubscriberDescriptor(host)) {
      notifyTask(host, containerState);
    } else {
      notifyRender(host, containerState);
    }
  } else {
    notifySignalOperation(subAction, containerState);
  }
};

/**
 * Mark component for rendering.
 *
 * Use `notifyRender` method to mark a component for rendering at some later point in time. This
 * method uses `getPlatform(doc).queueRender` for scheduling of the rendering. The default
 * implementation of the method is to use `requestAnimationFrame` to do actual rendering.
 *
 * The method is intended to coalesce multiple calls into `notifyRender` into a single call for
 * rendering.
 *
 * @param hostElement - Host-element of the component to re-render.
 * @returns A promise which is resolved when the component has been rendered.
 */
const notifyRender = (hostElement: QwikElement, containerState: ContainerState): void => {
  if (vnode_isVNode(hostElement)) {
    const container2 = containerState as any as Container2;
    container2.markComponentForRender(hostElement as unknown as VirtualVNode);
  } else {
    const server = isServerPlatform();
    if (!server) {
      resumeIfNeeded(containerState.$containerEl$);
    }

    const elCtx = getContext(hostElement, containerState);
    assertDefined(
      elCtx.$componentQrl$,
      `render: notified host element must have a defined $renderQrl$`,
      elCtx
    );
    if (elCtx.$flags$ & HOST_FLAG_DIRTY) {
      return;
    }
    elCtx.$flags$ |= HOST_FLAG_DIRTY;
    const activeRendering = containerState.$hostsRendering$ !== undefined;
    if (activeRendering) {
      containerState.$hostsStaging$.add(elCtx);
    } else {
      if (server) {
        logWarn('Can not rerender in server platform');
        return undefined;
      }
      containerState.$hostsNext$.add(elCtx);
      scheduleFrame(containerState);
    }
  }
};

const notifySignalOperation = (op: SubscriberSignal, containerState: ContainerState): void => {
  const activeRendering = containerState.$hostsRendering$ !== undefined;
  containerState.$opsNext$.add(op);
  if (!activeRendering) {
    scheduleFrame(containerState);
  }
};
export const notifyTask = (task: SubscriberEffect, containerState: ContainerState) => {
  if (task.$flags$ & TaskFlagsIsDirty) {
    return;
  }
  task.$flags$ |= TaskFlagsIsDirty;

  if (isDomContainer(containerState)) {
    // TODO @mhevery please add $state$ to the ContainerState type if this is correct
    (containerState as any).$tasks$.push(task);
    containerState.scheduleRender();
  } else {
    const activeRendering = containerState.$hostsRendering$ !== undefined;
    if (activeRendering) {
      containerState.$taskStaging$.add(task);
    } else {
      containerState.$taskNext$.add(task);
      scheduleFrame(containerState);
    }
  }
};

const scheduleFrame = (containerState: ContainerState): Promise<void> => {
  if (containerState.$renderPromise$ === undefined) {
    containerState.$renderPromise$ = getPlatform().nextTick(() => renderMarked(containerState));
  }
  return containerState.$renderPromise$;
};

/**
 * Low-level API used by the Optimizer to process `useTask$()` API. This method is not intended to
 * be used by developers.
 *
 * @internal
 */
export const _hW = () => {
  const [task] = useLexicalScope<[SubscriberEffect]>();
  notifyTask(task, _getContainerState(getWrappingContainer(task.$el$)!));
};

const renderMarked = async (containerState: ContainerState): Promise<void> => {
  const containerEl = containerState.$containerEl$;
  const doc = getDocument(containerEl);

  try {
    const rCtx = createRenderContext(doc, containerState);
    const staticCtx = rCtx.$static$;
    const hostsRendering = (containerState.$hostsRendering$ = new Set(containerState.$hostsNext$));
    containerState.$hostsNext$.clear();
    await executeTasksBefore(containerState, rCtx);

    containerState.$hostsStaging$.forEach((host) => {
      hostsRendering.add(host);
    });
    containerState.$hostsStaging$.clear();

    const signalOperations = Array.from(containerState.$opsNext$);
    containerState.$opsNext$.clear();

    const renderingQueue = Array.from(hostsRendering);
    sortNodes(renderingQueue);

    if (!containerState.$styleMoved$ && renderingQueue.length > 0) {
      containerState.$styleMoved$ = true;
      const parentJSON = containerEl === doc.documentElement ? doc.body : containerEl;
      parentJSON.querySelectorAll('style[q\\:style]').forEach((el) => {
        containerState.$styleIds$.add(directGetAttribute(el, QStyle)!);
        appendChild(staticCtx, doc.head, el);
      });
    }

    for (const elCtx of renderingQueue) {
      const el = elCtx.$element$;
      if (!staticCtx.$hostElements$.has(el)) {
        if (elCtx.$componentQrl$) {
          assertTrue(el.isConnected, 'element must be connected to the dom');
          staticCtx.$roots$.push(elCtx);
          try {
            await renderComponent(rCtx, elCtx, getFlags(el.parentElement));
          } catch (err) {
            if (qDev) {
              throw err;
            } else {
              logError(err);
            }
          }
        }
      }
    }

    signalOperations.forEach((op) => {
      executeSignalOperation(rCtx, op);
    });

    // Add post operations
    staticCtx.$operations$.push(...staticCtx.$postOperations$);

    // Early exist, no dom operations
    if (staticCtx.$operations$.length === 0) {
      printRenderStats(staticCtx);
      await postRendering(containerState, rCtx);
      return;
    }

    await executeContextWithScrollAndTransition(staticCtx);
    printRenderStats(staticCtx);
    return postRendering(containerState, rCtx);
  } catch (err) {
    logError(err);
  }
};

const getFlags = (el: Element | null) => {
  let flags = 0;
  if (el) {
    if (el.namespaceURI === SVG_NS) {
      flags |= IS_SVG;
    }
    if (el.tagName === 'HEAD') {
      flags |= IS_HEAD;
    }
  }
  return flags;
};

export const postRendering = async (containerState: ContainerState, rCtx: RenderContext) => {
  const hostElements = rCtx.$static$.$hostElements$;

  await executeTasksAfter(containerState, rCtx, (task, stage) => {
    if ((task.$flags$ & TaskFlagsIsVisibleTask) === 0) {
      return false;
    }
    if (stage) {
      return hostElements.has(task.$el$);
    }
    return true;
  });

  // Clear staging
  containerState.$hostsStaging$.forEach((el) => {
    containerState.$hostsNext$.add(el);
  });
  containerState.$hostsStaging$.clear();

  containerState.$hostsRendering$ = undefined;
  containerState.$renderPromise$ = undefined;

  const pending =
    containerState.$hostsNext$.size +
    containerState.$taskNext$.size +
    containerState.$opsNext$.size;

  if (pending > 0) {
    // Immediately render again
    containerState.$renderPromise$ = renderMarked(containerState);
  }
};

const isTask = (task: SubscriberEffect) => (task.$flags$ & TaskFlagsIsTask) !== 0;
const isResourceTask = (task: SubscriberEffect) => (task.$flags$ & TaskFlagsIsResource) !== 0;
const executeTasksBefore = async (containerState: ContainerState, rCtx: RenderContext) => {
  const containerEl = containerState.$containerEl$;
  const resourcesPromises: ValueOrPromise<SubscriberEffect>[] = [];
  const taskPromises: ValueOrPromise<SubscriberEffect>[] = [];

  containerState.$taskNext$.forEach((task) => {
    if (isTask(task)) {
      taskPromises.push(maybeThen(task.$qrl$.$resolveLazy$(containerEl), () => task));
      containerState.$taskNext$.delete(task);
    }
    if (isResourceTask(task)) {
      resourcesPromises.push(maybeThen(task.$qrl$.$resolveLazy$(containerEl), () => task));
      containerState.$taskNext$.delete(task);
    }
  });
  do {
    // Run staging effected
    containerState.$taskStaging$.forEach((task) => {
      if (isTask(task)) {
        taskPromises.push(maybeThen(task.$qrl$.$resolveLazy$(containerEl), () => task));
      } else if (isResourceTask(task)) {
        resourcesPromises.push(maybeThen(task.$qrl$.$resolveLazy$(containerEl), () => task));
      } else {
        containerState.$taskNext$.add(task);
      }
    });

    containerState.$taskStaging$.clear();

    // Wait for all promises
    if (taskPromises.length > 0) {
      const tasks = await Promise.all(taskPromises);
      sortTasks(tasks);
      await Promise.all(
        tasks.map((task) => {
          return runSubscriber(task, containerState, rCtx);
        })
      );
      taskPromises.length = 0;
    }
  } while (containerState.$taskStaging$.size > 0);

  if (resourcesPromises.length > 0) {
    const resources = await Promise.all(resourcesPromises);
    sortTasks(resources);
    // no await so these run concurrently with the rendering
    for (const task of resources) {
      runSubscriber(task, containerState, rCtx);
    }
  }
};

/** Execute tasks that are dirty during SSR render */
export const executeSSRTasks = (containerState: ContainerState, rCtx: RenderContext) => {
  const containerEl = containerState.$containerEl$;
  const staging = containerState.$taskStaging$;
  if (!staging.size) {
    return;
  }
  const taskPromises: ValueOrPromise<SubscriberEffect>[] = [];

  let tries = 20;
  const runTasks = () => {
    // SSR dirty tasks are in taskStaging
    staging.forEach((task) => {
      console.error('task', task.$qrl$.$symbol$);
      if (isTask(task)) {
        taskPromises.push(maybeThen(task.$qrl$.$resolveLazy$(containerEl), () => task));
      }
      // We ignore other types of tasks, they are handled via waitOn
    });

    staging.clear();

    // Wait for all promises
    if (taskPromises.length > 0) {
      return Promise.all(taskPromises).then(async (tasks): Promise<unknown> => {
        sortTasks(tasks);
        await Promise.all(
          tasks.map((task) => {
            return runSubscriber(task, containerState, rCtx);
          })
        );
        taskPromises.length = 0;
        if (--tries && staging.size > 0) {
          return runTasks();
        }
        if (!tries) {
          logWarn(
            `Infinite task loop detected. Tasks:\n${Array.from(staging)
              .map((task) => `  ${task.$qrl$.$symbol$}`)
              .join('\n')}`
          );
        }
      });
    }
  };
  return runTasks();
};

const executeTasksAfter = async (
  containerState: ContainerState,
  rCtx: RenderContext,
  taskPred: (task: SubscriberEffect, staging: boolean) => boolean
) => {
  const taskPromises: ValueOrPromise<SubscriberEffect>[] = [];
  const containerEl = containerState.$containerEl$;

  containerState.$taskNext$.forEach((task) => {
    if (taskPred(task, false)) {
      if (task.$el$.isConnected) {
        taskPromises.push(maybeThen(task.$qrl$.$resolveLazy$(containerEl), () => task));
      }
      containerState.$taskNext$.delete(task);
    }
  });
  do {
    // Run staging effected
    containerState.$taskStaging$.forEach((task) => {
      if (task.$el$.isConnected) {
        if (taskPred(task, true)) {
          taskPromises.push(maybeThen(task.$qrl$.$resolveLazy$(containerEl), () => task));
        } else {
          containerState.$taskNext$.add(task);
        }
      }
    });
    containerState.$taskStaging$.clear();

    // Wait for all promises
    if (taskPromises.length > 0) {
      const tasks = await Promise.all(taskPromises);
      sortTasks(tasks);
      for (const task of tasks) {
        runSubscriber(task, containerState, rCtx);
      }
      taskPromises.length = 0;
    }
  } while (containerState.$taskStaging$.size > 0);
};

const sortNodes = (elements: QContext[]) => {
  elements.sort((a, b) =>
    a.$element$.compareDocumentPosition(getRootNode(b.$element$)) & 2 ? 1 : -1
  );
};

const sortTasks = (tasks: SubscriberEffect[]) => {
  tasks.sort((a, b) => {
    if (a.$el$ === b.$el$) {
      return a.$index$ < b.$index$ ? -1 : 1;
    }
    return (a.$el$.compareDocumentPosition(getRootNode(b.$el$)) & 2) !== 0 ? 1 : -1;
  });
};
