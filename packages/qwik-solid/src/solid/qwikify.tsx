import {
  $,
  component$,
  implicit$FirstArg,
  RenderOnce,
  useClientEffect$,
  useOn,
  useOnDocument,
  useSignal,
  useWatch$,
} from '@builder.io/qwik';

import { isBrowser, isServer } from '@builder.io/qwik/build';
import { renderFromServer } from './server-render';
import { hydrate } from 'solid-js/web';

export function qwikifyQrl<PROPS extends {}>(solidCmp$: any, opts?: any) {
  console.log('solidCmp$: ', solidCmp$);

  return component$(async (props) => {
    const [wakeUp] = useWakeupSignal(props);

    console.log('wakeup: ', wakeUp);

    useWatch$(async ({ track }) => {
      track(() => wakeUp.value);

      if (isServer) {
        return;
      }

      const element = document.getElementById('root-solid');
      if (element) {
        const Cmp = await solidCmp$.resolve();
        // debugger
        hydrate(Cmp, element);
        console.log('Hydrated');
      }
    });
    if (isServer) {
      const jsx = renderFromServer('qwik-solid', solidCmp$);
      console.log('Solid JSX: ', jsx);

      return (
        <RenderOnce>
          {jsx}
        </RenderOnce>
      );
    }

    return (
      <RenderOnce>
        <div id="root-solid"></div>
      </RenderOnce>
    );
  });
}

export const qwikify$ = /*#__PURE__*/ implicit$FirstArg(qwikifyQrl);

export const useWakeupSignal = (props: any, opts: any) => {
  const signal = useSignal(false);
  const activate = $(() => (signal.value = true));
  const clientOnly = !!(props['client:only'] || opts?.clientOnly);
  if (isServer) {
    if (props['client:visible'] || opts?.eagerness === 'visible') {
      useOn('qvisible', activate);
    }
    if (props['client:idle'] || opts?.eagerness === 'idle') {
      useOnDocument('qidle', activate);
    }
    if (props['client:load'] || clientOnly || opts?.eagerness === 'load') {
      useOnDocument('qinit', activate);
    }
    if (props['client:hover'] || opts?.eagerness === 'hover') {
      useOn('mouseover', activate);
    }
    if (props['client:event']) {
      useOn(props['client:event'], activate);
    }
    if (opts?.event) {
      useOn(opts?.event, activate);
    }
  }
  return [signal, clientOnly] as const;
};
