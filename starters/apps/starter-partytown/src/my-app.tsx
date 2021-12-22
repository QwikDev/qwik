import { h, qEvent } from '@builder.io/qwik';
import { qComponent, qHook, useEvent } from '@builder.io/qwik';

export const expensiveComputationDone = qEvent('document:expensiveComputationDone');

export const MyApp = qComponent<{}, { name: string; running: boolean }>({
  tagName: 'my-app', // optional
  onMount: qHook(() => ({ name: 'World', running: true })),
  onRender: qHook((props, state) => {
    // eslint-disable-next-line no-console
    console.log('Qwik: MyApp component is rendering...');
    return (
      <div
        id="my-app"
        {...expensiveComputationDone(
          qHook<typeof MyApp>((props, state) => (state.running = false))
        )}
      >
        <p style={{ 'text-align': 'center' }}>
          <a href="https://github.com/builderio/qwik">
            <img
              alt="Qwik Logo"
              width={400}
              src="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F667ab6c2283d4c4d878fb9083aacc10f"
            />
          </a>
        </p>
        <p>
          Congratulations <a href="https://github.com/builderio/qwik">Qwik</a> with{' '}
          <a href="https://github.com/BuilderIO/partytown">Partytown</a> is working!
        </p>

        <p>
          Expensive script running in <a href="https://github.com/BuilderIO/partytown">Partytown</a>{' '}
          is{' '}
          {state.running ? (
            <span style={{ 'background-color': 'red', color: 'white', padding: '.1em' }}>
              running
            </span>
          ) : (
            <span style={{ 'background-color': 'green', color: 'white', padding: '.1em' }}>
              finished
            </span>
          )}
          .
        </p>

        <p>Next steps:</p>
        <ol>
          <li>
            Open dev-tools network tab and notice that no JavaScript was downloaded by the main
            thread to render this page. (<code>partytown.js</code> is used to execute things of main
            thread and not for rendering the application.)
          </li>
          <li>
            Partytown executes <code>&lt;script&gt;</code> tag that contains a simulation of
            expensive script. The expensive script simplation keeps the web-worker thread busy for
            2.5 seconds, leaving main-thread free for user interactions. (Without Partytown the
            script would block the main thread resulting in poor user experience.)
          </li>
          <li>
            Once the expensive operation is finished it dispatches custom event (
            <code>expensivecomputationdone</code>) that this component listens on. It is only at
            that time that Qwik lazy-loads the component render function and updates the UI. (See
            network tab.)
          </li>
          <li>
            Try interacting with this component by changing{' '}
            <input
              value={state.name}
              on:keyup={qHook<typeof MyApp>((props, state) => {
                const event = useEvent<KeyboardEvent>();
                const input = event.target as HTMLInputElement;
                state.name = input.value;
              })}
            ></input>
            .
          </li>
          <li>
            Observe that the binding changes: <code>Hello {state.name}!</code>
          </li>
          <li>
            Notice that Qwik automatically lazily-loaded and hydrated the component upon interaction
            without the developer having to code that behavior. (Lazy hydration is what gives even
            large apps instant on behavior.)
          </li>
          <li>
            Read the docs <a href="https://github.com/builderio/qwik">here</a>.
          </li>
          <li>Replace the content of this component with your code.</li>
          <li>Build amazing web-sites with unbeatable startup performance.</li>
        </ol>
        <hr />
        <p style={{ 'text-align': 'center' }}>
          Made with ❤️ by{' '}
          <a target="_blank" href="https://www.builder.io/">
            Builder.io
          </a>
        </p>
      </div>
    );
  }),
});
