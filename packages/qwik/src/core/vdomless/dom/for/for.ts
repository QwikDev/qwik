import { isDev } from '@qwik.dev/core/build';
import type { QRL } from '../../../shared/qrl/qrl.public';
import { isPromise, maybeThen } from '../../../shared/utils/promises';
import type { ValueOrPromise } from '../../../shared/utils/types';
import { Signal } from '../../reactive/signal';
import { readSourceValue, type Source } from '../../reactive/source';
import { runWithCollector, track } from '../../reactive/tracking';
import type { ContainerContext } from '../../runtime/container-context';
import { fastNextSibling } from '../../runtime/fast-getters';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newInvokeContext,
  type RuntimeInvokeContext,
} from '../../runtime/invoke-context';
import {
  createOwner,
  disposeOwner,
  registerSubscriberToOwner,
  type Owner,
} from '../../runtime/owner';
import { findForRowRanges } from '../../runtime/node-walker';
import type { ForBlockSubscriber } from '../../runtime/subscriber';
import { toNodes } from '../../utils/nodes';
import type { MaybeNodeOutput } from '../../utils/nodes';
import { ForBlockSubscription } from '../effect/effect';
import { SSRForBlockSubscription } from '../effect/ssr-effect';
import { getFunctionOrResolve } from '../../utils/qrl';
import { createContentRange, getRangeParent } from '../range/range';
import { EMPTY_ARRAY, NodeType } from '../../utils/consts';

export type ForKey = string | number;
type ForKeyFn<T> = (item: T, index: number) => ForKey;
type ForRenderItem<T> = T | Signal<T>;
type ForRenderIndex = number | Signal<number> | undefined;
type SsrForContext = ContainerContext & { nextId(): number };
type ForRenderFn<T> = (
  ctx: ContainerContext,
  item: ForRenderItem<T>,
  index: ForRenderIndex
) => MaybeNodeOutput;
type SsrForRenderFn<T> = (
  ctx: SsrForContext,
  rangeId: number,
  rowId: number,
  item: ForRenderItem<T>,
  index: ForRenderIndex
) => ValueOrPromise<string>;

const ROW_OPEN = 'r';
const ROW_CLOSE = '/r';

class RowRange {
  readonly nativeRange: Range;

  constructor(
    document: Document,
    readonly start: Comment,
    readonly end: Comment
  ) {
    this.nativeRange = document.createRange();
    this.refresh();
  }

  refresh(): void {
    this.nativeRange.setStartBefore(this.start);
    this.nativeRange.setEndAfter(this.end);
  }
}

export type RowDom = Element | RowRange;

/** ForRange represents a list-owned range in the DOM. */
export class ForRange {
  readonly nativeRange: Range;

  constructor(
    readonly document: Document,
    readonly start: Comment,
    readonly end: Comment
  ) {
    this.nativeRange = createContentRange(this.document, start, end);
  }

  clear(): void {
    const parent = getRangeParent(this.start, this.end);
    const replaceChildren = (parent as Node & { replaceChildren?: (...nodes: Node[]) => void })
      .replaceChildren;
    if (
      replaceChildren !== undefined &&
      parent.nodeType !== NodeType.DocumentFragment &&
      parent.firstChild === this.start &&
      parent.lastChild === this.end
    ) {
      replaceChildren.call(parent, this.start, this.end);
      return;
    }

    this.nativeRange.setStartAfter(this.start);
    this.nativeRange.setEndBefore(this.end);
    this.nativeRange.deleteContents();
  }
}

export class ForBlock<T = unknown> {
  keys: ForKey[] = [];
  rows: RowDom[] = [];
  owners: Array<Owner | null> = [];
  itemSignals: Array<Signal<T> | null> | null;
  indexSignals: Array<Signal<number> | null> | null;
  resumeItems: readonly T[] | null = null;
  readonly rowInvokeContext: RuntimeInvokeContext;

  constructor(
    readonly range: ForRange,
    readonly source: Source<readonly T[]>,
    readonly keyFn: ForKeyFn<T> | QRL<ForKeyFn<T>>,
    readonly renderFn: ForRenderFn<T> | QRL<ForRenderFn<T>>,
    readonly usesItemSignal: boolean,
    readonly usesIndexSignal: boolean,
    readonly listOwner: Owner,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container: ContainerContext
  ) {
    this.itemSignals = usesItemSignal ? [] : null;
    this.indexSignals = usesIndexSignal ? [] : null;
    this.rowInvokeContext = createRowInvokeContext(invokeContext, listOwner, container);
  }

  dispose(): void {
    this.keys = EMPTY_ARRAY;
    this.rows = EMPTY_ARRAY;
    this.owners = EMPTY_ARRAY;
    this.itemSignals = this.usesItemSignal ? EMPTY_ARRAY : null;
    this.indexSignals = this.usesIndexSignal ? EMPTY_ARRAY : null;
    disposeOwner(this.listOwner);
    this.range.clear();
  }

  run(subscription: ForBlockSubscription<T>): ValueOrPromise<void> {
    const keyFn = getFunctionOrResolve(this.keyFn, this.container);
    return maybeThen(keyFn, (keyFn) => {
      const renderFn = getFunctionOrResolve(this.renderFn, this.container);
      return maybeThen(renderFn, (renderFn) => this.reconcile(subscription, keyFn, renderFn));
    });
  }

  reconcile(
    subscription: ForBlockSubscription<T>,
    keyFn: ForKeyFn<T>,
    renderFn: ForRenderFn<T>
  ): void {
    const items = runWithCollector(subscription, () => {
      track(this.source);
      return readSourceValue(this.source) ?? EMPTY_ARRAY;
    }) as readonly T[];
    const nextLength = items.length;
    const nextKeys = new Array<ForKey>(nextLength);
    const seenKeys = isDev ? new Set<ForKey>() : null;

    for (let i = 0; i < nextLength; i++) {
      const key = keyFn(items[i], i);
      if (seenKeys !== null) {
        if (seenKeys.has(key)) {
          throw new Error(`Duplicate vdomless ForBlock key "${String(key)}".`);
        }
        seenKeys.add(key);
      }
      nextKeys[i] = key;
    }

    const needsResumeRows = this.resumeItems !== null;
    if (needsResumeRows) {
      this.resumeRows(keyFn);
    }

    const oldKeys = this.keys;
    const oldRows = this.rows;
    const oldOwners = this.owners;
    const oldItemSignals = this.itemSignals;
    const oldIndexSignals = this.indexSignals;
    const oldLength = oldKeys.length;

    // remove all case
    if (nextLength === 0) {
      this.range.clear();
      for (let i = 0; i < oldLength; i++) {
        const owner = oldOwners[i];
        if (owner !== null) {
          disposeOwner(owner);
        }
      }
      this.commitRows(
        EMPTY_ARRAY,
        EMPTY_ARRAY,
        EMPTY_ARRAY,
        this.usesItemSignal ? EMPTY_ARRAY : null,
        this.usesIndexSignal ? EMPTY_ARRAY : null
      );
      return;
    }

    const nextRows = new Array<RowDom>(nextLength);
    const nextOwners = new Array<Owner | null>(nextLength);
    const nextItemSignals = this.usesItemSignal ? new Array<Signal<T> | null>(nextLength) : null;
    const nextIndexSignals = this.usesIndexSignal
      ? new Array<Signal<number> | null>(nextLength)
      : null;

    // insert all case
    if (oldLength === 0) {
      const parent = getRangeParent(this.range.start, this.range.end);
      let insertParent: Node;
      let finalParent: Node;
      let finalNode: Node;
      let finalReference: Node | null = this.range.end;
      const fragment = this.container.document.createDocumentFragment();

      // detach parent if we can, this is the fastest way to insert all rows into the DOM
      const hostParent = parent.parentNode;
      if (
        hostParent !== null &&
        parent.firstChild === this.range.start &&
        parent.lastChild === this.range.end &&
        canDetachParent(parent)
      ) {
        finalParent = hostParent;
        finalNode = parent;
        finalReference = parent.nextSibling;
        hostParent.removeChild(parent);
        insertParent = parent;
      } else {
        finalParent = parent;
        finalNode = fragment;
        insertParent = fragment;
      }

      const insertBeforeReference = insertParent === parent ? this.range.end : null;

      for (let i = 0; i < nextLength; i++) {
        const row = this.createAndStoreRow(
          nextRows,
          nextOwners,
          nextItemSignals,
          nextIndexSignals,
          i,
          items[i],
          i,
          renderFn
        );
        insertOrMoveRow(insertParent, row, insertBeforeReference);
      }
      finalParent.insertBefore(finalNode, finalReference);

      this.commitRows(nextKeys, nextRows, nextOwners, nextItemSignals, nextIndexSignals);
      return;
    }

    let firstChanged = 0;
    while (
      firstChanged < oldLength &&
      firstChanged < nextLength &&
      oldKeys[firstChanged] === nextKeys[firstChanged] &&
      canRetainRow(
        needsResumeRows,
        oldItemSignals?.[firstChanged] ?? null,
        oldIndexSignals?.[firstChanged] ?? null,
        items[firstChanged],
        firstChanged
      )
    ) {
      this.retainRow(
        nextRows,
        nextOwners,
        nextItemSignals,
        nextIndexSignals,
        firstChanged,
        firstChanged,
        items[firstChanged]
      );
      firstChanged++;
    }

    let oldLast = oldLength - 1;
    let newLast = nextLength - 1;
    while (
      oldLast >= firstChanged &&
      newLast >= firstChanged &&
      oldKeys[oldLast] === nextKeys[newLast] &&
      canRetainRow(
        needsResumeRows,
        oldItemSignals?.[oldLast] ?? null,
        oldIndexSignals?.[oldLast] ?? null,
        items[newLast],
        newLast
      )
    ) {
      this.retainRow(
        nextRows,
        nextOwners,
        nextItemSignals,
        nextIndexSignals,
        newLast,
        oldLast,
        items[newLast]
      );
      oldLast--;
      newLast--;
    }

    if (oldLast < firstChanged) {
      const parent = getRangeParent(this.range.start, this.range.end);
      const reference: Node =
        newLast + 1 < nextLength ? firstRowNode(nextRows[newLast + 1]) : this.range.end;
      const fragment = this.container.document.createDocumentFragment();

      for (let i = firstChanged; i <= newLast; i++) {
        const row = this.createAndStoreRow(
          nextRows,
          nextOwners,
          nextItemSignals,
          nextIndexSignals,
          i,
          items[i],
          i,
          renderFn
        );
        insertOrMoveRow(fragment, row, null);
      }

      if (firstChanged <= newLast) {
        parent.insertBefore(fragment, reference);
      }

      this.commitRows(nextKeys, nextRows, nextOwners, nextItemSignals, nextIndexSignals);
      return;
    }

    if (newLast < firstChanged) {
      for (let i = firstChanged; i <= oldLast; i++) {
        removeRow(oldRows[i]);
        const owner = oldOwners[i];
        if (owner !== null) {
          disposeOwner(owner);
        }
      }

      this.commitRows(nextKeys, nextRows, nextOwners, nextItemSignals, nextIndexSignals);
      return;
    }

    const oldMiddleLength = oldLast - firstChanged + 1;
    const newMiddleLength = newLast - firstChanged + 1;
    const sources = new Int32Array(newMiddleLength);
    let moved = false;
    let lastRetainedNewIndex = 0;

    if (nextLength < 4 || (oldMiddleLength | newMiddleLength) < 32) {
      for (let oldIndex = firstChanged; oldIndex <= oldLast; oldIndex++) {
        let nextIndex = -1;
        for (let i = firstChanged; i <= newLast; i++) {
          if (sources[i - firstChanged] === 0 && oldKeys[oldIndex] === nextKeys[i]) {
            nextIndex = i;
            break;
          }
        }
        if (
          nextIndex !== -1 &&
          canRetainRow(
            needsResumeRows,
            oldItemSignals?.[oldIndex] ?? null,
            oldIndexSignals?.[oldIndex] ?? null,
            items[nextIndex],
            nextIndex
          )
        ) {
          this.retainRow(
            nextRows,
            nextOwners,
            nextItemSignals,
            nextIndexSignals,
            nextIndex,
            oldIndex,
            items[nextIndex]
          );
          sources[nextIndex - firstChanged] = oldIndex + 1;
          if (nextIndex < lastRetainedNewIndex) {
            moved = true;
          } else {
            lastRetainedNewIndex = nextIndex;
          }
        } else {
          removeRow(oldRows[oldIndex]);
          const owner = oldOwners[oldIndex];
          if (owner !== null) {
            disposeOwner(owner);
          }
        }
      }
    } else {
      const newIndexByKey = new Map<ForKey, number>();
      for (let i = firstChanged; i <= newLast; i++) {
        newIndexByKey.set(nextKeys[i], i);
      }

      for (let oldIndex = firstChanged; oldIndex <= oldLast; oldIndex++) {
        const nextIndex = newIndexByKey.get(oldKeys[oldIndex]);
        if (
          nextIndex !== undefined &&
          sources[nextIndex - firstChanged] === 0 &&
          canRetainRow(
            needsResumeRows,
            oldItemSignals?.[oldIndex] ?? null,
            oldIndexSignals?.[oldIndex] ?? null,
            items[nextIndex],
            nextIndex
          )
        ) {
          this.retainRow(
            nextRows,
            nextOwners,
            nextItemSignals,
            nextIndexSignals,
            nextIndex,
            oldIndex,
            items[nextIndex]
          );
          sources[nextIndex - firstChanged] = oldIndex + 1;
          if (nextIndex < lastRetainedNewIndex) {
            moved = true;
          } else {
            lastRetainedNewIndex = nextIndex;
          }
        } else {
          removeRow(oldRows[oldIndex]);
          const owner = oldOwners[oldIndex];
          if (owner !== null) {
            disposeOwner(owner);
          }
        }
      }
    }

    const parent = getRangeParent(this.range.start, this.range.end);
    let anchor: Node =
      newLast + 1 < nextLength ? firstRowNode(nextRows[newLast + 1]) : this.range.end;
    const keep = moved ? longestIncreasingSubsequencePositions(sources) : EMPTY_ARRAY;
    let keepIndex = keep.length - 1;

    for (let i = newMiddleLength - 1; i >= 0; i--) {
      const nextIndex = firstChanged + i;
      if (sources[i] === 0) {
        const row = this.createAndStoreRow(
          nextRows,
          nextOwners,
          nextItemSignals,
          nextIndexSignals,
          nextIndex,
          items[nextIndex],
          nextIndex,
          renderFn
        );
        insertOrMoveRow(parent, row, anchor);
      } else if (moved) {
        if (keepIndex < 0 || i !== keep[keepIndex]) {
          insertOrMoveRow(parent, nextRows[nextIndex], anchor);
        } else {
          keepIndex--;
        }
      }
      anchor = firstRowNode(nextRows[nextIndex]);
    }

    this.commitRows(nextKeys, nextRows, nextOwners, nextItemSignals, nextIndexSignals);
  }

  private resumeRows(keyFn: ForKeyFn<T>): void {
    const items =
      this.resumeItems ?? ((readSourceValue(this.source) ?? EMPTY_ARRAY) as readonly T[]);
    const rowRanges = findForRowRanges(this.range.start, this.range.end);
    const length = Math.min(items.length, rowRanges.length);
    const keys = new Array<ForKey>(length);
    const rows = new Array<RowDom>(length);
    const owners = new Array<Owner | null>(length);
    const itemSignals = this.usesItemSignal ? new Array<Signal<T> | null>(length) : null;
    const indexSignals = this.usesIndexSignal ? new Array<Signal<number> | null>(length) : null;

    for (let i = 0; i < length; i++) {
      keys[i] = keyFn(items[i], i);
      const rowRange = rowRanges[i];
      rows[i] = Array.isArray(rowRange)
        ? createRangeRow(this.container.document, rowRange[0], rowRange[1])
        : (rowRange as Element);
      owners[i] = null;
      if (itemSignals !== null) {
        itemSignals[i] = new Signal(items[i]);
      }
      if (indexSignals !== null) {
        indexSignals[i] = new Signal(i);
      }
    }

    this.commitRows(keys, rows, owners, itemSignals, indexSignals);
    this.resumeItems = null;
  }

  private commitRows(
    keys: ForKey[],
    rows: RowDom[],
    owners: Array<Owner | null>,
    itemSignals: Array<Signal<T> | null> | null,
    indexSignals: Array<Signal<number> | null> | null
  ): void {
    this.keys = keys;
    this.rows = rows;
    this.owners = owners;
    this.itemSignals = itemSignals;
    this.indexSignals = indexSignals;
  }

  private createAndStoreRow(
    rows: RowDom[],
    owners: Array<Owner | null>,
    itemSignals: Array<Signal<T> | null> | null,
    indexSignals: Array<Signal<number> | null> | null,
    nextIndex: number,
    item: T,
    index: number,
    renderFn: ForRenderFn<T>
  ): RowDom {
    const itemSignal = this.usesItemSignal ? new Signal(item) : null;
    const indexSignal = this.usesIndexSignal ? new Signal(index) : null;
    let nodes: MaybeNodeOutput;

    try {
      nodes = runWithCollector(
        null,
        invoke,
        this.rowInvokeContext,
        renderForRow<T>,
        renderFn,
        this.container,
        itemSignal ?? item,
        indexSignal ?? index
      );
    } catch (error) {
      const owner = this.rowInvokeContext.owner;
      if (owner !== null) {
        disposeOwner(owner);
        this.rowInvokeContext.owner = null;
      }
      throw error;
    }

    const row = createRowDom(this.container.document, nodes);
    const rowOwner = this.rowInvokeContext.owner;
    this.rowInvokeContext.owner = null;
    writeRowState(
      rows,
      owners,
      itemSignals,
      indexSignals,
      nextIndex,
      row,
      rowOwner,
      itemSignal,
      indexSignal
    );
    return row;
  }

  private retainRow(
    rows: RowDom[],
    owners: Array<Owner | null>,
    itemSignals: Array<Signal<T> | null> | null,
    indexSignals: Array<Signal<number> | null> | null,
    nextIndex: number,
    oldIndex: number,
    item: T
  ): void {
    const itemSignal = this.itemSignals?.[oldIndex] ?? null;
    const indexSignal = this.indexSignals?.[oldIndex] ?? null;

    writeRowState(
      rows,
      owners,
      itemSignals,
      indexSignals,
      nextIndex,
      this.rows[oldIndex],
      this.owners[oldIndex],
      itemSignal,
      indexSignal
    );

    if (itemSignal !== null) {
      itemSignal.value = item;
    }
    if (indexSignal !== null) {
      indexSignal.value = nextIndex;
    }
  }
}

export function createForBlock<T>(
  ctx: ContainerContext,
  range: ForRange,
  source: Source<readonly T[]>,
  keyFn: ForKeyFn<T> | QRL<ForKeyFn<T>>,
  renderFn: ForRenderFn<T> | QRL<ForRenderFn<T>>,
  usesItemSignal = true,
  usesIndexSignal = false
): ForBlockSubscriber {
  const listOwner = createOwner();
  const block = new ForBlock(
    range,
    source,
    keyFn,
    renderFn,
    usesItemSignal,
    usesIndexSignal,
    listOwner,
    getActiveInvokeContextOrNull(),
    ctx
  );
  return registerSubscriberToOwner(new ForBlockSubscription(block, ctx.scheduler));
}

function writeRowState<T>(
  rows: RowDom[],
  owners: Array<Owner | null>,
  itemSignals: Array<Signal<T> | null> | null,
  indexSignals: Array<Signal<number> | null> | null,
  nextIndex: number,
  row: RowDom,
  owner: Owner | null,
  itemSignal: Signal<T> | null,
  indexSignal: Signal<number> | null
): void {
  rows[nextIndex] = row;
  owners[nextIndex] = owner;
  if (itemSignal !== null) {
    itemSignals![nextIndex] = itemSignal;
  }
  if (indexSignal !== null) {
    indexSignals![nextIndex] = indexSignal;
  }
}

function renderForRow<T>(
  renderFn: ForRenderFn<T>,
  ctx: ContainerContext,
  item: ForRenderItem<T>,
  index: ForRenderIndex
): MaybeNodeOutput {
  return renderFn(ctx, item, index);
}

function createRowDom(document: Document, output: MaybeNodeOutput): RowDom {
  const nodes = toNodes(output);
  if (nodes.length === 1 && nodes[0].nodeType === NodeType.Element) {
    return nodes[0] as Element;
  }

  const fragment = document.createDocumentFragment();
  const start = document.createComment(ROW_OPEN);
  const end = document.createComment(ROW_CLOSE);
  fragment.appendChild(start);
  for (let i = 0; i < nodes.length; i++) {
    fragment.appendChild(nodes[i]);
  }
  fragment.appendChild(end);
  return createRangeRow(document, start, end);
}

function createRangeRow(document: Document, start: Comment, end: Comment): RowRange {
  return new RowRange(document, start, end);
}

function canDetachParent(parent: Node): boolean {
  const ownerDocument = parent.ownerDocument;
  return (
    ownerDocument !== null &&
    parent !== ownerDocument.documentElement &&
    parent !== ownerDocument.head &&
    parent !== ownerDocument.body
  );
}

function isRangeRow(row: RowDom): row is RowRange {
  return row instanceof RowRange;
}

function insertOrMoveRow(parent: Node, row: RowDom, reference: Node | null): void {
  if (isRangeRow(row)) {
    const first = rangeFirstNode(row);
    const last = rangeLastNode(row);
    if (last.parentNode === parent && fastNextSibling(last) === reference) {
      return;
    }

    let node: Node = first;
    while (true) {
      const next = fastNextSibling(node);
      parent.insertBefore(node, reference);
      if (node === last) {
        row.refresh();
        return;
      }
      node = next!;
    }
  } else {
    if (row.parentNode === parent && fastNextSibling(row) === reference) {
      return;
    }
    parent.insertBefore(row, reference);
  }
}

function removeRow(row: RowDom): void {
  if (isRangeRow(row)) {
    const first = rangeFirstNode(row);
    const last = rangeLastNode(row);
    const parent = first.parentNode!;

    let node: Node = first;
    while (true) {
      const next = fastNextSibling(node);
      parent.removeChild(node);
      if (node === last) {
        return;
      }
      node = next!;
    }
  } else {
    row.parentNode!.removeChild(row);
  }
}

function firstRowNode(row: RowDom): Node {
  return isRangeRow(row) ? rangeFirstNode(row) : row;
}

function rangeFirstNode(range: RowRange): Node {
  return range.start;
}

function rangeLastNode(range: RowRange): Node {
  return range.end;
}

function canRetainRow<T>(
  resumed: boolean,
  itemSignal: Signal<T> | null,
  indexSignal: Signal<number> | null,
  item: T,
  index: number
): boolean {
  return (
    !resumed ||
    ((itemSignal === null || Object.is(itemSignal.v, item)) &&
      (indexSignal === null || indexSignal.v === index))
  );
}

function longestIncreasingSubsequencePositions(values: Int32Array): number[] {
  const length = values.length;
  if (length === 0) {
    return [];
  }

  const tails: number[] = [];
  const prev = new Int32Array(length);
  prev.fill(-1);
  for (let i = 0; i < length; i++) {
    const value = values[i];
    if (value === 0) {
      continue;
    }
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (values[tails[mid]] < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    if (low > 0) {
      prev[i] = tails[low - 1];
    }
    tails[low] = i;
  }
  if (tails.length === 0) {
    return [];
  }

  const positions: number[] = [];
  let current = tails[tails.length - 1];
  while (current !== -1) {
    positions.push(current);
    current = prev[current];
  }
  positions.reverse();
  return positions;
}

function createRowInvokeContext(
  base: RuntimeInvokeContext | null,
  ownerHost: Owner | null,
  container: ContainerContext | undefined
): RuntimeInvokeContext {
  return newInvokeContext({
    owner: null,
    ownerHost,
    container: container ?? base?.container,
    idPrefix: base?.idPrefix,
    contextScope: base?.contextScope,
    localContextScope: base?.localContextScope,
    slotScope: base?.slotScope,
  });
}

// SSR

export class SSRForBlock<T = unknown> {
  constructor(
    readonly rangeId: number,
    readonly source: Source<readonly T[]>,
    readonly keyQrl: QRL<ForKeyFn<T>>,
    readonly renderQrl: QRL<SsrForRenderFn<T>>,
    readonly usesItemSignal: boolean,
    readonly usesIndexSignal: boolean,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container: SsrForContext
  ) {}

  run(): ValueOrPromise<string> {
    const subscription = registerSubscriberToOwner(new SSRForBlockSubscription(this));
    const listOwner = createOwner(subscription.owner);
    const keyFn = getFunctionOrResolve(this.keyQrl, this.container);
    return maybeThen(keyFn, (keyFn) => {
      const renderFn = getFunctionOrResolve(this.renderQrl, this.container);
      return maybeThen(renderFn, (renderFn) =>
        this.renderRows(subscription, listOwner, keyFn, renderFn)
      );
    });
  }

  private renderRows(
    subscription: SSRForBlockSubscription<T>,
    listOwner: Owner,
    keyFn: ForKeyFn<T>,
    renderFn: SsrForRenderFn<T>
  ): ValueOrPromise<string> {
    const items = runWithCollector(subscription, () => {
      track(this.source);
      return readSourceValue(this.source) ?? EMPTY_ARRAY;
    }) as readonly T[];
    const seenKeys = isDev ? new Set<ForKey>() : null;
    let html = '';

    const renderNext = (startIndex: number): ValueOrPromise<string> => {
      for (let i = startIndex; i < items.length; i++) {
        const item = items[i];
        const rowId = this.container.nextId();
        const key = keyFn(item, i);
        if (seenKeys !== null) {
          if (seenKeys.has(key)) {
            throw new Error(`Duplicate vdomless ForBlock key "${String(key)}".`);
          }
          seenKeys.add(key);
        }

        const itemSignal = this.usesItemSignal ? new Signal(item) : null;
        const indexSignal = this.usesIndexSignal ? new Signal(i) : null;
        const invokeContext = createRowInvokeContext(this.invokeContext, listOwner, this.container);
        let rowHtml: ValueOrPromise<string>;
        try {
          rowHtml = runWithCollector(null, () =>
            invoke(invokeContext, () =>
              renderFn(this.container, this.rangeId, rowId, itemSignal ?? item, indexSignal ?? i)
            )
          );
        } catch (error) {
          if (invokeContext.owner !== null) {
            disposeOwner(invokeContext.owner);
          }
          throw error;
        }

        if (isPromise(rowHtml)) {
          return rowHtml.then(
            (rowHtml) => {
              html += rowHtml;
              return renderNext(i + 1);
            },
            (error) => {
              if (invokeContext.owner !== null) {
                disposeOwner(invokeContext.owner);
              }
              throw error;
            }
          );
        }
        html += rowHtml;
      }

      return html;
    };

    return renderNext(0);
  }
}

export function renderSsrForBlock<T>(
  ctx: SsrForContext,
  rangeId: number,
  source: Source<readonly T[]>,
  keyQrl: QRL<ForKeyFn<T>>,
  renderQrl: QRL<SsrForRenderFn<T>>,
  usesItemSignal = true,
  usesIndexSignal = false
): ValueOrPromise<string> {
  const block = new SSRForBlock(
    rangeId,
    source,
    keyQrl,
    renderQrl,
    usesItemSignal,
    usesIndexSignal,
    getActiveInvokeContextOrNull(),
    ctx
  );
  return block.run();
}
