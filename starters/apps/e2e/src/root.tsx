import type { FunctionComponent } from "@qwik.dev/core";
import { component$ } from "@qwik.dev/core";
import { Async } from "./components/async/async";
import { Attributes } from "./components/attributes/attributes";
import { BroadcastEvents } from "./components/broadcast-events/broadcast-event";
import { BuildVariables } from "./components/build-variables/build";
import { ComputedRoot } from "./components/computed/computed";
import { Containers } from "./components/containers/container";
import { ContextRoot } from "./components/context/context";
import { EffectClient } from "./components/effect-client/effect-client";
import { Events } from "./components/events/events";
import { EventsClient } from "./components/events/events-client";
import { RenderExceptions, UseTaskExceptions } from "./components/exceptions";
import { Factory } from "./components/factory/factory";
import { LexicalScope } from "./components/lexical-scope/lexicalScope";
import { MountRoot } from "./components/mount/mount";
import { NoResume } from "./components/no-resume/no-resume";
import { RefRoot } from "./components/ref/ref";
import { Render } from "./components/render/render";
import { ResourceApp } from "./components/resource/resource";
import { ResourceFn } from "./components/resource/resource-fn";
import { ResourceSerialization } from "./components/resource/resource-serialization";
import { Weather } from "./components/resource/weather";
import { Resuming1 } from "./components/resuming/resuming";
import Issue5001 from "./components/signals/Issue_5001";
import { Signals } from "./components/signals/signals";
import { SlotParent } from "./components/slot/slot";
import { StreamingRoot } from "./components/streaming/streaming";
import { Styles } from "./components/styles/styles";
import { SyncQRL } from "./components/sync-qrl/sync-qrl";
import { Toggle } from "./components/toggle/toggle";
import { TreeshakingApp } from "./components/treeshaking/treeshaking";
import { TwoListeners } from "./components/two-listeners/twolisteners";
import { UseId } from "./components/useid/useid";
import { Watch } from "./components/watch/watch";

import "./global.css";
import { QRL } from "./components/qrl/qrl";
import { AsyncComputedRoot } from "./components/async-computed/async-computed";
import { Backpatching } from "./components/backpatching/backpatching";

const tests: Record<string, FunctionComponent> = {
  "/e2e/two-listeners": () => <TwoListeners />,
  "/e2e/use-id": () => <UseId />,
  "/e2e/slot": () => <SlotParent />,
  "/e2e/lexical-scope": () => <LexicalScope />,
  "/e2e/render": () => <Render />,
  "/e2e/events": () => <Events />,
  "/e2e/async": () => <Async />,
  "/e2e/container": () => <Containers />,
  "/e2e/factory": () => <Factory />,
  "/e2e/watch": () => <Watch />,
  "/e2e/effect-client": () => <EffectClient />,
  "/e2e/context": () => <ContextRoot />,
  "/e2e/toggle": () => <Toggle />,
  "/e2e/styles": () => <Styles />,
  "/e2e/broadcast-events": () => <BroadcastEvents />,
  "/e2e/weather": () => <Weather />,
  "/e2e/resource": () => <ResourceApp />,
  "/e2e/resource-serialization": () => <ResourceSerialization />,
  "/e2e/resource-fn": () => <ResourceFn />,
  "/e2e/treeshaking": () => <TreeshakingApp />,
  "/e2e/streaming": () => <StreamingRoot />,
  "/e2e/mount": () => <MountRoot />,
  "/e2e/ref": () => <RefRoot />,
  "/e2e/signals": () => <Signals />,
  "/e2e/signals/issue-5001": () => <Issue5001 />,
  "/e2e/attributes": () => <Attributes />,
  "/e2e/events-client": () => <EventsClient />,
  "/e2e/no-resume": () => <NoResume />,
  "/e2e/resuming": () => <Resuming1 />,
  "/e2e/sync-qrl": () => <SyncQRL />,
  "/e2e/computed": () => <ComputedRoot />,
  "/e2e/build-variables": () => <BuildVariables />,
  "/e2e/exception/render": () => <RenderExceptions />,
  "/e2e/exception/use-task": () => <UseTaskExceptions />,
  "/e2e/qrl": () => <QRL />,
  "/e2e/async-computed": () => <AsyncComputedRoot />,
  "/e2e/backpatching": () => <Backpatching />,
};

export const Root = component$<{ pathname: string }>(({ pathname }) => {
  const Test = tests[pathname];
  if (Test) {
    return <Test />;
  }
  return (
    <section>
      {Object.keys(tests)
        .sort()
        .map((testPath) => (
          <p key={testPath}>
            <a href={testPath}>{testPath.replace(/^\/e2e\//, "")}</a>
          </p>
        ))}
    </section>
  );
});
