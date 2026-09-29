import { component$, Slot, type QwikIntrinsicElements } from '@qwik.dev/core';

type SelectFieldProps = QwikIntrinsicElements['select'] & {
  id: string;
  label: string;
};

export default component$<SelectFieldProps>((props) => {
  const { class: className, id, label, ...selectProps } = props;

  return (
    <div>
      <label
        for={id}
        class="mb-editorial-2 block text-editorial-11 font-semibold leading-[1.2] tracking-[0.02em] text-editorial-muted uppercase"
      >
        {label}
      </label>
      <select
        {...selectProps}
        id={id}
        class={[
          'h-editorial-11 rounded-editorial-md border border-editorial-border-strong bg-editorial-surface px-editorial-4 py-0 text-editorial-14 leading-[1.2] text-editorial-primary outline-none focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent/15',
          className,
        ]}
      >
        <Slot />
      </select>
    </div>
  );
});
