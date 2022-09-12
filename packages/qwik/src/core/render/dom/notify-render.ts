import { assertDefined, assertTrue } from '../../assert/assert';
import { executeContextWithSlots, IS_HEAD, IS_SVG, SVG_NS } from './visitor';
import { getContext, resumeIfNeeded } from '../../props/props';
import { getDocument } from '../../util/dom';
import { logError, logWarn } from '../../util/log';
import { getWrappingContainer } from '../../use/use-core';
import {
  runSubscriber,
  Subscriber,
  SubscriberDescriptor,
  WatchFlagsIsDirty,
  WatchFlagsIsEffect,
  WatchFlagsIsResource,
  WatchFlagsIsWatch,
} from '../../use/use-watch';
import { then } from '../../util/promises';
import type { ValueOrPromise } from '../../util/types';
import { codeToText, QError_errorWhileRendering } from '../../error/error';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import { isQwikElement } from '../../util/element';
import { renderComponent } from './render-dom';
import type { RenderStaticContext } from '../types';
import { ContainerState, getContainerState } from '../container';
import { createRenderContext } from '../execute-component';
import { getRootNode, QwikElement } from './virtual-element';
import { printRenderStats } from './operations';
import { getPlatform, isServer } from '../../platform/platform';

export const notifyChange = (subscriber: Subscriber, containerState: ContainerState) => {
  if (isQwikElement(subscriber)) {
    notifyRender(subscriber, containerState);
  } else {
    notifyWatch(subscriber, containerState);
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
 * @public
 */
const notifyRender = (hostElement: QwikElement, containerState: ContainerState): void => {
  const server = isServer();
  if (!server) {
    resumeIfNeeded(containerState.$containerEl$);
  }

  const ctx = getContext(hostElement);
  assertDefined(
    ctx.$renderQrl$,
    `render: notified host element must have a defined $renderQrl$`,
    ctx
  );
  if (ctx.$dirty$) {
    return;
  }
  ctx.$dirty$ = true;
  const activeRendering = containerState.$hostsRendering$ !== undefined;
  if (activeRendering) {
    assertDefined(
      containerState.$renderPromise$,
      'render: while rendering, $renderPromise$ must be defined',
      containerState
    );
    containerState.$hostsStaging$.add(hostElement);
  } else {
    if (server) {
      logWarn('Can not rerender in server platform');
      return undefined;
    }
    containerState.$hostsNext$.add(hostElement);
    scheduleFrame(containerState);
  }
};

export const notifyWatch = (watch: SubscriberDescriptor, containerState: ContainerState) => {
  if (watch.$flags$ & WatchFlagsIsDirty) {
    return;
  }
  watch.$flags$ |= WatchFlagsIsDirty;

  const activeRendering = containerState.$hostsRendering$ !== undefined;
  if (activeRendering) {
    assertDefined(
      containerState.$renderPromise$,
      'render: while rendering, $renderPromise$ must be defined',
      containerState
    );
    containerState.$watchStaging$.add(watch);
  } else {
    containerState.$watchNext$.add(watch);
    scheduleFrame(containerState);
  }
};

const scheduleFrame = (containerState: ContainerState): Promise<RenderStaticContext> => {
  if (containerState.$renderPromise$ === undefined) {
    containerState.$renderPromise$ = getPlatform().nextTick(() => renderMarked(containerState));
  }
  return containerState.$renderPromise$;
};

/**
 * Low-level API used by the Optimizer to process `useWatch$()` API. This method
 * is not intended to be used by developers.
 *
 * @internal
 *
 */
export const _hW = () => {
  const [watch] = useLexicalScope<[SubscriberDescriptor]>();
  notifyWatch(watch, getContainerState(getWrappingContainer(watch.$el$)!));
};

const renderMarked = async (containerState: ContainerState): Promise<void> => {
  const hostsRendering = (containerState.$hostsRendering$ = new Set(containerState.$hostsNext$));
  containerState.$hostsNext$.clear();
  await executeWatchesBefore(containerState);

  containerState.$hostsStaging$.forEach((host) => {
    hostsRendering.add(host);
  });
  containerState.$hostsStaging$.clear();

  const doc = getDocument(containerState.$containerEl$);
  const renderingQueue = Array.from(hostsRendering);
  sortNodes(renderingQueue);

  const ctx = createRenderContext(doc, containerState);
  const staticCtx = ctx.$static$;
  for (const el of renderingQueue) {
    if (!staticCtx.$hostElements$.has(el)) {
      const elCtx = getContext(el);
      if (elCtx.$renderQrl$) {
        assertTrue(el.isConnected, 'element must be connected to the dom');
        staticCtx.$roots$.push(elCtx);
        try {
          await renderComponent(ctx, elCtx, getFlags(el.parentElement));
        } catch (e) {
          logError(codeToText(QError_errorWhileRendering), e);
        }
      }
    }
  }

  // Add post operations
  staticCtx.$operations$.push(...staticCtx.$postOperations$);

  // Early exist, no dom operations
  if (staticCtx.$operations$.length === 0) {
    printRenderStats(staticCtx);
    postRendering(containerState, staticCtx);
    return;
  }

  return getPlatform().raf(() => {
    executeContextWithSlots(ctx);
    printRenderStats(staticCtx);
    postRendering(containerState, staticCtx);
    return;
  });
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

export const postRendering = async (containerState: ContainerState, ctx: RenderStaticContext) => {
  await executeWatchesAfter(containerState, (watch, stage) => {
    if ((watch.$flags$ & WatchFlagsIsEffect) === 0) {
      return false;
    }
    if (stage) {
      return ctx.$hostElements$.has(watch.$el$);
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

  if (containerState.$hostsNext$.size + containerState.$watchNext$.size > 0) {
    scheduleFrame(containerState);
  }
};

const executeWatchesBefore = async (containerState: ContainerState) => {
  const resourcesPromises: ValueOrPromise<SubscriberDescriptor>[] = [];
  const watchPromises: ValueOrPromise<SubscriberDescriptor>[] = [];
  const isWatch = (watch: SubscriberDescriptor) => (watch.$flags$ & WatchFlagsIsWatch) !== 0;
  const isResourceWatch = (watch: SubscriberDescriptor) =>
    (watch.$flags$ & WatchFlagsIsResource) !== 0;

  containerState.$watchNext$.forEach((watch) => {
    if (isWatch(watch)) {
      watchPromises.push(then(watch.$qrl$.$resolveLazy$(), () => watch));
      containerState.$watchNext$.delete(watch);
    }
    if (isResourceWatch(watch)) {
      resourcesPromises.push(then(watch.$qrl$.$resolveLazy$(), () => watch));
      containerState.$watchNext$.delete(watch);
    }
  });
  do {
    // Run staging effected
    containerState.$watchStaging$.forEach((watch) => {
      if (isWatch(watch)) {
        watchPromises.push(then(watch.$qrl$.$resolveLazy$(), () => watch));
      } else if (isResourceWatch(watch)) {
        resourcesPromises.push(then(watch.$qrl$.$resolveLazy$(), () => watch));
      } else {
        containerState.$watchNext$.add(watch);
      }
    });

    containerState.$watchStaging$.clear();

    // Wait for all promises
    if (watchPromises.length > 0) {
      const watches = await Promise.all(watchPromises);
      sortWatches(watches);
      await Promise.all(
        watches.map((watch) => {
          return runSubscriber(watch, containerState);
        })
      );
      watchPromises.length = 0;
    }
  } while (containerState.$watchStaging$.size > 0);

  if (resourcesPromises.length > 0) {
    const resources = await Promise.all(resourcesPromises);
    sortWatches(resources);
    resources.forEach((watch) => runSubscriber(watch, containerState));
  }
};

const executeWatchesAfter = async (
  containerState: ContainerState,
  watchPred: (watch: SubscriberDescriptor, staging: boolean) => boolean
) => {
  const watchPromises: ValueOrPromise<SubscriberDescriptor>[] = [];

  containerState.$watchNext$.forEach((watch) => {
    if (watchPred(watch, false)) {
      watchPromises.push(then(watch.$qrl$.$resolveLazy$(), () => watch));
      containerState.$watchNext$.delete(watch);
    }
  });
  do {
    // Run staging effected
    containerState.$watchStaging$.forEach((watch) => {
      if (watchPred(watch, true)) {
        watchPromises.push(then(watch.$qrl$.$resolveLazy$(), () => watch));
      } else {
        containerState.$watchNext$.add(watch);
      }
    });
    containerState.$watchStaging$.clear();

    // Wait for all promises
    if (watchPromises.length > 0) {
      const watches = await Promise.all(watchPromises);
      sortWatches(watches);
      await Promise.all(
        watches.map((watch) => {
          return runSubscriber(watch, containerState);
        })
      );
      watchPromises.length = 0;
    }
  } while (containerState.$watchStaging$.size > 0);
};

const sortNodes = (elements: QwikElement[]) => {
  elements.sort((a, b) => (a.compareDocumentPosition(getRootNode(b)) & 2 ? 1 : -1));
};

const sortWatches = (watches: SubscriberDescriptor[]) => {
  watches.sort((a, b) => {
    if (a.$el$ === b.$el$) {
      return a.$index$ < b.$index$ ? -1 : 1;
    }
    return (a.$el$.compareDocumentPosition(getRootNode(b.$el$)) & 2) !== 0 ? 1 : -1;
  });
};
