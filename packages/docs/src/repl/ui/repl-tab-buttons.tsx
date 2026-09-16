import { Slot } from '@qwik.dev/core';
export const ReplTabButtons = (_props: ReplTabButtonsProps) => {
  return (
    <div class="repl-tab-buttons" translate="no">
      <div class="repl-tab-buttons-inner">
        <Slot />
      </div>
    </div>
  );
};

interface ReplTabButtonsProps {
  children: any;
}
