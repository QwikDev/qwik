import { component$, type PropsOf, Slot } from '@qwik.dev/core';
import { checklist, lucide } from '@qds.dev/ui';

export const Checklist = component$<PropsOf<typeof checklist.root>>((props) => {
  return (
    <checklist.root class="flex flex-col gap-3" {...props}>
      <Slot />
    </checklist.root>
  );
});

export const ChecklistItem = component$<{ label: string }>((props) => {
  return (
    <checklist.item>
      <div class="flex items-center gap-2">
        <checklist.itemtrigger
          class={[
            'appearance-none bg-transparent p-0 m-0',
            'flex items-center justify-center',
            'shrink-0 size-[18px] rounded-[4px]',
            'border-[1.6px] border-solid border-base',
            'cursor-pointer',
            'ui-checked:bg-border-base ui-checked:border-accent',
          ]}
        >
          <checklist.itemindicator class="flex items-center justify-center text-white">
            <lucide.check class="size-3" />
          </checklist.itemindicator>
        </checklist.itemtrigger>
        <checklist.itemlabel class="text-body-sm font-semibold text-foreground-base leading-[20px]">
          {props.label}
        </checklist.itemlabel>
      </div>
    </checklist.item>
  );
});
