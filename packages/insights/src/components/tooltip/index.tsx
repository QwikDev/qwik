import { component$, Slot, type Component } from '@builder.io/qwik';
import { Tooltip } from '@qwik-ui/headless';

interface TooltipWrapperProps {
  content: Component<any>;
  contentProps?: any;
  placement?: 'top' | 'right' | 'bottom' | 'left';
  gutter?: number;
}

export const TooltipWrapper = component$<TooltipWrapperProps>(
  ({ content: ContentComponent, contentProps, placement = 'top', gutter = 8 }) => {
    return (
      <Tooltip.Root hover floating={placement} gutter={gutter} flip>
        <Tooltip.Trigger>
          <Slot />
        </Tooltip.Trigger>
        <Tooltip.Content class="tooltip-panel bg-white border border-slate-200 shadow-lg rounded-md p-0 z-50 max-w-[75vw] animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <ContentComponent {...contentProps} />
        </Tooltip.Content>
      </Tooltip.Root>
    );
  }
);
