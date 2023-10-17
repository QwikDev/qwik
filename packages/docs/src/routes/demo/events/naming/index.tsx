import {
  $,
  type QwikMouseEvent,
  component$,
  useSignal,
  useResource$,
  Resource,
  getPlatform,
  setPlatform,
} from '@builder.io/qwik';
import { server$ } from '@builder.io/qwik-city';
import { renderToString } from '@builder.io/qwik/server';

export default component$(() => {
  const tryNames = ['Click', 'click', '-Custom:EventName', '-DOMContentLoad'];
  const jsxName = useSignal('Click');
  const dispatchName = useSignal('click');
  const ref = useSignal<HTMLElement>();
  const log = useSignal('...');
  const logHandler = $((event: QwikMouseEvent<HTMLDivElement, Event>) => {
    log.value += '\n' + event.type;
  });
  const code = useResource$(async ({ track }) => {
    const response = await extractEncoding(track(() => jsxName.value));
    dispatchName.value = response.eventName;
    return response;
  });
  return (
    <div>
      Event Name: <input bind:value={jsxName} />
      {'[ '}
      {tryNames.map((name, idx) => (
        <>
          {idx ? ' | ' : ''}
          <a
            href=""
            preventdefault:click
            onClick$={() => (jsxName.value = name)}
          >
            {name}
          </a>
        </>
      ))}
      {' ]'}
      <button
        onClick$={() =>
          ref.value?.dispatchEvent(new CustomEvent(dispatchName.value))
        }
      >
        Fire: <tt>dispatchEvent(new CustomEvent("{dispatchName.value}"))</tt>
      </button>
      <div ref={ref} {...{ ['on' + jsxName.value + '$']: logHandler }}>
        target element
      </div>
      <h1>Code (JSX)</h1>
      <pre>{CODE.replace('EVENT', jsxName.value)}</pre>
      <h1>Rendered HTML</h1>
      <pre>
        {'<target-element '}
        <Resource
          value={code}
          onPending={() => <>loading...</>}
          onResolved={(code) => <>{code.attribute}</>}
        />
        {'="q-hash#s_hash" id="targetElement">'}
      </pre>
      <h1>Event Dispatch</h1>
      <pre>
        {'targetElement.dispatchEvent("'}
        <Resource
          value={code}
          onPending={() => <>loading...</>}
          onResolved={(code) => <>{code.eventName}</>}
        />
        {'");'}
      </pre>
      <h1>Log</h1>
      <pre>{log}</pre>
    </div>
  );
});

export const extractEncoding = server$(async function (
  this,
  eventName: string
) {
  const props = {
    ['on' + eventName + '$']: $((e: Event) => console.log('Event:', e.type)),
  };
  const platform = getPlatform();
  try {
    const result = await renderToString(<div {...props} />, {
      containerTagName: 'container',
      manifest: this.sharedMap.get('@manifest'),
      symbolMapper: (symbolName: string) => {
        return platform.chunkForSymbol(symbolName, '');
      },
    });
    const attribute = /<div (on:[^=]+).*><\/div>/.exec(result.html)![1];
    const eventName = /window.qwikevents.push\("([^"]+)"\)</.exec(
      result.html
    )![1];
    return { attribute, eventName };
  } finally {
    setPlatform(platform);
  }
});

const CODE = `export default component$(() => {
  return <div onEVENT$={(e) => console.log(e)}>target</div>
});`;
