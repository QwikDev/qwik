import {
  component$,
  useSignal,
  useResource$,
  Resource,
} from '@builder.io/qwik';

export default component$(() => {
  const name = useSignal<string>();

  const ageResource = useResource$<{
    name: string;
    age: number;
    count: number;
  }>(async ({ track, cleanup }) => {
    track(() => name.value);
    const abortController = new AbortController();
    cleanup(() => abortController.abort('cleanup'));
    const res = await fetch(`https://api.agify.io?name=${name.value}`, {
      signal: abortController.signal,
    });
    return res.json();
  });

  return (
    <section>
      <div>
        <label>
          Enter your name, and I'll guess your age!
          <input onInput$={(ev, el) => (name.value = el.value)} />
        </label>
      </div>
      <Resource
        value={ageResource}
        onPending={() => <p>Loading...</p>}
        onRejected={() => <p>Failed to person data</p>}
        onResolved={(ageGuess) => {
          return (
            <p>
              {name.value && (
                <>
                  {ageGuess.name} {ageGuess.age} years
                </>
              )}
            </p>
          );
        }}
      />
    </section>
  );
});
