import { component$ } from '@qwik.dev/core';

type StatusProps = {
  class?: string;
  dotPosition?: 'start' | 'end';
  label: string;
  tone?: StatusTone;
};

type StatusTone = 'danger' | 'success' | 'warning';

const toneClasses = {
  danger: 'bg-editorial-danger',
  success: 'bg-editorial-success',
  warning: 'bg-editorial-warning',
};

export const StatusDot = component$<{ class?: string; tone?: StatusTone }>(
  ({ class: className, tone = 'success' }) => (
    <span
      class={['h-2 w-2 shrink-0 rounded-editorial-full', toneClasses[tone], className]}
      aria-hidden="true"
    />
  )
);

export default component$<StatusProps>(
  ({ class: className, dotPosition = 'start', label, tone = 'success' }) => {
    return (
      <div
        class={[
          'flex items-center gap-editorial-2 text-editorial-11 font-semibold leading-tight tracking-[0.04em] text-editorial-muted uppercase',
          className,
        ]}
      >
        {dotPosition === 'start' && <StatusDot tone={tone} />}
        <span>{label}</span>
        {dotPosition === 'end' && <StatusDot tone={tone} />}
      </div>
    );
  }
);
