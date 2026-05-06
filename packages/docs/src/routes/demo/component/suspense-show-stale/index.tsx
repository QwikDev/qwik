import {
  component$,
  Suspense,
  useSignal,
  type JSXOutput,
} from '@qwik.dev/core';

const LOAD_MS = 1200;

const COLORS = ['#7c3aed', '#0891b2', '#16a34a', '#ea580c'];

const ProfileCard = component$((props: { version: number }) => {
  const content = new Promise<JSXOutput>((resolve) => {
    const color = COLORS[props.version % COLORS.length];

    setTimeout(
      () =>
        resolve(
          <article style={{ border: `4px solid ${color}`, padding: '12px' }}>
            <p>Profile version {props.version}</p>
          </article>
        ),
      LOAD_MS
    );
  });

  return <>{content}</>;
});

export default component$(() => {
  const version = useSignal(1);

  return (
    <section>
      <button onClick$={() => version.value++}>Refresh profile</button>

      <Suspense fallback={<p>Loading new profile...</p>} showStale>
        <ProfileCard version={version.value} />
      </Suspense>
    </section>
  );
});
