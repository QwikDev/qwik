import { $, component$, useOnWindow, useSignal } from '@builder.io/qwik';

// Custom hook to manage the dropdown state. Listens to click events on the window.
// If the clicked element is not the dropdown toggle button, it closes the dropdown.
function useCloseDropdown() {
  // Signal to manage the open/close state of the dropdown
  const isOpen = useSignal(false);
  // Signal to hold a reference to the dropdown toggle button
  const dropdownToggleBtn = useSignal<HTMLElement | null>(null);

  // Event listener function for window clicks
  const closeDropdown = $((event: Event): void => {
    // If the clicked element is not contained within the dropdown toggle button, close the dropdown
    if (
      dropdownToggleBtn.value &&
      !dropdownToggleBtn.value.contains(event.target as Node)
    ) {
      isOpen.value = false;
    }
  });
  // Attach the window click event listener
  useOnWindow('click', closeDropdown);

  return {
    isOpen,
    dropdownToggleBtn,
  };
}

export default component$(() => {
  // Use the custom hook in the component
  const { isOpen, dropdownToggleBtn } = useCloseDropdown();

  // Function to set the reference of the dropdown toggle button
  const setDropdownToggleBtnRef = (item: Element): void => {
    dropdownToggleBtn.value = item as HTMLElement;
  };

  return (
    <div>
      <button
        ref={setDropdownToggleBtnRef}
        onClick$={() => (isOpen.value = true)}
      >
        Click me!
      </button>
      {isOpen.value && (
        <>
          <div>
            <i>The dropdown is open!</i>
          </div>
          <div style={{ margin: '1.5rem', marginLeft: '1.5rem' }}>
            <b>CLICK OUTSIDE</b>
          </div>
        </>
      )}
    </div>
  );
});
