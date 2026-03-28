import { component$, useSignal, worker$ } from '@qwik.dev/core';

const sumToWorker = worker$((value: number) => {
  console.log('Worker is running with value:', value);
  let total = 0;
  for (let i = 0; i <= value; i++) {
    total += i;
  }
  return total;
});

const summarizeFormWorker = worker$((formData: FormData) => {
  return JSON.stringify({
    name: formData.get('name'),
    tags: formData.getAll('tag'),
  });
});

export const Worker = component$(() => {
  const input = useSignal(6);
  const result = useSignal('idle');
  const formResult = useSignal('idle');

  return (
    <section>
      <div>
        <button
          id="worker-run"
          onClick$={async () => {
            result.value = 'pending';
            result.value = String(await sumToWorker(input.value));
          }}
        >
          Run worker
        </button>
        <p id="worker-result">{result.value}</p>
      </div>

      <form
        id="worker-form"
        preventdefault:submit
        onSubmit$={async (event) => {
          formResult.value = await summarizeFormWorker(event as any);
        }}
      >
        <input id="worker-name" name="name" value="Ada" />
        <input id="worker-tag-1" name="tag" value="math" />
        <input id="worker-tag-2" name="tag" value="logic" />
        <button id="worker-submit" type="submit">
          Submit form
        </button>
      </form>
      <p id="worker-form-result">{formResult.value}</p>
    </section>
  );
});
