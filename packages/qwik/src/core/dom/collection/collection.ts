import type { QRL } from '../../shared/qrl/qrl.public';
import { isPromise, maybeThen } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import type { Signal } from '../../reactive/signal';
import type { Source } from '../../reactive/source';
import type { ContainerContext } from '../../runtime/container-context';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
} from '../../runtime/invoke-context';
import { createOwner, disposeOwner, type Owner } from '../../runtime/owner';
import type { MaybeNodeOutput } from '../../utils/nodes';
import { getFunctionOrResolve } from '../../utils/qrl';
import type { SsrOutput } from '../../ssr/output';
import {
  appendRowOutput,
  createForBlock,
  finalizeSsrRows,
  ForRange,
  renderSsrForBlock,
  IndexMode,
  type ForKey,
  RowOutputShape,
} from '../for/for';

type CollectionKeyFn<T> = (item: T, index: number) => ForKey;
type CollectionIndex = number | Signal<number> | undefined;
type CollectionRenderFn<T> = (
  ctx: ContainerContext,
  item: T,
  index: CollectionIndex,
  id?: string
) => ValueOrPromise<MaybeNodeOutput>;
type SsrCollectionContext = ContainerContext & { nextId(): number };
type SsrCollectionRenderFn<T> = (
  ctx: SsrCollectionContext,
  rangeId: number,
  rowId: number,
  item: T,
  index: CollectionIndex,
  id?: string
) => ValueOrPromise<SsrOutput>;

export function createCollection<T>(
  ctx: ContainerContext,
  start: Comment,
  end: Comment,
  collection: readonly T[] | Source<readonly T[]>,
  keyFn: CollectionKeyFn<T> | QRL<CollectionKeyFn<T>> | null,
  renderFn: CollectionRenderFn<T> | QRL<CollectionRenderFn<T>>,
  indexMode: IndexMode = IndexMode.None,
  idBase = '',
  rowShape: RowOutputShape = RowOutputShape.Unknown,
  transient = false
): ValueOrPromise<void> {
  if (!Array.isArray(collection)) {
    return createForBlock(
      ctx,
      new ForRange(ctx.document, start, end),
      collection as Source<readonly T[]>,
      keyFn,
      renderFn as never,
      indexMode,
      idBase,
      rowShape
    ).run();
  }

  const base = getActiveInvokeContextOrNull();
  const owner = createOwner();
  return rollbackOwnerOnError(owner, () =>
    maybeThen(getFunctionOrResolve(renderFn, ctx), (render) =>
      renderArray(ctx, start, end, collection, render, base, owner, idBase, rowShape, transient)
    )
  );
}

function renderArray<T>(
  ctx: ContainerContext,
  start: Comment,
  end: Comment,
  items: readonly T[],
  render: CollectionRenderFn<T>,
  base: ReturnType<typeof getActiveInvokeContextOrNull>,
  owner: Owner,
  idBase: string,
  rowShape: RowOutputShape,
  transient: boolean
): ValueOrPromise<void> {
  const fragment = ctx.document.createDocumentFragment();

  const append = (output: MaybeNodeOutput) => appendRowOutput(fragment, output, rowShape);
  const next = (index: number): ValueOrPromise<void> => {
    for (let i = index; i < items.length; i++) {
      const context = newChildInvokeContext(base, { ownerHost: owner, container: ctx });
      const output = invoke(
        context,
        render,
        ctx,
        items[i],
        i,
        idBase === '' ? '' : `${idBase}${i}-`
      );
      if (isPromise(output)) {
        return output.then((output) => {
          append(output);
          return next(i + 1);
        });
      }
      append(output);
    }
    const parent = end.parentNode!;
    parent.insertBefore(fragment, end);
    if (transient) {
      start.remove();
      end.remove();
    }
  };

  return next(0);
}

export function renderSsrCollection<T>(
  ctx: SsrCollectionContext,
  rangeId: number | undefined,
  collection: readonly T[] | Source<readonly T[]>,
  keyQrl: QRL<CollectionKeyFn<T>> | undefined,
  renderQrl: SsrCollectionRenderFn<T> | QRL<SsrCollectionRenderFn<T>>,
  indexMode: IndexMode = IndexMode.None,
  idBase = '',
  usesRowId = true,
  rowShape: RowOutputShape = RowOutputShape.Unknown
): ValueOrPromise<SsrOutput> {
  if (!Array.isArray(collection)) {
    return renderSsrForBlock(
      ctx,
      rangeId!,
      collection as Source<readonly T[]>,
      keyQrl ?? null,
      renderQrl as QRL<SsrCollectionRenderFn<T>>,
      indexMode,
      idBase,
      usesRowId,
      rowShape
    );
  }

  const base = getActiveInvokeContextOrNull();
  const owner = createOwner();
  return rollbackOwnerOnError(owner, () =>
    maybeThen(getFunctionOrResolve(renderQrl, ctx), (render) => {
      const output: SsrOutput[] = [];
      const next = (start: number): ValueOrPromise<SsrOutput> => {
        for (let i = start; i < collection.length; i++) {
          const rowId = usesRowId ? ctx.nextId() : 0;
          const context = newChildInvokeContext(base, { ownerHost: owner, container: ctx });
          const row = invoke(
            context,
            render,
            ctx,
            rangeId!,
            rowId,
            collection[i],
            i,
            idBase === '' ? '' : `${idBase}${i}-`
          );
          if (isPromise(row)) {
            return row.then((row) => {
              output.push(row);
              return next(i + 1);
            });
          }
          output.push(row);
        }
        return finalizeSsrRows(output);
      };
      return next(0);
    })
  );
}

function rollbackOwnerOnError<T>(owner: Owner, run: () => ValueOrPromise<T>): ValueOrPromise<T> {
  try {
    const output = run();
    return isPromise(output)
      ? Promise.resolve(output).catch((error) => {
          disposeOwner(owner);
          throw error;
        })
      : output;
  } catch (error) {
    disposeOwner(owner);
    throw error;
  }
}
