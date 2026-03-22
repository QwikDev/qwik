import { component$, useSignal, useVisibleTask$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { createPlaygroundShareUrl } from '../../repl/ui/repl-share-url';
import { ensureDefaultFiles, type TutorialStore } from './layout';

export const TutorialContentFooter = component$(({ store }: TutorialContentFooterProps) => {
  const footerRef = useSignal<HTMLElement>();
  const startRef = useSignal<HTMLElement>();
  const actionsRef = useSignal<HTMLElement>();
  const endRef = useSignal<HTMLElement>();
  const hasOverflowNav = useSignal(false);

  useVisibleTask$(({ cleanup, track }) => {
    track(() => store.prev?.title);
    track(() => store.next?.title);

    const footerEl = footerRef.value;
    const actionsEl = actionsRef.value;
    const startEl = startRef.value;
    const endEl = endRef.value;

    if (!footerEl || !actionsEl || !startEl || !endEl || !store.prev || !store.next) {
      hasOverflowNav.value = false;
      return;
    }

    const updateLayout = () => {
      const footerWidth = footerEl.clientWidth;
      const actionsWidth = actionsEl.scrollWidth;
      const startWidth = startEl.scrollWidth;
      const endWidth = endEl.scrollWidth;
      const sideWidth = Math.max(0, (footerWidth - actionsWidth - 32) / 2);
      hasOverflowNav.value = startWidth > sideWidth || endWidth > sideWidth;
    };

    updateLayout();

    const resizeObserver = new ResizeObserver(() => {
      updateLayout();
    });

    resizeObserver.observe(footerEl);
    resizeObserver.observe(actionsEl);
    resizeObserver.observe(startEl);
    resizeObserver.observe(endEl);

    cleanup(() => {
      resizeObserver.disconnect();
    });
  });

  return (
    <div
      ref={footerRef}
      class={{
        'content-footer': true,
        'has-overflow-nav': hasOverflowNav.value,
        'no-prev': !store.prev,
        'no-next': !store.next,
      }}
    >
      <div ref={startRef} class="footer-slot footer-slot-start">
        {store.prev ? (
          <Link
            title={store.prev.title}
            href={`/tutorial/${store.prev.id}/`}
            class="tutorial-footer-button is-outline"
          >
            <ArrowLeftIcon />
            <span>{store.prev.title}</span>
          </Link>
        ) : (
          <span class="footer-placeholder" aria-hidden="true" />
        )}
      </div>

      <div ref={actionsRef} class="footer-actions">
        <a
          href={createPlaygroundShareUrl(store)}
          class="tutorial-footer-button is-secondary"
          title="Open in playground"
        >
          <DuplicateIcon />
          <span>Open in playground</span>
        </a>

        {store.isShowingSolution ? (
          <button
            preventdefault:click
            class="tutorial-footer-button is-primary"
            onClick$={() => {
              store.files = ensureDefaultFiles(store.app.problemInputs);
              store.isShowingSolution = false;
            }}
            type="button"
          >
            <RefreshIcon />
            <span>Reset</span>
          </button>
        ) : (
          <button
            preventdefault:click
            class="tutorial-footer-button is-primary"
            onClick$={() => {
              store.files = ensureDefaultFiles(store.app.solutionInputs);
              store.isShowingSolution = true;
            }}
            type="button"
          >
            <PlayIcon />
            <span>Show me</span>
          </button>
        )}
      </div>

      <div ref={endRef} class="footer-slot footer-slot-end">
        {store.next ? (
          <Link
            title={store.next.title}
            href={`/tutorial/${store.next.id}/`}
            class="tutorial-footer-button is-outline"
          >
            <span>{store.next.title}</span>
            <ArrowRightIcon />
          </Link>
        ) : (
          <span class="footer-placeholder" aria-hidden="true" />
        )}
      </div>
    </div>
  );
});

interface TutorialContentFooterProps {
  store: TutorialStore;
}

const ArrowLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M10 3.5L5.5 8L10 12.5"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M6 3.5L10.5 8L6 12.5"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

const DuplicateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect
      x="5.25"
      y="5.25"
      width="7.5"
      height="7.5"
      rx="1.25"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <path
      d="M10.75 5V3.75C10.75 3.06 10.19 2.5 9.5 2.5H3.75C3.06 2.5 2.5 3.06 2.5 3.75V9.5C2.5 10.19 3.06 10.75 3.75 10.75H5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M5.5 4.5V11.5L11.5 8L5.5 4.5Z"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linejoin="round"
    />
  </svg>
);

const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M12.67 5.33A5 5 0 1 0 13 8"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M10.67 3.83H13.17V6.33"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
);
