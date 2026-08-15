import { describe, expect, it } from 'vitest';
import { createDocument } from '../../../testing/document';
import { createQRL } from '../../shared/qrl/qrl-class';
import type { QRL } from '../../shared/qrl/qrl.public';
import { createContainerContext, type ContainerContext } from '../../runtime/container-context';
import { invoke, newInvokeContext } from '../../runtime/invoke-context';
import { createOwner } from '../../runtime/owner';
import { Scheduler } from '../../runtime/scheduler';
import { BranchRange } from '../branch/branch';
import { createSuspense } from './content';
import { createRevealGroup, type RevealOrder } from './reveal';

type RenderFn = (
  ctx?: ContainerContext
) => Node | readonly Node[] | null | undefined | Promise<Node>;

let qrlId = 0;
const renderQrl = (render: RenderFn): QRL<RenderFn> =>
  createQRL('chunk', `render${qrlId++}`, render);

function deferred() {
  let resolve!: (value: Node) => void;
  const promise = new Promise<Node>((r) => (resolve = r));
  return { promise, resolve };
}

function setupHost(boundaryCount: number) {
  const document = createDocument({ html: '<div></div>' });
  const host = document.querySelector('div')!;
  const ranges: BranchRange[] = [];
  for (let index = 0; index < boundaryCount; index++) {
    const start = document.createComment(`s${index}`);
    const end = document.createComment(`e${index}`);
    host.appendChild(start);
    host.appendChild(end);
    ranges.push(new BranchRange(document, start, end));
  }
  const scheduler = new Scheduler(() => {});
  const ctx = createContainerContext(host, scheduler);
  const context = newInvokeContext({ owner: createOwner(null), container: ctx });
  return { document, host, ranges, ctx, context };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function mount(
  order: RevealOrder,
  collapsed: boolean,
  pendings: Array<ReturnType<typeof deferred>>
) {
  const { document, host, ranges, ctx, context } = setupHost(pendings.length);
  const group = createRevealGroup(order, collapsed, pendings.length);
  invoke(context, () => {
    pendings.forEach((pending, index) => {
      createSuspense(
        ctx,
        ranges[index],
        renderQrl(() => pending.promise),
        renderQrl(() => document.createTextNode(`loading-${index}`)),
        0,
        group,
        index
      );
    });
  });
  return { document, host };
}

describe('reveal groups', () => {
  it('holds a later sequential boundary and its collapsed fallback', async () => {
    const first = deferred();
    const second = deferred();
    const { document, host } = mount('sequential', true, [first, second]);
    await settle();
    // collapsed: the second boundary shows nothing, not even its fallback
    expect(host.textContent).toBe('loading-0');

    second.resolve(document.createTextNode('two'));
    await settle();
    // resolved out of order: held behind the first boundary
    expect(host.textContent).toBe('loading-0');

    first.resolve(document.createTextNode('one'));
    await settle();
    expect(host.textContent).toBe('onetwo');
  });

  it('shows fallbacks but holds content when the group is not collapsed', async () => {
    const first = deferred();
    const second = deferred();
    const { document, host } = mount('sequential', false, [first, second]);
    await settle();
    expect(host.textContent).toBe('loading-0loading-1');

    second.resolve(document.createTextNode('two'));
    await settle();
    expect(host.textContent).toBe('loading-0');

    first.resolve(document.createTextNode('one'));
    await settle();
    expect(host.textContent).toBe('onetwo');
  });

  it('reveals a together group only when every boundary resolved', async () => {
    const first = deferred();
    const second = deferred();
    const { document, host } = mount('together', true, [first, second]);
    await settle();
    expect(host.textContent).toBe('');

    first.resolve(document.createTextNode('one'));
    await settle();
    expect(host.textContent).toBe('');

    second.resolve(document.createTextNode('two'));
    await settle();
    expect(host.textContent).toBe('onetwo');
  });

  it('reverse order reveals from the last boundary backwards', async () => {
    const first = deferred();
    const second = deferred();
    const { document, host } = mount('reverse', true, [first, second]);
    await settle();
    expect(host.textContent).toBe('loading-1');

    first.resolve(document.createTextNode('one'));
    await settle();
    expect(host.textContent).toBe('loading-1');

    second.resolve(document.createTextNode('two'));
    await settle();
    expect(host.textContent).toBe('onetwo');
  });
});
