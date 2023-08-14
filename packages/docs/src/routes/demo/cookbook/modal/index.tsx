import { component$, useContext, useStylesScoped$ } from '@builder.io/qwik';
import { PopupManagerContext } from './popup-manager';
import PopupExampleCSS from './popup-example.css?inline';

export default component$(() => {
  // Retrieve the popup manager API
  const popupManager = useContext(PopupManagerContext);
  return (
    <button
      onClick$={async () => {
        await popupManager.show(PopupExample, {
          salutation: 'Hello',
          name: 'World',
        });
      }}
    >
      Show Modal
    </button>
  );
});

// This component is shown as a modal.
export const PopupExample = component$<{ salutation: string; name: string }>(
  ({ salutation, name }) => {
    useStylesScoped$(PopupExampleCSS);
    const popupManager = useContext(PopupManagerContext);
    return (
      <div class="popup-example">
        <h1>MODAL</h1>
        <p>
          {salutation} {name}
        </p>
        <button onClick$={async () => await popupManager.hide()}>X</button>
      </div>
    );
  }
);
