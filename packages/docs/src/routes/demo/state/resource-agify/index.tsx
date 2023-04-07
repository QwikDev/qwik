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
    <div>
      <div>Enter your name, and I'll guess your age!</div>
      <input
        onInput$={(e: Event) =>
          (name.value = (e.target as HTMLInputElement).value)
        }
      />
      <Resource
        value={ageResource}
        onPending={() => <div>Loading...</div>}
        onRejected={() => <div>Failed to person data</div>}
        onResolved={(ageGuess) => {
          return (
            <div>
              {name.value && (
                <>
                  {ageGuess.name} {ageGuess.age} years
                </>
              )}
            </div>
          );
        }}
      />
    </div>
  );
});
