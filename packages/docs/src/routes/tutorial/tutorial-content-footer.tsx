import { component$, useSignal } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { ensureDefaultFiles, type TutorialStore } from './layout';

export const TutorialContentFooter = component$(({ store }: TutorialContentFooterProps) => {
  let solutionViewSig = useSignal(false);

  return (
    <div class="content-footer">
      <div>
        {solutionViewSig.value ? (
          <button
            preventdefault:click
            class="show-me"
            onClick$={() => {
              store.files = ensureDefaultFiles(store.app.problemInputs);
              solutionViewSig.value = false;
            }}
            type="button"
          >
            Reset
          </button>
        ) : (
          <button
            preventdefault:click
            class="show-me"
            onClick$={() => {
              store.files = ensureDefaultFiles(store.app.solutionInputs);
              solutionViewSig.value = true;
            }}
            type="button"
          >
            Show Me
          </button>
        )}
      </div>
      <nav>
        {store.prev ? (
          <Link title={store.prev.title} href={`/tutorial/${store.prev.id}/`} class="nav-link prev">
            &lt; Previous
          </Link>
        ) : null}
        {store.next ? (
          <Link title={store.next.title} href={`/tutorial/${store.next.id}/`} class="nav-link next">
            Next &gt;
          </Link>
        ) : null}
      </nav>
    </div>
  );
});

interface TutorialContentFooterProps {
  store: TutorialStore;
}
