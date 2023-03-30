import { component$, useStore, noSerialize, useVisibleTask$ } from '@builder.io/qwik';
import Monaco from './monaco';

export default component$(() => {
  const state = useStore<{ monacoInstance: Monaco | undefined }>({
    // Don't initialize on server
    monacoInstance: undefined,
  });

  useVisibleTask$(() => {
    // Monaco is not serializable, so we can't serialize it as part of SSR
    // We can however instantiate it on the client after the component is visible
    setTimeout(() => (state.monacoInstance = noSerialize(new Monaco())), 1000);
  });
  return <div>{state.monacoInstance ? <>'Monaco is loaded'</> : <>'loading...'</>}</div>;
});
