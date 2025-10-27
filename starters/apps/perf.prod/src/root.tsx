import { component$, type FunctionComponent } from "@qwik.dev/core";
import StoreImpl from "./components/store-impl";
import SignalImpl from "./components/signal-impl";
import ComponentImpl from "./components/component-impl";
import ServerImpl from "./components/server-impl";

import "./global.css";

const implementations: Record<string, FunctionComponent> = {
  "/perf.prod/store-impl": () => <StoreImpl />,
  "/perf.prod/signal-impl": () => <SignalImpl />,
  "/perf.prod/component-impl": () => <ComponentImpl />,
  "/perf.prod/server-impl": () => <ServerImpl />,
};

export const Root = component$<{ pathname: string }>(({ pathname }) => {
  const Implementation = implementations[pathname];
  if (Implementation) {
    return <Implementation />;
  }
  return (
    <section>
      <h1>Qwik Performance Benchmarks</h1>
      {Object.keys(implementations)
        .sort()
        .map((implementationPath) => (
          <p key={implementationPath}>
            <a href={implementationPath}>
              {implementationPath.replace(/^\/perf.prod\//, "")}
            </a>
          </p>
        ))}
    </section>
  );
});
