import { type QwikIntrinsicElements, component$ } from '@qwik.dev/core';

type FormFieldProps = QwikIntrinsicElements['input'] & {
  id: string;
  label: string;
  error?: string;
};

export default component$<FormFieldProps>((props) => {
  const { class: className, error, id, label, ...inputProps } = props;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div class="mb-0">
      <label
        for={id}
        class="mb-editorial-2 text-editorial-11 font-semibold leading-[1.2] tracking-[0.02em] text-editorial-muted uppercase"
      >
        {label}
      </label>
      <input
        {...inputProps}
        id={id}
        class={[
          'h-editorial-11 rounded-editorial-md border border-editorial-border-strong bg-editorial-surface px-editorial-4 py-0 text-editorial-14 leading-[1.2] text-editorial-primary outline-none placeholder:text-editorial-muted focus:border-editorial-accent focus:ring-2 focus:ring-editorial-accent/15',
          error &&
            'border-editorial-danger focus:border-editorial-danger focus:ring-editorial-danger/15',
          className,
        ]}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
      />
      {error && (
        <p id={errorId} class="mt-editorial-2 text-editorial-12 text-editorial-danger">
          {error}
        </p>
      )}
    </div>
  );
});
