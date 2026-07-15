import { describe, expect, it } from 'vitest';
import { createDocument } from '../../../testing/document';
import { isPromise } from '../../shared/utils/promises';
import { OwnerFlags } from '../../reactive/flags';
import { useSignal } from '../../reactive/public-api';
import type { Signal } from '../../reactive/signal';
import type { ContainerContext } from '../../runtime/container-context';
import { getActiveInvokeContext, invoke, newInvokeContext } from '../../runtime/invoke-context';
import { createOwner, getOrCreateContextOwner, type Owner } from '../../runtime/owner';
import { Scheduler } from '../../runtime/scheduler';
import { ROW_ELEMENT, ROW_MANY, ROW_NODE } from '../for/for';
import { createCollection } from './collection';

describe('collection', () => {
  it('delegates a Source to the existing ForBlock', async () => {
    const { ctx, list, start, end, run } = setup();
    const items = useSignal([1, 2]);

    const output = run(() =>
      createCollection(
        ctx,
        start,
        end,
        items,
        (item) => item,
        (_ctx, item) => row(list.ownerDocument, valueOf(item)),
        false
      )
    );

    expect(isPromise(output)).toBe(false);
    await ctx.scheduler.flushInteraction();
    expect(rowTexts(list)).toEqual(['1', '2']);

    items.value = [2, 3];
    await ctx.scheduler.flushInteraction();

    expect(rowTexts(list)).toEqual(['2', '3']);
  });

  it('renders array rows sequentially and commits them together', async () => {
    const { ctx, list, start, end, run } = setup();
    const first = deferred<Node>();
    const second = deferred<Node>();
    const secondStarted = deferred<void>();
    const starts: string[] = [];

    const output = run(() =>
      createCollection(
        ctx,
        start,
        end,
        ['first', 'second'],
        null,
        (_ctx, item) => {
          const value = valueOf(item);
          starts.push(value);
          if (value === 'first') {
            return first.promise;
          }
          secondStarted.resolve(undefined);
          return second.promise;
        },
        false
      )
    );

    expect(starts).toEqual(['first']);
    expect(rowTexts(list)).toEqual([]);

    first.resolve(row(list.ownerDocument, 'first'));
    await secondStarted.promise;

    expect(starts).toEqual(['first', 'second']);
    expect(rowTexts(list)).toEqual([]);

    second.resolve(row(list.ownerDocument, 'second'));
    await output;

    expect(rowTexts(list)).toEqual(['first', 'second']);
  });

  it('passes plain numeric indexes to direct array rows', () => {
    const { ctx, list, start, end, run } = setup();
    const indexes: unknown[] = [];

    run(() =>
      createCollection(ctx, start, end, ['a', 'b'], null, (_ctx, item, index) => {
        indexes.push(index);
        return row(list.ownerDocument, item);
      })
    );

    expect(indexes).toEqual([0, 1]);
  });

  it('inserts every node from a row fragment', () => {
    const { ctx, list, start, end, run } = setup();
    const first = row(list.ownerDocument, 'first');
    const second = row(list.ownerDocument, 'second');

    const output = run(() =>
      createCollection(
        ctx,
        start,
        end,
        ['row'],
        null,
        () => {
          const fragment = list.ownerDocument.createDocumentFragment();
          fragment.appendChild(first);
          fragment.appendChild(second);
          return fragment;
        },
        false
      )
    );

    expect(output).toBeUndefined();
    expect(rowTexts(list)).toEqual(['first', 'second']);
  });

  it('uses compiler-provided row shapes without normalizing known output', () => {
    const element = setup();
    element.run(() =>
      createCollection(
        element.ctx,
        element.start,
        element.end,
        ['element'],
        null,
        () => row(element.list.ownerDocument, 'element'),
        false,
        '',
        ROW_ELEMENT
      )
    );
    expect(rowTexts(element.list)).toEqual(['element']);

    const node = setup();
    node.run(() =>
      createCollection(
        node.ctx,
        node.start,
        node.end,
        ['text'],
        null,
        () => node.list.ownerDocument.createTextNode('text'),
        false,
        '',
        ROW_NODE
      )
    );
    expect(node.list.textContent).toBe('text');

    const many = setup();
    many.run(() =>
      createCollection(
        many.ctx,
        many.start,
        many.end,
        ['many'],
        null,
        () => [row(many.list.ownerDocument, 'first'), row(many.list.ownerDocument, 'second')],
        false,
        '',
        ROW_MANY
      )
    );
    expect(rowTexts(many.list)).toEqual(['first', 'second']);
  });

  it('removes transient direct-array anchors after commit', () => {
    const { ctx, list, start, end, run } = setup();

    run(() =>
      createCollection(
        ctx,
        start,
        end,
        ['row'],
        null,
        () => row(list.ownerDocument, 'row'),
        false,
        '',
        ROW_ELEMENT,
        true
      )
    );

    expect(Array.from(list.childNodes)).not.toContain(start);
    expect(Array.from(list.childNodes)).not.toContain(end);
    expect(rowTexts(list)).toEqual(['row']);
  });

  it('rolls back array owners when a row rejects', async () => {
    const { ctx, list, start, end, run } = setup();
    const result = deferred<Node>();
    let rowOwner!: Owner;
    let collectionOwner!: Owner;

    const output = run(() =>
      createCollection(
        ctx,
        start,
        end,
        ['row'],
        null,
        () => {
          rowOwner = getOrCreateContextOwner(getActiveInvokeContext())!;
          collectionOwner = rowOwner.parent!;
          return result.promise;
        },
        false
      )
    );
    const error = new Error('row failed');
    result.reject(error);

    await expect(output).rejects.toBe(error);
    expect(rowOwner.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(collectionOwner.flags & OwnerFlags.Disposed).not.toBe(0);
    expect(rowTexts(list)).toEqual([]);
  });
});

function setup() {
  const document = createDocument({ html: '<ul></ul>' });
  const list = document.querySelector('ul')!;
  const start = document.createComment('start');
  const end = document.createComment('end');
  list.appendChild(start);
  list.appendChild(end);
  const scheduler = new Scheduler(() => {});
  const ctx = { document, scheduler } as ContainerContext;
  const context = newInvokeContext({ owner: createOwner(null), container: ctx });

  return {
    ctx,
    list,
    start,
    end,
    run: <T>(fn: () => T) => invoke(context, fn),
  };
}

function valueOf<T>(value: T | Signal<T>): T {
  return value instanceof Object && 'value' in value ? value.value : value;
}

function row(document: Document, value: unknown): Node {
  const element = document.createElement('li');
  element.textContent = String(value);
  return element;
}

function rowTexts(list: Element): string[] {
  return Array.from(list.querySelectorAll('li'), (element) => element.textContent ?? '');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
