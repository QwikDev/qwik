import { component$ } from '@qwik.dev/core';

type StatusProps = {
  class?: string;
  dotPosition?: 'start' | 'end';
  label: string;
  tone?: 'danger' | 'success' | 'warning';
};

const toneClasses = {
  danger: 'bg-editorial-danger',
  success: 'bg-editorial-success',
  warning: 'bg-editorial-warning',
};

export default component$<StatusProps>(
  ({ class: className, dotPosition = 'start', label, tone = 'success' }) => {
    const dot = (
      <span
        class={['h-2 w-2 shrink-0 rounded-editorial-full', toneClasses[tone]]}
        aria-hidden="true"
      />
    );

    return (
      <div
        class={[
          'flex items-center gap-editorial-2 text-editorial-11 font-semibold leading-tight tracking-[0.04em] text-editorial-muted uppercase',
          className,
        ]}
      >
        {dotPosition === 'start' && dot}
        <span>{label}</span>
        {dotPosition === 'end' && dot}
      </div>
    );
  }
);
