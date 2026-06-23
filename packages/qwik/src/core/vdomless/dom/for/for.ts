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
  getActiveOwner,
  registerSubscriberToOwner,
  runWithOwner,
  type Owner,
} from '../../runtime/owner';
import { findForRowRanges } from '../../runtime/node-walker';
import type { ForBlockSubscriber } from '../../runtime/subscriber';
import { ForBlockSubscription } from '../effect/effect';
import { SSRForBlockSubscription } from '../effect/ssr-effect';
import { getFunctionOrResolve } from '../qrl';
import { createContentRange, getRangeParent } from '../range/range';

export type ForKey = string | number;
type ForKeyFn<T> = (item: T, index: number) => ForKey;
type ForRenderItem<T> = T | Signal<T>;
type ForRenderIndex = number | Signal<number> | undefined;
type SsrForContext = ContainerContext & { nextId(): number };
type ForRenderFn<T> = (
  ctx: ContainerContext,
  item: ForRenderItem<T>,
  index: ForRenderIndex
) => readonly Node[];
type SsrForRenderFn<T> = (
  ctx: SsrForContext,
  rangeId: number,
  rowId: number,
  item: ForRenderItem<T>,
  index: ForRenderIndex
) => ValueOrPromise<string>;

const ELEMENT_NODE = 1;
const ROW_ATTR = 'q:row';
const ROW_OPEN = 'r';
const ROW_CLOSE = '/r';
const EMPTY_NODES: readonly Node[] = [];

export class ElementRowDom {
  constructor(
    readonly element: Element,
    readonly resumed = false
  ) {}
}

export class RangeRowDom {
  constructor(
    readonly start: Comment,
    readonly end: Comment,
    public pendingNodes: readonly Node[] | null,
    readonly resumed = false
  ) {}
}

export type RowDom = ElementRowDom | RangeRowDom;

interface CreatedRow<T> {
  dom: RowDom;
  owner: Owner | null;
  itemSignal: Signal<T> | null;
  indexSignal: Signal<number> | null;
}

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
  }

  dispose(): void {
    this.keys.length = 0;
    this.rows.length = 0;
    this.owners.length = 0;
    if (this.itemSignals !== null) {
      this.itemSignals.length = 0;
    }
    if (this.indexSignals !== null) {
      this.indexSignals.length = 0;
    }
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
      return readSourceValue(this.source) ?? EMPTY_NODES;
    }) as readonly T[];
    const nextLength = items.length;
    const nextKeys = new Array<ForKey>(nextLength);
    const seenKeys = isDev ? new Set<ForKey>() : null;

    for (let i = 0; i < nextLength; i++) {
      const key = runWithCollector(subscription, () =>
        invoke(this.invokeContext, keyFn, items[i], i)
      );
      if (isDev && seenKeys !== null) {
        if (seenKeys.has(key)) {
          throw new Error(`Duplicate vdomless ForBlock key "${String(key)}".`);
        }
        seenKeys.add(key);
      }
      nextKeys[i] = key;
    }

    if (this.resumeItems !== null) {
      this.resumeRows(keyFn);
    }

    const oldKeys = this.keys;
    const oldRows = this.rows;
    const oldOwners = this.owners;
    const oldItemSignals = this.itemSignals;
    const oldIndexSignals = this.indexSignals;
    const oldLength = oldKeys.length;

    if (nextLength === 0) {
      this.range.clear();
      for (let i = 0; i < oldLength; i++) {
        disposeRowOwner(oldOwners[i]);
      }
      this.keys = nextKeys;
      this.rows = [];
      this.owners = [];
      this.itemSignals = this.usesItemSignal ? [] : null;
      this.indexSignals = this.usesIndexSignal ? [] : null;
      return;
    }

    const nextRows = new Array<RowDom>(nextLength);
    const nextOwners = new Array<Owner | null>(nextLength);
    const nextItemSignals = this.usesItemSignal ? new Array<Signal<T> | null>(nextLength) : null;
    const nextIndexSignals = this.usesIndexSignal
      ? new Array<Signal<number> | null>(nextLength)
      : null;

    if (oldLength === 0) {
      const fragment = this.container.document.createDocumentFragment();

      for (let i = 0; i < nextLength; i++) {
        const row = this.createRow(items[i], i, renderFn);
        storeRow(
          nextRows,
          nextOwners,
          nextItemSignals,
          nextIndexSignals,
          i,
          row.dom,
          row.owner,
          row.itemSignal,
          row.indexSignal
        );
        insertOrMoveRow(this.container.document, fragment, row.dom, null);
      }

      getRangeParent(this.range.start, this.range.end).insertBefore(fragment, this.range.end);

      this.keys = nextKeys;
      this.rows = nextRows;
      this.owners = nextOwners;
      this.itemSignals = nextItemSignals;
      this.indexSignals = nextIndexSignals;
      return;
    }

    let start = 0;
    while (
      start < oldLength &&
      start < nextLength &&
      oldKeys[start] === nextKeys[start] &&
      canRetainRow(
        oldRows[start],
        oldItemSignals?.[start] ?? null,
        oldIndexSignals?.[start] ?? null,
        items[start],
        start
      )
    ) {
      this.retainRow(
        nextRows,
        nextOwners,
        nextItemSignals,
        nextIndexSignals,
        start,
        start,
        items[start]
      );
      start++;
    }

    let oldEnd = oldLength - 1;
    let nextEnd = nextLength - 1;
    while (
      oldEnd >= start &&
      nextEnd >= start &&
      oldKeys[oldEnd] === nextKeys[nextEnd] &&
      canRetainRow(
        oldRows[oldEnd],
        oldItemSignals?.[oldEnd] ?? null,
        oldIndexSignals?.[oldEnd] ?? null,
        items[nextEnd],
        nextEnd
      )
    ) {
      this.retainRow(
        nextRows,
        nextOwners,
        nextItemSignals,
        nextIndexSignals,
        nextEnd,
        oldEnd,
        items[nextEnd]
      );
      oldEnd--;
      nextEnd--;
    }

    if (oldEnd < start) {
      const parent = getRangeParent(this.range.start, this.range.end);
      const reference: Node =
        nextEnd + 1 < nextLength ? firstRowNode(nextRows[nextEnd + 1]) : this.range.end;
      const fragment = this.container.document.createDocumentFragment();

      for (let i = start; i <= nextEnd; i++) {
        const row = this.createRow(items[i], i, renderFn);
        storeRow(
          nextRows,
          nextOwners,
          nextItemSignals,
          nextIndexSignals,
          i,
          row.dom,
          row.owner,
          row.itemSignal,
          row.indexSignal
        );
        insertOrMoveRow(this.container.document, fragment, row.dom, null);
      }

      if (start <= nextEnd) {
        parent.insertBefore(fragment, reference);
      }

      this.keys = nextKeys;
      this.rows = nextRows;
      this.owners = nextOwners;
      this.itemSignals = nextItemSignals;
      this.indexSignals = nextIndexSignals;
      return;
    }

    if (nextEnd < start) {
      for (let i = start; i <= oldEnd; i++) {
        removeRow(oldRows[i]);
        disposeRowOwner(oldOwners[i]);
      }

      this.keys = nextKeys;
      this.rows = nextRows;
      this.owners = nextOwners;
      this.itemSignals = nextItemSignals;
      this.indexSignals = nextIndexSignals;
      return;
    }

    const middleLength = nextEnd - start + 1;
    const nextIndexByKey = new Map<ForKey, number>();
    const nextIndexNext = new Int32Array(middleLength);
    const oldIndexes = new Int32Array(middleLength);
    nextIndexNext.fill(-1);
    oldIndexes.fill(-1);

    for (let i = nextEnd; i >= start; i--) {
      const key = nextKeys[i];
      const nextIndex = nextIndexByKey.get(key);
      nextIndexNext[i - start] = nextIndex ?? -1;
      nextIndexByKey.set(key, i);
    }

    for (let i = start; i <= oldEnd; i++) {
      const key = oldKeys[i];
      const nextIndex = nextIndexByKey.get(key);
      if (nextIndex !== undefined && nextIndex !== -1) {
        if (
          canRetainRow(
            oldRows[i],
            oldItemSignals?.[i] ?? null,
            oldIndexSignals?.[i] ?? null,
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
            i,
            items[nextIndex]
          );
          oldIndexes[nextIndex - start] = i;
        } else {
          removeRow(oldRows[i]);
          disposeRowOwner(oldOwners[i]);
          const row = this.createRow(items[nextIndex], nextIndex, renderFn);
          storeRow(
            nextRows,
            nextOwners,
            nextItemSignals,
            nextIndexSignals,
            nextIndex,
            row.dom,
            row.owner,
            row.itemSignal,
            row.indexSignal
          );
        }
        nextIndexByKey.set(key, nextIndexNext[nextIndex - start]);
      } else {
        removeRow(oldRows[i]);
        disposeRowOwner(oldOwners[i]);
      }
    }

    for (let i = start; i <= nextEnd; i++) {
      if (!(i in nextRows)) {
        const row = this.createRow(items[i], i, renderFn);
        storeRow(
          nextRows,
          nextOwners,
          nextItemSignals,
          nextIndexSignals,
          i,
          row.dom,
          row.owner,
          row.itemSignal,
          row.indexSignal
        );
      }
    }

    const parent = getRangeParent(this.range.start, this.range.end);
    const reference: Node =
      nextEnd + 1 < nextLength ? firstRowNode(nextRows[nextEnd + 1]) : this.range.end;
    reorderRows(this.container.document, parent, nextRows, start, nextEnd, reference, oldIndexes);

    this.keys = nextKeys;
    this.rows = nextRows;
    this.owners = nextOwners;
    this.itemSignals = nextItemSignals;
    this.indexSignals = nextIndexSignals;
  }

  private resumeRows(keyFn: ForKeyFn<T>): void {
    const items =
      this.resumeItems ?? ((readSourceValue(this.source) ?? EMPTY_NODES) as readonly T[]);
    const rowRanges = findForRowRanges(this.range.start, this.range.end);
    const length = Math.min(items.length, rowRanges.length);

    this.keys = new Array<ForKey>(length);
    this.rows = new Array<RowDom>(length);
    this.owners = new Array<Owner | null>(length);
    this.itemSignals = this.usesItemSignal ? new Array<Signal<T> | null>(length) : null;
    this.indexSignals = this.usesIndexSignal ? new Array<Signal<number> | null>(length) : null;

    for (let i = 0; i < length; i++) {
      this.keys[i] = runWithCollector(null, () => invoke(this.invokeContext, keyFn, items[i], i));
      const rowRange = rowRanges[i];
      this.rows[i] = Array.isArray(rowRange)
        ? new RangeRowDom(rowRange[0], rowRange[1], null, true)
        : new ElementRowDom(rowRange as Element, true);
      this.owners[i] = null;
      if (this.itemSignals !== null) {
        this.itemSignals[i] = new Signal(items[i]);
      }
      if (this.indexSignals !== null) {
        this.indexSignals[i] = new Signal(i);
      }
    }

    this.resumeItems = null;
  }

  private createRow(item: T, index: number, renderFn: ForRenderFn<T>): CreatedRow<T> {
    const itemSignal = this.usesItemSignal ? new Signal(item) : null;
    const indexSignal = this.usesIndexSignal ? new Signal(index) : null;
    const invokeContext = createRowInvokeContext(this.invokeContext, null, this.container);
    const nodes = runWithCollector(null, () =>
      runWithOwner(this.listOwner, () =>
        invoke(invokeContext, () =>
          renderFn(invokeContext.container!, itemSignal ?? item, indexSignal ?? index)
        )
      )
    );

    return {
      owner: invokeContext.owner,
      itemSignal,
      indexSignal,
      dom: createRowDom(this.container.document, nodes ?? EMPTY_NODES),
    };
  }

  private retainRow(
    nextRows: RowDom[],
    nextOwners: Array<Owner | null>,
    nextItemSignals: Array<Signal<T> | null> | null,
    nextIndexSignals: Array<Signal<number> | null> | null,
    nextIndex: number,
    oldIndex: number,
    item: T
  ): void {
    const itemSignal = this.itemSignals?.[oldIndex] ?? null;
    const indexSignal = this.indexSignals?.[oldIndex] ?? null;

    storeRow(
      nextRows,
      nextOwners,
      nextItemSignals,
      nextIndexSignals,
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
  const listOwner = createOwner(getActiveOwner());
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

function storeRow<T>(
  nextRows: RowDom[],
  nextOwners: Array<Owner | null>,
  nextItemSignals: Array<Signal<T> | null> | null,
  nextIndexSignals: Array<Signal<number> | null> | null,
  nextIndex: number,
  row: RowDom,
  owner: Owner | null,
  itemSignal: Signal<T> | null,
  indexSignal: Signal<number> | null
): void {
  nextRows[nextIndex] = row;
  nextOwners[nextIndex] = owner;
  if (itemSignal !== null) {
    nextItemSignals![nextIndex] = itemSignal;
  }
  if (indexSignal !== null) {
    nextIndexSignals![nextIndex] = indexSignal;
  }
}

function createRowDom(document: Document, nodes: readonly Node[]): RowDom {
  if (nodes.length === 1 && nodes[0].nodeType === ELEMENT_NODE) {
    const element = nodes[0] as Element;
    element.setAttribute(ROW_ATTR, '');
    return new ElementRowDom(element);
  }

  return new RangeRowDom(
    document.createComment(ROW_OPEN),
    document.createComment(ROW_CLOSE),
    nodes
  );
}

function insertOrMoveRow(
  document: Document,
  parent: Node,
  row: RowDom,
  reference: Node | null
): void {
  if (row instanceof ElementRowDom) {
    if (row.element.parentNode === parent && fastNextSibling(row.element) === reference) {
      return;
    }
    parent.insertBefore(row.element, reference);
    return;
  }

  if (row.pendingNodes !== null) {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(row.start);
    for (let i = 0; i < row.pendingNodes.length; i++) {
      fragment.appendChild(row.pendingNodes[i]);
    }
    fragment.appendChild(row.end);
    row.pendingNodes = null;
    parent.insertBefore(fragment, reference);
    return;
  }

  if (row.end.parentNode === parent && fastNextSibling(row.end) === reference) {
    return;
  }

  let node: Node = row.start;
  while (true) {
    const next = fastNextSibling(node);
    parent.insertBefore(node, reference);
    if (node === row.end) {
      return;
    }
    node = next!;
  }
}

function removeRow(row: RowDom): void {
  if (row instanceof ElementRowDom) {
    row.element.parentNode!.removeChild(row.element);
    return;
  }

  const parent = row.start.parentNode!;

  let node: Node = row.start;
  while (true) {
    const next = fastNextSibling(node);
    parent.removeChild(node);
    if (node === row.end) {
      return;
    }
    node = next!;
  }
}

function disposeRowOwner(owner: Owner | null): void {
  if (owner !== null) {
    disposeOwner(owner);
  }
}

function canRetainRow<T>(
  row: RowDom,
  itemSignal: Signal<T> | null,
  indexSignal: Signal<number> | null,
  item: T,
  index: number
): boolean {
  return (
    !row.resumed ||
    ((itemSignal === null || Object.is(itemSignal.v, item)) &&
      (indexSignal === null || indexSignal.v === index))
  );
}

function firstRowNode(row: RowDom): Node {
  return row instanceof ElementRowDom ? row.element : row.start;
}

function reorderRows(
  document: Document,
  parent: Node,
  rows: RowDom[],
  start: number,
  end: number,
  reference: Node,
  oldIndexes: Int32Array
): void {
  const seq: number[] = [];
  const seqOffsets: number[] = [];
  for (let i = 0; i < oldIndexes.length; i++) {
    const oldIndex = oldIndexes[i];
    if (oldIndex !== -1) {
      seqOffsets.push(i);
      seq.push(oldIndex);
    }
  }

  const keep = new Uint8Array(oldIndexes.length);
  const positions = longestIncreasingSubsequencePositions(seq);
  for (let i = 0; i < positions.length; i++) {
    keep[seqOffsets[positions[i]]] = 1;
  }

  let anchor = reference;
  for (let i = end; i >= start; i--) {
    const offset = i - start;
    if (keep[offset] === 1) {
      anchor = firstRowNode(rows[i]);
      continue;
    }
    insertOrMoveRow(document, parent, rows[i], anchor);
    anchor = firstRowNode(rows[i]);
  }
}

function longestIncreasingSubsequencePositions(values: number[]): number[] {
  const length = values.length;
  if (length === 0) {
    return [];
  }

  const tails: number[] = [];
  const prev = new Array<number>(length).fill(-1);
  for (let i = 0; i < length; i++) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (values[tails[mid]] < values[i]) {
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
  owner: Owner | null,
  container: ContainerContext | undefined
): RuntimeInvokeContext {
  return newInvokeContext({
    owner,
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
      return readSourceValue(this.source) ?? EMPTY_NODES;
    }) as readonly T[];
    const seenKeys = isDev ? new Set<ForKey>() : null;
    let html = '';

    const renderNext = (startIndex: number): ValueOrPromise<string> => {
      for (let i = startIndex; i < items.length; i++) {
        const item = items[i];
        const rowId = this.container.nextId();
        const key = runWithCollector(subscription, () =>
          invoke(this.invokeContext, keyFn, item, i)
        );
        if (seenKeys !== null) {
          if (seenKeys.has(key)) {
            throw new Error(`Duplicate vdomless ForBlock key "${String(key)}".`);
          }
          seenKeys.add(key);
        }

        const owner = createOwner(listOwner);
        const itemSignal = this.usesItemSignal ? new Signal(item) : null;
        const indexSignal = this.usesIndexSignal ? new Signal(i) : null;
        const invokeContext = createRowInvokeContext(this.invokeContext, owner, this.container);
        const rowHtml = runWithCollector(null, () =>
          invoke(invokeContext, () =>
            renderFn(this.container, this.rangeId, rowId, itemSignal ?? item, indexSignal ?? i)
          )
        );

        if (isPromise(rowHtml)) {
          return rowHtml.then((rowHtml) => {
            html += rowHtml;
            return renderNext(i + 1);
          });
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
