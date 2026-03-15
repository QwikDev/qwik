import {
  Slot,
  component$,
  useContext,
  useSignal,
  $,
  useTask$,
  PropsOf,
  isServer,
} from "@qwik.dev/core";
import { collapsibleContextId } from "./collapsible-context";

export type CollapsibleContentProps = PropsOf<"div">;

export const HCollapsibleContent = component$(
  (props: CollapsibleContentProps) => {
    const context = useContext(collapsibleContextId);
    const isHiddenSig = useSignal<boolean>(!context.isOpenSig.value);
    const isAnimatedSig = useSignal<boolean>(false);
    const contentId = `${context.itemId}-content`;
    const triggerId = `${context.itemId}-trigger`;

    const hideContent$ = $(() => {
      if (!context.isOpenSig.value) {
        isHiddenSig.value = true;
      }
    });

    // animations are detected automatically
    useTask$(async function automaticAnimations({ track }) {
      track(() => context.isOpenSig.value);

      if (isServer || !context.contentRef.value) {
        return;
      }

      await context.getContentDimensions$();

      if (context.isOpenSig.value) {
        context.contentRef.value.removeAttribute("data-closed");
        context.contentRef.value.dataset.open = "";
        isHiddenSig.value = false;
      } else {
        context.contentRef.value.dataset.closed = "";
        context.contentRef.value.removeAttribute("data-open");
      }

      // check if the content element has an animation or transition duration
      const { animationDuration, transitionDuration } = getComputedStyle(
        context.contentRef.value,
      );

      if (animationDuration !== "0s" || transitionDuration !== "0s") {
        isAnimatedSig.value = true;
      } else {
        isAnimatedSig.value = false;
      }
    });

    return (
      <div
        {...props}
        ref={context.contentRef}
        id={contentId}
        data-collapsible-content
        data-disabled={context.disabled ? "" : undefined}
        onAnimationEnd$={[hideContent$, props.onAnimationEnd$]}
        onTransitionEnd$={[hideContent$, props.onTransitionEnd$]}
        hidden={
          isAnimatedSig.value ? isHiddenSig.value : !context.isOpenSig.value
        }
        aria-labelledby={triggerId}
      >
        <Slot />
      </div>
    );
  },
);
