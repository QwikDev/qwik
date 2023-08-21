import {
  $,
  component$,
  useContext,
  useStylesScoped$,
  useTask$,
} from '@builder.io/qwik';
import { PortalCloseAPIContextId, PortalAPI } from './portal-provider';
import PopupExampleCSS from './popup-example.css?inline';
import { useLocation } from '@builder.io/qwik-city';

export default component$(() => {
  // Retrieve the portal API
  const portal = useContext(PortalAPI);
  // This function is used to open the modal.
  // Portals can be named and each portal can have multiple items rendered into it.
  const openModal = $(() => portal('modal', <PopupExample name="World" />));

  // Conditionally open the <Portal/> on the server to demonstrate SSR of portals.
  const location = useLocation();
  useTask$(() => {
    location.url.searchParams.get('modal') && openModal();
  });
  return (
    <>
      <div>
        [ <a href="?modal=true">render portal as part of SSR</a> |{' '}
        <a href="?">render portal as part of client interaction</a> ]
      </div>
      <button onClick$={openModal}>Show Modal</button>
    </>
  );
});

// This component is shown as a modal.
export const PopupExample = component$<{ name: string }>(({ name }) => {
  useStylesScoped$(PopupExampleCSS);
  // To close a portal retrieve the close API.
  const portalClose = useContext(PortalCloseAPIContextId);
  return (
    <div class="popup-example">
      <h1>MODAL</h1>
      <p>Hello {name}!</p>
      <button onClick$={() => portalClose()}>X</button>
    </div>
  );
});
