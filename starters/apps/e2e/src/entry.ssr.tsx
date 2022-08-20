import type { FunctionComponent } from '@builder.io/qwik';
import { renderToStream, RenderToStreamOptions } from '@builder.io/qwik/server';
import { Root } from './root';
import { LexicalScope } from './components/lexical-scope/lexicalScope';
import { SlotParent } from './components/slot/slot';
import { TwoListeners } from './components/two-listeners/twolisteners';
import { Render } from './components/render/render';
import { Events } from './components/events/events';
import { Async } from './components/async/async';
import { Containers } from './components/containers/container';
import { Factory } from './components/factory/factory';
import { Watch } from './components/watch/watch';
import { EffectClient } from './components/effect-client/effect-client';
import { ContextRoot } from './components/context/context';
import { Toggle } from './components/toggle/toggle';
import { Styles } from './components/styles/styles';
import { BroadcastEvents } from './components/broadcast-events/broadcast-event';
import { Weather } from './components/resource/weather';
import { ResourceApp } from './components/resource/resource';
import { TreeshakingApp } from './components/treeshaking/treeshaking';
import { Streaming } from './components/streaming/streaming';
import { ResourceSerialization } from './components/resource/resource-serialization';

/**
 * Entry point for server-side pre-rendering.
 *
 * @returns a promise when all of the rendering is completed.
 */
export default function (opts: RenderToStreamOptions) {
  const url = new URL(opts.url);

  const tests: Record<string, FunctionComponent> = {
    '/e2e/': () => <Root />,
    '/e2e/two-listeners': () => <TwoListeners />,
    '/e2e/slot': () => <SlotParent />,
    '/e2e/lexical-scope': () => <LexicalScope />,
    '/e2e/render': () => <Render />,
    '/e2e/events': () => <Events />,
    '/e2e/async': () => <Async />,
    '/e2e/container': () => <Containers />,
    '/e2e/factory': () => <Factory />,
    '/e2e/watch': () => <Watch />,
    '/e2e/effect-client': () => <EffectClient />,
    '/e2e/context': () => <ContextRoot />,
    '/e2e/toggle': () => <Toggle />,
    '/e2e/styles': () => <Styles />,
    '/e2e/broadcast-events': () => <BroadcastEvents />,
    '/e2e/weather': () => <Weather />,
    '/e2e/resource': () => <ResourceApp />,
    '/e2e/resource-serialization': () => <ResourceSerialization />,
    '/e2e/treeshaking': () => <TreeshakingApp />,
    '/e2e/streaming': () => <Streaming />,
  };
  const Test = tests[url.pathname];

  // Render segment instead
  if (url.searchParams.has('fragment')) {
    return renderToStream(
      <>
        <Test />
      </>,
      {
        debug: true,
        containerTagName: 'container',
        // streaming: {
        //   inOrder: {
        //     buffering: 'marks',
        //   },
        // },
        qwikLoader: {
          include: url.searchParams.get('loader') === 'false' ? 'never' : 'auto',
          events: ['click'],
        },
        ...opts,
      }
    );
  }

  return renderToStream(
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Blank App</title>
      </head>
      <body>
        <Test />
      </body>
    </html>,
    {
      debug: true,
      ...opts,
      streaming: {
        inOrder: {
          buffering: 'marks',
        },
      },
    }
  );
}
