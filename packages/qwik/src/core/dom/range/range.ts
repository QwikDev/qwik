import { OwnerFlags } from '../../reactive/flags';
import { isDev } from '@qwik.dev/core/build';
import type { ContainerContext } from '../../runtime/container-context';
import { whenRootInflated } from '../../runtime/container-context';
import { showsProjection, Owner } from '../../runtime/owner';
import type { ValueOrPromise } from '../../shared/utils/types';
import { createCommentWalker } from '../../runtime/node-walker';

export function findContainerNode<T>(
  container: ContainerContext,
  find: (root: Element | DocumentFragment) => T | null
): T | null {
  const live = find(container.element);
  if (live !== null) {
    return live;
  }
  const detached = container.state.detachedProjectionNodes;
  return detached === undefined ? null : find(detached);
}

export function prepareProjectionRanges(
  container: ContainerContext | undefined,
  start: Comment,
  end: Comment,
  owner: Owner | null
): ValueOrPromise<void> {
  if (
    container === undefined ||
    owner === null ||
    (owner.flags & OwnerFlags.ResumeProjection) === 0
  ) {
    return;
  }
  return restoreProjectionRanges(container, start, end, owner);
}

async function restoreProjectionRanges(
  container: ContainerContext,
  start: Comment,
  end: Comment,
  owner: Owner
): Promise<void> {
  const markers: Comment[] = [];
  const walker = createCommentWalker(getRangeParent(start, end) as Element | DocumentFragment);
  walker.currentNode = start;
  let node: Node | null;
  while ((node = walker.nextNode()) !== null && node !== end) {
    const marker = (node as Comment).data;
    if (marker.startsWith('s=') && marker.includes(',')) {
      markers.push(node as Comment);
    }
  }
  if (markers.length === 0) {
    owner.flags &= ~OwnerFlags.ResumeProjection;
    return;
  }
  const { ProjectionSubscription } = await import('../slot/slot');
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i];
    const parts = marker.data.slice(2).split(',');
    if (
      isDev &&
      (parts.length !== 2 ||
        !/^\d+$/.test(parts[0]) ||
        !/^\d+$/.test(parts[1]) ||
        !Number.isSafeInteger(Number(parts[0])) ||
        !Number.isSafeInteger(Number(parts[1])))
    ) {
      throw new Error('Invalid projection marker');
    }
    const id = Number(parts[1]);
    const subscription = await whenRootInflated(container, await container.getRoot(id));
    if (!(subscription instanceof ProjectionSubscription)) {
      throw new Error('Projection marker requires a projection subscription');
    }
    if (subscription.block !== null && subscription.block.start !== marker) {
      throw new Error('Projection marker references a different range');
    }
  }
  owner.flags &= ~OwnerFlags.ResumeProjection;
}

export function parkProjections(owner: Owner | null): void {
  if (showsProjection(owner)) {
    parkOwnerProjections(owner!, owner!);
  }
}

function parkOwnerProjections(owner: Owner, removedOwner: Owner): void {
  const projections = owner.shownProjections;
  if (Array.isArray(projections)) {
    for (let i = projections.length - 1; i >= 0; i--) {
      parkProjection(projections[i], removedOwner);
    }
  } else if (projections !== undefined) {
    parkProjection(projections, removedOwner);
  }
  const items = owner.items;
  if (items instanceof Owner) {
    parkOwnerProjections(items, removedOwner);
  } else if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item instanceof Owner) {
        parkOwnerProjections(item, removedOwner);
      }
    }
  }
}

function parkProjection(block: import('../slot/slot').ProjectionBlock, removedOwner: Owner): void {
  let host = block.host;
  while (host !== null && host !== removedOwner) {
    host = host.parent;
  }
  if (host !== removedOwner) {
    block.park();
  }
}

export function getRangeParent(start: Comment, end: Comment): Node {
  const parent = start.parentNode;
  if (isDev && (parent === null || parent !== end.parentNode)) {
    throw new Error('Range markers must share a parent');
  }
  return parent!;
}

export function replaceRange(
  document: Document,
  start: Comment,
  end: Comment,
  nodes: readonly Node[]
): void {
  // detached markers mean an ancestor already tore this range out of the DOM — nothing to do
  if (start.parentNode === null) {
    return;
  }
  // Created per operation and dropped: the browser fixes up every *live* Range on every DOM
  // mutation, so holding one per block taxes writes anywhere on the page.
  const range = document.createRange();
  range.setStartAfter(start);
  range.setEndBefore(end);
  range.deleteContents();

  if (nodes.length === 1) {
    range.insertNode(nodes[0]);
  } else if (nodes.length > 1) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < nodes.length; i++) {
      fragment.appendChild(nodes[i]);
    }
    range.insertNode(fragment);
  }
}
