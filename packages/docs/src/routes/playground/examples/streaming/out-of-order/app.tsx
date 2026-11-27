import { component$, Pending, useComputed$ } from '@qwik.dev/core';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const Section = component$((props: { title: string; ms: number }) => {
  const loadedAt = useComputed$(async () => {
    await wait(props.ms);
    return new Date().toLocaleTimeString();
  });

  return (
    <section>
      <h2>{props.title}</h2>
      <p>
        Took {props.ms}ms, rendered at {loadedAt.value}
      </p>
    </section>
  );
});

// Turn off "Out of order streaming" in the options to see the page wait for each section.
// The HTML tab shows the fallbacks first, then the content streamed in after the footer.
export default component$(() => {
  return (
    <main>
      <h1>Dashboard</h1>

      <Pending fallback$={() => <p>Loading slow section...</p>}>
        <Section title="Slow section" ms={2000} />
      </Pending>

      <Pending fallback$={() => <p>Loading fast section...</p>}>
        <Section title="Fast section" ms={500} />
      </Pending>

      <footer>This footer is sent before both sections finish.</footer>
    </main>
  );
});
