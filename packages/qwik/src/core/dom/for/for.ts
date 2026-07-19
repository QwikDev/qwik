import { isDev } from '@qwik.dev/core/build';
import type { QRL } from '../../shared/qrl/qrl.public';
import { hashCode } from '../../shared/utils/hash_code';
import { isPromise, maybeThen, retryOnPromise } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
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
import type { SsrOutput } from '../../ssr/output';

export type ForKey = string | number;
export type RowOutputShape = 0 | 1 | 2 | 3;
export const ROW_ELEMENT = 0;
export const ROW_NODE = 1;
export const ROW_MANY = 2;
export const ROW_UNKNOWN = 3;
type ForKeyFn<T> = (item: T, index: number) => ForKey;
type ForRenderIndex = number | Signal<number> | undefined;
type SsrForContext = ContainerContext & { nextId(): number };
type ForRenderFn<T> = (
  ctx: ContainerContext,
  item: T,
  index: ForRenderIndex,
  id?: string
) => MaybeNodeOutput;
type SsrForRenderFn<T> = (
  ctx: SsrForContext,
  rangeId: number,
  rowId: number,
  item: T,
  index: ForRenderIndex,
  id?: string
) => ValueOrPromise<SsrOutput>;

const ROW_OPEN = 'r';
const ROW_CLOSE = '/r';

class RowRange {
  constructor(
    readonly start: Comment,
    readonly end: Comment
  ) {}
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
    this.nativeRange.setStartAfter(this.start);
    this.nativeRange.setEndBefore(this.end);
    this.nativeRange.deleteContents();
  }
}

export class ForBlock<T = unknown> {
  keys: ForKey[] = [];
  rows: RowDom[] = [];
  owners: Array<Owner | null> = [];
  indexSignals: Array<Signal<number> | null> | null;
  resumeIndexSignals: Array<Signal<number> | null> | null = null;
  resumeItems: readonly T[] | null = null;
  readonly rowInvokeContext: RuntimeInvokeContext;

  constructor(
    readonly range: ForRange,
    readonly source: Source<readonly T[]>,
    readonly keyFn: ForKeyFn<T> | QRL<ForKeyFn<T>>,
    readonly renderFn: ForRenderFn<T> | QRL<ForRenderFn<T>>,
    readonly usesIndexSignal: boolean,
    readonly listOwner: Owner,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container: ContainerContext,
    readonly idBase = '',
    readonly rowShape: RowOutputShape = ROW_UNKNOWN
  ) {
    this.indexSignals = usesIndexSignal ? [] : null;
    this.rowInvokeContext = createRowInvokeContext(invokeContext, listOwner, container);
  }

  dispose(): void {
    this.keys = EMPTY_ARRAY;
    this.rows = EMPTY_ARRAY;
    this.owners = EMPTY_ARRAY;
    this.indexSignals = this.usesIndexSignal ? EMPTY_ARRAY : null;
    disposeOwner(this.listOwner);
    this.range.clear();
  }

  run(subscription: ForBlockSubscription<T>): ValueOrPromise<void> {
    const keyFn = getFunctionOrResolve(this.keyFn, this.container);
    return maybeThen(keyFn, (keyFn) => {
      const renderFn = getFunctionOrResolve(this.renderFn, this.container);
      return maybeThen(renderFn, (renderFn) =>
        retryOnPromise(() => this.reconcile(subscription, keyFn, renderFn))
      );
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
      if (isDev) {
        if (typeof key !== 'string' && typeof key !== 'number') {
          throw new Error('ForBlock key must be a synchronous string or number.');
        }
        if (seenKeys!.has(key)) {
          throw new Error(`Duplicate ForBlock key "${String(key)}".`);
        }
        seenKeys!.add(key);
      }
      nextKeys[i] = key;
    }

    if (this.resumeItems !== null) {
      this.resumeRows(keyFn);
    }

    const oldKeys = this.keys;
    const oldRows = this.rows;
    const oldOwners = this.owners;
    const oldLength = oldKeys.length;

    // remove all case
    if (nextLength === 0) {
      if (oldLength > 0) {
        this.range.clear();
      }
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
        this.usesIndexSignal ? EMPTY_ARRAY : null
      );
      return;
    }

    const nextRows = new Array<RowDom>(nextLength);
    const nextOwners = new Array<Owner | null>(nextLength);
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
          nextIndexSignals,
          i,
          nextKeys[i],
          items[i],
          i,
          renderFn
        );
        insertOrMoveRow(insertParent, row, insertBeforeReference);
      }
      finalParent.insertBefore(finalNode, finalReference);

      this.commitRows(nextKeys, nextRows, nextOwners, nextIndexSignals);
      return;
    }

    let firstChanged = 0;
    while (
      firstChanged < oldLength &&
      firstChanged < nextLength &&
      oldKeys[firstChanged] === nextKeys[firstChanged]
    ) {
      this.retainRow(nextRows, nextOwners, nextIndexSignals, firstChanged, firstChanged);
      firstChanged++;
    }

    let oldLast = oldLength - 1;
    let newLast = nextLength - 1;
    while (
      oldLast >= firstChanged &&
      newLast >= firstChanged &&
      oldKeys[oldLast] === nextKeys[newLast]
    ) {
      this.retainRow(nextRows, nextOwners, nextIndexSignals, newLast, oldLast);
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
          nextIndexSignals,
          i,
          nextKeys[i],
          items[i],
          i,
          renderFn
        );
        insertOrMoveRow(fragment, row, null);
      }

      if (firstChanged <= newLast) {
        parent.insertBefore(fragment, reference);
      }

      this.commitRows(nextKeys, nextRows, nextOwners, nextIndexSignals);
      return;
    }

    if (newLast < firstChanged) {
      const range = this.range.nativeRange;
      range.setStartBefore(firstRowNode(oldRows[firstChanged]));
      range.setEndAfter(lastRowNode(oldRows[oldLast]));
      range.deleteContents();
      for (let i = firstChanged; i <= oldLast; i++) {
        const owner = oldOwners[i];
        if (owner !== null) {
          disposeOwner(owner);
        }
      }

      this.commitRows(nextKeys, nextRows, nextOwners, nextIndexSignals);
      return;
    }

    const oldMiddleLength = oldLast - firstChanged + 1;
    const newMiddleLength = newLast - firstChanged + 1;
    const useLinearLookup = nextLength < 4 || (oldMiddleLength | newMiddleLength) < 32;
    let newIndexByKey: Map<ForKey, number> | null = null;
    let shouldReplaceAll =
      firstChanged === 0 && oldLast === oldLength - 1 && newLast === nextLength - 1;

    if (!useLinearLookup) {
      newIndexByKey = new Map<ForKey, number>();
      for (let i = firstChanged; i <= newLast; i++) {
        newIndexByKey.set(nextKeys[i], i);
      }
    }
    if (shouldReplaceAll) {
      for (let i = 0; i < oldLength; i++) {
        if (
          useLinearLookup ? nextKeys.indexOf(oldKeys[i]) !== -1 : newIndexByKey!.has(oldKeys[i])
        ) {
          shouldReplaceAll = false;
          break;
        }
      }
    }

    if (shouldReplaceAll) {
      this.replaceAllRows(items, nextKeys, nextRows, nextOwners, nextIndexSignals, renderFn);
      return;
    }

    const sources = new Int32Array(newMiddleLength);
    let moved = false;
    let lastRetainedNewIndex = 0;

    if (useLinearLookup) {
      for (let oldIndex = firstChanged; oldIndex <= oldLast; oldIndex++) {
        let nextIndex = -1;
        for (let i = firstChanged; i <= newLast; i++) {
          if (sources[i - firstChanged] === 0 && oldKeys[oldIndex] === nextKeys[i]) {
            nextIndex = i;
            break;
          }
        }
        if (nextIndex !== -1) {
          this.retainRow(nextRows, nextOwners, nextIndexSignals, nextIndex, oldIndex);
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
      for (let oldIndex = firstChanged; oldIndex <= oldLast; oldIndex++) {
        const nextIndex = newIndexByKey!.get(oldKeys[oldIndex]);
        if (nextIndex !== undefined && sources[nextIndex - firstChanged] === 0) {
          this.retainRow(nextRows, nextOwners, nextIndexSignals, nextIndex, oldIndex);
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
          nextIndexSignals,
          nextIndex,
          nextKeys[nextIndex],
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

    this.commitRows(nextKeys, nextRows, nextOwners, nextIndexSignals);
  }

  private replaceAllRows(
    items: readonly T[],
    nextKeys: ForKey[],
    nextRows: RowDom[],
    nextOwners: Array<Owner | null>,
    nextIndexSignals: Array<Signal<number> | null> | null,
    renderFn: ForRenderFn<T>
  ): void {
    const parent = replaceForRangeParent(this.range);
    const fragment = parent === null ? this.container.document.createDocumentFragment() : null;
    const insertParent = parent ?? fragment!;
    const reference = parent === null ? null : this.range.end;
    for (let i = 0; i < nextKeys.length; i++) {
      const row = this.createAndStoreRow(
        nextRows,
        nextOwners,
        nextIndexSignals,
        i,
        nextKeys[i],
        items[i],
        i,
        renderFn
      );
      insertOrMoveRow(insertParent, row, reference);
    }

    if (fragment !== null) {
      this.range.nativeRange.setStartAfter(this.range.start);
      this.range.nativeRange.setEndBefore(this.range.end);
      this.range.nativeRange.deleteContents();
      this.range.nativeRange.insertNode(fragment);
    }
    for (let i = 0; i < this.owners.length; i++) {
      const owner = this.owners[i];
      if (owner !== null) {
        disposeOwner(owner);
      }
    }
    this.commitRows(nextKeys, nextRows, nextOwners, nextIndexSignals);
  }

  private resumeRows(keyFn: ForKeyFn<T>): void {
    const items =
      this.resumeItems ?? ((readSourceValue(this.source) ?? EMPTY_ARRAY) as readonly T[]);
    const rowRanges = findForRowRanges(this.range.start, this.range.end);
    const length = Math.min(items.length, rowRanges.length);
    const keys = new Array<ForKey>(length);
    const rows = new Array<RowDom>(length);
    const owners = new Array<Owner | null>(length);
    const indexSignals = this.usesIndexSignal ? new Array<Signal<number> | null>(length) : null;

    for (let i = 0; i < length; i++) {
      const key = keyFn(items[i], i);
      if (typeof key !== 'string' && typeof key !== 'number') {
        throw new Error('ForBlock key must be a synchronous string or number.');
      }
      keys[i] = key;
      const rowRange = rowRanges[i];
      rows[i] = Array.isArray(rowRange)
        ? createRangeRow(rowRange[0], rowRange[1])
        : (rowRange as Element);
      owners[i] = null;
      if (indexSignals !== null) {
        indexSignals[i] = this.resumeIndexSignals?.[i] ?? new Signal(i);
      }
    }

    this.commitRows(keys, rows, owners, indexSignals);
    this.resumeItems = null;
    this.resumeIndexSignals = null;
  }

  private commitRows(
    keys: ForKey[],
    rows: RowDom[],
    owners: Array<Owner | null>,
    indexSignals: Array<Signal<number> | null> | null
  ): void {
    this.keys = keys;
    this.rows = rows;
    this.owners = owners;
    this.indexSignals = indexSignals;
  }

  private createAndStoreRow(
    rows: RowDom[],
    owners: Array<Owner | null>,
    indexSignals: Array<Signal<number> | null> | null,
    nextIndex: number,
    key: ForKey,
    item: T,
    index: number,
    renderFn: ForRenderFn<T>
  ): RowDom {
    const indexSignal = this.usesIndexSignal ? new Signal(index) : null;
    let nodes: MaybeNodeOutput;

    try {
      nodes = runWithCollector(
        null,
        invoke,
        this.rowInvokeContext,
        renderFn,
        this.container,
        item,
        indexSignal ?? index,
        createRowId(this.idBase, key)
      );
    } catch (error) {
      disposeInvokeOwner(this.rowInvokeContext);
      throw error;
    }

    const row = createRowDom(this.container.document, nodes, this.rowShape);
    const rowOwner = this.rowInvokeContext.owner;
    this.rowInvokeContext.owner = null;
    rows[nextIndex] = row;
    owners[nextIndex] = rowOwner;
    if (indexSignal !== null) {
      indexSignals![nextIndex] = indexSignal;
    }
    return row;
  }

  private retainRow(
    rows: RowDom[],
    owners: Array<Owner | null>,
    indexSignals: Array<Signal<number> | null> | null,
    nextIndex: number,
    oldIndex: number
  ): void {
    const indexSignal = this.indexSignals?.[oldIndex] ?? null;

    rows[nextIndex] = this.rows[oldIndex];
    owners[nextIndex] = this.owners[oldIndex];
    if (indexSignal !== null) {
      indexSignals![nextIndex] = indexSignal;
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
  usesIndexSignal = false,
  idBase = '',
  rowShape: RowOutputShape = ROW_UNKNOWN
): ForBlockSubscriber {
  const listOwner = createOwner();
  const block = new ForBlock(
    range,
    source,
    keyFn,
    renderFn,
    usesIndexSignal,
    listOwner,
    getActiveInvokeContextOrNull(),
    ctx,
    idBase,
    rowShape
  );
  return registerSubscriberToOwner(new ForBlockSubscription(block, ctx.scheduler));
}

function createRowDom(
  document: Document,
  output: MaybeNodeOutput,
  rowShape: RowOutputShape
): RowDom {
  if (rowShape === ROW_ELEMENT) {
    return output as Element;
  }

  let normalized: readonly Node[] | null = null;
  if (rowShape === ROW_UNKNOWN) {
    normalized = toNodes(output);
    if (normalized.length === 1 && normalized[0].nodeType === NodeType.Element) {
      return normalized[0] as Element;
    }
  }

  const fragment = document.createDocumentFragment();
  const start = document.createComment(ROW_OPEN);
  const end = document.createComment(ROW_CLOSE);
  fragment.appendChild(start);
  appendRowOutput(fragment, normalized ?? output, normalized === null ? rowShape : ROW_MANY);
  fragment.appendChild(end);
  return createRangeRow(start, end);
}

export function appendRowOutput(
  parent: Node,
  output: MaybeNodeOutput,
  rowShape: RowOutputShape
): void {
  if (rowShape === ROW_ELEMENT || rowShape === ROW_NODE) {
    parent.appendChild(output as Node);
    return;
  }
  const nodes = rowShape === ROW_MANY ? (output as readonly Node[]) : toNodes(output);
  for (let i = 0; i < nodes.length; i++) {
    parent.appendChild(nodes[i]);
  }
}

function createRangeRow(start: Comment, end: Comment): RowRange {
  return new RowRange(start, end);
}

function replaceForRangeParent(range: ForRange): Node | null {
  const parent = getRangeParent(range.start, range.end);
  const replaceChildren = (parent as Node & { replaceChildren?: (...nodes: Node[]) => void })
    .replaceChildren;
  if (
    replaceChildren === undefined ||
    parent.firstChild !== range.start ||
    parent.lastChild !== range.end
  ) {
    return null;
  }

  replaceChildren.call(parent);
  parent.appendChild(range.start);
  parent.appendChild(range.end);
  return parent;
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
    const first = row.start;
    const last = row.end;
    if (last.parentNode === parent && fastNextSibling(last) === reference) {
      return;
    }

    let node: Node = first;
    while (true) {
      const next = fastNextSibling(node);
      parent.insertBefore(node, reference);
      if (node === last) {
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
    const first = row.start;
    const last = row.end;
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
  return isRangeRow(row) ? row.start : row;
}

function lastRowNode(row: RowDom): Node {
  return isRangeRow(row) ? row.end : row;
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
    contextScope: base?.contextScope,
    localContextScope: base?.localContextScope,
    slotScope: base?.slotScope,
  });
}

function disposeInvokeOwner(context: RuntimeInvokeContext): void {
  if (context.owner !== null) {
    disposeOwner(context.owner);
    context.owner = null;
  }
}

// SSR

export class SSRForBlock<T = unknown> {
  readonly indexSignals: Signal<number>[] | null;

  constructor(
    readonly rangeId: number,
    readonly source: Source<readonly T[]>,
    readonly keyQrl: QRL<ForKeyFn<T>>,
    readonly renderQrl: QRL<SsrForRenderFn<T>>,
    readonly usesIndexSignal: boolean,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container: SsrForContext,
    readonly idBase = '',
    readonly usesRowId = true,
    readonly rowShape: RowOutputShape = ROW_UNKNOWN
  ) {
    this.indexSignals = usesIndexSignal ? [] : null;
  }

  run(): ValueOrPromise<SsrOutput> {
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
  ): ValueOrPromise<SsrOutput> {
    const items = runWithCollector(subscription, () => {
      track(this.source);
      return readSourceValue(this.source) ?? EMPTY_ARRAY;
    }) as readonly T[];
    const seenKeys = isDev ? new Set<ForKey>() : null;
    const output: SsrOutput[] = [];

    const renderNext = (startIndex: number): ValueOrPromise<SsrOutput> => {
      for (let i = startIndex; i < items.length; i++) {
        const item = items[i];
        const key = keyFn(item, i);
        if (isDev) {
          if (typeof key !== 'string' && typeof key !== 'number') {
            throw new Error('ForBlock key must be a synchronous string or number.');
          }
          if (seenKeys !== null) {
            if (seenKeys.has(key)) {
              throw new Error(`Duplicate ForBlock key "${String(key)}".`);
            }
            seenKeys.add(key);
          }
        }

        const rowId = this.usesRowId ? this.container.nextId() : 0;
        const indexSignal = this.usesIndexSignal ? new Signal(i) : null;
        if (indexSignal !== null) {
          this.indexSignals!.push(indexSignal);
        }
        const invokeContext = createRowInvokeContext(this.invokeContext, listOwner, this.container);
        let rowOutput: ValueOrPromise<SsrOutput>;
        try {
          rowOutput = runWithCollector(
            null,
            invoke,
            invokeContext,
            renderFn,
            this.container,
            this.rangeId,
            rowId,
            item,
            indexSignal ?? i,
            createRowId(this.idBase, key)
          );
        } catch (error) {
          disposeInvokeOwner(invokeContext);
          throw error;
        }

        if (isPromise(rowOutput)) {
          return Promise.resolve(rowOutput).then(
            (rowOutput) => {
              output.push(rowOutput);
              return renderNext(i + 1);
            },
            (error) => {
              disposeInvokeOwner(invokeContext);
              throw error;
            }
          );
        }
        output.push(rowOutput);
      }

      return finalizeSsrRows(output);
    };

    return renderNext(0);
  }
}

function createRowId(idBase: string, key: ForKey): string {
  return idBase === '' ? '' : `${idBase}${hashCode(String(key))}-`;
}

export function finalizeSsrRows(output: SsrOutput[]): SsrOutput {
  if (output.every((row) => typeof row === 'string')) {
    return (output as string[]).join('');
  }
  return output;
}

export function renderSsrForBlock<T>(
  ctx: SsrForContext,
  rangeId: number,
  source: Source<readonly T[]>,
  keyQrl: QRL<ForKeyFn<T>>,
  renderQrl: QRL<SsrForRenderFn<T>>,
  usesIndexSignal = false,
  idBase = '',
  usesRowId = true,
  rowShape: RowOutputShape = ROW_UNKNOWN
): ValueOrPromise<SsrOutput> {
  const block = new SSRForBlock(
    rangeId,
    source,
    keyQrl,
    renderQrl,
    usesIndexSignal,
    getActiveInvokeContextOrNull(),
    ctx,
    idBase,
    usesRowId,
    rowShape
  );
  return block.run();
}
