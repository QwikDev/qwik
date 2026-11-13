import type { SsrContentContext } from '../../ssr/output';
import { OwnerFlags } from '../../reactive/flags';
import {
  getRangeParent,
  parkProjections,
  prepareProjectionRanges,
  replaceRange,
} from '../range/range';
import { isDev } from '@qwik.dev/core/build';
import type { QRL } from '../../shared/qrl/qrl.public';
import { isPromise, maybeThen, retryOnPromise, thenInLifetime } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { Signal } from '../../reactive/signal';
import { readSourceValue, type Source } from '../../reactive/source';
import { isStore, readStoreItems } from '../../reactive/store';
import { runWithCollector, runWithCollector0, track } from '../../reactive/tracking';
import type { ContainerContext } from '../../runtime/container-context';
import { fastNextSibling } from '../../runtime/fast-getters';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
  setActiveInvokeContext,
  type RuntimeInvokeContext,
} from '../../runtime/invoke-context';
import {
  createOwner,
  disposeOwner,
  disposeOwnerItems,
  registerSubscriberToOwner,
  type Owner,
} from '../../runtime/owner';
import { findForRows, type RowMarkerRange } from '../../runtime/node-walker';
import type { ForBlockSubscriber } from '../../runtime/subscriber';
import { toNodes } from '../../utils/nodes';
import type { MaybeNodeOutput } from '../../utils/nodes';
import { ForBlockSubscription } from '../effect/effect';
import { SSRForBlockSubscription } from '../effect/ssr-effect';
import { getFunctionOrResolve } from '../../utils/qrl';
import { EMPTY_ARRAY, EMPTY_NODES, NodeType } from '../../utils/consts';
import { ownSsrOutput, type SsrCatchController, type SsrOutput } from '../../ssr/output';
import type { QDispatchHandler } from '../../shared/types';

function readCollectionItems<T>(source: Source<readonly T[]>): readonly T[] {
  track(source);
  const items = readSourceValue(source) ?? EMPTY_ARRAY;
  return isStore(items) ? readStoreItems(items) : items;
}

/** A key identifies a row across renders; resume reads it from HTML, so identity is the string. */
export type ForKey = string;
export type AuthoredForKey = string | number;

/**
 * How a collection's rows consume their index. `IndexMode.Effects` keeps index signals in memory
 * only (resume re-derives them from row position); `IndexMode.Escapes` also serializes them,
 * because a closure (event handler) holds one past render.
 */
export const enum IndexMode {
  None = 0,
  Effects = 1,
  Escapes = 2,
}

export const enum RowOutputShape {
  Element = 0,
  Node = 1,
  Many = 2,
  Unknown = 3,
}
type ForKeyFn<T> = (item: T, index: number) => AuthoredForKey;
type ForRenderIndex = number | Signal<number> | undefined;
type SsrForContext = SsrContentContext & { nextId(): number };
type ForRenderFn<T> = (
  ctx: ContainerContext,
  item: T,
  index: ForRenderIndex,
  collection: ForBlock<T>
) => MaybeNodeOutput;
type SsrForRenderFn<T> = (
  ctx: SsrForContext,
  rangeId: number,
  /** The row's marker: its id, or the key it stamps when the collection is keyed. */
  rowMarker: number | string,
  item: T,
  index: ForRenderIndex
) => ValueOrPromise<SsrOutput>;

const ROW_OPEN = 'r';
const ROW_CLOSE = '/r';

export type RowDom = Element | RowMarkerRange;

// Keyless rows fall back to index identity; the block rebuilds instead of reconciling.
const indexKeyFn = (_item: unknown, index: number): AuthoredForKey => index;

export class ForBlock<T = unknown> {
  keys: ForKey[] = [];
  rows: RowDom[] = [];
  owners: Array<Owner | null> = [];
  indexSignals: Signal<number>[] | null;
  resumeIndexSignals: Array<Signal<number> | null> | null = null;
  /** False only for a block inflated from SSR, whose rendered rows are still to be adopted. */
  resumed = true;
  resumeOwners: Array<Owner | null> | null = null;
  rowEvents?: QDispatchHandler | QDispatchHandler[];

  constructor(
    readonly start: Comment,
    readonly end: Comment,
    readonly source: Source<readonly T[]>,
    readonly keyFn: ForKeyFn<T> | QRL<ForKeyFn<T>> | null | undefined,
    readonly renderFn: ForRenderFn<T> | QRL<ForRenderFn<T>>,
    readonly indexMode: IndexMode,
    readonly listOwner: Owner,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container: ContainerContext,
    readonly rowShape: RowOutputShape = RowOutputShape.Unknown
  ) {
    this.indexSignals = indexMode !== IndexMode.None ? [] : null;
  }

  dispose(): void {
    try {
      this.clearRows();
    } finally {
      disposeOwner(this.listOwner);
    }
  }

  run(subscription: ForBlockSubscription<T>): ValueOrPromise<void> {
    return maybeThen(
      prepareProjectionRanges(this.container, this.start, this.end, this.listOwner),
      () => this.runPrepared(subscription)
    );
  }

  private runPrepared(subscription: ForBlockSubscription<T>): ValueOrPromise<void> {
    const keyFn = this.keyFn == null ? null : getFunctionOrResolve(this.keyFn, this.container);
    return maybeThen(keyFn, (keyFn) => {
      const renderFn = getFunctionOrResolve(this.renderFn, this.container);
      return maybeThen(renderFn, (renderFn) =>
        retryOnPromise(() => this.reconcile(subscription, keyFn, renderFn))
      );
    });
  }

  reconcile(
    subscription: ForBlockSubscription<T>,
    keyFn: ForKeyFn<T> | null,
    renderFn: ForRenderFn<T>
  ): void {
    const items = runWithCollector(subscription, readCollectionItems, this.source);
    const nextKeys = new Array<ForKey>(items.length);
    const resolveKey = keyFn ?? indexKeyFn;
    const seenKeys = isDev && keyFn != null ? new Set<ForKey>() : null;
    for (let i = 0; i < items.length; i++) {
      nextKeys[i] = toForKey(resolveKey(items[i], i), seenKeys);
    }

    if (!this.resumed) {
      this.resumeRows();
    }
    if (keyFn == null) {
      // Index keys cannot tell one row from another, so any update rebuilds the whole collection.
      // Server-rendered rows are adopted first so this also clears them out of the range.
      this.discardRows();
    }

    runWithCollector0(null, () => this.reconcileRows(items, nextKeys, renderFn));
  }

  private reconcileRows(items: readonly T[], nextKeys: ForKey[], renderFn: ForRenderFn<T>): void {
    const oldKeys = this.keys;
    const oldLength = oldKeys.length;
    const nextLength = nextKeys.length;
    if (nextLength === 0) {
      this.discardRows();
      return;
    }

    let firstChanged = 0;
    while (
      firstChanged < oldLength &&
      firstChanged < nextLength &&
      oldKeys[firstChanged] === nextKeys[firstChanged]
    ) {
      firstChanged++;
    }
    let oldLast = oldLength - 1;
    let newLast = nextLength - 1;
    while (
      oldLast >= firstChanged &&
      newLast >= firstChanged &&
      oldKeys[oldLast] === nextKeys[newLast]
    ) {
      oldLast--;
      newLast--;
    }

    if (oldLast < firstChanged && newLast < firstChanged) {
      return;
    }
    // Nothing is removed, so a failed insert rolls back to the rows it found.
    const isPureInsert = oldLength !== 0 && oldLast < firstChanged;
    if (isPureInsert) {
      this.insertRows(items, firstChanged, newLast, renderFn);
    } else {
      try {
        if (oldLength === 0) {
          this.insertAllRows(items, renderFn);
        } else if (newLast < firstChanged) {
          this.removeRows(firstChanged, oldLast);
        } else if (isSwap(oldKeys, nextKeys, firstChanged, oldLast)) {
          this.swapRows(firstChanged, oldLast);
        } else {
          this.reorderRows(items, nextKeys, firstChanged, oldLast, newLast, renderFn);
        }
      } catch (error) {
        // These runs may already have removed rows, so a failure drops every row.
        this.clearRows();
        throw error;
      }
    }
    this.keys = nextKeys;
  }

  private insertAllRows(items: readonly T[], renderFn: ForRenderFn<T>): void {
    this.allocateRows(items.length);
    const parent = getRangeParent(this.start, this.end);
    const hostParent = parent.parentNode;
    // Inserting every row into the detached list parent is the fastest way to build it.
    const shouldDetachParent =
      hostParent !== null &&
      parent.firstChild === this.start &&
      parent.lastChild === this.end &&
      canDetachParent(parent);
    const insertParent = shouldDetachParent
      ? parent
      : this.container.document.createDocumentFragment();
    const insertReference = shouldDetachParent ? this.end : null;
    const parentReference = parent.nextSibling;
    if (shouldDetachParent) {
      hostParent.removeChild(parent);
    }
    try {
      for (let i = 0; i < items.length; i++) {
        insertOrMoveRow(insertParent, this.createRow(i, items[i], renderFn), insertReference);
      }
    } finally {
      if (shouldDetachParent) {
        hostParent.insertBefore(parent, parentReference);
      } else {
        parent.insertBefore(insertParent, this.end);
      }
    }
  }

  private insertRows(items: readonly T[], from: number, to: number, renderFn: ForRenderFn<T>) {
    const count = to - from + 1;
    const reference = from < this.rows.length ? firstRowNode(this.rows[from]) : this.end;
    openGap(this.rows, from, count);
    openGap(this.owners, from, count);
    if (this.indexSignals !== null) {
      openGap(this.indexSignals, from, count);
    }
    const fragment = this.container.document.createDocumentFragment();
    let index = from;
    try {
      for (; index <= to; index++) {
        insertOrMoveRow(fragment, this.createRow(index, items[index], renderFn), null);
      }
    } catch (error) {
      // The new rows never left the fragment, so closing the gap restores the list.
      parkRows(this.owners, from, index);
      disposeRows(this.owners, from, index);
      this.spliceRows(from, count);
      throw error;
    }
    getRangeParent(this.start, this.end).insertBefore(fragment, reference);
    this.renumberRows(to + 1);
  }

  private removeRows(from: number, to: number): void {
    parkRows(this.owners, from, to);
    removeRowNodes(this.container.document, this.rows[from], this.rows[to]);
    disposeRows(this.owners, from, to);
    this.spliceRows(from, to - from + 1);
    this.renumberRows(from);
  }

  private spliceRows(from: number, count: number): void {
    this.rows.splice(from, count);
    this.owners.splice(from, count);
    this.indexSignals?.splice(from, count);
  }

  private swapRows(first: number, last: number): void {
    const rows = this.rows;
    swapEntries(rows, first, last);
    swapEntries(this.owners, first, last);
    if (this.indexSignals !== null) {
      swapEntries(this.indexSignals, first, last);
      this.renumberRow(first);
      this.renumberRow(last);
    }
    const parent = getRangeParent(this.start, this.end);
    const reference = last + 1 < rows.length ? firstRowNode(rows[last + 1]) : this.end;
    insertOrMoveRow(parent, rows[last], reference);
    insertOrMoveRow(parent, rows[first], firstRowNode(rows[first + 1]));
  }

  private reorderRows(
    items: readonly T[],
    nextKeys: ForKey[],
    firstChanged: number,
    oldLast: number,
    newLast: number,
    renderFn: ForRenderFn<T>
  ): void {
    const oldKeys = this.keys;
    const oldLength = oldKeys.length;
    const nextLength = nextKeys.length;
    const oldMiddleLength = oldLast - firstChanged + 1;
    const newMiddleLength = newLast - firstChanged + 1;
    const useLinearLookup = nextLength < 4 || (oldMiddleLength | newMiddleLength) < 32;
    let newIndexByKey: Map<ForKey, number> | null = null;
    if (!useLinearLookup) {
      newIndexByKey = new Map<ForKey, number>();
      for (let i = firstChanged; i <= newLast; i++) {
        newIndexByKey.set(nextKeys[i], i);
      }
    }
    if (firstChanged === 0 && oldLast === oldLength - 1 && newLast === nextLength - 1) {
      let isDisjoint = true;
      for (let i = 0; i < oldLength && isDisjoint; i++) {
        isDisjoint = useLinearLookup
          ? nextKeys.indexOf(oldKeys[i]) === -1
          : !newIndexByKey!.has(oldKeys[i]);
      }
      if (isDisjoint) {
        this.clearRows();
        this.insertAllRows(items, renderFn);
        return;
      }
    }

    const oldRows = this.rows;
    const oldOwners = this.owners;
    const oldIndexSignals = this.indexSignals;
    this.allocateRows(nextLength);
    const retainRow = (nextIndex: number, oldIndex: number) => {
      this.rows[nextIndex] = oldRows[oldIndex];
      this.owners[nextIndex] = oldOwners[oldIndex];
      if (oldIndexSignals !== null) {
        this.indexSignals![nextIndex] = oldIndexSignals[oldIndex];
        this.renumberRow(nextIndex);
      }
    };
    for (let i = 0; i < firstChanged; i++) {
      retainRow(i, i);
    }
    for (let i = oldLast + 1; i < oldLength; i++) {
      retainRow(i + nextLength - oldLength, i);
    }

    const sources = new Int32Array(newMiddleLength);
    const findNextIndex = (oldIndex: number): number => {
      const key = oldKeys[oldIndex];
      if (newIndexByKey !== null) {
        const nextIndex = newIndexByKey.get(key);
        return nextIndex !== undefined && sources[nextIndex - firstChanged] === 0 ? nextIndex : -1;
      }
      for (let i = firstChanged; i <= newLast; i++) {
        if (sources[i - firstChanged] === 0 && key === nextKeys[i]) {
          return i;
        }
      }
      return -1;
    };
    let moved = false;
    let lastRetainedNewIndex = 0;
    for (let oldIndex = firstChanged; oldIndex <= oldLast; oldIndex++) {
      const nextIndex = findNextIndex(oldIndex);
      if (nextIndex === -1) {
        parkProjections(oldOwners[oldIndex]);
        removeRowNodes(this.container.document, oldRows[oldIndex], oldRows[oldIndex]);
        disposeRows(oldOwners, oldIndex, oldIndex);
        continue;
      }
      retainRow(nextIndex, oldIndex);
      sources[nextIndex - firstChanged] = oldIndex + 1;
      if (nextIndex < lastRetainedNewIndex) {
        moved = true;
      } else {
        lastRetainedNewIndex = nextIndex;
      }
    }

    const rows = this.rows;
    const parent = getRangeParent(this.start, this.end);
    let anchor: Node = newLast + 1 < nextLength ? firstRowNode(rows[newLast + 1]) : this.end;
    const keep = moved ? longestIncreasingSubsequencePositions(sources) : EMPTY_ARRAY;
    let keepIndex = keep.length - 1;
    for (let i = newMiddleLength - 1; i >= 0; i--) {
      const nextIndex = firstChanged + i;
      if (sources[i] === 0) {
        insertOrMoveRow(parent, this.createRow(nextIndex, items[nextIndex], renderFn), anchor);
      } else if (moved) {
        if (keepIndex < 0 || i !== keep[keepIndex]) {
          insertOrMoveRow(parent, rows[nextIndex], anchor);
        } else {
          keepIndex--;
        }
      }
      anchor = firstRowNode(rows[nextIndex]);
    }
  }

  /**
   * Adopts the rows SSR rendered. Their keys come from their own markers: re-deriving them from the
   * source would mislabel every row whenever the client mutated the array in place first.
   */
  private resumeRows(): void {
    const ssrRows = findForRows(this.start, this.end);
    const keys = new Array<ForKey>(ssrRows.length);
    this.allocateRows(ssrRows.length);
    for (let i = 0; i < ssrRows.length; i++) {
      const { dom, key } = ssrRows[i];
      keys[i] = key ?? String(i);
      this.rows[i] = dom;
      this.owners[i] = this.resumeOwners?.[i] ?? null;
      if (this.indexSignals !== null) {
        this.indexSignals[i] = this.resumeIndexSignals?.[i] ?? new Signal(i);
      }
    }
    this.keys = keys;
    this.resumed = true;
    this.resumeOwners = null;
    this.resumeIndexSignals = null;
  }

  private discardRows(): void {
    if (this.rows.length !== 0) {
      this.clearRows();
    }
  }

  private clearRows(): void {
    parkProjections(this.listOwner);
    this.clearRange();
    this.keys = [];
    this.allocateRows(0);
    disposeOwnerItems(this.listOwner);
  }

  private clearRange(): void {
    if (this.start.parentNode === null || replaceForRangeParent(this.start, this.end) !== null) {
      return;
    }
    replaceRange(this.container.document, this.start, this.end, EMPTY_NODES);
  }

  private allocateRows(length: number): void {
    this.rows = new Array<RowDom>(length);
    this.owners = new Array<Owner | null>(length);
    this.indexSignals =
      this.indexMode !== IndexMode.None ? new Array<Signal<number>>(length) : null;
  }

  private createRow(index: number, item: T, renderFn: ForRenderFn<T>): RowDom {
    const indexSignal = this.indexMode !== IndexMode.None ? new Signal(index) : null;
    // A fresh context per row, so no row's owner or hook state leaks into the next one.
    const rowContext = newChildInvokeContext(this.invokeContext, {
      ownerHost: this.listOwner,
      container: this.container,
    });
    const previousContext = getActiveInvokeContextOrNull();
    setActiveInvokeContext(rowContext);
    let nodes: MaybeNodeOutput;
    try {
      nodes = renderFn(this.container, item, indexSignal ?? index, this);
    } finally {
      setActiveInvokeContext(previousContext);
      // Recorded even when the render throws, so a rollback can dispose it.
      this.owners[index] = rowContext.owner;
    }

    const row = createRowDom(this.container.document, nodes, this.rowShape);
    this.rows[index] = row;
    if (indexSignal !== null) {
      this.indexSignals![index] = indexSignal;
    }
    return row;
  }

  private renumberRows(from: number): void {
    const indexSignals = this.indexSignals;
    for (let i = from; indexSignals !== null && i < indexSignals.length; i++) {
      this.renumberRow(i);
    }
  }

  private renumberRow(index: number): void {
    this.indexSignals![index].value = index;
  }
}

export function createForBlock<T>(
  ctx: ContainerContext,
  start: Comment,
  end: Comment,
  source: Source<readonly T[]>,
  keyFn: ForKeyFn<T> | QRL<ForKeyFn<T>> | null | undefined,
  renderFn: ForRenderFn<T> | QRL<ForRenderFn<T>>,
  indexMode: IndexMode = IndexMode.None,
  rowShape: RowOutputShape = RowOutputShape.Unknown
): ForBlockSubscriber {
  const listOwner = createOwner();
  const block = new ForBlock(
    start,
    end,
    source,
    keyFn,
    renderFn,
    indexMode,
    listOwner,
    getActiveInvokeContextOrNull(),
    ctx,
    rowShape
  );
  return registerSubscriberToOwner(new ForBlockSubscription(block, ctx.scheduler));
}

function createRowDom(
  document: Document,
  output: MaybeNodeOutput,
  rowShape: RowOutputShape
): RowDom {
  if (rowShape === RowOutputShape.Element) {
    return output as Element;
  }

  let normalized: readonly Node[] | null = null;
  if (rowShape === RowOutputShape.Unknown) {
    normalized = toNodes(output);
    if (normalized.length === 1 && normalized[0].nodeType === NodeType.Element) {
      return normalized[0] as Element;
    }
  }

  const fragment = document.createDocumentFragment();
  const start = document.createComment(ROW_OPEN);
  const end = document.createComment(ROW_CLOSE);
  fragment.appendChild(start);
  appendRowOutput(
    fragment,
    normalized ?? output,
    normalized === null ? rowShape : RowOutputShape.Many
  );
  fragment.appendChild(end);
  return [start, end];
}

export function appendRowOutput(
  parent: Node,
  output: MaybeNodeOutput,
  rowShape: RowOutputShape
): void {
  if (rowShape === RowOutputShape.Element || rowShape === RowOutputShape.Node) {
    parent.appendChild(output as Node);
    return;
  }
  const nodes = rowShape === RowOutputShape.Many ? (output as readonly Node[]) : toNodes(output);
  for (let i = 0; i < nodes.length; i++) {
    parent.appendChild(nodes[i]);
  }
}

function replaceForRangeParent(start: Comment, end: Comment): Node | null {
  const parent = getRangeParent(start, end);
  const replaceChildren = (parent as Node & { replaceChildren?: (...nodes: Node[]) => void })
    .replaceChildren;
  if (replaceChildren === undefined || parent.firstChild !== start || parent.lastChild !== end) {
    return null;
  }

  replaceChildren.call(parent);
  parent.appendChild(start);
  parent.appendChild(end);
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

function isRangeRow(row: RowDom): row is RowMarkerRange {
  return Array.isArray(row);
}

function insertOrMoveRow(parent: Node, row: RowDom, reference: Node | null): void {
  if (isRangeRow(row)) {
    const [first, last] = row;
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

/** Projections must leave a row while it is still attached, so this runs before its DOM goes. */
function parkRows(owners: Array<Owner | null>, from: number, to: number): void {
  for (let i = from; i <= to; i++) {
    parkProjections(owners[i]);
  }
}

/** Runs after the DOM is gone, so nested blocks clear their ranges on detached nodes. */
function disposeRows(owners: Array<Owner | null>, from: number, to: number): void {
  // Last to first, so every removal pops the owner and subscriber lists
  for (let i = to; i >= from; i--) {
    const owner = owners[i];
    if (owner != null) {
      disposeOwner(owner);
    }
  }
}

function toForKey(authored: AuthoredForKey, seenKeys: Set<ForKey> | null): ForKey {
  const key = String(authored);
  if (isDev && seenKeys !== null) {
    if (typeof authored !== 'string' && typeof authored !== 'number') {
      throw new Error('ForBlock key must be a synchronous string or number.');
    }
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate ForBlock key "${key}".`);
    }
    seenKeys.add(key);
  }
  return key;
}

/** Whether only the rows at `first` and `last` traded places. */
function isSwap(oldKeys: ForKey[], nextKeys: ForKey[], first: number, last: number): boolean {
  if (
    oldKeys.length !== nextKeys.length ||
    first >= last ||
    oldKeys[first] !== nextKeys[last] ||
    oldKeys[last] !== nextKeys[first]
  ) {
    return false;
  }
  for (let i = first + 1; i < last; i++) {
    if (oldKeys[i] !== nextKeys[i]) {
      return false;
    }
  }
  return true;
}

/** Shifts the entries from `at` on by `count`, leaving room for new rows. */
function openGap<V>(values: V[], at: number, count: number): void {
  const length = values.length;
  values.length = length + count;
  values.copyWithin(at + count, at, length);
}

function swapEntries<V>(values: V[], first: number, last: number): void {
  const value = values[first];
  values[first] = values[last];
  values[last] = value;
}

/** Removes the rows from `first` to `last`, which sit next to each other. */
function removeRowNodes(document: Document, first: RowDom, last: RowDom): void {
  let node = firstRowNode(first);
  const end = lastRowNode(last);
  // The document updates every live Range on each mutation, so only a span pays for one.
  if (first !== last) {
    const range = document.createRange();
    range.setStartBefore(node);
    range.setEndAfter(end);
    range.deleteContents();
    return;
  }
  const parent = node.parentNode!;
  while (node !== end) {
    const next = fastNextSibling(node)!;
    parent.removeChild(node);
    node = next;
  }
  parent.removeChild(end);
}

function firstRowNode(row: RowDom): Node {
  return isRangeRow(row) ? row[0] : row;
}

function lastRowNode(row: RowDom): Node {
  return isRangeRow(row) ? row[1] : row;
}

function longestIncreasingSubsequencePositions(values: Int32Array): number[] {
  const length = values.length;
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

  const positions: number[] = [];
  let current = tails[tails.length - 1];
  while (current !== -1) {
    positions.push(current);
    current = prev[current];
  }
  positions.reverse();
  return positions;
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
    readonly keyQrl: QRL<ForKeyFn<T>> | null | undefined,
    readonly renderQrl: QRL<SsrForRenderFn<T>>,
    readonly indexMode: IndexMode,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container: SsrForContext,
    readonly usesRowId = true,
    readonly rowShape: RowOutputShape = RowOutputShape.Unknown
  ) {
    this.indexSignals = indexMode !== IndexMode.None ? [] : null;
  }

  listOwner: Owner | null = null;
  /** Row owners in row order, so resume can dispose a row's effects with the row. */
  readonly rowOwners: Array<Owner | null> = [];

  run(): ValueOrPromise<SsrOutput> {
    const subscription = registerSubscriberToOwner(new SSRForBlockSubscription(this));
    // rows render under this owner, so resume needs it to dispose a row's effects with the row
    const listOwner = (this.listOwner = createOwner(subscription.owner));
    const keyFn =
      this.keyQrl == null ? indexKeyFn : getFunctionOrResolve(this.keyQrl, this.container);
    return thenInLifetime(
      listOwner,
      keyFn,
      (keyFn) => {
        const renderFn = getFunctionOrResolve(this.renderQrl, this.container);
        return thenInLifetime(listOwner, renderFn, (renderFn) =>
          this.renderRows(subscription, listOwner, keyFn, renderFn)
        );
      },
      ''
    );
  }

  private renderRows(
    subscription: SSRForBlockSubscription<T>,
    listOwner: Owner,
    keyFn: ForKeyFn<T>,
    renderFn: SsrForRenderFn<T>
  ): ValueOrPromise<SsrOutput> {
    const items = runWithCollector(subscription, readCollectionItems, this.source);
    const seenKeys = isDev ? new Set<ForKey>() : null;
    const output: SsrOutput[] = [];

    const renderNext = (startIndex: number): ValueOrPromise<SsrOutput> => {
      for (let i = startIndex; i < items.length; i++) {
        if (listOwner.flags & OwnerFlags.Disposed) {
          return '';
        }
        const item = items[i];
        const key = toForKey(keyFn(item, i), seenKeys);

        // A keyed row carries its key into its own marker: an element root stamps it as `q:row`,
        // any other shape appends it to the `r=<id>` payload. Resume reads it back instead of
        // re-deriving it from a mutated source.
        const rowId = this.usesRowId ? this.container.nextId() : 0;
        const rowMarker =
          this.keyQrl == null
            ? rowId
            : this.rowShape === RowOutputShape.Element
              ? key
              : `${rowId},${escapeRowKey(key)}`;
        const indexSignal = this.indexMode !== IndexMode.None ? new Signal(i) : null;
        if (indexSignal !== null) {
          this.indexSignals!.push(indexSignal);
        }
        const invokeContext = newChildInvokeContext(this.invokeContext, {
          ownerHost: listOwner,
          container: this.container,
        });
        let rowOutput: ValueOrPromise<SsrOutput>;
        try {
          rowOutput = runWithCollector(
            null,
            invoke,
            invokeContext,
            renderFn,
            this.container,
            this.rangeId,
            rowMarker,
            item,
            indexSignal ?? i
          );
        } catch (error) {
          disposeInvokeOwner(invokeContext);
          throw error;
        }

        if (isPromise(rowOutput)) {
          return thenInLifetime(
            listOwner,
            rowOutput,
            (rowOutput) => {
              this.rowOwners.push(invokeContext.owner);
              output.push(ownSsrOutput(rowOutput, invokeContext));
              return renderNext(i + 1);
            },
            '',
            (error) => {
              disposeInvokeOwner(invokeContext);
              throw error;
            }
          );
        }
        this.rowOwners.push(invokeContext.owner);
        output.push(ownSsrOutput(rowOutput, invokeContext));
      }

      const rows = finalizeSsrRows(output);
      const context = this.container as SsrForContext & {
        ownOutput?: unknown;
        catchBoundary?: SsrCatchController;
      };
      return context.ownOutput === undefined
        ? rows
        : [
            {
              type: 'publication',
              owner: listOwner,
              roots: [],
              subscription,
              boundary: context.catchBoundary,
            },
            rows,
          ];
    };

    return renderNext(0);
  }
}

/**
 * `%uXXXX` for markup, what the HTML parser (NUL, CR) or UTF-8 (surrogates) would rewrite, and `%`
 * itself; the client reverses it with `unescape`.
 */
const escapeRowKey = (key: string): string =>
  key.replace(
    /[\0\r%<>\ud800-\udfff]/g,
    (char) => '%u' + char.charCodeAt(0).toString(16).padStart(4, '0')
  );

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
  keyQrl: QRL<ForKeyFn<T>> | null | undefined,
  renderQrl: QRL<SsrForRenderFn<T>>,
  indexMode: IndexMode = IndexMode.None,
  usesRowId = true,
  rowShape: RowOutputShape = RowOutputShape.Unknown
): ValueOrPromise<SsrOutput> {
  const block = new SSRForBlock(
    rangeId,
    source,
    keyQrl,
    renderQrl,
    indexMode,
    getActiveInvokeContextOrNull(),
    ctx,
    usesRowId,
    rowShape
  );
  return block.run();
}
