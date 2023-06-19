import { assertDefined, assertTrue } from '../../error/assert';
import { executeContextWithTransition, IS_HEAD, IS_SVG, SVG_NS } from './visitor';
import { getDocument } from '../../util/dom';
import { logError, logWarn } from '../../util/log';
import { getWrappingContainer } from '../../use/use-core';
import {
  runSubscriber,
  type SubscriberEffect,
  WatchFlagsIsDirty,
  WatchFlagsIsVisibleTask,
  WatchFlagsIsResource,
  WatchFlagsIsTask,
  isSubscriberDescriptor,
} from '../../use/use-task';
import { then } from '../../util/promises';
import type { ValueOrPromise } from '../../util/types';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import { renderComponent } from './render-dom';
import type { RenderContext } from '../types';
import { type ContainerState, _getContainerState } from '../../container/container';
import { createRenderContext } from '../execute-component';
import { getRootNode, type QwikElement } from './virtual-element';
import { appendChild, printRenderStats } from './operations';
import { executeSignalOperation } from './signals';
import { getPlatform, isServerPlatform } from '../../platform/platform';
import { qDev } from '../../util/qdev';
import type { SubscriberSignal, Subscriptions } from '../../state/common';
import { resumeIfNeeded } from '../../container/resume';
import { getContext, HOST_FLAG_DIRTY, type QContext } from '../../state/context';
import { directGetAttribute } from '../fast-calls';
import { QStyle } from '../../util/markers';

export const notifyChange = (subAction: Subscriptions, containerState: ContainerState) => {
  if (subAction[0] === 0) {
    const host = subAction[1];
    if (isSubscriberDescriptor(host)) {
      notifyWatch(host, containerState);
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
 * Use `notifyRender` method to mark a component for rendering at some later point in time.
 * This method uses `getPlatform(doc).queueRender` for scheduling of the rendering. The
 * default implementation of the method is to use `requestAnimationFrame` to do actual rendering.
 *
 * The method is intended to coalesce multiple calls into `notifyRender` into a single call for
 * rendering.
 *
 * @param hostElement - Host-element of the component to re-render.
 * @returns A promise which is resolved when the component has been rendered.
 *
 */
const notifyRender = (hostElement: QwikElement, containerState: ContainerState): void => {
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
};

const notifySignalOperation = (op: SubscriberSignal, containerState: ContainerState): void => {
  const activeRendering = containerState.$hostsRendering$ !== undefined;
  containerState.$opsNext$.add(op);
  if (!activeRendering) {
    scheduleFrame(containerState);
  }
};
export const notifyWatch = (watch: SubscriberEffect, containerState: ContainerState) => {
  if (watch.$flags$ & WatchFlagsIsDirty) {
    return;
  }
  watch.$flags$ |= WatchFlagsIsDirty;

  const activeRendering = containerState.$hostsRendering$ !== undefined;
  if (activeRendering) {
    containerState.$watchStaging$.add(watch);
  } else {
    containerState.$watchNext$.add(watch);
    scheduleFrame(containerState);
  }
};

const scheduleFrame = (containerState: ContainerState): Promise<void> => {
  if (containerState.$renderPromise$ === undefined) {
    containerState.$renderPromise$ = getPlatform().nextTick(() => renderMarked(containerState));
  }
  return containerState.$renderPromise$;
};

/**
 * Low-level API used by the Optimizer to process `useTask$()` API. This method
 * is not intended to be used by developers.
 *
 * @internal
 *
 */
export const _hW = () => {
  const [watch] = useLexicalScope<[SubscriberEffect]>();
  notifyWatch(watch, _getContainerState(getWrappingContainer(watch.$el$)!));
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
      executeSignalOperation(staticCtx, op);
    });

    // Add post operations
    staticCtx.$operations$.push(...staticCtx.$postOperations$);

    // Early exist, no dom operations
    if (staticCtx.$operations$.length === 0) {
      printRenderStats(staticCtx);
      await postRendering(containerState, rCtx);
      return;
    }

    await executeContextWithTransition(staticCtx);
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

  await executeTasksAfter(containerState, rCtx, (watch, stage) => {
    if ((watch.$flags$ & WatchFlagsIsVisibleTask) === 0) {
      return false;
    }
    if (stage) {
      return hostElements.has(watch.$el$);
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
    containerState.$watchNext$.size +
    containerState.$opsNext$.size;

  if (pending > 0) {
    // Immediately render again
    containerState.$renderPromise$ = renderMarked(containerState);
  }
};

const executeTasksBefore = async (containerState: ContainerState, rCtx: RenderContext) => {
  const containerEl = containerState.$containerEl$;
  const resourcesPromises: ValueOrPromise<SubscriberEffect>[] = [];
  const watchPromises: ValueOrPromise<SubscriberEffect>[] = [];
  const isWatch = (watch: SubscriberEffect) => (watch.$flags$ & WatchFlagsIsTask) !== 0;
  const isResourceWatch = (watch: SubscriberEffect) => (watch.$flags$ & WatchFlagsIsResource) !== 0;

  containerState.$watchNext$.forEach((watch) => {
    if (isWatch(watch)) {
      watchPromises.push(then(watch.$qrl$.$resolveLazy$(containerEl), () => watch));
      containerState.$watchNext$.delete(watch);
    }
    if (isResourceWatch(watch)) {
      resourcesPromises.push(then(watch.$qrl$.$resolveLazy$(containerEl), () => watch));
      containerState.$watchNext$.delete(watch);
    }
  });
  do {
    // Run staging effected
    containerState.$watchStaging$.forEach((watch) => {
      if (isWatch(watch)) {
        watchPromises.push(then(watch.$qrl$.$resolveLazy$(containerEl), () => watch));
      } else if (isResourceWatch(watch)) {
        resourcesPromises.push(then(watch.$qrl$.$resolveLazy$(containerEl), () => watch));
      } else {
        containerState.$watchNext$.add(watch);
      }
    });

    containerState.$watchStaging$.clear();

    // Wait for all promises
    if (watchPromises.length > 0) {
      const watches = await Promise.all(watchPromises);
      sortTasks(watches);
      await Promise.all(
        watches.map((watch) => {
          return runSubscriber(watch, containerState, rCtx);
        })
      );
      watchPromises.length = 0;
    }
  } while (containerState.$watchStaging$.size > 0);

  if (resourcesPromises.length > 0) {
    const resources = await Promise.all(resourcesPromises);
    sortTasks(resources);
    resources.forEach((watch) => runSubscriber(watch, containerState, rCtx));
  }
};

const executeTasksAfter = async (
  containerState: ContainerState,
  rCtx: RenderContext,
  watchPred: (watch: SubscriberEffect, staging: boolean) => boolean
) => {
  const watchPromises: ValueOrPromise<SubscriberEffect>[] = [];
  const containerEl = containerState.$containerEl$;

  containerState.$watchNext$.forEach((watch) => {
    if (watchPred(watch, false)) {
      if (watch.$el$.isConnected) {
        watchPromises.push(then(watch.$qrl$.$resolveLazy$(containerEl), () => watch));
      }
      containerState.$watchNext$.delete(watch);
    }
  });
  do {
    // Run staging effected
    containerState.$watchStaging$.forEach((watch) => {
      if (watch.$el$.isConnected) {
        if (watchPred(watch, true)) {
          watchPromises.push(then(watch.$qrl$.$resolveLazy$(containerEl), () => watch));
        } else {
          containerState.$watchNext$.add(watch);
        }
      }
    });
    containerState.$watchStaging$.clear();

    // Wait for all promises
    if (watchPromises.length > 0) {
      const watches = await Promise.all(watchPromises);
      sortTasks(watches);
      for (const watch of watches) {
        runSubscriber(watch, containerState, rCtx);
      }
      watchPromises.length = 0;
    }
  } while (containerState.$watchStaging$.size > 0);
};

const sortNodes = (elements: QContext[]) => {
  elements.sort((a, b) =>
    a.$element$.compareDocumentPosition(getRootNode(b.$element$)) & 2 ? 1 : -1
  );
};

const sortTasks = (watches: SubscriberEffect[]) => {
  watches.sort((a, b) => {
    if (a.$el$ === b.$el$) {
      return a.$index$ < b.$index$ ? -1 : 1;
    }
    return (a.$el$.compareDocumentPosition(getRootNode(b.$el$)) & 2) !== 0 ? 1 : -1;
  });
};
