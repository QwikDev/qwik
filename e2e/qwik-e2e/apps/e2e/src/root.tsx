import { component$ } from '@qwik.dev/core';
// Compiler emits raw JSX from a nested async function, silently.
// import { Async } from './components/async/async';
import { Attributes } from './components/attributes/attributes';
import { BroadcastEvents } from './components/broadcast-events/broadcast-event';
import { BuildVariables } from './components/build-variables/build';
import { ComputedRoot } from './components/computed/computed';
import { Containers } from './components/containers/container';
import { ContextRoot } from './components/context/context';
import { EffectClient } from './components/effect-client/effect-client';
import { Events } from './components/events/events';
import { EventsClient } from './components/events/events-client';
// Component bodies without linear setup before one direct return are unsupported.
// import { RenderExceptions, UseTaskExceptions } from './components/exceptions';
import { Factory } from './components/factory/factory';
import { LexicalScope } from './components/lexical-scope/lexicalScope';
import { MountRoot } from './components/mount/mount';
import { NoResume } from './components/no-resume/no-resume';
import { RefRoot } from './components/ref/ref';
import { Render } from './components/render/render';
import { ResourceApp } from './components/resource/resource';
import { ResourceFn } from './components/resource/resource-fn';
import { ResourceSerialization } from './components/resource/resource-serialization';
import { Weather } from './components/resource/weather';
import { Resuming1 } from './components/resuming/resuming';
import NakedObjectStoreReactivityIssue5001 from './components/signals/NakedObjectStoreReactivityIssue5001';
import { Signals } from './components/signals/signals';
import { SlotParent } from './components/slot/slot';
// TODO(v3): restore SSRStream coverage when the API returns.
// import { StreamingRoot } from './components/streaming/streaming';
import { StreamingFlush } from './components/streaming/streaming-flush';
import { Styles } from './components/styles/styles';
import { SyncQRL } from './components/sync-qrl/sync-qrl';
import { Toggle } from './components/toggle/toggle';
import { TreeshakingApp } from './components/treeshaking/treeshaking';
import { TwoListeners } from './components/two-listeners/twolisteners';
// SSR emit refuses the nested `Nested` component: unlowerable construct.
// import { UseId } from './components/useid/useid';
import { Watch } from './components/watch/watch';
// worker$'s core chunk imports `./worker.js?worker&url`, unresolvable in the app build.
// import { WorkerRoot } from './components/worker/worker';

import './global.css';
import { QRL } from './components/qrl/qrl';
import { AsyncRoot } from './components/use-async/use-async';
import { Backpatching } from './components/backpatching/backpatching';
import { SuspenseRoot } from './components/suspense/suspense';
// Conditional renders as returns inside `if` are unsupported by the compiler.
// import { OutOfOrderSuspenseRoot } from './components/suspense/ooos';

const TestIndex = component$(() => <section>Test index</section>);

export const Root = component$<{ pathname: string }>(({ pathname }) => {
  // Compiler cannot serialize runtime-selected JSX components.
  // const Test = tests[pathname];
  // return Test ? <Test /> : null;
  return (
    <>
      {pathname === '/e2e/' && <TestIndex />}
      {pathname === '/e2e/two-listeners' && <TwoListeners />}
      {/* {pathname === '/e2e/use-id' && <UseId />} */}
      {pathname === '/e2e/slot' && <SlotParent />}
      {pathname === '/e2e/lexical-scope' && <LexicalScope />}
      {pathname === '/e2e/render' && <Render />}
      {pathname === '/e2e/events' && <Events />}
      {/* <Async /> — see disabled import above */}
      {pathname === '/e2e/container' && <Containers />}
      {pathname === '/e2e/factory' && <Factory />}
      {pathname === '/e2e/watch' && <Watch />}
      {pathname === '/e2e/effect-client' && <EffectClient />}
      {pathname === '/e2e/context' && <ContextRoot />}
      {pathname === '/e2e/toggle' && <Toggle />}
      {pathname === '/e2e/styles' && <Styles />}
      {pathname === '/e2e/broadcast-events' && <BroadcastEvents />}
      {pathname === '/e2e/weather' && <Weather />}
      {pathname === '/e2e/resource' && <ResourceApp />}
      {pathname === '/e2e/resource-serialization' && <ResourceSerialization />}
      {pathname === '/e2e/resource-fn' && <ResourceFn />}
      {pathname === '/e2e/treeshaking' && <TreeshakingApp />}
      {/* <StreamingRoot /> — see disabled import above */}
      {pathname === '/e2e/streaming-flush' && <StreamingFlush />}
      {pathname === '/e2e/mount' && <MountRoot />}
      {pathname === '/e2e/ref' && <RefRoot />}
      {pathname === '/e2e/signals' && <Signals />}
      {pathname === '/e2e/signals/issue-5001' && <NakedObjectStoreReactivityIssue5001 />}
      {pathname === '/e2e/attributes' && <Attributes />}
      {pathname === '/e2e/events-client' && <EventsClient />}
      {pathname === '/e2e/no-resume' && <NoResume />}
      {pathname === '/e2e/resuming' && <Resuming1 />}
      {pathname === '/e2e/sync-qrl' && <SyncQRL />}
      {pathname === '/e2e/computed' && <ComputedRoot />}
      {pathname === '/e2e/build-variables' && <BuildVariables />}
      {/* {pathname === '/e2e/exception/render' && <RenderExceptions />} */}
      {/* {pathname === '/e2e/exception/use-task' && <UseTaskExceptions />} */}
      {pathname === '/e2e/qrl' && <QRL />}
      {pathname === '/e2e/async-computed' && <AsyncRoot />}
      {pathname === '/e2e/backpatching' && <Backpatching />}
      {pathname === '/e2e/suspense' && <SuspenseRoot />}
      {/* {pathname === '/e2e/suspense-ooos' && <OutOfOrderSuspenseRoot />} */}
      {/* <WorkerRoot /> — see disabled import above */}
    </>
  );
});
