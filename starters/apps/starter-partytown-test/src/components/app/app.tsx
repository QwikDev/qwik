import { component$, useStore } from "@builder.io/qwik";

export const App = component$(() => {
  const state = useStore({ name: "World", running: true });

  return (
    <div
      id="my-app"
      document:on-expensiveComputationDone$={() => (state.running = false)}
    >
      <p style={{ "text-align": "center" }}>
        <a href="https://github.com/QwikDev/qwik">
          <img
            alt="Qwik Logo"
            width={400}
            src="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F667ab6c2283d4c4d878fb9083aacc10f"
          />
        </a>
      </p>
      <p class="congrats">
        Congratulations <a href="https://github.com/QwikDev/qwik">Qwik</a> with{" "}
        <a href="https://partytown.builder.io/">Partytown</a> is working!
      </p>

      <p>
        Expensive script running in{" "}
        <a href="https://partytown.builder.io/">Partytown</a> is{" "}
        {state.running ? (
          <span
            id="state"
            style={{
              "background-color": "red",
              color: "white",
              padding: ".1em",
            }}
          >
            running
          </span>
        ) : (
          <span
            id="state"
            style={{
              "background-color": "green",
              color: "white",
              padding: ".1em",
            }}
          >
            finished
          </span>
        )}
        .
      </p>

      <p>Next steps:</p>
      <ol>
        <li>
          Open dev-tools network tab and notice that no JavaScript was
          downloaded by the main thread to render this page. (
          <code>partytown.js</code> is used to execute things of main thread and
          not for rendering the application.)
        </li>
        <li>
          Partytown executes <code>&lt;script&gt;</code> tag that contains a
          simulation of expensive script. The expensive script simplation keeps
          the web-worker thread busy for 2.5 seconds, leaving main-thread free
          for user interactions. (Without Partytown the script would block the
          main thread resulting in poor user experience.)
        </li>
        <li>
          Once the expensive operation is finished it dispatches custom event (
          <code>expensiveComputationDone</code>) that this component listens on.
          It is only at that time that Qwik lazy-loads the component render
          function and updates the UI. (See network tab.)
        </li>
        <li>
          Try interacting with this component by changing{" "}
          <input
            value={state.name}
            onInput$={(event, input) => {
              state.name = input.value;
            }}
          ></input>
          .
        </li>
        <li>
          Observe that the binding changes: <code>Hello {state.name}!</code>
        </li>
        <li>
          Notice that Qwik automatically lazily-loaded and resumed the component
          upon interaction without the developer having to code that behavior.
          (Lazy hydration is what gives even large apps instant on behavior.)
        </li>
        <li>
          Read the docs <a href="https://qwik.dev/">here</a>.
        </li>
        <li>Replace the content of this component with your code.</li>
        <li>Build amazing web-sites with unbeatable startup performance.</li>
      </ol>
      <hr />
      <p style={{ "text-align": "center" }}>
        Made with ❤️ by{" "}
        <a target="_blank" href="https://www.builder.io/">
          Builder.io
        </a>
      </p>
    </div>
  );
});
