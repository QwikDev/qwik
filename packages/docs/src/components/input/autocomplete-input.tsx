import { lucide } from '@qds.dev/ui';
import { component$, type PropsOf } from '@qwik.dev/core';

type AutocompleteInputProps = {
  icon: 'search';
} & PropsOf<'input'>;

export const AutocompleteInput = component$<AutocompleteInputProps>((props) => {
  return (
    <div class="flex items-center bg-background-base border-[1.6px] border-base rounded-lg p-2.5 gap-2 h-10 shadow-sm-base outline-none w-full">
      {props.icon === 'search' && <lucide.search class="size-4 text-standalone-base" />}
      <input
        {...props}
        class="outline-none text-body-xs placeholder:text-foreground-muted text-foreground-base w-full"
      />
    </div>
  );
});
