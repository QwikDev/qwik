import { createSignal } from '@qwik.dev/core/spark';

export function Root() {
  const count = createSignal(0);

  return (
    <>
      <head>
        <meta charset="utf-8" />
        <title>Vdomless Counter</title>
      </head>
      <body>
        <main style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; line-height: 1.5;">
          <h1>Counter</h1>
          <button
            id="increment"
            type="button"
            style="font: inherit; padding: 0.6rem 0.9rem; border: 1px solid #222; background: white;"
            onClick$={() => count.value++}
          >
            Increment
          </button>
          <h2>Update text</h2>
          <p>{count.value}</p>
          <h2>Update shared text</h2>
          <p>Count: {count.value}</p>
          <h2>Dynamic branches</h2>
          <p>Count value is {count.value % 2 === 0 ? 'even' : 'odd'}.</p>
          <h2>Conditional rendering</h2>
          <p>{count.value > 5 && 'Count is greater than 5'}</p>
          <p>{count.value > 2 && 'Count is greater than 2 and equal to ' + count.value}</p>
        </main>
      </body>
    </>
  );
}
