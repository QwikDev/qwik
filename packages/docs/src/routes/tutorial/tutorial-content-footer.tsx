import { component$ } from '@qwik.dev/core';
import { Button, Link } from '../../components/action/action';
import { createPlaygroundShareUrl } from '../../repl/ui/repl-share-url';
import { ensureDefaultFiles, type TutorialStore } from './layout';
import { lucide } from '@qds.dev/ui';
import type { TutorialApp } from './tutorial-data';

const TutorialFooterPreviousButton = component$<{ prev: TutorialApp }>(({ prev }) => {
  return (
    <Link title={prev.title} href={`/tutorial/${prev.id}/`} variant="outline">
      <lucide.arrowleft class="size-4" />
      <span class="overflow-hidden text-ellipsis text-nowrap">{prev.title}</span>
    </Link>
  );
});

const TutorialFooterNextButton = component$<{ next: TutorialApp }>(({ next }) => {
  return (
    <Link title={next.title} href={`/tutorial/${next.id}/`} variant="outline">
      <span class="overflow-hidden text-ellipsis text-nowrap">{next.title}</span>
      <lucide.arrowright class="size-4" />
    </Link>
  );
});

const TutorialFooterPlaygroundButton = component$<{ store: TutorialStore; isMobile: boolean }>(
  ({ store, isMobile }) => {
    return (
      <Link
        href={createPlaygroundShareUrl(store)}
        title="Open in playground"
        variant="secondary"
        class={{
          'w-full': isMobile,
        }}
      >
        <lucide.pencilruler class="size-4" />
        <span class="overflow-hidden text-ellipsis text-nowrap">Open in playground</span>
      </Link>
    );
  }
);

const TutorialFooterSolutionButton = component$<{ store: TutorialStore; isMobile: boolean }>(
  ({ store, isMobile }) => {
    return store.isShowingSolution ? (
      <Button
        preventdefault:click
        onClick$={() => {
          store.files = ensureDefaultFiles(store.app.problemInputs);
          store.isShowingSolution = false;
        }}
        type="button"
        class={{
          'w-full': isMobile,
        }}
      >
        <lucide.refreshccw class="size-4" />
        <span class="overflow-hidden text-ellipsis text-nowrap">Reset</span>
      </Button>
    ) : (
      <Button
        preventdefault:click
        onClick$={() => {
          store.files = ensureDefaultFiles(store.app.solutionInputs);
          store.isShowingSolution = true;
        }}
        type="button"
        class={{
          'w-full': isMobile,
        }}
      >
        <lucide.play class="size-4" />
        <span class="overflow-hidden text-ellipsis text-nowrap">Show me</span>
      </Button>
    );
  }
);

export const TutorialContentFooter = component$(({ store }: TutorialContentFooterProps) => {
  return (
    <div class="content-footer">
      <div class="grid grid-cols-3 gap-8 border-t-[1.6px] border-t-border-base bg-background-base h-[72px] p-4 justify-center 2xl:hidden">
        <div
          class={{
            'grid gap-[26px]': true,
            'grid-cols-2': !!store.prev && !!store.next,
          }}
        >
          {store.prev && <TutorialFooterPreviousButton prev={store.prev} />}
          {store.next && <TutorialFooterNextButton next={store.next} />}
        </div>

        <TutorialFooterPlaygroundButton store={store} isMobile={true} />

        <TutorialFooterSolutionButton store={store} isMobile={true} />
      </div>
      <div
        class="2xl:grid h-[72px] p-4 grid-cols-3 hidden gap-9"
        style="grid-template-columns: minmax(0, 1fr) 1fr minmax(0, 1fr);"
      >
        {store.prev ? <TutorialFooterPreviousButton prev={store.prev} /> : <div />}
        <div class="flex gap-4">
          <TutorialFooterPlaygroundButton store={store} isMobile={false} />
          <TutorialFooterSolutionButton store={store} isMobile={false} />
        </div>
        {store.next ? <TutorialFooterNextButton next={store.next} /> : <div />}
      </div>
    </div>
  );
});

interface TutorialContentFooterProps {
  store: TutorialStore;
}
