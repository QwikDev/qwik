import { describe, expect, it } from 'vitest';
import { createDocument } from '../testing/document';
import { renderCompiled as render } from './csr-render';
import { createOwner, type Owner } from './runtime/owner';
import { OwnerFlags } from './reactive/flags';
import { Scheduler } from './runtime/scheduler';
import { useTask } from './runtime/task';

describe('csr render', () => {
  it('passes root props without wrapping them in JSX', async () => {
    const document = createDocument({ html: '<main></main>' });
    const host = document.querySelector('main')!;

    const result = await render(
      host,
      (props: { label: string }, ctx) => {
        const node = ctx.document.createElement('span');
        node.textContent = props.label;
        return node;
      },
      { props: { label: 'root-props' } }
    );

    expect(host.textContent).toBe('root-props');
    result.cleanup();
  });
  it('mounts and cleans up scalar root output', async () => {
    const document = createDocument({ html: '<main></main>' });
    const host = document.querySelector('main')!;

    const result = await render(host, (_props, ctx) => {
      const node = ctx.document.createElement('span');
      node.textContent = 'one';
      return node;
    });

    expect(host.innerHTML).toBe('<span>one</span>');

    result.cleanup();

    expect(host.innerHTML).toBe('');
  });

  it('awaits a Promise root before mounting', async () => {
    const document = createDocument({ html: '<main></main>' });
    const host = document.querySelector('main')!;
    let resolve!: (node: Node) => void;
    const output = new Promise<Node>((done) => (resolve = done));

    const rendering = render(host, () => output);
    expect(host.innerHTML).toBe('');

    const node = document.createElement('span');
    node.textContent = 'async';
    resolve(node);
    const result = await rendering;

    expect(host.innerHTML).toBe('<span>async</span>');
    result.cleanup();
  });

  it('mounts a Promise root before running initial tasks', async () => {
    const document = createDocument({ html: '<main></main>' });
    const host = document.querySelector('main')!;
    const scheduler = new Scheduler((flush) => queueMicrotask(flush));
    let mounted = false;

    const result = await render(
      host,
      (_props, ctx) => {
        const node = ctx.document.createElement('span');
        useTask(() => {
          mounted = node.parentNode === host;
        });
        return Promise.resolve(node);
      },
      { scheduler }
    );

    expect(mounted).toBe(true);
    result.cleanup();
  });

  it('rolls back the root owner and DOM after rejection', async () => {
    const document = createDocument({ html: '<main></main>' });
    const host = document.querySelector('main')!;
    let owner: Owner | null = null;

    await expect(
      render(host, () => {
        owner = createOwner();
        return Promise.reject(new Error('failed'));
      })
    ).rejects.toThrow('failed');

    expect(host.innerHTML).toBe('');
    expect(owner!.flags & OwnerFlags.Disposed).toBeTruthy();
  });

  it('cleans up the root owner before removing nodes and is idempotent', async () => {
    const document = createDocument({ html: '<main></main>' });
    const host = document.querySelector('main')!;
    let owner: Owner | null = null;

    const result = await render(host, (_props, ctx) => {
      owner = createOwner();
      return ctx.document.createElement('span');
    });

    result.cleanup();
    result.cleanup();

    expect(owner!.flags & OwnerFlags.Disposed).toBeTruthy();
    expect(host.innerHTML).toBe('');
  });

  it('removes the current contents between root range markers', async () => {
    const document = createDocument({ html: '<main></main>' });
    const host = document.querySelector('main')!;
    let start!: Comment;
    let end!: Comment;

    const result = await render(host, (_props, ctx) => {
      start = ctx.document.createComment('');
      end = ctx.document.createComment('');
      return [start, ctx.document.createElement('span'), end];
    });

    const replacement = document.createElement('a');
    start.nextSibling!.remove();
    host.insertBefore(replacement, end);
    result.cleanup();

    expect(host.innerHTML).toBe('');
  });
});
