import {
  type Component,
  Slot,
  component$,
  createContextId,
  useSignal,
  useContextProvider,
  $,
  useStylesScoped$,
} from '@builder.io/qwik';
import CSS from './popup-manager.css?inline';

// Define public API for the PopupManager
export const PopupManagerContext = createContextId<{
  /**
   * Use to show a popup.
   * @param Component Component to show
   * @param props Props that need to be passed to the component.
   */
  show: <T extends {}>(Component: Component<T>, props: T) => Promise<void>;

  /**
   * Hide the currently shown popup.
   */
  hide: () => Promise<void>;
}>('PopupManager');

export const PopupManager = component$(() => {
  useStylesScoped$(CSS);
  const modal = useSignal<{ Component: Component<any>; props: any }>();

  // Provide the public API for the PopupManager for other components.
  useContextProvider(PopupManagerContext, {
    show: $(<T extends {}>(component: Component<T>, props: T) => {
      modal.value = { Component: component as any, props };
    }),
    hide: $(() => {
      modal.value = undefined;
    }),
  });
  return (
    <>
      <Slot />
      {
        // Conditionally render the modal
        modal.value && (
          <div class="modal">
            <modal.value.Component {...modal.value.props} />
          </div>
        )
      }
    </>
  );
});
