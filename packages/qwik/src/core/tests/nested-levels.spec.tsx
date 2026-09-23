import {
  component$,
  createContextId,
  noSerialize,
  Slot,
  useContext,
  useContextProvider,
  useSignal,
  type Signal,
} from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

type LevelComponent = ((props: { children?: unknown }) => unknown) | null;
const LevelsContext = createContextId<{ signals: Signal<LevelComponent>[] }>('levels');

const PageA = component$(() => (
  <article id="page-a">
    <Slot />
  </article>
));
const PageB = component$(() => (
  <article id="page-b">
    <Slot />
  </article>
));
const LeafX = component$(() => <p id="leaf-x">x</p>);
const LeafY = component$(() => <p id="leaf-y">y</p>);

/** One route level: an identity-keyed row that projects the next level into its component. */
function Level({ level }: { level: number }) {
  const levels = useContext(LevelsContext);
  const cmp = levels.signals[level];
  return (
    <>
      {[cmp.value].map((Cmp) => {
        const RoutedComponent = Cmp as any;
        return Cmp ? (
          <RoutedComponent>
            <Level level={level + 1} />
          </RoutedComponent>
        ) : null;
      })}
    </>
  );
}

describe(`${name}: nested levels`, () => {
  it('swaps a parent and a child level written in one flush after resume', async () => {
    const Root = () => {
      const page = useSignal<LevelComponent>(noSerialize(PageA) as any);
      const leaf = useSignal<LevelComponent>(noSerialize(LeafX) as any);
      const end = useSignal<LevelComponent>(null);
      useContextProvider(LevelsContext, { signals: [page, leaf, end] });
      return (
        <section>
          <button
            onClick$={() => {
              page.value = noSerialize(PageB) as any;
              leaf.value = noSerialize(LeafY) as any;
            }}
          >
            swap
          </button>
          <Level level={0} />
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(Root, { debug });
    expect(container.querySelector('#page-a #leaf-x')).toBeTruthy();

    // the parent's re-render removes the child's DOM while the child's lazy state is still loading
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('#page-a')).toBeFalsy();
    expect(container.querySelector('#page-b #leaf-y')).toBeTruthy();
    cleanup();
  });
});
